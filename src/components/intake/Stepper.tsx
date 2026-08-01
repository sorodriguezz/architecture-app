import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { StepProgress } from "../../lib/briefStatus";

export interface StepDef {
  label: string;
  icon: LucideIcon;
  /** Qué se captura en este paso, para el tooltip. */
  hint: string;
}

/**
 * Stepper del brief.
 *
 * Cada paso muestra su estado real (`done`) y cuántos de sus campos están llenos, porque el
 * wizard no bloquea el avance: si no dijera qué queda a medias, el usuario llegaría al final
 * sin saber que dejó tres pasos vacíos. La línea entre pasos se pinta hasta donde hay contenido,
 * así el progreso se lee sin contar círculos.
 */
export function Stepper({
  steps,
  progress,
  current,
  onSelect,
}: {
  steps: StepDef[];
  progress: StepProgress[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const done = (i: number) => progress[i]?.done ?? false;

  return (
    <ol className="flex items-start">
      {steps.map((step, i) => {
        const isCurrent = i === current;
        const isDone = done(i);
        const detail = progress[i];

        return (
          <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center" aria-hidden>
              <span
                className="h-0.5 flex-1 rounded-full transition-colors"
                style={{ background: i === 0 ? "transparent" : done(i - 1) ? "var(--accent)" : "var(--border)" }}
              />
              <button
                className="mx-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11.5px] font-bold transition-colors"
                style={
                  isDone
                    ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                    : isCurrent
                      ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-text)" }
                      : { background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-faint)" }
                }
                onClick={() => onSelect(i)}
                tabIndex={-1}
              >
                {isDone ? <Check size={14} strokeWidth={3} /> : i + 1}
              </button>
              <span
                className="h-0.5 flex-1 rounded-full transition-colors"
                style={{
                  background: i === steps.length - 1 ? "transparent" : isDone ? "var(--accent)" : "var(--border)",
                }}
              />
            </div>

            <button
              className={`mt-1.5 flex min-w-0 flex-col items-center gap-0.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--surface-hover)] ${
                isCurrent ? "font-semibold text-accent-text" : "text-muted"
              }`}
              onClick={() => onSelect(i)}
              title={step.hint}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="flex items-center gap-1.5 text-[12.5px]">
                <step.icon size={13} className="shrink-0" />
                <span className="truncate">{step.label}</span>
              </span>
              {detail && detail.total > 0 && (
                <span className="text-[10.5px] text-faint">
                  {detail.filled}/{detail.total}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
