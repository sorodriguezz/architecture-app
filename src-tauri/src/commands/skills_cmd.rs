use std::path::Path;
use std::process::Stdio;

use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

use crate::db::{models::Skill, queries, Db};
use crate::paths;

#[derive(Clone, serde::Serialize)]
struct SkillProgress {
    line: String,
}

/// `npx` es un shim `.cmd` en Windows — lanzarlo directo (en vez de a través de `cmd /C`) ni
/// siquiera arranca, el mismo problema que cualquier otro ejecutable instalado por npm.
fn npx_command() -> Command {
    if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "npx"]);
        cmd
    } else {
        Command::new("npx")
    }
}

/// Instala una skill desde skills.sh en el almacén del proyecto
/// (`<datos>/projects-data/<id>/skills/.claude/skills/<nombre>`) vía `npx skills add`,
/// transmitiendo su salida, y la registra en la base.
#[tauri::command]
pub async fn install_skill(
    app: AppHandle,
    db: State<'_, Db>,
    project_id: String,
    source_repo: String,
    skill_name: String,
) -> Result<Skill, String> {
    let dir = paths::project_skills_dir(&project_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut cmd = npx_command();
    cmd.args(["--yes", "skills", "add", &source_repo, "--skill", &skill_name])
        .current_dir(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("no se pudo ejecutar npx: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let stdout_task = tokio::spawn(async move { drain(stdout, app_out).await });
    let app_err = app.clone();
    let stderr_task = tokio::spawn(async move { drain(stderr, app_err).await });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let out_lines = stdout_task.await.unwrap_or_default();
    let err_lines = stderr_task.await.unwrap_or_default();

    if !status.success() {
        let detail = if err_lines.is_empty() { out_lines.join("\n") } else { err_lines.join("\n") };
        return Err(format!("`npx skills add` falló: {detail}"));
    }

    let installed = dir.join(".claude").join("skills").join(&skill_name);
    if !installed.exists() {
        return Err(format!(
            "skills add dijo que terminó bien pero no se creó {} — revisa el nombre de la skill y el repo",
            installed.display()
        ));
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::add_skill(&conn, &project_id, &skill_name, &source_repo).map_err(|e| e.to_string())
}

async fn drain<R: tokio::io::AsyncRead + Unpin>(pipe: Option<R>, app: AppHandle) -> Vec<String> {
    let mut collected = Vec::new();
    let Some(pipe) = pipe else { return collected };
    let mut lines = tokio::io::BufReader::new(pipe).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit("skills:progress", SkillProgress { line: line.clone() });
        collected.push(line);
    }
    collected
}

#[tauri::command]
pub fn list_skills(db: State<Db>, project_id: String) -> Result<Vec<Skill>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::list_skills(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_skill_enabled(db: State<Db>, id: String, enabled: bool) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::set_skill_enabled(&conn, &id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_skill(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let skill = queries::get_skill(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "esa skill ya no existe".to_string())?;
    queries::delete_skill(&conn, &id).map_err(|e| e.to_string())?;
    drop(conn);
    let _ = std::fs::remove_dir_all(skill_dir(&skill.project_id, &skill.skill_name));
    Ok(())
}

/// Crea una skill desde cero en el almacén del proyecto — un `SKILL.md` escrito en la app en vez
/// de traído del registro de skills.sh.
#[tauri::command]
pub fn create_custom_skill(
    db: State<Db>,
    project_id: String,
    name: String,
    skill_md: String,
) -> Result<Skill, String> {
    let clean = sanitize_name(&name);
    if clean.is_empty() {
        return Err("ponle un nombre a la skill".to_string());
    }
    let dir = skill_dir(&project_id, &clean);
    if dir.exists() {
        return Err(format!("ya existe una skill llamada \"{clean}\" en este proyecto"));
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("SKILL.md"), skill_md).map_err(|e| e.to_string())?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::add_skill(&conn, &project_id, &clean, "custom").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_skill_files(project_id: String, skill_name: String) -> Result<Vec<String>, String> {
    let dir = skill_dir(&project_id, &skill_name);
    let mut out = Vec::new();
    collect_files(&dir, &dir, &mut out)?;
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn read_skill_file(project_id: String, skill_name: String, rel_path: String) -> Result<String, String> {
    let path = safe_skill_path(&project_id, &skill_name, &rel_path)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_skill_file(
    project_id: String,
    skill_name: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    let path = safe_skill_path(&project_id, &skill_name, &rel_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

fn skills_root(project_id: &str) -> std::path::PathBuf {
    paths::project_skills_dir(project_id).join(".claude").join("skills")
}

fn skill_dir(project_id: &str, name: &str) -> std::path::PathBuf {
    skills_root(project_id).join(name)
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' })
        .collect::<String>()
        .trim_matches(['-', '.', ' '])
        .to_string()
}

/// Rechaza `..` para que el editor no pueda leer ni escribir fuera de la carpeta de la skill.
fn safe_skill_path(project_id: &str, skill_name: &str, rel: &str) -> Result<std::path::PathBuf, String> {
    if rel.split(['/', '\\']).any(|c| c == ".." || c.is_empty()) {
        return Err("ruta de archivo no permitida".to_string());
    }
    Ok(skill_dir(project_id, &sanitize_name(skill_name)).join(rel))
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            collect_files(root, &path, out)?;
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

/// Copia las skills **habilitadas** del proyecto dentro de su propio `.claude/skills/` (Claude
/// Code solo descubre skills relativas a su directorio de trabajo) y borra de ahí las que están
/// deshabilitadas y quedaron de una sincronización anterior. Solo toca carpetas con el nombre de
/// una skill que administramos — nunca las entradas propias del usuario.
pub fn sync_into_project(skills: &[Skill], project_id: &str, project_path: &str) -> Result<(), String> {
    let dest_root = Path::new(project_path).join(".claude").join("skills");
    for skill in skills.iter().filter(|s| !s.enabled) {
        let _ = std::fs::remove_dir_all(dest_root.join(&skill.skill_name));
    }
    let enabled: std::collections::HashSet<&str> =
        skills.iter().filter(|s| s.enabled).map(|s| s.skill_name.as_str()).collect();
    let src_root = skills_root(project_id);
    if !src_root.exists() || enabled.is_empty() {
        return Ok(());
    }
    std::fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(&src_root).map_err(|e| e.to_string())?.flatten() {
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let name = entry.file_name();
        if !enabled.contains(name.to_string_lossy().as_ref()) {
            continue;
        }
        copy_dir(&entry.path(), &dest_root.join(name))?;
    }
    Ok(())
}

fn copy_dir(src: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let dest_path = dest.join(entry.file_name());
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            copy_dir(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skill_paths_reject_traversal() {
        assert!(safe_skill_path("p", "s", "../../secreto").is_err());
        assert!(safe_skill_path("p", "s", "references/guia.md").is_ok());
    }

    #[test]
    fn skill_names_stay_one_path_segment() {
        assert_eq!(sanitize_name("../evil"), "evil");
        assert_eq!(sanitize_name("mi skill/rara"), "mi-skill-rara");
    }
}
