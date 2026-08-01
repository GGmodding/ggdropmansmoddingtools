@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org/ then re-run.
  pause
  exit /b 1
)

if not exist "node_modules\steamworks.js" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if "%~1"=="" (
  node unlock.js --list
) else (
  node unlock.js %*
)

echo.
pause
