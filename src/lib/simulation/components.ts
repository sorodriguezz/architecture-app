/**
 * Catálogo de componentes para el simulador de carga.
 *
 * Cada entrada aporta **valores por defecto editables**, no mediciones. Los números salen de los
 * órdenes de magnitud que los proveedores publican y de lo que se ve en operación típica; el
 * simulador existe justamente para que se los cambie por los del sistema real. Lo que sí es
 * información dura y no se debe borrar es `limit`: el límite que en la práctica termina mandando
 * en cada servicio, que es lo que decide si una arquitectura escala o se choca contra una cuota.
 *
 * Cambiar los defaults no rompe nada: el motor solo lee la `Stage` que arma la vista.
 */

export type Provider = "generico" | "oss" | "aws" | "azure" | "gcp";

/** Sincrónico: el llamador espera. Cola: desacopla, y el consumidor va detrás a su ritmo. */
export type StageMode = "sync" | "queue";

export interface ComponentDef {
  id: string;
  label: string;
  provider: Provider;
  /** Para agrupar en el selector. */
  category: string;
  mode: StageMode;
  /** Tiempo de servicio medio en ms. */
  serviceMs: number;
  /** Coeficiente de variación del tiempo de servicio: 0 determinista, 1 exponencial, >1 cola pesada. */
  variability: number;
  /** Unidades que se escalan: instancias, particiones, shards, consumidores. */
  replicas: number;
  /** Peticiones simultáneas por unidad. */
  concurrency: number;
  /** Qué se está escalando, para rotular el control en la UI. */
  replicaNoun: string;
  /** Probabilidad de error por intento, 0-1. */
  failureRate: number;
  /** Cola máxima antes de rechazar. 0 = sin límite modelado. */
  maxQueue: number;
  /** El límite real que suele mandar en este componente. */
  limit: string;
}

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "generico", label: "Genéricos" },
  { id: "oss", label: "Mensajería y datos (self-hosted)" },
  { id: "aws", label: "AWS" },
  { id: "azure", label: "Azure" },
  { id: "gcp", label: "Google Cloud" },
];

