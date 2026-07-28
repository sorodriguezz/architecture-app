use tauri::AppHandle;

use crate::paths;

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Deja el marcador de reset y cierra. El borrado real ocurre en el siguiente arranque, antes de
/// abrir SQLite — ver `paths::reset_marker_path`.
#[tauri::command]
pub fn reset_app_data(app: AppHandle) -> Result<(), String> {
    paths::ensure_dirs().map_err(|e| e.to_string())?;
    std::fs::write(paths::reset_marker_path(), "1").map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

/// Ruta del directorio de datos, para mostrarla en Ajustes: el usuario tiene que poder encontrar
/// su base y sus skills sin adivinar.
#[tauri::command]
pub fn data_dir() -> String {
    paths::base_dir().to_string_lossy().into_owned()
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

/// Abre una ruta local en el explorador de archivos / Finder.
#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    let dir = if target.is_dir() { target } else { target.parent().unwrap_or(target) };
    open::that(dir).map_err(|e| e.to_string())
}
