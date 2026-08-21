#!/bin/zsh

set -Eeuo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
VENV_DIR="${PROJECT_DIR}/.venv"
PYTHON_BIN="${VENV_DIR}/bin/python"
BUILD_MODE="${1:-all}"

on_error() {
  local exit_code=$?
  echo
  echo "============================================================"
  echo "  构建失败（退出码：${exit_code}）"
  echo "  请检查上方最先出现的错误。"
  echo "============================================================"
  if [[ -t 0 ]]; then
    read -r "?按回车键关闭窗口..."
  fi
  exit "${exit_code}"
}
trap on_error ERR

cd "${PROJECT_DIR}"

echo "============================================================"
echo "  PX4 Flight Replay - macOS 一键构建"
echo "  架构：$(uname -m)    模式：${BUILD_MODE}"
echo "============================================================"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[错误] 此脚本只能在 macOS 上运行。"
  false
fi

for tool in node npm cargo rustc python3 xcode-select; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "[错误] 未找到 ${tool}，请先安装 macOS 构建依赖。"
    false
  fi
done

if ! xcode-select -p >/dev/null 2>&1; then
  echo "[错误] 未安装 Xcode Command Line Tools。"
  echo "请先运行：xcode-select --install"
  false
fi

if [[ ! -f package.json || ! -f src-tauri/Cargo.toml ]]; then
  echo "[错误] 无法定位工程根目录：${PROJECT_DIR}"
  false
fi

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "[准备] 创建 Python 虚拟环境..."
  python3 -m venv "${VENV_DIR}"
fi

echo "[1/9] 安装或更新 Python 构建依赖..."
"${PYTHON_BIN}" -m pip install -r tools/ulog_parser/requirements-build.txt

if [[ ! -d node_modules ]]; then
  echo "[2/9] 安装前端依赖..."
  npm ci
else
  echo "[2/9] 前端依赖已存在，跳过 npm ci。"
fi

echo "[3/9] TypeScript 检查..."
npm run typecheck

echo "[4/9] ESLint 检查..."
npm run lint

echo "[5/9] 前端测试..."
npm test

echo "[6/9] Python ULog 解析器测试..."
PYTHONPATH=tools/ulog_parser "${PYTHON_BIN}" -m unittest discover \
  -s tools/ulog_parser/tests -v

echo "[7/9] 构建并自检 ULog 解析器 sidecar..."
"${PYTHON_BIN}" tools/ulog_parser/build_sidecar.py

echo "[8/9] Rust 检查..."
cargo check --manifest-path src-tauri/Cargo.toml

if [[ "${BUILD_MODE}" == "check" ]]; then
  echo "[9/9] 仅检查模式，不生成安装包。"
elif [[ "${BUILD_MODE}" == "app" ]]; then
  echo "[9/9] 构建 macOS .app..."
  npm run tauri -- build --bundles app
elif [[ "${BUILD_MODE}" == "dmg" ]]; then
  echo "[9/9] 构建 macOS DMG..."
  npm run tauri -- build --bundles dmg
elif [[ "${BUILD_MODE}" == "all" ]]; then
  echo "[9/9] 构建 macOS .app 和 DMG..."
  npm run tauri -- build --bundles app,dmg
else
  echo "[错误] 未知模式：${BUILD_MODE}"
  echo "可用模式：all（默认）、app、dmg、check"
  false
fi

echo
echo "============================================================"
echo "  构建成功"
echo "============================================================"
echo "APP：src-tauri/target/release/bundle/macos/"
echo "DMG：src-tauri/target/release/bundle/dmg/"
echo

if [[ "${BUILD_MODE}" != "check" ]] && command -v shasum >/dev/null 2>&1; then
  setopt local_options null_glob
  artifacts=(
    src-tauri/target/release/bundle/macos/*.app/Contents/MacOS/*
    src-tauri/target/release/bundle/dmg/*.dmg
  )
  if (( ${#artifacts[@]} > 0 )); then
    echo "SHA-256："
    shasum -a 256 "${artifacts[@]}"
  fi
fi

if [[ -t 0 ]]; then
  read -r "?按回车键关闭窗口..."
fi
