import {
  FileDown,
  FolderGit2,
  Map as MapIcon,
  Pencil,
  Plus,
  RadarIcon,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  KIND_BY_ID,
  MODEL_DOC_PATH,
  MODEL_KINDS,
  SOURCE_LABEL,
  STATUS_BY_ID,
  dependencyIds,
  emptyElement,
  modelToMarkdown,
  modelToMermaid,
} from "../../lib/model";
import * as api from "../../lib/tauri/commands";
import { newRunId } from "../../lib/tauri/events";
import { useDecisionStore } from "../../state/decisionStore";
import { useModelStore } from "../../state/modelStore";
import { useActiveProject, useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import type { ModelElement, ModelKind } from "../../types/domain";
import { BouncingDots, EmptyState, Modal } from "../common/Ui";
import { MermaidDiagram } from "../diagrams/MermaidDiagram";
import { ElementEditor } from "./ElementEditor";
import { ProposalDialog } from "./ProposalDialog";

type Tab = "mapa" | ModelKind;

/**
 * El modelo del sistema: qué existe hoy en el proyecto.
 *
 * Es la memoria de la app. Todo lo que se registra aquí se le entrega a cada análisis posterior
 * (`decision_cmd::prepare` lo inyecta en el brief), así que la decisión número siete sabe que ya
 * hay una cola de eventos en vez de proponer otra. Se llena de tres formas — escaneando el
 * repositorio, extrayéndolo de una decisión ya aprobada, o a mano — y las tres pasan por una
 * revisión antes de escribir.
 */
export function SystemModelView() {
  const activeId = useProjectStore((s) => s.activeId);
  const project = useActiveProject();
  const refreshStatus = useProjectStore((s) => s.refreshStatus);
  const { elements, loading, load, remove } = useModelStore();
  const decisions = useDecisionStore((s) => s.list);
  const setView = useUiStore((s) => s.setView);
  const setLogOpen = useUiStore((s) => s.setLogOpen);
  const toast = useUiStore((s) => s.toast);

  const [tab, setTab] = useState<Tab>("mapa");
  const [editing, setEditing] = useState<ModelElement | null>(null);
  const [proposal, setProposal] = useState<{
    raw: string;
    source: "scan" | "decision";
    decisionId: string | null;
  } | null>(null);
  const [busy, setBusy] = useState<"scan" | "extract" | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (activeId) void load(activeId);
  }, [activeId, load]);

  const counts = useMemo(() => {
    const map = new Map<ModelKind, number>();
    for (const e of elements) map.set(e.kind, (map.get(e.kind) ?? 0) + 1);
    return map;
  }, [elements]);

  if (!activeId) {
    return (
      <EmptyState
        icon={<FolderGit2 size={38} />}
        title="Abre un proyecto para ver su modelo"
        description="El inventario es por proyecto: describe el sistema que ese repositorio construye."
        action={
          <button className="btn btn-primary" onClick={() => setView("projects")}>
            Ir a Proyectos
          </button>
        }
      />
    );
  }

  const runScan = async () => {
    setBusy("scan");
    try {
      const raw = await api.scanRepository(activeId, newRunId());
      setProposal({ raw, source: "scan", decisionId: null });
    } catch (err) {
      const { kind, message } = api.describeError(err);
      if (kind !== "cancelled") toast(kind === "quota" ? "warning" : "error", message);
    } finally {
      setBusy(null);
    }
  };

  const runExtract = async (decisionId: string) => {
    setPickerOpen(false);
    setBusy("extract");
    try {
      const raw = await api.extractModelFromDecision(decisionId, newRunId());
      setProposal({ raw, source: "decision", decisionId });
    } catch (err) {
      const { kind, message } = api.describeError(err);
      if (kind !== "cancelled") toast(kind === "quota" ? "warning" : "error", message);
    } finally {
      setBusy(null);
    }
  };

  const exportDoc = async () => {
    if (!project) return;
    try {
      await api.writeDoc(activeId, MODEL_DOC_PATH, modelToMarkdown(elements, project.name));
      toast("success", `Exportado a ${MODEL_DOC_PATH}`);
      void refreshStatus();
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  };

  const empty = elements.length === 0 && !loading;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line px-6 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink">Modelo del sistema</h1>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-muted">
              Qué existe hoy en este proyecto: componentes, endpoints, integraciones, datos y deuda. Cada
              análisis que corras recibe este inventario, así que deja de proponerte cosas que ya tienes.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button className="btn" onClick={() => void runScan()} disabled={busy !== null}>
              {busy === "scan" ? <BouncingDots /> : <RadarIcon size={14} />} Escanear el repositorio
            </button>
            <button
              className="btn"
              onClick={() => setPickerOpen(true)}
              disabled={busy !== null || decisions.length === 0}
              title={
                decisions.length === 0
                  ? "Todavía no hay decisiones en este proyecto"
                  : "Extraer las piezas que introduce una decisión ya generada"
              }
            >
              {busy === "extract" ? <BouncingDots /> : <Sparkles size={14} />} Traer de una decisión
            </button>
            <button className="btn" onClick={() => void exportDoc()} disabled={elements.length === 0}>
              <FileDown size={14} /> Exportar
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setEditing(emptyElement(activeId, tab === "mapa" ? "component" : tab))}
            >
              <Plus size={14} /> Agregar
            </button>
          </div>
        </div>

        {busy && (
          <p className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
            <BouncingDots />
            {busy === "scan"
              ? "Leyendo el repositorio. Puede tomar un par de minutos según el tamaño del proyecto."
              : "Leyendo la decisión."}
            <button className="btn btn-ghost px-1.5 py-0.5 text-[11.5px]" onClick={() => setLogOpen(true)}>
              <Terminal size={12} /> ver el log
            </button>
          </p>
        )}

        <nav className="-mb-px flex flex-wrap gap-1 pt-3.5">
          <TabButton active={tab === "mapa"} onClick={() => setTab("mapa")} icon={MapIcon} label="Mapa" />
          {MODEL_KINDS.map((k) => (
            <TabButton
              key={k.id}
              active={tab === k.id}
              onClick={() => setTab(k.id)}
              icon={k.icon}
              label={k.plural}
              count={counts.get(k.id) ?? 0}
            />
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {empty ? (
          <FirstRun onScan={() => void runScan()} onManual={() => setEditing(emptyElement(activeId, "component"))} />
        ) : tab === "mapa" ? (
          <MapTab elements={elements} />
        ) : (
          <KindTab
            kind={tab}
            elements={elements}
            onEdit={setEditing}
            onAdd={() => setEditing(emptyElement(activeId, tab))}
            onRemove={(id) => void remove(id)}
          />
        )}
      </div>

      {editing && <ElementEditor key={editing.id || "nuevo"} element={editing} onClose={() => setEditing(null)} />}

      <ProposalDialog
        raw={proposal?.raw ?? null}
        source={proposal?.source ?? "scan"}
        decisionId={proposal?.decisionId ?? null}
        onClose={() => setProposal(null)}
      />

      <Modal open={pickerOpen} title="¿De qué decisión?" onClose={() => setPickerOpen(false)}>
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
          Se lee el documento y se proponen las piezas que introduce la opción recomendada. Tú apruebas cuáles
          entran al modelo.
        </p>
        <div className="space-y-1">
          {decisions
            .filter((d) => d.status === "done")
            .map((d) => (
              <button
                key={d.id}
                className="w-full rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                onClick={() => void runExtract(d.id)}
              >
                <span className="block text-[12.5px] font-medium text-ink">{d.title}</span>
                <span className="block text-[11px] text-faint">
                  {new Date(d.createdAt).toLocaleDateString("es-CL")}
                  {d.docPath && ` · ${d.docPath}`}
                </span>
              </button>
            ))}
          {decisions.filter((d) => d.status === "done").length === 0 && (
            <p className="py-4 text-center text-[12.5px] text-faint">
              No hay decisiones terminadas en este proyecto todavía.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MapIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] transition-colors ${
        active ? "border-[var(--accent)] font-semibold text-accent-text" : "border-transparent text-muted hover:text-ink"
      }`}
      onClick={onClick}
    >
      <Icon size={14} /> {label}
      {count !== undefined && count > 0 && <span className="chip px-1.5 py-0 text-[10px]">{count}</span>}
    </button>
  );
}

/** Lo que se ve con el modelo vacío: los dos caminos para llenarlo, y por qué conviene. */
function FirstRun({ onScan, onManual }: { onScan: () => void; onManual: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <h2 className="text-base font-semibold text-ink">Tu sistema todavía está vacío aquí</h2>
      <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted">
        Mientras esté vacío, cada análisis empieza de cero: no sabe qué servicios tienes, con qué te integras ni
        qué ya decidiste. Llenarlo una vez cambia todas las decisiones que vengan después.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <article className="card p-4 text-left">
          <RadarIcon size={20} className="text-accent-text" />
          <h3 className="mt-2 text-[13.5px] font-semibold text-ink">Escanear el repositorio</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Lee el código real y propone lo que encuentra: controladores, clientes HTTP, esquemas. Revisas la
            lista y aceptas lo que corresponda. Es la forma más rápida si el proyecto ya existe.
          </p>
          <button className="btn btn-primary mt-3 w-full" onClick={onScan}>
            Escanear ahora
          </button>
        </article>

        <article className="card p-4 text-left">
          <Plus size={20} className="text-accent-text" />
          <h3 className="mt-2 text-[13.5px] font-semibold text-ink">Agregarlo a mano</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Empieza por los componentes grandes: un servicio, una base, una cola. Con cinco o seis piezas el
            modelo ya sirve — no hace falta que esté completo para que ayude.
          </p>
          <button className="btn mt-3 w-full" onClick={onManual}>
            Agregar el primer componente
          </button>
        </article>
      </div>

      <p className="mt-5 text-[11.5px] leading-relaxed text-faint">
        También puedes llenarlo desde una decisión ya generada: «Traer de una decisión» lee el ADR y propone las
        piezas que introduce.
      </p>
    </div>
  );
}

function MapTab({ elements }: { elements: ModelElement[] }) {
  const code = useMemo(() => modelToMermaid(elements), [elements]);

  // Lo que le falta al modelo para ser útil, dicho con su consecuencia. Mismo criterio que los
  // huecos del brief: no son errores, son lo que el análisis va a tener que suponer.
  const gaps: string[] = [];
  const components = elements.filter((e) => e.kind === "component");
  const withoutSummary = elements.filter((e) => !e.summary.trim()).length;
  const edges = elements.reduce((n, e) => n + dependencyIds(e).length, 0);
  const orphans = elements.filter((e) => KIND_BY_ID.get(e.kind)?.nested && !e.parentId).length;

  if (components.length >= 2 && edges === 0) {
    gaps.push(
      "Ninguna pieza declara de qué depende, así que el diagrama no tiene flechas. Edita un componente y marca a qué llama.",
    );
  }
  if (withoutSummary > 0) {
    gaps.push(
      `${withoutSummary} ${withoutSummary === 1 ? "pieza no tiene" : "piezas no tienen"} descripción: el análisis va a ver el nombre pero no de qué se hace cargo.`,
    );
  }
  if (orphans > 0) {
    gaps.push(
      `${orphans} ${orphans === 1 ? "pieza cuelga" : "piezas cuelgan"} de ningún componente. Asígnales uno para saber dónde viven.`,
    );
  }
  if (elements.filter((e) => e.kind === "integration").length === 0) {
    gaps.push(
      "No hay integraciones externas registradas. Si el sistema depende de terceros, son los primeros candidatos a fallar.",
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {MODEL_KINDS.map((k) => {
          const n = elements.filter((e) => e.kind === k.id).length;
          return (
            <div key={k.id} className="card p-3">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-muted uppercase">
                <k.icon size={12} /> {k.plural}
              </p>
              <p className="mt-0.5 text-xl font-bold text-ink">{n}</p>
            </div>
          );
        })}
      </div>

      {code ? (
        <MermaidDiagram id="system-model" title="Diagrama de contexto — generado del inventario" code={code} />
      ) : (
        <p className="card p-6 text-center text-[13px] text-faint">
          Agrega al menos un componente o una integración para dibujar el mapa.
        </p>
      )}

      {gaps.length > 0 && (
        <section className="card p-4">
          <h3 className="mb-1 text-[13px] font-semibold text-ink">Qué le falta al modelo</h3>
          <p className="mb-2.5 text-[12px] text-faint">
            No son errores: es lo que el análisis va a tener que suponer mientras no esté.
          </p>
          <ul className="space-y-1.5">
            {gaps.map((gap) => (
              <li key={gap} className="flex gap-2 text-[12.5px] leading-relaxed text-muted">
                <span className="text-faint">·</span>
                {gap}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function KindTab({
  kind,
  elements,
  onEdit,
  onAdd,
  onRemove,
}: {
  kind: ModelKind;
  elements: ModelElement[];
  onEdit: (element: ModelElement) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const def = KIND_BY_ID.get(kind);
  const items = elements.filter((e) => e.kind === kind);
  const byId = new Map(elements.map((e) => [e.id, e]));

  // Las piezas que cuelgan de un componente se agrupan bajo él: una lista plana de cuarenta
  // endpoints no dice de quién es cada uno, que es justo lo que se viene a mirar.
  const groups = def?.nested
    ? [
        ...elements
          .filter((e) => e.kind === "component")
          .map((c) => ({ title: c.name, items: items.filter((e) => e.parentId === c.id) }))
          .filter((g) => g.items.length > 0),
        { title: "Sin componente asignado", items: items.filter((e) => !e.parentId || !byId.has(e.parentId)) },
      ].filter((g) => g.items.length > 0)
    : [{ title: "", items }];

  return (
    <div className="space-y-4">
      {def && (
        <p className="text-[12.5px] leading-relaxed text-muted">
          {def.blurb} <span className="text-faint">Ej: {def.example}</span>
        </p>
      )}

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[13px] text-muted">Todavía no hay {def?.plural.toLowerCase()} registrados.</p>
          <button className="btn btn-primary mt-3" onClick={onAdd}>
            <Plus size={14} /> Agregar {def?.label.toLowerCase()}
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.title || "todos"}>
            {group.title && (
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">{group.title}</h3>
            )}
            <div className="space-y-1.5">
              {group.items.map((e) => (
                <ElementRow key={e.id} element={e} byId={byId} onEdit={() => onEdit(e)} onRemove={() => onRemove(e.id)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ElementRow({
  element,
  byId,
  onEdit,
  onRemove,
}: {
  element: ModelElement;
  byId: Map<string, ModelElement>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const status = STATUS_BY_ID.get(element.status);
  const deps = dependencyIds(element)
    .map((id) => byId.get(id)?.name)
    .filter(Boolean);

  return (
    <article className="card group flex items-start gap-3 p-3">
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: `var(${status?.tone ?? "--text-faint"})` }}
        title={status?.hint}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="selectable text-[13px] font-semibold text-ink">{element.name}</h4>
          <span className="text-[10.5px]" style={{ color: `var(${status?.tone ?? "--text-faint"})` }}>
            {status?.label}
          </span>
          {element.tech.trim() && <span className="chip px-1.5 py-0 text-[10px]">{element.tech}</span>}
          {element.owner.trim() && <span className="text-[10.5px] text-faint">{element.owner}</span>}
        </div>

        {element.summary.trim() && (
          <p className="selectable mt-0.5 text-[12.5px] leading-relaxed text-muted">{element.summary}</p>
        )}
        {element.notes.trim() && (
          <p className="selectable mt-1 text-[11.5px] leading-relaxed text-faint">{element.notes}</p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-faint">
          <span>{SOURCE_LABEL[element.source] ?? element.source}</span>
          {element.location.trim() && <span className="font-mono">{element.location}</span>}
          {deps.length > 0 && <span>depende de: {deps.join(", ")}</span>}
        </p>
      </div>

      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button className="btn btn-ghost px-1.5 py-1" onClick={onEdit} title="Editar">
          <Pencil size={13} />
        </button>
        <button className="btn btn-ghost px-1.5 py-1" onClick={onRemove} title="Quitar del modelo">
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}
