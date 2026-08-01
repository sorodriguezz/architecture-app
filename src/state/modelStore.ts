import { create } from "zustand";

import { proposedToElement } from "../lib/model";
import * as api from "../lib/tauri/commands";
import type { ModelElement, ProposedElement } from "../types/domain";

/**
 * El inventario del proyecto activo.
 *
 * No persiste en el frontend: la fuente de verdad es la base de la app, y cachearlo en
 * localStorage significaría mostrar componentes que ya se borraron desde otra vista.
 */
interface ModelState {
  elements: ModelElement[];
  loading: boolean;
  /** Proyecto cuyos elementos están cargados, para no mezclar al cambiar de proyecto. */
  loadedFor: string | null;
  load: (projectId: string) => Promise<void>;
  save: (element: ModelElement) => Promise<ModelElement>;
  remove: (id: string) => Promise<void>;
  acceptProposal: (
    projectId: string,
    proposed: ProposedElement[],
    source: "scan" | "decision",
    decisionId?: string | null,
  ) => Promise<number>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  elements: [],
  loading: false,
  loadedFor: null,

  load: async (projectId) => {
    set({ loading: true });
    try {
      const elements = await api.listModelElements(projectId);
      set({ elements, loadedFor: projectId });
    } finally {
      set({ loading: false });
    }
  },

  save: async (element) => {
    const saved = await api.upsertModelElement(element);
    set((s) => ({
      elements: s.elements.some((e) => e.id === saved.id)
        ? s.elements.map((e) => (e.id === saved.id ? saved : e))
        : [...s.elements, saved],
    }));
    return saved;
  },

  remove: async (id) => {
    await api.deleteModelElement(id);
    set((s) => ({
      elements: s.elements
        .filter((e) => e.id !== id)
        // Un hijo cuyo padre desapareció seguiría mostrándose colgando de la nada, y una
        // dependencia hacia un id inexistente dibujaría una flecha a un nodo que no está.
        .map((e) => ({
          ...e,
          parentId: e.parentId === id ? null : e.parentId,
          dependsOn: e.dependsOn
            .split("\n")
            .filter((dep) => dep.trim() && dep.trim() !== id)
            .join("\n"),
        })),
    }));
  },

  /**
   * Guarda las piezas aceptadas de una propuesta, en orden.
   *
   * Se guardan una por una y no en paralelo a propósito: cada pieza resuelve su padre y sus
   * dependencias contra las que ya existen, así que un endpoint aceptado junto con su componente
   * necesita que el componente ya tenga id. En paralelo quedaría huérfano.
   */
  acceptProposal: async (projectId, proposed, source, decisionId = null) => {
    let saved = 0;
    for (const item of proposed) {
      const element = proposedToElement(item, projectId, get().elements, source, decisionId);
      await get().save(element);
      saved += 1;
    }
    return saved;
  },
}));
