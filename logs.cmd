@echo off
set "LOGS=%APPDATA%\brano-notes\logs"

if not exist "%LOGS%" (
    echo No logs yet. Run the app at least once, then try again.
    echo Looked in: %LOGS%
    pause
    exit /b 1
)

start "" "%LOGS%"
