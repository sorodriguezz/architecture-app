import { MessageSquare, Send, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { renderMarkdown } from "../../lib/markdown";
import { extractDiagrams } from "../../lib/parseDecision";
import * as api from "../../lib/tauri/commands";
import { newRunId } from "../../lib/tauri/events";
import { useUiStore } from "../../state/uiStore";
import { BouncingDots } from "../common/Ui";
import { MermaidDiagram } from "../diagrams/MermaidDiagram";

interface Turn {
  question: string;
  answer: string;
}

/** El modelo antepone esta línea cuando la respuesta invalida la decisión: hay que destacarla. */
const CHANGES_DECISION = "⚠️ ESTO CAMBIA LA DECISIÓN";

const SUGGESTIONS = [
  "¿Qué pasa si el volumen es 10× lo estimado?",
  "¿Cómo se ve el plan de rollback si esto sale mal?",
  "¿Qué tendría que cambiar para elegir la segunda opción?",
  "Detalla los modos de falla de la integración externa.",
  "¿Cuánto costaría operar esto al mes con el volumen proyectado?",
];

export function RefinePanel({ decisionId }: { decisionId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useUiStore((s) => s.toast);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const answer = await api.refineDecision(decisionId, q, newRunId());
      setTurns((prev) => [...prev, { question: q, answer }]);
    } catch (err) {
      const { kind, message } = api.describeError(err);
      if (kind !== "cancelled") toast(kind === "quota" ? "warning" : "error", message);
      // La pregunta vuelve al campo para que no haya que reescribirla tras un fallo.
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {turns.length === 0 && !busy && (
          <div className="card p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <MessageSquare size={15} /> Interroga la decisión
            </h3>
            <p className="mt-1.5 text-[12.5px] text-muted">
              La conversación reanuda la sesión del análisis, así que el modelo conserva todo el razonamiento
              que ya hizo. Úsalo para tensionar la recomendación antes de comprometerte con ella.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip hover:chip-on cursor-pointer" onClick={() => void ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => {
          const changes = t.answer.includes(CHANGES_DECISION);
          const diagrams = extractDiagrams(t.answer);
          return (
            <div key={i} className="space-y-2.5">
              <p className="selectable rounded-lg px-3.5 py-2 text-[13px] font-medium text-accent-text" style={{ background: "var(--accent-soft)" }}>
                {t.question}
              </p>
              {changes && (
                <p
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                  style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                >
                  <TriangleAlert size={15} /> Esta respuesta invalida parte de la decisión anterior
                </p>
              )}
              <div
                className="prose-doc card px-4 py-3"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(t.answer) }}
              />
              {diagrams.map((d) => (
                <MermaidDiagram key={`${i}-${d.id}`} id={`refine-${i}-${d.id}`} title={d.title} code={d.code} />
              ))}
            </div>
          );
        })}

        {busy && (
          <p className="flex items-center gap-2 px-1 text-[13px] text-muted">
            <BouncingDots /> pensando…
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2">
        <textarea
          className="input h-20 resize-none"
          placeholder="Pregunta algo sobre esta decisión… (Ctrl+Enter para enviar)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void ask(question);
          }}
          disabled={busy}
        />
        <button className="btn btn-primary h-20 px-4" onClick={() => void ask(question)} disabled={busy || !question.trim()}>
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
