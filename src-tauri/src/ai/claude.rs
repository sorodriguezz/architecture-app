//! Lo específico de la CLI `claude`: sus banderas y cómo reporta resultados bajo
//! `--output-format stream-json`.

use serde::Deserialize;
use std::collections::BTreeMap;
use tokio::process::Command;

use super::{quota_signal, AiInvocation, AiRun, QUOTA_MARKER};

/// Modelos que la app ofrece en el selector. La CLI no expone una lista legible por máquina, así
/// que esta es curada — el usuario igual puede escribir cualquier id a mano, que se pasa tal cual
/// a `--model`.
pub const KNOWN_MODELS: &[(&str, &str)] = &[
    ("opus", "Opus — el más capaz; para decisiones de arquitectura complejas"),
    ("sonnet", "Sonnet — equilibrio entre calidad y velocidad (recomendado)"),
    ("haiku", "Haiku — rápido y barato; para resúmenes y tareas mecánicas"),
    ("claude-opus-4-6", "Opus 4.6 (id fijo)"),
    ("claude-sonnet-4-5", "Sonnet 4.5 (id fijo)"),
    ("claude-haiku-4-5", "Haiku 4.5 (id fijo)"),
];

/// Herramientas de solo lectura: lo mínimo para que el modelo pueda mirar el repo antes de
/// decidir, sin poder tocarlo.
pub fn read_only_tools() -> Vec<String> {
    ["Read", "Grep", "Glob", "WebSearch", "WebFetch"].iter().map(|s| s.to_string()).collect()
}

/// Herramientas con escritura: para cuando la corrida tiene que dejar archivos en el repo
/// (generar los `.md` directamente, actualizar un ADR existente).
pub fn write_tools() -> Vec<String> {
    ["Read", "Grep", "Glob", "Edit", "Write", "WebSearch", "WebFetch"].iter().map(|s| s.to_string()).collect()
}

pub fn build_command(binary: &str, inv: &AiInvocation) -> Command {
    let mut cmd = Command::new(binary);
    cmd.arg("-p").arg(inv.prompt);
    if let Some(sp) = inv.system_prompt {
        cmd.arg("--append-system-prompt").arg(sp);
    }
    if !inv.model.trim().is_empty() {
        cmd.arg("--model").arg(inv.model);
    }
    // `stream-json` (que la CLI solo acepta junto a `--verbose` en modo `-p`) emite un evento JSON
    // por línea *mientras corre*, en vez de un único blob al final. Eso es lo que la app muestra
    // en el log en vivo — con `json` a secas no habría literalmente nada que mostrar hasta que el
    // proceso termina. El evento final `result` trae los mismos campos que el formato antiguo.
    cmd.arg("--output-format").arg("stream-json").arg("--verbose");
    if !inv.allowed_tools.is_empty() {
        cmd.arg("--allowedTools").arg(inv.allowed_tools.join(","));
    }
    if inv.auto_approve_edits {
        cmd.arg("--permission-mode").arg("acceptEdits");
    }
    if let Some(path) = inv.mcp_config_path {
        cmd.arg("--mcp-config").arg(path).arg("--strict-mcp-config");
    }
    if let Some(id) = inv.resume_session_id {
        cmd.arg("--resume").arg(id);
    }
    if let Some(dir) = inv.cwd {
        cmd.current_dir(dir);
    }
    cmd
}

#[derive(Deserialize)]
struct CliResult {
    result: Option<String>,
    #[serde(default)]
    is_error: bool,
    #[serde(default)]
    session_id: Option<String>,
    /// Contabilidad de tokens indexada por el id de modelo que la CLI *realmente* usó. Es la única
    /// forma de reportar una versión concreta cuando no se pasó `--model`.
    #[serde(default, rename = "modelUsage")]
    model_usage: BTreeMap<String, serde_json::Value>,
}

fn model_used(parsed: &CliResult) -> Option<String> {
    match parsed.model_usage.len() {
        1 => parsed.model_usage.keys().next().cloned(),
        // Un turno que se repartió entre modelos no tiene una respuesta honesta: no reporta
        // ninguno y la UI cae al modelo configurado.
        _ => None,
    }
}

/// Elige, dentro de stdout, la carga útil a interpretar.
///
/// Bajo `stream-json` stdout es un evento JSON por línea y el último `{"type":"result",…}` es el
/// veredicto. Caer a parsear el buffer completo mantiene funcionando a una CLI que ignoró (o no
/// conoce) la bandera, así que sirve tanto para versiones viejas como nuevas.
fn result_payload(stdout: &str) -> Option<CliResult> {
    for line in stdout.lines().rev() {
        let line = line.trim();
        if !line.starts_with('{') {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if value.get("type").and_then(serde_json::Value::as_str) == Some("result") {
                return serde_json::from_value(value).ok();
            }
        }
    }
    serde_json::from_str::<CliResult>(stdout).ok()
}

