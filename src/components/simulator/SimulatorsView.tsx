import { ArrowLeft, ArrowRight, FolderTree, Gauge } from "lucide-react";

import { useSimStore, type SimTab } from "../../state/simStore";
import { LoadSimulatorView } from "./LoadSimulatorView";
import { StructureSimulatorView } from "./StructureSimulatorView";

interface SimDef {
  id: Exclude<SimTab, "inicio">;
  label: string;
  /** La pregunta que responde, tal como se la haría alguien: es el rótulo del selector. */
  question: string;
  icon: typeof Gauge;
  blurb: string;
  /** Qué hay que poner para que sirva. */
  input: string;
  /** Qué devuelve. */
  output: string;
  /** Un caso concreto en el que se usa. */
  example: string;
}

const SIMS: SimDef[] = [
  {
    id: "carga",
    label: "Carga",
    question: "¿Aguanta el tráfico?",
    icon: Gauge,
    blurb:
      "Manda peticiones por el camino que definas — API, cola, base, proveedor externo — y las hace competir por servidores reales: hacen fila, se agotan por timeout y se reintentan.",
    input: "El camino que sigue una petición y cuánto tráfico le vas a mandar.",
    output: "Dónde está el cuello de botella, a qué carga se rompe y cuánta latencia cuesta cada etapa.",
    example: "«¿Sirve poner una cola entre pagos e inventario, o alcanza con llamarlo directo?»",
  },
  {
    id: "estructura",
    label: "Estructura de directorios",
    question: "¿Aguanta el crecimiento?",
    icon: FolderTree,
    blurb:
      "Proyecta cómo envejece una organización de carpetas a medida que entran módulos y equipos, y dibuja el árbol que tendrías en el mes que elijas.",
    input: "El ritmo al que crece tu proyecto y qué organizaciones quieres comparar.",
    output: "Qué carpeta se convierte en un cajón, cuánto se dispersa un cambio y qué código queda sin dueño.",
    example: "«¿Por capas o por feature? Las dos se ven bien hoy; la diferencia aparece a los dos años.»",
  },
];

/**
 * Los dos simuladores.
 *
 * Comparten vista porque responden a la misma pregunta en dos escalas: si la arquitectura
 * aguanta. Uno lo mide en peticiones por segundo y el otro en meses de crecimiento del
 * repositorio. Se entra por un selector en vez de caer directo en uno: son herramientas con
 * muchos controles, y abrirlas sin saber qué preguntan deja a cualquiera mirando una pantalla
 * de parámetros sin saber cuál tocar primero.
 */
export function SimulatorsView() {
  const tab = useSimStore((s) => s.tab);
  const setTab = useSimStore((s) => s.setTab);
  const active = SIMS.find((s) => s.id === tab) ?? null;

  if (!active) return <SimulatorPicker onPick={setTab} />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-3">
        <button className="btn btn-ghost shrink-0 px-2 py-1.5" onClick={() => setTab("inicio")}>
          <ArrowLeft size={14} /> Simuladores
        </button>
        <span className="h-5 w-px shrink-0" style={{ background: "var(--border)" }} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <active.icon size={15} className="shrink-0 text-accent-text" />
            {active.question}
          </h1>
          <p className="truncate text-[12px] text-faint">{active.output}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {active.id === "carga" ? <LoadSimulatorView /> : <StructureSimulatorView />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SimulatorPicker({ onPick }: { onPick: (tab: SimTab) => void }) {
  return (
    <div className="mx-auto h-full w-full max-w-4xl overflow-y-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Simuladores</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
          Sirven para probar una idea <strong className="text-ink">antes</strong> de comprometerla en una
          decisión. No generan documentos ni tocan tu proyecto: eliges qué comparar, corres, y el resultado te
          dice qué se rompe primero. Elige la pregunta que estás tratando de responder.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SIMS.map((sim) => (
          <article key={sim.id} className="card flex flex-col p-5">
            <div
              className="mb-3 grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
            >
              <sim.icon size={20} />
            </div>

            <h2 className="text-[16px] font-semibold text-ink">{sim.question}</h2>
            <p className="mt-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
              simulador de {sim.label.toLowerCase()}
            </p>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">{sim.blurb}</p>

            <dl className="mt-3.5 space-y-2 border-t border-line pt-3.5 text-[12px]">
              <div>
                <dt className="text-[10.5px] font-semibold tracking-wide text-faint uppercase">Qué tienes que poner</dt>
                <dd className="mt-0.5 leading-relaxed text-muted">{sim.input}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold tracking-wide text-faint uppercase">Qué te devuelve</dt>
                <dd className="mt-0.5 leading-relaxed text-muted">{sim.output}</dd>
              </div>
            </dl>

            <p
              className="mt-3.5 rounded-lg px-3 py-2 text-[12px] leading-relaxed text-muted italic"
              style={{ background: "var(--bg-elevated)" }}
            >
              {sim.example}
            </p>

            <button className="btn btn-primary mt-4 w-full" onClick={() => onPick(sim.id)}>
              Abrir <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>

      <p className="mt-5 text-center text-[11.5px] leading-relaxed text-faint">
        Los dos vienen con un caso cargado y listo para correr: puedes apretar «Simular» apenas entres y
        cambiar los valores después.
      </p>
    </div>
  );
}
