use rusqlite::{params, Connection, OptionalExtension, Row};

use super::models::{Decision, DecisionSummary, McpServer, ModelElement, Project, Skill};
use super::{new_id, now};

// ---------- settings ----------

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0)).optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Lee una clave con default. Centralizado aquí para que backend y frontend no discrepen en
/// cuál es el valor por defecto de una preferencia.
pub fn setting_or(conn: &Connection, key: &str, fallback: &str) -> String {
    get_setting(conn, key)
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

// ---------- projects ----------

fn row_to_project(r: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get("id")?,
        name: r.get("name")?,
        path: r.get("path")?,
        color: r.get("color")?,
        context: r.get("context")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

pub fn create_project(conn: &Connection, name: &str, path: &str, color: &str) -> rusqlite::Result<Project> {
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO projects(id, name, path, color, context, created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, '', ?5, ?5)",
        params![id, name, path, color, ts],
    )?;
    get_project(conn, &id).map(|p| p.expect("just inserted"))
}

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<Project>> {
    let mut stmt = conn.prepare("SELECT * FROM projects ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], row_to_project)?;
    rows.collect()
}

pub fn get_project(conn: &Connection, id: &str) -> rusqlite::Result<Option<Project>> {
    conn.query_row("SELECT * FROM projects WHERE id = ?1", params![id], row_to_project).optional()
}

pub fn find_project_by_path(conn: &Connection, path: &str) -> rusqlite::Result<Option<Project>> {
    conn.query_row("SELECT * FROM projects WHERE path = ?1", params![path], row_to_project).optional()
}

pub fn update_project(
    conn: &Connection,
    id: &str,
    name: &str,
    color: &str,
    context: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE projects SET name = ?2, color = ?3, context = ?4, updated_at = ?5 WHERE id = ?1",
        params![id, name, color, context, now()],
    )?;
    Ok(())
}

pub fn touch_project(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE projects SET updated_at = ?2 WHERE id = ?1", params![id, now()])?;
    Ok(())
}

pub fn delete_project(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

// ---------- decisions ----------

fn row_to_decision(r: &Row) -> rusqlite::Result<Decision> {
    Ok(Decision {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        title: r.get("title")?,
        status: r.get("status")?,
        brief_json: r.get("brief_json")?,
        result_md: r.get("result_md")?,
        doc_path: r.get("doc_path")?,
        model: r.get("model")?,
        session_id: r.get("session_id")?,
        error: r.get("error")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

pub fn create_decision(
    conn: &Connection,
    project_id: &str,
    title: &str,
    brief_json: &str,
) -> rusqlite::Result<Decision> {
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO decisions(id, project_id, title, status, brief_json, result_md, created_at, updated_at)
         VALUES(?1, ?2, ?3, 'running', ?4, '', ?5, ?5)",
        params![id, project_id, title, brief_json, ts],
    )?;
    get_decision(conn, &id).map(|d| d.expect("just inserted"))
}

pub fn get_decision(conn: &Connection, id: &str) -> rusqlite::Result<Option<Decision>> {
    conn.query_row("SELECT * FROM decisions WHERE id = ?1", params![id], row_to_decision).optional()
}

pub fn list_decisions(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<DecisionSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, status, doc_path, model, created_at, updated_at
         FROM decisions WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |r| {
        Ok(DecisionSummary {
            id: r.get("id")?,
            project_id: r.get("project_id")?,
            title: r.get("title")?,
            status: r.get("status")?,
            doc_path: r.get("doc_path")?,
            model: r.get("model")?,
            created_at: r.get("created_at")?,
            updated_at: r.get("updated_at")?,
        })
    })?;
    rows.collect()
}

#[allow(clippy::too_many_arguments)]
pub fn finish_decision(
    conn: &Connection,
    id: &str,
    status: &str,
    result_md: &str,
    model: Option<&str>,
    session_id: Option<&str>,
    error: Option<&str>,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE decisions
         SET status = ?2, result_md = ?3, model = ?4, session_id = ?5, error = ?6, updated_at = ?7
         WHERE id = ?1",
        params![id, status, result_md, model, session_id, error, now()],
    )?;
    Ok(())
}

pub fn set_decision_doc_path(conn: &Connection, id: &str, doc_path: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE decisions SET doc_path = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, doc_path, now()],
    )?;
    Ok(())
}

pub fn set_decision_markdown(conn: &Connection, id: &str, md: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE decisions SET result_md = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, md, now()],
    )?;
    Ok(())
}

pub fn delete_decision(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM decisions WHERE id = ?1", params![id])?;
    Ok(())
}

// ---------- mcp ----------

fn row_to_mcp(r: &Row) -> rusqlite::Result<McpServer> {
    Ok(McpServer {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        name: r.get("name")?,
        transport: r.get("transport")?,
        command: r.get("command")?,
        args: r.get("args")?,
        env: r.get("env")?,
        enabled: r.get::<_, i64>("enabled")? != 0,
        created_at: r.get("created_at")?,
    })
}

