# Voice Cari v3.3.2 — Authorized Voice Studio

Voice Cari es un estudio de voz sintética autorizada del ecosistema **Universo 404**. Incluye:

- Frontend web/PWA sin claves públicas.
- Narración con las voces instaladas en el navegador.
- Grabación e importación de muestras propias o autorizadas.
- Banco local en IndexedDB con análisis, recorte, normalización, copia ZIP y consentimiento.
- Integración opcional con un servidor local XTTS-v2 incluido en `server/`.

Los textos, perfiles, proyectos y muestras se guardan en el navegador. Al clonar, el frontend envía el texto y la referencia únicamente al motor local configurado por el usuario.

## Qué funciona en GitHub Pages

GitHub Pages aloja solo el frontend; no ejecuta Python ni XTTS:

- Studio, narración del navegador, grabador, perfiles, proyectos, banco de voz y exportaciones funcionan como web estática.
- **Clonar** requiere ejecutar `server/xtts_server.py` en el ordenador del usuario.
- El uso más fiable es abrir la interfaz que sirve el propio motor: `http://127.0.0.1:8020`.
- En navegadores recientes, una página pública puede pedir permiso antes de acceder al motor de la red local.
- No abras `index.html` mediante `file://` para usar el motor.

## Inicio rápido en modo demo

El modo demo valida la tubería completa y genera un tono. **No clona una voz.**

### Windows PowerShell

```powershell
cd voice-cari-v3_3_2\server
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-base.txt
$env:VOICE_CARI_DEMO = "1"
python xtts_server.py
```

También puedes ejecutar `server/start-demo.bat` después de instalar las dependencias. Abre `http://127.0.0.1:8020`.

### Linux/macOS

```bash
cd voice-cari-v3_3_2/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-base.txt
VOICE_CARI_DEMO=1 python xtts_server.py
```

## Motor real XTTS-v2

1. Lee la licencia aplicable a XTTS-v2 y confirma que tu uso está permitido.
2. Instala `server/requirements.txt` en un entorno virtual compatible.
3. Declara la aceptación de la licencia.
4. Inicia el servidor.

```powershell
$env:COQUI_TOS_AGREED = "1"
python xtts_server.py
```

```bash
export COQUI_TOS_AGREED=1
python xtts_server.py
```

La primera ejecución puede descargar un modelo grande. La compatibilidad de Coqui TTS, PyTorch, CUDA y el modelo depende del sistema y no queda demostrada por el modo demo.

## Flujo recomendado

1. Acepta el protocolo de uso responsable.
2. Graba o importa una muestra limpia de entre 3 segundos y 5 minutos; para calidad real se recomiendan 15–30 segundos o más.
3. Revisa el análisis y confirma que tienes autorización.
4. Guarda la muestra y escribe el texto en **Studio**.
5. En **Clonar**, prueba el motor, selecciona la muestra y genera.
6. Identifica el resultado como sintético cuando pueda confundirse con una grabación real.

## Seguridad y privacidad

- El servidor solo escucha en loopback por defecto y rechaza una dirección remota salvo habilitación explícita.
- Los orígenes web no autorizados reciben `403` antes de ejecutar trabajo pesado.
- Solo se publican `index.html`, CSS, JavaScript, manifest, service worker e iconos; el código Python, tests y documentación no se sirven por HTTP.
- Los WAV se validan como PCM16 real, con límites de tamaño, duración y señal útil.
- Los ZIP se limitan, verifican CRC y rechazan rutas, cifrado, compresión y entradas incoherentes.
- Los temporales del motor se eliminan al terminar cada petición.
- El reset no informa de éxito hasta que IndexedDB se haya eliminado realmente.
- Un banco importado exige una confirmación nueva de autorización.
- No subas modelos, entornos virtuales, voces, secretos ni archivos `.env` al repositorio.

El origen público predeterminado es `https://ivan7800.github.io`. Para otro frontend:

```powershell
$env:VOICE_CARI_ALLOWED_ORIGINS = "https://ejemplo.com,https://otro.example"
```

Para cambiar el origen principal:

```powershell
$env:VOICE_CARI_PUBLIC_ORIGIN = "https://tu-cuenta.github.io"
```

El servidor rechaza `0.0.0.0` y otras interfaces no locales. Exponerlo remotamente requiere `VOICE_CARI_ALLOW_REMOTE=1` y medidas externas de autenticación, TLS, firewall y limitación de abuso; no es el modo recomendado.

## Publicación en GitHub Pages

1. Sube el contenido de esta carpeta a la raíz del repositorio.
2. Abre **Settings → Pages → Deploy from a branch**.
3. Selecciona `main` y `/ (root)`.
4. Ajusta `canonical`, `og:url` y `og:image` de `index.html` si cambia la URL.
5. No publiques `server/.venv`, modelos ni muestras.

## Pruebas

```bash
python tests/static_checks.py
python tests/smoke_server.py
node --check app.js
python -m py_compile server/xtts_server.py tests/*.py
python -m json.tool manifest.json
```

E2E opcional:

```bash
pip install -r tests/requirements-e2e.txt
python -m playwright install chromium
python tests/e2e_frontend.py
```

## Limitaciones conocidas

- El modo demo no demuestra similitud vocal ni calidad XTTS.
- La clonación real requiere una instalación compatible de Coqui TTS, PyTorch y el modelo.
- La cancelación del navegador deja de esperar la respuesta, pero una inferencia ya iniciada puede tardar en liberar CPU/GPU.
- No se proporcionan MOS, PESQ, STOI ni similitud de hablante sin mediciones reales.
- El repositorio incluye un aviso de licencias, pero el autor debe escoger una licencia explícita para el código antes de distribuirlo como software abierto.

Consulta `AUDIT_REPORT.md`, `CHANGELOG.md` y `LICENSE_NOTICE.md`.
