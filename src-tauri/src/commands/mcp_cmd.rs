use serde_json::{json, Map, Value};
use tauri::State;

use crate::db::{models::McpServer, queries, Db};
use crate::paths;

#[tauri::command]
pub fn list_mcp_servers(db: State<Db>, project_id: String) -> Result<Vec<McpServer>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::list_mcp_servers(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_mcp_server(db: State<Db>, server: McpServer) -> Result<McpServer, String> {
    if server.name.trim().is_empty() {
        return Err("el servidor MCP necesita un nombre".to_string());
    }
    if server.command.trim().is_empty() {
        return Err("indica el comando (stdio) o la URL (http/sse)".to_string());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::upsert_mcp_server(&conn, &server).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mcp_server(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    queries::delete_mcp_server(&conn, &id).map_err(|e| e.to_string())
}

/// Escribe el JSON que consume `claude --mcp-config` con los servidores **habilitados** del
/// proyecto y devuelve su ruta. `None` cuando no hay ninguno habilitado — en ese caso la
/// invocación no lleva la bandera, en vez de llevar un archivo con un objeto vacío (que junto a
/// `--strict-mcp-config` deshabilitaría también los MCP globales del usuario sin avisar).
pub fn write_config(servers: &[McpServer], project_id: &str) -> Result<Option<String>, String> {
    let enabled: Vec<&McpServer> = servers.iter().filter(|s| s.enabled).collect();
    if enabled.is_empty() {
        return Ok(None);
    }
    let mut map = Map::new();
    for s in enabled {
        map.insert(s.name.trim().to_string(), server_to_json(s));
    }
    let doc = json!({ "mcpServers": Value::Object(map) });
    let path = paths::project_mcp_config(project_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

fn server_to_json(s: &McpServer) -> Value {
    match s.transport.as_str() {
        "http" | "sse" => json!({
            "type": s.transport,
            "url": s.command.trim(),
            "headers": parse_env(&s.env),
        }),
        _ => json!({
            "type": "stdio",
            "command": s.command.trim(),
            "args": parse_lines(&s.args),
            "env": parse_env(&s.env),
        }),
    }
}

fn parse_lines(raw: &str) -> Vec<String> {
    raw.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_string).collect()
}

/// `CLAVE=valor` por línea. Un valor puede contener `=` (tokens, URLs), así que se parte solo en
/// el primero.
fn parse_env(raw: &str) -> Map<String, Value> {
    let mut map = Map::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let key = k.trim();
            if !key.is_empty() {
                map.insert(key.to_string(), Value::String(v.trim().to_string()));
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(transport: &str) -> McpServer {
        McpServer {
            id: "1".into(),
            project_id: "p".into(),
            name: "docs".into(),
            transport: transport.into(),
            command: "npx".into(),
            args: "-y\n@acme/mcp-docs\n".into(),
            env: "TOKEN=abc=def\n# comentario\n\nOTRO=1".into(),
            enabled: true,
            created_at: String::new(),
        }
    }

    #[test]
    fn stdio_servers_carry_command_and_args() {
        let v = server_to_json(&server("stdio"));
        assert_eq!(v["command"], "npx");
        assert_eq!(v["args"], json!(["-y", "@acme/mcp-docs"]));
    }

    /// Un token con `=` adentro es lo normal; partir por todos los `=` lo truncaría.
    #[test]
    fn env_splits_only_on_the_first_equals() {
        let env = parse_env("TOKEN=abc=def");
        assert_eq!(env["TOKEN"], "abc=def");
    }

    #[test]
    fn comments_and_blank_lines_are_ignored() {
        let env = parse_env("# nota\n\nA=1\n");
        assert_eq!(env.len(), 1);
    }

    #[test]
    fn http_servers_carry_url_and_headers() {
        let mut s = server("http");
        s.command = "https://mcp.example.com".into();
        let v = server_to_json(&s);
        assert_eq!(v["url"], "https://mcp.example.com");
        assert_eq!(v["type"], "http");
    }

    /// Sin servidores habilitados no debe escribirse config: `--strict-mcp-config` con un objeto
    /// vacío apagaría también los MCP globales del usuario.
    #[test]
    fn no_enabled_servers_means_no_config_file() {
        let mut s = server("stdio");
        s.enabled = false;
        assert_eq!(write_config(&[s], "test-project").unwrap(), None);
    }
}
