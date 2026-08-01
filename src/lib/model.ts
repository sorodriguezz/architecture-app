/**
 * El modelo del sistema del lado del frontend: qué significa cada clase de pieza, cómo se dibuja
 * y cómo se exporta.
 *
 * Las cinco clases (`ModelKind`) y los cuatro estados (`ModelStatus`) están duplicados a propósito
 * entre `src-tauri/src/db/models.rs`, el contrato de `prompts.rs` y este archivo. Si agregas una,
 * agrégala en los tres: una clase que Rust acepte y el frontend no conozca se guarda bien y no se
 * muestra en ninguna pestaña.
 */
import { Boxes, Cable, Database, Route, TriangleAlert, type LucideIcon } from "lucide-react";

import type { ModelElement, ModelKind, ModelStatus, ProposedElement } from "../types/domain";

export interface KindDef {
  id: ModelKind;
  /** Singular, para botones y formularios. */
  label: string;
  /** Plural, para las pestañas. */
  plural: string;
  icon: LucideIcon;
  /** Qué cuenta como esta clase de pieza. */
  blurb: string;
  /** Un ejemplo concreto, que es lo que de verdad resuelve la duda. */
  example: string;
  /** Si cuelga de un componente. */
  nested: boolean;
}

export const MODEL_KINDS: KindDef[] = [
  {
    id: "component",
    label: "Componente",
    plural: "Componentes",
    icon: Boxes,
    blurb: "Algo que se despliega o se ejecuta por su cuenta: un servicio, un front, una base, una cola.",
    example: "API de pagos · Base transaccional · Cola de eventos",
    nested: false,
  },
  {
    id: "endpoint",
    label: "Endpoint",
    plural: "Endpoints",
    icon: Route,
    blurb: "Una operación que un componente expone hacia afuera. Es el contrato que otros consumen.",
    example: "POST /api/ordenes · GET /api/ordenes/{id}",
    nested: true,
  },
  {
    id: "integration",
    label: "Integración",
    plural: "Integraciones",
    icon: Cable,
    blurb: "Un sistema de terceros del que dependes y que no controlas. Anota qué pasa si se cae.",
    example: "Pasarela de pago · ERP · Proveedor de correo",
    nested: false,
  },
  {
    id: "entity",
    label: "Entidad",
    plural: "Entidades",
    icon: Database,
    blurb: "Un concepto de negocio con dueño claro. Solo los importantes, no una fila por tabla.",
    example: "Orden · Cliente · Reserva de inventario",
    nested: true,
  },
  {
    id: "debt",
    label: "Deuda",
    plural: "Deuda técnica",
    icon: TriangleAlert,
    blurb: "Lo que sabes que está mal y hay que arreglar. Anotarlo es lo que impide que se olvide.",
    example: "Sin reintentos en el cobro · Migración a .NET 8 a medias",
    nested: true,
  },
];

export const KIND_BY_ID = new Map(MODEL_KINDS.map((k) => [k.id, k]));

export interface StatusDef {
  id: ModelStatus;
  label: string;
  /** Variable CSS del tema. Nunca un color literal: el tema claro se rompería. */
  tone: string;
  hint: string;
}

export const MODEL_STATUSES: StatusDef[] = [
  { id: "propuesto", label: "Propuesto", tone: "--text-faint", hint: "Decidido, pero todavía no existe." },
  { id: "construccion", label: "En construcción", tone: "--info", hint: "Alguien lo está construyendo ahora." },
  { id: "produccion", label: "En producción", tone: "--success", hint: "Existe y está corriendo." },
  { id: "deprecado", label: "Deprecado", tone: "--warning", hint: "Sigue ahí, pero se va a sacar." },
];

export const STATUS_BY_ID = new Map(MODEL_STATUSES.map((s) => [s.id, s]));

export const SOURCE_LABEL: Record<string, string> = {
  manual: "agregado a mano",
  decision: "vino de una decisión",
  scan: "encontrado en el repositorio",
};

/** Las dependencias se guardan como texto con un id por línea; esto las devuelve como lista. */
export const dependencyIds = (element: ModelElement): string[] =>
  element.dependsOn
    .split("\n")
    .map((id) => id.trim())
    .filter(Boolean);

export const toDependsOn = (ids: string[]): string => [...new Set(ids.filter(Boolean))].join("\n");

