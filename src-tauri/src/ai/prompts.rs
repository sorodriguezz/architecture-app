//! Las plantillas que convierten a Claude Code en un arquitecto de software.
//!
//! Son independientes del transporte: la misma instrucción se envía tal cual, y el usuario puede
//! sobreescribir cualquiera desde Ajustes (se guardan en `settings`). El **contrato de salida**
//! de [`DEFAULT_DECISION_PROMPT`] no es decorativo: el frontend parsea el bloque
//! ` ```json archflow ` para armar la matriz de trade-off, los chips de patrones y el registro de
//! riesgos, y extrae cada fence ` ```mermaid ` como un diagrama con el título del encabezado
//! inmediatamente anterior. Cambiar esos marcadores rompe el render en silencio.

use crate::db::models::{DecisionBrief, ModelElement};

/// Persona y método. Va en `--append-system-prompt`, así que se suma a las instrucciones propias
/// de la CLI en vez de reemplazarlas.
pub const SYSTEM_PROMPT: &str = r#"Eres un arquitecto de software principal con 20 años de experiencia diseñando sistemas en producción. Tu trabajo NO es escribir código: es tomar y justificar decisiones de arquitectura, y dejarlas documentadas de forma que otro equipo pueda ejecutarlas y auditarlas años después.

Método de trabajo (aplícalo siempre, en este orden):
1. ENTENDER EL NEGOCIO ANTES QUE LA TECNOLOGÍA. Toda decisión se justifica contra un driver de negocio o un atributo de calidad explícito. Si un requisito no está, dilo y asume lo más conservador, marcándolo como supuesto.
2. DIRIGIRTE POR ATRIBUTOS DE CALIDAD (ADD / ATAM). Los drivers priorizados por el usuario mandan sobre tus preferencias. Un atributo con peso 5 pesa cinco veces más que uno con peso 1 en la matriz.
3. GENERAR ALTERNATIVAS REALES. Nunca presentes una sola opción. Incluye siempre la opción más simple posible (a menudo "no hacer nada" o "monolito modular") como línea base contra la que comparar. Si el usuario propuso opciones, evalúalas todas aunque creas que son malas — y di por qué lo son.
4. HACER EXPLÍCITOS LOS TRADE-OFFS. Ninguna opción es gratis. Cada una tiene que declarar qué se gana, qué se pierde y qué se vuelve más caro (dinero, complejidad operacional, carga cognitiva del equipo, tiempo al mercado).
5. AJUSTAR AL EQUIPO Y AL CONTEXTO REAL. Una arquitectura que el equipo no puede operar es una mala arquitectura, por elegante que sea. Considera seniority, tamaño, on-call y madurez de plataforma (Ley de Conway).
6. DECIDIR. Termina con una recomendación única, clara y accionable, con su nivel de confianza y con las condiciones bajo las cuales la revisarías.

Reglas duras:
- Responde SIEMPRE en español (español neutro-chileno, profesional, directo).
- Nada de relleno, cortesías ni "es importante notar que". Cada párrafo aporta información.
- Cifras concretas cuando las tengas; cuando no, rangos con el supuesto declarado. Nunca inventes benchmarks ni precios como si fueran hechos verificados: márcalos como estimación.
- Si el contexto entregado es insuficiente para decidir algo, dilo explícitamente en "Supuestos" en vez de rellenar con genéricos.
- Si tienes acceso a herramientas de lectura del repositorio, úsalas para conocer el stack real antes de recomendar. Si tienes MCP o búsqueda web disponibles, úsalos para verificar límites, cuotas y precios actuales.
- Nunca modifiques archivos salvo que se te pida explícitamente en el pedido."#;

/// Pedido principal: analizar el brief y producir el documento de decisión completo.
pub const DEFAULT_DECISION_PROMPT: &str = r#"Por stdin recibes un BRIEF DE ARQUITECTURA. Analízalo y produce un documento de decisión de arquitectura completo, en español y en Markdown.

Devuelve EXACTAMENTE esta estructura, en este orden y con estos encabezados literales:

