use std::path::PathBuf;

/// Directorio raíz donde ArchFlow guarda su base de datos, logs y skills.
///
/// Windows: literalmente `C:\ArchFlow` (ubicación fija y predecible que el hook del
/// desinstalador puede ofrecer conservar o borrar, en vez de `%LOCALAPPDATA%`).
/// macOS/Linux: `~/ArchFlow` — mismo criterio y sin necesidad de permisos elevados,
/// a diferencia de escribir bajo `/Applications` o `/Library`.
pub fn base_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"C:\ArchFlow")
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join("ArchFlow")
    }
}

pub fn db_path() -> PathBuf {
    base_dir().join("archflow.db")
}

pub fn logs_dir() -> PathBuf {
    base_dir().join("logs")
}

/// Raíz por defecto donde se clonan/crean los proyectos abiertos desde la app.
pub fn projects_root() -> PathBuf {
    base_dir().join("projects")
}

/// Donde viven las skills de un proyecto (instaladas con `npx skills add`) antes de
/// sincronizarse dentro del repo que se está analizando: la copia canónica.
pub fn project_skills_dir(project_id: &str) -> PathBuf {
    base_dir().join("projects-data").join(project_id).join("skills")
}

/// Archivo `--mcp-config` generado para un proyecto justo antes de invocar la CLI.
pub fn project_mcp_config(project_id: &str) -> PathBuf {
    base_dir().join("projects-data").join(project_id).join("mcp.json")
}

pub fn ensure_dirs() -> std::io::Result<()> {
    std::fs::create_dir_all(base_dir())?;
    std::fs::create_dir_all(logs_dir())?;
    std::fs::create_dir_all(projects_root())?;
    Ok(())
}

/// Un "borra todo" se resuelve en el *siguiente* arranque, antes de abrir la base: eliminar
/// `archflow.db` con la conexión SQLite todavía abierta falla en Windows (no se puede borrar un
/// archivo bloqueado). Pedir el reset solo deja este marcador y cierra la app; `run()` lo revisa
/// como primera cosa al arrancar, cuando nada tocó aún el directorio.
pub fn reset_marker_path() -> PathBuf {
    base_dir().join(".reset-pending")
}

/// Subcarpeta, dentro del repo del proyecto, donde se versionan los documentos de arquitectura.
/// Es una convención del producto: todo lo que ArchFlow genera queda bajo un solo árbol para que
/// el commit/push sea un gesto único y revisable.
pub const DOCS_SUBDIR: &str = "docs/architecture";
