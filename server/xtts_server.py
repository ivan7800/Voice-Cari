"""
Voice Cari — Motor local de clonación de voz (XTTS-v2)
═══════════════════════════════════════════════════════
100 % local: la muestra de voz y el audio generado nunca salen de tu máquina.

Uso:
    python xtts_server.py
    VOICE_CARI_DEMO=1 python xtts_server.py

Endpoints:
    GET  /health
    POST /clone   multipart: text, language, reference (WAV PCM16)

Si la carpeta padre contiene index.html, el servidor también sirve la app.
"""
from __future__ import annotations

import io
import logging
import math
import os
import re
import struct
import tempfile
import threading
import wave
from array import array
import sys
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

APP_VERSION = "1.1.0"
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
DEMO = os.environ.get("VOICE_CARI_DEMO", "") == "1"
HOST = os.environ.get("VOICE_CARI_HOST", "127.0.0.1")
PORT = int(os.environ.get("VOICE_CARI_PORT", "8020"))
MAX_TEXT = 2000
MAX_REF_BYTES = 60 * 1024 * 1024
MIN_REF_SECONDS = 3.0
MAX_REF_SECONDS = 300.0
LANGUAGES = {"es", "en", "fr", "de", "it", "pt", "pl", "nl", "cs", "ru", "tr", "hu", "ko", "ja", "ar", "zh-cn"}

logger = logging.getLogger("voice_cari")

# Orígenes permitidos. La ruta del repositorio no forma parte del Origin.
_default_public_origin = os.environ.get("VOICE_CARI_PUBLIC_ORIGIN", "https://ivan7800.github.io").strip()
_extra_origins = {
    item.strip().rstrip("/")
    for item in os.environ.get("VOICE_CARI_ALLOWED_ORIGINS", "").split(",")
    if item.strip()
}
TRUSTED_ORIGINS = ({_default_public_origin.rstrip("/")} if _default_public_origin else set()) | _extra_origins
LOCAL_ORIGIN_RE = re.compile(r"^http://(?:localhost|127\.0\.0\.1)(?::\d+)?$", re.IGNORECASE)


def _origin_allowed(origin: str | None) -> bool:
    """Permite llamadas sin Origin (curl/app local) y orígenes explícitos/loopback."""
    if not origin:
        return True
    candidate = origin.strip().rstrip("/")
    if candidate in TRUSTED_ORIGINS or LOCAL_ORIGIN_RE.fullmatch(candidate):
        return True
    try:
        parsed = urlsplit(candidate)
    except ValueError:
        return False
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}


