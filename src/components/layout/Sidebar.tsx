import {
  BookOpen,
  Boxes,
  ChevronDown,
  FileText,
  FolderGit2,
  Gauge,
  History,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useDecisionStore } from "../../state/decisionStore";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore, type View } from "../../state/uiStore";
import type { DecisionStatus } from "../../types/domain";

interface NavItem {
  id: View;
  label: string;
  icon: typeof Sparkles;
  /** Para qué sirve, en el tooltip: los rótulos solos no distinguen «Documentos» de «Patrones». */
  hint: string;
  /** Si necesita un proyecto abierto para tener sentido. */
  needsProject: boolean;
}

/**
 * La navegación va agrupada y en el orden en que se usa.
 *
 * Una lista plana de seis entradas no dice cuál es la primera ni cuáles son opcionales; separar
 * el flujo de trabajo de las herramientas de consulta es lo que hace que la primera visita tenga
 * un camino evidente.
 */
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Tu trabajo",
    items: [
      {
        id: "projects",
        label: "Proyectos",
        icon: FolderGit2,
        hint: "Elige, crea o clona el repositorio en el que vas a trabajar. Empieza por aquí.",
        needsProject: false,
      },
      {
        id: "new-decision",
        label: "Nueva decisión",
        icon: Sparkles,
        hint: "El asistente que convierte un problema de negocio en un ADR documentado.",
        needsProject: true,
      },
      {
        id: "model",
        label: "Modelo del sistema",
        icon: Boxes,
        hint: "Qué existe hoy: componentes, endpoints, integraciones y deuda. Es lo que cada análisis recibe como contexto.",
        needsProject: true,
      },
      {
        id: "docs",
        label: "Documentos",
        icon: FileText,
        hint: "Los documentos ya generados, tal como quedaron en docs/architecture/.",
        needsProject: true,
      },
    ],
  },
  {
    title: "Para consultar",
    items: [
      {
        id: "patterns",
        label: "Catálogo de patrones",
        icon: BookOpen,
        hint: "Qué problema resuelve cada patrón, qué cuesta y qué atributos mueve.",
        needsProject: false,
      },
      {
        id: "simulators",
        label: "Simuladores",
        icon: Gauge,
        hint: "Probar si una arquitectura aguanta el tráfico o el crecimiento, antes de decidirla.",
        needsProject: false,
      },
    ],
  },
];

const STATUS_TONE: Record<DecisionStatus, string> = {
  done: "var(--success)",
  running: "var(--info)",
  error: "var(--danger)",
  cancelled: "var(--text-faint)",
  draft: "var(--text-faint)",
};

export function Sidebar({ onNewProject }: { onNewProject: () => void }) {
  const { projects, activeId, setActive } = useProjectStore();
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const { list, loadList, open, remove, current } = useDecisionStore();
  const [pickerOpen, setPickerOpen] = useState(false);

  const active = projects.find((p) => p.id === activeId) ?? null;

  useEffect(() => {
    if (activeId) void loadList(activeId);
  }, [activeId, loadList]);

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r border-line"
      style={{ background: "var(--bg-elevated)" }}
    >
      {/* selector de proyecto */}
      <div className="relative border-b border-line p-2.5">
        <button
          className="btn w-full justify-between px-2.5 py-2"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: active?.color ?? "var(--text-faint)" }}
            />
            <span className="truncate text-[13px] font-semibold">{active?.name ?? "Sin proyecto"}</span>
          </span>
          <ChevronDown size={14} className="shrink-0 text-faint" />
        </button>

        {pickerOpen && (
          <div
            className="card absolute inset-x-2.5 top-full z-30 mt-1 max-h-72 overflow-y-auto p-1"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            {projects.map((p) => (
              <button
                key={p.id}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover)] ${
                  p.id === activeId ? "font-semibold text-ink" : "text-muted"
                }`}
                onClick={() => {
                  void setActive(p.id);
                  setPickerOpen(false);
                }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
            <button
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2 py-1.5 text-left text-[13px] text-accent-text hover:bg-[var(--surface-hover)]"
              onClick={() => {
                setPickerOpen(false);
                onNewProject();
              }}
            >
              <Plus size={13} /> Nuevo proyecto…
            </button>
          </div>
        )}
      </div>

      {/* navegación */}
      <nav className="p-2">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-2 space-y-0.5 last:mb-0">
            <h3 className="px-2.5 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-faint uppercase">
              {group.title}
            </h3>
            {group.items.map(({ id, label, icon: Icon, hint, needsProject }) => {
              const disabled = needsProject && !activeId;
              return (
                <button
                  key={id}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                    view === id
                      ? "bg-[var(--accent-soft)] font-semibold text-accent-text"
                      : "text-muted hover:bg-[var(--surface-hover)]"
                  }`}
                  onClick={() => setView(id)}
                  disabled={disabled}
                  title={disabled ? "Abre un proyecto primero" : hint}
                >
                  <Icon size={15} className="shrink-0" /> <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* historial de decisiones */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-line">
        <h3 className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
          <History size={12} /> Decisiones de este proyecto
        </h3>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {list.length === 0 && (
            <p className="px-2 py-3 text-xs leading-relaxed text-faint">
              {activeId
                ? "Todavía ninguna. Las que generes van a aparecer acá."
                : "Abre un proyecto para ver sus decisiones."}
            </p>
          )}
          {list.map((d) => (
            <div
              key={d.id}
              className={`group flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                current?.id === d.id ? "bg-[var(--surface-hover)]" : "hover:bg-[var(--surface-hover)]"
              }`}
            >
              <button
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                onClick={() => {
                  void open(d.id);
                  setView("decision");
                }}
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: STATUS_TONE[d.status] }}
                  title={d.status}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-ink">{d.title}</span>
                  <span className="block text-[11px] text-faint">
                    {new Date(d.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                    {d.docPath && " · guardada"}
                  </span>
                </span>
              </button>
              <button
                className="btn btn-ghost shrink-0 px-1 py-0.5 opacity-0 group-hover:opacity-100"
                title="Eliminar decisión"
                onClick={() => void remove(d.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Ajustes no es parte del flujo: vive al fondo para no competir con lo que sí lo es. */}
      <div className="border-t border-line p-2">
        <button
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
            view === "settings"
              ? "bg-[var(--accent-soft)] font-semibold text-accent-text"
              : "text-muted hover:bg-[var(--surface-hover)]"
          }`}
          onClick={() => setView("settings")}
          title="Motor de Claude Code, credenciales de git, prompts y datos."
        >
          <Settings size={15} className="shrink-0" /> Ajustes
        </button>
      </div>
    </aside>
  );
}
