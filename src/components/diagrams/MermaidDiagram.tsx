import { Code2, Download, TriangleAlert, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";

import { downloadSvg, renderMermaid } from "../../lib/mermaid";
import { useUiStore } from "../../state/uiStore";
import { BouncingDots } from "../common/Ui";

/**
 * Renderiza un diagrama Mermaid.
 *
 * El código lo escribe un modelo, así que fallar es un caso normal, no excepcional: cuando el
 * SVG no se puede generar se muestra el error de Mermaid junto al código fuente editable, que es
 * exactamente lo que hace falta para arreglarlo — esconder el código dejaría al usuario con un
 * "error" y nada que hacer al respecto.
 */
export function MermaidDiagram({ id, title, code }: { id: string; title: string; code: string }) {
  const theme = useUiStore((s) => s.theme);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void renderMermaid(id, code, theme).then((result) => {
      // Sin esto, un cambio rápido de tema o de diagrama pintaría el resultado de la petición
      // anterior encima del actual.
      if (cancelled) return;
      setSvg(result.svg);
      setError(result.error);
      setLoading(false);
      if (result.error) setShowCode(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, code, theme]);

  return (
    <figure className="card overflow-hidden">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="btn btn-ghost px-1.5 py-1"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            aria-label="Alejar"
            disabled={!svg}
          >
            <ZoomOut size={14} />
          </button>
          <span className="w-10 text-center text-[11px] text-faint">{Math.round(zoom * 100)}%</span>
          <button
            className="btn btn-ghost px-1.5 py-1"
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            aria-label="Acercar"
            disabled={!svg}
          >
            <ZoomIn size={14} />
          </button>
          <button
            className={`btn btn-ghost px-1.5 py-1 ${showCode ? "text-accent-text" : ""}`}
            onClick={() => setShowCode((v) => !v)}
            title="Ver el código Mermaid"
          >
            <Code2 size={14} />
          </button>
          <button
            className="btn btn-ghost px-1.5 py-1"
            onClick={() => svg && downloadSvg(svg, id)}
            disabled={!svg}
            title="Descargar SVG"
          >
            <Download size={14} />
          </button>
        </div>
      </figcaption>

      <div className="overflow-auto px-4 py-5" style={{ background: "var(--bg-elevated)" }}>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-faint">
            <BouncingDots /> dibujando…
          </div>
        )}

        {!loading && error && (
          <div
            className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
            style={{ borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <div className="selectable min-w-0">
              <p className="font-semibold">Mermaid no pudo dibujar este diagrama</p>
              <p className="mt-0.5 break-words whitespace-pre-wrap opacity-90">{error}</p>
              <p className="mt-1 opacity-75">
                Corrige el código abajo y guarda el documento; el diagrama se vuelve a dibujar solo.
              </p>
            </div>
          </div>
        )}

        {!loading && svg && (
          <div
            className="mermaid-host origin-top-left transition-transform"
            style={{ transform: `scale(${zoom})` }}
            // El SVG lo genera Mermaid con `securityLevel: "strict"`, que sanea etiquetas y
            // desactiva scripts dentro del diagrama.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {showCode && (
        <pre
          className="selectable max-h-64 overflow-auto border-t border-line px-4 py-3 font-mono text-[11.5px] whitespace-pre text-muted"
          style={{ background: "var(--bg)" }}
        >
          {code}
        </pre>
      )}
    </figure>
  );
}
