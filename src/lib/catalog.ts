/**
 * Base de conocimiento embebida.
 *
 * Cumple dos funciones y por eso vive en el frontend y no en el prompt: alimenta los selectores
 * del wizard (para que el usuario elija atributos y familias sin escribirlos a mano) y es la
 * vista de referencia "Patrones", consultable sin gastar una corrida de IA.
 *
 * Cada patrón declara además qué atributos de calidad **mejora** (`drivers`) y cuáles
 * **empeora** (`costs`). Ese par es lo que convierte el catálogo en una herramienta de decisión
 * y no en una lista: permite ir desde "necesito resiliencia" hasta los patrones que la dan —y
 * ver, en el mismo lugar, qué se paga a cambio.
 */

export interface QualityAttributeDef {
  id: string;
  label: string;
  /** Etiqueta corta, para chips y listas donde el nombre completo no cabe. */
  short: string;
  /** Qué mide, en una línea. */
  description: string;
  /** Escenario de ejemplo (estímulo → respuesta → medida) para arrancar el del usuario. */
  sampleScenario: string;
}

/** Atributos de calidad, alineados con ISO/IEC 25010 más los que importan en la práctica. */
export const QUALITY_ATTRIBUTES: QualityAttributeDef[] = [
  {
    id: "Disponibilidad",
    label: "Disponibilidad",
    short: "Disponibilidad",
    description: "Qué fracción del tiempo el sistema responde correctamente.",
    sampleScenario: "Ante la caída de una zona de disponibilidad, el sistema sigue sirviendo el 100% del tráfico de lectura con degradación en escrituras, recuperando en menos de 5 minutos.",
  },
  {
    id: "Rendimiento",
    label: "Rendimiento / latencia",
    short: "Rendimiento",
    description: "Tiempo de respuesta y throughput bajo carga esperada y pico.",
    sampleScenario: "Con 500 req/s sostenidos, el p95 de la API de consulta se mantiene bajo 300 ms.",
  },
  {
    id: "Escalabilidad",
    label: "Escalabilidad",
    short: "Escalabilidad",
    description: "Capacidad de absorber crecimiento sin rediseñar.",
    sampleScenario: "Ante un aumento de 10× en usuarios concurrentes, la capacidad se ajusta agregando instancias sin cambios de código.",
  },
  {
    id: "Seguridad",
    label: "Seguridad",
    short: "Seguridad",
    description: "Protección de datos y accesos frente a actores maliciosos.",
    sampleScenario: "Ante un intento de acceso con credenciales robadas, el sistema exige segundo factor y registra el evento en auditoría en menos de 1 s.",
  },
  {
    id: "Mantenibilidad",
    label: "Mantenibilidad",
    short: "Mantenibilidad",
    description: "Costo de entender y cambiar el sistema.",
    sampleScenario: "Un desarrollador nuevo entrega un cambio de regla de negocio en producción dentro de su primera semana.",
  },
  {
    id: "Observabilidad",
    label: "Observabilidad",
    short: "Observabilidad",
    description: "Capacidad de diagnosticar qué pasó sin reproducir el problema.",
    sampleScenario: "Ante un error 500 reportado por un cliente, un ingeniero reconstruye la traza completa de la petición en menos de 10 minutos.",
  },
  {
    id: "Consistencia",
    label: "Consistencia de datos",
    short: "Consistencia",
    description: "Qué garantías da el sistema sobre el estado que lee y escribe.",
    sampleScenario: "Tras confirmar un pago, cualquier lectura posterior del saldo refleja el cargo (lectura de las propias escrituras).",
  },
  {
    id: "Resiliencia",
    label: "Resiliencia / tolerancia a fallos",
    short: "Resiliencia",
    description: "Comportamiento cuando una dependencia falla o se degrada.",
    sampleScenario: "Ante un proveedor externo con latencia de 10 s, el sistema corta en 2 s y responde con datos en caché en vez de propagar el bloqueo.",
  },
  {
    id: "Costo",
    label: "Costo de operación",
    short: "Costo",
    description: "Gasto recurrente de infraestructura y licencias.",
    sampleScenario: "El costo mensual de infraestructura se mantiene bajo USD 2.000 con el volumen proyectado a 12 meses.",
  },
  {
    id: "TimeToMarket",
    label: "Time to market",
    short: "Time to market",
    description: "Rapidez para poner la primera versión y para iterar después.",
    sampleScenario: "La primera versión utilizable está en producción en 8 semanas con el equipo actual.",
  },
  {
    id: "Portabilidad",
    label: "Portabilidad",
    short: "Portabilidad",
    description: "Qué tan atado queda el sistema a un proveedor o plataforma.",
    sampleScenario: "Migrar de proveedor de nube toma menos de un trimestre sin reescribir la lógica de negocio.",
  },
  {
    id: "Cumplimiento",
    label: "Cumplimiento normativo",
    short: "Cumplimiento",
    description: "Requisitos legales y regulatorios que la arquitectura debe satisfacer.",
    sampleScenario: "Los datos personales de clientes residen en territorio nacional y toda lectura queda auditada por 5 años.",
  },
  {
    id: "Testabilidad",
    label: "Testabilidad",
    short: "Testabilidad",
    description: "Facilidad para verificar el comportamiento automáticamente.",
    sampleScenario: "La lógica de dominio se prueba sin levantar base de datos ni servicios externos.",
  },
  {
    id: "Interoperabilidad",
    label: "Interoperabilidad",
    short: "Interoperabilidad",
    description: "Capacidad de integrarse con sistemas de terceros.",
    sampleScenario: "Un socio nuevo se integra usando el contrato publicado sin cambios en nuestro código.",
  },
];

/** Índice por id, para resolver etiquetas sin recorrer el arreglo en cada render. */
export const QA_BY_ID = new Map(QUALITY_ATTRIBUTES.map((qa) => [qa.id, qa]));

export function qaLabel(id: string): string {
  return QA_BY_ID.get(id)?.label ?? id;
}

export function qaShort(id: string): string {
  return QA_BY_ID.get(id)?.short ?? id;
}

export interface PatternDef {
  name: string;
  /** Qué problema resuelve. */
  problem: string;
  /** Qué cuesta usarlo — la parte que se olvida y que hace falta para decidir. */
  tradeoff: string;
  /** Atributos de calidad que suele mejorar (ids de `QUALITY_ATTRIBUTES`). */
  drivers: string[];
  /** Atributos de calidad que suele empeorar. */
  costs: string[];
}

export interface PatternFamilyDef {
  id: string;
  label: string;
  blurb: string;
  patterns: PatternDef[];
}

