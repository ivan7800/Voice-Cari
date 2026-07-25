# Motor local Voice Cari 3.3.2

Servidor FastAPI opcional para el frontend Voice Cari. En modo demo genera un tono; en modo real integra XTTS-v2.

## Demo

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements-base.txt
VOICE_CARI_DEMO=1 python xtts_server.py
```

En PowerShell:

```powershell
$env:VOICE_CARI_DEMO = "1"
python xtts_server.py
```

Abre `http://127.0.0.1:8020`.

## Motor real

```bash
pip install -r requirements.txt
export COQUI_TOS_AGREED=1
python xtts_server.py
```

La primera ejecución puede descargar el modelo. Verifica previamente la licencia y la compatibilidad de Python, PyTorch y Coqui TTS.

## Variables

- `VOICE_CARI_DEMO=1`: modo de prueba sin XTTS.
- `VOICE_CARI_PORT=8020`: puerto local.
- `VOICE_CARI_HOST=127.0.0.1`: interfaz; solo loopback por defecto.
- `VOICE_CARI_PUBLIC_ORIGIN=https://ivan7800.github.io`: origen público autorizado.
- `VOICE_CARI_ALLOWED_ORIGINS=...`: orígenes adicionales separados por comas.
- `COQUI_TOS_AGREED=1`: aceptación explícita requerida para cargar XTTS.
- `VOICE_CARI_ALLOW_REMOTE=1`: permite una interfaz no local; requiere protección externa y no se recomienda.

## Superficie publicada

El servidor solo sirve los recursos públicos del frontend y `/assets`. No publica `server/`, `tests/`, documentación ni archivos ocultos.

## Prueba

Desde la raíz del proyecto:

```bash
python tests/smoke_server.py
```
