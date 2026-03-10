@echo off
REM Ectropy - Sync, Rebase, Commit, and Push (Windows Wrapper)
REM Usage: sync-and-push.bat "commit message"

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo Error: Commit message required
    echo Usage: sync-and-push.bat "your commit message"
    exit /b 1
)

REM Check if Git Bash is available
where bash >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Git Bash not found in PATH
    echo Please install Git for Windows: https://git-scm.com/download/win
    exit /b 1
)

REM Run the bash script with Git Bash
bash sync-and-push.sh "%~1"

exit /b %ERRORLEVEL%
