import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CornerDownLeft,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { COMPONENTS, COMPONENT_BY_ID, PROVIDERS } from "../../lib/simulation/components";
import { rateAt, simulate, type SimResult, type Stage } from "../../lib/simulation/engine";
import { TOPOLOGIES, stageFrom } from "../../lib/simulation/presets";
import { peakOf, verdict } from "../../lib/simulation/verdict";
import { useSimStore } from "../../state/simStore";
import { BouncingDots, ChoiceCard, StepSection } from "../common/Ui";
import { MiniChart } from "./MiniChart";

/** Los cuatro perfiles, explicados por lo que sirven para descubrir y no por su forma. */
const PROFILES = [
  { id: "constante", label: "Constante", blurb: "Siempre el mismo tráfico. Mide el estado estable." },
  { id: "rampa", label: "Rampa", blurb: "Sube de a poco hasta el pico. Muestra en qué punto se rompe." },
  { id: "pico", label: "Pico", blurb: "Un golpe corto sobre la base. Muestra si se recupera." },
  { id: "diurna", label: "Diurna", blurb: "Sube y baja como un día laboral. Muestra si alcanza a drenar." },
] as const;

const TONE: Record<"ok" | "warn" | "bad", { color: string; soft: string }> = {
  ok: { color: "var(--success)", soft: "var(--success-soft)" },
  warn: { color: "var(--warning)", soft: "var(--warning-soft)" },
  bad: { color: "var(--danger)", soft: "var(--danger-soft)" },
};

/**
 * Simulador de carga.
 *
 * Corre una simulación por eventos discretos sobre la topología que el usuario arma: peticiones
 * individuales que compiten por servidores, hacen cola, se agotan por timeout y se reintentan.
 * Lo que devuelve no es una estimación de costo sino el comportamiento — dónde está el cuello,
 * a qué carga se rompe, y cuánto tarda en drenar después de un pico.
 *
 * La configuración va numerada de arriba abajo y el botón de correr vive en una barra fija:
 * con veinte controles repartidos en tres tarjetas, lo único que no puede quedar sujeto al
 * scroll es la acción que produce el resultado.
 */
