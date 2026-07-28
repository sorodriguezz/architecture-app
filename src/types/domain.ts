// Espejo de `src-tauri/src/db/models.rs`. Rust serializa en camelCase (`#[serde(rename_all)]`),
// así que los nombres de campo coinciden uno a uno.

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string;
  /** Contexto permanente que se antepone a cada análisis del proyecto. */
  context: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualityAttribute {
  id: string;
  /** 1..5 — pondera la matriz de trade-off. */
  weight: number;
  /** Escenario concreto estilo ATAM: estímulo → respuesta → medida. */
  scenario: string;
}

export interface DecisionBrief {
  title: string;
  problem: string;
  goals: string;
  nonGoals: string;
  constraints: string;
  currentState: string;
  qualityAttributes: QualityAttribute[];
  scale: string;
  team: string;
  compliance: string;
  budget: string;
  candidateOptions: string[];
  patternFamilies: string[];
  deliverables: string[];
  notes: string;
}

export type DecisionStatus = "draft" | "running" | "done" | "error" | "cancelled";

export interface Decision {
  id: string;
  projectId: string;
  title: string;
  status: DecisionStatus;
  briefJson: string;
  resultMd: string;
  docPath: string | null;
  model: string | null;
  sessionId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionSummary {
  id: string;
  projectId: string;
  title: string;
  status: DecisionStatus;
  docPath: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpServer {
  id: string;
  projectId: string;
  name: string;
  transport: "stdio" | "http" | "sse";
  /** Ejecutable para `stdio`; URL para `http`/`sse`. */
  command: string;
  /** Un argumento por línea. */
  args: string;
  /** `CLAVE=valor` por línea. */
  env: string;
  enabled: boolean;
  createdAt: string;
}

export interface Skill {
  id: string;
  projectId: string;
  skillName: string;
  sourceRepo: string;
  enabled: boolean;
  createdAt: string;
}

export interface DocEntry {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

export interface RepoStatus {
  isRepo: boolean;
  branch: string;
  remoteUrl: string | null;
  changed: string[];
  ahead: number;
  behind: number;
}

export interface EngineStatus {
  available: boolean;
  detail: string;
  version: string | null;
}

export interface ModelOption {
  id: string;
  description: string;
}

// ---------- lo que se parsea del bloque ```json archflow ----------

export interface Criterion {
  id: string;
  label: string;
  weight: number;
}

export interface DecisionOption {
  id: string;
  name: string;
  summary: string;
  recommended: boolean;
  scores: Record<string, number>;
  pros: string[];
  cons: string[];
  costLevel?: string;
  opsComplexity?: string;
  timeToMarket?: string;
}

export type PatternFamily =
  | "arquitectonico"
  | "diseno"
  | "resiliencia"
  | "concurrencia"
  | "datos"
  | "integracion"
  | "seguridad"
  | "despliegue";

export interface AppliedPattern {
  name: string;
  family: PatternFamily | string;
  why: string;
  where: string;
}

export interface Risk {
  id: string;
  title: string;
  impact: "bajo" | "medio" | "alto" | string;
  probability: "baja" | "media" | "alta" | string;
  mitigation: string;
}

/** El objeto estructurado que el modelo emite en el bloque ` ```json archflow `. */
export interface DecisionMeta {
  schemaVersion: number;
  title: string;
  decision: string;
  confidence: number;
  criteria: Criterion[];
  options: DecisionOption[];
  patterns: AppliedPattern[];
  risks: Risk[];
  assumptions: string[];
  openQuestions: string[];
}

export interface DiagramBlock {
  /** Slug estable para anclas y nombres de archivo al exportar. */
  id: string;
  title: string;
  code: string;
}

/** Resultado de parsear el markdown completo de una decisión. */
export interface ParsedDecision {
  meta: DecisionMeta | null;
  /** Markdown sin el bloque de metadatos, listo para renderizar. */
  markdown: string;
  diagrams: DiagramBlock[];
  /** Por qué falló el parseo del bloque de metadatos, cuando falló. */
  metaError: string | null;
}

/** Línea de log emitida por el backend mientras corre la CLI. */
export interface RunLine {
  runId: string;
  stream: "stdout" | "stderr";
  line: string;
}
