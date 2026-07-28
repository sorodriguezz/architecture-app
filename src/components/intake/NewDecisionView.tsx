import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  FileStack,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { BRIEF_TEMPLATES, DELIVERABLES, PATTERN_FAMILIES, QUALITY_ATTRIBUTES } from "../../lib/catalog";
import * as api from "../../lib/tauri/commands";
import { useDecisionStore } from "../../state/decisionStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import type { DecisionBrief } from "../../types/domain";
import { BouncingDots, Field } from "../common/Ui";

const EMPTY: DecisionBrief = {
  title: "",
  problem: "",
  goals: "",
  nonGoals: "",
  constraints: "",
  currentState: "",
  qualityAttributes: [],
  scale: "",
  team: "",
  compliance: "",
  budget: "",
  candidateOptions: [],
  patternFamilies: PATTERN_FAMILIES.map((f) => f.id),
  deliverables: [...DELIVERABLES],
  notes: "",
};

const STEPS = [
  { id: 0, label: "Contexto", icon: Target },
  { id: 1, label: "Situación", icon: Users },
  { id: 2, label: "Drivers", icon: Sparkles },
  { id: 3, label: "Alcance", icon: FileStack },
] as const;

export function NewDecisionView() {
  const [brief, setBrief] = useState<DecisionBrief>(EMPTY);
  const [step, setStep] = useState(0);
  const activeId = useProjectStore((s) => s.activeId);
  const refreshStatus = useProjectStore((s) => s.refreshStatus);
  const { run, cancel, runId, log } = useDecisionStore();
  const setView = useUiStore((s) => s.setView);
  const setLogOpen = useUiStore((s) => s.setLogOpen);
  const toast = useUiStore((s) => s.toast);
  const engine = useSettingsStore((s) => s.engine);

  const running = runId !== null;
  const patch = (values: Partial<DecisionBrief>) => setBrief((b) => ({ ...b, ...values }));

  // El botón "Ejecutar" es lo único que no se puede deshacer barato (cuesta minutos y cuota),
  // así que su única precondición dura es que haya un título y un problema.
  const ready = brief.title.trim().length > 2 && brief.problem.trim().length > 10;

  const execute = async () => {
    if (!activeId || !ready) return;
    setLogOpen(true);
    try {
      await run(activeId, brief);
      setView("decision");
      void refreshStatus();
    } catch (err) {
      const { kind, message } = api.describeError(err);
      if (kind === "cancelled") toast("info", message);
      else toast(kind === "quota" ? "warning" : "error", message);
    }
  };

  if (running) return <RunningPanel log={log} onCancel={() => void cancel()} title={brief.title} />;

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <header className="shrink-0 px-6 pt-6 pb-4">
        <h1 className="text-lg font-semibold text-ink">Nueva decisión de arquitectura</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Describe el problema de negocio. Mientras más contexto entregues, menos supuestos tendrá que
          inventar el análisis.
        </p>

        <nav className="mt-4 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
                step === i
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-accent-text"
                  : "border-line text-muted hover:bg-[var(--surface-hover)]"
              }`}
              onClick={() => setStep(i)}
            >
              <s.icon size={14} className="shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        {step === 0 && <StepContext brief={brief} patch={patch} />}
        {step === 1 && <StepSituation brief={brief} patch={patch} />}
        {step === 2 && <StepDrivers brief={brief} patch={patch} />}
        {step === 3 && <StepScope brief={brief} patch={patch} />}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-3">
        <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft size={14} /> Atrás
        </button>

        <div className="flex items-center gap-2 text-[11.5px] text-faint">
          {!engine?.available && <span className="text-danger">Claude Code no encontrado — revisa Ajustes</span>}
          {!ready && <span>Falta el título y el problema de negocio</span>}
        </div>

        <div className="flex gap-2">
          {step < STEPS.length - 1 && (
            <button className="btn" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Siguiente <ArrowRight size={14} />
            </button>
          )}
          <button className="btn btn-primary" onClick={execute} disabled={!ready || !activeId}>
            <Sparkles size={15} /> Analizar
          </button>
        </div>
      </footer>
    </div>
  );
}

// ---------- pasos ----------

type PatchFn = (values: Partial<DecisionBrief>) => void;

function StepContext({ brief, patch }: { brief: DecisionBrief; patch: PatchFn }) {
  return (
    <div className="space-y-4">
      <div className="card p-3.5">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
          ¿Partimos de una plantilla?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BRIEF_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="chip hover:chip-on cursor-pointer"
              title={t.description}
              onClick={() =>
                patch({
                  ...t.values,
                  qualityAttributes: t.values.qualityAttributes.map((qa) => ({
                    ...qa,
                    scenario: QUALITY_ATTRIBUTES.find((q) => q.id === qa.id)?.sampleScenario ?? "",
                  })),
                })
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Field label="¿Qué hay que decidir?" required hint="Una línea, en imperativo. Es el título del ADR.">
        <input
          className="input"
          placeholder="Ej: Definir cómo se comunican el módulo de pagos y el de inventario"
          value={brief.title}
          onChange={(e) => patch({ title: e.target.value })}
          autoFocus
        />
      </Field>

      <Field
        label="Problema de negocio"
        required
        hint="Qué duele hoy, a quién, y qué pasa si no se hace nada. Escribe en prosa, sin proponer soluciones."
      >
        <textarea
          className="input h-36 resize-none"
          placeholder="Ej: Cada vez que el proveedor de pagos se cae, las órdenes quedan en un estado inconsistente y soporte tiene que repararlas a mano. El mes pasado fueron 340 casos y dos clientes corporativos escalaron…"
          value={brief.problem}
          onChange={(e) => patch({ problem: e.target.value })}
        />
      </Field>

      <Field label="Qué se necesita conseguir" hint="Resultados de negocio, no soluciones técnicas.">
        <textarea
          className="input h-24 resize-none"
          placeholder="Ej: Que ninguna orden quede en estado inconsistente, y que soporte no tenga que intervenir manualmente."
          value={brief.goals}
          onChange={(e) => patch({ goals: e.target.value })}
        />
      </Field>

      <Field label="Fuera de alcance" hint="Lo que explícitamente NO se va a resolver aquí.">
        <textarea
          className="input h-20 resize-none"
          placeholder="Ej: No se va a cambiar de proveedor de pagos ni a rediseñar el checkout."
          value={brief.nonGoals}
          onChange={(e) => patch({ nonGoals: e.target.value })}
        />
      </Field>
    </div>
  );
}

function StepSituation({ brief, patch }: { brief: DecisionBrief; patch: PatchFn }) {
  return (
    <div className="space-y-4">
      <Field
        label="Estado actual"
        hint="Stack, sistemas, integraciones y deuda existente. El análisis no puede respetar lo que no sabe que existe."
      >
        <textarea
          className="input h-28 resize-none"
          placeholder="Ej: Monolito .NET 8 sobre SQL Server, desplegado en dos VMs con IIS. Integración sincrónica con el ERP vía SOAP…"
          value={brief.currentState}
          onChange={(e) => patch({ currentState: e.target.value })}
        />
      </Field>

      <Field label="Restricciones" hint="Lo no negociable: cloud obligado, licencias, políticas, tecnologías vetadas.">
        <textarea
          className="input h-24 resize-none"
          placeholder="Ej: Todo debe correr en Azure. No se aprueban nuevas licencias comerciales. El equipo no puede crecer este año."
          value={brief.constraints}
          onChange={(e) => patch({ constraints: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Escala esperada" hint="Usuarios, RPS, volumen de datos, crecimiento a 12-24 meses.">
          <textarea
            className="input h-24 resize-none"
            placeholder="Ej: 12.000 usuarios activos, picos de 400 req/s en horario laboral, 2 TB de histórico creciendo 15% anual."
            value={brief.scale}
            onChange={(e) => patch({ scale: e.target.value })}
          />
        </Field>

        <Field label="Equipo" hint="Tamaño, seniority, lenguajes que dominan, si hay on-call.">
          <textarea
            className="input h-24 resize-none"
            placeholder="Ej: 6 desarrolladores, 2 senior. Fuertes en C# y SQL, sin experiencia en Kubernetes. No hay turno de guardia."
            value={brief.team}
            onChange={(e) => patch({ team: e.target.value })}
          />
        </Field>

        <Field label="Cumplimiento y regulación" hint="Datos personales, retención, auditoría, residencia.">
          <textarea
            className="input h-20 resize-none"
            placeholder="Ej: Ley 19.628 de datos personales; los datos deben residir en Chile y auditarse por 5 años."
            value={brief.compliance}
            onChange={(e) => patch({ compliance: e.target.value })}
          />
        </Field>

        <Field label="Presupuesto y plazos" hint="Cuánto y para cuándo.">
          <textarea
            className="input h-20 resize-none"
            placeholder="Ej: Hasta USD 1.500/mes de infraestructura. La primera versión tiene que estar en producción en el Q2."
            value={brief.budget}
            onChange={(e) => patch({ budget: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function StepDrivers({ brief, patch }: { brief: DecisionBrief; patch: PatchFn }) {
  const selected = new Map(brief.qualityAttributes.map((qa) => [qa.id, qa]));

  const toggle = (id: string) => {
    if (selected.has(id)) {
      patch({ qualityAttributes: brief.qualityAttributes.filter((qa) => qa.id !== id) });
    } else {
      const def = QUALITY_ATTRIBUTES.find((q) => q.id === id);
      patch({
        qualityAttributes: [
          ...brief.qualityAttributes,
          { id, weight: 3, scenario: def?.sampleScenario ?? "" },
        ],
      });
    }
  };

  const setWeight = (id: string, weight: number) =>
    patch({ qualityAttributes: brief.qualityAttributes.map((qa) => (qa.id === id ? { ...qa, weight } : qa)) });

  const setScenario = (id: string, scenario: string) =>
    patch({ qualityAttributes: brief.qualityAttributes.map((qa) => (qa.id === id ? { ...qa, scenario } : qa)) });

  return (
    <div className="space-y-4">
      <div className="card p-3.5">
        <p className="text-[12.5px] text-muted">
          Los atributos de calidad son <strong className="text-ink">los que dirigen la decisión</strong>: el peso
          que les des es literalmente el que pondera la matriz de trade-off. Elige pocos y priorízalos de verdad —
          si todo pesa 5, nada pesa.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUALITY_ATTRIBUTES.map((qa) => (
          <button
            key={qa.id}
            className={`chip cursor-pointer ${selected.has(qa.id) ? "chip-on" : ""}`}
            title={qa.description}
            onClick={() => toggle(qa.id)}
          >
            {selected.has(qa.id) ? <Check size={12} /> : <Plus size={12} />}
            {qa.label}
          </button>
        ))}
      </div>

      {brief.qualityAttributes.length === 0 && (
        <p className="py-6 text-center text-[13px] text-faint">
          Selecciona al menos dos atributos para que la comparación tenga sentido.
        </p>
      )}

      <div className="space-y-2.5">
        {brief.qualityAttributes.map((qa) => {
          const def = QUALITY_ATTRIBUTES.find((q) => q.id === qa.id);
          return (
            <div key={qa.id} className="card p-3.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-[13.5px] font-semibold text-ink">{def?.label ?? qa.id}</h4>
                  <p className="text-[11.5px] text-faint">{def?.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11px] text-muted">peso</span>
                  {[1, 2, 3, 4, 5].map((w) => (
                    <button
                      key={w}
                      className={`h-6 w-6 rounded text-[12px] font-semibold transition-colors ${
                        qa.weight >= w ? "text-white" : "text-faint"
                      }`}
                      style={{ background: qa.weight >= w ? "var(--accent)" : "var(--bg-elevated)" }}
                      onClick={() => setWeight(qa.id, w)}
                      aria-label={`peso ${w}`}
                    >
                      {w}
                    </button>
                  ))}
                  <button
                    className="btn btn-ghost ml-1 px-1.5 py-1"
                    onClick={() => toggle(qa.id)}
                    aria-label={`quitar ${def?.label ?? qa.id}`}
                    title="Quitar este driver"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              <textarea
                className="input h-16 resize-none text-[12.5px]"
                placeholder="Escenario concreto: ante {estímulo}, el sistema debe {respuesta} en {medida}."
                value={qa.scenario}
                onChange={(e) => setScenario(qa.id, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepScope({ brief, patch }: { brief: DecisionBrief; patch: PatchFn }) {
  const [option, setOption] = useState("");

  const addOption = () => {
    const value = option.trim();
    if (!value || brief.candidateOptions.includes(value)) return;
    patch({ candidateOptions: [...brief.candidateOptions, value] });
    setOption("");
  };

  const toggleFamily = (id: string) =>
    patch({
      patternFamilies: brief.patternFamilies.includes(id)
        ? brief.patternFamilies.filter((f) => f !== id)
        : [...brief.patternFamilies, id],
    });

  const toggleDeliverable = (d: string) =>
    patch({
      deliverables: brief.deliverables.includes(d)
        ? brief.deliverables.filter((x) => x !== d)
        : [...brief.deliverables, d],
    });

  return (
    <div className="space-y-5">
      <div>
        <span className="field-label">Opciones que ya tienes en mente</span>
        <p className="mb-2 text-[11.5px] text-faint">
          Se evaluarán todas, aunque alguna sea mala — y en ese caso el análisis dirá por qué lo es. Si no
          agregas ninguna, las propone el modelo.
        </p>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Ej: Cola de mensajes con outbox transaccional"
            value={option}
            onChange={(e) => setOption(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOption()}
          />
          <button className="btn shrink-0" onClick={addOption} disabled={!option.trim()}>
            <Plus size={14} /> Agregar
          </button>
        </div>
        {brief.candidateOptions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brief.candidateOptions.map((o) => (
              <span key={o} className="chip chip-on">
                {o}
                <button
                  onClick={() => patch({ candidateOptions: brief.candidateOptions.filter((x) => x !== o) })}
                  aria-label={`quitar ${o}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="field-label">Familias de patrones a cubrir</span>
        <div className="flex flex-wrap gap-1.5">
          {PATTERN_FAMILIES.map((f) => (
            <button
              key={f.id}
              className={`chip cursor-pointer ${brief.patternFamilies.includes(f.id) ? "chip-on" : ""}`}
              title={f.blurb}
              onClick={() => toggleFamily(f.id)}
            >
              {brief.patternFamilies.includes(f.id) ? <Check size={12} /> : <Ban size={12} />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="field-label">Artefactos a generar</span>
        <div className="flex flex-wrap gap-1.5">
          {DELIVERABLES.map((d) => (
            <button
              key={d}
              className={`chip cursor-pointer ${brief.deliverables.includes(d) ? "chip-on" : ""}`}
              onClick={() => toggleDeliverable(d)}
            >
              {brief.deliverables.includes(d) ? <Check size={12} /> : <Plus size={12} />}
              {d}
            </button>
          ))}
        </div>
      </div>

      <Field label="Notas adicionales" hint="Cualquier cosa que no calzó en los campos anteriores.">
        <textarea
          className="input h-24 resize-none"
          value={brief.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ---------- panel de corrida ----------

function RunningPanel({ log, onCancel, title }: { log: string[]; onCancel: () => void; title: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // De las líneas JSON del stream, la última que menciona una herramienta es lo más informativo
  // que se puede mostrar sin parsear el protocolo completo.
  const lastTool = [...log].reverse().find((l) => l.includes('"tool_use"'));
  const toolName = lastTool?.match(/"name"\s*:\s*"([^"]+)"/)?.[1];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative grid h-16 w-16 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ background: "var(--accent)" }} />
          <span
            className="relative grid h-14 w-14 place-items-center rounded-full"
            style={{ background: "var(--accent-soft)" }}
          >
            <Sparkles size={24} className="text-accent-text" />
          </span>
        </div>
        <h2 className="max-w-lg text-base font-semibold text-ink">{title || "Analizando la decisión"}</h2>
        <p className="text-[13px] text-muted">
          El modelo está evaluando alternativas, ponderando trade-offs y armando los diagramas.
        </p>
        <p className="font-mono text-[12px] text-faint">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          {toolName && <span className="ml-2 text-accent-text">· {toolName}</span>}
        </p>
      </div>

      <div
        className="card max-h-52 w-full max-w-3xl overflow-y-auto px-3.5 py-2.5 font-mono text-[11px] text-faint"
        style={{ background: "var(--bg-elevated)" }}
      >
        {log.length === 0 ? (
          <span className="flex items-center gap-2">
            <BouncingDots /> iniciando la CLI…
          </span>
        ) : (
          <pre className="break-all whitespace-pre-wrap">{log.slice(-40).join("\n")}</pre>
        )}
      </div>

      <button className="btn" onClick={onCancel}>
        <Trash2 size={14} /> Cancelar análisis
      </button>
    </div>
  );
}