/// Convierte una corrida terminada en su texto (más sesión y modelo) o en un mensaje de error.
///
/// stdout se parsea **antes** de juzgar el exit status a propósito: la CLI reporta sus propios
/// fallos en stdout (`{"is_error":true,"result":"<razón>"}`) y sale distinto de cero dejando
/// stderr **vacío**. Ramificar primero por el status descartaba la única copia de la razón (auth
/// vencida, modelo inexistente) y dejaba al usuario con un "claude falló:" sin nada después.
pub fn interpret(success: bool, status_label: &str, stdout: &str, stderr: &str) -> Result<AiRun, String> {
    let parsed = result_payload(stdout);
    let result_text =
        parsed.as_ref().and_then(|p| p.result.as_deref()).map(str::trim).filter(|t| !t.is_empty());

    if let Some(text) = result_text {
        if quota_signal(text) {
            return Err(format!("{QUOTA_MARKER}{text}"));
        }
        if !success || parsed.as_ref().is_some_and(|p| p.is_error) {
            return Err(text.to_string());
        }
        let model = parsed.as_ref().and_then(model_used);
        return Ok(AiRun { text: text.to_string(), session_id: parsed.and_then(|p| p.session_id), model });
    }

    if !success {
        for stream in [stderr, stdout] {
            if quota_signal(stream) {
                return Err(format!("{QUOTA_MARKER}{}", stream.trim()));
            }
        }
        let detail = [stderr.trim(), stdout.trim()]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or("sin salida en stdout ni stderr");
        return Err(format!("claude terminó con error ({status_label}): {detail}"));
    }

    let fallback = stdout.trim();
    if fallback.is_empty() {
        return Err("claude no produjo salida".to_string());
    }
    if quota_signal(fallback) {
        return Err(format!("{QUOTA_MARKER}{fallback}"));
    }
    Ok(AiRun { text: fallback.to_string(), session_id: None, model: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lo que imprime de verdad `--output-format stream-json --verbose`: un evento de init, el
    /// turno del asistente (con sus tool calls) y luego el veredicto. Solo el último es el
    /// resultado — el parseo tiene que saltarse todo lo anterior, no atorarse en la primera línea.
    const STREAM_STDOUT: &str = concat!(
        r#"{"type":"system","subtype":"init","session_id":"s-1","model":"claude-opus-4-6"}"#,
        "\n",
        r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"README.md"}}]},"session_id":"s-1"}"#,
        "\n",
        r##"{"type":"result","subtype":"success","is_error":false,"session_id":"s-1","result":"# ADR-001","modelUsage":{"claude-opus-4-6":{"outputTokens":9}}}"##,
        "\n",
    );

    #[test]
    fn reads_the_verdict_out_of_a_streamed_run() {
        let run = interpret(true, "exit status: 0", STREAM_STDOUT, "").unwrap();
        assert_eq!(run.text, "# ADR-001");
        assert_eq!(run.session_id.as_deref(), Some("s-1"));
        assert_eq!(run.model.as_deref(), Some("claude-opus-4-6"));
    }

    /// El caso que motiva parsear stdout antes que el exit status: status 1, stderr vacío, y la
    /// razón real solo presente en stdout.
    #[test]
    fn surfaces_the_reason_json_carries_when_stderr_is_empty() {
        let stdout =
            r#"{"type":"result","is_error":true,"result":"Failed to authenticate: OAuth session expired"}"#;
        let err = interpret(false, "exit status: 1", stdout, "").unwrap_err();
        assert_eq!(err, "Failed to authenticate: OAuth session expired");
    }

    #[test]
    fn falls_back_to_the_exit_status_when_nothing_explains_the_failure() {
        let err = interpret(false, "exit status: 127", "", "").unwrap_err();
        assert!(err.contains("127"), "got {err}");
        assert!(err.contains("sin salida"), "got {err}");
    }

    #[test]
    fn a_quota_failure_gets_the_marker_the_frontend_looks_for() {
        let stdout = r#"{"is_error":true,"result":"Claude usage limit reached, resets at 5pm"}"#;
        let err = interpret(false, "exit status: 1", stdout, "").unwrap_err();
        assert!(err.starts_with(QUOTA_MARKER), "got {err}");
    }

    #[test]
    fn stays_silent_when_more_than_one_model_ran() {
        let stdout = r#"{"result":"ok","modelUsage":{"claude-opus-4-6":{},"claude-haiku-4-5":{}}}"#;
        let run = interpret(true, "exit status: 0", stdout, "").unwrap();
        assert_eq!(run.model, None);
    }

    #[test]
    fn non_json_stdout_on_a_clean_exit_is_passed_through() {
        let run = interpret(true, "exit status: 0", "texto plano\n", "").unwrap();
        assert_eq!(run.text, "texto plano");
    }

    /// Cada bandera opcional tiene que ser realmente opcional: una invocación mínima no puede
    /// arrastrar `--model` vacío ni `--allowedTools` sin valor, que la CLI rechaza.
    #[test]
    fn a_minimal_invocation_passes_no_empty_flags() {
        let inv = AiInvocation::new("hola", "");
        let cmd = build_command("claude", &inv);
        let args: Vec<String> = cmd.as_std().get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert!(!args.contains(&"--model".to_string()));
        assert!(!args.contains(&"--allowedTools".to_string()));
        assert!(!args.contains(&"--resume".to_string()));
        assert!(args.contains(&"--verbose".to_string()));
    }

    #[test]
    fn a_full_invocation_carries_every_flag() {
        let tools = vec!["Read".to_string(), "Grep".to_string()];
        let mut inv = AiInvocation::new("ask", "data");
        inv.model = "opus";
        inv.allowed_tools = &tools;
        inv.mcp_config_path = Some("/tmp/mcp.json");
        inv.resume_session_id = Some("s-9");
        inv.auto_approve_edits = true;
        let cmd = build_command("claude", &inv);
        let args: Vec<String> = cmd.as_std().get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert!(args.windows(2).any(|w| w[0] == "--model" && w[1] == "opus"));
        assert!(args.windows(2).any(|w| w[0] == "--allowedTools" && w[1] == "Read,Grep"));
        assert!(args.windows(2).any(|w| w[0] == "--mcp-config" && w[1] == "/tmp/mcp.json"));
        assert!(args.contains(&"--strict-mcp-config".to_string()));
        assert!(args.windows(2).any(|w| w[0] == "--permission-mode" && w[1] == "acceptEdits"));
    }
}
