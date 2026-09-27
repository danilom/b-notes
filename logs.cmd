@echo off
setlocal
cd /d "%~dp0"

rem Opens b-notes' log folder in VS Code, wherever the logs have been pointed.
rem The work is in scripts\open-logs.mts, which finds the folder the way the
rem app does.

node scripts\open-logs.mts

if errorlevel 1 (
    echo.
    pause
    exit /b 1
)
