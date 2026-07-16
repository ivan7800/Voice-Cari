"""
Voice Cari — Motor local de clonación de voz (XTTS-v2)
═══════════════════════════════════════════════════════
100 % local: la muestra de voz y el audio generado nunca salen de tu máquina.

Uso:
    python xtts_server.py                # motor real (primera vez descarga ~1,9 GB)
    VOICE_CARI_DEMO=1 python xtts_server.py   # modo demo sin modelo (prueba la tubería)

Endpoints:
    GET  /health  → {"status":"ok","model_loaded":bool,"device":"cpu|cuda","demo":bool}
    POST /clone   → multipart: text, language, reference (wav) → audio/wav

Si la carpeta padre contiene index.html, también sirve la app en la raíz,
así puedes abrir http://127.0.0.1:8020 y usarlo todo sin CORS ni GitHub Pages.
"""
import io
import math
import os
import struct
import tempfile
import threading
import wave

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

# Licencia del modelo XTTS-v2 (Coqui Public Model License: uso no comercial).
# Al ejecutar este servidor aceptas esa licencia para tu uso personal.
os.environ.setdefault("COQUI_TOS_AGREED", "1")

DEMO = os.environ.get("VOICE_CARI_DEMO", "") == "1"
HOST = os.environ.get("VOICE_CARI_HOST", "127.0.0.1")  # solo tu máquina; no exponer a la red
PORT = int(os.environ.get("VOICE_CARI_PORT", "8020"))
MAX_TEXT = 2000
MAX_REF_BYTES = 60 * 1024 * 1024
LANGUAGES = {"es", "en", "fr", "de", "it", "pt", "pl", "nl", "cs", "ru", "tr", "hu", "ko", "ja", "ar", "zh-cn"}

app = FastAPI(title="Voice Cari — Motor local XTTS", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # el servidor solo escucha en 127.0.0.1
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_tts = None
_device = "cpu"
_lock = threading.Lock()  # una generación cada vez: evita agotar RAM/VRAM


def _load_tts():
    """Carga perezosa del modelo (tarda ~1-2 min en CPU la primera vez)."""
    global _tts, _device
    if _tts is None:
        import torch
        from TTS.api import TTS

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(_device)
    return _tts


def _demo_wav(text: str) -> bytes:
    """Modo demo: genera un beep modulado (sin clonar) para validar la tubería."""
    rate = 24000
    seconds = min(4.0, 0.6 + len(text) * 0.02)
    n = int(rate * seconds)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(n):
            t = i / rate
            env = min(1.0, t * 8) * min(1.0, (seconds - t) * 8)
            sample = 0.28 * env * math.sin(2 * math.pi * (220 + 40 * math.sin(2 * math.pi * 1.5 * t)) * t)
            frames += struct.pack("<h", int(sample * 32767))
        w.writeframes(bytes(frames))
    return buf.getvalue()


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _tts is not None, "device": _device, "demo": DEMO}


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

    data = await reference.read()
    if not data:
        raise HTTPException(400, "La muestra de referencia está vacía.")
    if len(data) > MAX_REF_BYTES:
        raise HTTPException(413, "Muestra de referencia demasiado grande (máx. 60 MB).")
    if not data.startswith(b"RIFF"):
        raise HTTPException(415, "La referencia debe ser WAV (la app lo convierte automáticamente).")

    if DEMO:
        return Response(content=_demo_wav(text), media_type="audio/wav")

    with tempfile.TemporaryDirectory(prefix="voicecari-") as tmp:
        ref_path = os.path.join(tmp, "reference.wav")
        out_path = os.path.join(tmp, "output.wav")
        with open(ref_path, "wb") as f:
            f.write(data)
        try:
            with _lock:
                tts = _load_tts()
                tts.tts_to_file(text=text, speaker_wav=ref_path, language=language, file_path=out_path)
            with open(out_path, "rb") as f:
                audio = f.read()
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 — devolvemos el motivo al cliente local
            raise HTTPException(500, f"El motor falló: {type(exc).__name__}: {exc}") from exc
    return Response(content=audio, media_type="audio/wav")


# Servir la propia app si estamos dentro del proyecto (raíz = carpeta padre de server/)
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.exists(os.path.join(_root, "index.html")):
    app.mount("/", StaticFiles(directory=_root, html=True), name="app")


if __name__ == "__main__":
    import uvicorn

    mode = "DEMO (sin modelo, beep de prueba)" if DEMO else "REAL (XTTS-v2)"
    print(f"Voice Cari · motor local en http://{HOST}:{PORT} · modo {mode}")
    if not DEMO:
        print("La primera generación descargará/cargará el modelo (~1,9 GB). Paciencia.")
    uvicorn.run(app, host=HOST, port=PORT)
