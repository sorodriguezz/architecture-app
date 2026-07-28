import { FolderOpen, Save } from "lucide-react";
import { useEffect, useState } from "react";

import * as api from "../../lib/tauri/commands";
import { useActiveProject, useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import { EmptyState, Field } from "../common/Ui";
import { SectionHeader } from "./SettingsView";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#0ea5e9", "#eab308", "#ef4444"];

export function ProjectSection() {
  const project = useActiveProject();
  const update = useProjectStore((s) => s.update);
  const toast = useUiStore((s) => s.toast);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [context, setContext] = useState("");

  useEffect(() => {
    setName(project?.name ?? "");
    setColor(project?.color ?? COLORS[0]);
    setContext(project?.context ?? "");
  }, [project?.id, project?.name, project?.color, project?.context]);

  if (!project) {
    return (
      <div>
        <SectionHeader title="Proyecto" description="Ajustes del proyecto abierto." />
        <EmptyState icon={<FolderOpen size={34} />} title="No hay proyecto abierto" />
      </div>
    );
  }

  const save = async () => {
    try {
      await update(project.id, name.trim() || project.name, color, context);
      toast("success", "Proyecto actualizado");
    } catch (err) {
      toast("error", api.describeError(err).message);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Proyecto" description="Identidad y contexto permanente del proyecto abierto." />

      <Field label="Nombre">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <div>
        <span className="field-label">Color</span>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              className="h-7 w-7 rounded-full transition-transform hover:scale-110"
              style={{ background: c, outline: c === color ? "2px solid var(--text)" : "none", outlineOffset: 2 }}
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
            />
          ))}
        </div>
      </div>

      <Field
        label="Contexto permanente"
        hint="Se antepone a TODOS los análisis de este proyecto. Aquí va lo que no cambia entre decisiones: stack, políticas de la organización, restricciones de plataforma, convenciones."
      >
        <textarea
          className="input h-48 resize-none text-[13px]"
          placeholder={`Ej:\n- Todo corre en Azure (App Service + Azure SQL). No hay Kubernetes ni se aprobará este año.\n- El equipo es de 6 personas, fuerte en .NET, sin experiencia en sistemas distribuidos.\n- Los datos personales deben residir en Chile por la Ley 19.628.\n- Preferimos soluciones gestionadas antes que operar infraestructura propia.`}
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </Field>

      <div className="flex items-center justify-between">
        <span className="selectable font-mono text-[11.5px] text-faint">{project.path}</span>
        <div className="flex gap-2">
          <button className="btn" onClick={() => void api.revealInFileManager(project.path)}>
            <FolderOpen size={14} /> Abrir carpeta
          </button>
          <button className="btn btn-primary" onClick={save}>
            <Save size={14} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
