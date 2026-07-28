import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { useDecisionStore } from "../../state/decisionStore";
import { useUiStore } from "../../state/uiStore";

/**
 * Log en vivo de la CLI.
 *
 * Existe porque un análisis puede tardar varios minutos y sin esto la app parece congelada. Cada
 * línea es un evento JSON de `--output-format stream-json`, así que se muestra crudo: quien lo
 * abre está diagnosticando, y una versión "bonita" escondería justo el detalle que busca.
 */
export function RunLogPanel() {
  const open = useUiStore((s) => s.logOpen);
  const setOpen = useUiStore((s) => s.setLogOpen);
  const log = useDecisionStore((s) => s.log);
  const running = useDecisionStore((s) => s.runId !== null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll solo mientras corre: después el usuario quiere leer, no perseguir el final.
  useEffect(() => {
    if (open && running) endRef.current?.scrollIntoView({ block: "end" });
  }, [log.length, open, running]);

  if (!open) return null;

  return (
    <aside
      className="flex w-96 shrink-0 flex-col border-l border-line"
      style={{ background: "var(--bg-elevated)" }}
    >
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="flex items-center gap-2 text-[12px] font-semibold">
          Log de la corrida
          {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--info)]" />}
        </h3>
        <button className="btn btn-ghost px-1.5 py-0.5" onClick={() => setOpen(false)} aria-label="Cerrar log">
          <X size={14} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {log.length === 0 ? (
          <p className="text-xs text-faint">
            Sin actividad todavía. Al ejecutar un análisis aparecerá aquí lo que la CLI va haciendo.
          </p>
        ) : (
          <pre className="selectable font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted">
            {log.join("\n")}
          </pre>
        )}
        <div ref={endRef} />
      </div>
    </aside>
  );
}
