/**
 * Topologías de arranque.
 *
 * Son las formas que aparecen una y otra vez en las decisiones que la app documenta: el mismo
 * caso resuelto de forma sincrónica y de forma desacoplada, y la variante gestionada de cada
 * nube. Sirven para empezar comparando en vez de armar todo desde cero — y para ver, con la misma
 * carga, en qué se diferencian de verdad.
 */
import { COMPONENT_BY_ID } from "./components";
import type { LoadProfile, Stage } from "./engine";

let counter = 0;

/** Arma una etapa a partir de un componente del catálogo, con los ajustes que la topología pida. */
export function stageFrom(componentId: string, overrides: Partial<Stage> = {}): Stage {
  const def = COMPONENT_BY_ID.get(componentId);
  if (!def) throw new Error(`componente desconocido: ${componentId}`);
  return {
    id: `s${++counter}`,
    name: def.label,
    componentId,
    mode: def.mode,
    replicas: def.replicas,
    concurrency: def.concurrency,
    serviceMs: def.serviceMs,
    variability: def.variability,
    maxQueue: def.maxQueue,
    timeoutMs: def.mode === "sync" ? 2000 : 0,
    failureRate: def.failureRate,
    retries: 1,
    callsPerRequest: 1,
    ...overrides,
  };
}

export interface Topology {
  id: string;
  label: string;
  description: string;
  profile: LoadProfile;
  build: () => Stage[];
}

export const TOPOLOGIES: Topology[] = [
  {
    id: "sync-db",
    label: "API sincrónica → base de datos",
    description: "La línea base contra la que hay que comparar todo lo demás. La rampa llega justo al punto donde la base se satura: es ahí donde la latencia deja de crecer de forma lineal.",
    profile: { kind: "rampa", baseRps: 100, peakRps: 1800, horizonSec: 120 },
    build: () => [
      stageFrom("http-service", { name: "API de checkout", replicas: 4 }),
      stageFrom("sql-db", { name: "Base transaccional", callsPerRequest: 3 }),
    ],
  },
  {
    id: "sync-external",
    label: "API sincrónica con proveedor externo",
    description: "El caso que rompe primero: una dependencia lenta que no se puede escalar y de la que el llamador cuelga.",
    profile: { kind: "pico", baseRps: 30, peakRps: 220, horizonSec: 180 },
    build: () => [
      stageFrom("http-service", { name: "API de pagos", replicas: 4 }),
      stageFrom("external-api", { name: "Pasarela de pago", timeoutMs: 3000, retries: 2 }),
      stageFrom("sql-db", { name: "Base transaccional" }),
    ],
  },
  {
    id: "outbox",
    label: "Cola + outbox transaccional",
    description: "El mismo caso desacoplado, con el mismo perfil de carga: la respuesta al usuario se corta en la cola y el resto ocurre detrás. Compara la latencia de respuesta con la de extremo a extremo.",
    profile: { kind: "pico", baseRps: 30, peakRps: 220, horizonSec: 180 },
    build: () => [
      stageFrom("http-service", { name: "API de pagos", replicas: 4 }),
      stageFrom("sql-db", { name: "Base + outbox", serviceMs: 10 }),
      stageFrom("rabbitmq", { name: "Cola de eventos" }),
      stageFrom("worker", { name: "Consumidor de inventario", replicas: 6, concurrency: 4 }),
      stageFrom("external-api", { name: "Pasarela de pago", timeoutMs: 5000, retries: 3 }),
    ],
  },
  {
    id: "kafka-ingest",
    label: "Ingesta de eventos con Kafka",
    description: "Alto volumen y consumo paralelo acotado por particiones. Baja las particiones a 2 y mira dónde queda el techo.",
    profile: { kind: "rampa", baseRps: 200, peakRps: 6000, horizonSec: 120 },
    build: () => [
      stageFrom("http-service", { name: "Colector HTTP", replicas: 6, serviceMs: 6 }),
      stageFrom("kafka", { name: "Tópico de eventos", replicas: 12 }),
      stageFrom("worker", { name: "Procesador de stream", replicas: 12, concurrency: 8, serviceMs: 15 }),
      stageFrom("elasticsearch", { name: "Índice de búsqueda" }),
    ],
  },
  {
    id: "aws-serverless",
    label: "AWS · API Gateway → Lambda → DynamoDB",
    description: "Serverless de manual. El techo real lo pone la concurrencia de cuenta de Lambda, no el cómputo.",
    profile: { kind: "pico", baseRps: 80, peakRps: 3000, horizonSec: 150 },
    build: () => [
      stageFrom("aws-apigw", { name: "API Gateway" }),
      stageFrom("aws-lambda", { name: "Lambda de órdenes", concurrency: 1000 }),
      stageFrom("aws-dynamodb", { name: "DynamoDB", callsPerRequest: 2 }),
    ],
  },
  {
    id: "aws-async",
    label: "AWS · SQS entre servicios",
    description: "Desacople gestionado: la API responde apenas encola y el consumidor procesa a su ritmo.",
    profile: { kind: "pico", baseRps: 100, peakRps: 2500, horizonSec: 180 },
    build: () => [
      stageFrom("aws-alb", { name: "ALB" }),
      stageFrom("aws-fargate", { name: "Servicio de órdenes", replicas: 6 }),
      stageFrom("aws-sqs", { name: "Cola de trabajo" }),
      stageFrom("aws-lambda", { name: "Consumidor", concurrency: 200, serviceMs: 90 }),
      stageFrom("aws-rds", { name: "Aurora" }),
    ],
  },
  {
    id: "azure-managed",
    label: "Azure · App Service → Service Bus → Functions",
    description: "La ruta gestionada de Azure. Ojo con Cosmos: pasarse de RU/s se ve como latencia, no como error.",
    profile: { kind: "rampa", baseRps: 60, peakRps: 1200, horizonSec: 150 },
    build: () => [
      stageFrom("azure-frontdoor", { name: "Front Door" }),
      stageFrom("azure-appservice", { name: "API de reservas", replicas: 4 }),
      stageFrom("azure-servicebus", { name: "Cola de reservas" }),
      stageFrom("azure-functions", { name: "Procesador", concurrency: 200 }),
      stageFrom("azure-cosmosdb", { name: "Cosmos DB", callsPerRequest: 2 }),
    ],
  },
  {
    id: "gcp-managed",
    label: "GCP · Cloud Run → Pub/Sub → Spanner",
    description: "El techo de Cloud Run es instancias × concurrencia por instancia: el producto de los dos, no cada uno por separado.",
    profile: { kind: "rampa", baseRps: 80, peakRps: 2000, horizonSec: 150 },
    build: () => [
      stageFrom("gcp-lb", { name: "Cloud Load Balancing" }),
      stageFrom("gcp-cloudrun", { name: "Servicio de API", replicas: 10 }),
      stageFrom("gcp-pubsub", { name: "Tópico de eventos" }),
      stageFrom("gcp-cloudrun", { name: "Consumidor", replicas: 6, serviceMs: 60 }),
      stageFrom("gcp-spanner", { name: "Spanner" }),
    ],
  },
];
