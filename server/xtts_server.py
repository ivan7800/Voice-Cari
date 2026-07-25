"""Voice Cari 3.3.2 — servidor local opcional para XTTS-v2.

Endpoints:
    GET  /health
    POST /clone   multipart: text, language, reference (WAV PCM16)

Sirve únicamente los archivos públicos del frontend; nunca expone el código del
servidor, tests, documentación ni archivos añadidos accidentalmente al proyecto.
"""
from __future__ import annotations

import io
import ipaddress
import logging
import math
import os
import re
import struct
import sys
import tempfile
import threading
import wave
from array import array
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

APP_VERSION = "3.3.2"
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
DEMO = os.environ.get("VOICE_CARI_DEMO", "") == "1"
HOST = os.environ.get("VOICE_CARI_HOST", "127.0.0.1").strip()
PORT = int(os.environ.get("VOICE_CARI_PORT", "8020"))
MAX_TEXT = 2000
MAX_REF_BYTES = 60 * 1024 * 1024
MAX_OUTPUT_BYTES = 100 * 1024 * 1024
MIN_REF_SECONDS = 3.0
MAX_REF_SECONDS = 300.0
LANGUAGES = {"es", "en", "fr", "de", "it", "pt", "pl", "nl", "cs", "ru", "tr", "hu", "ko", "ja", "ar", "zh-cn"}
PUBLIC_FILES = {"index.html", "styles.css", "app.js", "manifest.json", "sw.js"}
JSON_LD_CSP_HASH = "sha256-O9bbC6pc0+zBs/o8bAJi7AKJF/UizSYdbFu5R44OA1Y="

logger = logging.getLogger("voice_cari")
ROOT = Path(__file__).resolve().parent.parent


def _is_loopback_host(host: str) -> bool:
    candidate = host.strip().strip("[]").lower()
    if candidate == "localhost":
        return True
    try:
        return ipaddress.ip_address(candidate).is_loopback
    except ValueError:
        return False


if not _is_loopback_host(HOST) and os.environ.get("VOICE_CARI_ALLOW_REMOTE", "") != "1":
    raise RuntimeError(
        "VOICE_CARI_HOST debe ser loopback (127.0.0.1, ::1 o localhost). "
        "Para una exposición remota consciente define VOICE_CARI_ALLOW_REMOTE=1 y protege el servicio externamente."
    )
if not 1 <= PORT <= 65535:
    raise RuntimeError("VOICE_CARI_PORT debe estar entre 1 y 65535.")


_default_public_origin = os.environ.get("VOICE_CARI_PUBLIC_ORIGIN", "https://ivan7800.github.io").strip()
_extra_origins = {
    item.strip().rstrip("/")
    for item in os.environ.get("VOICE_CARI_ALLOWED_ORIGINS", "").split(",")
    if item.strip()
}
TRUSTED_ORIGINS = ({_default_public_origin.rstrip("/")} if _default_public_origin else set()) | _extra_origins
LOCAL_ORIGIN_RE = re.compile(r"^http://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$", re.IGNORECASE)


def _origin_allowed(origin: str | None) -> bool:
    """Permite clientes sin Origin y frontends explícitos o de loopback."""
    if not origin:
        return True
    candidate = origin.strip().rstrip("/")
    if candidate in TRUSTED_ORIGINS or LOCAL_ORIGIN_RE.fullmatch(candidate):
        return True
    try:
        parsed = urlsplit(candidate)
    except ValueError:
        return False
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}


