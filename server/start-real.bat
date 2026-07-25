@echo off
setlocal
cd /d "%~dp0"
if /I not "%COQUI_TOS_AGREED%"=="1" (
  echo.
  echo Debes leer y aceptar la licencia del modelo antes de iniciar el motor real.
  echo En PowerShell:  $env:COQUI_TOS_AGREED = "1"
  echo.
  pause
  exit /b 1
)
python xtts_server.py
if errorlevel 1 pause
