/**
 * Simulador de carga por eventos discretos.
 *
 * No es una fórmula cerrada: se generan peticiones individuales, cada una compite por servidores
 * reales, hace cola, se le acaba el tiempo, se reintenta y se descarta. Eso es lo que permite ver
 * los efectos que una hoja de cálculo no muestra — que a 85% de utilización la latencia de cola se
 * dispara, que los reintentos agregan carga justo cuando el sistema está saturado, o que un pico
 * de 30 segundos deja un backlog de varios minutos.
 *
 * La aleatoriedad va con semilla: la misma configuración da siempre el mismo resultado, así que
 * comparar dos topologías compara arquitecturas y no suerte.
 */

import type { StageMode } from "./components";

export interface Stage {
  id: string;
  name: string;
  componentId: string;
  mode: StageMode;
  /** Unidades de escalado: instancias, particiones, shards. */
  replicas: number;
  /** Peticiones simultáneas por unidad. */
  concurrency: number;
  serviceMs: number;
  /** Coeficiente de variación del tiempo de servicio. */
  variability: number;
  /** Cola máxima antes de rechazar. 0 = ilimitada. */
  maxQueue: number;
  /** Tiempo máximo que el llamador espera, ms. 0 = sin timeout. */
  timeoutMs: number;
  failureRate: number;
  /** Reintentos ante error o timeout. */
  retries: number;
  /** Cuántas invocaciones a esta etapa genera cada petición que llega. */
  callsPerRequest: number;
}

export type ProfileKind = "constante" | "rampa" | "pico" | "diurna";

export interface LoadProfile {
  kind: ProfileKind;
  /** Peticiones por segundo de base. */
  baseRps: number;
  /** Peticiones por segundo en el punto alto (rampa, pico y diurna). */
  peakRps: number;
  /** Duración simulada, en segundos. */
  horizonSec: number;
}

export interface SimConfig {
  stages: Stage[];
  profile: LoadProfile;
  seed: number;
}

export interface StageResult {
  id: string;
  name: string;
  /** Fracción de capacidad ocupada, 0-1. Por encima de ~0,8 la cola crece rápido. */
  utilization: number;
  /** Capacidad teórica en peticiones por segundo. */
  capacityRps: number;
  /** Peticiones por segundo que le llegaron de verdad, reintentos incluidos. */
  offeredRps: number;
  /** Total de llegadas a esta etapa, reintentos y fan-out incluidos. */
  offered: number;
  completed: number;
  rejected: number;
  timedOut: number;
  failed: number;
  retried: number;
  /** Espera en cola, sin contar el servicio. */
  waitP50: number;
  waitP95: number;
  /** Peticiones esperando en el peor momento. */
  maxQueueLen: number;
  /** Cola al final de la simulación: si no es ~0, el sistema no alcanzó a drenar. */
  finalQueueLen: number;
}

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface SeriesPoint {
  /** Segundo simulado. */
  t: number;
  arrivals: number;
  completed: number;
  lost: number;
  /** Peticiones en cola sumando todas las etapas. */
  backlog: number;
  /** p95 de la latencia de las peticiones que terminaron en este segundo. */
  p95: number;
}

export interface Diagnosis {
  level: "ok" | "warn" | "bad";
  title: string;
  detail: string;
}

export interface SimResult {
  stages: StageResult[];
  /** Hasta que el llamador recibe respuesta (termina en la primera cola, si hay). */
  respond: Percentiles;
  /** Hasta que la última etapa terminó de procesar. */
  endToEnd: Percentiles;
  series: SeriesPoint[];
  /** Ancho de cada punto de la serie, en segundos: los conteos son por bucket, no por segundo. */
  bucketSec: number;
  offered: number;
  completed: number;
  lost: number;
  /** Etapa con mayor utilización. */
  bottleneck: string | null;
  diagnoses: Diagnosis[];
  /** Si se alcanzó el techo de peticiones simuladas y el resultado quedó truncado. */
  capped: boolean;
  /** Milisegundos que tomó correr la simulación. */
  elapsedMs: number;
}

