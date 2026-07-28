import { CircleHelp, ShieldAlert } from "lucide-react";

import type { DecisionMeta, Risk } from "../../types/domain";
import { EmptyState } from "../common/Ui";

const LEVEL_WEIGHT: Record<string, number> = { alto: 3, alta: 3, medio: 2, media: 2, bajo: 1, baja: 1 };

function levelTone(level: string): { bg: string; fg: string } {
  switch (LEVEL_WEIGHT[level?.toLowerCase()] ?? 0) {
    case 3:
      return { bg: "var(--danger-soft)", fg: "var(--danger)" };
    case 2:
      return { bg: "var(--warning-soft)", fg: "var(--warning)" };
    default:
      return { bg: "var(--success-soft)", fg: "var(--success)" };
  }
}

/** Severidad = impacto × probabilidad. Es lo que ordena la tabla: primero lo que puede doler. */
function severity(risk: Risk): number {
  return (LEVEL_WEIGHT[risk.impact?.toLowerCase()] ?? 1) * (LEVEL_WEIGHT[risk.probability?.toLowerCase()] ?? 1);
}

function Level({ value }: { value: string }) {
  const tone = levelTone(value);
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {value || "—"}
    </span>
  );
}

export function RisksPanel({ meta }: { meta: DecisionMeta }) {
  const risks = [...meta.risks].sort((a, b) => severity(b) - severity(a));
  const hasSideNotes = meta.assumptions.length > 0 || meta.openQuestions.length > 0;

  if (risks.length === 0 && !hasSideNotes) {
    return (
      <EmptyState
        icon={<ShieldAlert size={34} />}
        title="Sin riesgos registrados"
        description="El análisis no devolvió riesgos estructurados. Revisa la sección «Riesgos y mitigaciones» del documento."
      />
    );
  }

  return (
    <div className="space-y-6">
      {risks.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                {["ID", "Riesgo", "Impacto", "Probabilidad", "Mitigación"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="selectable">
              {risks.map((r, i) => (
                <tr key={r.id || i} className="border-t border-line align-top">
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-faint">{r.id}</td>
                  <td className="px-3 py-2.5 font-medium text-ink">{r.title}</td>
                  <td className="px-3 py-2.5">
                    <Level value={r.impact} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Level value={r.probability} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Los supuestos son la parte que más se ignora y la que más caro sale: van bien visibles. */}
      {meta.assumptions.length > 0 && (
        <section className="card p-4" style={{ borderColor: "var(--warning)" }}>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-warning">
            <CircleHelp size={15} /> Supuestos que se hicieron
          </h3>
          <ul className="selectable space-y-1 text-[12.5px] text-muted">
            {meta.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-warning">·</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11.5px] text-faint">
            Si alguno de estos supuestos es falso, la recomendación cambia. Confírmalos antes de ejecutar.
          </p>
        </section>
      )}

      {meta.openQuestions.length > 0 && (
        <section className="card p-4">
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Preguntas abiertas</h3>
          <ul className="selectable space-y-1 text-[12.5px] text-muted">
            {meta.openQuestions.map((q, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-faint">?</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
