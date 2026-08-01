/**
 * Lee el stream de la CLI y lo convierte en algo que se pueda mirar mientras se espera.
 *
 * Un análisis tarda minutos y hasta ahora lo único visible era el JSON crudo. Aquí se reduce ese
 * stream a las señales que un humano sí quiere: en qué etapa va, qué archivos está mirando y
 * cuánto lleva escrito. La etapa es una **estimación** derivada de lo observable — la CLI no
 * anuncia fases— y por eso la UI la etiqueta como tal en vez de fingir una barra de progreso.
 */

export interface ToolUse {
  name: string;
  count: number;
}

export interface RunProgress {
  /** Índice dentro de `RUN_STAGES`. */
  stage: number;
  /** Herramientas usadas, de más a menos. */
  tools: ToolUse[];
  /** La última acción concreta: herramienta + su argumento más informativo. */
  lastAction: { name: string; detail: string } | null;
  /** Caracteres de prosa que el modelo ya emitió. */
  written: number;
  /** Modelo que la CLI reportó al iniciar, si lo dijo. */
  model: string | null;
  /** Si ya llegó el evento `result`. */
  finished: boolean;
}

export const RUN_STAGES = [
  { label: "Iniciando la CLI", hint: "Levantando la sesión de Claude Code." },
  { label: "Reconociendo el contexto", hint: "Leyendo el repositorio para conocer el stack real." },
  { label: "Comparando alternativas", hint: "Generando opciones y ponderándolas contra tus drivers." },
  { label: "Redactando el documento", hint: "Escribiendo el ADR, la matriz y los diagramas." },
] as const;

const EMPTY: RunProgress = { stage: 0, tools: [], lastAction: null, written: 0, model: null, finished: false };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** El argumento que mejor describe una llamada a herramienta, sin volcar el input entero. */
function describeInput(name: string, input: Record<string, unknown> | null): string {
  if (!input) return "";
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = asString(input[k]);
      if (v) return v;
    }
    return "";
  };

  const raw = pick("file_path", "path", "pattern", "query", "url", "command", "prompt", "description");
  if (!raw) return "";
  // De una ruta interesa el final, no el prefijo del proyecto que se repite en todas.
  const value = name === "Read" || name === "Write" || name === "Edit" ? raw.split(/[\\/]/).slice(-2).join("/") : raw;
  return value.length > 64 ? `${value.slice(0, 63)}…` : value;
}

/** Marcadores del contrato de salida: verlos significa que ya está escribiendo el entregable. */
const WRITING = /```json archflow|```mermaid|^## (Contexto|Decisión|Matriz)/m;

export function reduceRun(lines: string[]): RunProgress {
  const tools = new Map<string, number>();
  let progress: RunProgress = { ...EMPTY, tools: [] };
  let text = "";
  let sawInit = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    let event: Record<string, unknown> | null = null;
    try {
      event = asRecord(JSON.parse(trimmed));
    } catch {
      continue; // una línea partida a la mitad por el buffer no debería tumbar el panel
    }
    if (!event) continue;

    const type = asString(event.type);

    if (type === "system") {
      sawInit = true;
      progress.model = asString(event.model) ?? progress.model;
      continue;
    }

    if (type === "result") {
      progress.finished = true;
      continue;
    }

    if (type !== "assistant") continue;

    const message = asRecord(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];

    for (const raw of content) {
      const block = asRecord(raw);
      if (!block) continue;
      const kind = asString(block.type);

      if (kind === "text") {
        text += asString(block.text) ?? "";
      } else if (kind === "tool_use") {
        const name = asString(block.name) ?? "herramienta";
        tools.set(name, (tools.get(name) ?? 0) + 1);
        progress.lastAction = { name, detail: describeInput(name, asRecord(block.input)) };
      }
    }
  }

  progress.written = text.length;
  progress.tools = [...tools.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  progress.stage = estimateStage({ sawInit, text, hasTools: tools.size > 0, finished: progress.finished });
  return progress;
}

function estimateStage(signals: { sawInit: boolean; text: string; hasTools: boolean; finished: boolean }): number {
  if (signals.finished) return RUN_STAGES.length - 1;
  if (signals.text.length > 1200 || WRITING.test(signals.text)) return 3;
  if (signals.text.length > 0) return 2;
  if (signals.hasTools) return 1;
  return signals.sawInit ? 1 : 0;
}

/** `mm:ss` — el formato que se lee de un vistazo en un contador que corre. */
export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
