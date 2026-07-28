import {
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  FolderOpen,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { renderMarkdown } from "../../lib/markdown";
import { extractDiagrams } from "../../lib/parseDecision";
import * as api from "../../lib/tauri/commands";
import { newRunId } from "../../lib/tauri/events";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import type { DocEntry } from "../../types/domain";
import { BouncingDots, EmptyState, Modal } from "../common/Ui";
import { MermaidDiagram } from "../diagrams/MermaidDiagram";

export function DocsView() {
  const activeId = useProjectStore((s) => s.activeId);
  const refreshStatus = useProjectStore((s) => s.refreshStatus);
  const toast = useUiStore((s) => s.toast);

  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    try {
      setEntries(await api.listDocs(activeId));
    } catch (err) {
      toast("error", api.describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [activeId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDoc = async (path: string) => {
    if (!activeId) return;
    try {
      const text = await api.readDoc(activeId, path);
      setSelected(path);
      setContent(text);
      setDraft(text);
      setEditing(false);
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  };

  const save = async () => {
    if (!activeId || !selected) return;
    try {
      await api.writeDoc(activeId, selected, draft);
      setContent(draft);
      setEditing(false);
      toast("success", "Documento guardado");
      void refreshStatus();
      void refresh();
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  };

  const create = async () => {
    if (!activeId) return;
    const title = window.prompt("Título del documento nuevo");
    if (!title?.trim()) return;
    try {
      const path = await api.createDoc(activeId, title.trim());
      await refresh();
      await openDoc(path);
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  };

  const remove = async (path: string) => {
    if (!activeId) return;
    if (!window.confirm(`¿Eliminar ${path}? Esto borra el archivo del disco.`)) return;
    try {
      await api.deleteDoc(activeId, path);
      if (selected === path) {
        setSelected(null);
        setContent("");
      }
      await refresh();
      void refreshStatus();
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  };

  const audit = async () => {
    if (!activeId || !content.trim()) return;
    setReviewing(true);
    try {
      setReview(await api.reviewDocument(activeId, content, newRunId()));
    } catch (err) {
      const { kind, message } = api.describeError(err);
      if (kind !== "cancelled") toast(kind === "quota" ? "warning" : "error", message);
    } finally {
      setReviewing(false);
    }
  };

  if (!activeId) {
    return <EmptyState icon={<FolderOpen size={38} />} title="Abre un proyecto para ver sus documentos" />;
  }

  const diagrams = editing ? [] : extractDiagrams(content);

  return (
    <div className="flex h-full">
      {/* árbol */}
      <div className="flex w-72 shrink-0 flex-col border-r border-line">
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-[12px] font-semibold text-ink">docs/architecture</h2>
          <div className="flex gap-0.5">
            <button className="btn btn-ghost px-1.5 py-1" onClick={create} title="Nuevo documento">
              <FilePlus2 size={14} />
            </button>
            <button className="btn btn-ghost px-1.5 py-1" onClick={() => void refresh()} title="Recargar">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {entries.length === 0 && !loading && (
            <p className="px-2 py-4 text-xs text-faint">
              No hay documentos todavía. Se crean solos al guardar una decisión.
            </p>
          )}
          {entries
            .filter((e) => !e.isDir)
            .map((e) => (
              <div
                key={e.path}
                className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 ${
                  selected === e.path ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-hover)]"
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => void openDoc(e.path)}
                >
                  <FileText size={13} className="shrink-0 text-faint" />
                  <span
                    className={`truncate text-[12.5px] ${selected === e.path ? "font-semibold text-accent-text" : "text-ink"}`}
                  >
                    {e.name}
                  </span>
                </button>
                <button
                  className="btn btn-ghost shrink-0 px-1 py-0.5 opacity-0 group-hover:opacity-100"
                  onClick={() => void remove(e.path)}
                  title="Eliminar"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <EmptyState icon={<FileText size={38} />} title="Elige un documento" description="Se muestra a la izquierda." />
        ) : (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-2.5">
              <span className="selectable truncate font-mono text-[12px] text-muted">{selected}</span>
              <div className="flex shrink-0 gap-1.5">
                <button className="btn" onClick={audit} disabled={reviewing}>
                  {reviewing ? <BouncingDots /> : <FileCheck2 size={14} />} Auditar
                </button>
                {editing ? (
                  <>
                    <button className="btn" onClick={() => (setDraft(content), setEditing(false))}>
                      <Eye size={14} /> Ver
                    </button>
                    <button className="btn btn-primary" onClick={save}>
                      <Save size={14} /> Guardar
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setEditing(true)}>
                    <Pencil size={14} /> Editar
                  </button>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {editing ? (
                <textarea
                  className="input h-full resize-none font-mono text-[12.5px] leading-relaxed"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              ) : (
                <div className="mx-auto max-w-4xl space-y-5">
                  <article className="prose-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
                  {diagrams.map((d) => (
                    <MermaidDiagram key={d.id} id={`doc-${d.id}`} title={d.title} code={d.code} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Modal open={review !== null} title="Auditoría del documento" onClose={() => setReview(null)} width="max-w-3xl">
        <article className="prose-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(review ?? "") }} />
      </Modal>
    </div>
  );
}
