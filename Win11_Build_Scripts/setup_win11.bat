@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title PX4 Flight Replay - Win11 Environment Setup

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

 echo ============================================================
 echo   PX4 Flight Replay - Windows 11 Environment Setup
 echo ============================================================
 echo.

:: ------------------------------------------------------------
:: 0. Require winget
:: ------------------------------------------------------------
where winget >nul 2>nul
if errorlevel 1 (
    echo [ERROR] winget not found.
    echo Please install/update "App Installer" from Microsoft Store first.
    pause
    exit /b 1
)

:: ------------------------------------------------------------
:: 1. Install system dependencies
:: ------------------------------------------------------------
echo [1/8] Installing Git...
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo [WARN] Git install may have failed or already exists.

echo.
echo [2/8] Installing Node.js 22 LTS...
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo [WARN] Node.js install may have failed or already exists.

echo.
echo [3/8] Installing Python 3.12 x64...
winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo [WARN] Python install may have failed or already exists.

echo.
echo [4/8] Installing Rustup...
winget install --id Rustlang.Rustup -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo [WARN] Rustup install may have failed or already exists.

echo.
echo [5/8] Installing Visual Studio 2022 Build Tools...
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --source winget ^
  --accept-package-agreements --accept-source-agreements ^
  --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
if errorlevel 1 echo [WARN] VS Build Tools install may have failed or already exists.

echo.
echo [6/8] Installing WebView2 Evergreen Runtime...
winget install --id Microsoft.EdgeWebView2Runtime -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo [WARN] WebView2 install may have failed or already exists.

:: Refresh common PATH locations for this process where possible
set "PATH=%ProgramFiles%\nodejs;%USERPROFILE%\.cargo\bin;%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%PATH%"

:: ------------------------------------------------------------
:: 2. Verify commands. Some installers require terminal restart.
:: ------------------------------------------------------------
echo.
echo [7/8] Verifying toolchain...
set "NEED_RESTART=0"

where git >nul 2>nul || set "NEED_RESTART=1"
where node >nul 2>nul || set "NEED_RESTART=1"
where npm >nul 2>nul || set "NEED_RESTART=1"
where rustup >nul 2>nul || set "NEED_RESTART=1"
where cargo >nul 2>nul || set "NEED_RESTART=1"
where py >nul 2>nul || set "NEED_RESTART=1"

if "%NEED_RESTART%"=="1" (
    echo.
    echo [NOTICE] One or more newly installed commands are not visible yet.
    echo Close this window, reopen Command Prompt/PowerShell, then run this BAT again.
    echo System packages have already been requested via winget.
    pause
    exit /b 2
)

echo.
git --version
node --version
call npm --version
py -3.12 --version
rustc --version
cargo --version

:: ------------------------------------------------------------
:: 3. Configure Rust MSVC target
:: ------------------------------------------------------------
echo.
echo Configuring Rust MSVC toolchain...
rustup default stable-x86_64-pc-windows-msvc
if errorlevel 1 goto :fail
rustup target add x86_64-pc-windows-msvc
if errorlevel 1 goto :fail
rustup show active-toolchain

:: ------------------------------------------------------------
:: 4. Project initialization (only when package.json exists)
:: ------------------------------------------------------------
echo.
echo [8/8] Initializing project dependencies...

if not exist "%PROJECT_DIR%package.json" (
    echo [INFO] package.json not found beside this BAT.
    echo Environment setup is complete, but project initialization was skipped.
    echo Put this BAT in the project root and run it again.
    goto :done
)

if not exist "%PROJECT_DIR%src-tauri\Cargo.toml" (
    echo [ERROR] src-tauri\Cargo.toml not found.
    echo This BAT must be placed in the project root.
    pause
    exit /b 1
)

if not exist "%PROJECT_DIR%tools\ulog_parser\requirements.txt" (
    echo [ERROR] tools\ulog_parser\requirements.txt not found.
    pause
    exit /b 1
)

echo Installing npm dependencies...
call npm ci
if errorlevel 1 goto :fail

set "VENV_PY=%PROJECT_DIR%.venv\Scripts\python.exe"
set "RECREATE_VENV=0"

if not exist "%VENV_PY%" (
    echo Python virtual environment not found.
    set "RECREATE_VENV=1"
) else (
    echo Checking existing Python virtual environment...
    "%VENV_PY%" -c "import sys; print(sys.executable)" >nul 2>&1
    if errorlevel 1 (
        echo [WARN] Existing .venv Python is broken.
        set "RECREATE_VENV=1"
    ) else (
        "%VENV_PY%" -m pip --version >nul 2>&1
        if errorlevel 1 (
            echo [WARN] Existing .venv pip is broken or incomplete.
            set "RECREATE_VENV=1"
        ) else (
            echo Existing Python virtual environment is healthy.
        )
    )
)

if "!RECREATE_VENV!"=="1" (
    if exist "%PROJECT_DIR%.venv" (
        echo Removing broken Python virtual environment...
        rmdir /s /q "%PROJECT_DIR%.venv"
        if exist "%PROJECT_DIR%.venv" (
            echo [ERROR] Failed to remove .venv. Close programs using it and try again.
            goto :fail
        )
    )

    echo Creating Python virtual environment...
    py -3.12 -m venv "%PROJECT_DIR%.venv"
    if errorlevel 1 goto :fail
)

echo Ensuring pip is installed correctly...
"%VENV_PY%" -m ensurepip --upgrade
if errorlevel 1 goto :fail

echo Upgrading pip...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 goto :fail

echo Verifying pip...
"%VENV_PY%" -m pip --version
if errorlevel 1 goto :fail

echo Installing ULog parser build requirements...
"%PROJECT_DIR%.venv\Scripts\python.exe" -m pip install -r "%PROJECT_DIR%tools\ulog_parser\requirements-build.txt"
if errorlevel 1 goto :fail

echo Checking pyulog...
"%PROJECT_DIR%.venv\Scripts\python.exe" -c "from pyulog import ULog; print('pyulog OK')"
if errorlevel 1 goto :fail

echo Building self-contained ULog parser sidecar...
"%PROJECT_DIR%.venv\Scripts\python.exe" "%PROJECT_DIR%tools\ulog_parser\build_sidecar.py"
if errorlevel 1 goto :fail

:done
echo.
echo ============================================================
echo   Environment setup completed.
echo ============================================================
echo Next:
echo   1. Run build_win11.bat to check and build installers.
echo   2. Run: npm run tauri dev   for development.
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo   [FAILED] Setup stopped because a command returned an error.
echo ============================================================
pause
exit /b 1
