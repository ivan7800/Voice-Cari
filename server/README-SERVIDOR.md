# Motor local de clonación — Voice Cari v3.3.1

El servidor FastAPI ejecuta la clonación en el ordenador del usuario y sirve también el frontend desde la carpeta padre.

## Requisitos recomendados

- Windows 10/11, macOS o Linux.
- Python 3.10 o 3.11 para el motor real.
- Espacio suficiente para PyTorch y el modelo.
- 8 GB de RAM como referencia mínima práctica.
- GPU NVIDIA opcional.

## Instalación en Windows

```powershell
cd voice-cari-v3\server
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-base.txt
```

## Modo demo

No descarga el modelo y no clona. Sirve para verificar interfaz, validación, subida y descarga.

```powershell
$env:VOICE_CARI_DEMO = "1"
python xtts_server.py
```

O ejecuta `start-demo.bat`.

Abre `http://127.0.0.1:8020`.

## Motor real

Lee primero la licencia del modelo y comprueba que tu uso está permitido. El servidor ya no acepta la licencia automáticamente.

```powershell
pip install -r requirements.txt
$env:COQUI_TOS_AGREED = "1"
python xtts_server.py
```

O ejecuta `start-real.bat` después de definir `COQUI_TOS_AGREED=1`.

## Variables de entorno

| Variable | Predeterminado | Uso |
|---|---:|---|
| `VOICE_CARI_DEMO` | vacío | `1` activa el tono de prueba. |
| `VOICE_CARI_HOST` | `127.0.0.1` | Dirección de escucha. No uses `0.0.0.0` sin protección adicional. |
| `VOICE_CARI_PORT` | `8020` | Puerto local. |
| `VOICE_CARI_PUBLIC_ORIGIN` | `https://ivan7800.github.io` | Frontend público autorizado. |
| `VOICE_CARI_ALLOWED_ORIGINS` | vacío | Orígenes extra separados por comas. |
| `COQUI_TOS_AGREED` | vacío | Debe ser `1` para cargar el modelo real. |

## Endpoints

- `GET /health`: estado, versión, modo y límites.
- `POST /clone`: `multipart/form-data` con `text`, `language` y `reference`.

La referencia debe ser WAV PCM16, mono o estéreo, entre 3 segundos y 5 minutos, y menor de 60 MB.

## Seguridad

- Orígenes no autorizados se bloquean con `403`, no solo mediante CORS.
- Se limita la lectura de la subida antes de cargarla completa en memoria.
- Se valida la estructura WAV con la biblioteca estándar.
- La síntesis bloqueante se ejecuta en un thread para mantener `/health` disponible.
- Los errores detallados quedan en la consola local, no en la respuesta HTTP.
- Los temporales se crean en una carpeta aislada y se eliminan automáticamente.

## Diagnóstico

```powershell
curl http://127.0.0.1:8020/health
```

Prueba completa automatizada:

```powershell
python ..\tests\smoke_server.py
```
