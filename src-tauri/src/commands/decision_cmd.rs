//! El núcleo de ArchFlow: tomar un brief y devolver una decisión de arquitectura documentada.

use tauri::{AppHandle, State};

use super::{mcp_cmd, settings_cmd as cfg, skills_cmd};
use crate::ai::{self, claude, prompts, runs};
use crate::db::{
    models::{Decision, DecisionBrief, DecisionSummary, Project},
    queries, Db,
};
use crate::{fsops, git, paths, secrets};

/// Todo lo que hay que resolver desde la base antes de invocar la CLI. Se arma en una sola
/// sección con el mutex tomado, porque el `MutexGuard` de `std` no cruza un `.await`.
///
/// Lo comparten todos los comandos que invocan la CLI, incluido `model_cmd`: duplicar esta
/// resolución sería duplicar también la decisión de qué herramientas se permiten y qué MCP se
/// materializa, que es justo lo que no puede divergir entre comandos.
pub(super) struct RunSetup {
    pub project: Project,
    pub binary: String,
    pub model: String,
    pub tools: Vec<String>,
    pub system_prompt: String,
    pub prompt: String,
    pub mcp_config: Option<String>,
    /// El modelo del sistema ya renderizado como prosa, listo para inyectar en el contexto.
    pub system_model: String,
    pub auto_commit: bool,
}

pub(super) fn prepare(
    db: &State<Db>,
    project_id: &str,
    prompt_key: &str,
    prompt_default: &str,
) -> Result<RunSetup, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let project = queries::get_project(&conn, project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "el proyecto ya no existe".to_string())?;

    let binary = queries::setting_or(&conn, cfg::KEY_BINARY, cfg::DEFAULT_BINARY);
    let model = queries::setting_or(&conn, cfg::KEY_MODEL, cfg::DEFAULT_MODEL);
    let tools_mode = queries::setting_or(&conn, cfg::KEY_TOOLS_MODE, "read");
    let system_prompt = cfg::effective_prompt(&conn, cfg::KEY_PROMPT_SYSTEM, prompts::SYSTEM_PROMPT);
    let prompt = cfg::effective_prompt(&conn, prompt_key, prompt_default);
    let auto_commit = queries::setting_or(&conn, cfg::KEY_AUTO_COMMIT, "0") == "1";

    let servers = queries::list_mcp_servers(&conn, project_id).map_err(|e| e.to_string())?;
    let skills = queries::list_skills(&conn, project_id).map_err(|e| e.to_string())?;
    let elements = queries::list_model_elements(&conn, project_id).map_err(|e| e.to_string())?;
    drop(conn);

    let system_model = prompts::render_model(&elements);

    let tools = match tools_mode.as_str() {
        "none" => Vec::new(),
        "write" => claude::write_tools(),
        _ => claude::read_only_tools(),
    };
    let mcp_config = mcp_cmd::write_config(&servers, project_id)?;
    // Claude Code solo descubre skills relativas a su cwd, así que la copia canónica se
    // sincroniza dentro del repo justo antes de correr.
    skills_cmd::sync_into_project(&skills, project_id, &project.path)?;

    Ok(RunSetup {
        project,
        binary,
        model,
        tools,
        system_prompt,
        prompt,
        mcp_config,
        system_model,
        auto_commit,
    })
}

/// Ejecuta el análisis completo. `run_id` lo genera el frontend para poder cancelar y para
/// correlacionar las líneas de log que llegan por el evento `ai:line`.
#[tauri::command]
pub async fn run_decision(
    app: AppHandle,
    db: State<'_, Db>,
    project_id: String,
    brief: DecisionBrief,
    run_id: String,
) -> Result<Decision, String> {
    let title = if brief.title.trim().is_empty() { "Decisión sin título" } else { brief.title.trim() };
    let setup = prepare(&db, &project_id, cfg::KEY_PROMPT_DECISION, prompts::DEFAULT_DECISION_PROMPT)?;

    let brief_json = serde_json::to_string(&brief).map_err(|e| e.to_string())?;
    let decision = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        queries::create_decision(&conn, &project_id, title, &brief_json).map_err(|e| e.to_string())?
    };

    let repo_hint = Some(format!("El proyecto vive en `{}`.", setup.project.path));
    let payload = prompts::build_brief_payload(
        &brief,
        &setup.project.context,
        &setup.system_model,
        repo_hint.as_deref(),
    );

    let mut inv = ai::AiInvocation::new(&setup.prompt, &payload);
    inv.system_prompt = Some(&setup.system_prompt);
    inv.model = &setup.model;
    inv.allowed_tools = &setup.tools;
    inv.cwd = Some(&setup.project.path);
    inv.mcp_config_path = setup.mcp_config.as_deref();

    let result = runs::scoped(app, run_id, ai::run(&setup.binary, inv)).await;
    finalize(&db, &decision.id, result, setup.auto_commit.then_some(&setup.project))
}

