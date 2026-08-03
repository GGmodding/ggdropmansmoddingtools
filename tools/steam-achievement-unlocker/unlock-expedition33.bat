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

echo Clair Obscur: Expedition 33 ^(AppID 1903340^)
echo Close the game first. Steam must be running.
echo.

if "%~1"=="" (
  echo Usage tips:
  echo   unlock-expedition33.bat              - list achievements
  echo   unlock-expedition33.bat --unlock-all - unlock all
  echo   unlock-expedition33.bat --lock-all   - clear all
  echo.
  node unlock.js --app expedition33 --list
) else (
  node unlock.js --app expedition33 %*
)

echo.
pause
