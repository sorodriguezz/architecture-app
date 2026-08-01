use serde::{Deserialize, Serialize};

/// Un proyecto de arquitectura: una carpeta en disco (idealmente un repo git) donde ArchFlow
/// versiona los `.md` que produce.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub color: String,
    /// Contexto permanente del proyecto (stack actual, restricciones de la organización,
    /// políticas). Se antepone a *cada* análisis, así el modelo no lo re-pregunta cada vez.
    pub context: String,
    pub created_at: String,
    pub updated_at: String,
}

/// El brief que el usuario llena en el wizard. Se serializa a JSON dentro de `decisions`
/// para poder reabrir un análisis y re-ejecutarlo con los mismos datos.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionBrief {
    /// Qué se quiere decidir, en una línea. Es el título del ADR.
    pub title: String,
    /// El problema de negocio en prosa: qué duele hoy y por qué.
    pub problem: String,
    /// Qué se necesita conseguir — resultados de negocio, no soluciones técnicas.
    pub goals: String,
    /// Lo que queda explícitamente fuera del alcance.
    pub non_goals: String,
    /// Restricciones duras: presupuesto, plazos, equipo, cloud obligado, licencias.
    pub constraints: String,
    /// Stack, sistemas y dependencias que ya existen y hay que respetar.
    pub current_state: String,
    /// Atributos de calidad priorizados (los drivers de la arquitectura).
    pub quality_attributes: Vec<QualityAttribute>,
    /// Escala esperada: usuarios, RPS, volumen de datos, crecimiento.
    pub scale: String,
    /// Equipo: tamaño, seniority, lenguajes que dominan, modelo de operación.
    pub team: String,
    /// Cumplimiento y regulación: datos personales, retención, auditoría, residencia.
    pub compliance: String,
    /// Presupuesto y horizonte temporal.
    pub budget: String,
    /// Opciones que el usuario ya tiene en mente y quiere que se evalúen sí o sí.
    pub candidate_options: Vec<String>,
    /// Familias de patrones que deben considerarse en el análisis.
    pub pattern_families: Vec<String>,
    /// Qué artefactos generar (adr, diagramas, trade-offs, riesgos, roadmap...).
    pub deliverables: Vec<String>,
    /// Notas libres del usuario.
    pub notes: String,
}

/// Un atributo de calidad con su peso relativo — es lo que convierte la matriz de trade-off
/// en algo defendible en vez de una opinión.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityAttribute {
    pub id: String,
    /// Peso 1..5. El prompt lo usa para ponderar el score de cada opción.
    pub weight: u8,
    /// Escenario concreto (estilo ATAM): "ante X, el sistema debe Y en Z".
    pub scenario: String,
}

/// Un análisis de arquitectura ejecutado (o en curso).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub id: String,
    pub project_id: String,
    pub title: String,
    /// `draft` | `running` | `done` | `error` | `cancelled`
    pub status: String,
    /// `DecisionBrief` serializado.
    pub brief_json: String,
    /// Markdown completo que devolvió el modelo.
    pub result_md: String,
    /// Ruta relativa (dentro del repo) del `.md` guardado, si ya se guardó.
    pub doc_path: Option<String>,
    /// Modelo que realmente corrió, cuando la CLI lo reportó.
    pub model: Option<String>,
    /// Sesión de la CLI, para poder seguir conversando sobre esta decisión.
    pub session_id: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Fila liviana para el listado: sin el markdown completo, que puede pesar cientos de KB.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionSummary {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: String,
    pub doc_path: Option<String>,
    pub model: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Una pieza del sistema real: un componente, un endpoint que expone, una integración externa,
/// una entidad de datos o un ítem de deuda técnica.
///
/// Es lo que convierte a ArchFlow en algo con memoria: cada análisis recibe este inventario, así
/// la decisión número siete sabe que ya existe una cola de eventos en vez de proponer otra.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelElement {
    pub id: String,
    pub project_id: String,
    /// `component` | `endpoint` | `integration` | `entity` | `debt`
    pub kind: String,
    /// Nombre canónico. En los endpoints incluye el verbo: `POST /api/ordenes`.
    pub name: String,
    /// Qué es y de qué se hace cargo, en una línea.
    pub summary: String,
    /// `propuesto` | `construccion` | `produccion` | `deprecado`
    pub status: String,
    /// Tecnología concreta: el lenguaje, el motor, el protocolo.
    pub tech: String,
    /// Equipo o persona a cargo.
    pub owner: String,
    /// Componente del que cuelga. Los endpoints y las entidades siempre pertenecen a uno.
    pub parent_id: Option<String>,
    /// De dónde salió: `manual` | `decision` | `scan`. Sirve para saber cuánto confiar en el dato.
    pub source: String,
    /// Decisión que justificó esta pieza, cuando la hay.
    pub decision_id: Option<String>,
    /// Ids de los elementos de los que depende, uno por línea. Son las flechas del diagrama.
    pub depends_on: String,
    /// Dónde vive en el repositorio, si se sabe.
    pub location: String,
    /// Lo que no cabe en el resumen: SLA, qué pasa si se cae, por qué está así.
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Un servidor MCP configurado para un proyecto. Se materializa en un `--mcp-config` JSON
/// justo antes de invocar la CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub id: String,
    pub project_id: String,
    pub name: String,
    /// `stdio` | `http` | `sse`
    pub transport: String,
    /// Ejecutable para `stdio`; URL para `http`/`sse`.
    pub command: String,
    /// Argumentos separados por salto de línea (solo `stdio`).
    pub args: String,
    /// `CLAVE=valor` por línea.
    pub env: String,
    pub enabled: bool,
    pub created_at: String,
}

/// Una skill instalada desde skills.sh (o creada a mano) para un proyecto.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub project_id: String,
    pub skill_name: String,
    /// Repo de origen (`anthropics/skills`, `supabase/agent-skills`, …) o `custom`/`local`.
    pub source_repo: String,
    pub enabled: bool,
    pub created_at: String,
}