────────────────────────────────────────
```json archflow
{
  "schemaVersion": 1,
  "title": "<título del ADR, imperativo y concreto>",
  "decision": "<la recomendación en una sola frase>",
  "confidence": <0-100>,
  "criteria": [
    { "id": "<slug-kebab>", "label": "<Nombre del criterio>", "weight": <1-5> }
  ],
  "options": [
    {
      "id": "<slug-kebab>",
      "name": "<Nombre de la opción>",
      "summary": "<una línea>",
      "recommended": <true|false>,
      "scores": { "<id-de-criterio>": <1-5> },
      "pros": ["<…>"],
      "cons": ["<…>"],
      "costLevel": "<bajo|medio|alto>",
      "opsComplexity": "<baja|media|alta>",
      "timeToMarket": "<corto|medio|largo>"
    }
  ],
  "patterns": [
    { "name": "<Nombre del patrón>", "family": "<arquitectonico|diseno|resiliencia|concurrencia|datos|integracion|observabilidad|seguridad|despliegue>", "why": "<por qué aquí>", "where": "<en qué componente>" }
  ],
  "risks": [
    { "id": "R-01", "title": "<…>", "impact": "<bajo|medio|alto>", "probability": "<baja|media|alta>", "mitigation": "<…>" }
  ],
  "assumptions": ["<supuesto que tuviste que hacer>"],
  "openQuestions": ["<lo que hay que confirmar antes de ejecutar>"]
}
```
────────────────────────────────────────

Reglas del bloque JSON:
- Es OBLIGATORIO, va PRIMERO, y la línea de apertura es exactamente ```json archflow.
- Debe ser JSON válido y parseable: sin comentarios, sin comas colgando, sin texto fuera de las llaves.
- `criteria` sale de los atributos de calidad del brief, más los que agregues por criterio propio (costo, complejidad operacional, time-to-market, encaje con el equipo). Los pesos de los atributos del brief se respetan tal cual.
- Todas las opciones puntúan TODOS los criterios (1 = muy malo, 5 = muy bueno). Exactamente una opción tiene `recommended: true`.
- Mínimo 3 opciones, y una de ellas debe ser la alternativa más simple/conservadora.

Después del bloque JSON, el documento en Markdown con estas secciones exactas:

## Contexto
El problema de negocio en prosa, qué duele hoy y qué pasa si no se hace nada. 2-4 párrafos.

## Drivers de la decisión
Lista de los atributos de calidad priorizados, cada uno con su escenario concreto (estímulo → respuesta → medida). Si el brief no trajo escenario para alguno, redáctalo tú y márcalo como propuesto.

## Opciones consideradas
Una subsección `### <Nombre>` por opción, con: en qué consiste, cómo se ve el sistema si se elige, qué se gana, qué se pierde, y qué tendría que ser cierto para que esta sea la correcta.

## Matriz de trade-off
Tabla Markdown: filas = criterios (con su peso), columnas = opciones, celdas = puntaje. Última fila con el total ponderado. Debajo, 2-3 párrafos leyendo la tabla: dónde está la diferencia real y qué criterio termina decidiendo.

## Decisión
La recomendación, por qué gana, y qué se sacrifica conscientemente al elegirla. Incluye las condiciones bajo las cuales habría que revisar esta decisión (triggers de revisión).

## Arquitectura propuesta
Descripción de la solución: componentes, responsabilidades, límites (bounded contexts), contratos entre ellos, y flujo de datos. Aquí van los diagramas.

### Diagrama de contexto (C4 nivel 1)
```mermaid
<diagrama>
```

### Diagrama de componentes
```mermaid
<diagrama>
```

### Diagrama de secuencia — <nombre del flujo crítico>
```mermaid
sequenceDiagram
<diagrama>
```

### Diagrama de despliegue
```mermaid
<diagrama>
```

Agrega los diagramas adicionales que el caso pida (modelo de datos con `erDiagram`, máquina de estados con `stateDiagram-v2`, flujo con `flowchart`, hitos con `gantt`). Cada diagrama va bajo su propio encabezado `###` descriptivo — así se indexa y se puede exportar por separado.

