use tauri::State;

use super::settings_cmd as cfg;
use crate::db::{queries, Db};
use crate::git::{self, RepoStatus};
use crate::secrets;

fn project_path(db: &State<Db>, project_id: &str) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::get_project(&conn, project_id)
        .map_err(|e| e.to_string())?
        .map(|p| p.path)
        .ok_or_else(|| "el proyecto ya no existe".to_string())
}

#[tauri::command]
pub fn git_status(db: State<Db>, project_id: String) -> Result<RepoStatus, String> {
    Ok(git::status(&project_path(&db, &project_id)?))
}

#[tauri::command]
pub fn git_commit(
    db: State<Db>,
    project_id: String,
    message: String,
    paths: Vec<String>,
) -> Result<String, String> {
    let path = project_path(&db, &project_id)?;
    let (name, email) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        (
            queries::setting_or(&conn, cfg::KEY_GIT_NAME, "ArchFlow"),
            queries::setting_or(&conn, cfg::KEY_GIT_EMAIL, "archflow@local"),
        )
    };
    if message.trim().is_empty() {
        return Err("el commit necesita un mensaje".to_string());
    }
    git::commit(&path, message.trim(), &paths, &name, &email)
}

/// git2 es síncrono y la red puede tardar; en el runtime async bloquearía el hilo del evento.
#[tauri::command]
pub async fn git_push(db: State<'_, Db>, project_id: String) -> Result<(), String> {
    let path = project_path(&db, &project_id)?;
    let auth = auth()?;
    tokio::task::spawn_blocking(move || git::push(&path, &auth)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_pull(db: State<'_, Db>, project_id: String) -> Result<String, String> {
    let path = project_path(&db, &project_id)?;
    let auth = auth()?;
    tokio::task::spawn_blocking(move || git::pull(&path, &auth)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn git_set_remote(db: State<Db>, project_id: String, url: String) -> Result<(), String> {
    git::set_remote(&project_path(&db, &project_id)?, url.trim())
}

// ---------- credenciales ----------

#[tauri::command]
pub fn set_git_credentials(username: String, token: String) -> Result<(), String> {
    secrets::set_secret(secrets::GIT_USER, username.trim())?;
    secrets::set_secret(secrets::GIT_TOKEN, token.trim())
}

/// Solo dice **si** hay token guardado. El valor nunca vuelve al frontend: si volviera, quedaría
/// en memoria del webview y en cualquier log de la capa IPC.
#[tauri::command]
pub fn has_git_credentials() -> Result<bool, String> {
    Ok(secrets::get_secret(secrets::GIT_TOKEN)?.is_some_and(|t| !t.is_empty()))
}

#[tauri::command]
pub fn clear_git_credentials() -> Result<(), String> {
    secrets::delete_secret(secrets::GIT_USER)?;
    secrets::delete_secret(secrets::GIT_TOKEN)
}

fn auth() -> Result<git::GitAuth, String> {
    Ok(git::GitAuth {
        username: secrets::get_secret(secrets::GIT_USER)?.unwrap_or_default(),
        token: secrets::get_secret(secrets::GIT_TOKEN)?.unwrap_or_default(),
    })
}
