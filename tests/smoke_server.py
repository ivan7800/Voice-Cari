#!/usr/bin/env python3
"""Smoke tests sin pytest para el servidor Voice Cari en modo demo."""
from __future__ import annotations

import io
import json
import math
import struct
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server" / "xtts_server.py"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def make_wav(seconds: float = 4.0, rate: int = 24000, silent: bool = False, amplitude: float = 0.25) -> bytes:
    frames = bytearray()
    for index in range(int(seconds * rate)):
        value = 0 if silent else int(amplitude * 32767 * math.sin(2 * math.pi * 220 * index / rate))
        frames += struct.pack("<h", value)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(bytes(frames))
    return buf.getvalue()


def multipart(fields: dict[str, str], filename: str, payload: bytes) -> tuple[bytes, str]:
    boundary = f"----voicecari-{uuid.uuid4().hex}"
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode("utf-8"),
            b"\r\n",
        ])
    parts.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="reference"; filename="{filename}"\r\n'.encode(),
        b"Content-Type: audio/wav\r\n\r\n",
        payload,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def request(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None, method: str | None = None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"PASS: {message}")


def main() -> int:
    port = free_port()
    env = os.environ.copy()
    env.update({"VOICE_CARI_DEMO": "1", "VOICE_CARI_PORT": str(port), "PYTHONUNBUFFERED": "1"})
    process = subprocess.Popen(
        [sys.executable, str(SERVER)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                status, _, body = request(f"{base}/health")
                if status == 200:
                    break
            except Exception:
                pass
            if process.poll() is not None:
                output = process.stdout.read() if process.stdout else ""
                raise RuntimeError(f"El servidor terminó antes de arrancar:\n{output}")
            time.sleep(0.2)
        else:
            raise TimeoutError("El servidor no respondió a /health.")

        health = json.loads(body)
        assert_true(health["status"] == "ok", "GET /health responde ok")
        assert_true(health["demo"] is True, "el servidor está en modo demo")
        assert_true(health["version"] == "3.3.2", "la API publica la versión 3.3.2")

        status, _, _ = request(f"{base}/health", headers={"Origin": "https://evil.example"})
        assert_true(status == 403, "un origen web no autorizado queda bloqueado")

        status, pna_headers, _ = request(
            f"{base}/health",
            method="OPTIONS",
            headers={
                "Origin": "https://ivan7800.github.io",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        lowered_pna = {key.lower(): value for key, value in pna_headers.items()}
        assert_true(status == 200 and lowered_pna.get("access-control-allow-private-network") == "true", "el preflight de red local se autoriza solo para un origen confiable")

        wav = make_wav(4.0)
        body, content_type = multipart({"text": "Prueba autorizada", "language": "es"}, "reference.wav", wav)
        status, headers, result = request(f"{base}/clone", data=body, headers={"Content-Type": content_type})
        assert_true(status == 200, "POST /clone acepta un WAV PCM16 válido")
        assert_true(result[:4] == b"RIFF" and result[8:12] == b"WAVE", "la respuesta de demo es WAV")
        lowered = {k.lower(): v for k, v in headers.items()}
        assert_true(lowered.get("x-voice-cari-synthetic") == "1", "la respuesta marca procedencia sintética")
        assert_true(lowered.get("x-content-type-options") == "nosniff", "las respuestas incluyen cabeceras de seguridad")

        bad_body, bad_type = multipart({"text": "Prueba", "language": "es"}, "fake.wav", b"RIFFnot-a-wave")
        status, _, _ = request(f"{base}/clone", data=bad_body, headers={"Content-Type": bad_type})
        assert_true(status == 415, "un RIFF falso se rechaza")

        short_body, short_type = multipart({"text": "Prueba", "language": "es"}, "short.wav", make_wav(1.0))
        status, _, _ = request(f"{base}/clone", data=short_body, headers={"Content-Type": short_type})
        assert_true(status == 422, "una muestra demasiado corta se rechaza")

        silent_body, silent_type = multipart({"text": "Prueba", "language": "es"}, "silent.wav", make_wav(4.0, silent=True))
        status, _, _ = request(f"{base}/clone", data=silent_body, headers={"Content-Type": silent_type})
        assert_true(status == 422, "una muestra sin señal útil se rechaza")

        quiet_body, quiet_type = multipart({"text": "Prueba", "language": "es"}, "quiet.wav", make_wav(4.0, amplitude=0.0005))
        status, _, _ = request(f"{base}/clone", data=quiet_body, headers={"Content-Type": quiet_type})
        assert_true(status == 422, "el ruido casi silencioso no se acepta como voz")

        truncated = wav[:-200]
        trunc_body, trunc_type = multipart({"text": "Prueba", "language": "es"}, "truncated.wav", truncated)
        status, _, _ = request(f"{base}/clone", data=trunc_body, headers={"Content-Type": trunc_type})
        assert_true(status == 415, "un WAV truncado se rechaza")

        lang_body, lang_type = multipart({"text": "Prueba", "language": "xx"}, "reference.wav", wav)
        status, _, _ = request(f"{base}/clone", data=lang_body, headers={"Content-Type": lang_type})
        assert_true(status == 400, "un idioma no permitido se rechaza")

        control_body, control_type = multipart({"text": "Texto\x00oculto", "language": "es"}, "reference.wav", wav)
        status, _, _ = request(f"{base}/clone", data=control_body, headers={"Content-Type": control_type})
        assert_true(status == 400, "los caracteres de control del texto se rechazan")

        status, _, html = request(f"{base}/")
        assert_true(status == 200 and b"Voice Cari" in html, "el servidor sirve el frontend")

        for private_path in ("/server/xtts_server.py", "/tests/smoke_server.py", "/README.md", "/.gitignore"):
            status, _, _ = request(f"{base}{private_path}")
            assert_true(status == 404, f"el servidor no expone {private_path}")
        print("\nTodas las pruebas smoke han pasado.")
        return 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        if process.returncode not in {0, -15, 143, None} and process.stdout:
            print(process.stdout.read(), file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