/// Guarda el resultado (o el error) y, si corresponde, escribe y commitea el documento.
fn finalize(
    db: &State<Db>,
    decision_id: &str,
    result: Result<ai::AiRun, String>,
    auto_commit_project: Option<&Project>,
) -> Result<Decision, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    match result {
        Ok(run) => {
            queries::finish_decision(
                &conn,
                decision_id,
                "done",
                &run.text,
                run.model.as_deref(),
                run.session_id.as_deref(),
                None,
            )
            .map_err(|e| e.to_string())?;
            let decision = queries::get_decision(&conn, decision_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "la decisión desapareció".to_string())?;
            drop(conn);

            if let Some(project) = auto_commit_project {
                // Un fallo al guardar/commitear no puede perder el análisis que ya costó una
                // corrida completa: se reporta como advertencia en la UI, no como error de la
                // decisión, y el usuario puede reintentar el guardado a mano.
                if let Err(e) = write_and_commit(project, &decision) {
                    eprintln!("archflow: auto-commit falló: {e}");
                }
            }
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            queries::get_decision(&conn, decision_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "la decisión desapareció".to_string())
        }
        Err(e) if e == runs::CANCELLED_MARKER => {
            queries::finish_decision(&conn, decision_id, "cancelled", "", None, None, None)
                .map_err(|e| e.to_string())?;
            Err(runs::CANCELLED_MARKER.to_string())
        }
        Err(e) => {
            queries::finish_decision(&conn, decision_id, "error", "", None, None, Some(&e))
                .map_err(|err| err.to_string())?;
            Err(e)
        }
    }
}

/// Escribe el markdown en `docs/architecture/` y lo commitea. Devuelve la ruta relativa.
fn write_and_commit(project: &Project, decision: &Decision) -> Result<String, String> {
    let rel = doc_rel_path(&project.path, &decision.title);
    fsops::write_text(&project.path, &rel, &decision.result_md)?;
    let msg = format!("docs(arquitectura): {}", decision.title);
    git::commit(&project.path, &msg, std::slice::from_ref(&rel), "ArchFlow", "archflow@local")?;
    Ok(rel)
}

/// Numera los ADR de forma correlativa mirando lo que ya hay en la carpeta: así el orden de los
/// archivos refleja el orden en que se tomaron las decisiones, aunque se renombren después.
fn doc_rel_path(project_path: &str, title: &str) -> String {
    let dir = std::path::Path::new(project_path).join(paths::DOCS_SUBDIR);
    let next = std::fs::read_dir(&dir)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().into_owned();
                    name.strip_prefix("ADR-")
                        .and_then(|rest| rest.get(..3))
                        .and_then(|n| n.parse::<u32>().ok())
                })
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0)
        + 1;
    format!("{}/ADR-{:03}-{}.md", paths::DOCS_SUBDIR, next, fsops::slugify(title))
}

/// Guarda el documento de una decisión en el repo (sin commitear) y registra su ruta.
#[tauri::command]
pub fn save_decision_doc(db: State<Db>, decision_id: String) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let decision = queries::get_decision(&conn, &decision_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "esa decisión ya no existe".to_string())?;
    let project = queries::get_project(&conn, &decision.project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "el proyecto ya no existe".to_string())?;
    drop(conn);

    if decision.result_md.trim().is_empty() {
        return Err("esta decisión todavía no tiene contenido que guardar".to_string());
    }
    // Reguardar una decisión ya guardada sobreescribe su archivo en vez de crear un ADR nuevo:
    // si no, cada edición dejaría un duplicado numerado.
    let rel = decision.doc_path.clone().unwrap_or_else(|| doc_rel_path(&project.path, &decision.title));
    fsops::write_text(&project.path, &rel, &decision.result_md)?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::set_decision_doc_path(&conn, &decision_id, &rel).map_err(|e| e.to_string())?;
    Ok(rel)
}

