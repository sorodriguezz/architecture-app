import { CloudDownload, FolderGit2, FolderOpen, GitBranch, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import * as api from "../../lib/tauri/commands";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import { BouncingDots, EmptyState, Field, Modal } from "../common/Ui";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#0ea5e9", "#eab308", "#ef4444"];

export function ProjectsView({ newProjectOpen, setNewProjectOpen }: { newProjectOpen: boolean; setNewProjectOpen: (v: boolean) => void }) {
  const { projects, activeId, setActive, remove, add, load } = useProjectStore();
  const setView = useUiStore((s) => s.setView);
  const toast = useUiStore((s) => s.toast);

  useEffect(() => {
    void load();
    // `load` es estable (zustand no la recrea), así que esto corre una vez al montar.
  }, [load]);

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-6 py-6">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Proyectos</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Cada proyecto es una carpeta con su repositorio git. Los documentos que ArchFlow genera se
            versionan en <code className="rounded bg-[var(--bg-elevated)] px-1">docs/architecture/</code>.
          </p>
        </div>
        <button className="btn btn-primary shrink-0" onClick={() => setNewProjectOpen(true)}>
          <Plus size={15} /> Nuevo proyecto
        </button>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 size={38} />}
          title="Todavía no hay proyectos"
          description="Crea uno nuevo, abre una carpeta existente o clona un repositorio de GitHub."
          action={
            <button className="btn btn-primary" onClick={() => setNewProjectOpen(true)}>
              <Plus size={15} /> Crear el primero
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <article
              key={p.id}
              className={`card group cursor-pointer p-4 transition-colors hover:bg-[var(--surface-hover)] ${
                p.id === activeId ? "ring-1" : ""
              }`}
              style={p.id === activeId ? { borderColor: p.color, boxShadow: `0 0 0 1px ${p.color}` } : undefined}
              onClick={() => {
                void setActive(p.id);
                setView("new-decision");
              }}
            >
              <header className="mb-2 flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                  <h3 className="truncate text-[14px] font-semibold text-ink">{p.name}</h3>
                </span>
                <button
                  className="btn btn-ghost shrink-0 px-1.5 py-1 opacity-0 group-hover:opacity-100"
                  title="Quitar de ArchFlow (no borra la carpeta)"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(p.id).catch((err) => toast("error", api.describeError(err).message));
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </header>
              <p className="selectable truncate font-mono text-[11px] text-faint" title={p.path}>
                {p.path}
              </p>
              {p.context && <p className="mt-2 line-clamp-2 text-[12px] text-muted">{p.context}</p>}
              <p className="mt-3 text-[11px] text-faint">
                actualizado {new Date(p.updatedAt).toLocaleDateString("es-CL")}
              </p>
            </article>
          ))}
        </div>
      )}

      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreated={add} />
    </div>
  );
}

type Mode = "new" | "open" | "clone";

function NewProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Awaited<ReturnType<typeof api.createProject>>) => void;
}) {
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const toast = useUiStore((s) => s.toast);
  const setView = useUiStore((s) => s.setView);

  const finish = (project: Awaited<ReturnType<typeof api.createProject>>) => {
    onCreated(project);
    onClose();
    setName("");
    setUrl("");
    setView("new-decision");
    toast("success", `Proyecto «${project.name}» listo`);
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "new") {
        finish(await api.createProject(name, undefined, color));
      } else if (mode === "clone") {
        finish(await api.cloneProject(url, undefined, color));
      } else {
        const path = await api.pickFolder();
        if (!path) return;
        finish(await api.openProject(path, undefined, color));
      }
    } catch (err) {
      toast("error", api.describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = mode === "open" || (mode === "new" ? name.trim().length > 1 : url.trim().length > 5);

  return (
    <Modal
      open={open}
      title="Nuevo proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !canSubmit}>
            {busy ? <BouncingDots /> : null}
            {mode === "open" ? "Elegir carpeta…" : mode === "clone" ? "Clonar" : "Crear"}
          </button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-1.5">
        {(
          [
            { id: "new", label: "Crear", icon: Plus },
            { id: "open", label: "Abrir carpeta", icon: FolderOpen },
            { id: "clone", label: "Clonar repo", icon: CloudDownload },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-[12px] transition-colors ${
              mode === m.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-accent-text"
                : "border-line text-muted hover:bg-[var(--surface-hover)]"
            }`}
            onClick={() => setMode(m.id)}
          >
            <m.icon size={16} />
            {m.label}
          </button>
        ))}
      </div>

      {mode === "new" && (
        <Field label="Nombre del proyecto" required hint="Se crea una carpeta con este nombre y se inicializa git.">
          <input
            className="input"
            placeholder="Ej: Plataforma de pagos"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
      )}

      {mode === "clone" && (
        <Field
          label="URL del repositorio"
          required
          hint="Para repos privados, guarda tu token en Ajustes → Git antes de clonar."
        >
          <input
            className="input font-mono text-[12.5px]"
            placeholder="https://github.com/usuario/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
        </Field>
      )}

      {mode === "open" && (
        <p className="flex items-start gap-2 text-[13px] text-muted">
          <GitBranch size={15} className="mt-0.5 shrink-0" />
          Se abrirá el selector de carpetas. Si la carpeta no es un repositorio git, ArchFlow lo inicializa.
        </p>
      )}

      <div className="mt-4">
        <span className="field-label">Color</span>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              className="h-7 w-7 rounded-full transition-transform hover:scale-110"
              style={{ background: c, outline: c === color ? "2px solid var(--text)" : "none", outlineOffset: 2 }}
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