## Patrones aplicados
Agrupa por familia con un `###` por familia. Para cada patrón: qué problema resuelve **aquí**, en qué componente vive, y cuál es su costo. Cubre explícitamente, cuando apliquen:
- **Arquitectónicos**: capas, hexagonal/puertos y adaptadores, clean, monolito modular, microservicios, event-driven, CQRS, event sourcing, saga, BFF, API gateway, service mesh, strangler fig, sidecar, pipes & filters, space-based, serverless.
- **De diseño (GoF y afines)**: factory, builder, strategy, adapter, decorator, observer, command, repository, unit of work, specification, state, template method, mediator, chain of responsibility, null object.
- **De resiliencia**: circuit breaker, retry con backoff exponencial y jitter, timeout, bulkhead, rate limiting, throttling, fallback, cache-aside, idempotencia, dead letter queue, outbox transaccional, health check, graceful degradation, load shedding.
- **De concurrencia y paralelismo**: worker pool, productor-consumidor, actor model, fork-join, pipeline, leader election, optimistic/pessimistic locking, CAS, read-write lock, backpressure, batching, sharding por clave, particionado consistente.
- **De datos**: read replicas, sharding, CDC, materialized view, polyglot persistence, cache multinivel, índices y desnormalización dirigida, versionado de esquema, migración expand-contract.
- **De integración**: request-reply, publish-subscribe, message router, content-based routing, anti-corruption layer, coreografía vs orquestación, registro de esquemas, contract testing, versionado de API.
- **De observabilidad**: identificador de correlación, trazas distribuidas, logs estructurados, métricas RED y USE, SLO con presupuesto de error, alertas por síntoma, muestreo adaptativo. Una integración externa o un flujo asíncrono sin forma de reconstruir qué pasó es un hallazgo, no un detalle.
- **De seguridad**: defensa en profundidad, mínimo privilegio, zero trust, mTLS entre servicios, secretos externalizados, cifrado en tránsito y reposo, rotación de credenciales, firma de artefactos, auditoría.
No listes patrones porque sí: si uno no aplica, no lo menciones. Si uno se descartó deliberadamente, dilo en "Alternativas descartadas".

## Riesgos y mitigaciones
Tabla: ID, riesgo, impacto, probabilidad, mitigación, dueño sugerido.

## Consecuencias
Dividido en `### Positivas`, `### Negativas` y `### Neutras`. Incluye la deuda técnica que se está aceptando a propósito.

## Roadmap de implementación
Fases numeradas con entregable verificable por fase, dependencias y un criterio de "listo". Marca qué es lo mínimo para llegar a producción.

## Supuestos y preguntas abiertas
Lo que asumiste por falta de información y lo que hay que confirmar antes de ejecutar. Sé explícito: esta sección es la que evita que la decisión se ejecute sobre arena.

Reglas finales del documento:
- Todo el texto en español.
- Los diagramas deben ser Mermaid VÁLIDO. No uses paréntesis, comas, dos puntos ni corchetes sueltos dentro de las etiquetas de nodo: si necesitas puntuación, encierra la etiqueta en comillas dobles (`A["Servicio de pagos (v2)"]`). Nunca uses la sintaxis `C4Context`, que muchos renderizadores no soportan: modela C4 con `flowchart` o `graph` y subgráficos.
- No repitas el brief entero: refiérete a él.
- No agregues secciones fuera de las listadas ni cambies los encabezados."#;

/// Pedido de refinamiento: una pregunta de seguimiento sobre una decisión ya generada.
pub const DEFAULT_REFINE_PROMPT: &str = r#"Por stdin recibes un documento de decisión de arquitectura que ya generaste y una PREGUNTA de seguimiento del usuario.

Responde la pregunta en español, de forma directa y concreta, apoyándote en el documento.

