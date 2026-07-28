import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { RunLine } from "../../types/domain";

/** Cada línea que la CLI escribe mientras corre. Filtra por `runId`: puede haber varias a la vez. */
export function onRunLine(handler: (line: RunLine) => void): Promise<UnlistenFn> {
  return listen<RunLine>("ai:line", (event) => handler(event.payload));
}

/** Progreso de `npx skills add`. */
export function onSkillProgress(handler: (line: string) => void): Promise<UnlistenFn> {
  return listen<{ line: string }>("skills:progress", (event) => handler(event.payload.line));
}

/** Id de corrida. `crypto.randomUUID` existe en todos los webviews que Tauri 2 soporta. */
export function newRunId(): string {
  return crypto.randomUUID();
}
