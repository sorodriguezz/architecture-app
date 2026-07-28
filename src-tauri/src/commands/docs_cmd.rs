use tauri::State;

use crate::db::{queries, Db};
use crate::fsops::{self, DocEntry};
use crate::paths;

/// Resuelve la raíz de un proyecto. Todas las operaciones de archivo la piden para poder
/// confinar las rutas dentro de ella.
fn project_root(db: &State<Db>, project_id: &str) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::get_project(&conn, project_id)
        .map_err(|e| e.to_string())?
        .map(|p| p.path)
        .ok_or_else(|| "el proyecto ya no existe".to_string())
}

/// Árbol de documentos. `sub` vacío lista desde `docs/architecture`, que es donde ArchFlow
/// escribe; pasar otra subcarpeta permite explorar documentación que ya existía en el repo.
#[tauri::command]
pub fn list_docs(db: State<Db>, project_id: String, sub: Option<String>) -> Result<Vec<DocEntry>, String> {
    let root = project_root(&db, &project_id)?;
    let sub = sub.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| paths::DOCS_SUBDIR.to_string());
    fsops::list_markdown(&root, &sub)
}

#[tauri::command]
pub fn read_doc(db: State<Db>, project_id: String, rel_path: String) -> Result<String, String> {
    let root = project_root(&db, &project_id)?;
    fsops::read_text(&root, &rel_path)
}

#[tauri::command]
pub fn write_doc(db: State<Db>, project_id: String, rel_path: String, content: String) -> Result<(), String> {
    let root = project_root(&db, &project_id)?;
    fsops::write_text(&root, &rel_path, &content)
}

#[tauri::command]
pub fn delete_doc(db: State<Db>, project_id: String, rel_path: String) -> Result<(), String> {
    let root = project_root(&db, &project_id)?;
    fsops::delete(&root, &rel_path)
}

#[tauri::command]
pub fn rename_doc(db: State<Db>, project_id: String, from_rel: String, to_rel: String) -> Result<(), String> {
    let root = project_root(&db, &project_id)?;
    fsops::rename(&root, &from_rel, &to_rel)
}

/// Crea un documento nuevo desde el árbol. Devuelve la ruta relativa efectiva (con `.md` y sin
/// colisionar con uno existente).
#[tauri::command]
pub fn create_doc(
    db: State<Db>,
    project_id: String,
    title: String,
    sub: Option<String>,
) -> Result<String, String> {
    let root = project_root(&db, &project_id)?;
    let dir = sub.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| paths::DOCS_SUBDIR.to_string());
    let slug = fsops::slugify(&title);

    let mut rel = format!("{dir}/{slug}.md");
    let mut n = 2;
    while fsops::safe_join(&root, &rel)?.exists() {
        rel = format!("{dir}/{slug}-{n}.md");
        n += 1;
    }
    let heading = if title.trim().is_empty() { "Documento" } else { title.trim() };
    fsops::write_text(&root, &rel, &format!("# {heading}\n\n"))?;
    Ok(rel)
}

/// Ruta absoluta de un documento, para "revelar en el explorador".
#[tauri::command]
pub fn doc_full_path(db: State<Db>, project_id: String, rel_path: String) -> Result<String, String> {
    let root = project_root(&db, &project_id)?;
    Ok(fsops::safe_join(&root, &rel_path)?.to_string_lossy().into_owned())
}
