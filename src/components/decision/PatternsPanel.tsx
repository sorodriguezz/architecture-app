import { Blocks } from "lucide-react";

import { familyLabel } from "../../lib/parseDecision";
import type { AppliedPattern } from "../../types/domain";
import { EmptyState } from "../common/Ui";

/** Los patrones aplicados, agrupados por familia y en el orden en que el catálogo los presenta. */
const FAMILY_ORDER = [
  "arquitectonico",
  "diseno",
  "resiliencia",
  "concurrencia",
  "datos",
  "integracion",
  "seguridad",
  "despliegue",
];

export function PatternsPanel({ patterns }: { patterns: AppliedPattern[] }) {
  if (patterns.length === 0) {
    return (
      <EmptyState
        icon={<Blocks size={34} />}
        title="Sin patrones estructurados"
        description="El análisis no devolvió la lista en formato estructurado. Revisa la sección «Patrones aplicados» del documento."
      />
    );
  }

  const groups = new Map<string, AppliedPattern[]>();
  for (const p of patterns) {
    const key = p.family || "otros";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]),
  );

  return (
    <div className="space-y-6">
      <p className="text-xs text-faint">
        {patterns.length} patrones aplicados en {ordered.length} famili{ordered.length === 1 ? "a" : "as"}
      </p>

      {ordered.map(([family, items]) => (
        <section key={family}>
          <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink">
            {familyLabel(family)}
            <span className="chip px-1.5 py-0">{items.length}</span>
          </h3>
          <div className="grid gap-2.5 md:grid-cols-2">
            {items.map((p, i) => (
              <article key={`${p.name}-${i}`} className="card p-3.5">
                <h4 className="text-[13.5px] font-semibold text-ink">{p.name}</h4>
                {p.where && (
                  <p className="mt-0.5 text-[11.5px] text-accent-text">
                    <span className="text-faint">en </span>
                    {p.where}
                  </p>
                )}
                <p className="selectable mt-2 text-[12.5px] leading-relaxed text-muted">{p.why}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function order(family: string): number {
  const idx = FAMILY_ORDER.indexOf(family);
  return idx === -1 ? FAMILY_ORDER.length : idx;
}
