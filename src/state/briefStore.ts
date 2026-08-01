import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DELIVERABLES, PATTERN_FAMILIES } from "../lib/catalog";
import type { DecisionBrief } from "../types/domain";

/**
 * Borrador del wizard, por proyecto y persistido.
 *
 * Vive fuera del componente porque el brief es lo más caro de escribir de toda la app: son diez
 * campos de prosa. Con estado local, ir a mirar el catálogo de patrones —justo lo que uno hace
 * a la mitad de llenarlo— desmontaba la vista y lo borraba todo. Se guarda por `projectId`
 * para que dos proyectos abiertos en paralelo no se pisen el borrador.
 */

export const EMPTY_BRIEF: DecisionBrief = {
  title: "",
  problem: "",
  goals: "",
  nonGoals: "",
  constraints: "",
  currentState: "",
  qualityAttributes: [],
  scale: "",
  team: "",
  compliance: "",
  budget: "",
  candidateOptions: [],
  patternFamilies: PATTERN_FAMILIES.map((f) => f.id),
  deliverables: [...DELIVERABLES],
  notes: "",
};

/** Clave para cuando todavía no hay proyecto activo; el borrador igual no se pierde. */
const NO_PROJECT = "__sin-proyecto__";

export interface BriefState {
  drafts: Record<string, DecisionBrief>;
  steps: Record<string, number>;
  patch: (projectId: string | null, values: Partial<DecisionBrief>) => void;
  replace: (projectId: string | null, brief: DecisionBrief) => void;
  setStep: (projectId: string | null, step: number) => void;
  reset: (projectId: string | null) => void;
}

const key = (projectId: string | null) => projectId ?? NO_PROJECT;

/**
 * Selectores por proyecto. Se exportan en vez de resolver el borrador dentro del store porque
 * así cada componente se suscribe solo al borrador que le importa, y no a todo el mapa.
 */
export const selectDraft = (projectId: string | null) => (s: BriefState) => s.drafts[key(projectId)] ?? EMPTY_BRIEF;
export const selectStep = (projectId: string | null) => (s: BriefState) => s.steps[key(projectId)] ?? 0;

export const useBriefStore = create<BriefState>()(
  persist(
    (set) => ({
      drafts: {},
      steps: {},

      patch: (projectId, values) =>
        set((s) => {
          const id = key(projectId);
          return { drafts: { ...s.drafts, [id]: { ...(s.drafts[id] ?? EMPTY_BRIEF), ...values } } };
        }),

      replace: (projectId, brief) => set((s) => ({ drafts: { ...s.drafts, [key(projectId)]: brief } })),

      setStep: (projectId, step) => set((s) => ({ steps: { ...s.steps, [key(projectId)]: step } })),

      reset: (projectId) =>
        set((s) => ({
          drafts: { ...s.drafts, [key(projectId)]: EMPTY_BRIEF },
          steps: { ...s.steps, [key(projectId)]: 0 },
        })),
    }),
    {
      name: "archflow.brief",
      storage: createJSONStorage(() => localStorage),
      // Solo los datos: las acciones se recrean en cada arranque.
      partialize: (s) => ({ drafts: s.drafts, steps: s.steps }),
    },
  ),
);
