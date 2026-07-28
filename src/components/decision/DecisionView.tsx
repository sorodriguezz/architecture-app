import {
  AlertCircle,
  Blocks,
  FileText,
  MessageSquare,
  Save,
  Shapes,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UploadCloud,
} from "lucide-react";
import { useEffect, useState } from "react";

import { renderMarkdown } from "../../lib/markdown";
import * as api from "../../lib/tauri/commands";
import { useDecisionStore } from "../../state/decisionStore";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import { BouncingDots, EmptyState } from "../common/Ui";
import { DiagramsPanel } from "../diagrams/DiagramsPanel";
import { PatternsPanel } from "./PatternsPanel";
import { RefinePanel } from "./RefinePanel";
import { RisksPanel } from "./RisksPanel";
import { TradeOffMatrix } from "./TradeOffMatrix";

type Tab = "doc" | "tradeoff" | "diagrams" | "patterns" | "risks" | "refine";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "doc", label: "Documento", icon: FileText },
  { id: "tradeoff", label: "Trade-offs", icon: TrendingUp },
  { id: "diagrams", label: "Diagramas", icon: Shapes },
  { id: "patterns", label: "Patrones", icon: Blocks },
  { id: "risks", label: "Riesgos", icon: ShieldAlert },
  { id: "refine", label: "Refinar", icon: MessageSquare },
];

export function DecisionView() {
  const { current, parsed, setMarkdown, persistMarkdown } = useDecisionStore();
  const activeId = useProjectStore((s) => s.activeId);
  const refreshStatus = useProjectStore((s) => s.refreshStatus);
  const toast = useUiStore((s) => s.toast);
  const setView = useUiStore((s) => s.setView);
  const [tab, setTab] = useState<Tab>("doc");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Cambiar de decisión tiene que resetear la vista: quedarse en "Diagramas" mostrando los de la
  // anterior es peor que volver al documento.
  useEffect(() => {
    setTab("doc");
    setEditing(false);
  }, [current?.id]);

  if (!current) {
    return (
      <EmptyState
        icon={<Sparkles size={38} />}
        title="Ninguna decisión abierta"
        description="Elige una del historial en la barra lateral, o crea una nueva."
        action={
          <button className="btn btn-primary" onClick={() => setView("new-decision")}>
            <Sparkles size={15} /> Nueva decisión
          </button>
        }
      />
    );
  }

  if (current.status === "error") {
    return (
      <EmptyState
        icon={<AlertCircle size={38} className="text-danger" />}
        title="Este análisis falló"
        description={current.error ?? "Sin detalle del error."}
        action={
          <button className="btn" onClick={() => setView("new-decision")}>
            Intentar de nuevo
          </button>
        }
      />
    );
  }

  const meta = parsed?.meta ?? null;

  const saveDoc = async () => {
    setSaving(true);
    try {
      if (editing) {
        setMarkdown(draft);
        await persistMarkdown();
        setEditing(false);
      }
      const path = await api.saveDecisionDoc(current.id);
      toast("success", `Guardado en ${path}`);
      void refreshStatus();
    } catch (err) {
      toast("error", api.describeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!activeId) return;
    setSaving(true);
    try {
      await api.saveDecisionDoc(current.id);
      const result = await api.publishDocs(activeId, `docs(arquitectura): ${current.title}`, true);
      toast("success", result);
      void refreshStatus();
    } catch (err) {
      toast("error", api.describeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line px-6 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="selectable truncate text-lg font-semibold text-ink">{meta?.title || current.title}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-faint">
              <span>{new Date(current.createdAt).toLocaleString("es-CL")}</span>
              {current.model && <span className="chip px-1.5 py-0">{current.model}</span>}
              {current.docPath && <span className="text-success">· {current.docPath}</span>}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn" onClick={() => setEditing((v) => (v ? v : (setDraft(current.resultMd), true)))}>
              {editing ? "Editando" : "Editar"}
            </button>
            <button className="btn" onClick={saveDoc} disabled={saving}>
              {saving ? <BouncingDots /> : <Save size={14} />} Guardar
            </button>
            <button className="btn btn-primary" onClick={publish} disabled={saving}>
              <UploadCloud size={14} /> Publicar
            </button>
          </div>
        </div>

        <nav className="-mb-px flex gap-1 pt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] transition-colors ${
                tab === t.id
                  ? "border-[var(--accent)] font-semibold text-accent-text"
                  : "border-transparent text-muted hover:text-ink"
              }`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={14} /> {t.label}
              {t.id === "diagrams" && (parsed?.diagrams.length ?? 0) > 0 && (
                <span className="chip px-1.5 py-0 text-[10px]">{parsed?.diagrams.length}</span>
              )}
              {t.id === "risks" && (meta?.risks.length ?? 0) > 0 && (
                <span className="chip px-1.5 py-0 text-[10px]">{meta?.risks.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {parsed?.metaError && tab !== "doc" && (
          <p
            className="mb-4 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
          >
            {parsed.metaError}
          </p>
        )}

        {tab === "doc" &&
          (editing ? (
            <div className="flex h-full flex-col gap-3">
              <textarea
                className="input min-h-0 flex-1 resize-none font-mono text-[12.5px] leading-relaxed"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex shrink-0 justify-end gap-2">
                <button className="btn" onClick={() => setEditing(false)}>
                  Descartar
                </button>
                <button className="btn btn-primary" onClick={saveDoc} disabled={saving}>
                  <Save size={14} /> Guardar cambios
                </button>
              </div>
            </div>
          ) : (
            <article
              className="prose-doc mx-auto max-w-4xl"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(parsed?.markdown ?? current.resultMd) }}
            />
          ))}

        {tab === "tradeoff" &&
          (meta ? <TradeOffMatrix meta={meta} /> : <NoMeta section="matriz de trade-off" />)}

        {tab === "diagrams" && <DiagramsPanel diagrams={parsed?.diagrams ?? []} projectId={activeId} />}

        {tab === "patterns" &&
          (meta ? <PatternsPanel patterns={meta.patterns} /> : <NoMeta section="lista de patrones" />)}

        {tab === "risks" && (meta ? <RisksPanel meta={meta} /> : <NoMeta section="registro de riesgos" />)}

        {tab === "refine" && <RefinePanel decisionId={current.id} />}
      </div>
    </div>
  );
}

function NoMeta({ section }: { section: string }) {
  return (
    <EmptyState
      title={`Sin ${section} estructurada`}
      description="El análisis no devolvió el bloque de metadatos. El contenido equivalente sigue disponible en la pestaña Documento."
    />
  );
}
