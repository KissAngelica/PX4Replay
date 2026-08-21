use std::path::PathBuf;

#[cfg(debug_assertions)]
use std::{env, path::Path, process::Command};

use serde_json::Value;
use tauri_plugin_shell::ShellExt;

#[cfg(all(target_os = "windows", debug_assertions))]
use std::os::windows::process::CommandExt;

#[cfg(all(target_os = "windows", debug_assertions))]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(debug_assertions)]
fn python_executable() -> PathBuf {
    if let Ok(configured) = env::var("PX4_REPLAY_PYTHON") {
        if !configured.trim().is_empty() {
            return PathBuf::from(configured);
        }
    }

    #[cfg(target_os = "windows")]
    let local = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.venv/Scripts/python.exe");
    #[cfg(not(target_os = "windows"))]
    let local = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.venv/bin/python");
    if local.is_file() {
        return local;
    }

    #[cfg(target_os = "windows")]
    return PathBuf::from("python");
    #[cfg(not(target_os = "windows"))]
    return PathBuf::from("python3");
}

fn parser_error(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr).trim().to_string();
    serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|value| value.pointer("/error/message")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| {
            if text.is_empty() {
                "ULog 解析器未返回错误详情".to_string()
            } else {
                text
            }
        })
}

fn parser_result(success: bool, stdout: &[u8], stderr: &[u8]) -> Result<String, String> {
    if !success {
        return Err(parser_error(stderr));
    }
    String::from_utf8(stdout.to_vec()).map_err(|_| "解析器返回了无效 UTF-8 数据".to_string())
}

#[cfg(debug_assertions)]
fn run_development_parser(arguments: Vec<String>) -> Result<String, String> {
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../tools/ulog_parser/parse_ulog.py");
    let mut command = Command::new(python_executable());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .arg(script)
        .args(arguments)
        .output()
        .map_err(|error| format!("无法启动开发环境 Python ULog 解析器：{error}"))?;
    parser_result(output.status.success(), &output.stdout, &output.stderr)
}

async fn execute_parser(
    app: &tauri::AppHandle,
    arguments: Vec<String>,
) -> Result<String, String> {
    #[cfg(debug_assertions)]
    {
        let script = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tools/ulog_parser/parse_ulog.py");
        if script.is_file() {
            let development_arguments = arguments.clone();
            return tauri::async_runtime::spawn_blocking(move || {
                run_development_parser(development_arguments)
            })
            .await
            .map_err(|error| format!("ULog 解析任务异常终止：{error}"))?;
        }
    }

    let output = app
        .shell()
        .sidecar("ulog-parser")
        .map_err(|error| format!("无法定位内置 ULog 解析器：{error}"))?
        .args(arguments)
        .output()
        .await
        .map_err(|error| format!("无法启动内置 ULog 解析器：{error}"))?;
    parser_result(output.status.success(), &output.stdout, &output.stderr)
}

async fn parse_ulog_impl(
    app: &tauri::AppHandle,
    path: String,
    topic: Option<String>,
    field: Option<String>,
) -> Result<String, String> {
    let input = PathBuf::from(&path);
    if !input.exists() {
        return Err(format!("文件不存在：{path}"));
    }
    if !input.is_file() {
        return Err(format!("不是可读取文件：{path}"));
    }
    if input
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase)
        != Some("ulg".to_string())
    {
        return Err("请选择 .ulg 文件".to_string());
    }

    let mut arguments = vec![input.to_string_lossy().into_owned()];
    if let Some(topic) = topic {
        if topic.trim().is_empty() {
            return Err("Topic 名称不能为空".to_string());
        }
        arguments.push("--topic".to_string());
        arguments.push(topic);
    }
    if let Some(field) = field {
        if field.trim().is_empty() {
            return Err("字段名称不能为空".to_string());
        }
        arguments.push("--field".to_string());
        arguments.push(field);
    }
    execute_parser(app, arguments).await
}

#[tauri::command]
pub async fn parse_ulog(app: tauri::AppHandle, path: String) -> Result<String, String> {
    parse_ulog_impl(&app, path, None, None).await
}

#[tauri::command]
pub async fn parse_ulog_topic(
    app: tauri::AppHandle,
    path: String,
    topic: String,
    field: String,
) -> Result<String, String> {
    parse_ulog_impl(&app, path, Some(topic), Some(field)).await
}
