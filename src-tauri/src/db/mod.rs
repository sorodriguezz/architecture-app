pub mod migrations;
pub mod models;
pub mod queries;

use rusqlite::Connection;
use std::sync::Mutex;

use crate::paths;

/// Una única conexión SQLite compartida detrás de un mutex. Las operaciones son cortas
/// (leer/escribir filas de configuración y decisiones) y el trabajo pesado es el subproceso de
/// IA, así que un pool no aportaría nada y sí complicaría el manejo de errores.
pub struct Db(pub Mutex<Connection>);

pub fn init() -> rusqlite::Result<Db> {
    // Sin esto, abrir la base falla en una instalación nueva porque el directorio no existe.
    let _ = paths::ensure_dirs();
    let conn = Connection::open(paths::db_path())?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    migrations::apply(&conn)?;
    Ok(Db(Mutex::new(conn)))
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
