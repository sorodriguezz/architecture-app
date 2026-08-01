import { invoke } from "@tauri-apps/api/core";

import type {
  Decision,
  DecisionBrief,
  DecisionSummary,
  DocEntry,
  EngineStatus,
  McpServer,
  ModelElement,
  ModelOption,
  Project,
  RepoStatus,
  Skill,
} from "../../types/domain";

/** Claves de configuración. Réplica de `commands/settings_cmd.rs` — si cambia una, cambian las dos. */
export const SettingKey = {
  binary: "ai_binary",
  model: "ai_model",
  /** `read` | `write` | `none` */
  toolsMode: "ai_tools_mode",
  promptSystem: "prompt_system",
  promptDecision: "prompt_decision",
  promptRefine: "prompt_refine",
  promptReview: "prompt_review",
  promptDiagram: "prompt_diagram",
  promptScan: "prompt_scan",
  promptExtract: "prompt_extract",
  gitName: "git_user_name",
  gitEmail: "git_user_email",
  autoCommit: "auto_commit",
  theme: "theme",
  accent: "accent",
} as const;

export const DEFAULT_BINARY = "claude";
export const DEFAULT_MODEL = "sonnet";

// ---------- app ----------
export const quitApp = () => invoke<void>("quit_app");
export const resetAppData = () => invoke<void>("reset_app_data");
export const dataDir = () => invoke<string>("data_dir");
export const openExternal = (url: string) => invoke<void>("open_external", { url });
export const revealInFileManager = (path: string) => invoke<void>("reveal_in_file_manager", { path });

// ---------- proyectos ----------
export const pickFolder = () => invoke<string | null>("pick_folder");
export const defaultProjectsDir = () => invoke<string>("default_projects_dir");
export const openProject = (path: string, name?: string, color?: string) =>
  invoke<Project>("open_project", { path, name, color });
export const createProject = (name: string, parentDir?: string, color?: string) =>
  invoke<Project>("create_project", { name, parentDir, color });
export const cloneProject = (url: string, parentDir?: string, color?: string) =>
  invoke<Project>("clone_project", { url, parentDir, color });
export const listProjects = () => invoke<Project[]>("list_projects");
export const getProject = (id: string) => invoke<Project | null>("get_project", { id });
export const updateProject = (id: string, name: string, color: string, context: string) =>
  invoke<void>("update_project", { id, name, color, context });
export const removeProject = (id: string) => invoke<void>("remove_project", { id });

// ---------- decisiones ----------
export const runDecision = (projectId: string, brief: DecisionBrief, runId: string) =>
  invoke<Decision>("run_decision", { projectId, brief, runId });
export const listDecisions = (projectId: string) => invoke<DecisionSummary[]>("list_decisions", { projectId });
export const getDecision = (id: string) => invoke<Decision | null>("get_decision", { id });
export const updateDecisionMarkdown = (id: string, markdown: string) =>
  invoke<void>("update_decision_markdown", { id, markdown });
export const deleteDecision = (id: string) => invoke<void>("delete_decision", { id });
export const saveDecisionDoc = (decisionId: string) => invoke<string>("save_decision_doc", { decisionId });
export const refineDecision = (decisionId: string, question: string, runId: string) =>
  invoke<string>("refine_decision", { decisionId, question, runId });
export const reviewDocument = (projectId: string, markdown: string, runId: string) =>
  invoke<string>("review_document", { projectId, markdown, runId });
export const generateDiagram = (projectId: string, description: string, runId: string) =>
  invoke<string>("generate_diagram", { projectId, description, runId });
export const publishDocs = (projectId: string, message: string, push: boolean) =>
  invoke<string>("publish_docs", { projectId, message, push });
export const cancelRun = (runId: string) => invoke<boolean>("cancel_run", { runId });

// ---------- modelo del sistema ----------
export const listModelElements = (projectId: string) =>
  invoke<ModelElement[]>("list_model_elements", { projectId });
export const upsertModelElement = (element: ModelElement) =>
  invoke<ModelElement>("upsert_model_element", { element });
export const deleteModelElement = (id: string) => invoke<void>("delete_model_element", { id });
export const scanRepository = (projectId: string, runId: string) =>
  invoke<string>("scan_repository", { projectId, runId });
export const extractModelFromDecision = (decisionId: string, runId: string) =>
  invoke<string>("extract_model_from_decision", { decisionId, runId });

