import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useUiStore, type Toast } from "../../state/uiStore";

/** Tres puntos que laten: indica trabajo en curso sin fingir una barra de progreso que no existe. */
export function BouncingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`dot-pulse inline-flex items-center gap-1 ${className}`} aria-hidden>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

/**
 * Paso numerado dentro de una vista de configuración.
 *
 * Los simuladores tienen muchos controles y ningún orden evidente entre ellos: numerarlos es lo
 * que convierte una pantalla de parámetros sueltos en algo que se puede recorrer de arriba abajo
 * sin saber de antemano qué hace cada campo.
 */
export function StepSection({
  n,
  title,
  blurb,
  aside,
  children,
}: {
  n: number;
  title: string;
  blurb?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-3.5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            {n}
          </span>
          <div className="min-w-0">
            <h3 className="text-[13.5px] leading-snug font-semibold text-ink">{title}</h3>
            {blurb && <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{blurb}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * Opción seleccionable que muestra su descripción en vez de esconderla en un `title`.
 *
 * Reemplaza a los `<select>` y a las hileras de chips donde la diferencia entre las opciones era
 * justo lo que había que leer para elegir bien.
 */
export function ChoiceCard({
  selected,
  title,
  blurb,
  badge,
  onClick,
}: {
  selected: boolean;
  title: string;
  blurb?: string;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-line bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={`text-[12.5px] font-semibold ${selected ? "text-accent-text" : "text-ink"}`}>{title}</span>
        {badge}
      </span>
      {blurb && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{blurb}</span>}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  // Escape cierra el diálogo: en una app de escritorio es lo que la gente intenta primero.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${width} overflow-hidden`}
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button className="btn btn-ghost px-2 py-1" onClick={onClose} aria-label="Cerrar">
            <X size={15} />
          </button>
        </header>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

const TOAST_STYLE: Record<Toast["kind"], { icon: ReactNode; bg: string; fg: string }> = {
  info: { icon: <Info size={15} />, bg: "var(--accent-soft)", fg: "var(--accent-text)" },
  success: { icon: <CheckCircle2 size={15} />, bg: "var(--success-soft)", fg: "var(--success)" },
  warning: { icon: <AlertTriangle size={15} />, bg: "var(--warning-soft)", fg: "var(--warning)" },
  error: { icon: <XCircle size={15} />, bg: "var(--danger-soft)", fg: "var(--danger)" },
};

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[min(26rem,calc(100vw-2.5rem))] flex-col gap-2">
      {toasts.map((t) => {
        const style = TOAST_STYLE[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="card pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5"
            style={{ background: style.bg, borderColor: style.fg, boxShadow: "var(--shadow-panel)" }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: style.fg }}>
              {style.icon}
            </span>
            <p className="selectable flex-1 text-[13px] break-words whitespace-pre-wrap" style={{ color: style.fg }}>
              {t.message}
            </p>
            <button
              className="btn btn-ghost shrink-0 px-1 py-0.5"
              onClick={() => dismiss(t.id)}
              aria-label="Descartar"
              style={{ color: style.fg }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Barra 0-100 con etiqueta — usada para confianza y puntajes ponderados. */
export function Meter({ value, max = 100, tone = "accent" }: { value: number; max?: number; tone?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `var(--${tone})` }} />
    </div>
  );
}
