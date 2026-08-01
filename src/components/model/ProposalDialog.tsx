import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { KIND_BY_ID, MODEL_KINDS, STATUS_BY_ID } from "../../lib/model";
import { parseModelProposal } from "../../lib/parseModel";
import { useModelStore } from "../../state/modelStore";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import { Modal } from "../common/Ui";

/**
 * Revisión de una propuesta antes de que entre al modelo.
 *
 * Nada de lo que la IA deduce del código o de un documento se guarda solo: el inventario alimenta
 * todas las decisiones futuras, así que un componente inventado se propaga a todo lo que venga
 * después. Aquí se ve pieza por pieza y se aceptan solo las que corresponden.
 */
export function ProposalDialog({
  raw,
  source,
  decisionId = null,
  onClose,
}: {
  /** Texto crudo que devolvió la CLI. `null` cierra el diálogo. */
  raw: string | null;
  source: "scan" | "decision";
  decisionId?: string | null;
  onClose: () => void;
}) {
  const activeId = useProjectStore((s) => s.activeId);
  const acceptProposal = useModelStore((s) => s.acceptProposal);
  const existing = useModelStore((s) => s.elements);
  const toast = useUiStore((s) => s.toast);

  const parsed = useMemo(() => parseModelProposal(raw ?? ""), [raw]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Todo viene marcado: lo normal es aceptar la tanda completa y desmarcar lo que sobra, no al
  // revés. Los nombres que ya están en el modelo se dejan fuera para no duplicar.
  useEffect(() => {
    const known = new Set(existing.map((e) => e.name.trim().toLowerCase()));
    setChosen(
      new Set(
        parsed.elements
          .map((e, i) => (known.has(e.name.trim().toLowerCase()) ? -1 : i))
          .filter((i) => i >= 0),
      ),
    );
    // `existing` cambia al guardar cada pieza; recalcular ahí desmarcaría lo recién aceptado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  const toggle = (index: number) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const save = async () => {
    if (!activeId) return;
    setSaving(true);
    try {
      // El orden importa: los componentes primero, así sus endpoints y entidades encuentran a su
      // padre ya guardado cuando les toca resolver la referencia por nombre.
      const order = new Map(MODEL_KINDS.map((k, i) => [k.id, i]));
      const picked = [...chosen]
        .sort((a, b) => (order.get(parsed.elements[a].kind) ?? 9) - (order.get(parsed.elements[b].kind) ?? 9))
        .map((i) => parsed.elements[i]);

      const saved = await acceptProposal(activeId, picked, source, decisionId);
      toast("success", `${saved} ${saved === 1 ? "pieza agregada" : "piezas agregadas"} al modelo`);
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const known = new Set(existing.map((e) => e.name.trim().toLowerCase()));

  return (
    <Modal
      open={raw !== null}
      title={source === "scan" ? "Lo que encontró en el repositorio" : "Lo que esta decisión le agrega al sistema"}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Descartar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || chosen.size === 0}>
            <Check size={14} /> Agregar {chosen.size} {chosen.size === 1 ? "pieza" : "piezas"}
          </button>
        </>
      }
    >
      {parsed.error && (
        <p
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          {parsed.error} Puedes volver a intentarlo, o agregar las piezas a mano.
        </p>
      )}

      {!parsed.error && parsed.elements.length === 0 && (
        <p className="py-6 text-center text-[13px] text-muted">
          {source === "scan"
            ? "No encontró nada nuevo que agregar. El modelo ya cubre lo que hay en el repositorio."
            : "Esta decisión no cambia la estructura del sistema, así que no hay nada que agregar."}
        </p>
      )}

      {parsed.elements.length > 0 && (
        <>
          <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
            Revisa antes de aceptar: esto pasa a ser el inventario que reciben todas las decisiones que corras
            después. Desmarca lo que no corresponda.
            {parsed.discarded > 0 && (
              <span className="text-faint"> Se descartaron {parsed.discarded} entradas mal formadas.</span>
            )}
          </p>

          <div className="mb-3 flex gap-2">
            <button
              className="btn btn-ghost px-2 py-1 text-[11.5px]"
              onClick={() => setChosen(new Set(parsed.elements.map((_, i) => i)))}
            >
              Marcar todo
            </button>
            <button className="btn btn-ghost px-2 py-1 text-[11.5px]" onClick={() => setChosen(new Set())}>
              Desmarcar todo
            </button>
          </div>

          <div className="space-y-1.5">
            {parsed.elements.map((element, i) => {
              const kind = KIND_BY_ID.get(element.kind);
              const status = STATUS_BY_ID.get(element.status);
              const duplicate = known.has(element.name.trim().toLowerCase());
              const on = chosen.has(i);
              return (
                <button
                  key={`${element.kind}-${element.name}-${i}`}
                  className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-line hover:bg-[var(--surface-hover)]"
                  }`}
                  onClick={() => toggle(i)}
                >
                  <span
                    className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border"
                    style={
                      on
                        ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                        : { borderColor: "var(--border-strong)" }
                    }
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold text-ink">{element.name}</span>
                      <span className="chip px-1.5 py-0 text-[10px]">{kind?.label ?? element.kind}</span>
                      {status && (
                        <span className="text-[10.5px]" style={{ color: `var(${status.tone})` }}>
                          {status.label}
                        </span>
                      )}
                      {duplicate && <span className="text-[10.5px] text-warning">ya existe con ese nombre</span>}
                    </span>
                    {element.summary && (
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{element.summary}</span>
                    )}
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-[10.5px] text-faint">
                      {element.tech && <span>{element.tech}</span>}
                      {element.parent && <span>dentro de {element.parent}</span>}
                      {element.dependsOn.length > 0 && <span>depende de {element.dependsOn.join(", ")}</span>}
                      {element.location && <span className="font-mono">{element.location}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
