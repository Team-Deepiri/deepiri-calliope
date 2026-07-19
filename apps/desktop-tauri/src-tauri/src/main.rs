use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Debug, Error)]
enum DesktopError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl Serialize for DesktopError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Serialize)]
struct PreflightCheck {
    id: String,
    label: String,
    status: String,
    detail: String,
    required: bool,
    #[serde(rename = "blocksStudio")]
    blocks_studio: bool,
}

#[derive(Serialize)]
struct PreflightResult {
    checks: Vec<PreflightCheck>,
    #[serde(rename = "allRequiredPassed")]
    all_required_passed: bool,
    #[serde(rename = "apiHealthy")]
    api_healthy: bool,
}

fn run_cmd(command: &str, args: &[&str], cwd: Option<&Path>) -> bool {
    let mut cmd = Command::new(command);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

fn app_stack_dir(app: &AppHandle) -> Result<PathBuf, DesktopError> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| DesktopError::Message(format!("Failed to locate app data dir: {e}")))?;
    Ok(base.join("stack"))
}

fn copy_if_missing(from: &Path, to: &Path) -> Result<(), DesktopError> {
    if !to.exists() {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(from, to)?;
    }
    Ok(())
}

fn resource_stack_path(resource_dir: &Path, rel: &str) -> PathBuf {
    let nested = resource_dir.join(format!("resources/stack/{rel}"));
    if nested.exists() {
        return nested;
    }
    let flat = resource_dir.join(format!("stack/{rel}"));
    if flat.exists() {
        return flat;
    }
    nested
}

fn ensure_stack_files(app: &AppHandle) -> Result<PathBuf, DesktopError> {
    let stack_dir = app_stack_dir(app)?;
    fs::create_dir_all(stack_dir.join("data"))?;
    fs::create_dir_all(stack_dir.join("bin"))?;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| DesktopError::Message(format!("Failed to locate resources: {e}")))?;

    copy_if_missing(
        &resource_stack_path(&resource_dir, "docker-compose.yml"),
        &stack_dir.join("docker-compose.yml"),
    )?;
    copy_if_missing(
        &resource_stack_path(&resource_dir, ".env.desktop.example"),
        &stack_dir.join(".env"),
    )?;

    for script in [
        "start-stack.sh",
        "stop-stack.sh",
        "logs-stack.sh",
        "start-stack.ps1",
        "stop-stack.ps1",
        "logs-stack.ps1",
    ] {
        copy_if_missing(
            &resource_stack_path(&resource_dir, &format!("bin/{script}")),
            &stack_dir.join(format!("bin/{script}")),
        )?;
    }
    Ok(stack_dir)
}