app = FastAPI(
    title="Voice Cari — Motor local XTTS",
    version=APP_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(TRUSTED_ORIGINS),
    allow_origin_regex=r"^http://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
    allow_credentials=False,
    max_age=600,
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # CORS impide leer una respuesta, pero por sí solo no evita que una web
    # maliciosa fuerce trabajo pesado. El control de Origin bloquea la petición.
    origin = request.headers.get("origin")
    if not _origin_allowed(origin):
        return JSONResponse(status_code=403, content={"detail": "Origen no autorizado."})
    if request.url.path == "/clone":
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REF_BYTES + 1024 * 1024:
                    return JSONResponse(status_code=413, content={"detail": "Petición demasiado grande."})
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Content-Length no válido."})

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), payment=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        f"default-src 'self'; script-src 'self' '{JSON_LD_CSP_HASH}'; style-src 'self'; img-src 'self' data:; "
        "media-src 'self' blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* http://[::1]:*; "
        "object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
    )
    if request.url.path in {"/health", "/clone", "/sw.js"}:
        response.headers.setdefault("Cache-Control", "no-store")
    else:
        response.headers.setdefault("Cache-Control", "no-cache")

    # Compatibilidad con navegadores que envían el preflight de acceso a red local.
    if (
        request.method == "OPTIONS"
        and request.headers.get("access-control-request-private-network", "").lower() == "true"
        and _origin_allowed(origin)
    ):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


_tts = None
_device = "cpu"
_lock = threading.Lock()


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
    """Modo demo: genera un tono modulado; no clona ninguna voz."""
    rate = 24000
    seconds = min(4.0, 0.6 + len(text) * 0.02)
    frame_count = int(rate * seconds)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        frames = bytearray()
        for index in range(frame_count):
            current = index / rate
            envelope = min(1.0, current * 8) * min(1.0, (seconds - current) * 8)
            sample = 0.28 * envelope * math.sin(
                2 * math.pi * (220 + 40 * math.sin(2 * math.pi * 1.5 * current)) * current
            )
            frames += struct.pack("<h", int(sample * 32767))
        output.writeframes(bytes(frames))
    return buffer.getvalue()


def _validate_wav(
    data: bytes,
    *,
    min_seconds: float = 0.01,
    max_seconds: float = 1800.0,
    require_signal: bool = True,
) -> dict[str, float | int]:
    """Valida RIFF/WAVE PCM16, truncado, señal y límites de duración."""
    if len(data) < 44 or not data.startswith(b"RIFF") or data[8:12] != b"WAVE":
        raise HTTPException(415, "El archivo debe ser un WAV PCM válido.")
    declared_size = int.from_bytes(data[4:8], "little") + 8
    if declared_size < 44 or declared_size > len(data):
        raise HTTPException(415, "El WAV está truncado o declara un tamaño imposible.")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            channels = audio.getnchannels()
            sample_width = audio.getsampwidth()
            rate = audio.getframerate()
            frames = audio.getnframes()
            compression = audio.getcomptype()
            frame_bytes = audio.readframes(frames)
    except (wave.Error, EOFError) as exc:
        raise HTTPException(415, "El WAV está dañado o no es compatible.") from exc

    if compression != "NONE" or sample_width != 2:
        raise HTTPException(415, "El WAV debe usar PCM lineal de 16 bits.")
    if channels not in {1, 2}:
        raise HTTPException(415, "El WAV debe ser mono o estéreo.")
    if not 8000 <= rate <= 96000:
        raise HTTPException(415, "Frecuencia de muestreo WAV no compatible.")
    expected_bytes = frames * channels * sample_width
    if len(frame_bytes) != expected_bytes:
        raise HTTPException(415, "El WAV está truncado o declara datos inexistentes.")

    duration = frames / rate if rate else 0
    if duration < min_seconds:
        raise HTTPException(422, f"La muestra es demasiado corta (mínimo {min_seconds:g} s).")
    if duration > max_seconds:
        raise HTTPException(413, f"La muestra es demasiado larga (máximo {max_seconds / 60:g} min).")

    samples = array("h")
    samples.frombytes(frame_bytes)
    if sys.byteorder == "big":
        samples.byteswap()
    peak = max((abs(sample) for sample in samples), default=0)
    rms = math.sqrt(sum(sample * sample for sample in samples) / max(1, len(samples)))
    if require_signal and (peak < 100 or rms < 30):
        raise HTTPException(422, "La muestra no contiene una señal de voz útil.")
    return {
        "channels": channels,
        "rate": rate,
        "frames": frames,
        "duration": duration,
        "peak": peak,
        "rms": rms,
    }


