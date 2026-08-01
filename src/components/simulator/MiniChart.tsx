/**
 * Gráfico de líneas mínimo, en SVG y sin dependencias.
 *
 * El proyecto no trae una librería de gráficos y no vale la pena sumar 200 KB para dibujar tres
 * series de 120 puntos. Todo el color sale de las variables del tema, así que funciona igual en
 * claro y en oscuro.
 */
export interface ChartSeries {
  label: string;
  /** Variable CSS del tema, p. ej. `var(--accent)`. */
  color: string;
  values: number[];
  /** Rellena bajo la línea: útil para la serie de referencia. */
  fill?: boolean;
}

export function MiniChart({
  series,
  height = 120,
  xLabel,
  format = (n: number) => String(Math.round(n)),
  width = 640,
}: {
  series: ChartSeries[];
  height?: number;
  xLabel?: string;
  format?: (n: number) => string;
  /**
   * Ancho del viewBox. El SVG se estira al contenedor sin conservar proporción, así que en una
   * columna angosta un viewBox de 640 aplasta las etiquetas hasta volverlas ilegibles: hay que
   * bajarlo a algo parecido al ancho real.
   */
  width?: number;
}) {
  const pad = { top: 8, right: 8, bottom: 16, left: 40 };
  const points = Math.max(...series.map((s) => s.values.length), 1);
  const max = Math.max(1, ...series.flatMap((s) => s.values));

  const x = (i: number) => pad.left + (i / Math.max(1, points - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => height - pad.bottom - (v / max) * (height - pad.top - pad.bottom);

  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" preserveAspectRatio="none">
        {/* tres referencias horizontales: sin ejes completos, pero con escala legible */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={f === 0 ? undefined : "3 3"}
            />
            <text x={0} y={y(max * f) + 3} fontSize={9} fill="var(--text-faint)">
              {format(max * f)}
            </text>
          </g>
        ))}

        {series.map((s) =>
          s.fill ? (
            <path
              key={`${s.label}-fill`}
              d={`${path(s.values)} L ${x(s.values.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
              fill={s.color}
              opacity={0.12}
            />
          ) : null,
        )}
        {series.map((s) => (
          <path
            key={s.label}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {xLabel && <span className="ml-auto text-faint">{xLabel}</span>}
      </figcaption>
    </figure>
  );
}
