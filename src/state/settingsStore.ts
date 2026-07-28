import { create } from "zustand";

import * as api from "../lib/tauri/commands";
import { SettingKey } from "../lib/tauri/commands";
import type { EngineStatus, ModelOption } from "../types/domain";

export type ToolsMode = "read" | "write" | "none";

interface SettingsState {
  binary: string;
  model: string;
  toolsMode: ToolsMode;
  autoCommit: boolean;
  gitName: string;
  gitEmail: string;
  hasGitToken: boolean;
  engine: EngineStatus | null;
  models: ModelOption[];
  checking: boolean;
  load: () => Promise<void>;
  save: <K extends keyof PersistableSettings>(key: K, value: PersistableSettings[K]) => Promise<void>;
  checkEngine: () => Promise<void>;
  refreshGitToken: () => Promise<void>;
}

interface PersistableSettings {
  binary: string;
  model: string;
  toolsMode: ToolsMode;
  autoCommit: boolean;
  gitName: string;
  gitEmail: string;
}

/** Mapea cada campo del store a su clave en la tabla `settings`. */
const KEY_OF: Record<keyof PersistableSettings, string> = {
  binary: SettingKey.binary,
  model: SettingKey.model,
  toolsMode: SettingKey.toolsMode,
  autoCommit: SettingKey.autoCommit,
  gitName: SettingKey.gitName,
  gitEmail: SettingKey.gitEmail,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  binary: api.DEFAULT_BINARY,
  model: api.DEFAULT_MODEL,
  toolsMode: "read",
  autoCommit: false,
  gitName: "",
  gitEmail: "",
  hasGitToken: false,
  engine: null,
  models: [],
  checking: false,

  load: async () => {
    const [binary, model, toolsMode, autoCommit, gitName, gitEmail, models] = await Promise.all([
      api.getSetting(SettingKey.binary),
      api.getSetting(SettingKey.model),
      api.getSetting(SettingKey.toolsMode),
      api.getSetting(SettingKey.autoCommit),
      api.getSetting(SettingKey.gitName),
      api.getSetting(SettingKey.gitEmail),
      api.listModels(),
    ]);
    set({
      binary: binary || api.DEFAULT_BINARY,
      model: model || api.DEFAULT_MODEL,
      toolsMode: (toolsMode as ToolsMode) || "read",
      autoCommit: autoCommit === "1",
      gitName: gitName ?? "",
      gitEmail: gitEmail ?? "",
      models,
    });
    await Promise.all([get().checkEngine(), get().refreshGitToken()]);
  },

  save: async (key, value) => {
    set({ [key]: value } as unknown as Partial<SettingsState>);
    const serialized = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    await api.setSetting(KEY_OF[key], serialized);
    if (key === "binary") await get().checkEngine();
  },

  checkEngine: async () => {
    set({ checking: true });
    try {
      set({ engine: await api.checkEngine(get().binary) });
    } catch {
      set({ engine: { available: false, detail: get().binary, version: null } });
    } finally {
      set({ checking: false });
    }
  },

  refreshGitToken: async () => {
    try {
      set({ hasGitToken: await api.hasGitCredentials() });
    } catch {
      set({ hasGitToken: false });
    }
  },
}));
