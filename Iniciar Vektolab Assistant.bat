@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Vektolab Assistant necesita Node.js para esta version de desarrollo.
  echo Para usuarios finales se recomienda instalar el Setup de Windows.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Instalando componentes de Vektolab por primera vez...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar los componentes.
    pause
    exit /b 1
  )
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
endlocal
