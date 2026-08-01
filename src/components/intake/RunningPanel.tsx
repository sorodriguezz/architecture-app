import { Check, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { RUN_STAGES, formatElapsed, reduceRun } from "../../lib/runProgress";
import { useUiStore } from "../../state/uiStore";
import { Logo } from "../common/Logo";
import { BouncingDots } from "../common/Ui";

/**
 * Lo que se ve mientras corre el análisis.
 *
 * Antes esto era el volcado crudo del stream, que responde "sigue vivo" pero no "en qué va".
 * Ahora muestra la etapa estimada y la actividad real (qué archivo está leyendo, cuánto lleva
 * escrito). La etapa se rotula como **estimada** porque lo es: la CLI no anuncia fases, se
 * deduce de lo que emite. Fingir un porcentaje exacto sería mentir sobre algo que dura minutos.
 */
export function RunningPanel({ log, onCancel, title }: { log: string[]; onCancel: () => void; title: string }) {
  const [elapsed, setElapsed] = useState(0);
  const setLogOpen = useUiStore((s) => s.setLogOpen);
  const progress = useMemo(() => reduceRun(log), [log]);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="relative grid h-16 w-16 place-items-center">
          {/* El pulso es redondo porque la marca ya no trae placa: sigue la silueta del lazo. */}
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-20"
            style={{ background: "var(--accent)" }}
          />
          <Logo size={56} className="relative" />
        </div>
        <h2 className="max-w-lg text-base font-semibold text-ink">{title || "Analizando la decisión"}</h2>
        <p className="flex items-center gap-2 font-mono text-[12px] text-faint">
          {formatElapsed(elapsed)}
          {progress.model && <span className="chip px-1.5 py-0 font-sans text-[10.5px]">{progress.model}</span>}
        </p>
      </header>

      {/* Etapas: la actual late, las anteriores quedan marcadas. */}
      <ol className="w-full max-w-xl space-y-0.5">
        {RUN_STAGES.map((stage, i) => {
          const done = i < progress.stage;
          const current = i === progress.stage;
          return (
            <li key={stage.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center self-stretch">
                <span
                  className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${
                    current ? "animate-pulse" : ""
                  }`}
                  style={
                    done
                      ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                      : current
                        ? { background: "var(--accent-soft)", borderColor: "var(--accent)" }
                        : { background: "var(--bg-elevated)", borderColor: "var(--border)" }
                  }
                >
                  {done && <Check size={11} strokeWidth={3} />}
                </span>
                {i < RUN_STAGES.length - 1 && (
                  <span
                    className="w-0.5 flex-1 rounded-full"
                    style={{ background: done ? "var(--accent)" : "var(--border)" }}
                  />
                )}
              </div>
              <div className="min-w-0 pb-3.5">
                <p className={`text-[13px] ${current ? "font-semibold text-ink" : done ? "text-muted" : "text-faint"}`}>
                  {stage.label}
                </p>
                {current && <p className="text-[11.5px] text-muted">{stage.hint}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="w-full max-w-xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {progress.tools.map((t) => (
            <span key={t.name} className="chip px-2 py-0.5 text-[11px]">
              {t.name}
              <span className="text-faint">×{t.count}</span>
            </span>
          ))}
          {progress.written > 0 && (
            <span className="chip px-2 py-0.5 text-[11px]">
              {progress.written.toLocaleString("es-CL")} caracteres escritos
            </span>
          )}
        </div>

        <p className="truncate text-center font-mono text-[11.5px] text-faint">
          {progress.lastAction ? (
            <>
              <span className="text-accent-text">{progress.lastAction.name}</span>
              {progress.lastAction.detail && ` · ${progress.lastAction.detail}`}
            </>
          ) : (
            <span className="inline-flex items-center gap-2">
              <BouncingDots /> iniciando la CLI…
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn" onClick={() => setLogOpen(true)}>
          <Terminal size={14} /> Ver el log crudo
        </button>
        <button className="btn" onClick={onCancel}>
          <Trash2 size={14} /> Cancelar análisis
        </button>
      </div>

      <p className="max-w-md text-center text-[11.5px] text-faint">
        Las etapas son una estimación a partir de lo que la CLI va emitiendo — no un porcentaje real. Puedes
        cambiar de vista sin interrumpir la corrida.
      </p>
    </div>
  );
}
