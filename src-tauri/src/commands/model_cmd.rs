//! El modelo del sistema: el inventario vivo de lo que existe en el proyecto real.
//!
//! Es lo que le da memoria a la app. El CRUD es trivial; lo que importa son los dos comandos que
//! lo alimentan sin trabajo manual — leer el repositorio y leer una decisión ya aprobada — y el
//! hecho de que `decision_cmd::prepare` inyecte el resultado en cada corrida posterior.
//!
//! Los dos comandos de IA devuelven el texto crudo del modelo: la propuesta se parsea y se
//! acepta pieza por pieza en el frontend (`parseModel.ts`), porque escribir directo en la base lo
//! que un modelo dedujo del código sería exactamente la clase de dato inventado que después
//! contamina todas las decisiones.

use tauri::{AppHandle, State};

use super::decision_cmd::prepare;
use super::settings_cmd as cfg;
use crate::ai::{self, claude, prompts, runs};
use crate::db::{models::ModelElement, queries, Db};

#[tauri::command]
pub fn list_model_elements(db: State<Db>, project_id: String) -> Result<Vec<ModelElement>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::list_model_elements(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_model_element(db: State<Db>, element: ModelElement) -> Result<ModelElement, String> {
    if element.name.trim().is_empty() {
        return Err("la pieza necesita un nombre".to_string());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::upsert_model_element(&conn, &element).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_model_element(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::delete_model_element(&conn, &id).map_err(|e| e.to_string())
}

/// El modelo actual como prosa, encabezado incluido. Es el mismo texto que reciben las decisiones,
/// así que la propuesta se genera sabiendo exactamente lo que la app ya tiene registrado.
fn current_model_payload(db: &State<Db>, project_id: &str) -> Result<String, String> {
    let elements = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        queries::list_model_elements(&conn, project_id).map_err(|e| e.to_string())?
    };
    let rendered = prompts::render_model(&elements);
    Ok(format!(
        "# MODELO DEL SISTEMA ACTUAL\n\n{}\n",
        if rendered.trim().is_empty() { "(todavía no hay nada registrado)" } else { rendered.trim() }
    ))
}

/// Lee el repositorio del proyecto y propone las piezas que le faltan al modelo.
#[tauri::command]
pub async fn scan_repository(
    app: AppHandle,
    db: State<'_, Db>,
    project_id: String,
    run_id: String,
) -> Result<String, String> {
    let setup = prepare(&db, &project_id, cfg::KEY_PROMPT_SCAN, prompts::DEFAULT_SCAN_PROMPT)?;
    let payload = current_model_payload(&db, &project_id)?;

    // El contrato se agrega aquí y no dentro del prompt editable: si alguien personaliza el
    // pedido en Ajustes y borra el formato, la propuesta llegaría vacía sin ningún error visible.
    let prompt = format!("{}\n\n{}", setup.prompt, prompts::model_contract());

    // Un escaneo sin herramientas de lectura no puede escanear nada. Cuando el proyecto está en
    // modo «sin herramientas» se fuerza el mínimo indispensable, que es lectura del repo.
    let tools = if setup.tools.is_empty() { claude::read_only_tools() } else { setup.tools.clone() };

    let mut inv = ai::AiInvocation::new(&prompt, &payload);
    inv.system_prompt = Some(&setup.system_prompt);
    inv.model = &setup.model;
    inv.allowed_tools = &tools;
    inv.cwd = Some(&setup.project.path);
    inv.mcp_config_path = setup.mcp_config.as_deref();

    runs::scoped(app, run_id, ai::run(&setup.binary, inv)).await.map(|r| r.text)
}

/// Deriva del documento de una decisión qué piezas le agrega al sistema.
#[tauri::command]
pub async fn extract_model_from_decision(
    app: AppHandle,
    db: State<'_, Db>,
    decision_id: String,
    run_id: String,
) -> Result<String, String> {
    let (project_id, result_md) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let d = queries::get_decision(&conn, &decision_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "esa decisión ya no existe".to_string())?;
        (d.project_id, d.result_md)
    };
    if result_md.trim().is_empty() {
        return Err("esta decisión todavía no tiene documento del cual extraer".to_string());
    }

    let setup = prepare(&db, &project_id, cfg::KEY_PROMPT_EXTRACT, prompts::DEFAULT_EXTRACT_PROMPT)?;
    let payload =
        format!("{}\n# DOCUMENTO DE DECISIÓN\n\n{}\n", current_model_payload(&db, &project_id)?, result_md);
    let prompt = format!("{}\n\n{}", setup.prompt, prompts::model_contract());

    let mut inv = ai::AiInvocation::new(&prompt, &payload);
    inv.system_prompt = Some(&setup.system_prompt);
    inv.model = &setup.model;
    inv.allowed_tools = &setup.tools;
    inv.cwd = Some(&setup.project.path);
    inv.mcp_config_path = setup.mcp_config.as_deref();

    runs::scoped(app, run_id, ai::run(&setup.binary, inv)).await.map(|r| r.text)
}