export function LoadSimulatorView() {
  const { stages, profile, seed, topologyId, setStages, loadTopology, patchStage, setProfile, setSeed } =
    useSimStore();
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Firma de la configuración con la que se corrió: comparar contra la actual es lo que permite
  // avisar que el resultado en pantalla ya no corresponde a lo que dicen los controles.
  const [ranSignature, setRanSignature] = useState<string | null>(null);

  const signature = useMemo(() => JSON.stringify({ stages, profile, seed }), [stages, profile, seed]);
  const stale = result !== null && ranSignature !== signature;
  const activeTopology = TOPOLOGIES.find((t) => t.id === topologyId) ?? null;

  const run = () => {
    if (stages.length === 0) return;
    setBusy(true);
    // Un horizonte largo puede tomar más de un segundo: se cede el hilo para que el botón alcance
    // a pintarse en estado ocupado antes de bloquear.
    setTimeout(() => {
      setResult(simulate({ stages, profile, seed }));
      setRanSignature(signature);
      setBusy(false);
    }, 20);
  };

  // Una vista de simulador vacía no dice nada: se corre una vez al entrar.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (index: number, delta: number) => {
    const next = [...stages];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setStages(next);
  };

  const addComponent = (componentId: string) => {
    if (!componentId) return;
    setStages([...stages, stageFrom(componentId)]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          {/* -------------------------------------------------------- configuración */}
          <section className="space-y-3.5">
            <StepSection
              n={1}
              title="Elige un caso de partida"
              blurb="Cada uno arma un camino completo y su tráfico. Después puedes cambiar lo que quieras."
              aside={
                <button className="btn btn-ghost px-2 py-1 text-[11.5px]" onClick={() => setPickerOpen((v) => !v)}>
                  {pickerOpen ? "Ocultar" : `Ver los ${TOPOLOGIES.length}`}
                </button>
              }
            >
              {!pickerOpen && (
                <div
                  className="rounded-lg border border-line px-2.5 py-2"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <p className="text-[12.5px] font-semibold text-ink">
                    {activeTopology?.label ?? "Configuración propia"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                    {activeTopology?.description ??
                      "Armaste este camino a mano. Puedes cargar un caso de la lista para empezar de otro lado."}
                  </p>
                </div>
              )}

              {pickerOpen && (
                <div className="space-y-1.5">
                  {TOPOLOGIES.map((t) => (
                    <ChoiceCard
                      key={t.id}
                      selected={t.id === topologyId}
                      title={t.label}
                      blurb={t.description}
                      onClick={() => {
                        loadTopology(t.id);
                        setResult(null);
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}

              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                Cargar un caso reemplaza el camino y el tráfico actuales. La gracia es comparar: corre uno,
                anota el resultado, carga el otro y manda la misma carga.
              </p>
            </StepSection>

            <StepSection
              n={2}
              title="Define cuánto tráfico le vas a mandar"
              blurb="Primero la forma del tráfico, después los números."
            >
              <div className="grid grid-cols-2 gap-1.5">
                {PROFILES.map((p) => (
                  <ChoiceCard
                    key={p.id}
                    selected={profile.kind === p.id}
                    title={p.label}
                    blurb={p.blurb}
                    onClick={() => setProfile({ kind: p.id })}
                  />
                ))}
              </div>

              <div className="mt-3 grid grid-cols-3 items-end gap-2">
                <NumberField
                  label="Normal"
                  unit="req/s"
                  value={profile.baseRps}
                  min={0}
                  onChange={(v) => setProfile({ baseRps: v })}
                />
                <NumberField
                  label="En el pico"
                  unit="req/s"
                  value={profile.peakRps}
                  min={0}
                  onChange={(v) => setProfile({ peakRps: v })}
                  disabled={profile.kind === "constante"}
                />
                <NumberField
                  label="Duración"
                  unit="s"
                  value={profile.horizonSec}
                  min={10}
                  max={900}
                  onChange={(v) => setProfile({ horizonSec: v })}
                />
              </div>

              <div className="mt-3">
                <MiniChart
                  height={70}
                  width={340}
                  series={[
                    {
                      label: "req/s ofrecidos",
                      color: "var(--accent)",
                      fill: true,
                      values: Array.from({ length: 90 }, (_, i) => rateAt(profile, (i / 89) * profile.horizonSec)),
                    },
                  ]}
                  xLabel={`así se ve el tráfico · 0 → ${profile.horizonSec}s`}
                />
              </div>
            </StepSection>

            <StepSection
              n={3}
              title="Revisa el camino de la petición"
              blurb="Se simula en este orden, de arriba abajo. Ábrelas solo si quieres ajustar los números."
              aside={
                stages.length > 0 ? (
                  <button className="btn btn-ghost px-2 py-1 text-[11.5px]" onClick={() => setStages([])}>
                    <RotateCcw size={12} /> vaciar
                  </button>
                ) : undefined
              }
            >
              {stages.length > 0 && <FlowStrip stages={stages} />}

              <div className="space-y-1.5">
                {stages.map((stage, i) => (
                  <StageRow
                    key={stage.id}
                    stage={stage}
                    index={i}
                    total={stages.length}
                    expanded={open === stage.id}
                    onToggle={() => setOpen(open === stage.id ? null : stage.id)}
                    onPatch={(v) => patchStage(stage.id, v)}
                    onMove={(d) => move(i, d)}
                    onRemove={() => setStages(stages.filter((s) => s.id !== stage.id))}
                  />
                ))}
                {stages.length === 0 && (
                  <p className="py-4 text-center text-[12.5px] text-faint">
                    No hay etapas. Agrega la primera abajo, o vuelve al paso 1 y carga un caso.
                  </p>
                )}
              </div>

              <label className="mt-2.5 block">
                <span className="field-label mb-1 flex items-center gap-1 text-[10px]">
                  <Plus size={11} /> agregar una etapa al final
                </span>
                <select className="input cursor-pointer" value="" onChange={(e) => addComponent(e.target.value)}>
                  <option value="">Elige un componente…</option>
                  {PROVIDERS.map((p) => (
                    <optgroup key={p.id} label={p.label}>
                      {COMPONENTS.filter((c) => c.provider === p.id).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} · {c.category}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </StepSection>

            <p className="px-1 text-[11px] leading-relaxed text-faint">
              Los valores por defecto de cada componente son órdenes de magnitud editables, no mediciones de tu
              sistema. Reemplázalos por los tuyos apenas los tengas: el simulador es tan bueno como sus entradas.
            </p>
          </section>

          {/* ----------------------------------------------------------- resultados */}
          <section className="min-w-0 space-y-4">
            {!result ? (
              <div className="card grid h-64 place-items-center px-6 text-center">
                {busy ? (
                  <span className="flex items-center gap-2 text-[13px] text-muted">
                    <BouncingDots /> simulando…
                  </span>
                ) : (
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink">Aquí va a aparecer el resultado</p>
                    <p className="mt-1 text-[12.5px] text-muted">
                      Aprieta <strong className="text-ink">Simular</strong> abajo. No hace falta que entiendas
                      todavía los parámetros: el caso cargado ya funciona.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <Results result={result} peak={peakOf(profile)} verdictOf={verdict(result, profile)} stale={stale} />
            )}
          </section>
        </div>
      </div>

      {/* Barra fija: la acción que produce el resultado no puede depender del scroll. */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-line px-6 py-2.5">
        <button className="btn btn-primary px-5" onClick={run} disabled={busy || stages.length === 0}>
          {busy ? <BouncingDots /> : <Play size={15} />}
          {result ? "Volver a simular" : "Simular"}
        </button>

        <p className="min-w-0 flex-1 text-[11.5px] text-faint">
          {stages.length === 0 ? (
            <span className="text-warning">Agrega al menos una etapa en el paso 3.</span>
          ) : stale ? (
            <span className="text-warning">Cambiaste la configuración — vuelve a simular para actualizar.</span>
          ) : (
            <>
              {stages.length} {stages.length === 1 ? "etapa" : "etapas"} · pico de{" "}
              {Math.round(peakOf(profile)).toLocaleString("es-CL")} req/s · {profile.horizonSec}s simulados
            </>
          )}
        </p>

        <label
          className="flex shrink-0 items-center gap-1.5 text-[11px] text-faint"
          title="Con la misma semilla, la misma configuración da siempre el mismo resultado. Cámbiala para ver otra corrida del mismo escenario."
        >
          semilla
          <input
            type="number"
            className="input w-16 py-1 text-[12px]"
            value={seed}
            min={1}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) setSeed(Math.max(1, next));
            }}
          />
        </label>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * El camino en una línea.
 *
 * La lista de etapas ya está ordenada, pero leerla como lista no deja ver lo que más importa de
 * la topología: dónde deja de esperar el que llamó. La primera cola es ese punto, y marcarlo es
 * la diferencia entre «tarda 900 ms» y «responde en 30 ms y el resto ocurre detrás».
 */
function FlowStrip({ stages }: { stages: Stage[] }) {
  const firstQueue = stages.findIndex((s) => s.mode === "queue");

  return (
    <div
      className="mb-2.5 flex flex-wrap items-center gap-x-1 gap-y-1.5 rounded-lg border border-line px-2.5 py-2"
      style={{ background: "var(--bg-elevated)" }}
    >
      <span className="text-[10.5px] text-faint">petición</span>
      {stages.map((stage, i) => (
        <span key={stage.id} className="flex items-center gap-1">
          <ChevronRight size={11} className="shrink-0 text-faint" />
          <span
            className="max-w-40 truncate rounded px-1.5 py-0.5 text-[11px]"
            style={
              stage.mode === "queue"
                ? { background: "var(--accent-soft)", color: "var(--accent-text)" }
                : { background: "var(--surface)", color: "var(--text-muted)" }
            }
            title={stage.name}
          >
            {stage.name}
          </span>
          {i === firstQueue && (
            <span className="flex items-center gap-0.5 text-[10.5px] text-accent-text" title="Aquí el que llamó ya recibió respuesta; lo que sigue ocurre detrás.">
              <CornerDownLeft size={10} /> responde
            </span>
          )}
        </span>
      ))}
      {firstQueue === -1 && (
        <>
          <ChevronRight size={11} className="shrink-0 text-faint" />
          <span className="flex items-center gap-0.5 text-[10.5px] text-faint">
            <CornerDownLeft size={10} /> respuesta
          </span>
        </>
      )}
    </div>
  );
}

function Results({
  result,
  peak,
  verdictOf,
  stale,
}: {
  result: SimResult;
  peak: number;
  verdictOf: ReturnType<typeof verdict>;
  stale: boolean;
}) {
  const perSec = (n: number) => n / Math.max(result.bucketSec, 0.001);
  const lossPct = result.offered > 0 ? (result.lost / result.offered) * 100 : 0;
  const tone = TONE[verdictOf.level];

  return (
    <>
      {stale && (
        <p
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          Este resultado es de la configuración anterior. Vuelve a simular para verlo actualizado.
        </p>
      )}

      {/* La respuesta primero, en castellano. Los números que la sostienen vienen abajo. */}
      <article className="card p-4" style={{ borderColor: tone.color, background: tone.soft }}>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 shrink-0" style={{ color: tone.color }}>
            {verdictOf.level === "bad" ? (
              <CircleAlert size={18} />
            ) : verdictOf.level === "warn" ? (
              <TriangleAlert size={18} />
            ) : (
              <CircleCheck size={18} />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="text-[14.5px] leading-snug font-semibold" style={{ color: tone.color }}>
              {verdictOf.headline}
            </h3>
            <p className="selectable mt-1 text-[12.5px] leading-relaxed text-ink">{verdictOf.detail}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              <strong className="text-ink">Qué probar ahora: </strong>
              {verdictOf.advice}
            </p>
          </div>
        </div>
      </article>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Respuesta al llamador"
          value={fmtMs(result.respond.p95)}
          sub="p95"
          hint="Lo que espera quien hizo la petición. Si hay una cola en el camino, se corta ahí."
          foot={`p50 ${fmtMs(result.respond.p50)} · p99 ${fmtMs(result.respond.p99)}`}
        />
        <Metric
          label="Extremo a extremo"
          value={fmtMs(result.endToEnd.p95)}
          sub="p95"
          hint="Hasta que la última etapa terminó. Con colas de por medio es bastante más que lo anterior."
          foot={`p50 ${fmtMs(result.endToEnd.p50)} · p99 ${fmtMs(result.endToEnd.p99)}`}
        />
        <Metric
          label="Tráfico perdido"
          value={`${lossPct.toFixed(2)}%`}
          sub={result.bottleneck ? `cuello: ${result.bottleneck}` : ""}
          hint="Peticiones que nunca se completaron: cola llena, timeout o reintentos agotados."
          foot={`${result.completed.toLocaleString("es-CL")} completadas de ${result.offered.toLocaleString("es-CL")}`}
          tone={lossPct > 1 ? "danger" : lossPct > 0.1 ? "warning" : "success"}
        />
      </div>

      {result.capped && (
        <p
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          Se alcanzó el techo de peticiones simuladas y el horizonte quedó truncado. Baja el req/s o el horizonte
          para que el resultado represente la ventana completa.
        </p>
      )}

      {result.diagnoses.length > 0 && (
        <div className="space-y-2">
          <h3 className="field-label mb-0">Qué encontró, en detalle</h3>
          {result.diagnoses.map((d) => (
            <article
              key={d.title}
              className="card flex items-start gap-2.5 p-3.5"
              style={{
                borderColor:
                  d.level === "bad" ? "var(--danger)" : d.level === "warn" ? "var(--warning)" : "var(--success)",
              }}
            >
              <span className="mt-0.5 shrink-0">
                {d.level === "bad" ? (
                  <CircleAlert size={16} className="text-danger" />
                ) : d.level === "warn" ? (
                  <TriangleAlert size={16} className="text-warning" />
                ) : (
                  <CircleCheck size={16} className="text-success" />
                )}
              </span>
              <div className="min-w-0">
                <h4 className="text-[13px] font-semibold text-ink">{d.title}</h4>
                <p className="selectable mt-0.5 text-[12.5px] leading-relaxed text-muted">{d.detail}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="card p-3.5">
        <h3 className="field-label mb-0">Cuánto entró y cuánto salió</h3>
        <p className="mb-2 text-[11.5px] leading-relaxed text-faint">
          Mientras la línea verde siga a la azul, el sistema va al día. Donde se separan, empezó a acumular.
        </p>
        <MiniChart
          series={[
            { label: "ofrecidas", color: "var(--accent)", fill: true, values: result.series.map((p) => perSec(p.arrivals)) },
            { label: "completadas", color: "var(--success)", values: result.series.map((p) => perSec(p.completed)) },
            { label: "perdidas", color: "var(--danger)", values: result.series.map((p) => perSec(p.lost)) },
          ]}
          xLabel={`req/s a lo largo de ${Math.round(result.series.length * result.bucketSec)}s · pico ofrecido ${Math.round(peak).toLocaleString("es-CL")} req/s`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-3.5">
          <h3 className="field-label mb-0">Cuánto tardó</h3>
          <p className="mb-2 text-[11.5px] leading-relaxed text-faint">
            Si sube y no vuelve a bajar, el retraso se está acumulando.
          </p>
          <MiniChart
            height={100}
            width={340}
            series={[{ label: "p95 (ms)", color: "var(--warning)", fill: true, values: result.series.map((p) => p.p95) }]}
            format={(n) => `${Math.round(n)}`}
          />
        </div>
        <div className="card p-3.5">
          <h3 className="field-label mb-0">Cuánto quedó esperando</h3>
          <p className="mb-2 text-[11.5px] leading-relaxed text-faint">
            Tiene que volver a cero antes de que termine: si no, el sistema no alcanzó a drenar.
          </p>
          <MiniChart
            height={100}
            width={340}
            series={[{ label: "peticiones en el sistema", color: "var(--info)", fill: true, values: result.series.map((p) => p.backlog) }]}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-3.5 pt-3.5">
          <h3 className="field-label mb-0">Etapa por etapa</h3>
          <p className="mb-2 text-[11.5px] leading-relaxed text-faint">
            La utilización es la columna que manda: sobre 80% la espera deja de crecer de forma lineal.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                {["Etapa", "Utilización", "Capacidad", "Ofrecido", "Espera p95", "Cola máx.", "Rechazos"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10.5px] font-semibold tracking-wide text-muted uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.stages.map((s) => {
                const lost = s.rejected + s.timedOut;
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.min(100, s.utilization * 100)}%`,
                              background:
                                s.utilization >= 0.95
                                  ? "var(--danger)"
                                  : s.utilization >= 0.8
                                    ? "var(--warning)"
                                    : "var(--success)",
                            }}
                          />
                        </span>
                        {(s.utilization * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{fmtRps(s.capacityRps)}</td>
                    <td className="px-3 py-2 text-muted">{fmtRps(s.offeredRps)}</td>
                    <td className="px-3 py-2 text-muted">{fmtMs(s.waitP95)}</td>
                    <td className="px-3 py-2 text-muted">{s.maxQueueLen.toLocaleString("es-CL")}</td>
                    <td className={`px-3 py-2 ${lost > 0 ? "text-danger" : "text-faint"}`}>
                      {lost.toLocaleString("es-CL")}
                      {s.retried > 0 && <span className="ml-1 text-faint">· {s.retried.toLocaleString("es-CL")} reint.</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-faint">
        Simulación por eventos discretos de {result.offered.toLocaleString("es-CL")} peticiones · {result.elapsedMs} ms
        de cómputo. La capacidad es teórica (servidores ÷ tiempo de servicio); la utilización es la observada.
        «Rechazos» cuenta lo que cada etapa devolvió por cola llena o timeout — no es tráfico perdido mientras los
        reintentos lo recuperen, pero sí es margen ya gastado.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

/** Techo teórico de la etapa en peticiones por segundo, ya descontado el fan-out. */
function ceilingRps(stage: Stage): number {
  const perCall = (stage.replicas * stage.concurrency) / Math.max(stage.serviceMs, 0.001) * 1000;
  return perCall / Math.max(stage.callsPerRequest, 1);
}

function StageRow({
  stage,
  index,
  total,
  expanded,
  onToggle,
  onPatch,
  onMove,
  onRemove,
}: {
  stage: Stage;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (values: Partial<Stage>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const def = COMPONENT_BY_ID.get(stage.componentId);
  const noun = def?.replicaNoun ?? "unidades";

  return (
    <div className="rounded-lg border border-line" style={{ background: "var(--bg-elevated)" }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button className="btn btn-ghost px-1 py-0.5" onClick={onToggle} aria-label="Ver parámetros">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold text-faint"
          style={{ background: "var(--surface)" }}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[12.5px] font-medium text-ink">{stage.name}</span>
            <span
              className="shrink-0 rounded px-1 py-px text-[9.5px] font-semibold tracking-wide uppercase"
              style={
                stage.mode === "queue"
                  ? { background: "var(--accent-soft)", color: "var(--accent-text)" }
                  : { background: "var(--surface)", color: "var(--text-faint)" }
              }
              title={
                stage.mode === "queue"
                  ? "El llamador ya recibió respuesta: esta etapa procesa detrás, a su ritmo."
                  : "El llamador queda esperando hasta que esta etapa termina."
              }
            >
              {stage.mode === "queue" ? "cola" : "espera"}
            </span>
          </span>
          <span className="block truncate text-[10.5px] text-faint">
            {stage.replicas} {noun} × {stage.concurrency} · {stage.serviceMs} ms · techo ≈ {fmtRps(ceilingRps(stage))}
          </span>
        </span>
        <button className="btn btn-ghost px-1 py-0.5" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Subir">
          <ArrowUp size={12} />
        </button>
        <button className="btn btn-ghost px-1 py-0.5" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Bajar">
          <ArrowDown size={12} />
        </button>
        <button className="btn btn-ghost px-1 py-0.5" onClick={onRemove} aria-label="Quitar etapa">
          <Trash2 size={12} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-line px-2.5 py-2.5">
          <label className="block">
            <span className="field-label">Nombre</span>
            <input className="input py-1 text-[12.5px]" value={stage.name} onChange={(e) => onPatch({ name: e.target.value })} />
          </label>

          <div>
            <p className="field-label mb-1.5">¿El llamador espera?</p>
            <div className="flex gap-1.5">
              {(["sync", "queue"] as const).map((m) => (
                <button
                  key={m}
                  className={`chip cursor-pointer ${stage.mode === m ? "chip-on" : ""}`}
                  onClick={() => onPatch({ mode: m })}
                >
                  {m === "sync" ? "Sí, espera la respuesta" : "No, encola y sigue detrás"}
                </button>
              ))}
            </div>
          </div>

          <ParamGroup title="Cuánto puede procesar" hint={`Techo ≈ ${fmtRps(ceilingRps(stage))}`}>
            <NumberField label={noun} value={stage.replicas} min={1} onChange={(v) => onPatch({ replicas: v })} />
            <NumberField label="A la vez c/u" value={stage.concurrency} min={1} onChange={(v) => onPatch({ concurrency: v })} />
            <NumberField label="Tarda" unit="ms" value={stage.serviceMs} min={0.1} step={0.5} onChange={(v) => onPatch({ serviceMs: v })} />
          </ParamGroup>

          <ParamGroup title="Qué hace cuando se satura">
            <NumberField label="Timeout" unit="ms" value={stage.timeoutMs} min={0} step={100} onChange={(v) => onPatch({ timeoutMs: v })} />
            <NumberField label="Cola máx." value={stage.maxQueue} min={0} step={50} onChange={(v) => onPatch({ maxQueue: v })} />
            <NumberField label="Reintentos" value={stage.retries} min={0} max={5} onChange={(v) => onPatch({ retries: v })} />
          </ParamGroup>

          <ParamGroup title="Qué tan irregular es">
            <NumberField label="Variabilidad" value={stage.variability} min={0} max={3} step={0.1} onChange={(v) => onPatch({ variability: v })} />
            <NumberField label="Fallos" unit="%" value={+(stage.failureRate * 100).toFixed(2)} min={0} max={100} step={0.1} onChange={(v) => onPatch({ failureRate: v / 100 })} />
            <NumberField label="Llamadas/pet." value={stage.callsPerRequest} min={1} max={20} onChange={(v) => onPatch({ callsPerRequest: v })} />
          </ParamGroup>

          {def && (
            <p className="border-t border-line pt-2 text-[11.5px] leading-relaxed text-muted">
              <span className="font-semibold text-warning">Lo que limita de verdad: </span>
              {def.limit}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Agrupa los parámetros por la pregunta que responden: nueve campos sueltos no se leen. */
function ParamGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="field-label mb-1.5 flex items-center justify-between gap-2">
        <span>{title}</span>
        {hint && <span className="font-normal normal-case text-faint">{hint}</span>}
      </p>
      <div className="grid grid-cols-3 items-end gap-2">{children}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  foot,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint: string;
  foot: string;
  sub?: string;
  tone?: "ink" | "success" | "warning" | "danger";
}) {
  return (
    <div className="card p-3.5">
      <p className="text-[10.5px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold" style={{ color: tone === "ink" ? "var(--text)" : `var(--${tone})` }}>
          {value}
        </span>
        {sub && <span className="text-[11px] text-faint">{sub}</span>}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{hint}</p>
      <p className="mt-1 border-t border-line pt-1.5 text-[11px] text-faint">{foot}</p>
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label mb-1 text-[10px]">
        {label}
        {unit && <span className="ml-1 font-normal normal-case text-faint">({unit})</span>}
      </span>
      <input
        type="number"
        className="input py-1 text-[12.5px]"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
        }}
      />
    </label>
  );
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const fmtRps = (rps: number) =>
  rps >= 1000 ? `${(rps / 1000).toFixed(1)}k req/s` : `${Math.round(rps).toLocaleString("es-CL")} req/s`;
