@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title PX4 Flight Replay - Win11 Build

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: Build modes:
::   build_win11.bat           -> checks + sidecar + NSIS + MSI
::   build_win11.bat nsis      -> checks + sidecar + NSIS only
::   build_win11.bat msi       -> checks + sidecar + MSI only
::   build_win11.bat check     -> checks only
::   build_win11.bat dev       -> checks then tauri dev
::   build_win11.bat sidecar   -> build PyInstaller sidecar then NSIS+MSI

set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

 echo ============================================================
 echo   PX4 Flight Replay - Windows 11 Build
 echo   Mode: %MODE%
 echo ============================================================
 echo.

:: ------------------------------------------------------------
:: 0. Validate project layout
:: ------------------------------------------------------------
if not exist "package.json" (
    echo [ERROR] package.json not found.
    echo Put this BAT in the project root.
    goto :fail
)
if not exist "src-tauri\Cargo.toml" (
    echo [ERROR] src-tauri\Cargo.toml not found.
    goto :fail
)
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] .venv not found.
    echo Run setup_win11.bat first.
    goto :fail
)

:: ------------------------------------------------------------
:: 1. Tool availability
:: ------------------------------------------------------------
for %%T in (node npm cargo rustc) do (
    where %%T >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] %%T not found in PATH.
        echo Run setup_win11.bat or reopen the terminal.
        goto :fail
    )
)

:: ------------------------------------------------------------
:: 2. Ensure JS dependencies
:: ------------------------------------------------------------
if not exist "node_modules" (
    echo [INFO] node_modules not found, running npm ci...
    call npm ci
    if errorlevel 1 goto :fail
)

:: ------------------------------------------------------------
:: 3. Quality gates
:: ------------------------------------------------------------
echo [1/6] TypeScript check...
call npm run typecheck
if errorlevel 1 goto :fail

echo.
echo [2/6] Lint...
call npm run lint
if errorlevel 1 goto :fail

echo.
echo [3/6] Frontend tests...
call npm test
if errorlevel 1 goto :fail

echo.
echo [4/6] Python ULog parser tests...
set "PYTHONPATH=tools\ulog_parser"
".venv\Scripts\python.exe" -m unittest discover -s tools\ulog_parser\tests -v
if errorlevel 1 (
    set "PYTHONPATH="
    goto :fail
)
set "PYTHONPATH="

echo.
echo [SIDECAR] Installing/updating parser build dependencies...
".venv\Scripts\python.exe" -m pip install -r .\tools\ulog_parser\requirements-build.txt
if errorlevel 1 goto :fail

echo Building and verifying self-contained ulog-parser.exe...
".venv\Scripts\python.exe" .\tools\ulog_parser\build_sidecar.py
if errorlevel 1 goto :fail

echo.
echo [5/6] Rust cargo check...
cargo check --manifest-path .\src-tauri\Cargo.toml
if errorlevel 1 goto :fail

if /I "%MODE%"=="check" goto :success

if /I "%MODE%"=="dev" (
    echo.
    echo [6/6] Starting Tauri development mode...
    set "PX4_REPLAY_PYTHON=%PROJECT_DIR%.venv\Scripts\python.exe"
    call npm run tauri dev
    if errorlevel 1 goto :fail
    goto :success
)

:: ------------------------------------------------------------
:: 5. Build installers
:: ------------------------------------------------------------
echo.
echo [6/6] Building Windows package(s)...

if /I "%MODE%"=="nsis" (
    call npm run tauri -- build --bundles nsis
) else if /I "%MODE%"=="msi" (
    call npm run tauri -- build --bundles msi
) else (
    call npm run tauri -- build --bundles nsis,msi
)
if errorlevel 1 goto :fail

:: ------------------------------------------------------------
:: 6. Show outputs + SHA256
:: ------------------------------------------------------------
echo.
echo Build outputs:
if exist "src-tauri\target\release\bundle\nsis" dir /b "src-tauri\target\release\bundle\nsis\*.exe" 2>nul
if exist "src-tauri\target\release\bundle\msi"  dir /b "src-tauri\target\release\bundle\msi\*.msi" 2>nul

echo.
echo SHA-256:
for %%F in ("src-tauri\target\release\bundle\nsis\*.exe") do (
    if exist "%%~fF" certutil -hashfile "%%~fF" SHA256
)
for %%F in ("src-tauri\target\release\bundle\msi\*.msi") do (
    if exist "%%~fF" certutil -hashfile "%%~fF" SHA256
)

goto :success

:success
echo.
echo ============================================================
echo   BUILD SUCCESS
 echo ============================================================
echo.
echo NSIS: src-tauri\target\release\bundle\nsis\
echo MSI : src-tauri\target\release\bundle\msi\
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo   BUILD FAILED
 echo ============================================================
echo Check the first error above and fix it before rebuilding.
echo.
pause
exit /b 1
