import { create } from "zustand";

import * as api from "../lib/tauri/commands";
import type { Project, RepoStatus } from "../types/domain";

interface ProjectState {
  projects: Project[];
  activeId: string | null;
  status: RepoStatus | null;
  loading: boolean;
  load: () => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  refreshStatus: () => Promise<void>;
  update: (id: string, name: string, color: string, context: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  add: (project: Project) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeId: null,
  status: null,
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const projects = await api.listProjects();
      // Al arrancar se selecciona el más reciente: el usuario casi siempre vuelve a lo último
      // que estaba mirando, y una app sin proyecto activo no puede hacer nada útil.
      const activeId = get().activeId ?? projects[0]?.id ?? null;
      set({ projects, activeId });
      if (activeId) await get().refreshStatus();
    } finally {
      set({ loading: false });
    }
  },

  setActive: async (activeId) => {
    set({ activeId, status: null });
    if (activeId) await get().refreshStatus();
  },

  refreshStatus: async () => {
    const id = get().activeId;
    if (!id) return set({ status: null });
    try {
      set({ status: await api.gitStatus(id) });
    } catch {
      // Una carpeta que dejó de ser repo (o que el usuario movió) no puede tumbar la vista.
      set({ status: null });
    }
  },

  update: async (id, name, color, context) => {
    await api.updateProject(id, name, color, context);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name, color, context } : p)),
    }));
  },

  remove: async (id) => {
    await api.removeProject(id);
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      return { projects, activeId: s.activeId === id ? (projects[0]?.id ?? null) : s.activeId };
    });
    await get().refreshStatus();
  },

  add: (project) =>
    set((s) => ({
      projects: [project, ...s.projects.filter((p) => p.id !== project.id)],
      activeId: project.id,
    })),
}));

/** Atajo: el proyecto activo completo, o `null`. */
export function useActiveProject(): Project | null {
  return useProjectStore((s) => s.projects.find((p) => p.id === s.activeId) ?? null);
}