/** Techo de peticiones simuladas: protege la interfaz de una configuración desmedida. */
const MAX_REQUESTS = 250_000;

// ---------------------------------------------------------------------------
// Azar reproducible
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tiempo de servicio con la variabilidad pedida. Se usa lognormal porque conserva la media y
 * produce la cola larga que tienen los tiempos reales — con tiempos constantes no habría colas
 * y el simulador mentiría hacia el lado optimista.
 */
function sampleService(mean: number, cv: number, rnd: () => number): number {
  if (cv <= 0.01) return mean;
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  // Box-Muller para la normal estándar.
  const u1 = Math.max(rnd(), 1e-12);
  const u2 = rnd();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}

/** Tasa instantánea del perfil, en peticiones por segundo. */
export function rateAt(profile: LoadProfile, tSec: number): number {
  const { kind, baseRps, peakRps, horizonSec } = profile;
  const f = horizonSec <= 0 ? 0 : tSec / horizonSec;
  switch (kind) {
    case "constante":
      return baseRps;
    case "rampa":
      return baseRps + (peakRps - baseRps) * f;
    case "pico": {
      // Pico centrado en la mitad del horizonte y de un 15% de su ancho.
      const d = (f - 0.5) / 0.075;
      return baseRps + (peakRps - baseRps) * Math.exp(-d * d);
    }
    case "diurna":
      return baseRps + (peakRps - baseRps) * (0.5 - 0.5 * Math.cos(2 * Math.PI * f));
  }
}

// ---------------------------------------------------------------------------
// Cola de eventos
// ---------------------------------------------------------------------------

interface Event {
  t: number;
  stage: number;
  req: Req;
  /** `arrive` = llega a la etapa; `finish` = termina de ser servida. */
  kind: 0 | 1;
}

interface Req {
  id: number;
  /** Cuándo entró al sistema. */
  bornAt: number;
  /** Cuándo el llamador dejó de esperar (primera cola) — null si nunca hubo cola. */
  respondedAt: number | null;
  /** Cuándo entró a la etapa actual, para el timeout. */
  stageEnterAt: number;
  attempts: number;
}

/** Montículo binario mínimo por tiempo: el orden de los eventos es toda la simulación. */
class EventQueue {
  private heap: Event[] = [];

  push(e: Event): void {
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].t <= h[i].t) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }

  pop(): Event | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop() as Event;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let small = i;
        if (l < h.length && h[l].t < h[small].t) small = l;
        if (r < h.length && h[r].t < h[small].t) small = r;
        if (small === i) break;
        [h[small], h[i]] = [h[i], h[small]];
        i = small;
      }
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }
}

interface StageState {
  servers: number;
  busy: number;
  queue: { req: Req; since: number }[];
  completed: number;
  rejected: number;
  timedOut: number;
  failed: number;
  retried: number;
  offered: number;
  busyTimeMs: number;
  waits: number[];
  maxQueueLen: number;
}

// ---------------------------------------------------------------------------