def _synthesize(text: str, language: str, data: bytes) -> bytes:
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, "El motor está ocupado con otra generación. Inténtalo cuando termine.")
    try:
        with tempfile.TemporaryDirectory(prefix="voicecari-") as temp_dir:
            reference_path = os.path.join(temp_dir, "reference.wav")
            output_path = os.path.join(temp_dir, "output.wav")
            with open(reference_path, "wb") as handle:
                handle.write(data)
            tts = _load_tts()
            tts.tts_to_file(
                text=text,
                speaker_wav=reference_path,
                language=language,
                file_path=output_path,
            )
            output = Path(output_path).read_bytes()
            if len(output) > MAX_OUTPUT_BYTES:
                raise RuntimeError("XTTS produjo una salida superior a 100 MB.")
            _validate_wav(output, require_signal=True)
            return output
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
        "limits": {
            "text_chars": MAX_TEXT,
            "reference_mb": MAX_REF_BYTES // (1024 * 1024),
            "reference_seconds": [MIN_REF_SECONDS, MAX_REF_SECONDS],
            "output_mb": MAX_OUTPUT_BYTES // (1024 * 1024),
        },
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
    if any(ord(character) < 32 and character not in "\n\r\t" for character in text):
        raise HTTPException(400, "El texto contiene caracteres de control no permitidos.")
    if language not in LANGUAGES:
        raise HTTPException(400, f"Idioma no soportado: {language}")

    try:
        data = await reference.read(MAX_REF_BYTES + 1)
    finally:
        await reference.close()
    if not data:
        raise HTTPException(400, "La muestra de referencia está vacía.")
    if len(data) > MAX_REF_BYTES:
        raise HTTPException(413, "Muestra de referencia demasiado grande (máx. 60 MB).")
    _validate_wav(data, min_seconds=MIN_REF_SECONDS, max_seconds=MAX_REF_SECONDS, require_signal=True)

    if DEMO:
        audio = _demo_wav(text)
    else:
        try:
            audio = await run_in_threadpool(_synthesize, text, language, data)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Fallo de generación XTTS")
            raise HTTPException(
                500,
                "El motor no pudo generar el audio. Revisa la consola del servidor para el detalle técnico.",
            ) from exc

    _validate_wav(audio, require_signal=True)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"X-Voice-Cari-Synthetic": "1", "Content-Disposition": 'inline; filename="voice-cari.wav"'},
    )


def _public_file(name: str) -> FileResponse:
    if name not in PUBLIC_FILES:
        raise HTTPException(404, "Recurso no encontrado.")
    path = ROOT / name
    if not path.is_file():
        raise HTTPException(404, "Recurso no encontrado.")
    media_types = {
        "index.html": "text/html; charset=utf-8",
        "styles.css": "text/css; charset=utf-8",
        "app.js": "text/javascript; charset=utf-8",
        "manifest.json": "application/manifest+json",
        "sw.js": "text/javascript; charset=utf-8",
    }
    return FileResponse(path, media_type=media_types[name])


@app.get("/", include_in_schema=False)
def frontend_root():
    return _public_file("index.html")


@app.get("/{name}", include_in_schema=False)
def frontend_file(name: str):
    return _public_file(name)


assets = ROOT / "assets"
if assets.is_dir():
    app.mount("/assets", StaticFiles(directory=assets, check_dir=True), name="assets")


if __name__ == "__main__":
    import uvicorn

    mode = "DEMO (sin modelo, tono de prueba)" if DEMO else "REAL (XTTS-v2)"
    print(f"Voice Cari · motor local en http://{HOST}:{PORT} · modo {mode}")
    if not DEMO:
        print("Antes del primer uso real, lee la licencia del modelo y define COQUI_TOS_AGREED=1.")
        print("La primera generación descargará/cargará el modelo y puede tardar varios minutos.")
    uvicorn.run(app, host=HOST, port=PORT)
