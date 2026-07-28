//! Capa de IA: invoca **Claude Code en modo headless** (`claude -p …`) como subproceso y
//! transporta su salida.
//!
//! Toda función de la app que "piensa" pasa por aquí. El módulo se divide en:
//! - este archivo: resolución del binario, `PATH`, spawn, streaming, cancelación;
//! - [`claude`]: las banderas concretas de la CLI y cómo leer su salida `stream-json`;
//! - [`prompts`]: las plantillas de arquitectura (independientes del transporte).

pub mod claude;
pub mod prompts;
pub mod runs;

use std::process::Stdio;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

use runs::RunCtx;

/// Prefijo que el frontend busca para mostrar un aviso de cuota en vez de un error rojo genérico.
pub const QUOTA_MARKER: &str = "QUOTA_EXCEEDED::";

/// Frases que significan "el proveedor se negó por límite o saldo", no que algo esté roto.
const QUOTA_SIGNALS: [&str; 7] = [
    "usage limit",
    "rate limit",
    "quota exceeded",
    "resets at",
    "limit reached",
    "insufficient credit",
    "payment required",
];

pub fn quota_signal(text: &str) -> bool {
    let lower = text.to_lowercase();
    QUOTA_SIGNALS.iter().any(|s| lower.contains(s))
}

/// Una corrida terminada: la respuesta más los metadatos que el llamador quiera conservar.
#[derive(Debug, Default)]
pub struct AiRun {
    pub text: String,
    /// Sesión a reanudar en el siguiente turno (chat sobre una decisión ya generada).
    pub session_id: Option<String>,
    /// Modelo que la CLI realmente usó, cuando reportó exactamente uno.
    pub model: Option<String>,
}

/// Una invocación headless descrita en términos neutrales; [`claude`] la traduce a banderas.
#[derive(Default)]
pub struct AiInvocation<'a> {
    /// El "pedido" — va como argumento de `-p`. Los *datos* van por stdin.
    pub prompt: &'a str,
    /// Instrucciones de sistema extra para esta corrida.
    pub system_prompt: Option<&'a str>,
    /// Id de modelo a forzar; vacío = que la CLI elija.
    pub model: &'a str,
    /// Herramientas permitidas, nombres tal cual los espera la CLI.
    pub allowed_tools: &'a [String],
    /// Directorio de trabajo (la raíz del proyecto, para que la CLI vea sus skills y archivos).
    pub cwd: Option<&'a str>,
    /// Ruta a un JSON de `--mcp-config`, si el proyecto tiene servidores MCP habilitados.
    pub mcp_config_path: Option<&'a str>,
    /// Datos que se envían por stdin (el brief, el documento previo, la pregunta).
    pub stdin_content: &'a str,
    /// Sesión a reanudar, para conversación multi-turno.
    pub resume_session_id: Option<&'a str>,
    /// Auto-aprobar creación/edición de archivos. Las corridas son headless (sin TTY), así que un
    /// prompt interactivo de permisos no se puede contestar nunca: los flujos que escriben
    /// archivos tienen que activarlo o se quedan colgados.
    pub auto_approve_edits: bool,
}

impl<'a> AiInvocation<'a> {
    pub fn new(prompt: &'a str, stdin_content: &'a str) -> Self {
        Self { prompt, stdin_content, ..Default::default() }
    }
}

/// Quita secuencias de escape ANSI. La CLI corre headless pero colorea igual, y esos bytes
/// crudos se renderizarían literalmente como `[91m` en la UI.
pub fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.next() {
            // CSI: ESC [ params… byte final en @–~
            Some('[') => {
                for byte in chars.by_ref() {
                    if ('\u{40}'..='\u{7e}').contains(&byte) {
                        break;
                    }
                }
            }
            // OSC: ESC ] … terminado por BEL o ESC \
            Some(']') => {
                while let Some(byte) = chars.next() {
                    if byte == '\u{7}' {
                        break;
                    }
                    if byte == '\u{1b}' {
                        chars.next();
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

/// Directorios donde los instaladores dejan la CLI, antepuestos al `PATH`.
///
/// Hace falta porque en macOS una app lanzada desde Finder hereda el `PATH` mínimo de launchd, y
/// en Windows una app que ya estaba corriendo cuando se instaló la CLI conserva el `PATH` viejo.
/// Un `binary_path` absoluto configurado en Ajustes ignora todo esto.
#[cfg(not(target_os = "windows"))]
fn install_dirs() -> Vec<std::path::PathBuf> {
    use std::path::PathBuf;
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".claude/local"));
        dirs.push(home.join(".bun/bin"));
        dirs.push(home.join("Library/pnpm"));
        dirs.push(home.join(".npm-global/bin"));
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs
}

#[cfg(target_os = "windows")]
fn install_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local").join("bin")); // instalador nativo de Claude
        dirs.push(home.join(".claude").join("local"));
    }
    // El bin global de npm en Windows es `%APPDATA%\npm` (dirs::data_dir() == Roaming AppData).
    if let Some(appdata) = dirs::data_dir() {
        dirs.push(appdata.join("npm"));
    }
    dirs
}

