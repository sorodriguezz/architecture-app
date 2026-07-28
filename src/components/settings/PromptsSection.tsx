import { RotateCcw, Save, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import * as api from "../../lib/tauri/commands";
import { SettingKey } from "../../lib/tauri/commands";
import { useUiStore } from "../../state/uiStore";
import { SectionHeader } from "./SettingsView";

type Kind = "system" | "decision" | "refine" | "review" | "diagram";

const PROMPTS: { kind: Kind; key: string; label: string; description: string; warn?: boolean }[] = [
  {
    kind: "system",
    key: SettingKey.promptSystem,
    label: "Persona y método",
    description: "Quién es el modelo y cómo razona. Se envía con --append-system-prompt en cada corrida.",
  },
  {
    kind: "decision",
    key: SettingKey.promptDecision,
    label: "Análisis de decisión",
    description: "El pedido principal. Define el contrato de salida que la app parsea.",
    warn: true,
  },
  {
    kind: "refine",
    key: SettingKey.promptRefine,
    label: "Refinamiento",
    description: "Las preguntas de seguimiento sobre una decisión ya generada.",
  },
  {
    kind: "review",
    key: SettingKey.promptReview,
    label: "Auditoría de documento",
    description: "La revisión de un documento de arquitectura existente.",
  },
  {
    kind: "diagram",
    key: SettingKey.promptDiagram,
    label: "Generación de diagrama",
    description: "El botón «Diagramar algo más».",
  },
];

export function PromptsSection() {
  const [active, setActive] = useState<Kind>("decision");
  const [value, setValue] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const toast = useUiStore((s) => s.toast);

  const meta = PROMPTS.find((p) => p.kind === active)!;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [saved, fallback] = await Promise.all([api.getSetting(meta.key), api.defaultPrompt(active)]);
      if (cancelled) return;
      setOriginal(fallback);
      setValue(saved && saved.trim() ? saved : fallback);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, meta.key]);

  const save = async () => {
    // Guardar exactamente el default equivale a no tener personalización: se limpia la clave para
    // que futuras mejoras del prompt de fábrica lleguen solas.
    const toStore = value.trim() === original.trim() ? "" : value;
    await api.setSetting(meta.key, toStore);
    toast("success", toStore ? "Prompt personalizado guardado" : "Se restauró el prompt de fábrica");
  };

  const isCustom = value.trim() !== original.trim();

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        title="Prompts"
        description="Las instrucciones que ArchFlow le da al modelo. Puedes ajustarlas a tu contexto; se guardan por instalación, no por proyecto."
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {PROMPTS.map((p) => (
          <button
            key={p.kind}
            className={`chip cursor-pointer ${active === p.kind ? "chip-on" : ""}`}
            onClick={() => setActive(p.kind)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="mb-2 text-[12.5px] text-muted">{meta.description}</p>

      {meta.warn && isCustom && (
        <p
          className="mb-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          Este prompt define el formato de salida que la app parsea. Si quitas el bloque{" "}
          <code>```json archflow</code> o los encabezados de sección, la matriz de trade-off y los diagramas
          dejarán de aparecer (el documento en prosa sigue funcionando).
        </p>
      )}

      <textarea
        className="input min-h-[26rem] flex-1 resize-none font-mono text-[12px] leading-relaxed"
        value={loading ? "cargando…" : value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
        spellCheck={false}
      />

      <footer className="mt-3 flex items-center justify-between">
        <span className="text-[11.5px] text-faint">
          {isCustom ? "Personalizado" : "Usando el prompt de fábrica"} · {value.length.toLocaleString("es-CL")} caracteres
        </span>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setValue(original)} disabled={!isCustom}>
            <RotateCcw size={14} /> Restaurar original
          </button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            <Save size={14} /> Guardar
          </button>
        </div>
      </footer>
    </div>
  );
}
