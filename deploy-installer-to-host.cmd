@echo off
setlocal
cd /d "%~dp0"

rem Builds the installer and copies it to Z:\b-notes, for trying it on another
rem machine. Publishes nothing: npm run dist only writes into release\, and
rem nothing installed this way is offered to anyone as an update.

set "TARGET=Z:\b-notes"

if not exist "%TARGET%\" (
    echo %TARGET% is not there. Connect the Z: drive and try again.
    pause
    exit /b 1
)

rem The version decides the installer's name; see artifactName in electron-builder.yml.
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set "VERSION=%%v"
if not defined VERSION (
    echo Could not read the version from package.json.
    pause
    exit /b 1
)

set "INSTALLER=b-notes-setup-%VERSION%.exe"

echo Building b-notes %VERSION% and its installer...
call npm run dist
if errorlevel 1 (
    echo.
    echo The build failed. The error is above.
    pause
    exit /b 1
)

if not exist "release\%INSTALLER%" (
    echo.
    echo The build finished but release\%INSTALLER% is not there.
    pause
    exit /b 1
)

copy /y "release\%INSTALLER%" "%TARGET%\%INSTALLER%" >nul
if errorlevel 1 (
    echo.
    echo Could not copy %INSTALLER% to %TARGET%.
    pause
    exit /b 1
)

echo.
echo Done: %TARGET%\%INSTALLER%
pause
