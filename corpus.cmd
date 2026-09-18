@echo off
setlocal
cd /d "%~dp0"

rem Rebuilds the test corpus under testdata\corpus from the metadata in
rem testdata\metadata. Neither folder is in the repository.

node scripts\make-corpus.mjs %*

if errorlevel 1 (
    echo.
    echo Could not build the corpus.
    pause
    exit /b 1
)

echo.
echo Done. The corpus is in testdata\corpus
pause