#[tauri::command]
pub fn list_decisions(db: State<Db>, project_id: String) -> Result<Vec<DecisionSummary>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::list_decisions(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_decision(db: State<Db>, id: String) -> Result<Option<Decision>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::get_decision(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_decision_markdown(db: State<Db>, id: String, markdown: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::set_decision_markdown(&conn, &id, &markdown).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_decision(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::delete_decision(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_run(run_id: String) -> bool {
    runs::cancel(&run_id)
}

/// Pregunta de seguimiento sobre una decisión ya generada. Reanuda la sesión de la CLI cuando la
/// hay, para que el modelo conserve todo el razonamiento en vez de releer el documento.
#[tauri::command]
pub async fn refine_decision(
    app: AppHandle,
    db: State<'_, Db>,
    decision_id: String,
    question: String,
    run_id: String,
) -> Result<String, String> {
    let (project_id, session_id, result_md) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let d = queries::get_decision(&conn, &decision_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "esa decisión ya no existe".to_string())?;
        (d.project_id, d.session_id, d.result_md)
    };
    let setup = prepare(&db, &project_id, cfg::KEY_PROMPT_REFINE, prompts::DEFAULT_REFINE_PROMPT)?;

    // Con sesión activa basta la pregunta; sin ella hay que reenviar el documento entero para que
    // el modelo tenga de qué hablar.
    let payload = match session_id.as_deref() {
        Some(_) => format!("# PREGUNTA\n\n{question}\n"),
        None => format!("# DOCUMENTO DE DECISIÓN\n\n{result_md}\n\n# PREGUNTA\n\n{question}\n"),
    };

    let mut inv = ai::AiInvocation::new(&setup.prompt, &payload);
    inv.system_prompt = Some(&setup.system_prompt);
    inv.model = &setup.model;
    inv.allowed_tools = &setup.tools;
    inv.cwd = Some(&setup.project.path);
    inv.mcp_config_path = setup.mcp_config.as_deref();
    inv.resume_session_id = session_id.as_deref();

    let run = runs::scoped(app, run_id, ai::run(&setup.binary, inv)).await?;
    // La sesión puede rotar entre turnos; guardarla mantiene viva la conversación.
    if let Some(sid) = run.session_id.as_deref() {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        if let Ok(Some(d)) = queries::get_decision(&conn, &decision_id) {
            let _ = queries::finish_decision(
                &conn,
                &decision_id,
                &d.status,
                &d.result_md,
                d.model.as_deref(),
                Some(sid),
                None,
            );
        }
    }
    Ok(run.text)
}

/// Audita un documento de arquitectura existente (pegado o abierto desde el árbol de docs).
#[tauri::command]
pub async fn review_document(
    app: AppHandle,
    db: State<'_, Db>,
    project_id: String,
    markdown: String,
    run_id: String,
) -> Result<String, String> {
    let setup = prepare(&db, &project_id, cfg::KEY_PROMPT_REVIEW, prompts::DEFAULT_REVIEW_PROMPT)?;
    let mut inv = ai::AiInvocation::new(&setup.prompt, &markdown);
    inv.system_prompt = Some(&setup.system_prompt);
    inv.model = &setup.model;
    inv.allowed_tools = &setup.tools;
    inv.cwd = Some(&setup.project.path);
    inv.mcp_config_path = setup.mcp_config.as_deref();
    runs::scoped(app, run_id, ai::run(&setup.binary, inv)).await.map(|r| r.text)
}

/// Genera un único diagrama Mermaid desde una descripción en texto.
#[tauri::command]
pub async fn generate_diagram(
    app: AppHandle,
    db: State<'_, Db>,
    project_id: String,
    description: String,
    run_id: String,
) -> Result<String, String> {
    let setup = prepare(&db, &project_id, cfg::KEY_PROMPT_DIAGRAM, prompts::DEFAULT_DIAGRAM_PROMPT)?;
    let mut inv = ai::AiInvocation::new(&setup.prompt, &description);
    inv.system_prompt = Some(&setup.system_prompt);
    inv.model = &setup.model;
    inv.cwd = Some(&setup.project.path);
    inv.mcp_config_path = setup.mcp_config.as_deref();
    runs::scoped(app, run_id, ai::run(&setup.binary, inv)).await.map(|r| r.text)
}

/// Commitea (y opcionalmente publica) los documentos de arquitectura del proyecto.
#[tauri::command]
pub async fn publish_docs(
    db: State<'_, Db>,
    project_id: String,
    message: String,
    push: bool,
) -> Result<String, String> {
    let (path, name, email) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let project = queries::get_project(&conn, &project_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "el proyecto ya no existe".to_string())?;
        let name = queries::setting_or(&conn, cfg::KEY_GIT_NAME, "ArchFlow");
        let email = queries::setting_or(&conn, cfg::KEY_GIT_EMAIL, "archflow@local");
        (project.path, name, email)
    };

    let msg = if message.trim().is_empty() {
        "docs(arquitectura): actualiza documentación".to_string()
    } else {
        message
    };
    let sha = git::commit(&path, &msg, &[], &name, &email)?;
    if !push {
        return Ok(format!("commit {sha}"));
    }
    let auth = git::GitAuth {
        username: secrets::get_secret(secrets::GIT_USER)?.unwrap_or_default(),
        token: secrets::get_secret(secrets::GIT_TOKEN)?.unwrap_or_default(),
    };
    let p = path.clone();
    tokio::task::spawn_blocking(move || git::push(&p, &auth)).await.map_err(|e| e.to_string())??;
    Ok(format!("commit {sha} publicado"))
}
