@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

title PX4 Flight Replay - Win11 One Click

echo ============================================================
echo   PX4 Flight Replay - Win11 ONE CLICK
 echo ============================================================
echo.
echo This will:
echo   1. Install/check Windows development dependencies
echo   2. Create .venv and install pyulog
echo   3. Run typecheck/lint/tests/cargo check
echo   4. Build NSIS .exe and WiX .msi
echo.

call "%~dp0setup_win11.bat"
if errorlevel 2 (
    echo.
    echo [ACTION REQUIRED] Windows PATH needs a refresh after installation.
    echo Reboot/re-login or reopen a terminal, then double-click this file again.
    pause
    exit /b 2
)
if errorlevel 1 (
    echo [ERROR] Environment setup failed.
    pause
    exit /b 1
)

call "%~dp0build_win11.bat" all
exit /b %errorlevel%
