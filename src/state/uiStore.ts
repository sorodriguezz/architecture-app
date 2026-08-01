import { create } from "zustand";

export type View =
  | "projects"
  | "new-decision"
  | "decision"
  | "model"
  | "docs"
  | "patterns"
  | "simulators"
  | "settings";

export interface Toast {
  id: string;
  kind: "info" | "success" | "error" | "warning";
  message: string;
}

/** Estado del catálogo de patrones. Vive aquí porque el wizard navega hacia él ya filtrado. */
export interface PatternsFilter {
  query: string;
  family: string | null;
  /** Atributo de calidad por el que filtrar: muestra solo los patrones que lo empujan. */
  driver: string | null;
}

const NO_FILTER: PatternsFilter = { query: "", family: null, driver: null };

interface UiState {
  view: View;
  theme: "dark" | "light";
  toasts: Toast[];
  /** Panel lateral de log en vivo, compartido por todas las corridas. */
  logOpen: boolean;
  patternsFilter: PatternsFilter;
  setPatternsFilter: (filter: Partial<PatternsFilter>) => void;
  /** Abre el catálogo ya filtrado — el puente entre elegir un driver y ver qué patrones lo dan. */
  openPatterns: (filter: Partial<PatternsFilter>) => void;
  setView: (view: View) => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  setLogOpen: (open: boolean) => void;
  toast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  view: "projects",
  theme: "dark",
  toasts: [],
  logOpen: false,
  patternsFilter: NO_FILTER,

  setPatternsFilter: (filter) => set((s) => ({ patternsFilter: { ...s.patternsFilter, ...filter } })),

  openPatterns: (filter) => set({ view: "patterns", patternsFilter: { ...NO_FILTER, ...filter } }),

  setView: (view) => set({ view }),

  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },

  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  setLogOpen: (logOpen) => set({ logOpen }),

  toast: (kind, message) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    // Los errores se quedan hasta que el usuario los cierre: un mensaje que explica por qué
    // falló un análisis de varios minutos no puede desaparecer solo a los 4 segundos.
    if (kind !== "error") {
      setTimeout(() => get().dismissToast(id), 4000);
    }
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