export function simulate(config: SimConfig): SimResult {
  const startedAt = performance.now();
  const { stages, profile } = config;
  const rnd = mulberry32(config.seed || 1);
  const horizonMs = profile.horizonSec * 1000;

  const state: StageState[] = stages.map((s) => ({
    servers: Math.max(1, Math.round(s.replicas * s.concurrency)),
    busy: 0,
    queue: [],
    completed: 0,
    rejected: 0,
    timedOut: 0,
    failed: 0,
    retried: 0,
    offered: 0,
    busyTimeMs: 0,
    waits: [],
    maxQueueLen: 0,
  }));

  const events = new EventQueue();
  const respondLat: number[] = [];
  const endLat: number[] = [];
  const buckets = Math.max(1, Math.min(240, Math.round(profile.horizonSec)));
  const bucketMs = horizonMs / buckets;
  const series: SeriesPoint[] = Array.from({ length: buckets }, (_, i) => ({
    t: Math.round((i * bucketMs) / 1000),
    arrivals: 0,
    completed: 0,
    lost: 0,
    backlog: 0,
    p95: 0,
  }));
  const bucketLat: number[][] = Array.from({ length: buckets }, () => []);
  const bucketOf = (t: number) => Math.min(buckets - 1, Math.max(0, Math.floor(t / bucketMs)));

  // --- llegadas: proceso de Poisson con tasa variable, sembrado igual que todo lo demás
  let offered = 0;
  let capped = false;
  {
    let t = 0;
    while (t < horizonMs) {
      const r = rateAt(profile, t / 1000);
      if (r <= 0) {
        t += 100;
        continue;
      }
      t += (-Math.log(1 - rnd()) / r) * 1000;
      if (t >= horizonMs) break;
      if (offered >= MAX_REQUESTS) {
        capped = true;
        break;
      }
      offered += 1;
      series[bucketOf(t)].arrivals += 1;
      events.push({
        t,
        stage: 0,
        kind: 0,
        req: { id: offered, bornAt: t, respondedAt: null, stageEnterAt: t, attempts: 0 },
      });
    }
  }

  let lost = 0;
  /**
   * Solo se contabilizan las peticiones reales. Las llamadas extra de un fan-out entran como
   * peticiones sombra (id negativo) para que consuman capacidad, pero contarlas como tráfico
   * perdido inflaría el porcentaje con trabajo que el usuario nunca pidió.
   */
  const lose = (req: Req, t: number) => {
    if (req.id < 0) return;
    lost += 1;
    series[bucketOf(t)].lost += 1;
  };

  /** El llamador deja de esperar en la primera cola: de ahí en adelante el trabajo es asíncrono. */
  const markResponded = (req: Req, t: number, index: number) => {
    if (req.respondedAt === null && stages[index].mode === "queue") {
      req.respondedAt = t;
      respondLat.push(t - req.bornAt);
    }
  };

  const startService = (index: number, req: Req, t: number) => {
    const st = state[index];
    const stage = stages[index];
    st.busy += 1;
    const service = sampleService(stage.serviceMs, stage.variability, rnd);
    st.busyTimeMs += service;
    events.push({ t: t + service, stage: index, kind: 1, req });
  };

  const arrive = (index: number, req: Req, t: number) => {
    const st = state[index];
    const stage = stages[index];
    st.offered += 1;
    req.stageEnterAt = t;

    if (st.busy < st.servers) {
      st.waits.push(0);
      startService(index, req, t);
      return;
    }
    if (stage.maxQueue > 0 && st.queue.length >= stage.maxQueue) {
      st.rejected += 1;
      retryOrLose(index, req, t);
      return;
    }
    st.queue.push({ req, since: t });
    st.maxQueueLen = Math.max(st.maxQueueLen, st.queue.length);
  };

  const retryOrLose = (index: number, req: Req, t: number) => {
    const stage = stages[index];
    if (req.attempts < stage.retries) {
      req.attempts += 1;
      state[index].retried += 1;
      // Backoff exponencial con jitter: sin el jitter los reintentos se sincronizan y el
      // segundo intento golpea peor que el primero.
      const backoff = Math.min(2000, 50 * 2 ** req.attempts) * (0.5 + rnd());
      events.push({ t: t + backoff, stage: index, kind: 0, req });
      return;
    }
    lose(req, t);
  };

  const advance = (index: number, req: Req, t: number) => {
    const next = index + 1;
    if (next >= stages.length) {
      endLat.push(t - req.bornAt);
      bucketLat[bucketOf(t)].push(t - req.bornAt);
      series[bucketOf(t)].completed += 1;
      // Sin ninguna cola en el camino, la respuesta al llamador es el fin del recorrido.
      if (req.respondedAt === null) respondLat.push(t - req.bornAt);
      return;
    }
    markResponded(req, t, index);
    const fanout = Math.max(1, Math.round(stages[next].callsPerRequest));
    req.attempts = 0;
    arrive(next, req, t);
    // Las invocaciones extra son trabajo real que compite por los mismos servidores, aunque no
    // sean la petición que se está siguiendo: entran como peticiones sombra que solo consumen.
    for (let k = 1; k < fanout; k++) {
      arrive(next, { id: -req.id, bornAt: t, respondedAt: t, stageEnterAt: t, attempts: 0 }, t);
    }
  };

  const finish = (index: number, req: Req, t: number) => {
    const st = state[index];
    const stage = stages[index];
    st.busy -= 1;

    // La siguiente en cola entra a servicio, salvo que ya se le haya pasado el tiempo.
    while (st.queue.length > 0 && st.busy < st.servers) {
      const head = st.queue.shift() as { req: Req; since: number };
      const waited = t - head.since;
      if (stage.timeoutMs > 0 && waited > stage.timeoutMs) {
        st.timedOut += 1;
        retryOrLose(index, head.req, t);
        continue;
      }
      st.waits.push(waited);
      startService(index, head.req, t);
    }

    if (stage.failureRate > 0 && rnd() < stage.failureRate) {
      st.failed += 1;
      retryOrLose(index, req, t);
      return;
    }

    st.completed += 1;
    if (req.id < 0) return; // petición sombra de un fan-out: consumió capacidad y ahí termina
    advance(index, req, t);
  };

  // --- bucle principal
  let now = 0;
  // El horizonte se extiende para dejar drenar lo que quedó en vuelo; si aun así no drena, el
  // backlog final lo dice, que es exactamente el síntoma de un sistema por debajo de la demanda.
  const drainLimit = horizonMs * 2;
  let guard = 0;
  for (;;) {
    const e = events.pop();
    if (!e) break;
    now = e.t;
    if (now > drainLimit) break;
    if (++guard > 8_000_000) break;
    if (e.kind === 0) arrive(e.stage, e.req, e.t);
    else finish(e.stage, e.req, e.t);
  }

  // --- backlog por bucket: se aproxima con la cola que quedó al final de cada etapa
  const pendingAtEnd = state.reduce((n, s) => n + s.queue.length + s.busy, 0);
  for (let i = 0; i < buckets; i++) {
    const lat = bucketLat[i];
    series[i].p95 = percentile(lat, 0.95);
    const done = series.slice(0, i + 1).reduce((n, p) => n + p.completed + p.lost, 0);
    const seen = series.slice(0, i + 1).reduce((n, p) => n + p.arrivals, 0);
    series[i].backlog = Math.max(0, seen - done);
  }

  const stageResults: StageResult[] = stages.map((stage, i) => {
    const st = state[i];
    const capacityRps = (st.servers / Math.max(stage.serviceMs, 0.001)) * 1000;
    const elapsedSec = Math.max(1, Math.min(now, drainLimit) / 1000);
    return {
      id: stage.id,
      name: stage.name,
      utilization: Math.min(1.5, st.busyTimeMs / Math.max(1, st.servers * elapsedSec * 1000)),
      capacityRps,
      offeredRps: st.offered / elapsedSec,
      offered: st.offered,
      completed: st.completed,
      rejected: st.rejected,
      timedOut: st.timedOut,
      failed: st.failed,
      retried: st.retried,
      waitP50: percentile(st.waits, 0.5),
      waitP95: percentile(st.waits, 0.95),
      maxQueueLen: st.maxQueueLen,
      finalQueueLen: st.queue.length,
    };
  });

  const bottleneck =
    stageResults.length === 0
      ? null
      : stageResults.reduce((a, b) => (b.utilization > a.utilization ? b : a)).name;

  return {
    stages: stageResults,
    respond: percentiles(respondLat),
    endToEnd: percentiles(endLat),
    series,
    bucketSec: bucketMs / 1000,
    offered,
    completed: endLat.length,
    lost,
    bottleneck,
    diagnoses: diagnose(stageResults, series, offered, lost, pendingAtEnd),
    capped,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Math.round(sorted[idx] * 10) / 10;
}

function percentiles(values: number[]): Percentiles {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length === 0 ? 0 : Math.round(Math.max(...values)),
  };
}