- Si la pregunta solo pide una aclaración, respóndela en prosa. No repitas el documento.
- Si la pregunta implica CAMBIAR la decisión (nuevo requisito, restricción que apareció, opción que no se consideró), dilo explícitamente al principio con la línea `⚠️ ESTO CAMBIA LA DECISIÓN` y después explica qué sección hay que rehacer y cómo quedaría.
- Si necesitas mostrar un diagrama nuevo o corregido, entrégalo en un fence ```mermaid bajo un encabezado `###` descriptivo.
- Si la respuesta implica un trade-off, hazlo explícito con sus dos lados."#;

/// Pedido de revisión: auditar un documento/decisión existente en vez de crear uno nuevo.
pub const DEFAULT_REVIEW_PROMPT: &str = r#"Por stdin recibes un documento de arquitectura existente. Audítalo como lo haría un revisor externo en un architecture review board.

Responde en español y en Markdown con estas secciones:

## Veredicto
Una línea: `APROBADO`, `APROBADO CON OBSERVACIONES` o `RECHAZADO`, y por qué.

## Hallazgos
Un bloque por hallazgo, ordenados de más grave a menos:

### {emoji} [{Severidad}] {Título corto}
- **Dónde**: sección o componente afectado.
- **Problema**: qué está mal o qué falta, concreto.
- **Riesgo**: qué pasa en producción si queda así.
- **Corrección**: qué cambiar exactamente.

Usa 🚨 para Bloqueante, ⚠️ para Mayor, ℹ️ para Menor. Severidad ∈ Bloqueante | Mayor | Menor.

## Qué está bien
Lo que sí está bien resuelto y hay que conservar. No lo omitas: una revisión que solo lista problemas es inaccionable.

## Lo que falta
Atributos de calidad sin cubrir, modos de falla no analizados, decisiones implícitas sin documentar, patrones de resiliencia ausentes en integraciones externas.

No inventes hallazgos triviales si el documento está bien."#;

/// Pedido de generación de diagrama suelto (el botón "diagramar esto").
pub const DEFAULT_DIAGRAM_PROMPT: &str = r#"Por stdin recibes una descripción en texto. Conviértela en UN diagrama Mermaid.

