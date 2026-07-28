//! Las plantillas que convierten a Claude Code en un arquitecto de software.
//!
//! Son independientes del transporte: la misma instrucción se envía tal cual, y el usuario puede
//! sobreescribir cualquiera desde Ajustes (se guardan en `settings`). El **contrato de salida**
//! de [`DEFAULT_DECISION_PROMPT`] no es decorativo: el frontend parsea el bloque
//! ` ```json archflow ` para armar la matriz de trade-off, los chips de patrones y el registro de
//! riesgos, y extrae cada fence ` ```mermaid ` como un diagrama con el título del encabezado
//! inmediatamente anterior. Cambiar esos marcadores rompe el render en silencio.

use crate::db::models::DecisionBrief;

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
    { "name": "<Nombre del patrón>", "family": "<arquitectonico|diseno|resiliencia|concurrencia|datos|integracion|seguridad|despliegue>", "why": "<por qué aquí>", "where": "<en qué componente>" }
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
- **De integración**: request-reply, publish-subscribe, message router, content-based routing, anti-corruption layer, contract testing, versionado de API.
- **De seguridad**: defensa en profundidad, mínimo privilegio, zero trust, secretos externalizados, cifrado en tránsito y reposo, rotación de credenciales, auditoría.
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

/// Arma el texto que se manda por stdin a partir del brief. Es prosa etiquetada y no JSON a
/// propósito: los modelos siguen mejor un brief legible que un objeto, y así el usuario puede
/// leer exactamente lo que se envió cuando el resultado no le cuadra.
pub fn build_brief_payload(brief: &DecisionBrief, project_context: &str, repo_hint: Option<&str>) -> String {
    let mut s = String::with_capacity(4096);
    s.push_str("# BRIEF DE ARQUITECTURA\n\n");

    section(&mut s, "DECISIÓN A TOMAR", &brief.title);
    if !project_context.trim().is_empty() {
        section(&mut s, "CONTEXTO PERMANENTE DEL PROYECTO", project_context);
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
        let payload = build_brief_payload(&brief, "", None);
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
        let payload = build_brief_payload(&brief, "", None);
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
        let payload = build_brief_payload(&brief, "", None);
        assert!(payload.contains("proponlo tú"));
    }

    /// El contrato de salida es lo que el frontend parsea; si el marcador cambia, el render de la
    /// matriz y los diagramas se rompe sin ningún error visible.
    #[test]
    fn the_output_contract_markers_are_present() {
        assert!(DEFAULT_DECISION_PROMPT.contains("```json archflow"));
        assert!(DEFAULT_DECISION_PROMPT.contains("## Matriz de trade-off"));
        assert!(DEFAULT_DECISION_PROMPT.contains("```mermaid"));
    }
}
