/**
 * El resultado de la simulación en una frase.
 *
 * Los percentiles y la utilización por etapa responden «qué pasó», pero solo si ya se sabe qué
 * mirar. Lo primero que tiene que decir el panel es lo que la persona vino a preguntar — si
 * aguanta o no, y qué se rompe primero — y recién después ofrecer los números que lo sostienen.
 * Es traducción, no análisis nuevo: todo sale de lo que `simulate()` ya calculó.
 */
import type { LoadProfile, SimResult } from "./engine";

export interface Verdict {
  level: "ok" | "warn" | "bad";
  /** La respuesta, en una línea. */
  headline: string;
  /** Por qué, con los números que la sostienen. */
  detail: string;
  /** Qué haría falta tocar. Vacío cuando no hay nada que arreglar. */
  advice: string;
}

const rps = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k req/s` : `${Math.round(n).toLocaleString("es-CL")} req/s`;

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);

/** La carga más alta que el perfil llegó a ofrecer. */
export function peakOf(profile: LoadProfile): number {
  return profile.kind === "constante" ? profile.baseRps : Math.max(profile.baseRps, profile.peakRps);
}

export function verdict(result: SimResult, profile: LoadProfile): Verdict {
  const lossPct = result.offered > 0 ? (result.lost / result.offered) * 100 : 0;
  const peak = peakOf(profile);
  const hot = [...result.stages].sort((a, b) => b.utilization - a.utilization)[0];
  const hotName = hot ? `«${hot.name}»` : "la etapa más cargada";
  const hotPct = hot ? `${Math.round(hot.utilization * 100)}%` : "";
  // Si al final del horizonte todavía queda trabajo esperando, la simulación terminó antes que
  // el sistema: aguantar el pico y alcanzar a drenarlo son dos preguntas distintas.
  const pending = result.stages.reduce((n, s) => n + s.finalQueueLen, 0);

  if (lossPct > 1) {
    return {
      level: "bad",
      headline: `No aguanta: con picos de ${rps(peak)} se pierde el ${lossPct.toFixed(1)}% del tráfico`,
      detail: `${result.completed.toLocaleString("es-CL")} de ${result.offered.toLocaleString("es-CL")} peticiones llegaron a completarse. El cuello es ${hotName}, que quedó al ${hotPct} de su capacidad.`,
      advice: `Sube la capacidad de ${hotName} (más unidades, más concurrencia o menos tiempo de servicio) o baja el pico y vuelve a correr para encontrar dónde está el límite real.`,
    };
  }

  if (pending > result.offered * 0.02) {
    return {
      level: "bad",
      headline: `Aguanta el pico pero no alcanza a drenarlo`,
      detail: `Al terminar el horizonte quedaban ${Math.round(pending).toLocaleString("es-CL")} peticiones esperando, la mayoría detrás de ${hotName}. En un sistema real ese retraso se acumula con el pico siguiente.`,
      advice: "Alarga el horizonte para ver cuánto tarda en vaciarse, o sube la capacidad de la etapa que acumula la cola.",
    };
  }

  if (lossPct > 0.1 || (hot && hot.utilization >= 0.85)) {
    return {
      level: "warn",
      headline: `Aguanta ${rps(peak)}, pero sin margen`,
      detail: `Se completó el ${(100 - lossPct).toFixed(2)}% del tráfico con ${ms(result.respond.p95)} de respuesta en el p95, y ${hotName} llegó al ${hotPct} de su capacidad. Por encima del 80% cada punto de carga extra cuesta mucha más latencia que el anterior.`,
      advice: `Un pico algo mayor al simulado sí se va a perder. Prueba subir el tráfico del pico hasta encontrar el punto de quiebre antes de dar la arquitectura por buena.`,
    };
  }

  return {
    level: "ok",
    headline: `Aguanta: ${rps(peak)} en el pico sin pérdida relevante`,
    detail: `Se completó el ${(100 - lossPct).toFixed(2)}% del tráfico con ${ms(result.respond.p95)} de respuesta en el p95${hot ? ` y ${hotName} como etapa más cargada, al ${hotPct}` : ""}.`,
    advice: "Sube el pico hasta que empiece a perder tráfico: saber a qué carga se rompe vale más que confirmar que aguanta la que ya conoces.",
  };
}