Devuelve ÚNICAMENTE el fence ```mermaid con el diagrama dentro. Sin introducción, sin explicación, sin texto después.

Elige el tipo de diagrama que mejor represente lo descrito: `flowchart` para estructura y contexto, `sequenceDiagram` para interacción temporal, `erDiagram` para modelo de datos, `stateDiagram-v2` para ciclos de vida, `classDiagram` para modelo de dominio, `gantt` para plan.

El diagrama debe ser Mermaid válido: encierra en comillas dobles cualquier etiqueta que contenga paréntesis, comas, dos puntos o guiones."#;

/// Contrato de salida compartido por el escaneo del repositorio y la extracción desde una
/// decisión. Vive en una constante y no repetido en los dos prompts porque `parseModel.ts` parsea
/// exactamente este bloque: cambiarlo en un solo prompt haría que la mitad de las propuestas
/// llegaran vacías sin ningún error visible.
///
/// `parent` y `dependsOn` van por **nombre** y no por id porque el modelo no conoce los ids de la
/// base; el frontend los resuelve al aceptar la propuesta.
const MODEL_CONTRACT: &str = r#"Devuelve ÚNICAMENTE un bloque de código con este formato exacto, sin texto antes ni después:

```json archflow-model
{
  "schemaVersion": 1,
  "elements": [
    {
      "kind": "component",
      "name": "Servicio de pagos",
      "summary": "Qué es y de qué se hace cargo, en una línea.",
      "status": "produccion",
      "tech": "ASP.NET Core 8",
      "owner": "",
      "parent": null,
      "dependsOn": ["Base transaccional"],
      "location": "src/Pagos",
      "notes": "Lo que no cabe en el resumen: SLA, qué pasa si se cae, por qué está así."
    }
  ]
}
```

Reglas del bloque:
- `kind` es uno de: `component` (un servicio, módulo, front, base de datos o cola desplegable), `endpoint` (una operación que expone un componente), `integration` (un sistema externo del que dependes), `entity` (un concepto de datos con dueño claro) o `debt` (algo que sabes que está mal y hay que arreglar).
- `name` de un endpoint incluye el verbo y la ruta: `POST /api/ordenes`.
- `status` es uno de: `propuesto`, `construccion`, `produccion`, `deprecado`. Si no puedes determinarlo, usa `produccion` para lo que encuentres en el código y `propuesto` para lo que todavía no existe.
- `parent` es el nombre EXACTO del componente al que pertenece la pieza, o `null`. Los endpoints y las entidades siempre deben tener uno.
- `dependsOn` son nombres EXACTOS de otros elementos (de esta lista o del modelo actual). Es lo que dibuja las flechas del diagrama; si no estás seguro, deja el arreglo vacío en vez de inventar.
- `owner` solo si el repositorio lo dice (CODEOWNERS, README). Si no, cadena vacía.
- `location` es la ruta relativa dentro del repositorio. Vacío si no aplica.
- Nada de relleno: si algo no lo sabes, deja la cadena vacía. Un dato inventado en el modelo del sistema contamina todas las decisiones que vengan después."#;

/// Escaneo del repositorio: leer el código real y proponer el inventario que hay en él.
pub const DEFAULT_SCAN_PROMPT: &str = r#"Por stdin recibes el MODELO DEL SISTEMA que ArchFlow ya tiene registrado para este proyecto (puede estar vacío).

Tu tarea es leer el repositorio en el que estás y proponer las piezas que faltan en ese modelo.

Cómo buscar, en este orden:
1. La forma del repositorio: archivos de proyecto/manifiestos, carpetas de primer y segundo nivel, docker-compose, manifiestos de despliegue. De ahí salen los COMPONENTES.
2. Controladores, rutas, handlers y definiciones de API. De ahí salen los ENDPOINTS, colgando de su componente.
3. Clientes HTTP, SDKs de terceros, cadenas de conexión y variables de entorno que apunten fuera. De ahí salen las INTEGRACIONES.
4. Entidades, modelos, esquemas y migraciones. De ahí salen las ENTIDADES, solo las que son conceptos de negocio — no una fila por tabla auxiliar.
5. `TODO`, `FIXME`, `HACK`, workarounds comentados y duplicación evidente. De ahí sale la DEUDA, solo lo que un líder técnico querría tener anotado.

Reglas:
- NO repitas elementos que ya están en el modelo actual con el mismo nombre. Solo propón lo que falta o lo que cambió.
- Prefiere pocas piezas correctas a muchas dudosas. Este inventario alimenta todas las decisiones futuras.
- Si el repositorio está vacío o no se parece a un proyecto de software, devuelve el bloque con `"elements": []`.

"#;

/// Extracción desde una decisión ya generada: qué le agrega este ADR al sistema.
pub const DEFAULT_EXTRACT_PROMPT: &str = r#"Por stdin recibes el MODELO DEL SISTEMA actual del proyecto y un DOCUMENTO DE DECISIÓN de arquitectura recién aprobado.

Tu tarea es determinar qué le agrega o le cambia esa decisión al sistema.

Qué extraer:
- Los componentes nuevos que la opción recomendada introduce.
- Los endpoints o contratos nuevos que aparecen en la decisión.
- Las integraciones externas nuevas.
- Las entidades de datos nuevas o significativamente modificadas.
- La deuda que la decisión reconoce explícitamente que deja (consecuencias negativas asumidas, mitigaciones pendientes).

Reglas:
- Basa todo SOLO en la opción recomendada. Las alternativas descartadas no existen en el sistema.
- Usa `"status": "propuesto"` para todo lo que la decisión introduce: todavía no está construido.
- NO repitas lo que ya está en el modelo actual con el mismo nombre.
- Si la decisión no cambia la estructura del sistema (por ejemplo, decidió no hacer nada), devuelve el bloque con `"elements": []`.

"#;

/// El modelo del sistema como prosa, para inyectarlo en el contexto de cualquier corrida.
///
/// Es lo que le da memoria a la app: sin esto, cada análisis empieza de cero y propone una cola
/// de eventos que ya existe desde hace tres decisiones.
pub fn render_model(elements: &[ModelElement]) -> String {
    if elements.is_empty() {
        return String::new();
    }

    let by_id = |id: &str| elements.iter().find(|e| e.id == id);
    let mut s = String::with_capacity(2048);

    for (kind, heading) in [
        ("component", "COMPONENTES"),
        ("endpoint", "ENDPOINTS EXPUESTOS"),
        ("integration", "INTEGRACIONES EXTERNAS"),
        ("entity", "ENTIDADES DE DATOS"),
        ("debt", "DEUDA TÉCNICA CONOCIDA"),
    ] {
        let group: Vec<&ModelElement> = elements.iter().filter(|e| e.kind == kind).collect();
        if group.is_empty() {
            continue;
        }
        s.push_str(&format!("### {heading}\n\n"));
        for e in group {
            s.push_str(&format!("- **{}** ({})", e.name, e.status));
            if !e.tech.trim().is_empty() {
                s.push_str(&format!(" · {}", e.tech.trim()));
            }
            if let Some(parent) = e.parent_id.as_deref().and_then(by_id) {
                s.push_str(&format!(" · pertenece a {}", parent.name));
            }
            if !e.summary.trim().is_empty() {
                s.push_str(&format!(" — {}", e.summary.trim()));
            }
            let deps: Vec<&str> =
                e.depends_on.lines().filter_map(|id| by_id(id.trim())).map(|d| d.name.as_str()).collect();
            if !deps.is_empty() {
                s.push_str(&format!(" · depende de: {}", deps.join(", ")));
            }
            if !e.notes.trim().is_empty() {
                s.push_str(&format!(" · {}", e.notes.trim()));
            }
            s.push('\n');
        }
        s.push('\n');
    }

    s
}

/// El contrato de salida del modelo, para que los comandos lo agreguen al final del prompt que el
/// usuario pueda haber personalizado. Va aparte para que editar el prompt en Ajustes no pueda
/// romper el formato que la app parsea.
pub fn model_contract() -> &'static str {
    MODEL_CONTRACT
}

/// Arma el texto que se manda por stdin a partir del brief. Es prosa etiquetada y no JSON a
/// propósito: los modelos siguen mejor un brief legible que un objeto, y así el usuario puede
/// leer exactamente lo que se envió cuando el resultado no le cuadra.
pub fn build_brief_payload(
    brief: &DecisionBrief,
    project_context: &str,
    system_model: &str,
    repo_hint: Option<&str>,
) -> String {
    let mut s = String::with_capacity(4096);
    s.push_str("# BRIEF DE ARQUITECTURA\n\n");

    section(&mut s, "DECISIÓN A TOMAR", &brief.title);
    if !project_context.trim().is_empty() {
        section(&mut s, "CONTEXTO PERMANENTE DEL PROYECTO", project_context);
    }
    // El inventario va antes del problema a propósito: lo primero que tiene que quedar claro es
    // qué existe ya, para que la recomendación reutilice en vez de duplicar.
    if !system_model.trim().is_empty() {
        s.push_str("## MODELO DEL SISTEMA ACTUAL\n\n");
        s.push_str(
            "Estas piezas ya existen o ya están decididas. Reutilízalas: proponer una segunda cola, \
             una segunda base o un segundo servicio que hace lo mismo que uno de estos es un error, \
             y si de verdad hace falta duplicar, justifícalo explícitamente.\n\n",
        );
        s.push_str(system_model.trim());
        s.push_str("\n\n");
    }
    section(&mut s, "PROBLEMA DE NEGOCIO", &brief.problem);
    section(&mut s, "QUÉ SE NECESITA CONSEGUIR", &brief.goals);
    section(&mut s, "FUERA DE ALCANCE", &brief.non_goals);
    section(&mut s, "ESTADO ACTUAL (stack, sistemas, dependencias)", &brief.current_state);
    section(&mut s, "RESTRICCIONES", &brief.constraints);
    section(&mut s, "ESCALA ESPERADA", &brief.scale);
    section(&mut s, "EQUIPO", &brief.team);
    section(&mut s, "CUMPLIMIENTO Y REGULACIÓN", &brief.compliance);
    section(&mut s, "PRESUPUESTO Y PLAZOS", &brief.budget);

    if !brief.quality_attributes.is_empty() {
        s.push_str("## ATRIBUTOS DE CALIDAD PRIORIZADOS\n\n");
        s.push_str(
            "Peso 1-5, donde 5 es lo que más importa. Estos pesos son los que debes usar en la matriz.\n\n",
        );
        for qa in &brief.quality_attributes {
            let scenario = if qa.scenario.trim().is_empty() {
                "(sin escenario — proponlo tú)".to_string()
            } else {
                qa.scenario.trim().to_string()
            };
            s.push_str(&format!("- **{}** (peso {}): {}\n", qa.id, qa.weight, scenario));
        }
        s.push('\n');
    }

    if !brief.candidate_options.is_empty() {
        s.push_str("## OPCIONES QUE EL USUARIO YA TIENE EN MENTE\n\n");
        s.push_str("Evalúalas todas, aunque creas que alguna es mala — y en ese caso di por qué lo es.\n\n");
        for opt in &brief.candidate_options {
            s.push_str(&format!("- {}\n", opt.trim()));
        }
        s.push('\n');
    }

    if !brief.pattern_families.is_empty() {
        s.push_str("## FAMILIAS DE PATRONES A CUBRIR OBLIGATORIAMENTE\n\n");
        for f in &brief.pattern_families {
            s.push_str(&format!("- {}\n", f.trim()));
        }
        s.push('\n');
    }

    if !brief.deliverables.is_empty() {
        s.push_str("## ARTEFACTOS PEDIDOS\n\n");
        for d in &brief.deliverables {
            s.push_str(&format!("- {}\n", d.trim()));
        }
        s.push('\n');
    }

    section(&mut s, "NOTAS ADICIONALES", &brief.notes);

    if let Some(hint) = repo_hint {
        s.push_str("## REPOSITORIO\n\n");
        s.push_str(hint);
        s.push_str("\n\nTienes herramientas de lectura sobre este repositorio: úsalas para conocer el stack real antes de recomendar.\n\n");
    }

    s
}

fn section(out: &mut String, title: &str, body: &str) {
    let body = body.trim();
    if body.is_empty() {
        return;
    }
    out.push_str(&format!("## {title}\n\n{body}\n\n"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::QualityAttribute;

    #[test]
    fn empty_sections_are_omitted_entirely() {
        let brief = DecisionBrief { title: "Elegir mensajería".into(), ..Default::default() };
        let payload = build_brief_payload(&brief, "", "", None);
        assert!(payload.contains("DECISIÓN A TOMAR"));
        // Un encabezado con el cuerpo vacío solo gastaría contexto y le diría al modelo que hay
        // una sección que en realidad no existe.
        assert!(!payload.contains("PROBLEMA DE NEGOCIO"));
        assert!(!payload.contains("EQUIPO"));
    }

    #[test]
    fn weights_reach_the_model_verbatim() {
        let brief = DecisionBrief {
            title: "t".into(),
            quality_attributes: vec![QualityAttribute {
                id: "Disponibilidad".into(),
                weight: 5,
                scenario: "99.95% mensual".into(),
            }],
            ..Default::default()
        };
        let payload = build_brief_payload(&brief, "", "", None);
        assert!(payload.contains("**Disponibilidad** (peso 5): 99.95% mensual"));
    }

    #[test]
    fn a_missing_scenario_is_flagged_not_silently_dropped() {
        let brief = DecisionBrief {
            title: "t".into(),
            quality_attributes: vec![QualityAttribute {
                id: "Seguridad".into(),
                weight: 4,
                scenario: "  ".into(),
            }],
            ..Default::default()
        };
        let payload = build_brief_payload(&brief, "", "", None);
        assert!(payload.contains("proponlo tú"));
    }

    fn element(kind: &str, id: &str, name: &str) -> ModelElement {
        ModelElement {
            id: id.into(),
            project_id: "p".into(),
            kind: kind.into(),
            name: name.into(),
            summary: String::new(),
            status: "produccion".into(),
            tech: String::new(),
            owner: String::new(),
            parent_id: None,
            source: "manual".into(),
            decision_id: None,
            depends_on: String::new(),
            location: String::new(),
            notes: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    /// El modelo guarda ids, pero el modelo de lenguaje solo puede razonar sobre nombres: si las
    /// referencias llegaran como `e1`/`e2`, el análisis no tendría forma de saber qué depende de qué.
    #[test]
    fn the_rendered_model_resolves_references_to_names() {
        let mut api = element("component", "e1", "API de pagos");
        api.depends_on = "e2".into();
        let db = element("component", "e2", "Base transaccional");
        let mut endpoint = element("endpoint", "e3", "POST /api/ordenes");
        endpoint.parent_id = Some("e1".into());

        let rendered = render_model(&[api, db, endpoint]);
        assert!(rendered.contains("depende de: Base transaccional"));
        assert!(rendered.contains("pertenece a API de pagos"));
        assert!(!rendered.contains("e1"));
    }

    /// Sin piezas registradas no se emite encabezado: una sección "MODELO DEL SISTEMA ACTUAL"
    /// vacía le diría al modelo que el sistema no tiene nada, que no es lo mismo que no saberlo.
    #[test]
    fn an_empty_model_adds_nothing_to_the_payload() {
        assert!(render_model(&[]).is_empty());
        let brief = DecisionBrief { title: "t".into(), ..Default::default() };
        assert!(!build_brief_payload(&brief, "", "", None).contains("MODELO DEL SISTEMA"));
        assert!(build_brief_payload(&brief, "", "### COMPONENTES\n\n- **X**\n", None)
            .contains("MODELO DEL SISTEMA ACTUAL"));
    }

    /// El bloque que `parseModel.ts` busca. Cambiar el marcador deja las propuestas de escaneo y
    /// de extracción vacías sin ningún error: la corrida se ve exitosa y no aparece nada.
    #[test]
    fn the_model_contract_markers_are_present() {
        assert!(MODEL_CONTRACT.contains("```json archflow-model"));
        for kind in ["component", "endpoint", "integration", "entity", "debt"] {
            assert!(MODEL_CONTRACT.contains(kind), "falta la clase {kind}");
        }
        for status in ["propuesto", "construccion", "produccion", "deprecado"] {
            assert!(MODEL_CONTRACT.contains(status), "falta el estado {status}");
        }
    }

    /// El contrato de salida es lo que el frontend parsea; si el marcador cambia, el render de la
    /// matriz y los diagramas se rompe sin ningún error visible.
    #[test]
    fn the_output_contract_markers_are_present() {
        assert!(DEFAULT_DECISION_PROMPT.contains("```json archflow"));
        assert!(DEFAULT_DECISION_PROMPT.contains("## Matriz de trade-off"));
        assert!(DEFAULT_DECISION_PROMPT.contains("```mermaid"));
    }

    /// Las familias que el frontend sabe agrupar (`FAMILY_LABEL` en `parseDecision.ts`) tienen que
    /// estar ofrecidas en el prompt. Si el modelo nunca emite una, su sección queda vacía; si emite
    /// una que el frontend no conoce, los patrones caen al final bajo su id crudo.
    #[test]
    fn every_pattern_family_the_ui_knows_is_offered_to_the_model() {
        for family in [
            "arquitectonico",
            "diseno",
            "resiliencia",
            "concurrencia",
            "datos",
            "integracion",
            "observabilidad",
            "seguridad",
            "despliegue",
        ] {
            assert!(DEFAULT_DECISION_PROMPT.contains(family), "falta la familia {family}");
        }
    }
}
