import { CircleAlert, CircleCheck, Copy, ExternalLink, RefreshCw } from "lucide-react";

import * as api from "../../lib/tauri/commands";
import { useSettingsStore, type ToolsMode } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { Field } from "../common/Ui";
import { SectionHeader } from "./SettingsView";

const TOOL_MODES: { id: ToolsMode; label: string; description: string }[] = [
  {
    id: "read",
    label: "Solo lectura (recomendado)",
    description: "El modelo puede leer y buscar en el repositorio para conocer el stack real, pero no modificar nada.",
  },
  {
    id: "write",
    label: "Lectura y escritura",
    description: "Además puede crear y editar archivos. Útil para que deje los .md directamente en el repo.",
  },
  {
    id: "none",
    label: "Sin herramientas",
    description: "Solo el brief que le entregues. Más rápido y barato, pero decide a ciegas sobre el código.",
  },
];

const INSTALL_COMMAND = "npm install -g @anthropic-ai/claude-code";

export function EngineSection() {
  const { binary, model, toolsMode, autoCommit, engine, models, checking, save, checkEngine } = useSettingsStore();
  const toast = useUiStore((s) => s.toast);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Motor de IA"
        description="ArchFlow ejecuta Claude Code en modo headless como subproceso. No hay claves de API: usa la sesión que ya tienes en la CLI."
      />

      {/* estado del binario */}
      <div
        className="card p-4"
        style={{ borderColor: engine?.available ? "var(--success)" : "var(--danger)" }}
      >
        <div className="flex items-start gap-3">
          {engine?.available ? (
            <CircleCheck size={18} className="mt-0.5 shrink-0 text-success" />
          ) : (
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink">
              {engine?.available ? "Claude Code detectado" : "Claude Code no encontrado"}
            </p>
            <p className="selectable mt-0.5 truncate font-mono text-[11.5px] text-muted" title={engine?.detail}>
              {engine?.detail ?? "…"}
            </p>
            {engine?.version && <p className="mt-0.5 text-[11.5px] text-faint">versión {engine.version}</p>}

            {!engine?.available && (
              <div className="mt-3 space-y-2">
                <p className="text-[12.5px] text-muted">Instálalo y vuelve a comprobar:</p>
                <div className="flex items-center gap-2">
                  <code className="selectable flex-1 rounded px-2 py-1.5 font-mono text-[12px]" style={{ background: "var(--bg-elevated)" }}>
                    {INSTALL_COMMAND}
                  </code>
                  <button
                    className="btn shrink-0 px-2 py-1.5"
                    onClick={() => {
                      void navigator.clipboard.writeText(INSTALL_COMMAND);
                      toast("success", "Comando copiado");
                    }}
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <button
                  className="btn btn-ghost px-0 text-[12.5px] text-accent-text"
                  onClick={() => void api.openExternal("https://docs.claude.com/en/docs/claude-code/setup")}
                >
                  Ver la guía de instalación <ExternalLink size={12} />
                </button>
              </div>
            )}
          </div>
          <button className="btn shrink-0" onClick={() => void checkEngine()} disabled={checking}>
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> Comprobar
          </button>
        </div>
      </div>

      <Field
        label="Ruta o nombre del ejecutable"
        hint="Déjalo en «claude» salvo que lo tengas en una ruta no estándar. ArchFlow también busca en los directorios típicos de instalación."
      >
        <input
          className="input font-mono text-[12.5px]"
          value={binary}
          onChange={(e) => void save("binary", e.target.value)}
          placeholder="claude"
        />
      </Field>

      <Field
        label="Modelo"
        hint="Puedes escribir cualquier id: se pasa tal cual a --model. Un alias como «opus» siempre apunta a la última versión."
      >
        <input
          className="input font-mono text-[12.5px]"
          value={model}
          onChange={(e) => void save("model", e.target.value)}
          list="archflow-models"
        />
        <datalist id="archflow-models">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.description}
            </option>
          ))}
        </datalist>
      </Field>

      <div className="flex flex-wrap gap-1.5">
        {models.map((m) => (
          <button
            key={m.id}
            className={`chip cursor-pointer ${model === m.id ? "chip-on" : ""}`}
            title={m.description}
            onClick={() => void save("model", m.id)}
          >
            {m.id}
          </button>
        ))}
      </div>

      <div>
        <span className="field-label">Acceso al repositorio</span>
        <div className="space-y-1.5">
          {TOOL_MODES.map((m) => (
            <button
              key={m.id}
              className={`card w-full p-3 text-left transition-colors hover:bg-[var(--surface-hover)] ${
                toolsMode === m.id ? "!border-[var(--accent)]" : ""
              }`}
              onClick={() => void save("toolsMode", m.id)}
            >
              <p className={`text-[13px] ${toolsMode === m.id ? "font-semibold text-accent-text" : "font-medium text-ink"}`}>
                {m.label}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">{m.description}</p>
            </button>
          ))}
        </div>
      </div>

      <label className="card flex cursor-pointer items-start gap-3 p-3.5">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={autoCommit}
          onChange={(e) => void save("autoCommit", e.target.checked)}
        />
        <span>
          <span className="block text-[13px] font-medium text-ink">Guardar y commitear automáticamente</span>
          <span className="mt-0.5 block text-[12px] text-muted">
            Al terminar un análisis, escribe el ADR en <code>docs/architecture/</code> y hace commit. El push
            sigue siendo manual.
          </span>
        </span>
      </label>
    </div>
  );
}
