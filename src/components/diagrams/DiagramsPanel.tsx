import { Shapes, Wand2 } from "lucide-react";
import { useState } from "react";

import { extractDiagrams } from "../../lib/parseDecision";
import * as api from "../../lib/tauri/commands";
import { newRunId } from "../../lib/tauri/events";
import { useUiStore } from "../../state/uiStore";
import type { DiagramBlock } from "../../types/domain";
import { BouncingDots, EmptyState, Modal } from "../common/Ui";
import { MermaidDiagram } from "./MermaidDiagram";

export function DiagramsPanel({ diagrams, projectId }: { diagrams: DiagramBlock[]; projectId: string | null }) {
  const [askOpen, setAskOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [extra, setExtra] = useState<DiagramBlock[]>([]);
  const toast = useUiStore((s) => s.toast);

  const generate = async () => {
    if (!projectId || !description.trim()) return;
    setGenerating(true);
    try {
      const md = await api.generateDiagram(projectId, description.trim(), newRunId());
      // La respuesta viene como un fence ```mermaid; se reusa el mismo extractor del documento
      // para no duplicar el parseo, y se cae al texto crudo si el modelo omitió el fence.
      const [parsed] = extractDiagrams(`### ${description.trim().slice(0, 60)}\n\n${md}`);
      const block: DiagramBlock = parsed ?? {
        id: `ad-hoc-${extra.length + 1}`,
        title: description.trim().slice(0, 60),
        code: md.replace(/```[a-z]*\n?/gi, "").trim(),
      };
      setExtra((prev) => [{ ...block, id: `${block.id}-${prev.length}` }, ...prev]);
      setAskOpen(false);
      setDescription("");
    } catch (err) {
      const { kind, message } = api.describeError(err);
      if (kind !== "cancelled") toast(kind === "quota" ? "warning" : "error", message);
    } finally {
      setGenerating(false);
    }
  };

  const all = [...extra, ...diagrams];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-faint">
          {all.length} diagrama{all.length === 1 ? "" : "s"} · el código Mermaid vive dentro del documento
        </p>
        <button className="btn" onClick={() => setAskOpen(true)} disabled={!projectId}>
          <Wand2 size={14} /> Diagramar algo más
        </button>
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={<Shapes size={34} />}
          title="Este análisis no trajo diagramas"
          description="Puedes pedir uno describiendo el flujo o la estructura que quieres ver."
        />
      ) : (
        <div className="space-y-4">
          {all.map((d) => (
            <MermaidDiagram key={d.id} id={d.id} title={d.title} code={d.code} />
          ))}
        </div>
      )}

      <Modal
        open={askOpen}
        title="Generar un diagrama"
        onClose={() => setAskOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setAskOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={generate} disabled={generating || !description.trim()}>
              {generating ? <BouncingDots /> : <Wand2 size={14} />} Generar
            </button>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-muted">
          Describe qué quieres ver. Mientras más concreto seas (actores, pasos, componentes), mejor sale.
        </p>
        <textarea
          className="input h-36 resize-none font-mono text-[13px]"
          placeholder="Ej: secuencia del flujo de pago — el cliente envía la orden al BFF, que valida stock contra el servicio de inventario, reserva, cobra con el proveedor externo y publica el evento OrdenPagada…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoFocus
        />
      </Modal>
    </div>
  );
}
