import { FolderOpen, Plug, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import * as api from "../../lib/tauri/commands";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import type { McpServer } from "../../types/domain";
import { EmptyState, Field, Modal } from "../common/Ui";
import { SectionHeader } from "./SettingsView";

/** Presets de servidores MCP habituales, para no partir de una pantalla en blanco. */
const PRESETS: { label: string; values: Partial<McpServer> }[] = [
  {
    label: "Filesystem",
    values: { name: "filesystem", transport: "stdio", command: "npx", args: "-y\n@modelcontextprotocol/server-filesystem\n." },
  },
  {
    label: "Fetch (web)",
    values: { name: "fetch", transport: "stdio", command: "npx", args: "-y\n@modelcontextprotocol/server-fetch" },
  },
  {
    label: "PostgreSQL",
    values: {
      name: "postgres",
      transport: "stdio",
      command: "npx",
      args: "-y\n@modelcontextprotocol/server-postgres",
      env: "DATABASE_URL=postgresql://usuario:clave@host:5432/base",
    },
  },
  { label: "HTTP remoto", values: { name: "remoto", transport: "http", command: "https://mcp.ejemplo.com/sse" } },
];

const BLANK: McpServer = {
  id: "",
  projectId: "",
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  env: "",
  enabled: true,
  createdAt: "",
};

export function McpSection() {
  const activeId = useProjectStore((s) => s.activeId);
  const toast = useUiStore((s) => s.toast);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [editing, setEditing] = useState<McpServer | null>(null);

  const refresh = useCallback(async () => {
    if (!activeId) return setServers([]);
    try {
      setServers(await api.listMcpServers(activeId));
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  }, [activeId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!editing || !activeId) return;
    try {
      await api.upsertMcpServer({ ...editing, projectId: activeId });
      setEditing(null);
      await refresh();
      toast("success", "Servidor MCP guardado");
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  };

  if (!activeId) {
    return (
      <div>
        <SectionHeader title="Servidores MCP" description="Los MCP se configuran por proyecto." />
        <EmptyState icon={<FolderOpen size={34} />} title="Abre un proyecto para configurar sus MCP" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Servidores MCP"
        description="Dan al modelo acceso a datos externos durante el análisis: bases de datos, documentación interna, APIs. Se pasan a la CLI con --mcp-config solo los que estén habilitados."
      />

      <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK, projectId: activeId })}>
        <Plus size={15} /> Agregar servidor
      </button>

      {servers.length === 0 ? (
        <EmptyState
          icon={<Plug size={34} />}
          title="Sin servidores MCP"
          description="Sin MCP el análisis se basa solo en el brief y en lo que pueda leer del repositorio."
        />
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <div key={s.id} className="card flex items-center gap-3 p-3.5">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={async (e) => {
                  await api.upsertMcpServer({ ...s, enabled: e.target.checked });
                  await refresh();
                }}
              />
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(s)}>
                <p className="truncate text-[13.5px] font-medium text-ink">
                  {s.name} <span className="chip ml-1 px-1.5 py-0 text-[10.5px]">{s.transport}</span>
                </p>
                <p className="truncate font-mono text-[11.5px] text-faint">
                  {s.command} {s.args.split("\n").filter(Boolean).join(" ")}
                </p>
              </button>
              <button
                className="btn btn-ghost shrink-0 px-1.5 py-1"
                onClick={async () => {
                  await api.deleteMcpServer(s.id);
                  await refresh();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        title={editing?.id ? "Editar servidor MCP" : "Nuevo servidor MCP"}
        onClose={() => setEditing(null)}
        width="max-w-xl"
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!editing?.name.trim() || !editing?.command.trim()}>
              Guardar
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            {!editing.id && (
              <div>
                <span className="field-label">Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      className="chip cursor-pointer"
                      onClick={() => setEditing({ ...editing, ...p.values } as McpServer)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Field label="Nombre" required hint="Como lo verá el modelo.">
              <input
                className="input font-mono text-[12.5px]"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>

            <Field label="Transporte">
              <div className="flex gap-1.5">
                {(["stdio", "http", "sse"] as const).map((t) => (
                  <button
                    key={t}
                    className={`chip cursor-pointer ${editing.transport === t ? "chip-on" : ""}`}
                    onClick={() => setEditing({ ...editing, transport: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={editing.transport === "stdio" ? "Comando" : "URL"}
              required
              hint={editing.transport === "stdio" ? "Ejecutable a lanzar, p. ej. npx o uvx." : "Endpoint del servidor MCP."}
            >
              <input
                className="input font-mono text-[12.5px]"
                value={editing.command}
                onChange={(e) => setEditing({ ...editing, command: e.target.value })}
              />
            </Field>

            {editing.transport === "stdio" && (
              <Field label="Argumentos" hint="Uno por línea.">
                <textarea
                  className="input h-24 resize-none font-mono text-[12.5px]"
                  value={editing.args}
                  onChange={(e) => setEditing({ ...editing, args: e.target.value })}
                />
              </Field>
            )}

            <Field
              label={editing.transport === "stdio" ? "Variables de entorno" : "Cabeceras"}
              hint="CLAVE=valor, una por línea. Ojo: esto se guarda en la base de datos local, no en el keychain."
            >
              <textarea
                className="input h-20 resize-none font-mono text-[12.5px]"
                value={editing.env}
                onChange={(e) => setEditing({ ...editing, env: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
