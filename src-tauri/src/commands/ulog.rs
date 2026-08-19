use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
};

use serde_json::Value;
use tauri::Manager;

fn parser_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let development = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../tools/ulog_parser/parse_ulog.py");
    if development.is_file() {
        return Ok(development);
    }

    let bundled = app
        .path()
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录：{error}"))?
        .join("tools/ulog_parser/parse_ulog.py");
    if bundled.is_file() {
        return Ok(bundled);
    }

    Err("找不到 ULog 解析器脚本，请重新安装应用".to_string())
}

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

fn parse_ulog_blocking(
    app: tauri::AppHandle,
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

    let mut command = Command::new(python_executable());
    command.arg(parser_script(&app)?).arg(&input);
    if let Some(topic) = topic {
        if topic.trim().is_empty() {
            return Err("Topic 名称不能为空".to_string());
        }
        command.arg("--topic").arg(topic);
    }
    if let Some(field) = field {
        if field.trim().is_empty() {
            return Err("字段名称不能为空".to_string());
        }
        command.arg("--field").arg(field);
    }
    let output = command
        .output()
        .map_err(|error| format!("无法启动 Python ULog 解析器：{error}"))?;

    if !output.status.success() {
        return Err(parser_error(&output.stderr));
    }
    String::from_utf8(output.stdout).map_err(|_| "解析器返回了无效 UTF-8 数据".to_string())
}

#[tauri::command]
pub async fn parse_ulog(app: tauri::AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || parse_ulog_blocking(app, path, None, None))
        .await
        .map_err(|error| format!("ULog 解析任务异常终止：{error}"))?
}

#[tauri::command]
pub async fn parse_ulog_topic(
    app: tauri::AppHandle,
    path: String,
    topic: String,
    field: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        parse_ulog_blocking(app, path, Some(topic), Some(field))
    })
        .await
        .map_err(|error| format!("ULog Topic 解析任务异常终止：{error}"))?
}