// ---------- documentos ----------
export const listDocs = (projectId: string, sub?: string) => invoke<DocEntry[]>("list_docs", { projectId, sub });
export const readDoc = (projectId: string, relPath: string) => invoke<string>("read_doc", { projectId, relPath });
export const writeDoc = (projectId: string, relPath: string, content: string) =>
  invoke<void>("write_doc", { projectId, relPath, content });
export const createDoc = (projectId: string, title: string, sub?: string) =>
  invoke<string>("create_doc", { projectId, title, sub });
export const deleteDoc = (projectId: string, relPath: string) => invoke<void>("delete_doc", { projectId, relPath });
export const renameDoc = (projectId: string, fromRel: string, toRel: string) =>
  invoke<void>("rename_doc", { projectId, fromRel, toRel });
export const docFullPath = (projectId: string, relPath: string) =>
  invoke<string>("doc_full_path", { projectId, relPath });

// ---------- git ----------
export const gitStatus = (projectId: string) => invoke<RepoStatus>("git_status", { projectId });
export const gitCommit = (projectId: string, message: string, paths: string[] = []) =>
  invoke<string>("git_commit", { projectId, message, paths });
export const gitPush = (projectId: string) => invoke<void>("git_push", { projectId });
export const gitPull = (projectId: string) => invoke<string>("git_pull", { projectId });
export const gitSetRemote = (projectId: string, url: string) => invoke<void>("git_set_remote", { projectId, url });
export const setGitCredentials = (username: string, token: string) =>
  invoke<void>("set_git_credentials", { username, token });
export const hasGitCredentials = () => invoke<boolean>("has_git_credentials");
export const clearGitCredentials = () => invoke<void>("clear_git_credentials");

// ---------- ajustes ----------
export const getSetting = (key: string) => invoke<string | null>("get_setting", { key });
export const setSetting = (key: string, value: string) => invoke<void>("set_setting", { key, value });
export const defaultPrompt = (
  kind: "system" | "decision" | "refine" | "review" | "diagram" | "scan" | "extract",
) =>
  invoke<string>("default_prompt", { kind });
export const listModels = () => invoke<ModelOption[]>("list_models");
export const checkEngine = (binary?: string) => invoke<EngineStatus>("check_engine", { binary });

// ---------- skills ----------
export const installSkill = (projectId: string, sourceRepo: string, skillName: string) =>
  invoke<Skill>("install_skill", { projectId, sourceRepo, skillName });
export const listSkills = (projectId: string) => invoke<Skill[]>("list_skills", { projectId });
export const setSkillEnabled = (id: string, enabled: boolean) => invoke<void>("set_skill_enabled", { id, enabled });
export const removeSkill = (id: string) => invoke<void>("remove_skill", { id });
export const createCustomSkill = (projectId: string, name: string, skillMd: string) =>
  invoke<Skill>("create_custom_skill", { projectId, name, skillMd });
export const listSkillFiles = (projectId: string, skillName: string) =>
  invoke<string[]>("list_skill_files", { projectId, skillName });
export const readSkillFile = (projectId: string, skillName: string, relPath: string) =>
  invoke<string>("read_skill_file", { projectId, skillName, relPath });
export const writeSkillFile = (projectId: string, skillName: string, relPath: string, content: string) =>
  invoke<void>("write_skill_file", { projectId, skillName, relPath, content });

// ---------- mcp ----------
export const listMcpServers = (projectId: string) => invoke<McpServer[]>("list_mcp_servers", { projectId });
export const upsertMcpServer = (server: McpServer) => invoke<McpServer>("upsert_mcp_server", { server });
export const deleteMcpServer = (id: string) => invoke<void>("delete_mcp_server", { id });

/** Marcador que el backend antepone a los fallos por cuota, para mostrar un aviso y no un error. */
export const QUOTA_MARKER = "QUOTA_EXCEEDED::";
/** Marcador de corrida abortada por el usuario: no es un fallo. */
export const CANCELLED_MARKER = "__ARCHFLOW_CANCELLED__";

/** Convierte el error crudo del backend en algo mostrable, distinguiendo cuota y cancelación. */
export function describeError(err: unknown): { kind: "error" | "quota" | "cancelled"; message: string } {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  if (raw === CANCELLED_MARKER) return { kind: "cancelled", message: "Análisis cancelado." };
  if (raw.startsWith(QUOTA_MARKER)) return { kind: "quota", message: raw.slice(QUOTA_MARKER.length).trim() };
  return { kind: "error", message: raw };
}