app = FastAPI(title="Voice Cari — Motor local XTTS", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(TRUSTED_ORIGINS),
    allow_origin_regex=r"^http://(?:localhost|127\.0\.0\.1)(?::\d+)?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
    allow_credentials=False,
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # CORS evita leer la respuesta, pero no evita que una web maliciosa fuerce
    # una generación. Este control de Origin bloquea también el trabajo pesado.
    origin = request.headers.get("origin")
    if not _origin_allowed(origin):
        return JSONResponse(status_code=403, content={"detail": "Origen no autorizado."})

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.url.path in {"/health", "/clone"}:
        response.headers.setdefault("Cache-Control", "no-store")
    return response


_tts = None
_device = "cpu"
_lock = threading.Lock()  # una generación cada vez: evita agotar RAM/VRAM


def _load_tts():
    """Carga perezosa del modelo; requiere aceptación explícita de su licencia."""
    global _tts, _device
    if _tts is None:
        if os.environ.get("COQUI_TOS_AGREED", "").lower() not in {"1", "true", "yes"}:
            raise RuntimeError(
                "Lee y acepta la licencia del modelo y define COQUI_TOS_AGREED=1 antes de usar el motor real."
            )
        import torch
        from TTS.api import TTS

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        _tts = TTS(MODEL_NAME).to(_device)
    return _tts


def _demo_wav(text: str) -> bytes:
    """Modo demo: genera un beep modulado; no clona ninguna voz."""
    rate = 24000
    seconds = min(4.0, 0.6 + len(text) * 0.02)
    n = int(rate * seconds)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        frames = bytearray()
        for i in range(n):
            t = i / rate
            env = min(1.0, t * 8) * min(1.0, (seconds - t) * 8)
            sample = 0.28 * env * math.sin(2 * math.pi * (220 + 40 * math.sin(2 * math.pi * 1.5 * t)) * t)
            frames += struct.pack("<h", int(sample * 32767))
        output.writeframes(bytes(frames))
    return buf.getvalue()


def _validate_wav(data: bytes) -> dict[str, float | int]:
    """Valida estructura y límites del WAV antes de entregarlo al modelo."""
    if len(data) < 44 or not data.startswith(b"RIFF") or data[8:12] != b"WAVE":
        raise HTTPException(415, "La referencia debe ser un WAV PCM válido.")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            channels = audio.getnchannels()
            sample_width = audio.getsampwidth()
            rate = audio.getframerate()
            frames = audio.getnframes()
            compression = audio.getcomptype()
            frame_bytes = audio.readframes(frames)
    except (wave.Error, EOFError) as exc:
        raise HTTPException(415, "La referencia WAV está dañada o no es compatible.") from exc

    if compression != "NONE" or sample_width != 2:
        raise HTTPException(415, "La referencia debe ser WAV PCM de 16 bits.")
    expected_bytes = frames * channels * sample_width
    if len(frame_bytes) != expected_bytes:
        raise HTTPException(415, "La referencia WAV está truncada o declara datos inexistentes.")
    samples = array("h")
    samples.frombytes(frame_bytes)
    if sys.byteorder == "big":
        samples.byteswap()
    peak = max((abs(sample) for sample in samples), default=0)
    if peak < 100:
        raise HTTPException(422, "La muestra no contiene una señal de voz útil.")
    if channels not in {1, 2}:
        raise HTTPException(415, "La referencia debe ser mono o estéreo.")
    if not 8000 <= rate <= 96000:
        raise HTTPException(415, "Frecuencia de muestreo WAV no compatible.")

    duration = frames / rate if rate else 0
    if duration < MIN_REF_SECONDS:
        raise HTTPException(422, f"La muestra es demasiado corta (mínimo {MIN_REF_SECONDS:.0f} s).")
    if duration > MAX_REF_SECONDS:
        raise HTTPException(413, f"La muestra es demasiado larga (máximo {MAX_REF_SECONDS / 60:.0f} min).")
    return {"channels": channels, "rate": rate, "frames": frames, "duration": duration}


def _synthesize(text: str, language: str, data: bytes) -> bytes:
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, "El motor está ocupado con otra generación. Inténtalo de nuevo cuando termine.")
    try:
        with tempfile.TemporaryDirectory(prefix="voicecari-") as tmp:
            ref_path = os.path.join(tmp, "reference.wav")
            out_path = os.path.join(tmp, "output.wav")
            with open(ref_path, "wb") as handle:
                handle.write(data)
            tts = _load_tts()
            tts.tts_to_file(text=text, speaker_wav=ref_path, language=language, file_path=out_path)
            with open(out_path, "rb") as handle:
                audio = handle.read()
            if len(audio) < 44 or not audio.startswith(b"RIFF") or audio[8:12] != b"WAVE":
                raise RuntimeError("XTTS no produjo un WAV válido.")
            return audio
    finally:
        _lock.release()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
        "model_loaded": _tts is not None,
        "device": _device,
        "demo": DEMO,
        "limits": {"text_chars": MAX_TEXT, "reference_mb": MAX_REF_BYTES // (1024 * 1024)},
    }


@app.post("/clone")
async def clone(
    text: str = Form(...),
    language: str = Form("es"),
    reference: UploadFile = File(...),
):
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "El texto está vacío.")
    if len(text) > MAX_TEXT:
        raise HTTPException(413, f"Texto demasiado largo (máximo {MAX_TEXT} caracteres).")
    if language not in LANGUAGES:
        raise HTTPException(400, f"Idioma no soportado: {language}")

    data = await reference.read(MAX_REF_BYTES + 1)
    if not data:
        raise HTTPException(400, "La muestra de referencia está vacía.")
    if len(data) > MAX_REF_BYTES:
        raise HTTPException(413, "Muestra de referencia demasiado grande (máx. 60 MB).")
    _validate_wav(data)

    if DEMO:
        audio = _demo_wav(text)
    else:
        try:
            # El trabajo de XTTS es bloqueante: se mueve a un thread para que /health
            # y el servidor estático sigan respondiendo durante la generación.
            audio = await run_in_threadpool(_synthesize, text, language, data)
        except HTTPException:
            raise
        except Exception as exc:  # no filtrar rutas ni detalles internos al navegador
            logger.exception("Fallo de generación XTTS")
            raise HTTPException(
                500,
                "El motor no pudo generar el audio. Revisa la consola del servidor para ver el detalle técnico.",
            ) from exc

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"X-Voice-Cari-Synthetic": "1"},
    )


_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.exists(os.path.join(_root, "index.html")):
    app.mount("/", StaticFiles(directory=_root, html=True), name="app")


if __name__ == "__main__":
    import uvicorn

    mode = "DEMO (sin modelo, beep de prueba)" if DEMO else "REAL (XTTS-v2)"
    print(f"Voice Cari · motor local en http://{HOST}:{PORT} · modo {mode}")
    if not DEMO:
        print("Antes del primer uso real, lee la licencia del modelo y define COQUI_TOS_AGREED=1.")
        print("La primera generación descargará/cargará el modelo y puede tardar varios minutos.")
    uvicorn.run(app, host=HOST, port=PORT)
