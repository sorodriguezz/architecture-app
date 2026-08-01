import { Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { useMemo } from "react";

import { ALL_PATTERNS, PATTERN_FAMILIES, QUALITY_ATTRIBUTES, qaLabel, qaShort } from "../../lib/catalog";
import { useUiStore } from "../../state/uiStore";
import { EmptyState } from "../common/Ui";

/**
 * Referencia consultable de patrones.
 *
 * Vive en el frontend y no en el prompt porque este es el catálogo que el usuario mira cuando
 * *no* quiere gastar una corrida de IA: buscar qué era exactamente el patrón outbox no debería
 * costar dos minutos de modelo.
 *
 * El filtro por driver es lo que lo convierte en herramienta de decisión: se entra por "necesito
 * resiliencia" y se sale con los patrones que la dan y con lo que cada uno cobra a cambio. El
 * estado del filtro vive en `uiStore` porque el wizard navega hasta acá ya filtrado.
 */
export function PatternsView() {
  const { query, family, driver } = useUiStore((s) => s.patternsFilter);
  const setFilter = useUiStore((s) => s.setPatternsFilter);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_PATTERNS.filter((p) => {
      if (family && p.family !== family) return false;
      if (driver && !p.drivers.includes(driver)) return false;
      if (!q) return true;
      return `${p.name} ${p.problem} ${p.tradeoff} ${p.familyLabel}`.toLowerCase().includes(q);
    });
  }, [query, family, driver]);

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-6 py-6">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-ink">Catálogo de patrones</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {ALL_PATTERNS.length} patrones en {PATTERN_FAMILIES.length} familias. Cada uno con el problema que
          resuelve, lo que cuesta usarlo y qué atributos de calidad mueve en cada dirección.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-6 mb-4 px-6 pt-1 pb-3" style={{ background: "var(--bg)" }}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute top-2.5 left-3 text-faint" />
            <input
              className="input pl-9"
              placeholder="Buscar por nombre, problema o consecuencia…"
              value={query}
              onChange={(e) => setFilter({ query: e.target.value })}
            />
          </div>
          <select
            className="input w-56 shrink-0 cursor-pointer"
            value={driver ?? ""}
            onChange={(e) => setFilter({ driver: e.target.value || null })}
            aria-label="Filtrar por atributo de calidad"
          >
            <option value="">Empuja: cualquier driver</option>
            {QUALITY_ATTRIBUTES.map((qa) => (
              <option key={qa.id} value={qa.id}>
                Empuja: {qa.short}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            className={`chip cursor-pointer ${family === null ? "chip-on" : ""}`}
            onClick={() => setFilter({ family: null })}
          >
            Todas
          </button>
          {PATTERN_FAMILIES.map((f) => (
            <button
              key={f.id}
              className={`chip cursor-pointer ${family === f.id ? "chip-on" : ""}`}
              onClick={() => setFilter({ family: family === f.id ? null : f.id })}
              title={f.blurb}
            >
              {f.label} <span className="text-faint">{f.patterns.length}</span>
            </button>
          ))}
        </div>

        {driver && (
          <p className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
            <span>
              {results.length} {results.length === 1 ? "patrón empuja" : "patrones empujan"}{" "}
              <strong className="text-ink">{qaLabel(driver)}</strong>
            </span>
            <button className="btn btn-ghost px-1.5 py-0.5" onClick={() => setFilter({ driver: null })}>
              <X size={12} /> quitar
            </button>
          </p>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState
          title="Nada coincide con esa búsqueda"
          description="Prueba con otro término o quita alguno de los filtros."
        />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {results.map((p) => (
            <article key={`${p.family}-${p.name}`} className="card flex flex-col p-3.5">
              <header className="mb-1.5 flex items-start justify-between gap-2">
                <h3 className="text-[13.5px] font-semibold text-ink">{p.name}</h3>
                <span className="chip shrink-0 px-1.5 py-0 text-[10.5px]">{p.familyLabel}</span>
              </header>
              <p className="selectable text-[12.5px] leading-relaxed text-muted">{p.problem}</p>
              <p className="selectable mt-2 border-t border-line pt-2 text-[12px] leading-relaxed text-warning">
                <span className="font-semibold">Costo: </span>
                {p.tradeoff}
              </p>

              {(p.drivers.length > 0 || p.costs.length > 0) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-[10.5px]">
                  {p.drivers.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1">
                      <TrendingUp size={12} className="shrink-0 text-success" />
                      {p.drivers.map((d) => (
                        <button
                          key={d}
                          className="chip cursor-pointer px-1.5 py-0 text-[10.5px] hover:chip-on"
                          onClick={() => setFilter({ driver: d })}
                          title={`Ver todos los patrones que empujan ${qaLabel(d)}`}
                        >
                          {qaShort(d)}
                        </button>
                      ))}
                    </span>
                  )}
                  {p.costs.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1">
                      <TrendingDown size={12} className="shrink-0 text-danger" />
                      {p.costs.map((c) => (
                        <span key={c} className="chip px-1.5 py-0 text-[10.5px] text-faint">
                          {qaShort(c)}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
