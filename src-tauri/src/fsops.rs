//! Acceso a archivos acotado al proyecto abierto.
//!
//! Cada operación recibe la raíz del proyecto y una ruta relativa, y **rechaza** cualquier ruta
//! que escape de esa raíz. La app expone estos comandos al frontend, así que sin esa comprobación
//! un bug (o un `..` en un nombre generado por el modelo) podría leer o escribir cualquier archivo
//! de la máquina.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocEntry {
    /// Ruta relativa a la raíz del proyecto, siempre con `/`.
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    /// Fecha de modificación en RFC3339, o vacío si el SO no la reporta.
    pub modified: String,
}

/// Une `root` + `rel` rechazando `..`, rutas absolutas y prefijos de unidad (`C:`).
pub fn safe_join(root: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    for c in rel_path.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("ruta no permitida: {rel}")),
        }
    }
    Ok(Path::new(root).join(rel_path))
}

pub fn read_text(root: &str, rel: &str) -> Result<String, String> {
    let path = safe_join(root, rel)?;
    std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn write_text(root: &str, rel: &str, content: &str) -> Result<(), String> {
    let path = safe_join(root, rel)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn delete(root: &str, rel: &str) -> Result<(), String> {
    let path = safe_join(root, rel)?;
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

pub fn rename(root: &str, from_rel: &str, to_rel: &str) -> Result<(), String> {
    let from = safe_join(root, from_rel)?;
    let to = safe_join(root, to_rel)?;
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// Lista recursivamente los `.md` (y las carpetas que los contienen) bajo `sub`.
/// Ignora `node_modules`, `.git`, `target` y `dist`, que no aportan nada al árbol de documentos
/// y sí pueden tener decenas de miles de entradas.
pub fn list_markdown(root: &str, sub: &str) -> Result<Vec<DocEntry>, String> {
    let base = safe_join(root, sub)?;
    let mut out = Vec::new();
    if !base.exists() {
        return Ok(out);
    }
    walk(Path::new(root), &base, &mut out)?;
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.path.cmp(&b.path)));
    Ok(out)
}

const IGNORED: [&str; 5] = ["node_modules", ".git", "target", "dist", ".next"];

fn walk(root: &Path, dir: &Path, out: &mut Vec<DocEntry>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if IGNORED.contains(&name.as_str()) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let rel = path.strip_prefix(root).map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
        if meta.is_dir() {
            out.push(DocEntry { path: rel, name, is_dir: true, size: 0, modified: modified_at(&meta) });
            walk(root, &path, out)?;
        } else if path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("md")) {
            out.push(DocEntry {
                path: rel,
                name,
                is_dir: false,
                size: meta.len(),
                modified: modified_at(&meta),
            });
        }
    }
    Ok(())
}

fn modified_at(meta: &std::fs::Metadata) -> String {
    meta.modified().ok().map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()).unwrap_or_default()
}

/// Convierte un título libre en un nombre de archivo estable: minúsculas, sin acentos ni
/// caracteres reservados en Windows, separado por guiones.
pub fn slugify(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut prev_dash = false;
    for ch in title.chars() {
        let mapped = match ch {
            'á' | 'à' | 'ä' | 'â' | 'Á' | 'À' | 'Ä' | 'Â' => 'a',
            'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' | 'Ë' | 'Ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' | 'Ï' | 'Î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'Ó' | 'Ò' | 'Ö' | 'Ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' | 'Ü' | 'Û' => 'u',
            'ñ' | 'Ñ' => 'n',
            c if c.is_ascii_alphanumeric() => c.to_ascii_lowercase(),
            _ => '-',
        };
        if mapped == '-' {
            if !prev_dash && !out.is_empty() {
                out.push('-');
            }
            prev_dash = true;
        } else {
            out.push(mapped);
            prev_dash = false;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "decision".to_string()
    } else {
        trimmed.chars().take(70).collect::<String>().trim_matches('-').to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal() {
        assert!(safe_join("/tmp/p", "../etc/passwd").is_err());
        assert!(safe_join("/tmp/p", "docs/../../x").is_err());
        assert!(safe_join("/tmp/p", "/etc/passwd").is_err());
        assert!(safe_join("/tmp/p", "docs/architecture/adr-001.md").is_ok());
    }

    #[test]
    fn slugs_are_filesystem_safe() {
        assert_eq!(slugify("¿Monolito o microservicios?"), "monolito-o-microservicios");
        assert_eq!(slugify("Migración a  Kafka / Pub-Sub"), "migracion-a-kafka-pub-sub");
        assert_eq!(slugify("   "), "decision");
    }

    /// El nombre no puede crecer sin límite: Windows corta las rutas en 260 caracteres por
    /// defecto y un título largo bastaría para que el archivo no se pueda crear.
    #[test]
    fn slugs_are_bounded() {
        let long = "a".repeat(300);
        assert!(slugify(&long).len() <= 70);
    }
}
