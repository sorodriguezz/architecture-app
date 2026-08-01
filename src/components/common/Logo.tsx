/**
 * La marca, servida desde `public/archflow.svg`.
 *
 * Es un `<img>` y no un SVG inline a propósito: ese archivo lo genera `scripts/gen_icons.mjs`
 * junto con los iconos del instalador, así que referenciarlo garantiza que el logo de la app y
 * el del escritorio nunca se separen. No usa variables de tema porque es una marca: sus colores
 * son los mismos en claro y en oscuro.
 */
export function Logo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/archflow.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}
