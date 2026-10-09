@echo off
setlocal
if "%~1"=="" (echo Arrastra un WAV sobre este BAT para convertirlo a MP3. & exit /b 1)
where ffmpeg >nul 2>nul || (echo Falta FFmpeg en PATH. & exit /b 1)
ffmpeg -hide_banner -nostdin -i "%~1" -codec:a libmp3lame -qscale:a 2 "%~dpn1.mp3"
if errorlevel 1 exit /b 1
echo Conversion completada.
