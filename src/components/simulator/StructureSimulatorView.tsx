import { Folder, FolderOpen, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import {
  LAYOUTS,
  LAYOUT_BY_ID,
  measure,
  snapshotAt,
  timeline,
  toRenderTree,
  type LayoutDef,
  type RenderNode,
} from "../../lib/simulation/structure";
import { useSimStore } from "../../state/simStore";
import { ChoiceCard, StepSection } from "../common/Ui";
import { MiniChart } from "./MiniChart";

const SERIES_COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--info)", "var(--danger)", "var(--text-muted)"];

type MetricKey = "hottest" | "files" | "shared" | "dirs";

const METRICS: {
  id: MetricKey;
  label: string;
  /** Pregunta que responde, para el selector. */
  question: string;
  hint: string;
  /** Si un número más bajo es mejor. En «archivos totales» no lo es: es el mismo trabajo siempre. */
  lowerIsBetter: boolean;
  unit: string;
  pick: (m: ReturnType<typeof measure>) => number;
}[] = [
  {
    id: "hottest",
    label: "Archivos en el peor directorio",
    question: "¿Qué carpeta se vuelve un cajón?",
    hint: "El directorio más cargado es donde se pierde el tiempo buscando. Cuando pasa de ~40 archivos, la carpeta dejó de ser una unidad y pasó a ser un cajón.",
    lowerIsBetter: true,
    unit: "archivos",
    pick: (m) => m.hottestDir.files,
  },
  {
    id: "shared",
    label: "Archivos en carpetas sin dueño único",
    question: "¿Cuánto código queda sin dueño?",
    hint: "Archivos que conviven con los de otros equipos en el mismo directorio. Cada uno tiene su autor, pero la carpeta no tiene dueño: es lo que rompe CODEOWNERS, enruta mal las revisiones y convierte cualquier índice o registro en un conflicto permanente.",
    lowerIsBetter: true,
    unit: "archivos",
    pick: (m) => m.sharedFiles,
  },
  {
    id: "files",
    label: "Archivos totales",
    question: "¿Cuánto pesa el repositorio?",
    hint: "El tamaño bruto del repositorio. Es el mismo trabajo en todas las organizaciones — lo que cambia es dónde queda.",
    lowerIsBetter: false,
    unit: "archivos",
    pick: (m) => m.files,
  },
  {
    id: "dirs",
    label: "Directorios totales",
    question: "¿Cuántas carpetas hay al final?",
    hint: "Más carpetas no es peor por sí solo: el costo aparece cuando hay que atravesarlas para un cambio (ver «carpetas por cambio»).",
    lowerIsBetter: false,
    unit: "directorios",
    pick: (m) => m.dirs,
  },
];

/**
 * Simulador de estructura de directorios.
 *
 * Proyecta cómo envejece cada organización de carpetas a medida que el proyecto crece, y muestra
 * el árbol resultante en el mes elegido. La comparación es el punto: todas las organizaciones se
 * ven bien con seis módulos, y lo que las distingue solo aparece a los dos años. Por eso la vista
 * va en pasos — describir el crecimiento, elegir qué comparar, leer el resultado — y no como un
 * panel de parámetros donde no se sabe cuál mover primero.
 */
