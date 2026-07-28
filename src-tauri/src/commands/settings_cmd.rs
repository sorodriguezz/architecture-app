use tauri::State;

use crate::ai::{self, claude, prompts};
use crate::db::{queries, Db};

// Claves de configuración. Centralizadas aquí para que backend y frontend no discrepen: el
// frontend las importa desde `lib/tauri/commands.ts`, que replica esta lista.
pub const KEY_BINARY: &str = "ai_binary";
pub const KEY_MODEL: &str = "ai_model";
/// `read` (solo lectura del repo) | `write` (puede crear/editar archivos) | `none`.
pub const KEY_TOOLS_MODE: &str = "ai_tools_mode";
pub const KEY_PROMPT_SYSTEM: &str = "prompt_system";
pub const KEY_PROMPT_DECISION: &str = "prompt_decision";
pub const KEY_PROMPT_REFINE: &str = "prompt_refine";
pub const KEY_PROMPT_REVIEW: &str = "prompt_review";
pub const KEY_PROMPT_DIAGRAM: &str = "prompt_diagram";
pub const KEY_GIT_NAME: &str = "git_user_name";
pub const KEY_GIT_EMAIL: &str = "git_user_email";
pub const KEY_AUTO_COMMIT: &str = "auto_commit";

pub const DEFAULT_BINARY: &str = "claude";
pub const DEFAULT_MODEL: &str = "sonnet";

#[tauri::command]
pub fn get_setting(db: State<Db>, key: String) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::get_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

/// Devuelve las plantillas por defecto para que Ajustes pueda mostrar "restaurar original"
/// sin duplicar el texto en el frontend.
#[tauri::command]
pub fn default_prompt(kind: String) -> String {
    match kind.as_str() {
        "system" => prompts::SYSTEM_PROMPT,
        "refine" => prompts::DEFAULT_REFINE_PROMPT,
        "review" => prompts::DEFAULT_REVIEW_PROMPT,
        "diagram" => prompts::DEFAULT_DIAGRAM_PROMPT,
        _ => prompts::DEFAULT_DECISION_PROMPT,
    }
    .to_string()
}

/// Plantilla efectiva: la personalizada del usuario si existe y no está vacía, si no la de fábrica.
pub fn effective_prompt(conn: &rusqlite::Connection, key: &str, fallback: &str) -> String {
    queries::setting_or(conn, key, fallback)
}

/// Modelos sugeridos para el selector. La CLI de Claude no expone una lista legible por máquina,
/// así que esta es curada; el usuario puede escribir cualquier id y se pasa tal cual a `--model`.
#[tauri::command]
pub fn list_models() -> Vec<ModelOption> {
    claude::KNOWN_MODELS
        .iter()
        .map(|(id, description)| ModelOption {
            id: (*id).to_string(),
            description: (*description).to_string(),
        })
        .collect()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub id: String,
    pub description: String,
}

/// Comprueba si la CLI está instalada y qué versión reporta — el badge de Ajustes.
#[tauri::command]
pub async fn check_engine(db: State<'_, Db>, binary: Option<String>) -> Result<ai::EngineStatus, String> {
    let bin = match binary.filter(|b| !b.trim().is_empty()) {
        Some(b) => b,
        None => {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            queries::setting_or(&conn, KEY_BINARY, DEFAULT_BINARY)
        }
    };
    Ok(ai::probe(&bin).await)
}