export const PATTERN_FAMILIES: PatternFamilyDef[] = [
  {
    id: "arquitectonico",
    label: "Patrones arquitectónicos",
    blurb: "Deciden la forma general del sistema: sus piezas grandes y cómo se comunican.",
    patterns: [
      { name: "Monolito modular", problem: "Un solo despliegue con límites internos claros; da orden sin el costo operacional de distribuir.", tradeoff: "Escala como una unidad: un módulo con demanda alta obliga a escalar todo.", drivers: ["TimeToMarket", "Mantenibilidad", "Costo"], costs: ["Escalabilidad"] },
      { name: "Arquitectura en capas", problem: "Separa presentación, aplicación, dominio e infraestructura para aislar el cambio.", tradeoff: "Invita a capas anémicas y a que un cambio simple atraviese cuatro archivos.", drivers: ["Mantenibilidad", "Testabilidad"], costs: ["Rendimiento", "TimeToMarket"] },
      { name: "Hexagonal (puertos y adaptadores)", problem: "El dominio no conoce a la infraestructura; la tecnología entra por adaptadores intercambiables.", tradeoff: "Más indirección y más tipos para el mismo comportamiento; se paga desde el día uno.", drivers: ["Testabilidad", "Portabilidad", "Mantenibilidad"], costs: ["TimeToMarket"] },
      { name: "Clean architecture", problem: "Regla de dependencia hacia adentro: lo estable no depende de lo volátil.", tradeoff: "Ceremonia alta en dominios simples; equipos junior tienden a aplicarla mecánicamente.", drivers: ["Mantenibilidad", "Testabilidad"], costs: ["TimeToMarket"] },
      { name: "Microservicios", problem: "Servicios desplegables por separado, alineados a capacidades de negocio y a equipos.", tradeoff: "Cambia complejidad de código por complejidad operacional: red, consistencia eventual, observabilidad distribuida, versionado de contratos.", drivers: ["Escalabilidad", "Mantenibilidad", "Disponibilidad"], costs: ["Costo", "Consistencia", "Observabilidad"] },
      { name: "Event-driven", problem: "Los componentes reaccionan a eventos en vez de llamarse; desacopla productor y consumidor.", tradeoff: "El flujo deja de ser legible en el código y hay que reconstruirlo desde trazas.", drivers: ["Escalabilidad", "Resiliencia"], costs: ["Observabilidad", "Consistencia"] },
      { name: "CQRS", problem: "Separa el modelo de escritura del de lectura cuando sus necesidades divergen.", tradeoff: "Dos modelos que mantener y consistencia eventual entre ellos visible para el usuario.", drivers: ["Rendimiento", "Escalabilidad"], costs: ["Consistencia", "Mantenibilidad"] },
      { name: "Event sourcing", problem: "El estado es la reducción de un log de eventos inmutable; da auditoría e historia completas.", tradeoff: "Versionado de eventos, replays lentos y una curva de aprendizaje real para el equipo.", drivers: ["Cumplimiento", "Observabilidad", "Consistencia"], costs: ["Mantenibilidad", "TimeToMarket"] },
      { name: "Saga", problem: "Transacciones de negocio largas entre servicios usando pasos compensables en vez de 2PC.", tradeoff: "Cada paso necesita su compensación, y hay estados intermedios visibles.", drivers: ["Disponibilidad", "Escalabilidad"], costs: ["Consistencia", "Mantenibilidad"] },
      { name: "BFF (backend for frontend)", problem: "Una capa por tipo de cliente que agrega y adapta lo que ese cliente necesita.", tradeoff: "Un backend más por mantener y riesgo de duplicar lógica entre BFFs.", drivers: ["Rendimiento", "TimeToMarket"], costs: ["Mantenibilidad", "Costo"] },
      { name: "API Gateway", problem: "Punto único de entrada: enrutado, autenticación, límites de tasa y agregación.", tradeoff: "Punto único de falla y de contención organizacional si concentra lógica de negocio.", drivers: ["Seguridad", "Interoperabilidad"], costs: ["Disponibilidad", "Rendimiento"] },
      { name: "Service mesh", problem: "mTLS, reintentos, circuit breaking y telemetría fuera del código de aplicación.", tradeoff: "Otra capa que operar y depurar; sobra por debajo de cierta cantidad de servicios.", drivers: ["Seguridad", "Observabilidad", "Resiliencia"], costs: ["Costo", "Rendimiento"] },
      { name: "Strangler fig", problem: "Reemplaza un legado por partes, redirigiendo tráfico funcionalidad por funcionalidad.", tradeoff: "Convivencia larga de dos sistemas y una capa de enrutado que hay que mantener.", drivers: ["Disponibilidad", "Mantenibilidad"], costs: ["Costo", "TimeToMarket"] },
      { name: "Sidecar", problem: "Capacidades transversales en un proceso adjunto al servicio, sin tocarlo.", tradeoff: "Duplica consumo de recursos por instancia y acopla ciclos de vida.", drivers: ["Mantenibilidad", "Observabilidad"], costs: ["Costo"] },
      { name: "Pipes and filters", problem: "Procesamiento en etapas independientes y recombinables.", tradeoff: "La latencia extremo a extremo es la suma de etapas y el manejo de errores se dispersa.", drivers: ["Mantenibilidad", "Escalabilidad"], costs: ["Rendimiento", "Observabilidad"] },
      { name: "Serverless / FaaS", problem: "Ejecución bajo demanda sin administrar servidores; se paga por uso real.", tradeoff: "Arranques en frío, límites de tiempo, amarre al proveedor y depuración local incómoda.", drivers: ["Costo", "Escalabilidad", "TimeToMarket"], costs: ["Portabilidad", "Rendimiento"] },
      { name: "Space-based", problem: "Estado en una grilla en memoria replicada, para cargas con picos extremos.", tradeoff: "Complejidad alta y modelo de consistencia difícil de razonar.", drivers: ["Rendimiento", "Escalabilidad"], costs: ["Consistencia", "Costo"] },
      { name: "Micro-frontends", problem: "Cada equipo despliega su parte de la interfaz por separado, con el mismo argumento que los microservicios pero en el navegador.", tradeoff: "Duplica dependencias en el bundle, complica la coherencia visual y mueve la integración al peor lugar posible: el cliente.", drivers: ["TimeToMarket", "Mantenibilidad"], costs: ["Rendimiento", "Costo"] },
      { name: "Arquitectura por celdas", problem: "Réplicas completas e independientes del sistema, cada una sirviendo a un subconjunto de usuarios: una falla no cruza de celda.", tradeoff: "Enrutado por celda, despliegues multiplicados y capacidad ociosa en cada una.", drivers: ["Disponibilidad", "Resiliencia", "Escalabilidad"], costs: ["Costo", "Mantenibilidad"] },
      { name: "Modular monolith → microservicios", problem: "Empezar monolítico con límites explícitos y extraer solo lo que la evidencia justifique.", tradeoff: "Requiere disciplina sostenida: sin ella los límites se erosionan y no queda nada que extraer.", drivers: ["TimeToMarket", "Mantenibilidad", "Costo"], costs: [] },
    ],
  },
  {
    id: "diseno",
    label: "Patrones de diseño",
    blurb: "Resuelven problemas recurrentes dentro de un componente.",
    patterns: [
      { name: "Factory / Abstract Factory", problem: "Crear objetos sin acoplar al cliente con la clase concreta.", tradeoff: "Una indirección más; injustificada si nunca hay una segunda implementación.", drivers: ["Mantenibilidad", "Testabilidad"], costs: [] },
      { name: "Builder", problem: "Construir objetos con muchos parámetros opcionales sin constructores telescópicos.", tradeoff: "Más código para el mismo tipo; puede permitir estados intermedios inválidos.", drivers: ["Mantenibilidad"], costs: [] },
      { name: "Strategy", problem: "Intercambiar algoritmos en tiempo de ejecución.", tradeoff: "Dispersa la lógica en varias clases; cuesta más leerla completa.", drivers: ["Mantenibilidad", "Testabilidad"], costs: [] },
      { name: "Adapter", problem: "Hacer encajar una interfaz ajena con la que el sistema espera.", tradeoff: "Puede esconder incompatibilidades semánticas reales tras una firma que calza.", drivers: ["Interoperabilidad", "Portabilidad"], costs: [] },
      { name: "Facade", problem: "Una entrada simple a un subsistema complejo, para que el resto del código no dependa de sus detalles.", tradeoff: "Si se convierte en la única puerta, termina exponiendo todo y no simplifica nada.", drivers: ["Mantenibilidad"], costs: [] },
      { name: "Proxy", problem: "Intercepta el acceso a un objeto para agregar caché, control de acceso o carga diferida.", tradeoff: "El costo y el comportamiento real dejan de ser evidentes en el punto de llamada.", drivers: ["Rendimiento", "Seguridad"], costs: ["Observabilidad"] },
      { name: "Decorator", problem: "Agregar comportamiento sin modificar ni heredar del original.", tradeoff: "Cadenas largas vuelven ilegible el stack trace.", drivers: ["Mantenibilidad"], costs: ["Observabilidad"] },
      { name: "Composite", problem: "Tratar de la misma forma un elemento y un grupo de elementos.", tradeoff: "Fuerza una interfaz común que a las hojas les sobra; recorridos profundos sorprenden en rendimiento.", drivers: ["Mantenibilidad"], costs: ["Rendimiento"] },
      { name: "Bridge", problem: "Separa la abstracción de su implementación para que las dos evolucionen sin multiplicarse.", tradeoff: "Dos jerarquías que mantener; se justifica solo si ambas varían de verdad.", drivers: ["Mantenibilidad", "Portabilidad"], costs: [] },
      { name: "Observer", problem: "Notificar a interesados sin que el emisor los conozca.", tradeoff: "Flujo implícito; fácil filtrar memoria si nadie desuscribe.", drivers: ["Mantenibilidad"], costs: ["Observabilidad"] },
      { name: "Command", problem: "Encapsular una acción como objeto: permite deshacer, encolar y auditar.", tradeoff: "Una clase por acción; el crecimiento es lineal en cantidad de archivos.", drivers: ["Testabilidad", "Observabilidad", "Cumplimiento"], costs: [] },
      { name: "Repository", problem: "Aísla el dominio del mecanismo de persistencia.", tradeoff: "Abstracción con fugas: paginación, transacciones y consultas complejas siempre terminan asomando.", drivers: ["Testabilidad", "Portabilidad"], costs: ["Rendimiento"] },
      { name: "Unit of Work", problem: "Agrupa cambios y los confirma como una sola transacción.", tradeoff: "El ciclo de vida y el ámbito de la unidad son fuente frecuente de bugs sutiles.", drivers: ["Consistencia"], costs: ["Mantenibilidad"] },
      { name: "Specification", problem: "Reglas de negocio componibles y reutilizables como objetos.", tradeoff: "Traducirlas a consultas eficientes suele ser difícil.", drivers: ["Mantenibilidad", "Testabilidad"], costs: ["Rendimiento"] },
      { name: "State", problem: "El comportamiento cambia con el estado, sin condicionales gigantes.", tradeoff: "Explosión de clases si los estados son muchos.", drivers: ["Mantenibilidad", "Testabilidad"], costs: [] },
      { name: "Template Method", problem: "Fija el esqueleto de un algoritmo y deja variar los pasos.", tradeoff: "Acopla por herencia; la composición suele envejecer mejor.", drivers: ["Mantenibilidad"], costs: [] },
      { name: "Mediator", problem: "Centraliza la comunicación entre componentes que si no se conocerían entre sí.", tradeoff: "El mediador tiende a convertirse en un objeto-dios.", drivers: ["Mantenibilidad"], costs: [] },
      { name: "Chain of Responsibility", problem: "Varios manejadores en cadena hasta que uno atiende la solicitud.", tradeoff: "Es difícil saber quién atendió qué sin instrumentar la cadena.", drivers: ["Mantenibilidad"], costs: ["Observabilidad"] },
      { name: "Null Object", problem: "Un objeto neutro que evita chequeos de nulo repartidos.", tradeoff: "Puede enmascarar un error real como comportamiento silencioso.", drivers: ["Mantenibilidad"], costs: ["Observabilidad"] },
      { name: "Value Object", problem: "Modela conceptos por su valor, inmutables y auto-validados.", tradeoff: "Más tipos; costo de asignación si son muy numerosos en rutas calientes.", drivers: ["Mantenibilidad", "Testabilidad"], costs: ["Rendimiento"] },
      { name: "Aggregate (DDD)", problem: "Define el límite de consistencia transaccional del dominio.", tradeoff: "Agregados grandes generan contención; chicos obligan a coordinar entre ellos.", drivers: ["Consistencia", "Mantenibilidad"], costs: ["Rendimiento"] },
      { name: "Domain Events", problem: "El dominio publica lo que ocurrió y otros reaccionan sin acoplarse.", tradeoff: "El orden y la entrega dejan de ser triviales apenas cruzan proceso.", drivers: ["Mantenibilidad", "Escalabilidad"], costs: ["Consistencia", "Observabilidad"] },
    ],
  },
  {
    id: "resiliencia",
    label: "Patrones de resiliencia",
    blurb: "Qué hace el sistema cuando algo de lo que depende falla.",
    patterns: [
      { name: "Circuit breaker", problem: "Deja de llamar a una dependencia que está fallando, en vez de agotar recursos esperándola.", tradeoff: "Umbrales mal calibrados abren el circuito con fallas transitorias normales.", drivers: ["Resiliencia", "Disponibilidad"], costs: ["Consistencia"] },
      { name: "Retry con backoff exponencial y jitter", problem: "Reintenta fallas transitorias espaciando los intentos y desincronizando a los clientes.", tradeoff: "Sin idempotencia, duplica efectos; sin jitter, sincroniza a todos en una estampida.", drivers: ["Resiliencia", "Disponibilidad"], costs: ["Rendimiento", "Consistencia"] },
      { name: "Timeout", problem: "Acota cuánto se espera: sin timeout no hay resiliencia posible.", tradeoff: "Muy corto corta operaciones sanas; muy largo no protege de nada.", drivers: ["Resiliencia", "Rendimiento"], costs: [] },
      { name: "Bulkhead", problem: "Aísla recursos por dependencia para que una lenta no consuma todo el pool.", tradeoff: "Utilización total menor: cada compartimento reserva capacidad que no comparte.", drivers: ["Resiliencia", "Disponibilidad"], costs: ["Costo"] },
      { name: "Rate limiting / throttling", problem: "Protege al sistema y reparte capacidad entre clientes.", tradeoff: "Necesita estado compartido para ser exacto en un despliegue distribuido.", drivers: ["Disponibilidad", "Seguridad", "Costo"], costs: ["Rendimiento"] },
      { name: "Fallback / degradación elegante", problem: "Responder algo útil y peor antes que nada.", tradeoff: "Puede ocultar una caída real si no se mide cuántas respuestas son degradadas.", drivers: ["Disponibilidad", "Resiliencia"], costs: ["Consistencia", "Observabilidad"] },
      { name: "Cache-aside", problem: "Reduce carga y latencia sirviendo desde caché lo que se repite.", tradeoff: "Invalidación y datos rancios; una estampida al expirar una clave caliente.", drivers: ["Rendimiento", "Costo", "Escalabilidad"], costs: ["Consistencia"] },
      { name: "Idempotencia", problem: "Repetir la misma operación no cambia el resultado: es lo que hace seguros a los reintentos.", tradeoff: "Requiere clave de idempotencia y almacenamiento de resultados ya procesados.", drivers: ["Consistencia", "Resiliencia"], costs: ["Costo"] },
      { name: "Dead letter queue", problem: "Aparta los mensajes que fallan repetidamente para que no bloqueen la cola.", tradeoff: "Sin alertas y proceso de reproceso, la DLQ se vuelve un cementerio silencioso.", drivers: ["Disponibilidad", "Observabilidad"], costs: ["Mantenibilidad"] },
      { name: "Outbox transaccional", problem: "Publicar un evento y confirmar la transacción sin escritura dual ni pérdida.", tradeoff: "Un proceso relay más y entrega al-menos-una-vez que obliga a consumidores idempotentes.", drivers: ["Consistencia", "Resiliencia"], costs: ["Costo", "Rendimiento"] },
      { name: "Health checks (liveness/readiness)", problem: "Permite al orquestador sacar de rotación o reiniciar instancias enfermas.", tradeoff: "Un check que consulta dependencias propaga la falla en vez de contenerla.", drivers: ["Disponibilidad", "Observabilidad"], costs: [] },
      { name: "Load shedding", problem: "Rechaza tráfico de baja prioridad en saturación para salvar el resto.", tradeoff: "Hay que decidir y comunicar qué se sacrifica antes de que ocurra.", drivers: ["Disponibilidad", "Rendimiento"], costs: [] },
      { name: "Backpressure", problem: "El consumidor le dice al productor que baje el ritmo en vez de acumular.", tradeoff: "Debe propagarse por toda la cadena; un solo tramo sin ella anula el mecanismo.", drivers: ["Resiliencia", "Rendimiento"], costs: ["Mantenibilidad"] },
      { name: "Chaos engineering", problem: "Provoca fallas controladas para validar que las defensas funcionan de verdad.", tradeoff: "Necesita madurez de observabilidad y de respuesta antes de ser seguro.", drivers: ["Resiliencia", "Disponibilidad"], costs: ["Costo"] },
      { name: "Redundancia activa/pasiva", problem: "Instancias de respaldo listas para tomar el tráfico.", tradeoff: "Duplica costo; el failover no probado es un failover que no funciona.", drivers: ["Disponibilidad", "Resiliencia"], costs: ["Costo"] },
    ],
  },
  {
    id: "concurrencia",
    label: "Patrones de concurrencia",
    blurb: "Cómo se reparte y coordina el trabajo simultáneo.",
    patterns: [
      { name: "Worker pool", problem: "Un número acotado de trabajadores consume de una cola compartida.", tradeoff: "Dimensionar el pool es empírico; mal calibrado subutiliza o satura.", drivers: ["Rendimiento", "Escalabilidad"], costs: [] },
      { name: "Productor-consumidor", problem: "Desacopla la generación del procesamiento con una cola en medio.", tradeoff: "Una cola sin límite convierte un problema de latencia en uno de memoria.", drivers: ["Escalabilidad", "Resiliencia"], costs: ["Consistencia"] },
      { name: "Modelo de actores", problem: "Estado encapsulado por actor y comunicación solo por mensajes: sin memoria compartida.", tradeoff: "Los deadlocks se vuelven bloqueos por mensajes y el debugging cambia de forma.", drivers: ["Escalabilidad", "Resiliencia"], costs: ["Observabilidad", "Mantenibilidad"] },
      { name: "Fork-join", problem: "Divide el trabajo, procesa en paralelo y combina resultados.", tradeoff: "Solo rinde si las partes son parejas; la más lenta define el total.", drivers: ["Rendimiento"], costs: ["Mantenibilidad"] },
      { name: "Pipeline", problem: "Etapas concurrentes donde la salida de una alimenta a la siguiente.", tradeoff: "El throughput lo fija la etapa más lenta.", drivers: ["Rendimiento", "Escalabilidad"], costs: ["Observabilidad"] },
      { name: "Leader election", problem: "Garantiza que solo una instancia ejecute una tarea única en el clúster.", tradeoff: "Necesita un servicio de consenso y manejo de split-brain.", drivers: ["Consistencia", "Disponibilidad"], costs: ["Costo", "Mantenibilidad"] },
      { name: "Bloqueo optimista", problem: "Detecta conflictos al escribir con versión, sin bloquear al leer.", tradeoff: "Con alta contención el reintento constante se vuelve peor que bloquear.", drivers: ["Rendimiento", "Escalabilidad"], costs: [] },
      { name: "Bloqueo pesimista", problem: "Toma el lock antes de trabajar cuando el conflicto es lo esperable.", tradeoff: "Reduce concurrencia y abre la puerta a deadlocks.", drivers: ["Consistencia"], costs: ["Rendimiento", "Escalabilidad"] },
      { name: "Compare-and-swap", problem: "Actualización atómica sin locks para contadores y punteros.", tradeoff: "Solo sirve para operaciones muy acotadas; sufre con contención alta.", drivers: ["Rendimiento", "Consistencia"], costs: ["Mantenibilidad"] },
      { name: "Read-write lock", problem: "Muchos lectores concurrentes, un escritor exclusivo.", tradeoff: "Puede matar de hambre a los escritores si las lecturas nunca cesan.", drivers: ["Rendimiento"], costs: ["Consistencia"] },
      { name: "Batching", problem: "Agrupa operaciones para amortizar el costo fijo por llamada.", tradeoff: "Agrega latencia al primer elemento del lote.", drivers: ["Rendimiento", "Costo"], costs: ["Rendimiento"] },
      { name: "Single-flight / coalescencia de peticiones", problem: "Varias peticiones idénticas simultáneas se resuelven con una sola llamada al origen.", tradeoff: "Un fallo se propaga a todos los que esperaban; hay que acotar cuánto esperan.", drivers: ["Rendimiento", "Costo", "Resiliencia"], costs: [] },
      { name: "Sharding por clave", problem: "Particiona el trabajo por clave para que cada partición sea de un solo hilo.", tradeoff: "Claves calientes desbalancean y el rebalanceo es una operación delicada.", drivers: ["Escalabilidad", "Rendimiento"], costs: ["Mantenibilidad"] },
      { name: "Hashing consistente", problem: "Reparte claves entre nodos minimizando el movimiento al agregar o quitar uno.", tradeoff: "Necesita nodos virtuales para no desbalancear.", drivers: ["Escalabilidad", "Disponibilidad"], costs: ["Mantenibilidad"] },
      { name: "Idempotent consumer", problem: "El consumidor tolera entregas repetidas registrando lo ya procesado.", tradeoff: "Requiere almacenamiento adicional y una política de expiración.", drivers: ["Consistencia", "Resiliencia"], costs: ["Costo"] },
    ],
  },
  {
    id: "datos",
    label: "Patrones de datos",
    blurb: "Dónde vive el estado y cómo se lee, escribe y evoluciona.",
    patterns: [
      { name: "Réplicas de lectura", problem: "Escala lecturas separándolas del primario.", tradeoff: "Retraso de replicación: se leen datos viejos justo después de escribir.", drivers: ["Escalabilidad", "Rendimiento", "Disponibilidad"], costs: ["Consistencia", "Costo"] },
      { name: "Sharding", problem: "Reparte los datos entre nodos cuando uno solo no alcanza.", tradeoff: "Consultas y transacciones entre shards se vuelven caras o imposibles.", drivers: ["Escalabilidad"], costs: ["Consistencia", "Mantenibilidad"] },
      { name: "CDC (change data capture)", problem: "Propaga cambios desde el log de la base sin tocar la aplicación.", tradeoff: "Acopla al detalle interno del motor y al orden del log.", drivers: ["Interoperabilidad", "Mantenibilidad"], costs: ["Portabilidad", "Consistencia"] },
      { name: "Vista materializada", problem: "Precalcula consultas caras para servirlas rápido.", tradeoff: "Hay que refrescarla, y mientras tanto está desactualizada.", drivers: ["Rendimiento"], costs: ["Consistencia", "Costo"] },
      { name: "Persistencia políglota", problem: "Cada tipo de dato en el motor que mejor lo sirve.", tradeoff: "Multiplica lo que el equipo debe operar, respaldar y monitorear.", drivers: ["Rendimiento", "Escalabilidad"], costs: ["Costo", "Mantenibilidad"] },
      { name: "Caché multinivel", problem: "Capas de caché (proceso, distribuida, CDN) para acercar el dato al consumidor.", tradeoff: "Invalidación coordinada entre niveles; incoherencias difíciles de reproducir.", drivers: ["Rendimiento", "Costo"], costs: ["Consistencia", "Observabilidad"] },
      { name: "Desnormalización dirigida", problem: "Duplica datos a propósito para eliminar joins en rutas críticas.", tradeoff: "Cada copia es una fuente de desincronización.", drivers: ["Rendimiento"], costs: ["Consistencia", "Mantenibilidad"] },
      { name: "Migración expand-contract", problem: "Cambia el esquema en pasos compatibles hacia atrás, sin ventana de indisponibilidad.", tradeoff: "Convivencia temporal de dos formas del dato y más pasos de despliegue.", drivers: ["Disponibilidad", "Mantenibilidad"], costs: ["TimeToMarket"] },
      { name: "Soft delete y versionado", problem: "Conserva historia y permite auditar o revertir.", tradeoff: "Todas las consultas deben filtrar; la tabla crece indefinidamente.", drivers: ["Cumplimiento", "Observabilidad"], costs: ["Rendimiento", "Costo"] },
      { name: "Índices de cobertura", problem: "El índice responde la consulta sin ir a la tabla.", tradeoff: "Cada índice encarece las escrituras y ocupa espacio.", drivers: ["Rendimiento"], costs: ["Costo"] },
      { name: "Particionamiento temporal", problem: "Divide la tabla por rango de fecha: las consultas recientes tocan una partición y el borrado histórico es un DROP.", tradeoff: "Consultas que cruzan particiones se degradan y hay que automatizar la creación de las futuras.", drivers: ["Rendimiento", "Costo", "Cumplimiento"], costs: ["Mantenibilidad"] },
      { name: "Archivado por niveles (tiering)", problem: "Mueve el dato frío a almacenamiento barato manteniéndolo consultable.", tradeoff: "Las consultas al nivel frío son órdenes de magnitud más lentas y hay que decidir el umbral.", drivers: ["Costo", "Cumplimiento"], costs: ["Rendimiento"] },
      { name: "Data lake / lakehouse", problem: "Almacena crudo y transforma después para analítica.", tradeoff: "Sin gobierno se convierte en un pantano de datos sin dueño.", drivers: ["Escalabilidad", "Costo"], costs: ["Mantenibilidad", "Cumplimiento"] },
      { name: "Consistencia eventual", problem: "Prioriza disponibilidad y partición sobre lectura inmediata coherente.", tradeoff: "El usuario ve estados intermedios: la UI tiene que estar diseñada para eso.", drivers: ["Disponibilidad", "Escalabilidad", "Rendimiento"], costs: ["Consistencia"] },
    ],
  },
  {
    id: "integracion",
    label: "Patrones de integración",
    blurb: "Cómo hablan entre sí los sistemas.",
    patterns: [
      { name: "Request-reply", problem: "Llamada sincrónica simple y fácil de razonar.", tradeoff: "Acopla la disponibilidad del llamador a la del llamado.", drivers: ["TimeToMarket", "Consistencia", "Observabilidad"], costs: ["Disponibilidad", "Resiliencia"] },
      { name: "Publish-subscribe", problem: "Un evento, muchos consumidores independientes.", tradeoff: "Nadie sabe quién consume qué sin un registro explícito.", drivers: ["Escalabilidad", "Mantenibilidad"], costs: ["Observabilidad", "Consistencia"] },
      { name: "Message router / content-based routing", problem: "Dirige mensajes según su contenido a distintos destinos.", tradeoff: "La lógica de negocio se filtra hacia la infraestructura de mensajería.", drivers: ["Escalabilidad", "Interoperabilidad"], costs: ["Mantenibilidad"] },
      { name: "Coreografía vs. orquestación", problem: "Decide si el flujo entre servicios lo dirige un coordinador explícito o emerge de los eventos que cada uno publica.", tradeoff: "La orquestación centraliza el conocimiento (y el punto de falla); la coreografía lo dispersa y deja el flujo sin dueño.", drivers: ["Mantenibilidad", "Escalabilidad"], costs: ["Observabilidad"] },
      { name: "Anti-corruption layer", problem: "Traduce el modelo de un sistema externo para que no contamine el dominio propio.", tradeoff: "Código de traducción que hay que mantener al ritmo del sistema externo.", drivers: ["Mantenibilidad", "Portabilidad"], costs: ["TimeToMarket"] },
      { name: "Contract testing", problem: "Verifica que productor y consumidor sigan compatibles sin integración completa.", tradeoff: "Requiere disciplina y un broker de contratos operando.", drivers: ["Testabilidad", "Interoperabilidad"], costs: ["Costo"] },
      { name: "Registro de esquemas", problem: "Los mensajes se validan contra un esquema versionado y compatible: un productor no puede romper a sus consumidores sin enterarse.", tradeoff: "Un servicio más en el camino crítico y un proceso de evolución de esquemas que respetar.", drivers: ["Interoperabilidad", "Consistencia"], costs: ["TimeToMarket", "Costo"] },
      { name: "Versionado de API", problem: "Evolucionar sin romper a los clientes existentes.", tradeoff: "Mantener varias versiones vivas multiplica el soporte.", drivers: ["Interoperabilidad", "Mantenibilidad"], costs: ["Costo"] },
      { name: "Webhook con reintentos firmados", problem: "Notifica a terceros de forma verificable y con reintentos.", tradeoff: "Hay que gestionar entregas fallidas y validar firmas en ambos lados.", drivers: ["Interoperabilidad", "Seguridad"], costs: ["Mantenibilidad"] },
      { name: "Polling con cursor", problem: "El consumidor pide cambios desde su última posición cuando no hay push.", tradeoff: "Latencia ligada al intervalo y carga constante aunque no haya novedades.", drivers: ["Resiliencia", "Interoperabilidad"], costs: ["Rendimiento", "Costo"] },
      { name: "Claim check", problem: "Envía una referencia en vez de una carga grande por el bus.", tradeoff: "Suma un almacén intermedio y su ciclo de vida.", drivers: ["Rendimiento", "Costo"], costs: ["Mantenibilidad"] },
    ],
  },
  {
    id: "observabilidad",
    label: "Patrones de observabilidad",
    blurb: "Cómo se sabe qué está pasando dentro del sistema — y, sobre todo, qué pasó.",
    patterns: [
      { name: "Identificador de correlación", problem: "Un id que viaja con la petición por todos los saltos: es lo que permite juntar después lo que ocurrió.", tradeoff: "Solo sirve si lo propagan absolutamente todos los tramos; uno que lo pierde corta la traza.", drivers: ["Observabilidad"], costs: [] },
      { name: "Trazas distribuidas", problem: "Reconstruye el árbol completo de llamadas de una petición con sus tiempos por tramo.", tradeoff: "Instrumentación en todo el stack, costo de almacenamiento y latencia añadida por el exportador.", drivers: ["Observabilidad", "Rendimiento"], costs: ["Costo"] },
      { name: "Logs estructurados", problem: "Eventos con campos consultables en vez de texto libre: se puede filtrar y agregar sin expresiones regulares.", tradeoff: "Obliga a un esquema de campos acordado; un log verboso se vuelve caro rápido.", drivers: ["Observabilidad", "Mantenibilidad"], costs: ["Costo"] },
      { name: "Métricas RED (tasa, errores, duración)", problem: "Las tres señales que describen la salud de un servicio desde la perspectiva de quien lo llama.", tradeoff: "Los promedios mienten: sin percentiles e histogramas se pierde justo la cola que duele.", drivers: ["Observabilidad", "Disponibilidad"], costs: [] },
      { name: "Métricas USE (uso, saturación, errores)", problem: "Las tres señales que describen la salud de un recurso: CPU, disco, pool de conexiones.", tradeoff: "Dicen que algo está saturado, no por qué; hay que cruzarlas con RED para llegar a la causa.", drivers: ["Observabilidad", "Rendimiento"], costs: [] },
      { name: "SLO y presupuesto de error", problem: "Fija cuánta falla es aceptable y convierte esa cifra en la regla que decide si se libera o se estabiliza.", tradeoff: "Requiere una medición confiable de lo que el usuario percibe, no de lo que el servidor cree.", drivers: ["Disponibilidad", "Observabilidad"], costs: ["TimeToMarket"] },
      { name: "Alertas por síntoma, no por causa", problem: "Se alerta sobre lo que el usuario sufre (latencia, errores) y no sobre cada métrica interna.", tradeoff: "Menos alertas pero más diagnóstico por delante: exige que las trazas y métricas ya estén ahí.", drivers: ["Disponibilidad", "Observabilidad"], costs: [] },
      { name: "Muestreo adaptativo", problem: "Guarda todas las trazas con error o lentas y una fracción del resto, para que la telemetría no cueste más que el sistema.", tradeoff: "El caso raro que no quedó muestreado es exactamente el que se va a necesitar.", drivers: ["Costo", "Observabilidad"], costs: ["Observabilidad"] },
      { name: "Perfilado continuo", problem: "Muestrea CPU y memoria en producción para saber dónde se va el tiempo sin reproducir la carga.", tradeoff: "Sobrecarga baja pero no nula, y símbolos de depuración que hay que conservar por versión.", drivers: ["Rendimiento", "Observabilidad"], costs: ["Costo"] },
    ],
  },
  {
    id: "seguridad",
    label: "Patrones de seguridad",
    blurb: "Cómo se protege el sistema y sus datos.",
    patterns: [
      { name: "Defensa en profundidad", problem: "Varias capas de control para que ninguna falla sea fatal por sí sola.", tradeoff: "Más superficie que configurar y mantener coherente.", drivers: ["Seguridad"], costs: ["Mantenibilidad", "Costo"] },
      { name: "Mínimo privilegio", problem: "Cada identidad puede solo lo que necesita.", tradeoff: "Gestión de permisos más fina y fricción operacional real.", drivers: ["Seguridad", "Cumplimiento"], costs: ["TimeToMarket"] },
      { name: "Zero trust", problem: "No se confía en la red: cada llamada se autentica y autoriza.", tradeoff: "Costo de identidad para servicios y latencia adicional por verificación.", drivers: ["Seguridad"], costs: ["Rendimiento", "Costo"] },
      { name: "mTLS entre servicios", problem: "Cada servicio prueba su identidad con certificado en ambos sentidos: el tráfico interno deja de ser confiable por estar adentro.", tradeoff: "Emisión, rotación y revocación de certificados como problema operacional permanente.", drivers: ["Seguridad", "Cumplimiento"], costs: ["Costo", "Mantenibilidad"] },
      { name: "Secretos externalizados", problem: "Credenciales fuera del código y del repositorio, con rotación.", tradeoff: "Dependencia dura de un gestor de secretos disponible en arranque.", drivers: ["Seguridad", "Cumplimiento"], costs: ["Disponibilidad"] },
      { name: "Cifrado en tránsito y en reposo", problem: "Protege los datos frente a intercepción y acceso físico.", tradeoff: "Gestión de llaves y su rotación; costo de CPU no siempre despreciable.", drivers: ["Seguridad", "Cumplimiento"], costs: ["Rendimiento"] },
      { name: "Tokens de corta vida + refresh", problem: "Reduce la ventana de uso de una credencial robada.", tradeoff: "Complejidad en clientes y necesidad de revocación real.", drivers: ["Seguridad"], costs: ["Mantenibilidad"] },
      { name: "Firma de artefactos y SBOM", problem: "Se verifica que lo que corre en producción es lo que se construyó, y se sabe qué dependencias trae dentro.", tradeoff: "Un paso más en cada build y un inventario que solo sirve si alguien lo revisa cuando sale un CVE.", drivers: ["Seguridad", "Cumplimiento"], costs: ["TimeToMarket"] },
      { name: "Auditoría inmutable", problem: "Registro no alterable de quién hizo qué y cuándo.", tradeoff: "Volumen de almacenamiento y política de retención que cumplir.", drivers: ["Cumplimiento", "Seguridad", "Observabilidad"], costs: ["Costo"] },
      { name: "Validación en el borde de confianza", problem: "Toda entrada externa se valida antes de tocar el dominio.", tradeoff: "Validación duplicada entre capas si no se define dónde vive la verdad.", drivers: ["Seguridad", "Mantenibilidad"], costs: [] },
    ],
  },
  {
    id: "despliegue",
    label: "Patrones de despliegue",
    blurb: "Cómo llega el cambio a producción sin romperla.",
    patterns: [
      { name: "Blue-green", problem: "Dos entornos idénticos y un cambio de tráfico instantáneo con rollback inmediato.", tradeoff: "Duplica infraestructura durante el despliegue; el estado compartido complica el corte.", drivers: ["Disponibilidad", "Resiliencia"], costs: ["Costo"] },
      { name: "Canary", problem: "Expone la versión nueva a una fracción del tráfico y mide antes de completar.", tradeoff: "Requiere métricas confiables y enrutado por porcentaje.", drivers: ["Disponibilidad", "Resiliencia"], costs: ["Observabilidad", "TimeToMarket"] },
      { name: "Dark launch / shadow traffic", problem: "La versión nueva recibe una copia del tráfico real sin responderle a nadie: se mide con carga de verdad y riesgo cero.", tradeoff: "Duplica el costo de cómputo durante la prueba y hay que aislar los efectos secundarios (no puede cobrar dos veces).", drivers: ["Resiliencia", "Rendimiento"], costs: ["Costo", "Mantenibilidad"] },
      { name: "Feature flags", problem: "Separa desplegar de liberar; permite apagar sin redeploy.", tradeoff: "Deuda de flags viejos y explosión combinatoria de caminos si no se limpian.", drivers: ["TimeToMarket", "Resiliencia"], costs: ["Mantenibilidad", "Testabilidad"] },
      { name: "Rolling update", problem: "Reemplaza instancias por tandas sin indisponibilidad.", tradeoff: "Conviven dos versiones: los contratos deben ser compatibles en ambos sentidos.", drivers: ["Disponibilidad", "Costo"], costs: ["Consistencia"] },
      { name: "Infraestructura como código", problem: "El entorno es reproducible y revisable como cualquier cambio.", tradeoff: "Otro lenguaje y otro estado que gestionar; la deriva manual lo invalida.", drivers: ["Mantenibilidad", "Portabilidad", "Cumplimiento"], costs: ["TimeToMarket"] },
      { name: "GitOps", problem: "El estado deseado del entorno vive en el repositorio y un agente lo reconcilia: el despliegue es un merge y el rollback un revert.", tradeoff: "Todo cambio urgente pasa por el repositorio, y la deriva manual se revierte sola aunque fuera intencional.", drivers: ["Mantenibilidad", "Observabilidad", "Cumplimiento"], costs: ["TimeToMarket"] },
      { name: "Despliegue inmutable", problem: "Nunca se modifica una instancia viva: se reemplaza por una nueva.", tradeoff: "Ciclos más lentos y necesidad de artefactos versionados.", drivers: ["Resiliencia", "Mantenibilidad"], costs: ["TimeToMarket"] },
    ],
  },
];