/** Una pieza nueva vacía, lista para el formulario. */
export function emptyElement(projectId: string, kind: ModelKind, parentId: string | null = null): ModelElement {
  return {
    id: "",
    projectId,
    kind,
    name: "",
    summary: "",
    status: "propuesto",
    tech: "",
    owner: "",
    parentId,
    source: "manual",
    decisionId: null,
    dependsOn: "",
    location: "",
    notes: "",
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * Convierte una pieza propuesta por la IA en una guardable, resolviendo por nombre las
 * referencias a padre y dependencias.
 *
 * `existing` son las piezas que ya están en la base **más** las que se aceptaron antes en esta
 * misma propuesta: una tanda del escaneo suele traer un componente y sus endpoints juntos, y sin
 * eso el endpoint quedaría huérfano por haberse guardado un instante antes que su padre.
 */
export function proposedToElement(
  proposed: ProposedElement,
  projectId: string,
  existing: ModelElement[],
  source: "scan" | "decision",
  decisionId: string | null = null,
): ModelElement {
  const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]));
  const find = (name: string) => byName.get(name.trim().toLowerCase());

  return {
    ...emptyElement(projectId, proposed.kind),
    name: proposed.name,
    summary: proposed.summary,
    status: proposed.status,
    tech: proposed.tech,
    owner: proposed.owner,
    parentId: proposed.parent ? (find(proposed.parent)?.id ?? null) : null,
    source,
    decisionId,
    dependsOn: toDependsOn(proposed.dependsOn.map((n) => find(n)?.id ?? "")),
    location: proposed.location,
    notes: proposed.notes,
  };
}

// ---------------------------------------------------------------------------
// Diagrama
// ---------------------------------------------------------------------------

/** Mermaid rompe con paréntesis, comas y comillas sueltas en las etiquetas: se citan y se limpian. */
const label = (text: string) => `"${text.replace(/"/g, "'").trim()}"`;

/**
 * El diagrama de contexto del sistema, generado del inventario.
 *
 * Solo componentes e integraciones: los endpoints y las entidades son detalle interno y meterlos
 * convierte el diagrama en una maraña. Los endpoints se cuentan en la etiqueta de su componente,
 * que es la información útil a este nivel.
 */
export function modelToMermaid(elements: ModelElement[]): string {
  const nodes = elements.filter((e) => e.kind === "component" || e.kind === "integration");
  if (nodes.length === 0) return "";

  const alias = new Map(nodes.map((e, i) => [e.id, `n${i}`]));
  const endpointCount = new Map<string, number>();
  for (const e of elements) {
    if (e.kind !== "endpoint" || !e.parentId) continue;
    endpointCount.set(e.parentId, (endpointCount.get(e.parentId) ?? 0) + 1);
  }

  const lines = ["flowchart LR"];
  for (const e of nodes) {
    const count = endpointCount.get(e.id) ?? 0;
    const parts = [e.name];
    if (e.tech.trim()) parts.push(e.tech.trim());
    if (count > 0) parts.push(`${count} endpoint${count === 1 ? "" : "s"}`);
    if (e.status !== "produccion") parts.push(STATUS_BY_ID.get(e.status)?.label.toLowerCase() ?? e.status);
    const text = label(parts.join(" · "));
    // Los sistemas que no controlas se dibujan distinto: es la frontera del sistema, y verla es
    // la mitad del valor de un diagrama de contexto.
    lines.push(e.kind === "integration" ? `  ${alias.get(e.id)}[/${text}/]` : `  ${alias.get(e.id)}[${text}]`);
  }

  for (const e of nodes) {
    for (const depId of dependencyIds(e)) {
      const to = alias.get(depId);
      if (to) lines.push(`  ${alias.get(e.id)} --> ${to}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

/** Ruta del documento exportado. Fija para que reexportar sobreescriba en vez de acumular copias. */
export const MODEL_DOC_PATH = "docs/architecture/MODELO-DEL-SISTEMA.md";

/**
 * El modelo como documento markdown para el repositorio.
 *
 * El inventario vive en la base de la app, así que este archivo es una foto: se regenera entero
 * en cada exportación y el encabezado lo dice, para que nadie lo edite a mano esperando que
 * sobreviva.
 */
export function modelToMarkdown(elements: ModelElement[], projectName: string): string {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const nameOf = (id: string) => byId.get(id)?.name ?? "";
  const cell = (text: string) => (text.trim() ? text.trim().replace(/\|/g, "\\|") : "—");

  const out: string[] = [
    `# Modelo del sistema — ${projectName}`,
    "",
    `> Generado por ArchFlow el ${new Date().toLocaleString("es-CL")} a partir del inventario del proyecto.`,
    "> Es una foto: se reescribe completo en cada exportación, así que no lo edites a mano.",
    "",
  ];

  const diagram = modelToMermaid(elements);
  if (diagram) {
    out.push("## Diagrama de contexto", "", "```mermaid", diagram, "```", "");
  }

  for (const kind of MODEL_KINDS) {
    const group = elements.filter((e) => e.kind === kind.id);
    if (group.length === 0) continue;

    out.push(`## ${kind.plural}`, "");
    out.push("| Pieza | Estado | Tecnología | Dueño | Dónde vive | Notas |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const e of group) {
      const parent = e.parentId ? nameOf(e.parentId) : "";
      const name = parent ? `${e.name} <sub>(${parent})</sub>` : e.name;
      const notes = [e.summary, e.notes].filter((t) => t.trim()).join(" — ");
      out.push(
        `| ${cell(name)} | ${STATUS_BY_ID.get(e.status)?.label ?? e.status} | ${cell(e.tech)} | ${cell(e.owner)} | ${cell(e.location)} | ${cell(notes)} |`,
      );
    }
    out.push("");
  }

  return out.join("\n");
}
