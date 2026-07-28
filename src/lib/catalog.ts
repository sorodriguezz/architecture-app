/**
 * Base de conocimiento embebida.
 *
 * Cumple dos funciones y por eso vive en el frontend y no en el prompt: alimenta los selectores
 * del wizard (para que el usuario elija atributos y familias sin escribirlos a mano) y es la
 * vista de referencia "Patrones", consultable sin gastar una corrida de IA.
 */

export interface QualityAttributeDef {
  id: string;
  label: string;
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
    description: "Qué fracción del tiempo el sistema responde correctamente.",
    sampleScenario: "Ante la caída de una zona de disponibilidad, el sistema sigue sirviendo el 100% del tráfico de lectura con degradación en escrituras, recuperando en menos de 5 minutos.",
  },
  {
    id: "Rendimiento",
    label: "Rendimiento / latencia",
    description: "Tiempo de respuesta y throughput bajo carga esperada y pico.",
    sampleScenario: "Con 500 req/s sostenidos, el p95 de la API de consulta se mantiene bajo 300 ms.",
  },
  {
    id: "Escalabilidad",
    label: "Escalabilidad",
    description: "Capacidad de absorber crecimiento sin rediseñar.",
    sampleScenario: "Ante un aumento de 10× en usuarios concurrentes, la capacidad se ajusta agregando instancias sin cambios de código.",
  },
  {
    id: "Seguridad",
    label: "Seguridad",
    description: "Protección de datos y accesos frente a actores maliciosos.",
    sampleScenario: "Ante un intento de acceso con credenciales robadas, el sistema exige segundo factor y registra el evento en auditoría en menos de 1 s.",
  },
  {
    id: "Mantenibilidad",
    label: "Mantenibilidad",
    description: "Costo de entender y cambiar el sistema.",
    sampleScenario: "Un desarrollador nuevo entrega un cambio de regla de negocio en producción dentro de su primera semana.",
  },
  {
    id: "Observabilidad",
    label: "Observabilidad",
    description: "Capacidad de diagnosticar qué pasó sin reproducir el problema.",
    sampleScenario: "Ante un error 500 reportado por un cliente, un ingeniero reconstruye la traza completa de la petición en menos de 10 minutos.",
  },
  {
    id: "Consistencia",
    label: "Consistencia de datos",
    description: "Qué garantías da el sistema sobre el estado que lee y escribe.",
    sampleScenario: "Tras confirmar un pago, cualquier lectura posterior del saldo refleja el cargo (lectura de las propias escrituras).",
  },
  {
    id: "Resiliencia",
    label: "Resiliencia / tolerancia a fallos",
    description: "Comportamiento cuando una dependencia falla o se degrada.",
    sampleScenario: "Ante un proveedor externo con latencia de 10 s, el sistema corta en 2 s y responde con datos en caché en vez de propagar el bloqueo.",
  },
  {
    id: "Costo",
    label: "Costo de operación",
    description: "Gasto recurrente de infraestructura y licencias.",
    sampleScenario: "El costo mensual de infraestructura se mantiene bajo USD 2.000 con el volumen proyectado a 12 meses.",
  },
  {
    id: "TimeToMarket",
    label: "Time to market",
    description: "Rapidez para poner la primera versión y para iterar después.",
    sampleScenario: "La primera versión utilizable está en producción en 8 semanas con el equipo actual.",
  },
  {
    id: "Portabilidad",
    label: "Portabilidad",
    description: "Qué tan atado queda el sistema a un proveedor o plataforma.",
    sampleScenario: "Migrar de proveedor de nube toma menos de un trimestre sin reescribir la lógica de negocio.",
  },
  {
    id: "Cumplimiento",
    label: "Cumplimiento normativo",
    description: "Requisitos legales y regulatorios que la arquitectura debe satisfacer.",
    sampleScenario: "Los datos personales de clientes residen en territorio nacional y toda lectura queda auditada por 5 años.",
  },
  {
    id: "Testabilidad",
    label: "Testabilidad",
    description: "Facilidad para verificar el comportamiento automáticamente.",
    sampleScenario: "La lógica de dominio se prueba sin levantar base de datos ni servicios externos.",
  },
  {
    id: "Interoperabilidad",
    label: "Interoperabilidad",
    description: "Capacidad de integrarse con sistemas de terceros.",
    sampleScenario: "Un socio nuevo se integra usando el contrato publicado sin cambios en nuestro código.",
  },
];

