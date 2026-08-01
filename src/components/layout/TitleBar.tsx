import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { Maximize2, Minus, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useUiStore } from "../../state/uiStore";
import { Logo } from "../common/Logo";

/**
 * Barra de título propia.
 *
 * En Windows la ventana va sin decoraciones (`decorations: false` en `tauri.conf.json`), así que
 * los botones de minimizar/maximizar/cerrar tienen que existir aquí o la ventana no se puede
 * manejar. En macOS se usan las decoraciones nativas (`tauri.macos.conf.json`) con los semáforos
 * superpuestos, así que ahí solo se deja el espacio para ellos y no se dibujan botones propios.
 */
export function TitleBar() {
  const [isMac, setIsMac] = useState(false);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  useEffect(() => {
    // `platform()` es sincrónico en el plugin v2 pero puede lanzar fuera de Tauri (p. ej. si se
    // abre el dev server en un navegador suelto): no vale la pena tumbar la app por eso.
    try {
      setIsMac(platform() === "macos");
    } catch {
      setIsMac(false);
    }
  }, []);

  const win = () => getCurrentWindow();

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3"
      style={{ background: "var(--bg-elevated)", paddingLeft: isMac ? "5.5rem" : undefined }}
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <Logo size={20} />
        <span data-tauri-drag-region className="text-[13px] font-semibold tracking-tight">
          ArchFlow
        </span>
        <span data-tauri-drag-region className="text-[11px] text-faint">
          decisiones de arquitectura
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="btn btn-ghost px-2 py-1"
          onClick={toggleTheme}
          title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          aria-label="Cambiar tema"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {!isMac && (
          <>
            <button className="btn btn-ghost px-2 py-1" onClick={() => win().minimize()} aria-label="Minimizar">
              <Minus size={15} />
            </button>
            <button
              className="btn btn-ghost px-2 py-1"
              onClick={() => win().toggleMaximize()}
              aria-label="Maximizar"
            >
              <Maximize2 size={13} />
            </button>
            <button
              className="btn btn-ghost px-2 py-1 hover:!bg-[var(--danger)] hover:!text-white"
              onClick={() => win().close()}
              aria-label="Cerrar"
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