pub fn list_mcp_servers(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<McpServer>> {
    let mut stmt = conn.prepare("SELECT * FROM mcp_servers WHERE project_id = ?1 ORDER BY name")?;
    let rows = stmt.query_map(params![project_id], row_to_mcp)?;
    rows.collect()
}

pub fn upsert_mcp_server(conn: &Connection, s: &McpServer) -> rusqlite::Result<McpServer> {
    let id = if s.id.trim().is_empty() { new_id() } else { s.id.clone() };
    conn.execute(
        "INSERT INTO mcp_servers(id, project_id, name, transport, command, args, env, enabled, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, transport = excluded.transport, command = excluded.command,
            args = excluded.args, env = excluded.env, enabled = excluded.enabled",
        params![id, s.project_id, s.name, s.transport, s.command, s.args, s.env, i64::from(s.enabled), now()],
    )?;
    conn.query_row("SELECT * FROM mcp_servers WHERE id = ?1", params![id], row_to_mcp)
}

pub fn delete_mcp_server(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM mcp_servers WHERE id = ?1", params![id])?;
    Ok(())
}

// ---------- skills ----------

fn row_to_skill(r: &Row) -> rusqlite::Result<Skill> {
    Ok(Skill {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        skill_name: r.get("skill_name")?,
        source_repo: r.get("source_repo")?,
        enabled: r.get::<_, i64>("enabled")? != 0,
        created_at: r.get("created_at")?,
    })
}

pub fn add_skill(
    conn: &Connection,
    project_id: &str,
    name: &str,
    source_repo: &str,
) -> rusqlite::Result<Skill> {
    let id = new_id();
    conn.execute(
        "INSERT INTO skills(id, project_id, skill_name, source_repo, enabled, created_at)
         VALUES(?1, ?2, ?3, ?4, 1, ?5)
         ON CONFLICT(project_id, skill_name) DO UPDATE SET source_repo = excluded.source_repo, enabled = 1",
        params![id, project_id, name, source_repo, now()],
    )?;
    conn.query_row(
        "SELECT * FROM skills WHERE project_id = ?1 AND skill_name = ?2",
        params![project_id, name],
        row_to_skill,
    )
}

pub fn list_skills(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<Skill>> {
    let mut stmt = conn.prepare("SELECT * FROM skills WHERE project_id = ?1 ORDER BY skill_name")?;
    let rows = stmt.query_map(params![project_id], row_to_skill)?;
    rows.collect()
}

pub fn get_skill(conn: &Connection, id: &str) -> rusqlite::Result<Option<Skill>> {
    conn.query_row("SELECT * FROM skills WHERE id = ?1", params![id], row_to_skill).optional()
}

pub fn set_skill_enabled(conn: &Connection, id: &str, enabled: bool) -> rusqlite::Result<()> {
    conn.execute("UPDATE skills SET enabled = ?2 WHERE id = ?1", params![id, i64::from(enabled)])?;
    Ok(())
}

pub fn delete_skill(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM skills WHERE id = ?1", params![id])?;
    Ok(())
}

// ---------- modelo del sistema ----------

fn row_to_element(r: &Row) -> rusqlite::Result<ModelElement> {
    Ok(ModelElement {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        kind: r.get("kind")?,
        name: r.get("name")?,
        summary: r.get("summary")?,
        status: r.get("status")?,
        tech: r.get("tech")?,
        owner: r.get("owner")?,
        parent_id: r.get("parent_id")?,
        source: r.get("source")?,
        decision_id: r.get("decision_id")?,
        depends_on: r.get("depends_on")?,
        location: r.get("location")?,
        notes: r.get("notes")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

pub fn list_model_elements(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<ModelElement>> {
    let mut stmt = conn.prepare("SELECT * FROM model_elements WHERE project_id = ?1 ORDER BY kind, name")?;
    let rows = stmt.query_map(params![project_id], row_to_element)?;
    rows.collect()
}

pub fn upsert_model_element(conn: &Connection, e: &ModelElement) -> rusqlite::Result<ModelElement> {
    let id = if e.id.trim().is_empty() { new_id() } else { e.id.clone() };
    let ts = now();
    // `created_at` se conserva en el update: es la fecha en que la pieza entró al modelo, y
    // perderla al editar el resumen borraría la única traza de cuándo apareció.
    conn.execute(
        "INSERT INTO model_elements(id, project_id, kind, name, summary, status, tech, owner,
                                    parent_id, source, decision_id, depends_on, location, notes,
                                    created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)
         ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind, name = excluded.name, summary = excluded.summary,
            status = excluded.status, tech = excluded.tech, owner = excluded.owner,
            parent_id = excluded.parent_id, source = excluded.source,
            decision_id = excluded.decision_id, depends_on = excluded.depends_on,
            location = excluded.location, notes = excluded.notes, updated_at = excluded.updated_at",
        params![
            id,
            e.project_id,
            e.kind,
            e.name,
            e.summary,
            e.status,
            e.tech,
            e.owner,
            e.parent_id,
            e.source,
            e.decision_id,
            e.depends_on,
            e.location,
            e.notes,
            ts
        ],
    )?;
    conn.query_row("SELECT * FROM model_elements WHERE id = ?1", params![id], row_to_element)
}

pub fn delete_model_element(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    // `parent_id` lo limpia la foreign key (ON DELETE SET NULL), pero `depends_on` es texto y
    // SQLite no lo toca: sin esto quedarían ids apuntando a una pieza que ya no existe, y el
    // diagrama perdería esas flechas en silencio la próxima vez que se cargue el modelo.
    let stale: Vec<(String, String)> = {
        let mut stmt =
            conn.prepare("SELECT id, depends_on FROM model_elements WHERE depends_on LIKE '%' || ?1 || '%'")?;
        let rows = stmt.query_map(params![id], |r| Ok((r.get("id")?, r.get("depends_on")?)))?;
        rows.collect::<rusqlite::Result<_>>()?
    };
    for (row_id, deps) in stale {
        let cleaned: Vec<&str> = deps.lines().map(str::trim).filter(|d| !d.is_empty() && *d != id).collect();
        conn.execute(
            "UPDATE model_elements SET depends_on = ?2 WHERE id = ?1",
            params![row_id, cleaned.join("\n")],
        )?;
    }

    conn.execute("DELETE FROM model_elements WHERE id = ?1", params![id])?;
    Ok(())
}
