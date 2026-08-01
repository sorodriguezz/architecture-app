import { ArrowUpRight, Ban, Blocks, Check, Plus, Scale, TriangleAlert, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { gaps } from "../../lib/briefStatus";
import {
  BRIEF_TEMPLATES,
  DELIVERABLES,
  PATTERN_FAMILIES,
  QUALITY_ATTRIBUTES,
  driverTensions,
  familiesForDrivers,
  patternsForDriver,
  qaLabel,
  qaShort,
} from "../../lib/catalog";
import { useUiStore } from "../../state/uiStore";
import type { DecisionBrief } from "../../types/domain";
import { Field } from "../common/Ui";

export type PatchFn = (values: Partial<DecisionBrief>) => void;

export interface StepProps {
  brief: DecisionBrief;
  patch: PatchFn;
  goToStep: (index: number) => void;
}

/**
 * Encabezado del paso.
 *
 * Cada panel dice, antes de mostrar un solo campo, qué se pide ahí y por qué importa. Sin esto
 * el asistente es una sucesión de formularios y el usuario tiene que deducir del nombre del campo
 * qué se espera de él — que es exactamente el punto donde la gente abandona.
 */
function StepIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header>
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{children}</p>
    </header>
  );
}

// ---------------------------------------------------------------------------
// 1 · Contexto
// ---------------------------------------------------------------------------

