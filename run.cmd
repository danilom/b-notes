@echo off
cd /d "%~dp0"

echo Building and starting b-notes...
call npm start

if errorlevel 1 (
    echo.
    echo Failed. The error is above; the app's own log is in %APPDATA%\b-notes\logs
    pause
)