/**
 * Lectura del resultado. Son los tres síntomas que importan y que la tabla sola no grita: que el
 * sistema no drene, que una etapa esté al límite, y que se esté perdiendo tráfico.
 */
function diagnose(
  stages: StageResult[],
  series: SeriesPoint[],
  offered: number,
  lost: number,
  pendingAtEnd: number,
): Diagnosis[] {
  const out: Diagnosis[] = [];
  const tail = series.slice(-Math.max(3, Math.floor(series.length / 5)));
  const backlogGrowing = tail.length > 1 && tail[tail.length - 1].backlog > tail[0].backlog * 1.5 + 10;

  if (backlogGrowing || pendingAtEnd > offered * 0.05) {
    out.push({
      level: "bad",
      title: "El sistema no alcanza a drenar",
      detail:
        "La cola sigue creciendo al final del horizonte: la demanda supera la capacidad y el retraso no se estabiliza. Agregar reintentos aquí empeora las cosas; hay que subir capacidad o bajar la carga.",
    });
  }

  const lossRate = offered > 0 ? lost / offered : 0;
  if (lossRate > 0.01) {
    out.push({
      level: lossRate > 0.05 ? "bad" : "warn",
      title: `Se pierde el ${(lossRate * 100).toFixed(1)}% del tráfico`,
      detail:
        "Peticiones rechazadas por cola llena, agotadas por timeout o que consumieron todos sus reintentos. Revisa los timeouts y el tamaño de cola de la etapa que más descarta.",
    });
  }

  const hot = stages.filter((s) => s.utilization >= 0.8);
  for (const s of hot) {
    out.push({
      level: s.utilization >= 0.95 ? "bad" : "warn",
      title: `«${s.name}» al ${(s.utilization * 100).toFixed(0)}% de utilización`,
      detail:
        "Por encima del 80% la espera en cola deja de crecer de forma lineal: cada punto adicional de carga cuesta mucho más latencia que el anterior. Es el punto donde conviene agregar capacidad.",
    });
  }

  // Una etapa puede estar rechazando mucho y aun así no perderse tráfico, porque los reintentos
  // lo recuperan. Se ve sano desde afuera y no lo está: el margen ya se gastó.
  for (const s of stages) {
    const blocked = s.rejected + s.timedOut;
    const share = blocked / Math.max(1, s.offered);
    if (share > 0.02) {
      out.push({
        level: share > 0.15 ? "bad" : "warn",
        title: `«${s.name}» rechaza el ${(share * 100).toFixed(1)}% de lo que le llega`,
        detail: `${blocked.toLocaleString("es-CL")} peticiones rechazadas por cola llena o agotadas por timeout, con ${s.retried.toLocaleString("es-CL")} reintentos tapándolo. El total global se ve sano porque los reintentos las recuperan, pero el margen ya está gastado: a ${Math.round(s.offeredRps)} req/s la etapa está en el límite de lo que su cola aguanta, y un pico algo mayor sí se va a perder.`,
      });
    }
  }

  const retried = stages.reduce((n, s) => n + s.retried, 0);
  if (retried > offered * 0.1) {
    out.push({
      level: "warn",
      title: "Los reintentos están agregando carga significativa",
      detail: `${retried.toLocaleString("es-CL")} reintentos sobre ${offered.toLocaleString("es-CL")} peticiones. Reintentar contra un componente saturado lo satura más: hace falta un circuit breaker o load shedding antes que más reintentos.`,
    });
  }

  if (out.length === 0) {
    out.push({
      level: "ok",
      title: "La topología absorbe esta carga",
      detail:
        "Ninguna etapa se acerca a su límite, no hay pérdida relevante y la cola drena dentro del horizonte. Vale la pena subir el pico hasta encontrar dónde se rompe: ese número es el que sirve para dimensionar.",
    });
  }

  return out;
}
