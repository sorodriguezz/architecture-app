//! Registro de ejecuciones vivas: permite cancelar una corrida en curso y emitir su salida
//! línea por línea al frontend mientras ocurre.
//!
//! El id de la corrida viaja por un task-local en vez de como parámetro: entre el comando Tauri y
//! el `run()` que hace el spawn hay cuatro o cinco funciones intermedias a las que ese id no les
//! importa, y enhebrarlo por todas ensucia cada firma.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

/// Prefijo con el que se marca una corrida abortada por el usuario, para distinguirla de un
/// error real en la capa de arriba (no se muestra como fallo, no se guarda como `error`).
pub const CANCELLED_MARKER: &str = "__ARCHFLOW_CANCELLED__";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLine {
    pub run_id: String,
    /// `stdout` | `stderr`
    pub stream: String,
    pub line: String,
}

#[derive(Clone)]
pub struct RunCtx {
    pub run_id: String,
    pub app: AppHandle,
}

tokio::task_local! {
    static CURRENT: RunCtx;
}

type Registry = Mutex<HashMap<String, broadcast::Sender<()>>>;

fn registry() -> &'static Registry {
    static REG: OnceLock<Registry> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Corre `fut` bajo el id dado, registrándolo como cancelable mientras dura.
pub async fn scoped<F, T>(app: AppHandle, run_id: String, fut: F) -> T
where
    F: std::future::Future<Output = T>,
{
    let (tx, _rx) = broadcast::channel(1);
    if let Ok(mut reg) = registry().lock() {
        reg.insert(run_id.clone(), tx);
    }
    let ctx = RunCtx { run_id: run_id.clone(), app };
    let out = CURRENT.scope(ctx, fut).await;
    if let Ok(mut reg) = registry().lock() {
        reg.remove(&run_id);
    }
    out
}

pub fn current() -> Option<RunCtx> {
    CURRENT.try_with(|c| c.clone()).ok()
}

/// Pide la cancelación. Devuelve `false` si ese id ya no está corriendo — el llamador lo usa
/// para no mostrar "cancelado" cuando en realidad la corrida acababa de terminar sola.
pub fn cancel(run_id: &str) -> bool {
    registry().lock().ok().and_then(|reg| reg.get(run_id).map(|tx| tx.send(()).is_ok())).unwrap_or(false)
}

pub fn subscribe(run_id: &str) -> Option<broadcast::Receiver<()>> {
    registry().lock().ok().and_then(|reg| reg.get(run_id).map(|tx| tx.subscribe()))
}

/// Espera la señal de cancelación. Si no hay canal (corrida no registrada), no resuelve nunca —
/// así el `select!` que la acompaña se queda esperando solo al proceso, que es lo correcto.
pub async fn cancelled(rx: &mut Option<broadcast::Receiver<()>>) {
    match rx {
        Some(rx) => {
            let _ = rx.recv().await;
        }
        None => std::future::pending::<()>().await,
    }
}

pub fn emit_line(ctx: &RunCtx, stream: &str, line: &str) {
    let _ = ctx.app.emit(
        "ai:line",
        RunLine { run_id: ctx.run_id.clone(), stream: stream.to_string(), line: line.trim_end().to_string() },
    );
}

/// Mata el proceso hijo. En Windows un `kill()` a la shell (`cmd /C claude …`) deja al nieto
/// vivo, así que hay que ir por el árbol completo con `taskkill /T`.
pub async fn kill_tree(child: &mut tokio::process::Child) {
    #[cfg(target_os = "windows")]
    if let Some(pid) = child.id() {
        let _ = tokio::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;
    }
    let _ = child.kill().await;
}