export function StructureSimulatorView() {
  const { growth, layoutIds, month, setGrowth, setLayoutIds, setMonth } = useSimStore();
  const [metric, setMetric] = useState<MetricKey>("hottest");
  const [detail, setDetail] = useState<string>(layoutIds[0] ?? LAYOUTS[0].id);

  const selected = useMemo(
    () => layoutIds.map((id) => LAYOUT_BY_ID.get(id)).filter((l): l is LayoutDef => Boolean(l)),
    [layoutIds],
  );

  const timelines = useMemo(() => selected.map((l) => ({ layout: l, points: timeline(l, growth) })), [selected, growth]);

  const snap = snapshotAt(growth, month);
  const finalSnap = snapshotAt(growth, growth.months);
  const detailLayout = LAYOUT_BY_ID.get(detail) ?? LAYOUTS[0];
  const detailTree = useMemo(() => detailLayout.build(snap, growth), [detailLayout, snap, growth]);
  const detailMetrics = useMemo(() => measure(detailTree, detailLayout), [detailTree, detailLayout]);
  const rendered = useMemo(() => toRenderTree(detailTree), [detailTree]);

  const active = METRICS.find((m) => m.id === metric) ?? METRICS[0];

  // El resultado en una línea: cuál queda mejor y cuál peor al final del horizonte. Sin esto hay
  // que leer un gráfico de seis series para responder la única pregunta que se vino a hacer.
  const ranking = useMemo(() => {
    const ends = timelines
      .flatMap((t) => {
        const end = t.points[t.points.length - 1];
        return end ? [{ label: t.layout.label, value: active.pick(end.metrics) }] : [];
      })
      .sort((a, b) => a.value - b.value);
    return ends.length >= 2 ? { best: ends[0], worst: ends[ends.length - 1] } : null;
  }, [timelines, active]);

  const toggleLayout = (id: string) =>
    setLayoutIds(layoutIds.includes(id) ? layoutIds.filter((x) => x !== id) : [...layoutIds, id]);

  return (
    <div className="h-full space-y-4 overflow-y-auto px-6 py-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------- parámetros */}
        <div className="space-y-3.5">
          <StepSection
            n={1}
            title="Describe cómo crece tu proyecto"
            blurb="Con estos números se proyecta el repositorio mes a mes. Si no los sabes, los de ejemplo sirven para comparar."
          >
            <div className="grid grid-cols-2 gap-2">
              <Num label="Módulos hoy" value={growth.startFeatures} min={1} max={60} onChange={(v) => setGrowth({ startFeatures: v })} />
              <Num label="Nuevos por trimestre" value={growth.featuresPerQuarter} min={0} max={20} step={0.5} onChange={(v) => setGrowth({ featuresPerQuarter: v })} />
              <Num label="Archivos por módulo" value={growth.filesPerFeature} min={3} max={80} onChange={(v) => setGrowth({ filesPerFeature: v })} />
              <Num label="Equipos" value={growth.teams} min={1} max={20} onChange={(v) => setGrowth({ teams: v })} />
              <Num label="Hasta qué mes" value={growth.months} min={6} max={120} step={6} onChange={(v) => setGrowth({ months: v })} />
            </div>
            <p
              className="mt-2.5 rounded-lg px-2.5 py-2 text-[11.5px] leading-relaxed text-muted"
              style={{ background: "var(--bg-elevated)" }}
            >
              Con esto, en el mes {growth.months} tendrías{" "}
              <strong className="text-ink">{finalSnap.features} módulos</strong> y del orden de{" "}
              <strong className="text-ink">
                {(finalSnap.features * growth.filesPerFeature).toLocaleString("es-CL")} archivos
              </strong>{" "}
              repartidos entre {growth.teams} {growth.teams === 1 ? "equipo" : "equipos"}.
            </p>
          </StepSection>

          <StepSection
            n={2}
            title="Elige qué organizaciones comparar"
            blurb="Marca dos o tres. Comparar es el punto: sola, cualquiera se ve razonable."
            aside={
              <span className="text-[11px] text-faint">
                {layoutIds.length}/{LAYOUTS.length}
              </span>
            }
          >
            <div className="space-y-1.5">
              {LAYOUTS.map((l) => {
                const index = selected.findIndex((s) => s.id === l.id);
                return (
                  <ChoiceCard
                    key={l.id}
                    selected={index >= 0}
                    title={l.label}
                    blurb={l.blurb}
                    // El color es el mismo con el que sale en el gráfico: es lo que permite leerlo
                    // sin volver a la leyenda cada vez.
                    badge={
                      index >= 0 ? (
                        <span
                          className="h-1 w-5 shrink-0 rounded-full"
                          style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
                          aria-hidden
                        />
                      ) : undefined
                    }
                    onClick={() => toggleLayout(l.id)}
                  />
                );
              })}
            </div>
          </StepSection>
        </div>

        {/* ---------------------------------------------------------- gráfico */}
        <StepSection
          n={3}
          title="Lee cómo envejece cada una"
          blurb="Todas arrancan parecidas: la diferencia aparece con los meses."
          aside={
            <select
              className="input w-64 cursor-pointer py-1 text-[12px]"
              value={metric}
              aria-label="Qué mirar"
              onChange={(e) => setMetric(e.target.value as MetricKey)}
            >
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.question}
                </option>
              ))}
            </select>
          }
        >
          {timelines.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-faint">
              Marca al menos una organización en el paso 2 para ver la proyección.
            </p>
          ) : (
            <>
              {ranking && active.lowerIsBetter && (
                <p
                  className="mb-3 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed text-ink"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  En el mes {growth.months}, <strong>{ranking.best.label}</strong> es la que mejor aguanta esta
                  métrica ({ranking.best.value.toLocaleString("es-CL")} {active.unit}) y{" "}
                  <strong>{ranking.worst.label}</strong> la que peor (
                  {ranking.worst.value.toLocaleString("es-CL")} {active.unit}).
                </p>
              )}

              <p className="mb-1.5 text-[12px] font-semibold text-ink">
                {active.label}
                {active.lowerIsBetter && <span className="ml-1.5 font-normal text-faint">— más abajo es mejor</span>}
              </p>
              <MiniChart
                height={170}
                series={timelines.map((t, i) => ({
                  label: t.layout.label,
                  color: SERIES_COLORS[i % SERIES_COLORS.length],
                  values: t.points.map((p) => active.pick(p.metrics)),
                }))}
                xLabel={`mes 0 → ${growth.months} · ${finalSnap.features} módulos al final`}
              />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">{active.hint}</p>
            </>
          )}

          {timelines.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <p className="mb-1.5 text-[11.5px] text-faint">Cómo queda cada una en el mes {growth.months}:</p>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr style={{ background: "var(--bg-elevated)" }}>
                    {["Organización", "Peor dir.", "Sin dueño", "Carpetas/cambio", "Profundidad", "Con dueño"].map((h) => (
                      <th key={h} className="px-2.5 py-2 text-left text-[10px] font-semibold tracking-wide text-muted uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timelines.map((t, i) => {
                    const end = t.points[t.points.length - 1]?.metrics;
                    if (!end) return null;
                    return (
                      <tr key={t.layout.id} className="border-t border-line">
                        <td className="px-2.5 py-2">
                          <button
                            className={`flex items-center gap-1.5 text-left font-medium ${detail === t.layout.id ? "text-accent-text" : "text-ink hover:underline"}`}
                            title="Ver su árbol de carpetas abajo"
                            onClick={() => setDetail(t.layout.id)}
                          >
                            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                            {t.layout.label}
                          </button>
                        </td>
                        <td className={`px-2.5 py-2 ${end.hottestDir.files > 40 ? "text-danger" : "text-muted"}`}>
                          {end.hottestDir.files} <span className="text-faint">en {end.hottestDir.path.split("/").filter(Boolean).slice(-1)[0]}/</span>
                        </td>
                        <td className="px-2.5 py-2 text-muted">{end.sharedFiles.toLocaleString("es-CL")}</td>
                        <td className={`px-2.5 py-2 ${end.scatter >= 5 ? "text-warning" : "text-muted"}`}>{end.scatter}</td>
                        <td className="px-2.5 py-2 text-muted">{end.maxDepth}</td>
                        <td className={`px-2.5 py-2 ${end.ownership < 0.5 ? "text-warning" : "text-muted"}`}>
                          {Math.round(end.ownership * 100)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </StepSection>
      </div>

      {/* ------------------------------------------------------------- detalle */}
      <StepSection
        n={4}
        title="Mira cómo se vería el repositorio"
        blurb="Elige una organización y un mes: el árbol es el que tendrías en ese momento."
        aside={
          <label className="flex items-center gap-2 text-[11.5px] text-muted">
            mes {Math.min(month, growth.months)} · {snap.features} módulos
            <input
              type="range"
              min={0}
              max={growth.months}
              step={1}
              value={Math.min(month, growth.months)}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-44 cursor-pointer accent-[var(--accent)]"
              aria-label="Mes a mostrar"
            />
          </label>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={`chip cursor-pointer ${detail === l.id ? "chip-on" : ""}`}
              onClick={() => setDetail(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="min-w-0">
            <div
              className="selectable overflow-x-auto rounded-lg border border-line p-3 font-mono text-[11.5px] leading-relaxed"
              style={{ background: "var(--bg-elevated)" }}
            >
              <Tree node={rendered} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-faint">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: "var(--warning)" }} /> carpeta sin dueño
                único
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: "var(--danger)" }} /> más de 40 archivos
              </span>
            </p>
          </div>

          <div className="space-y-2.5">
            <Stat label="Archivos" value={detailMetrics.files.toLocaleString("es-CL")} />
            <Stat label="Directorios" value={detailMetrics.dirs.toLocaleString("es-CL")} />
            <Stat
              label="Con dueño de carpeta"
              value={`${Math.round(detailMetrics.ownership * 100)}%`}
              hint={`${detailMetrics.sharedFiles.toLocaleString("es-CL")} archivos en carpetas compartidas`}
              tone={detailMetrics.ownership < 0.5 ? "warning" : undefined}
            />
            <Stat
              label="Peor directorio"
              value={`${detailMetrics.hottestDir.files} archivos`}
              hint={detailMetrics.hottestDir.path}
              tone={detailMetrics.hottestDir.files > 40 ? "danger" : undefined}
            />
            <Stat
              label="Directorio más ancho"
              value={`${detailMetrics.widestDir.children} subcarpetas`}
              hint={detailMetrics.widestDir.path}
              tone={detailMetrics.widestDir.children > 30 ? "warning" : undefined}
            />
            <Stat label="Carpetas por cambio" value={String(detailMetrics.scatter)} hint="Un cambio típico de un módulo" />

            <div className="card p-3" style={{ borderColor: "var(--warning)" }}>
              <h4 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-warning">
                <TriangleAlert size={13} /> Qué rompe «{detailLayout.label}»
              </h4>
              <p className="text-[12px] leading-relaxed text-muted">{detailLayout.breaks}</p>
            </div>
            <div className="card p-3">
              <h4 className="mb-1 text-[12px] font-semibold text-success">Cuándo es la correcta</h4>
              <p className="text-[12px] leading-relaxed text-muted">{detailLayout.fits}</p>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          El modelo reparte los archivos de cada módulo según la organización elegida; «carpetas por cambio» y
          «archivos compartidos» salen de esa misma repartición. Son proyecciones sobre supuestos explícitos, no
          mediciones: ajusta archivos por módulo y ritmo de crecimiento a los de tu proyecto para que sirvan.
        </p>
      </StepSection>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tree({ node }: { node: RenderNode }) {
  return (
    <div style={{ paddingLeft: node.depth === 0 ? 0 : 14 }}>
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        {node.children.length > 0 ? (
          <FolderOpen size={12} className="shrink-0 text-faint" />
        ) : (
          <Folder size={12} className="shrink-0 text-faint" />
        )}
        <span className={node.shared ? "text-warning" : "text-ink"}>{node.name}</span>
        {node.files > 0 && (
          <span className={node.files > 40 ? "text-danger" : "text-faint"}>
            {node.files} {node.files === 1 ? "archivo" : "archivos"}
          </span>
        )}
      </div>
      {node.children.map((child, i) => (
        <Tree key={`${child.name}-${i}`} node={child} />
      ))}
      {node.hidden > 0 && (
        <div style={{ paddingLeft: 14 }} className="text-faint">
          … y {node.hidden} más
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" | "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <span className="text-[11.5px] text-muted">{label}</span>
      <span className="min-w-0 text-right">
        <span className="block text-[13px] font-semibold" style={{ color: tone ? `var(--${tone})` : "var(--text)" }}>
          {value}
        </span>
        {hint && <span className="block truncate font-mono text-[10px] text-faint">{hint}</span>}
      </span>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="field-label mb-1 text-[10px]">{label}</span>
      <input
        type="number"
        className="input py-1 text-[12.5px]"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
        }}
      />
    </label>
  );
}
