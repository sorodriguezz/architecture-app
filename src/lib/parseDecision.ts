import type { DecisionMeta, DiagramBlock, ParsedDecision } from "../types/domain";

/**
 * Convierte el markdown que devuelve el modelo en las tres cosas que la UI necesita: los
 * metadatos estructurados, los diagramas, y el documento para renderizar.
 *
 * El contrato lo fija `ai/prompts.rs`. Aquí se asume que el modelo *casi* lo cumple: un LLM
 * puede escribir ```` ```json archflow ```` con un espacio de más, olvidar la palabra `archflow`,
 * o dejar una coma colgando en el JSON. Todas esas variantes se toleran, y si el bloque no se
 * puede recuperar se devuelve `metaError` en vez de romper la vista — el documento en prosa,
 * que es el 90% del valor, sigue siendo perfectamente legible sin la matriz.
 */
export function parseDecision(raw: string): ParsedDecision {
  const text = normalizeFences(raw ?? "");
  const { meta, metaError, rest } = extractMeta(text);
  const diagrams = extractDiagrams(rest);
  return { meta, metaError, markdown: rest.trim(), diagrams };
}

/** Normaliza saltos de línea y quita el envoltorio ```markdown que algunos modelos agregan. */
function normalizeFences(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const wrapper = /^```(?:markdown|md)\n([\s\S]*)\n```$/;
  const match = text.match(wrapper);
  if (match) text = match[1];
  return text;
}

const META_FENCE = /```[ \t]*json[ \t]*archflow[ \t]*\n([\s\S]*?)\n[ \t]*```/i;
/** Respaldo: el primer bloque ```json cuyo contenido tenga la forma del objeto esperado. */
const ANY_JSON_FENCE = /```[ \t]*json[ \t]*\n([\s\S]*?)\n[ \t]*```/gi;

function extractMeta(text: string): { meta: DecisionMeta | null; metaError: string | null; rest: string } {
  const tagged = text.match(META_FENCE);
  if (tagged) {
    const parsed = safeParse(tagged[1]);
    return {
      meta: parsed.value,
      metaError: parsed.error,
      rest: text.replace(META_FENCE, "").trimStart(),
    };
  }

  // Sin la etiqueta `archflow`: se busca el primer bloque JSON que traiga `options`, que es lo
  // que distingue los metadatos de cualquier otro JSON de ejemplo dentro del documento.
  for (const match of text.matchAll(ANY_JSON_FENCE)) {
    if (!/"options"\s*:/.test(match[1])) continue;
    const parsed = safeParse(match[1]);
    if (!parsed.value) continue;
    return { meta: parsed.value, metaError: null, rest: text.replace(match[0], "").trimStart() };
  }

  return { meta: null, metaError: null, rest: text };
}

function safeParse(body: string): { value: DecisionMeta | null; error: string | null } {
  const attempts = [body, repairJson(body)];
  for (const candidate of attempts) {
    try {
      const value = JSON.parse(candidate) as DecisionMeta;
      return { value: normalizeMeta(value), error: null };
    } catch {
      // sigue con el siguiente intento
    }
  }
  return { value: null, error: "El bloque de metadatos no es JSON válido; se muestra solo el documento." };
}

/** Arregla los dos destrozos típicos de un LLM: comas colgando y comentarios `//`. */
function repairJson(body: string): string {
  return body
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1")
    .trim();
}

/**
 * Rellena lo que falte para que la UI nunca tenga que defenderse de un campo ausente, y garantiza
 * que exista exactamente una opción recomendada: si el modelo no marcó ninguna, gana la de mayor
 * puntaje ponderado; si marcó varias, se queda la primera.
 */
function normalizeMeta(meta: DecisionMeta): DecisionMeta {
  const criteria = Array.isArray(meta.criteria) ? meta.criteria : [];
  const options = (Array.isArray(meta.options) ? meta.options : []).map((o) => ({
    ...o,
    scores: o.scores ?? {},
    pros: Array.isArray(o.pros) ? o.pros : [],
    cons: Array.isArray(o.cons) ? o.cons : [],
    recommended: Boolean(o.recommended),
  }));

  const flagged = options.filter((o) => o.recommended);
  if (flagged.length === 0 && options.length > 0) {
    let best = options[0];
    let bestScore = -Infinity;
    for (const option of options) {
      const score = weightedScore(option, criteria);
      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }
    best.recommended = true;
  } else if (flagged.length > 1) {
    flagged.slice(1).forEach((o) => {
      o.recommended = false;
    });
  }

  return {
    schemaVersion: meta.schemaVersion ?? 1,
    title: meta.title ?? "",
    decision: meta.decision ?? "",
    confidence: clamp(Number(meta.confidence ?? 0), 0, 100),
    criteria,
    options,
    patterns: Array.isArray(meta.patterns) ? meta.patterns : [],
    risks: Array.isArray(meta.risks) ? meta.risks : [],
    assumptions: Array.isArray(meta.assumptions) ? meta.assumptions : [],
    openQuestions: Array.isArray(meta.openQuestions) ? meta.openQuestions : [],
  };
}

/** Puntaje ponderado de una opción: Σ(puntaje × peso). Es lo que ordena la matriz. */
export function weightedScore(
  option: { scores: Record<string, number> },
  criteria: { id: string; weight: number }[],
): number {
  return criteria.reduce((total, c) => total + (Number(option.scores?.[c.id]) || 0) * (Number(c.weight) || 1), 0);
}

/** Puntaje máximo alcanzable (todo en 5), para mostrar el total como porcentaje. */
export function maxScore(criteria: { weight: number }[]): number {
  return criteria.reduce((total, c) => total + 5 * (Number(c.weight) || 1), 0);
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

const MERMAID_FENCE = /```[ \t]*mermaid[ \t]*\n([\s\S]*?)\n[ \t]*```/gi;

/**
 * Extrae cada diagrama con el título del encabezado inmediatamente anterior. Ese encabezado es
 * lo que el prompt pide, y es la única forma de darle nombre a un diagrama sin obligar al modelo
 * a meter Mermaid escapado dentro del JSON (donde los saltos de línea se le rompen siempre).
 */
export function extractDiagrams(markdown: string): DiagramBlock[] {
  const out: DiagramBlock[] = [];
  const used = new Set<string>();

  for (const match of markdown.matchAll(MERMAID_FENCE)) {
    const code = match[1].trim();
    if (!code) continue;
    const title = headingBefore(markdown, match.index ?? 0) ?? `Diagrama ${out.length + 1}`;
    out.push({ id: uniqueSlug(title, used), title, code });
  }
  return out;
}

function headingBefore(markdown: string, index: number): string | null {
  const before = markdown.slice(0, index);
  const headings = [...before.matchAll(/^#{2,4}\s+(.+)$/gm)];
  const last = headings.at(-1);
  return last ? last[1].trim().replace(/\s*[:.]$/, "") : null;
}

function uniqueSlug(title: string, used: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "diagrama";
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

/** Etiquetas legibles para las familias de patrones que emite el modelo. */
export const FAMILY_LABEL: Record<string, string> = {
  arquitectonico: "Arquitectónicos",
  diseno: "De diseño",
  resiliencia: "De resiliencia",
  concurrencia: "De concurrencia",
  datos: "De datos",
  integracion: "De integración",
  observabilidad: "De observabilidad",
  seguridad: "De seguridad",
  despliegue: "De despliegue",
};

export function familyLabel(family: string): string {
  return FAMILY_LABEL[family] ?? family;
}
