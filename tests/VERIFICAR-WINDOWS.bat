@echo off
setlocal
cd /d "%~dp0.."
echo === Voice Cari QA Windows ===
python tests\static_checks.py || goto error
python tests\smoke_server.py || goto error
python tests\e2e_frontend.py || goto error
echo OK: comprobaciones terminadas.
pause
exit /b 0
:error
echo ERROR: comprueba Python y dependencias en tests\requirements-e2e.txt.
pause
exit /b 1
