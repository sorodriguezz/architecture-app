import { Check, Minus, TrendingUp } from "lucide-react";

import { maxScore, weightedScore } from "../../lib/parseDecision";
import type { DecisionMeta } from "../../types/domain";
import { EmptyState, Meter } from "../common/Ui";

/** Colorea la celda por puntaje: la matriz se tiene que poder leer de un vistazo. */
function scoreTone(score: number): { bg: string; fg: string } {
  if (score >= 5) return { bg: "var(--success-soft)", fg: "var(--success)" };
  if (score >= 4) return { bg: "color-mix(in oklab, var(--success-soft) 60%, transparent)", fg: "var(--success)" };
  if (score === 3) return { bg: "var(--warning-soft)", fg: "var(--warning)" };
  return { bg: "var(--danger-soft)", fg: "var(--danger)" };
}

export function TradeOffMatrix({ meta }: { meta: DecisionMeta }) {
  const { criteria, options } = meta;

  if (criteria.length === 0 || options.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={34} />}
        title="Sin matriz estructurada"
        description="El análisis no devolvió criterios y opciones en formato estructurado. La comparación en prosa sigue disponible en la pestaña Documento."
      />
    );
  }

  const totals = options.map((o) => weightedScore(o, criteria));
  const best = maxScore(criteria);
  const winner = totals.indexOf(Math.max(...totals));

  return (
    <div className="space-y-5">
      {/* la recomendación, arriba y grande: es la razón por la que se abre esta pestaña */}
      <div
        className="card p-4"
        style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-accent-text uppercase">Recomendación</p>
            <p className="selectable mt-1 text-[15px] leading-snug font-semibold text-ink">{meta.decision}</p>
          </div>
          <div className="w-28 shrink-0 text-right">
            <p className="text-[11px] text-muted">confianza</p>
            <p className="text-xl font-bold text-ink">{meta.confidence}%</p>
            <Meter value={meta.confidence} tone={meta.confidence >= 70 ? "success" : "warning"} />
          </div>
        </div>
      </div>

      {/* matriz */}
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted uppercase"
                style={{ background: "var(--bg-elevated)" }}
              >
                Criterio
              </th>
              <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-muted">Peso</th>
              {options.map((o) => (
                <th
                  key={o.id}
                  className="min-w-36 px-3 py-2.5 text-left"
                  style={{ background: o.recommended ? "var(--accent-soft)" : "var(--bg-elevated)" }}
                >
                  <span className="flex items-center gap-1.5">
                    {o.recommended && <Check size={13} className="shrink-0 text-accent-text" />}
                    <span className={`text-[12.5px] ${o.recommended ? "font-bold text-accent-text" : "font-semibold text-ink"}`}>
                      {o.name}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td
                  className="sticky left-0 z-10 px-3 py-2 font-medium text-ink"
                  style={{ background: "var(--surface)" }}
                >
                  {c.label}
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="chip px-1.5 py-0.5">×{c.weight}</span>
                </td>
                {options.map((o) => {
                  const score = Number(o.scores?.[c.id]) || 0;
                  const tone = scoreTone(score);
                  return (
                    <td key={o.id} className="px-3 py-2">
                      {score > 0 ? (
                        <span
                          className="inline-flex h-6 w-8 items-center justify-center rounded font-semibold"
                          style={{ background: tone.bg, color: tone.fg }}
                          title={`${score} de 5 · aporta ${score * c.weight} puntos`}
                        >
                          {score}
                        </span>
                      ) : (
                        <Minus size={13} className="text-faint" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2" style={{ borderColor: "var(--border-strong)" }}>
              <td className="sticky left-0 z-10 px-3 py-3 font-bold text-ink" style={{ background: "var(--surface)" }}>
                Total ponderado
              </td>
              <td />
              {options.map((o, i) => (
                <td key={o.id} className="px-3 py-3">
                  <span className={`text-base font-bold ${i === winner ? "text-accent-text" : "text-ink"}`}>
                    {totals[i]}
                  </span>
                  <span className="ml-1 text-[11px] text-faint">
                    / {best} · {best > 0 ? Math.round((totals[i] / best) * 100) : 0}%
                  </span>
                  <Meter value={totals[i]} max={best} tone={i === winner ? "accent" : "border-strong"} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* pros y contras por opción */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {options.map((o) => (
          <article
            key={o.id}
            className="card p-3.5"
            style={o.recommended ? { borderColor: "var(--accent)" } : undefined}
          >
            <header className="mb-2 flex items-start justify-between gap-2">
              <h4 className="text-[13.5px] font-semibold text-ink">{o.name}</h4>
              {o.recommended && <span className="chip chip-on shrink-0">recomendada</span>}
            </header>
            <p className="selectable mb-3 text-[12.5px] text-muted">{o.summary}</p>

            <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
              {o.costLevel && <span className="chip">costo: {o.costLevel}</span>}
              {o.opsComplexity && <span className="chip">ops: {o.opsComplexity}</span>}
              {o.timeToMarket && <span className="chip">TTM: {o.timeToMarket}</span>}
            </div>

            {o.pros.length > 0 && (
              <>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-success uppercase">A favor</p>
                <ul className="selectable mb-3 space-y-0.5 text-[12.5px] text-muted">
                  {o.pros.map((p, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-success">+</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {o.cons.length > 0 && (
              <>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-danger uppercase">En contra</p>
                <ul className="selectable space-y-0.5 text-[12.5px] text-muted">
                  {o.cons.map((c, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-danger">−</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
