import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  FileStack,
  FolderGit2,
  Sparkles,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, type ComponentType } from "react";

import { blockers, coverage, isRunnable, stepProgress } from "../../lib/briefStatus";
import * as api from "../../lib/tauri/commands";
import { selectDraft, selectStep, useBriefStore } from "../../state/briefStore";
import { useDecisionStore } from "../../state/decisionStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { EmptyState } from "../common/Ui";
import { RunningPanel } from "./RunningPanel";
import { Stepper, type StepDef } from "./Stepper";
import { StepContext, StepDrivers, StepReview, StepScope, StepSituation, type StepProps } from "./steps";

const STEPS: StepDef[] = [
  { label: "Contexto", icon: Target, hint: "Qué hay que decidir y qué duele hoy." },
  { label: "Situación", icon: Users, hint: "Stack actual, restricciones, escala, equipo y presupuesto." },
  { label: "Drivers", icon: Sparkles, hint: "Atributos de calidad priorizados: son los que ponderan la matriz." },
  { label: "Alcance", icon: FileStack, hint: "Opciones candidatas, familias de patrones y artefactos a generar." },
  { label: "Revisar", icon: ClipboardCheck, hint: "Qué se va a enviar y qué va a tener que suponer el análisis." },
];

const PANELS: ComponentType<StepProps>[] = [StepContext, StepSituation, StepDrivers, StepScope, StepReview];

export function NewDecisionView() {
  const activeId = useProjectStore((s) => s.activeId);
  const refreshStatus = useProjectStore((s) => s.refreshStatus);
  const { run, cancel, runId, log } = useDecisionStore();
  const setView = useUiStore((s) => s.setView);
  const toast = useUiStore((s) => s.toast);
  const engine = useSettingsStore((s) => s.engine);

  // El borrador vive en su propio store y no en estado local: ir a mirar el catálogo de patrones
  // a mitad de camino no puede costar diez campos de prosa.
  const brief = useBriefStore(selectDraft(activeId));
  const step = Math.min(useBriefStore(selectStep(activeId)), STEPS.length - 1);
  const patchDraft = useBriefStore((s) => s.patch);
  const setDraftStep = useBriefStore((s) => s.setStep);
  const resetDraft = useBriefStore((s) => s.reset);

  const patch = useCallback(
    (values: Partial<typeof brief>) => patchDraft(activeId, values),
    [activeId, patchDraft],
  );
  const goToStep = useCallback(
    (index: number) => setDraftStep(activeId, Math.max(0, Math.min(STEPS.length - 1, index))),
    [activeId, setDraftStep],
  );

  const running = runId !== null;
  const ready = isRunnable(brief);
  const pending = blockers(brief);
  const progress = stepProgress(brief);
  const done = coverage(brief);

  // El panel de log ya no se abre solo: la vista de corrida cuenta lo mismo en un formato legible
  // y deja el botón para abrirlo cuando de verdad haga falta diagnosticar.
  const execute = useCallback(async () => {
    if (!activeId || !isRunnable(brief)) return;
    try {
      await run(activeId, brief);
      setView("decision");
      void refreshStatus();
      // La decisión ya guarda su propio brief en la base, así que el borrador cumplió su función.
      resetDraft(activeId);
    } catch (err) {
      const { kind, message } = api.describeError(err);
      if (kind === "cancelled") toast("info", message);
      else toast(kind === "quota" ? "warning" : "error", message);
    }
  }, [activeId, brief, refreshStatus, resetDraft, run, setView, toast]);

  // Ctrl+Enter dispara el análisis desde cualquier campo: es el atajo que la gente prueba.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void execute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute]);

  if (running) return <RunningPanel log={log} onCancel={() => void cancel()} title={brief.title} />;

  // Sin proyecto activo no hay dónde guardar el documento. Se dice antes de mostrar diez campos
  // que después no se podrían enviar.
  if (!activeId) {
    return (
      <EmptyState
        icon={<FolderGit2 size={38} />}
        title="Primero elige un proyecto"
        description="Cada decisión se guarda como un ADR dentro del repositorio de un proyecto. Abre uno existente o crea el primero para empezar."
        action={
          <button className="btn btn-primary" onClick={() => setView("projects")}>
            Ir a Proyectos <ArrowRight size={14} />
          </button>
        }
      />
    );
  }

  const Panel = PANELS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <header className="shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink">Nueva decisión de arquitectura</h1>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              Describes el problema y ArchFlow produce un ADR con matriz de trade-offs, diagramas, patrones y
              riesgos, guardado en el repositorio del proyecto. Solo el primer paso es obligatorio.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <div
              className="w-28 text-right"
              title="Mientras más completo esté el brief, menos tiene que suponer el análisis. No hace falta llegar al 100%."
            >
              <p className="text-[10.5px] tracking-wide text-faint uppercase">brief completo</p>
              <p className="text-[13px] font-semibold text-ink">{done}%</p>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${done}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
            <button
              className="btn btn-ghost px-2 py-1.5"
              title="Descartar el borrador y empezar de cero"
              onClick={() => resetDraft(activeId)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <nav className="mt-4">
          <Stepper steps={STEPS} progress={progress} current={step} onSelect={goToStep} />
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-6 py-5">
        <Panel brief={brief} patch={patch} goToStep={goToStep} />
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <button className="btn" onClick={() => goToStep(step - 1)} disabled={step === 0}>
            <ArrowLeft size={14} /> Atrás
          </button>
          <span className="text-[11.5px] whitespace-nowrap text-faint">
            Paso {step + 1} de {STEPS.length}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-faint">
          {!engine?.available && (
            <span className="text-danger">Claude Code no encontrado — revisa Ajustes</span>
          )}
          {pending.length > 0 && <span className="truncate text-warning">{pending.join(" · ")}</span>}
          {ready && !isLast && <span>Ctrl+Enter para analizar ahora</span>}
        </div>

        <div className="flex shrink-0 gap-2">
          {!isLast && (
            <>
              {ready && (
                <button
                  className="btn"
                  title="Correr el análisis sin completar los pasos que faltan"
                  onClick={() => void execute()}
                >
                  <Sparkles size={14} /> Analizar ahora
                </button>
              )}
              <button className="btn btn-primary" onClick={() => goToStep(step + 1)}>
                Siguiente <ArrowRight size={14} />
              </button>
            </>
          )}
          {isLast && (
            <button className="btn btn-primary px-5" onClick={() => void execute()} disabled={!ready}>
              <Sparkles size={15} /> Analizar
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
