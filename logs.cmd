@echo off
setlocal
set "LOGS=%APPDATA%\brano-notes\logs"

if not exist "%LOGS%" (
    echo No logs yet. Run the app at least once, then try again.
    echo Looked in: %LOGS%
    pause
    exit /b 1
)

rem Resolve the full path. Calling "code" by bare name makes its own launcher
rem resolve %~dp0 against the current directory and look for Code.exe here.
set "CODE="
for /f "delims=" %%I in ('where code 2^>nul') do if not defined CODE set "CODE=%%I"

rem A shell opened before VS Code was installed won't have it on PATH yet.
if not defined CODE set "CODE=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"

if not exist "%CODE%" (
    echo Could not find VS Code. The logs are in: %LOGS%
    pause
    exit /b 1
)

call "%CODE%" "%LOGS%"

if errorlevel 1 (
    echo.
    echo Could not open VS Code. The logs are in: %LOGS%
    pause
)