export const COMPONENTS: ComponentDef[] = [
  // ---------------------------------------------------------------- genéricos
  {
    id: "http-service", label: "Servicio HTTP", provider: "generico", category: "Cómputo",
    mode: "sync", serviceMs: 25, variability: 0.8, replicas: 3, concurrency: 50, replicaNoun: "instancias",
    failureRate: 0.001, maxQueue: 500,
    limit: "El pool de hilos o conexiones por instancia: cuando se agota, el tiempo de espera deja de ser CPU y pasa a ser cola.",
  },
  {
    id: "worker", label: "Worker de fondo", provider: "generico", category: "Cómputo",
    mode: "sync", serviceMs: 120, variability: 1, replicas: 4, concurrency: 4, replicaNoun: "workers",
    failureRate: 0.002, maxQueue: 0,
    limit: "Concurrencia total = workers × prefetch. Subirla sin subir la capacidad de la base solo mueve la cola de lugar.",
  },
  {
    id: "sql-db", label: "Base de datos relacional", provider: "generico", category: "Datos",
    mode: "sync", serviceMs: 8, variability: 1.2, replicas: 1, concurrency: 40, replicaNoun: "nodos",
    failureRate: 0.0005, maxQueue: 200,
    limit: "El pool de conexiones y los locks de escritura. Un solo primario no escala escrituras agregando instancias de aplicación.",
  },
  {
    id: "cache", label: "Caché en memoria", provider: "generico", category: "Datos",
    mode: "sync", serviceMs: 1, variability: 0.6, replicas: 1, concurrency: 500, replicaNoun: "nodos",
    failureRate: 0.0002, maxQueue: 0,
    limit: "Ancho de banda de red y claves calientes: una sola clave muy pedida no se reparte entre nodos.",
  },
  {
    id: "external-api", label: "Proveedor externo", provider: "generico", category: "Integración",
    mode: "sync", serviceMs: 280, variability: 1.6, replicas: 1, concurrency: 20, replicaNoun: "conexiones",
    failureRate: 0.01, maxQueue: 50,
    limit: "La cuota del tercero y su latencia de cola: es la parte del sistema donde no se puede agregar capacidad.",
  },
  {
    id: "object-storage", label: "Almacenamiento de objetos", provider: "generico", category: "Datos",
    mode: "sync", serviceMs: 45, variability: 1.2, replicas: 1, concurrency: 200, replicaNoun: "clientes",
    failureRate: 0.001, maxQueue: 0,
    limit: "Peticiones por prefijo y tamaño del objeto: la latencia la domina la transferencia, no el servicio.",
  },

  // ------------------------------------------------------- mensajería OSS
  {
    id: "rabbitmq", label: "RabbitMQ", provider: "oss", category: "Mensajería",
    mode: "queue", serviceMs: 2, variability: 0.9, replicas: 1, concurrency: 400, replicaNoun: "nodos",
    failureRate: 0.0005, maxQueue: 0,
    limit: "Colas largas degradan al broker: la memoria y el flow control frenan a los productores mucho antes que la CPU.",
  },
  {
    id: "kafka", label: "Kafka", provider: "oss", category: "Mensajería",
    mode: "queue", serviceMs: 3, variability: 0.8, replicas: 6, concurrency: 200, replicaNoun: "particiones",
    failureRate: 0.0003, maxQueue: 0,
    limit: "El paralelismo de consumo lo fija el número de particiones: más consumidores que particiones quedan ociosos.",
  },
  {
    id: "nats", label: "NATS / JetStream", provider: "oss", category: "Mensajería",
    mode: "queue", serviceMs: 0.6, variability: 0.7, replicas: 1, concurrency: 800, replicaNoun: "nodos",
    failureRate: 0.0003, maxQueue: 0,
    limit: "Con persistencia (JetStream) el límite pasa a ser el disco; sin ella, un consumidor lento pierde mensajes.",
  },
  {
    id: "redis-streams", label: "Redis Streams", provider: "oss", category: "Mensajería",
    mode: "queue", serviceMs: 1, variability: 0.7, replicas: 1, concurrency: 500, replicaNoun: "nodos",
    failureRate: 0.0005, maxQueue: 0,
    limit: "El stream vive en memoria: la retención está acotada por la RAM disponible, no por el tiempo.",
  },
  {
    id: "postgres", label: "PostgreSQL", provider: "oss", category: "Datos",
    mode: "sync", serviceMs: 7, variability: 1.2, replicas: 1, concurrency: 60, replicaNoun: "nodos",
    failureRate: 0.0005, maxQueue: 200,
    limit: "Conexiones concurrentes (cada una es un proceso): sin pooler, unos cientos ya son un problema.",
  },
  {
    id: "elasticsearch", label: "Elasticsearch / OpenSearch", provider: "oss", category: "Datos",
    mode: "sync", serviceMs: 35, variability: 1.5, replicas: 3, concurrency: 30, replicaNoun: "nodos",
    failureRate: 0.001, maxQueue: 300,
    limit: "La cola de búsqueda por nodo y el refresh interval: indexar rápido y consultar fresco compiten por el mismo recurso.",
  },

  // ----------------------------------------------------------------- AWS
  {
    id: "aws-alb", label: "Application Load Balancer", provider: "aws", category: "Borde",
    mode: "sync", serviceMs: 3, variability: 0.5, replicas: 1, concurrency: 2000, replicaNoun: "ALB",
    failureRate: 0.0002, maxQueue: 0,
    limit: "Escala solo, pero con rampas bruscas necesita pre-calentamiento; el 503 aparece antes en los targets que en el ALB.",
  },
  {
    id: "aws-apigw", label: "API Gateway", provider: "aws", category: "Borde",
    mode: "sync", serviceMs: 9, variability: 0.7, replicas: 1, concurrency: 1000, replicaNoun: "cuota",
    failureRate: 0.0005, maxQueue: 0,
    limit: "Cuota de peticiones por segundo por cuenta y región, y 29 s de timeout de integración.",
  },
  {
    id: "aws-lambda", label: "Lambda", provider: "aws", category: "Cómputo",
    mode: "sync", serviceMs: 45, variability: 1.3, replicas: 1, concurrency: 1000, replicaNoun: "concurrencia",
    failureRate: 0.001, maxQueue: 0,
    limit: "Concurrencia de cuenta (1.000 por defecto) y arranques en frío al escalar: la latencia de cola es peor que la media.",
  },
  {
    id: "aws-fargate", label: "ECS / Fargate", provider: "aws", category: "Cómputo",
    mode: "sync", serviceMs: 30, variability: 0.9, replicas: 4, concurrency: 60, replicaNoun: "tareas",
    failureRate: 0.001, maxQueue: 400,
    limit: "El autoescalado reacciona en minutos: ante un pico, la capacidad llega tarde.",
  },
  {
    id: "aws-sqs", label: "SQS", provider: "aws", category: "Mensajería",
    mode: "queue", serviceMs: 12, variability: 0.9, replicas: 1, concurrency: 1000, replicaNoun: "cola",
    failureRate: 0.0003, maxQueue: 0,
    limit: "Estándar entrega al-menos-una-vez y sin orden; FIFO ordena pero baja mucho el techo de throughput por grupo.",
  },
  {
    id: "aws-sns", label: "SNS", provider: "aws", category: "Mensajería",
    mode: "queue", serviceMs: 15, variability: 1, replicas: 1, concurrency: 1000, replicaNoun: "tópico",
    failureRate: 0.0005, maxQueue: 0,
    limit: "Fan-out sin persistencia propia: si el suscriptor falla, el mensaje se pierde salvo que haya una SQS detrás.",
  },
  {
    id: "aws-kinesis", label: "Kinesis Data Streams", provider: "aws", category: "Mensajería",
    mode: "queue", serviceMs: 8, variability: 0.8, replicas: 4, concurrency: 100, replicaNoun: "shards",
    failureRate: 0.0005, maxQueue: 0,
    limit: "1 MB/s o 1.000 registros/s de escritura por shard, y 2 MB/s de lectura compartidos entre consumidores.",
  },
  {
    id: "aws-eventbridge", label: "EventBridge", provider: "aws", category: "Mensajería",
    mode: "queue", serviceMs: 25, variability: 1.1, replicas: 1, concurrency: 500, replicaNoun: "bus",
    failureRate: 0.0005, maxQueue: 0,
    limit: "La latencia de entrega es de decenas a cientos de ms y no está garantizada: no sirve para el camino sincrónico.",
  },
  {
    id: "aws-dynamodb", label: "DynamoDB", provider: "aws", category: "Datos",
    mode: "sync", serviceMs: 6, variability: 0.9, replicas: 1, concurrency: 500, replicaNoun: "capacidad",
    failureRate: 0.0005, maxQueue: 0,
    limit: "3.000 RCU / 1.000 WCU por partición: una clave caliente estrangula la tabla aunque la capacidad total sobre.",
  },
  {
    id: "aws-rds", label: "RDS / Aurora", provider: "aws", category: "Datos",
    mode: "sync", serviceMs: 9, variability: 1.2, replicas: 1, concurrency: 60, replicaNoun: "instancias",
    failureRate: 0.0008, maxQueue: 250,
    limit: "Conexiones por tamaño de instancia y un solo escritor: las réplicas solo escalan lecturas, con retraso.",
  },
  {
    id: "aws-s3", label: "S3", provider: "aws", category: "Datos",
    mode: "sync", serviceMs: 40, variability: 1.3, replicas: 1, concurrency: 1000, replicaNoun: "clientes",
    failureRate: 0.0005, maxQueue: 0,
    limit: "3.500 escrituras y 5.500 lecturas por segundo por prefijo: el diseño de las claves es el que escala.",
  },

  // --------------------------------------------------------------- Azure
  {
    id: "azure-frontdoor", label: "Front Door", provider: "azure", category: "Borde",
    mode: "sync", serviceMs: 5, variability: 0.6, replicas: 1, concurrency: 2000, replicaNoun: "perfil",
    failureRate: 0.0003, maxQueue: 0,
    limit: "Cachea en el borde, pero todo lo que no es cacheable llega igual al origen: no reemplaza capacidad.",
  },
  {
    id: "azure-apim", label: "API Management", provider: "azure", category: "Borde",
    mode: "sync", serviceMs: 12, variability: 0.8, replicas: 1, concurrency: 400, replicaNoun: "unidades",
    failureRate: 0.0005, maxQueue: 200,
    limit: "El throughput va por unidad de escala y las políticas se ejecutan por petición: cada policy cuesta latencia.",
  },
  {
    id: "azure-appservice", label: "App Service", provider: "azure", category: "Cómputo",
    mode: "sync", serviceMs: 28, variability: 0.9, replicas: 3, concurrency: 60, replicaNoun: "instancias",
    failureRate: 0.001, maxQueue: 400,
    limit: "Instancias por plan y escalado por reglas: el arranque de una instancia nueva no es instantáneo.",
  },
  {
    id: "azure-functions", label: "Functions", provider: "azure", category: "Cómputo",
    mode: "sync", serviceMs: 50, variability: 1.4, replicas: 1, concurrency: 200, replicaNoun: "concurrencia",
    failureRate: 0.001, maxQueue: 0,
    limit: "En plan de consumo el escalado lo decide el runtime y hay arranques en frío; el plan premium los evita pagando fijo.",
  },
  {
    id: "azure-containerapps", label: "Container Apps", provider: "azure", category: "Cómputo",
    mode: "sync", serviceMs: 30, variability: 1, replicas: 3, concurrency: 80, replicaNoun: "réplicas",
    failureRate: 0.001, maxQueue: 300,
    limit: "El escalado por KEDA reacciona a la métrica elegida: si se escala por CPU y el cuello es la cola, no escala cuando hace falta.",
  },
  {
    id: "azure-servicebus", label: "Service Bus", provider: "azure", category: "Mensajería",
    mode: "queue", serviceMs: 14, variability: 1, replicas: 1, concurrency: 500, replicaNoun: "cola",
    failureRate: 0.0004, maxQueue: 0,
    limit: "Las sesiones dan orden pero serializan el consumo por sesión; sin ellas hay paralelismo pero no orden.",
  },
  {
    id: "azure-eventhubs", label: "Event Hubs", provider: "azure", category: "Mensajería",
    mode: "queue", serviceMs: 6, variability: 0.8, replicas: 4, concurrency: 200, replicaNoun: "particiones",
    failureRate: 0.0004, maxQueue: 0,
    limit: "1 MB/s de ingesta por unidad de throughput, y el consumo se paraleliza solo hasta el número de particiones.",
  },
  {
    id: "azure-cosmosdb", label: "Cosmos DB", provider: "azure", category: "Datos",
    mode: "sync", serviceMs: 7, variability: 0.9, replicas: 1, concurrency: 400, replicaNoun: "capacidad",
    failureRate: 0.0006, maxQueue: 0,
    limit: "RU/s por partición lógica: pasarse devuelve 429 y el SDK reintenta, lo que se ve como latencia, no como error.",
  },
  {
    id: "azure-sql", label: "Azure SQL", provider: "azure", category: "Datos",
    mode: "sync", serviceMs: 10, variability: 1.2, replicas: 1, concurrency: 60, replicaNoun: "instancias",
    failureRate: 0.0008, maxQueue: 250,
    limit: "DTU/vCore acotan CPU, memoria y E/S a la vez: el techo llega por el recurso que primero se sature, no por el que se mira.",
  },
  {
    id: "azure-blob", label: "Blob Storage", provider: "azure", category: "Datos",
    mode: "sync", serviceMs: 42, variability: 1.3, replicas: 1, concurrency: 800, replicaNoun: "clientes",
    failureRate: 0.0006, maxQueue: 0,
    limit: "Límites por cuenta de almacenamiento: repartir entre varias cuentas es parte del diseño, no una optimización posterior.",
  },

  // ----------------------------------------------------------------- GCP
  {
    id: "gcp-lb", label: "Cloud Load Balancing", provider: "gcp", category: "Borde",
    mode: "sync", serviceMs: 4, variability: 0.5, replicas: 1, concurrency: 2000, replicaNoun: "balanceador",
    failureRate: 0.0002, maxQueue: 0,
    limit: "Global y sin pre-calentamiento, pero el backend igual necesita capacidad: el balanceador no la crea.",
  },
  {
    id: "gcp-cloudrun", label: "Cloud Run", provider: "gcp", category: "Cómputo",
    mode: "sync", serviceMs: 32, variability: 1.1, replicas: 4, concurrency: 80, replicaNoun: "instancias",
    failureRate: 0.001, maxQueue: 0,
    limit: "Concurrencia por instancia (80 por defecto) y máximo de instancias: el producto de ambos es el techo real.",
  },
  {
    id: "gcp-functions", label: "Cloud Functions", provider: "gcp", category: "Cómputo",
    mode: "sync", serviceMs: 48, variability: 1.4, replicas: 1, concurrency: 300, replicaNoun: "concurrencia",
    failureRate: 0.001, maxQueue: 0,
    limit: "Una petición por instancia en 1ª gen: la concurrencia se paga en instancias y en arranques en frío.",
  },
  {
    id: "gcp-pubsub", label: "Pub/Sub", provider: "gcp", category: "Mensajería",
    mode: "queue", serviceMs: 10, variability: 1, replicas: 1, concurrency: 1000, replicaNoun: "suscripción",
    failureRate: 0.0004, maxQueue: 0,
    limit: "Entrega al-menos-una-vez y sin orden global; ordenar por clave reduce el paralelismo a esa clave.",
  },
  {
    id: "gcp-spanner", label: "Spanner", provider: "gcp", category: "Datos",
    mode: "sync", serviceMs: 12, variability: 1, replicas: 1, concurrency: 400, replicaNoun: "nodos",
    failureRate: 0.0004, maxQueue: 0,
    limit: "Consistencia fuerte global a costa de latencia de commit; los hotspots de clave primaria son el enemigo.",
  },
  {
    id: "gcp-firestore", label: "Firestore", provider: "gcp", category: "Datos",
    mode: "sync", serviceMs: 15, variability: 1.1, replicas: 1, concurrency: 300, replicaNoun: "capacidad",
    failureRate: 0.0006, maxQueue: 0,
    limit: "Escrituras por documento acotadas (del orden de 1/s sostenido): los contadores necesitan sharding explícito.",
  },
  {
    id: "gcp-cloudsql", label: "Cloud SQL", provider: "gcp", category: "Datos",
    mode: "sync", serviceMs: 9, variability: 1.2, replicas: 1, concurrency: 60, replicaNoun: "instancias",
    failureRate: 0.0008, maxQueue: 250,
    limit: "Un solo primario para escrituras y conexiones acotadas por el tamaño de la instancia.",
  },
  {
    id: "gcp-gcs", label: "Cloud Storage", provider: "gcp", category: "Datos",
    mode: "sync", serviceMs: 40, variability: 1.3, replicas: 1, concurrency: 1000, replicaNoun: "clientes",
    failureRate: 0.0005, maxQueue: 0,
    limit: "El bucket escala solo, pero la tasa de escritura sobre un mismo objeto no: uno por escritor.",
  },
];

export const COMPONENT_BY_ID = new Map(COMPONENTS.map((c) => [c.id, c]));
