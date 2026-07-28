import { create } from "zustand";

import { parseDecision } from "../lib/parseDecision";
import * as api from "../lib/tauri/commands";
import { newRunId } from "../lib/tauri/events";
import type { Decision, DecisionBrief, DecisionSummary, ParsedDecision } from "../types/domain";

interface DecisionState {
  list: DecisionSummary[];
  current: Decision | null;
  parsed: ParsedDecision | null;
  /** Id de la corrida en vuelo; `null` cuando no hay ninguna. */
  runId: string | null;
  /** Líneas que la CLI ha escrito en la corrida actual. */
  log: string[];
  loadList: (projectId: string) => Promise<void>;
  open: (id: string) => Promise<void>;
  clear: () => void;
  appendLog: (line: string) => void;
  run: (projectId: string, brief: DecisionBrief) => Promise<Decision>;
  cancel: () => Promise<void>;
  setMarkdown: (markdown: string) => void;
  persistMarkdown: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** El log en vivo puede llegar a decenas de miles de líneas; se conservan las últimas. */
const LOG_LIMIT = 800;

export const useDecisionStore = create<DecisionState>((set, get) => ({
  list: [],
  current: null,
  parsed: null,
  runId: null,
  log: [],

  loadList: async (projectId) => set({ list: await api.listDecisions(projectId) }),

  open: async (id) => {
    const current = await api.getDecision(id);
    set({ current, parsed: current ? parseDecision(current.resultMd) : null });
  },

  clear: () => set({ current: null, parsed: null, log: [] }),

  appendLog: (line) =>
    set((s) => {
      const log = [...s.log, line];
      return { log: log.length > LOG_LIMIT ? log.slice(-LOG_LIMIT) : log };
    }),

  run: async (projectId, brief) => {
    const runId = newRunId();
    set({ runId, log: [], current: null, parsed: null });
    try {
      const decision = await api.runDecision(projectId, brief, runId);
      set({ current: decision, parsed: parseDecision(decision.resultMd) });
      await get().loadList(projectId);
      return decision;
    } finally {
      // Pase lo que pase (éxito, error o cancelación) la corrida terminó: si esto no se limpiara,
      // el botón quedaría en "cancelar" para siempre.
      set({ runId: null });
    }
  },

  cancel: async () => {
    const runId = get().runId;
    if (runId) await api.cancelRun(runId);
  },

  setMarkdown: (markdown) =>
    set((s) => ({
      current: s.current ? { ...s.current, resultMd: markdown } : null,
      parsed: parseDecision(markdown),
    })),

  persistMarkdown: async () => {
    const current = get().current;
    if (current) await api.updateDecisionMarkdown(current.id, current.resultMd);
  },

  remove: async (id) => {
    await api.deleteDecision(id);
    set((s) => ({
      list: s.list.filter((d) => d.id !== id),
      current: s.current?.id === id ? null : s.current,
      parsed: s.current?.id === id ? null : s.parsed,
    }));
  },
}));