fn search_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = install_dirs();
    if let Some(current) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&current));
    }
    dirs
}

fn apply_path(cmd: &mut Command, dirs: &[std::path::PathBuf]) {
    if let Ok(joined) = std::env::join_paths(dirs) {
        cmd.env("PATH", joined);
    }
}

#[cfg(not(target_os = "windows"))]
fn resolve_binary(binary: &str, _dirs: &[std::path::PathBuf]) -> String {
    binary.to_string()
}

/// Windows: convierte un nombre suelto en una ruta completa **con su extensión**.
/// `CreateProcess` (lo que usa `Command`) solo agrega `.exe` automáticamente, así que una CLI de
/// Node instalada como shim `<nombre>.cmd` —que es como cae `claude` vía npm— es invisible para
/// un `Command::new("claude")` pelado, y al ser un batch tampoco se puede ejecutar directo.
/// Resolver a la ruta completa del `.cmd` deja que Rust (≥1.77) lo enrute por `cmd.exe` con el
/// escapado de argumentos correcto. Un `.exe` real (instalador nativo) gana sobre el shim.
#[cfg(target_os = "windows")]
fn resolve_binary(binary: &str, dirs: &[std::path::PathBuf]) -> String {
    use std::path::Path;
    if binary.contains('/') || binary.contains('\\') || Path::new(binary).extension().is_some() {
        return binary.to_string();
    }
    for dir in dirs {
        for ext in ["exe", "cmd", "bat"] {
            let candidate = dir.join(format!("{binary}.{ext}"));
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }
    binary.to_string()
}

/// Localiza el binario igual que lo hará [`run`]. `None` significa que lanzarlo fallaría.
pub fn find_on_path(binary: &str) -> Option<std::path::PathBuf> {
    let path = std::path::Path::new(binary);
    if path.is_absolute() || binary.contains('/') || binary.contains('\\') {
        return path.is_file().then(|| path.to_path_buf());
    }
    #[cfg(target_os = "windows")]
    let extensions: &[&str] = &["exe", "cmd", "bat", ""];
    #[cfg(not(target_os = "windows"))]
    let extensions: &[&str] = &[""];

    for dir in search_dirs() {
        for ext in extensions {
            let candidate =
                if ext.is_empty() { dir.join(binary) } else { dir.join(format!("{binary}.{ext}")) };
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Drena una de las tuberías del hijo: acumula los bytes crudos para el intérprete y a la vez
/// emite líneas completas al frontend a medida que llegan.
///
/// Acumula bytes y no un `String` a propósito: un carácter multibyte partido entre dos `read`
/// se decodificaría como caracteres de reemplazo si cada trozo se decodificara por separado,
/// corrompiendo justo la salida que se va a parsear.
async fn pump<R: tokio::io::AsyncRead + Unpin>(
    pipe: Option<R>,
    stream: &'static str,
    ctx: Option<RunCtx>,
) -> Vec<u8> {
    let mut collected: Vec<u8> = Vec::new();
    let Some(mut pipe) = pipe else { return collected };

    let mut buf = [0u8; 8192];
    let mut pending: Vec<u8> = Vec::new();
    loop {
        let read = match pipe.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        collected.extend_from_slice(&buf[..read]);
        let Some(ctx) = &ctx else { continue };

        pending.extend_from_slice(&buf[..read]);
        while let Some(idx) = pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = pending.drain(..=idx).collect();
            runs::emit_line(ctx, stream, &strip_ansi(&String::from_utf8_lossy(&line)));
        }
        // Una CLI que dibuja una barra de progreso reescribe una línea con `\r` y nunca manda
        // `\n`; sin esto el buffer crecería sin límite y el usuario no vería nada.
        if pending.len() > 8192 {
            runs::emit_line(ctx, stream, &strip_ansi(&String::from_utf8_lossy(&pending)));
            pending.clear();
        }
    }
    if let Some(ctx) = &ctx {
        if !pending.is_empty() {
            runs::emit_line(ctx, stream, &strip_ansi(&String::from_utf8_lossy(&pending)));
        }
    }
    collected
}

/// Lanza la CLI, le entrega `stdin_content`, transmite su salida mientras corre y entrega el
/// resultado al intérprete. Cancelable si el llamador la envolvió en [`runs::scoped`].
pub async fn run(binary: &str, inv: AiInvocation<'_>) -> Result<AiRun, String> {
    let ctx = runs::current();
    let mut cancel = ctx.as_ref().and_then(|c| runs::subscribe(&c.run_id));

    let dirs = search_dirs();
    let program = resolve_binary(binary, &dirs);
    let mut cmd = claude::build_command(&program, &inv);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    apply_path(&mut cmd, &dirs);

    let mut child = cmd.spawn().map_err(|e| format!("no se pudo ejecutar '{binary}': {e}"))?;

    // stdin se alimenta desde otra tarea, en paralelo con la espera de la salida: si se escribiera
    // en línea, un `write_all().await` nunca terminaría cuando el buffer del pipe del SO se llena
    // y nadie lo drena, y jamás se llegaría a leer stdout. Al soltar el handle al final de la
    // tarea se manda EOF, que es lo que hace que la CLI empiece a responder.
    let stdin_content = inv.stdin_content.to_string();
    let mut stdin_handle = child.stdin.take();
    let writer = tokio::spawn(async move {
        if let Some(mut stdin) = stdin_handle.take() {
            let _ = stdin.write_all(stdin_content.as_bytes()).await;
        }
    });

    // Las dos tuberías se drenan en paralelo con la espera: leerlas recién al terminar el proceso
    // trabaría cualquier salida más grande que el buffer del pipe.
    let stdout_task = tokio::spawn(pump(child.stdout.take(), "stdout", ctx.clone()));
    let stderr_task = tokio::spawn(pump(child.stderr.take(), "stderr", ctx.clone()));

    let status = tokio::select! {
        status = child.wait() => status.map_err(|e| e.to_string())?,
        _ = runs::cancelled(&mut cancel) => {
            runs::kill_tree(&mut child).await;
            let _ = tokio::join!(stdout_task, stderr_task, writer);
            return Err(runs::CANCELLED_MARKER.to_string());
        }
    };

    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();
    let _ = writer.await;

    claude::interpret(
        status.success(),
        &status.to_string(),
        &strip_ansi(&String::from_utf8_lossy(&stdout)),
        &strip_ansi(&String::from_utf8_lossy(&stderr)),
    )
}

/// Corre un comando auxiliar corto y de solo lectura (p. ej. `claude --version`) reutilizando la
/// resolución de binario y el `PATH` de [`run`].
pub async fn capture(binary: &str, args: &[&str]) -> Result<std::process::Output, String> {
    let dirs = search_dirs();
    let program = resolve_binary(binary, &dirs);
    let mut cmd = Command::new(&program);
    cmd.args(args);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    apply_path(&mut cmd, &dirs);
    cmd.output().await.map_err(|e| format!("no se pudo ejecutar '{binary}': {e}"))
}

/// Estado del motor para el badge de Ajustes: si está instalado y qué versión reporta.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub available: bool,
    /// Ruta resuelta cuando está disponible; el nombre buscado cuando no.
    pub detail: String,
    pub version: Option<String>,
}

pub async fn probe(binary: &str) -> EngineStatus {
    match find_on_path(binary) {
        Some(path) => {
            let version = capture(binary, &["--version"])
                .await
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .filter(|v| !v.is_empty());
            EngineStatus { available: true, detail: path.to_string_lossy().into_owned(), version }
        }
        None => EngineStatus { available: false, detail: binary.to_string(), version: None },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_color_codes() {
        assert_eq!(strip_ansi("\u{1b}[91merror\u{1b}[0m"), "error");
        assert_eq!(strip_ansi("sin escapes"), "sin escapes");
    }

    #[test]
    fn detects_quota_refusals() {
        assert!(quota_signal("Claude usage limit reached, resets at 5pm"));
        assert!(!quota_signal("unknown model 'nope'"));
    }
}
