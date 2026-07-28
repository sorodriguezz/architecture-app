use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::db::{models::Project, queries, Db};
use crate::{git, paths, secrets};

/// Abre el selector nativo de carpetas. Devuelve `None` si el usuario canceló.
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder.map(|f| f.to_string()));
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn default_projects_dir() -> String {
    paths::projects_root().to_string_lossy().into_owned()
}

/// Registra una carpeta existente como proyecto. Si no es un repo git, lo inicializa: los
/// documentos que la app genera están pensados para versionarse desde el primer día.
#[tauri::command]
pub fn open_project(
    db: State<Db>,
    path: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<Project, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("la carpeta no existe: {path}"));
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // Reabrir una carpeta ya registrada devuelve el mismo proyecto en vez de fallar por el índice
    // único: para el usuario "abrir" es idempotente.
    if let Some(existing) = queries::find_project_by_path(&conn, &path).map_err(|e| e.to_string())? {
        queries::touch_project(&conn, &existing.id).map_err(|e| e.to_string())?;
        return Ok(existing);
    }
    let derived = name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| {
        dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Proyecto".to_string())
    });
    git::init(&path)?;
    ensure_docs_dir(&path)?;
    queries::create_project(&conn, &derived, &path, &color.unwrap_or_else(|| "#6366f1".into()))
        .map_err(|e| e.to_string())
}

/// Crea una carpeta nueva bajo la raíz de proyectos y la registra.
#[tauri::command]
pub fn create_project(
    db: State<Db>,
    name: String,
    parent_dir: Option<String>,
    color: Option<String>,
) -> Result<Project, String> {
    let clean = name.trim();
    if clean.is_empty() {
        return Err("ponle un nombre al proyecto".to_string());
    }
    let parent = parent_dir
        .filter(|p| !p.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(paths::projects_root);
    let dir = parent.join(crate::fsops::slugify(clean));
    if dir.exists() {
        return Err(format!("ya existe una carpeta en {}", dir.display()));
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.to_string_lossy().into_owned();

    git::init(&path)?;
    ensure_docs_dir(&path)?;
    seed_readme(&path, clean)?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::create_project(&conn, clean, &path, &color.unwrap_or_else(|| "#6366f1".into()))
        .map_err(|e| e.to_string())
}

/// Clona un repo y lo registra. El token sale del keychain, no de la UI.
#[tauri::command]
pub async fn clone_project(
    db: State<'_, Db>,
    url: String,
    parent_dir: Option<String>,
    color: Option<String>,
) -> Result<Project, String> {
    let name = url
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("repo")
        .to_string();
    let parent = parent_dir
        .filter(|p| !p.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(paths::projects_root);
    std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let dest = parent.join(&name);
    if dest.exists() {
        return Err(format!("ya existe una carpeta en {}", dest.display()));
    }

    let auth = git::GitAuth {
        username: secrets::get_secret(secrets::GIT_USER)?.unwrap_or_default(),
        token: secrets::get_secret(secrets::GIT_TOKEN)?.unwrap_or_default(),
    };
    let dest_str = dest.to_string_lossy().into_owned();
    // git2 es síncrono y clonar puede tardar minutos: en el runtime async bloquearía el hilo.
    let (u, d) = (url.clone(), dest_str.clone());
    tokio::task::spawn_blocking(move || git::clone(&u, &d, &auth)).await.map_err(|e| e.to_string())??;

    ensure_docs_dir(&dest_str)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::create_project(&conn, &name, &dest_str, &color.unwrap_or_else(|| "#6366f1".into()))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_projects(db: State<Db>) -> Result<Vec<Project>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project(db: State<Db>, id: String) -> Result<Option<Project>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::get_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_project(
    db: State<Db>,
    id: String,
    name: String,
    color: String,
    context: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::update_project(&conn, &id, &name, &color, &context).map_err(|e| e.to_string())
}

/// Quita el proyecto de ArchFlow. **No** borra la carpeta: los documentos son del usuario y
/// pueden estar ya versionados en su repo.
#[tauri::command]
pub fn remove_project(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::delete_project(&conn, &id).map_err(|e| e.to_string())?;
    drop(conn);
    let _ = std::fs::remove_dir_all(paths::project_skills_dir(&id));
    Ok(())
}

fn ensure_docs_dir(path: &str) -> Result<(), String> {
    std::fs::create_dir_all(std::path::Path::new(path).join(paths::DOCS_SUBDIR)).map_err(|e| e.to_string())
}

fn seed_readme(path: &str, name: &str) -> Result<(), String> {
    let readme = std::path::Path::new(path).join("README.md");
    if readme.exists() {
        return Ok(());
    }
    let body = format!(
        "# {name}\n\nDocumentación de arquitectura generada con [ArchFlow](https://github.com/sorodriguezz/archflow).\n\n\
         Las decisiones viven en `{}/` como archivos Markdown versionados: cada una es un ADR con \
         su matriz de trade-off, sus diagramas Mermaid y sus riesgos.\n",
        paths::DOCS_SUBDIR
    );
    std::fs::write(readme, body).map_err(|e| e.to_string())
}
