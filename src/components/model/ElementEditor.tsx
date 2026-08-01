import { Save, X } from "lucide-react";
import { useState } from "react";

import { KIND_BY_ID, MODEL_STATUSES, dependencyIds, toDependsOn } from "../../lib/model";
import { useModelStore } from "../../state/modelStore";
import { useUiStore } from "../../state/uiStore";
import type { ModelElement } from "../../types/domain";
import { Field, Modal } from "../common/Ui";

/**
 * Alta y edición de una pieza del modelo.
 *
 * Los campos van en el orden en que alguien los sabe: qué es, en qué estado está, con qué está
 * hecho, de qué depende. `parentId` y `dependsOn` se eligen de lo que ya existe y nunca se
 * escriben libres — una referencia a un nombre que no existe dibujaría una flecha a la nada.
 */
export function ElementEditor({ element, onClose }: { element: ModelElement | null; onClose: () => void }) {
  const elements = useModelStore((s) => s.elements);
  const save = useModelStore((s) => s.save);
  const toast = useUiStore((s) => s.toast);
  const [draft, setDraft] = useState<ModelElement | null>(element);
  const [saving, setSaving] = useState(false);

  // El diálogo se monta con `key` en el padre, así que el estado arranca del elemento recibido.
  const current = draft ?? element;
  if (!current) return null;

  const kind = KIND_BY_ID.get(current.kind);
  const patch = (values: Partial<ModelElement>) => setDraft({ ...current, ...values });

  const components = elements.filter((e) => e.kind === "component" && e.id !== current.id);
  const linkable = elements.filter((e) => e.id !== current.id && e.kind !== "debt");
  const deps = dependencyIds(current);

  const toggleDep = (id: string) =>
    patch({ dependsOn: toDependsOn(deps.includes(id) ? deps.filter((d) => d !== id) : [...deps, id]) });

  const submit = async () => {
    if (!current.name.trim()) return;
    setSaving(true);
    try {
      await save(current);
      toast("success", current.id ? "Pieza actualizada" : "Pieza agregada al modelo");
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`${current.id ? "Editar" : "Agregar"} ${kind?.label.toLowerCase() ?? "pieza"}`}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !current.name.trim()}>
            <Save size={14} /> Guardar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {kind && (
          <p className="rounded-lg px-3 py-2 text-[12px] leading-relaxed text-muted" style={{ background: "var(--bg-elevated)" }}>
            {kind.blurb} <span className="text-faint">Ej: {kind.example}</span>
          </p>
        )}

        <Field label="Nombre" required hint={current.kind === "endpoint" ? "Incluye el verbo: POST /api/ordenes" : undefined}>
          <input
            className="input"
            value={current.name}
            onChange={(e) => patch({ name: e.target.value })}
            autoFocus
          />
        </Field>

        <Field label="Qué es y de qué se hace cargo" hint="Una línea. Es lo que va a leer el análisis de la próxima decisión.">
          <textarea
            className="input h-16 resize-none"
            value={current.summary}
            onChange={(e) => patch({ summary: e.target.value })}
          />
        </Field>

        <div>
          <span className="field-label">Estado</span>
          <div className="flex flex-wrap gap-1.5">
            {MODEL_STATUSES.map((s) => (
              <button
                key={s.id}
                className={`chip cursor-pointer ${current.status === s.id ? "chip-on" : ""}`}
                title={s.hint}
                onClick={() => patch({ status: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tecnología" hint="El lenguaje, el motor, el protocolo.">
            <input className="input" value={current.tech} onChange={(e) => patch({ tech: e.target.value })} />
          </Field>
          <Field label="Dueño" hint="Equipo o persona a cargo.">
            <input className="input" value={current.owner} onChange={(e) => patch({ owner: e.target.value })} />
          </Field>
        </div>

        {kind?.nested && (
          <Field label="Pertenece a" hint="El componente del que cuelga.">
            <select
              className="input cursor-pointer"
              value={current.parentId ?? ""}
              onChange={(e) => patch({ parentId: e.target.value || null })}
            >
              <option value="">Sin componente</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div>
          <span className="field-label">De qué depende</span>
          <p className="mb-1.5 text-[11.5px] text-faint">
            Son las flechas del diagrama de contexto. Marca solo lo que de verdad llama o consume.
          </p>
          {linkable.length === 0 ? (
            <p className="text-[12px] text-faint">Todavía no hay otras piezas que enlazar.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {linkable.map((e) => (
                <button
                  key={e.id}
                  className={`chip cursor-pointer ${deps.includes(e.id) ? "chip-on" : ""}`}
                  onClick={() => toggleDep(e.id)}
                >
                  {e.name}
                  {deps.includes(e.id) && <X size={11} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Dónde vive" hint="Ruta dentro del repositorio, si aplica.">
          <input
            className="input font-mono text-[12.5px]"
            placeholder="src/Pagos"
            value={current.location}
            onChange={(e) => patch({ location: e.target.value })}
          />
        </Field>

        <Field label="Notas" hint="SLA, qué pasa si se cae, por qué está así. Lo que no cabe en el resumen.">
          <textarea
            className="input h-20 resize-none"
            value={current.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
