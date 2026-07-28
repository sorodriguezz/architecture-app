import { CircleCheck, DownloadCloud, ExternalLink, KeyRound, Link2, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";

import * as api from "../../lib/tauri/commands";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { BouncingDots, Field } from "../common/Ui";
import { SectionHeader } from "./SettingsView";

export function GitSection() {
  const { gitName, gitEmail, hasGitToken, save, refreshGitToken } = useSettingsStore();
  const { activeId, status, refreshStatus } = useProjectStore();
  const toast = useUiStore((s) => s.toast);

  const [user, setUser] = useState("");
  const [token, setToken] = useState("");
  const [remote, setRemote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const result = await fn();
      toast("success", typeof result === "string" && result ? result : label);
      await refreshStatus();
    } catch (err) {
      toast("error", api.describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Git y publicación"
        description="Los documentos de arquitectura se versionan en el repositorio del proyecto. Aquí se configura la identidad de los commits y las credenciales para publicar."
      />

      {/* credenciales */}
      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          <KeyRound size={15} /> Credenciales
          {hasGitToken && (
            <span className="chip chip-on ml-1 px-1.5 py-0 text-[10.5px]">
              <CircleCheck size={11} /> token guardado
            </span>
          )}
        </h2>
        <p className="mb-3 text-[12.5px] text-muted">
          El token se guarda en el almacén de credenciales del sistema operativo (Credential Manager en Windows,
          Llavero en macOS), nunca en la base de datos ni en un archivo. La app puede comprobar que existe, pero
          no volver a leerlo hacia la interfaz.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Usuario" hint="En GitHub puede ir vacío: se usa x-access-token.">
            <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="tu-usuario" />
          </Field>
          <Field label="Token de acceso personal" hint="Necesita permiso de escritura sobre el repositorio.">
            <input
              className="input font-mono text-[12.5px]"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_…"
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            disabled={!token.trim() || busy}
            onClick={() =>
              void run("Credenciales guardadas", async () => {
                await api.setGitCredentials(user, token);
                setToken("");
                await refreshGitToken();
              })
            }
          >
            Guardar credenciales
          </button>
          <button
            className="btn"
            disabled={!hasGitToken || busy}
            onClick={() =>
              void run("Credenciales borradas", async () => {
                await api.clearGitCredentials();
                await refreshGitToken();
              })
            }
          >
            <Trash2 size={14} /> Borrar
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => void api.openExternal("https://github.com/settings/tokens")}
          >
            Crear token en GitHub <ExternalLink size={13} />
          </button>
        </div>
      </section>

      {/* identidad */}
      <section className="card p-4">
        <h2 className="mb-1 text-[13.5px] font-semibold text-ink">Identidad de los commits</h2>
        <p className="mb-3 text-[12.5px] text-muted">
          Solo se usa cuando el repositorio no tiene su propio <code>user.name</code>/<code>user.email</code>
          configurado — la configuración del repo siempre manda.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input className="input" value={gitName} onChange={(e) => void save("gitName", e.target.value)} placeholder="Tu Nombre" />
          </Field>
          <Field label="Correo">
            <input
              className="input"
              value={gitEmail}
              onChange={(e) => void save("gitEmail", e.target.value)}
              placeholder="tu@correo.com"
            />
          </Field>
        </div>
      </section>

      {/* repositorio del proyecto activo */}
      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          <Link2 size={15} /> Repositorio del proyecto activo
        </h2>
        {!activeId || !status?.isRepo ? (
          <p className="text-[12.5px] text-muted">Abre un proyecto con repositorio git para configurar su remoto.</p>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] text-muted">
              Rama <strong className="text-ink">{status.branch}</strong> ·{" "}
              {status.remoteUrl ? (
                <span className="selectable font-mono text-[11.5px]">{status.remoteUrl}</span>
              ) : (
                <span className="text-warning">sin remoto configurado</span>
              )}
            </p>

            <div className="flex gap-2">
              <input
                className="input font-mono text-[12.5px]"
                placeholder="https://github.com/usuario/repo.git"
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
              />
              <button
                className="btn shrink-0"
                disabled={!remote.trim() || busy}
                onClick={() =>
                  void run("Remoto configurado", async () => {
                    await api.gitSetRemote(activeId, remote);
                    setRemote("");
                  })
                }
              >
                {busy ? <BouncingDots /> : null} Definir remoto
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn"
                disabled={busy || !status.remoteUrl}
                onClick={() => void run("Actualizado", () => api.gitPull(activeId))}
              >
                <DownloadCloud size={14} /> Pull
              </button>
              <button
                className="btn"
                disabled={busy || !status.remoteUrl}
                onClick={() => void run("Publicado", () => api.gitPush(activeId))}
              >
                <UploadCloud size={14} /> Push
              </button>
              <button
                className="btn"
                disabled={busy || status.changed.length === 0}
                onClick={() =>
                  void run("Commit creado", () =>
                    api.gitCommit(activeId, "docs(arquitectura): actualiza documentación"),
                  )
                }
              >
                Commit de todo ({status.changed.length})
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
