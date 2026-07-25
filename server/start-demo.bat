@echo off
setlocal
cd /d "%~dp0"
set "VOICE_CARI_DEMO=1"
python xtts_server.py
if errorlevel 1 pause