export interface PatternDef {
  name: string;
  /** Qué problema resuelve. */
  problem: string;
  /** Qué cuesta usarlo — la parte que se olvida y que hace falta para decidir. */
  tradeoff: string;
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
      { name: "Monolito modular", problem: "Un solo despliegue con límites internos claros; da orden sin el costo operacional de distribuir.", tradeoff: "Escala como una unidad: un módulo con demanda alta obliga a escalar todo." },
      { name: "Arquitectura en capas", problem: "Separa presentación, aplicación, dominio e infraestructura para aislar el cambio.", tradeoff: "Invita a capas anémicas y a que un cambio simple atraviese cuatro archivos." },
      { name: "Hexagonal (puertos y adaptadores)", problem: "El dominio no conoce a la infraestructura; la tecnología entra por adaptadores intercambiables.", tradeoff: "Más indirección y más tipos para el mismo comportamiento; se paga desde el día uno." },
      { name: "Clean architecture", problem: "Regla de dependencia hacia adentro: lo estable no depende de lo volátil.", tradeoff: "Ceremonia alta en dominios simples; equipos junior tienden a aplicarla mecánicamente." },
      { name: "Microservicios", problem: "Servicios desplegables por separado, alineados a capacidades de negocio y a equipos.", tradeoff: "Cambia complejidad de código por complejidad operacional: red, consistencia eventual, observabilidad distribuida, versionado de contratos." },
      { name: "Event-driven", problem: "Los componentes reaccionan a eventos en vez de llamarse; desacopla productor y consumidor.", tradeoff: "El flujo deja de ser legible en el código y hay que reconstruirlo desde trazas." },
      { name: "CQRS", problem: "Separa el modelo de escritura del de lectura cuando sus necesidades divergen.", tradeoff: "Dos modelos que mantener y consistencia eventual entre ellos visible para el usuario." },
      { name: "Event sourcing", problem: "El estado es la reducción de un log de eventos inmutable; da auditoría e historia completas.", tradeoff: "Versionado de eventos, replays lentos y una curva de aprendizaje real para el equipo." },
      { name: "Saga", problem: "Transacciones de negocio largas entre servicios usando pasos compensables en vez de 2PC.", tradeoff: "Cada paso necesita su compensación, y hay estados intermedios visibles." },
      { name: "BFF (backend for frontend)", problem: "Una capa por tipo de cliente que agrega y adapta lo que ese cliente necesita.", tradeoff: "Un backend más por mantener y riesgo de duplicar lógica entre BFFs." },
      { name: "API Gateway", problem: "Punto único de entrada: enrutado, autenticación, límites de tasa y agregación.", tradeoff: "Punto único de falla y de contención organizacional si concentra lógica de negocio." },
      { name: "Service mesh", problem: "mTLS, reintentos, circuit breaking y telemetría fuera del código de aplicación.", tradeoff: "Otra capa que operar y depurar; sobra por debajo de cierta cantidad de servicios." },
      { name: "Strangler fig", problem: "Reemplaza un legado por partes, redirigiendo tráfico funcionalidad por funcionalidad.", tradeoff: "Convivencia larga de dos sistemas y una capa de enrutado que hay que mantener." },
      { name: "Sidecar", problem: "Capacidades transversales en un proceso adjunto al servicio, sin tocarlo.", tradeoff: "Duplica consumo de recursos por instancia y acopla ciclos de vida." },
      { name: "Pipes and filters", problem: "Procesamiento en etapas independientes y recombinables.", tradeoff: "La latencia extremo a extremo es la suma de etapas y el manejo de errores se dispersa." },
      { name: "Serverless / FaaS", problem: "Ejecución bajo demanda sin administrar servidores; se paga por uso real.", tradeoff: "Arranques en frío, límites de tiempo, amarre al proveedor y depuración local incómoda." },
      { name: "Space-based", problem: "Estado en una grilla en memoria replicada, para cargas con picos extremos.", tradeoff: "Complejidad alta y modelo de consistencia difícil de razonar." },
      { name: "Modular monolith → microservicios", problem: "Empezar monolítico con límites explícitos y extraer solo lo que la evidencia justifique.", tradeoff: "Requiere disciplina sostenida: sin ella los límites se erosionan y no queda nada que extraer." },
    ],
  },
  {
    id: "diseno",
    label: "Patrones de diseño",
    blurb: "Resuelven problemas recurrentes dentro de un componente.",
    patterns: [
      { name: "Factory / Abstract Factory", problem: "Crear objetos sin acoplar al cliente con la clase concreta.", tradeoff: "Una indirección más; injustificada si nunca hay una segunda implementación." },
      { name: "Builder", problem: "Construir objetos con muchos parámetros opcionales sin constructores telescópicos.", tradeoff: "Más código para el mismo tipo; puede permitir estados intermedios inválidos." },
      { name: "Strategy", problem: "Intercambiar algoritmos en tiempo de ejecución.", tradeoff: "Dispersa la lógica en varias clases; cuesta más leerla completa." },
      { name: "Adapter", problem: "Hacer encajar una interfaz ajena con la que el sistema espera.", tradeoff: "Puede esconder incompatibilidades semánticas reales tras una firma que calza." },
      { name: "Decorator", problem: "Agregar comportamiento sin modificar ni heredar del original.", tradeoff: "Cadenas largas vuelven ilegible el stack trace." },
      { name: "Observer", problem: "Notificar a interesados sin que el emisor los conozca.", tradeoff: "Flujo implícito; fácil filtrar memoria si nadie desuscribe." },
      { name: "Command", problem: "Encapsular una acción como objeto: permite deshacer, encolar y auditar.", tradeoff: "Una clase por acción; el crecimiento es lineal en cantidad de archivos." },
      { name: "Repository", problem: "Aísla el dominio del mecanismo de persistencia.", tradeoff: "Abstracción con fugas: paginación, transacciones y consultas complejas siempre terminan asomando." },
      { name: "Unit of Work", problem: "Agrupa cambios y los confirma como una sola transacción.", tradeoff: "El ciclo de vida y el ámbito de la unidad son fuente frecuente de bugs sutiles." },
      { name: "Specification", problem: "Reglas de negocio componibles y reutilizables como objetos.", tradeoff: "Traducirlas a consultas eficientes suele ser difícil." },
      { name: "State", problem: "El comportamiento cambia con el estado, sin condicionales gigantes.", tradeoff: "Explosión de clases si los estados son muchos." },
      { name: "Template Method", problem: "Fija el esqueleto de un algoritmo y deja variar los pasos.", tradeoff: "Acopla por herencia; la composición suele envejecer mejor." },
      { name: "Mediator", problem: "Centraliza la comunicación entre componentes que si no se conocerían entre sí.", tradeoff: "El mediador tiende a convertirse en un objeto-dios." },
      { name: "Chain of Responsibility", problem: "Varios manejadores en cadena hasta que uno atiende la solicitud.", tradeoff: "Es difícil saber quién atendió qué sin instrumentar la cadena." },
      { name: "Null Object", problem: "Un objeto neutro que evita chequeos de nulo repartidos.", tradeoff: "Puede enmascarar un error real como comportamiento silencioso." },
      { name: "Value Object", problem: "Modela conceptos por su valor, inmutables y auto-validados.", tradeoff: "Más tipos; costo de asignación si son muy numerosos en rutas calientes." },
      { name: "Aggregate (DDD)", problem: "Define el límite de consistencia transaccional del dominio.", tradeoff: "Agregados grandes generan contención; chicos obligan a coordinar entre ellos." },
      { name: "Domain Events", problem: "El dominio publica lo que ocurrió y otros reaccionan sin acoplarse.", tradeoff: "El orden y la entrega dejan de ser triviales apenas cruzan proceso." },
    ],
  },
  {
    id: "resiliencia",
    label: "Patrones de resiliencia",
    blurb: "Qué hace el sistema cuando algo de lo que depende falla.",
    patterns: [
      { name: "Circuit breaker", problem: "Deja de llamar a una dependencia que está fallando, en vez de agotar recursos esperándola.", tradeoff: "Umbrales mal calibrados abren el circuito con fallas transitorias normales." },
      { name: "Retry con backoff exponencial y jitter", problem: "Reintenta fallas transitorias espaciando los intentos y desincronizando a los clientes.", tradeoff: "Sin idempotencia, duplica efectos; sin jitter, sincroniza a todos en una estampida." },
      { name: "Timeout", problem: "Acota cuánto se espera: sin timeout no hay resiliencia posible.", tradeoff: "Muy corto corta operaciones sanas; muy largo no protege de nada." },
      { name: "Bulkhead", problem: "Aísla recursos por dependencia para que una lenta no consuma todo el pool.", tradeoff: "Utilización total menor: cada compartimento reserva capacidad que no comparte." },
      { name: "Rate limiting / throttling", problem: "Protege al sistema y reparte capacidad entre clientes.", tradeoff: "Necesita estado compartido para ser exacto en un despliegue distribuido." },
      { name: "Fallback / degradación elegante", problem: "Responder algo útil y peor antes que nada.", tradeoff: "Puede ocultar una caída real si no se mide cuántas respuestas son degradadas." },
      { name: "Cache-aside", problem: "Reduce carga y latencia sirviendo desde caché lo que se repite.", tradeoff: "Invalidación y datos rancios; una estampida al expirar una clave caliente." },
      { name: "Idempotencia", problem: "Repetir la misma operación no cambia el resultado: es lo que hace seguros a los reintentos.", tradeoff: "Requiere clave de idempotencia y almacenamiento de resultados ya procesados." },
      { name: "Dead letter queue", problem: "Aparta los mensajes que fallan repetidamente para que no bloqueen la cola.", tradeoff: "Sin alertas y proceso de reproceso, la DLQ se vuelve un cementerio silencioso." },
      { name: "Outbox transaccional", problem: "Publicar un evento y confirmar la transacción sin escritura dual ni pérdida.", tradeoff: "Un proceso relay más y entrega al-menos-una-vez que obliga a consumidores idempotentes." },
      { name: "Health checks (liveness/readiness)", problem: "Permite al orquestador sacar de rotación o reiniciar instancias enfermas.", tradeoff: "Un check que consulta dependencias propaga la falla en vez de contenerla." },
      { name: "Load shedding", problem: "Rechaza tráfico de baja prioridad en saturación para salvar el resto.", tradeoff: "Hay que decidir y comunicar qué se sacrifica antes de que ocurra." },
      { name: "Backpressure", problem: "El consumidor le dice al productor que baje el ritmo en vez de acumular.", tradeoff: "Debe propagarse por toda la cadena; un solo tramo sin ella anula el mecanismo." },
      { name: "Chaos engineering", problem: "Provoca fallas controladas para validar que las defensas funcionan de verdad.", tradeoff: "Necesita madurez de observabilidad y de respuesta antes de ser seguro." },
      { name: "Redundancia activa/pasiva", problem: "Instancias de respaldo listas para tomar el tráfico.", tradeoff: "Duplica costo; el failover no probado es un failover que no funciona." },
    ],
  },
  {
    id: "concurrencia",
    label: "Patrones de concurrencia",
    blurb: "Cómo se reparte y coordina el trabajo simultáneo.",
    patterns: [
      { name: "Worker pool", problem: "Un número acotado de trabajadores consume de una cola compartida.", tradeoff: "Dimensionar el pool es empírico; mal calibrado subutiliza o satura." },
      { name: "Productor-consumidor", problem: "Desacopla la generación del procesamiento con una cola en medio.", tradeoff: "Una cola sin límite convierte un problema de latencia en uno de memoria." },
      { name: "Modelo de actores", problem: "Estado encapsulado por actor y comunicación solo por mensajes: sin memoria compartida.", tradeoff: "Los deadlocks se vuelven bloqueos por mensajes y el debugging cambia de forma." },
      { name: "Fork-join", problem: "Divide el trabajo, procesa en paralelo y combina resultados.", tradeoff: "Solo rinde si las partes son parejas; la más lenta define el total." },
      { name: "Pipeline", problem: "Etapas concurrentes donde la salida de una alimenta a la siguiente.", tradeoff: "El throughput lo fija la etapa más lenta." },
      { name: "Leader election", problem: "Garantiza que solo una instancia ejecute una tarea única en el clúster.", tradeoff: "Necesita un servicio de consenso y manejo de split-brain." },
      { name: "Bloqueo optimista", problem: "Detecta conflictos al escribir con versión, sin bloquear al leer.", tradeoff: "Con alta contención el reintento constante se vuelve peor que bloquear." },
      { name: "Bloqueo pesimista", problem: "Toma el lock antes de trabajar cuando el conflicto es lo esperable.", tradeoff: "Reduce concurrencia y abre la puerta a deadlocks." },
      { name: "Compare-and-swap", problem: "Actualización atómica sin locks para contadores y punteros.", tradeoff: "Solo sirve para operaciones muy acotadas; sufre con contención alta." },
      { name: "Read-write lock", problem: "Muchos lectores concurrentes, un escritor exclusivo.", tradeoff: "Puede matar de hambre a los escritores si las lecturas nunca cesan." },
      { name: "Batching", problem: "Agrupa operaciones para amortizar el costo fijo por llamada.", tradeoff: "Agrega latencia al primer elemento del lote." },
      { name: "Sharding por clave", problem: "Particiona el trabajo por clave para que cada partición sea de un solo hilo.", tradeoff: "Claves calientes desbalancean y el rebalanceo es una operación delicada." },
      { name: "Hashing consistente", problem: "Reparte claves entre nodos minimizando el movimiento al agregar o quitar uno.", tradeoff: "Necesita nodos virtuales para no desbalancear." },
      { name: "Idempotent consumer", problem: "El consumidor tolera entregas repetidas registrando lo ya procesado.", tradeoff: "Requiere almacenamiento adicional y una política de expiración." },
    ],
  },
  {
    id: "datos",
    label: "Patrones de datos",
    blurb: "Dónde vive el estado y cómo se lee, escribe y evoluciona.",
    patterns: [
      { name: "Réplicas de lectura", problem: "Escala lecturas separándolas del primario.", tradeoff: "Retraso de replicación: se leen datos viejos justo después de escribir." },
      { name: "Sharding", problem: "Reparte los datos entre nodos cuando uno solo no alcanza.", tradeoff: "Consultas y transacciones entre shards se vuelven caras o imposibles." },
      { name: "CDC (change data capture)", problem: "Propaga cambios desde el log de la base sin tocar la aplicación.", tradeoff: "Acopla al detalle interno del motor y al orden del log." },
      { name: "Vista materializada", problem: "Precalcula consultas caras para servirlas rápido.", tradeoff: "Hay que refrescarla, y mientras tanto está desactualizada." },
      { name: "Persistencia políglota", problem: "Cada tipo de dato en el motor que mejor lo sirve.", tradeoff: "Multiplica lo que el equipo debe operar, respaldar y monitorear." },
      { name: "Caché multinivel", problem: "Capas de caché (proceso, distribuida, CDN) para acercar el dato al consumidor.", tradeoff: "Invalidación coordinada entre niveles; incoherencias difíciles de reproducir." },
      { name: "Desnormalización dirigida", problem: "Duplica datos a propósito para eliminar joins en rutas críticas.", tradeoff: "Cada copia es una fuente de desincronización." },
      { name: "Migración expand-contract", problem: "Cambia el esquema en pasos compatibles hacia atrás, sin ventana de indisponibilidad.", tradeoff: "Convivencia temporal de dos formas del dato y más pasos de despliegue." },
      { name: "Soft delete y versionado", problem: "Conserva historia y permite auditar o revertir.", tradeoff: "Todas las consultas deben filtrar; la tabla crece indefinidamente." },
      { name: "Índices de cobertura", problem: "El índice responde la consulta sin ir a la tabla.", tradeoff: "Cada índice encarece las escrituras y ocupa espacio." },
      { name: "Data lake / lakehouse", problem: "Almacena crudo y transforma después para analítica.", tradeoff: "Sin gobierno se convierte en un pantano de datos sin dueño." },
      { name: "Consistencia eventual", problem: "Prioriza disponibilidad y partición sobre lectura inmediata coherente.", tradeoff: "El usuario ve estados intermedios: la UI tiene que estar diseñada para eso." },
    ],
  },
  {
    id: "integracion",
    label: "Patrones de integración",
    blurb: "Cómo hablan entre sí los sistemas.",
    patterns: [
      { name: "Request-reply", problem: "Llamada sincrónica simple y fácil de razonar.", tradeoff: "Acopla la disponibilidad del llamador a la del llamado." },
      { name: "Publish-subscribe", problem: "Un evento, muchos consumidores independientes.", tradeoff: "Nadie sabe quién consume qué sin un registro explícito." },
      { name: "Message router / content-based routing", problem: "Dirige mensajes según su contenido a distintos destinos.", tradeoff: "La lógica de negocio se filtra hacia la infraestructura de mensajería." },
      { name: "Anti-corruption layer", problem: "Traduce el modelo de un sistema externo para que no contamine el dominio propio.", tradeoff: "Código de traducción que hay que mantener al ritmo del sistema externo." },
      { name: "Contract testing", problem: "Verifica que productor y consumidor sigan compatibles sin integración completa.", tradeoff: "Requiere disciplina y un broker de contratos operando." },
      { name: "Versionado de API", problem: "Evolucionar sin romper a los clientes existentes.", tradeoff: "Mantener varias versiones vivas multiplica el soporte." },
      { name: "Webhook con reintentos firmados", problem: "Notifica a terceros de forma verificable y con reintentos.", tradeoff: "Hay que gestionar entregas fallidas y validar firmas en ambos lados." },
      { name: "Polling con cursor", problem: "El consumidor pide cambios desde su última posición cuando no hay push.", tradeoff: "Latencia ligada al intervalo y carga constante aunque no haya novedades." },
      { name: "Claim check", problem: "Envía una referencia en vez de una carga grande por el bus.", tradeoff: "Suma un almacén intermedio y su ciclo de vida." },
    ],
  },
  {
    id: "seguridad",
    label: "Patrones de seguridad",
    blurb: "Cómo se protege el sistema y sus datos.",
    patterns: [
      { name: "Defensa en profundidad", problem: "Varias capas de control para que ninguna falla sea fatal por sí sola.", tradeoff: "Más superficie que configurar y mantener coherente." },
      { name: "Mínimo privilegio", problem: "Cada identidad puede solo lo que necesita.", tradeoff: "Gestión de permisos más fina y fricción operacional real." },
      { name: "Zero trust", problem: "No se confía en la red: cada llamada se autentica y autoriza.", tradeoff: "Costo de identidad para servicios y latencia adicional por verificación." },
      { name: "Secretos externalizados", problem: "Credenciales fuera del código y del repositorio, con rotación.", tradeoff: "Dependencia dura de un gestor de secretos disponible en arranque." },
      { name: "Cifrado en tránsito y en reposo", problem: "Protege los datos frente a intercepción y acceso físico.", tradeoff: "Gestión de llaves y su rotación; costo de CPU no siempre despreciable." },
      { name: "Tokens de corta vida + refresh", problem: "Reduce la ventana de uso de una credencial robada.", tradeoff: "Complejidad en clientes y necesidad de revocación real." },
      { name: "Auditoría inmutable", problem: "Registro no alterable de quién hizo qué y cuándo.", tradeoff: "Volumen de almacenamiento y política de retención que cumplir." },
      { name: "Validación en el borde de confianza", problem: "Toda entrada externa se valida antes de tocar el dominio.", tradeoff: "Validación duplicada entre capas si no se define dónde vive la verdad." },
    ],
  },
  {
    id: "despliegue",
    label: "Patrones de despliegue",
    blurb: "Cómo llega el cambio a producción sin romperla.",
    patterns: [
      { name: "Blue-green", problem: "Dos entornos idénticos y un cambio de tráfico instantáneo con rollback inmediato.", tradeoff: "Duplica infraestructura durante el despliegue; el estado compartido complica el corte." },
      { name: "Canary", problem: "Expone la versión nueva a una fracción del tráfico y mide antes de completar.", tradeoff: "Requiere métricas confiables y enrutado por porcentaje." },
      { name: "Feature flags", problem: "Separa desplegar de liberar; permite apagar sin redeploy.", tradeoff: "Deuda de flags viejos y explosión combinatoria de caminos si no se limpian." },
      { name: "Rolling update", problem: "Reemplaza instancias por tandas sin indisponibilidad.", tradeoff: "Conviven dos versiones: los contratos deben ser compatibles en ambos sentidos." },
      { name: "Infraestructura como código", problem: "El entorno es reproducible y revisable como cualquier cambio.", tradeoff: "Otro lenguaje y otro estado que gestionar; la deriva manual lo invalida." },
      { name: "Despliegue inmutable", problem: "Nunca se modifica una instancia viva: se reemplaza por una nueva.", tradeoff: "Ciclos más lentos y necesidad de artefactos versionados." },
    ],
  },
];

/** Todos los patrones aplanados, para búsqueda en la vista de referencia. */
export const ALL_PATTERNS = PATTERN_FAMILIES.flatMap((f) =>
  f.patterns.map((p) => ({ ...p, family: f.id, familyLabel: f.label })),
);

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
];