/** Todos los patrones aplanados, para búsqueda en la vista de referencia. */
export const ALL_PATTERNS = PATTERN_FAMILIES.flatMap((f) =>
  f.patterns.map((p) => ({ ...p, family: f.id, familyLabel: f.label })),
);

export type CatalogPattern = (typeof ALL_PATTERNS)[number];

/**
 * Patrones que empujan un atributo de calidad, ordenados por cuán enfocados están en él: primero
 * los que lo tienen como driver principal. Es lo que conecta el paso de drivers del wizard con
 * el catálogo — elegir "Resiliencia" debería poder responder "¿y entonces qué uso?".
 */
export function patternsForDriver(qaId: string): CatalogPattern[] {
  return ALL_PATTERNS.filter((p) => p.drivers.includes(qaId)).sort(
    (a, b) => a.drivers.indexOf(qaId) - b.drivers.indexOf(qaId),
  );
}

/**
 * Pares de drivers que tiran en direcciones opuestas, medidos sobre el catálogo: cuántos
 * patrones mejoran uno **a costa** del otro. Es la tensión que el usuario tiene que resolver
 * —CAP, latencia contra consistencia, costo contra disponibilidad— y verla antes de correr el
 * análisis evita pedir cinco atributos en 5 y esperar que no haya que ceder en nada.
 */
