import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ALL_PATTERNS, PATTERN_FAMILIES } from "../../lib/catalog";
import { EmptyState } from "../common/Ui";

/**
 * Referencia consultable de patrones.
 *
 * Vive en el frontend y no en el prompt porque este es el catálogo que el usuario mira cuando
 * *no* quiere gastar una corrida de IA: buscar qué era exactamente el patrón outbox no debería
 * costar dos minutos de modelo.
 */
export function PatternsView() {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_PATTERNS.filter((p) => {
      if (family && p.family !== family) return false;
      if (!q) return true;
      return `${p.name} ${p.problem} ${p.tradeoff} ${p.familyLabel}`.toLowerCase().includes(q);
    });
  }, [query, family]);

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-6 py-6">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-ink">Catálogo de patrones</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {ALL_PATTERNS.length} patrones en {PATTERN_FAMILIES.length} familias. Cada uno con el problema que
          resuelve y —lo que se olvida— lo que cuesta usarlo.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-6 mb-4 px-6 pt-1 pb-3" style={{ background: "var(--bg)" }}>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-2.5 left-3 text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre, problema o consecuencia…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button className={`chip cursor-pointer ${family === null ? "chip-on" : ""}`} onClick={() => setFamily(null)}>
            Todas
          </button>
          {PATTERN_FAMILIES.map((f) => (
            <button
              key={f.id}
              className={`chip cursor-pointer ${family === f.id ? "chip-on" : ""}`}
              onClick={() => setFamily(family === f.id ? null : f.id)}
              title={f.blurb}
            >
              {f.label} <span className="text-faint">{f.patterns.length}</span>
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState title="Nada coincide con esa búsqueda" description="Prueba con otro término o quita el filtro de familia." />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {results.map((p) => (
            <article key={`${p.family}-${p.name}`} className="card p-3.5">
              <header className="mb-1.5 flex items-start justify-between gap-2">
                <h3 className="text-[13.5px] font-semibold text-ink">{p.name}</h3>
                <span className="chip shrink-0 px-1.5 py-0 text-[10.5px]">{p.familyLabel}</span>
              </header>
              <p className="selectable text-[12.5px] leading-relaxed text-muted">{p.problem}</p>
              <p className="selectable mt-2 border-t border-line pt-2 text-[12px] leading-relaxed text-warning">
                <span className="font-semibold">Costo: </span>
                {p.tradeoff}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
