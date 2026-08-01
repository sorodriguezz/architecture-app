import { KIND_BY_ID, STATUS_BY_ID } from "./model";
import type { ModelKind, ModelStatus, ProposedElement } from "../types/domain";

/**
 * Parsea la propuesta de piezas que devuelven el escaneo del repositorio y la extracción desde
 * una decisión.
 *
 * El contrato lo fija `MODEL_CONTRACT` en `ai/prompts.rs`. Igual que con el bloque de decisión, se
 * asume que el modelo *casi* lo cumple: puede escribir la etiqueta con un espacio de más, olvidar
 * el sufijo `-model`, o mandar un `kind` que no existe. Todo lo recuperable se recupera y lo que
 * no, se descarta pieza por pieza — una entrada mal formada no puede tirar abajo las otras doce
 * que sí venían bien.
 */
export interface ParsedProposal {
  elements: ProposedElement[];
  /** Por qué no se pudo leer nada, cuando no se pudo. */
  error: string | null;
  /** Entradas que venían en el bloque pero se descartaron por estar mal formadas. */
  discarded: number;
}

const MODEL_FENCE = /```[ \t]*json[ \t]*archflow-model[ \t]*\n([\s\S]*?)\n[ \t]*```/i;
/** Respaldo: cualquier bloque ```json que traiga `elements`, que es lo que distingue a este. */
const ANY_JSON_FENCE = /```[ \t]*json[ \t]*\n([\s\S]*?)\n[ \t]*```/gi;

export function parseModelProposal(raw: string): ParsedProposal {
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  const body = findBody(text);
  if (body === null) {
    return { elements: [], error: "La respuesta no trajo el bloque de piezas esperado.", discarded: 0 };
  }

  const parsed = safeParse(body);
  if (!parsed) {
    return { elements: [], error: "El bloque de piezas no es JSON válido.", discarded: 0 };
  }

  const raws = Array.isArray(parsed.elements) ? parsed.elements : [];
  const elements = raws.map(normalize).filter((e): e is ProposedElement => e !== null);
  return { elements, error: null, discarded: raws.length - elements.length };
}

function findBody(text: string): string | null {
  const tagged = text.match(MODEL_FENCE);
  if (tagged) return tagged[1];

  for (const match of text.matchAll(ANY_JSON_FENCE)) {
    if (/"elements"\s*:/.test(match[1])) return match[1];
  }
  // Algunos modelos responden el objeto pelado, sin fence.
  if (/^\s*\{[\s\S]*"elements"\s*:/.test(text)) return text;
  return null;
}

function safeParse(body: string): { elements?: unknown[] } | null {
  const repaired = body
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1")
    .trim();
  for (const candidate of [body, repaired]) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === "object") return value as { elements?: unknown[] };
    } catch {
      // sigue con el siguiente intento
    }
  }
  return null;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Una pieza sin nombre o de una clase que la app no conoce se descarta en vez de normalizarse a
 * algo plausible: es preferible perder una fila a meter en el inventario un dato que el usuario
 * después va a creer verdadero.
 */
function normalize(input: unknown): ProposedElement | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const name = str(raw.name);
  const kind = str(raw.kind) as ModelKind;
  if (!name || !KIND_BY_ID.has(kind)) return null;

  const status = str(raw.status) as ModelStatus;
  const dependsOn = Array.isArray(raw.dependsOn) ? raw.dependsOn.map(str).filter(Boolean) : [];
  const parent = str(raw.parent);

  return {
    kind,
    name,
    summary: str(raw.summary),
    status: STATUS_BY_ID.has(status) ? status : "propuesto",
    tech: str(raw.tech),
    owner: str(raw.owner),
    parent: parent || null,
    dependsOn,
    location: str(raw.location),
    notes: str(raw.notes),
  };
}