export function driverTensions(qaIds: string[]): { a: string; b: string; hits: number }[] {
  const pairs = new Map<string, number>();
  for (const p of ALL_PATTERNS) {
    for (const driver of p.drivers) {
      if (!qaIds.includes(driver)) continue;
      for (const cost of p.costs) {
        if (cost === driver || !qaIds.includes(cost)) continue;
        // La tensión no tiene dirección: se normaliza el par para no contarlo dos veces.
        const k = [driver, cost].sort().join(" ");
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
      }
    }
  }
  return [...pairs.entries()]
    .map(([k, hits]) => {
      const [a, b] = k.split(" ");
      return { a, b, hits };
    })
    .sort((x, y) => y.hits - x.hits);
}

/** Familias que más aportan a los drivers elegidos, de mayor a menor cobertura. */
export function familiesForDrivers(qaIds: string[]): { id: string; label: string; hits: number }[] {
  const counts = new Map<string, number>();
  for (const p of ALL_PATTERNS) {
    const hits = p.drivers.filter((d) => qaIds.includes(d)).length;
    if (hits > 0) counts.set(p.family, (counts.get(p.family) ?? 0) + hits);
  }
  return PATTERN_FAMILIES.map((f) => ({ id: f.id, label: f.label, hits: counts.get(f.id) ?? 0 }))
    .filter((f) => f.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

/** Artefactos que el wizard ofrece pedir. */
export const DELIVERABLES = [
  "ADR en formato MADR",
  "Matriz de trade-off ponderada",
  "Diagrama de contexto (C4 nivel 1)",
  "Diagrama de componentes",
  "Diagrama de secuencia del flujo crítico",
  "Diagrama de despliegue",
  "Modelo de datos (ER)",
  "Máquina de estados del proceso principal",
  "Registro de riesgos con mitigaciones",
  "Roadmap de implementación por fases",
  "Estimación de costo de operación",
  "Plan de migración desde el estado actual",
] as const;

/** Plantillas de arranque para el wizard: rellenan el brief con un caso típico. */
export interface BriefTemplate {
  id: string;
  label: string;
  description: string;
  /** Campos que se aplican sobre el brief vacío. */
  values: {
    title: string;
    problem: string;
    goals: string;
    qualityAttributes: { id: string; weight: number }[];
    patternFamilies: string[];
    candidateOptions: string[];
  };
}

export const BRIEF_TEMPLATES: BriefTemplate[] = [
  {
    id: "monolito-vs-micro",
    label: "Monolito vs. microservicios",
    description: "La decisión de granularidad de despliegue para un producto en crecimiento.",
    values: {
      title: "Definir la granularidad de despliegue del producto",
      problem: "El sistema actual está creciendo y no está claro si conviene mantenerlo como un solo despliegue o separarlo en servicios independientes.",
      goals: "Sostener el ritmo de entrega a medida que crece el equipo, sin disparar el costo de operación.",
      qualityAttributes: [
        { id: "TimeToMarket", weight: 5 },
        { id: "Mantenibilidad", weight: 4 },
        { id: "Escalabilidad", weight: 3 },
        { id: "Costo", weight: 4 },
      ],
      patternFamilies: ["arquitectonico", "integracion", "despliegue"],
      candidateOptions: ["Monolito modular", "Microservicios por capacidad de negocio", "Extracción incremental (strangler fig)"],
    },
  },
  {
    id: "mensajeria",
    label: "Elegir mensajería / streaming",
    description: "Cómo comunicar componentes de forma asíncrona y con qué garantías.",
    values: {
      title: "Elegir la plataforma de mensajería del sistema",
      problem: "Necesitamos comunicar componentes de forma asíncrona con garantías claras de entrega y orden, y hoy se resuelve con llamadas sincrónicas encadenadas.",
      goals: "Desacoplar productores de consumidores y soportar picos sin perder eventos.",
      qualityAttributes: [
        { id: "Resiliencia", weight: 5 },
        { id: "Consistencia", weight: 4 },
        { id: "Rendimiento", weight: 4 },
        { id: "Costo", weight: 3 },
      ],
      patternFamilies: ["integracion", "resiliencia", "concurrencia"],
      candidateOptions: ["Kafka", "RabbitMQ", "Cola gestionada del proveedor de nube", "Outbox + polling"],
    },
  },
  {
    id: "persistencia",
    label: "Elegir motor de persistencia",
    description: "Qué base de datos usar y con qué modelo de consistencia.",
    values: {
      title: "Elegir el motor de persistencia principal",
      problem: "Hay que decidir dónde vive el estado del sistema y con qué garantías de consistencia y escalabilidad.",
      goals: "Soportar el volumen proyectado a 24 meses con consultas predecibles y respaldo confiable.",
      qualityAttributes: [
        { id: "Consistencia", weight: 5 },
        { id: "Rendimiento", weight: 4 },
        { id: "Escalabilidad", weight: 4 },
        { id: "Costo", weight: 3 },
        { id: "Portabilidad", weight: 2 },
      ],
      patternFamilies: ["datos", "arquitectonico"],
      candidateOptions: ["PostgreSQL gestionado", "Base documental", "Motor distribuido tipo NewSQL", "Persistencia políglota"],
    },
  },
  {
    id: "modernizacion",
    label: "Modernizar un legado",
    description: "Cómo salir de un sistema antiguo sin detener el negocio.",
    values: {
      title: "Definir la estrategia de modernización del sistema legado",
      problem: "El sistema actual limita la velocidad de entrega y su stack ya no tiene soporte, pero no se puede detener la operación para reescribirlo.",
      goals: "Reducir el riesgo operacional y recuperar capacidad de cambio sin una reescritura big-bang.",
      qualityAttributes: [
        { id: "Disponibilidad", weight: 5 },
        { id: "Mantenibilidad", weight: 5 },
        { id: "Costo", weight: 4 },
        { id: "TimeToMarket", weight: 3 },
      ],
      patternFamilies: ["arquitectonico", "integracion", "despliegue", "datos"],
      candidateOptions: ["Strangler fig", "Reescritura completa", "Encapsular con API y congelar", "Rehost tal cual (lift & shift)"],
    },
  },
  {
    id: "multi-tenant",
    label: "Aislamiento multi-tenant",
    description: "Cuánto se comparte y cuánto se separa entre clientes de un SaaS.",
    values: {
      title: "Definir el modelo de aislamiento entre tenants",
      problem: "Varios clientes comparten la misma plataforma y no está definido qué se comparte y qué se aísla: hoy un cliente pesado degrada a los demás y no hay forma de garantizar la separación de sus datos.",
      goals: "Garantizar aislamiento de datos y de rendimiento entre clientes sin multiplicar el costo por cada uno.",
      qualityAttributes: [
        { id: "Seguridad", weight: 5 },
        { id: "Cumplimiento", weight: 4 },
        { id: "Costo", weight: 4 },
        { id: "Rendimiento", weight: 3 },
        { id: "Escalabilidad", weight: 3 },
      ],
      patternFamilies: ["datos", "seguridad", "arquitectonico", "despliegue"],
      candidateOptions: [
        "Base compartida con columna de tenant y RLS",
        "Un esquema por tenant",
        "Una base por tenant",
        "Despliegue completo por celda de clientes",
      ],
    },
  },
  {
    id: "observabilidad",
    label: "Estrategia de observabilidad",
    description: "Cómo saber qué pasó en producción sin reproducirlo.",
    values: {
      title: "Definir la estrategia de observabilidad de la plataforma",
      problem: "Cuando algo falla en producción, diagnosticarlo depende de que alguien recuerde dónde mirar. No hay trazas entre servicios, los logs son texto libre y las alertas avisan de causas que a nadie le importan mientras el usuario ya está afectado.",
      goals: "Reducir el tiempo de diagnóstico de un incidente y poder responder qué le pasó a una petición concreta sin reproducirla.",
      qualityAttributes: [
        { id: "Observabilidad", weight: 5 },
        { id: "Disponibilidad", weight: 4 },
        { id: "Costo", weight: 3 },
        { id: "Rendimiento", weight: 3 },
      ],
      patternFamilies: ["observabilidad", "resiliencia", "despliegue"],
      candidateOptions: [
        "Plataforma gestionada (SaaS de observabilidad)",
        "Stack propio sobre OpenTelemetry",
        "Solo métricas y logs, sin trazas, por costo",
      ],
    },
  },
];
