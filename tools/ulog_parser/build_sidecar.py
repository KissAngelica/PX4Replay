#!/usr/bin/env python3
"""Freeze the ULog parser into the Tauri sidecar for the current platform."""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PARSER = Path(__file__).with_name("parse_ulog.py")
BINARIES = ROOT / "src-tauri" / "binaries"


def target_triple() -> tuple[str, str]:
    system = platform.system()
    machine = platform.machine().lower()
    if machine in {"amd64", "x86_64"}:
        architecture = "x86_64"
    elif machine in {"arm64", "aarch64"}:
        architecture = "aarch64"
    else:
        raise RuntimeError(f"不支持的处理器架构：{platform.machine()}")

    if system == "Windows" and architecture == "x86_64":
        return "x86_64-pc-windows-msvc", ".exe"
    if system == "Darwin":
        return f"{architecture}-apple-darwin", ""
    raise RuntimeError(f"当前只支持 Windows x64 和 macOS：{system} {architecture}")


def verify_sidecar(path: Path) -> None:
    missing = ROOT / "sidecar-verification-missing.ulg"
    result = subprocess.run(
        [str(path), str(missing)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    try:
        payload = json.loads(result.stderr.decode("utf-8"))
        code = payload["error"]["code"]
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise RuntimeError("sidecar 未返回有效的 UTF-8 JSON 错误") from error
    if result.returncode != 2 or code != "FILE_NOT_FOUND":
        raise RuntimeError(
            f"sidecar 自检失败：exit={result.returncode}, error={code}"
        )


def build() -> Path:
    triple, extension = target_triple()
    output = BINARIES / f"ulog-parser-{triple}{extension}"
    BINARIES.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="px4-replay-sidecar-") as temporary:
        temporary_path = Path(temporary)
        environment = os.environ.copy()
        # Keep PyInstaller's cache inside this isolated build. This avoids
        # depending on a writable ~/Library/Application Support directory on
        # macOS and keeps local/CI builds reproducible.
        environment["PYINSTALLER_CONFIG_DIR"] = str(temporary_path / "pyinstaller-config")
        subprocess.run(
            [
                sys.executable,
                "-m",
                "PyInstaller",
                "--clean",
                "--noconfirm",
                "--onefile",
                "--name",
                "ulog-parser",
                "--distpath",
                str(temporary_path / "dist"),
                "--workpath",
                str(temporary_path / "build"),
                "--specpath",
                str(temporary_path),
                str(PARSER),
            ],
            cwd=ROOT,
            env=environment,
            check=True,
        )
        frozen = temporary_path / "dist" / f"ulog-parser{extension}"
        shutil.copy2(frozen, output)

    if os.name != "nt":
        output.chmod(output.stat().st_mode | 0o111)
    verify_sidecar(output)
    print(output)
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