export function StepContext({ brief, patch }: StepProps) {
  return (
    <div className="space-y-4">
      <StepIntro title="¿Qué hay que decidir?">
        Cuéntalo como se lo contarías a alguien que entra hoy al equipo: qué duele y a quién. Con el título y el
        problema ya se puede correr el análisis — los pasos que siguen solo lo hacen más preciso.
      </StepIntro>

      <div className="card p-3.5">
        <p className="mb-0.5 text-[12.5px] font-semibold text-ink">¿No sabes por dónde empezar?</p>
        <p className="mb-2.5 text-[11.5px] text-faint">
          Elige un caso parecido al tuyo: rellena el brief completo y después lo editas.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {BRIEF_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
              style={{ background: "var(--bg-elevated)" }}
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
              <span className="block text-[12.5px] font-semibold text-ink">{t.label}</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{t.description}</span>
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

// ---------------------------------------------------------------------------
// 2 · Situación
// ---------------------------------------------------------------------------

export function StepSituation({ brief, patch }: StepProps) {
  return (
    <div className="space-y-4">
      <StepIntro title="¿Dónde estás parado hoy?">
        Ninguno de estos campos es obligatorio, pero cada uno que dejes vacío el análisis lo va a tener que
        suponer — y el supuesto queda escrito en el documento final. Llena los que conozcas y salta el resto.
      </StepIntro>

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

// ---------------------------------------------------------------------------
// 3 · Drivers
// ---------------------------------------------------------------------------

export function StepDrivers({ brief, patch }: StepProps) {
  const openPatterns = useUiStore((s) => s.openPatterns);
  const selected = new Map(brief.qualityAttributes.map((qa) => [qa.id, qa]));
  const ids = brief.qualityAttributes.map((qa) => qa.id);
  const tensions = driverTensions(ids).slice(0, 2);

  const toggle = (id: string) => {
    if (selected.has(id)) {
      patch({ qualityAttributes: brief.qualityAttributes.filter((qa) => qa.id !== id) });
    } else {
      const def = QUALITY_ATTRIBUTES.find((q) => q.id === id);
      patch({
        qualityAttributes: [...brief.qualityAttributes, { id, weight: 3, scenario: def?.sampleScenario ?? "" }],
      });
    }
  };

  const setWeight = (id: string, weight: number) =>
    patch({ qualityAttributes: brief.qualityAttributes.map((qa) => (qa.id === id ? { ...qa, weight } : qa)) });

  const setScenario = (id: string, scenario: string) =>
    patch({ qualityAttributes: brief.qualityAttributes.map((qa) => (qa.id === id ? { ...qa, scenario } : qa)) });

  return (
    <div className="space-y-4">
      <StepIntro title="¿Qué es lo que más importa?">
        Marca los atributos de calidad que dirigen esta decisión y dales un peso del 1 al 5. Ese peso es
        literalmente el que pondera la matriz de trade-off del documento: elige pocos y priorízalos de verdad,
        porque si todo pesa 5, nada pesa.
      </StepIntro>

      <div>
        <p className="field-label">Elige los que apliquen</p>
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
      </div>

      {brief.qualityAttributes.length === 0 && (
        <p className="py-6 text-center text-[13px] text-faint">
          Selecciona al menos dos atributos para que la comparación tenga sentido.
        </p>
      )}

      {/* La tensión entre drivers es lo que hace que la decisión sea una decisión: si no hay
          conflicto entre lo que pediste, no hay nada que ponderar. */}
      {tensions.length > 0 && (
        <section className="card p-3.5" style={{ borderColor: "var(--warning)" }}>
          <h4 className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-warning">
            <Scale size={14} /> Dónde vas a tener que ceder
          </h4>
          <ul className="mb-2 space-y-1.5">
            {tensions.map((t) => (
              <li key={`${t.a}-${t.b}`} className="flex items-center gap-2 text-[12.5px]">
                <span className="font-medium text-ink">{qaShort(t.a)}</span>
                <span className="text-warning">↔</span>
                <span className="font-medium text-ink">{qaShort(t.b)}</span>
                <span className="text-faint">
                  · {t.hits} patrones mejoran uno a costa del otro
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-muted">
            Si les das el mismo peso, la elección la termina haciendo el modelo. Prioriza de verdad y la matriz
            va a reflejar tu criterio, no el suyo.
          </p>
        </section>
      )}

      <div className="space-y-2.5">
        {brief.qualityAttributes.map((qa) => {
          const def = QUALITY_ATTRIBUTES.find((q) => q.id === qa.id);
          const candidates = patternsForDriver(qa.id);
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

              {candidates.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                  <span className="flex items-center gap-1 text-[11px] text-faint">
                    <Blocks size={12} /> lo empujan:
                  </span>
                  {candidates.slice(0, 3).map((p) => (
                    <span key={p.name} className="chip px-1.5 py-0 text-[10.5px]" title={p.problem}>
                      {p.name}
                    </span>
                  ))}
                  <button
                    className="flex items-center gap-0.5 text-[11px] text-accent-text hover:underline"
                    onClick={() => openPatterns({ driver: qa.id })}
                  >
                    ver los {candidates.length} <ArrowUpRight size={11} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 · Alcance
// ---------------------------------------------------------------------------

export function StepScope({ brief, patch }: StepProps) {
  const [option, setOption] = useState("");
  const suggested = new Set(
    familiesForDrivers(brief.qualityAttributes.map((qa) => qa.id))
      .slice(0, 4)
      .map((f) => f.id),
  );

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
      <StepIntro title="¿Qué quieres que evalúe y qué te entregue?">
        Todo esto es opcional y tiene valores razonables por defecto. Tócalo solo si ya tienes alternativas en la
        cabeza o si necesitas un artefacto puntual.
      </StepIntro>

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
        <p className="mb-2 text-[11.5px] text-faint">
          Las marcadas con ✦ son las que más patrones aportan a los drivers que elegiste.
        </p>
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
              {suggested.has(f.id) && <span className="text-warning">✦</span>}
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

// ---------------------------------------------------------------------------
// 5 · Revisar
// ---------------------------------------------------------------------------

/**
 * Última parada antes de gastar una corrida.
 *
 * No valida: muestra. Lo que se ve aquí es exactamente lo que el modelo va a recibir, y los
 * huecos aparecen con su consecuencia concreta — "sin estado actual, el plan de migración sale
 * genérico" dice mucho más que un asterisco rojo, y deja la decisión de correr igual en manos
 * de quien sabe si ese dato existe.
 */
export function StepReview({ brief, goToStep }: StepProps) {
  const holes = gaps(brief);
  const drivers = [...brief.qualityAttributes].sort((a, b) => b.weight - a.weight);

  return (
    <div className="space-y-4">
      <StepIntro title="Esto es lo que se va a enviar">
        Nada de lo que falta bloquea la corrida. Lo que sí conviene es saber qué va a tener que suponer el
        análisis, porque cada supuesto queda declarado en el documento final.
      </StepIntro>

      <section className="card p-4">
        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Decisión a tomar</p>
        <h3 className="selectable mt-1 text-[15px] leading-snug font-semibold text-ink">
          {brief.title.trim() || <span className="text-faint italic">sin título todavía</span>}
        </h3>
        {brief.problem.trim() && (
          <p className="selectable mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-muted">{brief.problem}</p>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card p-3.5">
          <h4 className="field-label">Drivers ponderados</h4>
          {drivers.length === 0 ? (
            <p className="text-[12.5px] text-faint">
              Ninguno. Los criterios de la matriz los va a elegir el modelo.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {drivers.map((qa) => (
                <li key={qa.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="truncate text-ink">{qaLabel(qa.id)}</span>
                  <span className="flex shrink-0 gap-0.5" title={`peso ${qa.weight}`}>
                    {[1, 2, 3, 4, 5].map((w) => (
                      <span
                        key={w}
                        className="h-3.5 w-1.5 rounded-sm"
                        style={{ background: qa.weight >= w ? "var(--accent)" : "var(--border)" }}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-3.5">
          <h4 className="field-label">Opciones a evaluar</h4>
          {brief.candidateOptions.length === 0 ? (
            <p className="text-[12.5px] text-faint">Las propone el modelo, más la alternativa más simple.</p>
          ) : (
            <ul className="space-y-1 text-[12.5px] text-ink">
              {brief.candidateOptions.map((o) => (
                <li key={o} className="flex gap-1.5">
                  <span className="text-faint">·</span>
                  <span className="selectable">{o}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] text-faint">
            {brief.deliverables.length} artefactos · {brief.patternFamilies.length} familias de patrones
          </p>
        </section>
      </div>

      {holes.length > 0 && (
        <section className="card p-4">
          <h4 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
            <TriangleAlert size={15} className="text-warning" />
            {holes.length} {holes.length === 1 ? "hueco" : "huecos"} que el análisis va a tener que suponer
          </h4>
          <p className="mb-3 text-[12px] text-faint">
            No son errores: puedes correr igual. Cada supuesto queda declarado en el documento final.
          </p>
          <ul className="space-y-2">
            {holes.map((gap) => (
              <li key={gap.field} className="flex items-start gap-2.5 text-[12.5px]">
                <button
                  className="chip shrink-0 cursor-pointer px-2 py-0.5 text-[11px] hover:chip-on"
                  onClick={() => goToStep(gap.step)}
                >
                  {gap.field}
                </button>
                <span className="text-muted">{gap.consequence}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {holes.length === 0 && (
        <section className="card p-4" style={{ borderColor: "var(--success)" }}>
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-success">
            <Check size={15} /> El brief está completo
          </h4>
          <p className="mt-1 text-[12.5px] text-muted">
            No queda nada que el análisis tenga que inventar. Es lo más cerca que se puede estar de una
            recomendación que no dependa de supuestos.
          </p>
        </section>
      )}
    </div>
  );
}
