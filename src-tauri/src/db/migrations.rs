use rusqlite::Connection;

/// Cada entrada es un paso irreversible aplicado una sola vez, en orden. `user_version` guarda
/// cuántos se aplicaron ya — nunca se edita un paso publicado, se agrega uno nuevo al final.
const MIGRATIONS: &[&str] = &[
    // v1 — esquema inicial
    r#"
    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        path       TEXT NOT NULL,
        color      TEXT NOT NULL DEFAULT '#6366f1',
        context    TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

    CREATE TABLE IF NOT EXISTS decisions (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'draft',
        brief_json TEXT NOT NULL DEFAULT '{}',
        result_md  TEXT NOT NULL DEFAULT '',
        doc_path   TEXT,
        model      TEXT,
        session_id TEXT,
        error      TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS mcp_servers (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        transport  TEXT NOT NULL DEFAULT 'stdio',
        command    TEXT NOT NULL DEFAULT '',
        args       TEXT NOT NULL DEFAULT '',
        env        TEXT NOT NULL DEFAULT '',
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_project ON mcp_servers(project_id);

    CREATE TABLE IF NOT EXISTS skills (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        skill_name  TEXT NOT NULL,
        source_repo TEXT NOT NULL,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_unique ON skills(project_id, skill_name);
    "#,
    // v2 — modelo del sistema: el inventario vivo de lo que existe en el proyecto real.
    //
    // Una sola tabla para las cinco clases de pieza (componente, endpoint, integración, entidad y
    // deuda) porque comparten todo lo que importa — nombre, estado, dueño, de dónde salió, qué
    // decisión la justificó — y lo específico de cada una cabe en `name` y `location`
    // (`POST /api/ordenes` en `src/Controllers/OrdenesController.cs`). Tablas separadas obligarían
    // a cinco consultas para dibujar un diagrama que necesita todo junto.
    //
    // `decision_id` se pone a NULL si la decisión se borra: la pieza sigue existiendo en el
    // sistema real aunque su justificación se haya ido de la app.
    r#"
    CREATE TABLE IF NOT EXISTS model_elements (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL,
        name        TEXT NOT NULL,
        summary     TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'propuesto',
        tech        TEXT NOT NULL DEFAULT '',
        owner       TEXT NOT NULL DEFAULT '',
        parent_id   TEXT REFERENCES model_elements(id) ON DELETE SET NULL,
        source      TEXT NOT NULL DEFAULT 'manual',
        decision_id TEXT REFERENCES decisions(id) ON DELETE SET NULL,
        depends_on  TEXT NOT NULL DEFAULT '',
        location    TEXT NOT NULL DEFAULT '',
        notes       TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_model_project ON model_elements(project_id, kind, name);
    "#,
];

pub fn apply(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (idx, sql) in MIGRATIONS.iter().enumerate() {
        let version = idx as i64 + 1;
        if version <= current {
            continue;
        }
        conn.execute_batch(sql)?;
        conn.execute_batch(&format!("PRAGMA user_version = {version};"))?;
    }
    Ok(())
}
