import { CircleAlert, CircleCheck, Cpu, GitBranch, Terminal, UploadCloud } from "lucide-react";
import { useState } from "react";

import * as api from "../../lib/tauri/commands";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { BouncingDots } from "../common/Ui";

export function StatusBar() {
  const { status, activeId, refreshStatus } = useProjectStore();
  const engine = useSettingsStore((s) => s.engine);
  const model = useSettingsStore((s) => s.model);
  const toast = useUiStore((s) => s.toast);
  const logOpen = useUiStore((s) => s.logOpen);
  const setLogOpen = useUiStore((s) => s.setLogOpen);
  const setView = useUiStore((s) => s.setView);
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    if (!activeId) return;
    setPublishing(true);
    try {
      const result = await api.publishDocs(activeId, "docs(arquitectura): actualiza documentación", true);
      toast("success", result);
      await refreshStatus();
    } catch (err) {
      const { message } = api.describeError(err);
      toast("error", message);
    } finally {
      setPublishing(false);
    }
  };

  const dirty = status?.changed.length ?? 0;

  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t border-line px-3 text-[11px] text-muted"
      style={{ background: "var(--bg-elevated)" }}
    >
      <div className="flex items-center gap-3">
        {status?.isRepo ? (
          <>
            <span className="flex items-center gap-1">
              <GitBranch size={11} /> {status.branch}
            </span>
            <span className={dirty > 0 ? "text-warning" : ""}>
              {dirty > 0 ? `${dirty} cambio${dirty === 1 ? "" : "s"} sin publicar` : "sin cambios"}
            </span>
            {status.ahead > 0 && <span className="text-info">↑{status.ahead}</span>}
            {status.behind > 0 && <span className="text-warning">↓{status.behind}</span>}
            {!status.remoteUrl && <span className="text-faint">sin remoto</span>}
          </>
        ) : (
          <span className="text-faint">sin repositorio git</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          className={`flex items-center gap-1 hover:text-ink ${logOpen ? "text-accent-text" : ""}`}
          onClick={() => setLogOpen(!logOpen)}
          title="Ver el log en vivo de la CLI"
        >
          <Terminal size={11} /> log
        </button>

        <button
          className="flex items-center gap-1 hover:text-ink disabled:opacity-50"
          onClick={publish}
          disabled={!status?.isRepo || dirty === 0 || publishing}
          title="Commit + push de los documentos"
        >
          {publishing ? <BouncingDots /> : <UploadCloud size={11} />} publicar
        </button>

        <button
          className="flex items-center gap-1 hover:text-ink"
          onClick={() => setView("settings")}
          title={engine?.available ? `Claude Code: ${engine.detail}` : "Claude Code no encontrado"}
        >
          {engine?.available ? (
            <CircleCheck size={11} className="text-success" />
          ) : (
            <CircleAlert size={11} className="text-danger" />
          )}
          <Cpu size={11} /> {model}
        </button>
      </div>
    </footer>
  );
}