fn env_value(env_text: &str, key: &str) -> Option<String> {
    for line in env_text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            if k.trim() == key {
                let value = v.trim().trim_matches('"');
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

fn has_cloud_key(env_text: &str) -> bool {
    ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY"]
        .iter()
        .any(|key| env_value(env_text, key).is_some())
}

fn ollama_model(env_text: &str) -> String {
    env_value(env_text, "OLLAMA_MODEL").unwrap_or_else(|| "mistral".to_string())
}

fn http_get_ok(url: &str) -> bool {
    ureq::get(url)
        .call()
        .map(|response| response.status() == 200)
        .unwrap_or(false)
}

fn ollama_has_model(model: &str) -> bool {
    let Ok(response) = ureq::get("http://127.0.0.1:11434/api/tags").call() else {
        return false;
    };
    if response.status() != 200 {
        return false;
    }
    let Ok(body) = response.into_string() else {
        return false;
    };
    body.contains(&format!("\"{model}\""))
        || body.contains(&format!("\"{model}:"))
        || body.contains(&format!("\"{model}/"))
}

fn check_api_health() -> bool {
    http_get_ok("http://127.0.0.1:8080/health")
}

#[tauri::command]
fn preflight_checks(app: AppHandle) -> Result<PreflightResult, DesktopError> {
    let stack_dir = ensure_stack_files(&app)?;
    let env_path = stack_dir.join(".env");
    let env_text = fs::read_to_string(&env_path).unwrap_or_default();
    let cloud_mode = has_cloud_key(&env_text);
    let model = ollama_model(&env_text);

    let docker_cli = run_cmd("docker", &["version"], None);
    let docker_daemon = run_cmd("docker", &["info"], None);
    let compose_v2 = run_cmd("docker", &["compose", "version"], None);
    let stack_writable = fs::metadata(&stack_dir)
        .map(|m| !m.permissions().readonly())
        .unwrap_or(false);
    let env_present = env_path.exists();
    let api_healthy = check_api_health();
    let ollama_running = if cloud_mode {
        false
    } else {
        http_get_ok("http://127.0.0.1:11434/api/tags")
    };
    let model_available = if cloud_mode {
        true
    } else if ollama_running {
        ollama_has_model(&model)
    } else {
        false
    };

    let mut checks = Vec::new();
    checks.push(PreflightCheck {
        id: "docker-cli".to_string(),
        label: "Docker CLI".to_string(),
        status: if docker_cli { "pass" } else { "fail" }.to_string(),
        detail: "docker version".to_string(),
        required: true,
        blocks_studio: true,
    });
    checks.push(PreflightCheck {
        id: "docker-daemon".to_string(),
        label: "Docker daemon".to_string(),
        status: if docker_daemon { "pass" } else { "fail" }.to_string(),
        detail: "docker info".to_string(),
        required: true,
        blocks_studio: true,
    });
    checks.push(PreflightCheck {
        id: "compose-v2".to_string(),
        label: "Compose v2".to_string(),
        status: if compose_v2 { "pass" } else { "fail" }.to_string(),
        detail: "docker compose version".to_string(),
        required: true,
        blocks_studio: true,
    });
    checks.push(PreflightCheck {
        id: "stack-data-dir".to_string(),
        label: "Stack data directory".to_string(),
        status: if stack_writable { "pass" } else { "fail" }.to_string(),
        detail: stack_dir.display().to_string(),
        required: true,
        blocks_studio: true,
    });
    checks.push(PreflightCheck {
        id: "env-present".to_string(),
        label: ".env present".to_string(),
        status: if env_present { "pass" } else { "fail" }.to_string(),
        detail: env_path.display().to_string(),
        required: true,
        blocks_studio: true,
    });
    checks.push(PreflightCheck {
        id: "api-container".to_string(),
        label: "API container".to_string(),
        status: if api_healthy { "pass" } else { "fail" }.to_string(),
        detail: "GET /health".to_string(),
        required: true,
        blocks_studio: true,
    });
    checks.push(PreflightCheck {
        id: "ollama-reachable".to_string(),
        label: "Ollama reachable".to_string(),
        status: if cloud_mode {
            "skip"
        } else if ollama_running {
            "pass"
        } else {
            "fail"
        }
        .to_string(),
        detail: if cloud_mode {
            "Cloud key set, local model checks skipped.".to_string()
        } else {
            "GET /api/tags".to_string()
        },
        required: true,
        blocks_studio: true,
    });
    checks.push(PreflightCheck {
        id: "model-available".to_string(),
        label: "Model available".to_string(),
        status: if cloud_mode {
            "skip"
        } else if model_available {
            "pass"
        } else if ollama_running {
            "warn"
        } else {
            "warn"
        }
        .to_string(),
        detail: if cloud_mode {
            "Cloud key set.".to_string()
        } else if model_available {
            format!("OLLAMA_MODEL={model} is available.")
        } else {
            format!("Run: ollama pull {model}")
        },
        required: true,
        blocks_studio: false,
    });

    let all_required_passed = checks
        .iter()
        .filter(|c| c.required && c.blocks_studio)
        .all(|c| c.status == "pass" || c.status == "skip");

    Ok(PreflightResult {
        checks,
        all_required_passed,
        api_healthy,
    })
}

fn script_for_platform(base: &Path, action: &str) -> (String, Vec<String>) {
    if cfg!(target_os = "windows") {
        (
            "powershell".to_string(),
            vec![
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
                "-File".to_string(),
                base.join(format!("bin/{action}.ps1")).display().to_string(),
            ],
        )
    } else {
        (
            "bash".to_string(),
            vec![base.join(format!("bin/{action}.sh")).display().to_string()],
        )
    }
}

fn run_stack_script(app: &AppHandle, action: &str) -> Result<(), DesktopError> {
    let stack_dir = ensure_stack_files(app)?;
    let (program, args) = script_for_platform(&stack_dir, action);
    let status = Command::new(program)
        .args(args)
        .current_dir(&stack_dir)
        .status()?;
    if !status.success() {
        return Err(DesktopError::Message(format!(
            "Failed to run stack script: {action}"
        )));
    }
    Ok(())
}

#[tauri::command]
fn start_stack(app: AppHandle) -> Result<(), DesktopError> {
    run_stack_script(&app, "start-stack")
}

#[tauri::command]
fn stop_stack(app: AppHandle) -> Result<(), DesktopError> {
    run_stack_script(&app, "stop-stack")
}

#[tauri::command]
fn open_logs_folder(app: AppHandle) -> Result<(), DesktopError> {
    let stack_dir = ensure_stack_files(&app)?;
    let logs_dir = stack_dir.join("logs");
    fs::create_dir_all(&logs_dir)?;
    if cfg!(target_os = "windows") {
        Command::new("explorer").arg(logs_dir).status()?;
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(logs_dir).status()?;
    } else {
        Command::new("xdg-open").arg(logs_dir).status()?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            preflight_checks,
            start_stack,
            stop_stack,
            open_logs_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
