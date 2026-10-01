@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo Electron no esta instalado en esta carpeta.
  echo Ejecuta primero: npm install
  echo.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
endlocal
