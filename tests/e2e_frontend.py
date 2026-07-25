#!/usr/bin/env python3
"""E2E reproducible del frontend contra el servidor demo real."""
from __future__ import annotations

import io
import json
import math
import struct
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
import wave
import zipfile
from pathlib import Path

try:
    from playwright.sync_api import expect, sync_playwright
except ImportError:
    print("Instala: pip install -r tests/requirements-e2e.txt", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server" / "xtts_server.py"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def make_wav(path: Path, seconds: float = 12.0, rate: int = 24000) -> None:
    frames = bytearray()
    for index in range(int(seconds * rate)):
        value = int(0.25 * 32767 * math.sin(2 * math.pi * 220 * index / rate))
        frames += struct.pack("<h", value)
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(bytes(frames))


def wait_server(url: str, process: subprocess.Popen[str]) -> None:
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{url}/health", timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            pass
        if process.poll() is not None:
            output = process.stdout.read() if process.stdout else ""
            raise RuntimeError(f"El servidor terminó antes de arrancar:\n{output}")
        time.sleep(0.2)
    raise TimeoutError("El servidor no respondió.")


def accept_legal(page) -> None:
    for selector in ("#legalOwnVoice", "#legalSynthetic", "#legalLocal"):
        page.check(selector)
    page.click("#acceptLegal")
    page.locator("#legalGate").wait_for(state="hidden", timeout=5000)


def main() -> int:
    checks: list[str] = []
    page_errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="voicecari-e2e-") as temp:
        temp_path = Path(temp)
        wav_path = temp_path / "reference.wav"
        bank_path = temp_path / "bank.zip"
        exported_path = temp_path / "exported.zip"
        make_wav(wav_path)
        manifest = {
            "app": "Voice Cari",
            "kind": "voice-bank",
            "version": "3.3.1",
            "samples": [{
                "file": "muestras/importada.wav",
                "name": "Banco E2E",
                "createdAt": "2026-07-25T00:00:00Z",
                "duration": 12,
                "consent": {"confirmed": True},
            }],
        }
        with zipfile.ZipFile(bank_path, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
            archive.write(wav_path, "muestras/importada.wav")

        port = free_port()
        base = f"http://127.0.0.1:{port}"
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
        try:
            wait_server(base, process)
            with sync_playwright() as playwright:
                try:
                    executable = os.environ.get("VOICE_CARI_CHROMIUM") or None
                    browser = playwright.chromium.launch(
                        headless=True,
                        executable_path=executable,
                        args=[
                            "--autoplay-policy=no-user-gesture-required",
                            "--use-fake-device-for-media-stream",
                            "--use-fake-ui-for-media-stream",
                        ],
                    )
                except Exception as exc:
                    print("Instala el navegador: python -m playwright install chromium, o define VOICE_CARI_CHROMIUM", file=sys.stderr)
                    raise SystemExit(2) from exc

                context = browser.new_context(accept_downloads=True, permissions=["microphone"])
                page = context.new_page()
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.goto(base, wait_until="networkidle")
                accept_legal(page)
                expect(page.locator("#engineStatus")).to_contain_text("Conectado", timeout=10000, use_inner_text=False)
                checks.append("consentimiento y conexión")

                page.click('[data-section="recorder"]')
                page.click("#startRec")
                expect(page.locator("#stopRec")).to_be_enabled(timeout=5000)
                page.wait_for_timeout(1000)
                page.click("#stopRec")
                expect(page.locator("#downloadRec")).to_be_enabled(timeout=10000)
                checks.append("grabación con MediaRecorder")

                page.click('[data-section="clone"]')
                page.set_input_files("#bankImport", str(wav_path))
                page.locator("#qualityModal").wait_for(state="visible", timeout=10000)
                page.fill("#qualityName", "Referencia E2E")
                page.check("#qualityConsent")
                page.click("#qualitySave")
                page.locator("#qualityModal").wait_for(state="hidden", timeout=10000)
                expect(page.locator("#cloneSample option")).to_have_count(2, timeout=10000)
                checks.append("importación, análisis e IndexedDB")

                with page.expect_download(timeout=10000) as download_info:
                    page.click("#exportBank")
                download_info.value.save_as(str(exported_path))
                with zipfile.ZipFile(exported_path) as archive:
                    names = archive.namelist()
                    assert "manifest.json" in names and any(name.endswith(".wav") for name in names)
                checks.append("exportación ZIP verificable")

                page.click('[data-section="studio"]')
                page.fill("#scriptText", "Prueba integral autorizada de Voice Cari.")
                page.click('[data-section="clone"]')
                page.select_option("#cloneSample", index=1)
                page.check("#cloneConsent")
                with page.expect_response(lambda response: response.url.endswith("/clone"), timeout=20000) as response_info:
                    page.click("#cloneGo")
                if response_info.value.status != 200:
                    raise AssertionError(f"/clone devolvió {response_info.value.status}: {response_info.value.text()}")
                expect(page.locator("#cloneDownload")).to_be_enabled(timeout=10000)
                checks.append("generación y descarga WAV")

                page.click('[data-section="profiles"]')
                page.fill("#profileName", "Voz propia E2E")
                page.fill("#profileTone", "neutro")
                page.click("#saveProfile")
                assert page.locator("#profileList [data-delete-profile]").count() == 1
                checks.append("perfiles vocales")

                page.click('[data-section="library"]')
                page.fill("#projectName", "Proyecto E2E")
                page.click("#saveProject")
                assert page.locator("#projectList [data-load-project]").count() == 1
                page.click("#projectList [data-load-project]")
                assert page.locator("#studio.active").count() == 1
                checks.append("guardar y cargar proyecto")

                page.click('[data-section="integrations"]')
                page.click("#buildApiPack")
                payload = page.locator("#payloadOut").text_content() or ""
                assert "recommendedFlow" in payload and "consentRequired" in payload
                checks.append("payload API-ready")

                page.wait_for_timeout(1000)
                registered = page.evaluate("navigator.serviceWorker.getRegistration().then(reg => Boolean(reg))")
                assert registered
                checks.append("service worker en loopback")

                page.set_viewport_size({"width": 375, "height": 812})
                page.click('[data-section="clone"]')
                section = page.locator("#clone").bounding_box()
                assert section and section["width"] <= 375.5
                checks.append("viewport móvil 375 px")
                context.close()

                context = browser.new_context()
                page = context.new_page()
                page.add_init_script("localStorage.setItem('voiceCari:legalAccepted', 'true')")
                page.goto(base, wait_until="domcontentloaded")
                assert page.locator("#legalGate:not(.hide)").count() == 1
                checks.append("bloqueo de consentimiento heredado")
                context.close()

                context = browser.new_context()
                page = context.new_page()
                page.goto(base, wait_until="domcontentloaded")
                accept_legal(page)
                page.click('[data-section="clone"]')
                page.once("dialog", lambda dialog: dialog.dismiss())
                page.set_input_files("#bankImport", str(bank_path))
                page.wait_for_timeout(700)
                assert page.locator("#cloneSample option").count() == 1
                page.once("dialog", lambda dialog: dialog.accept())
                page.set_input_files("#bankImport", str(bank_path))
                expect(page.locator("#cloneSample option")).to_have_count(2, timeout=10000)
                checks.append("reautorización obligatoria de banco ZIP")
                context.close()
                browser.close()
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

    if page_errors:
        print("Errores de página:", *page_errors, sep="\n- ", file=sys.stderr)
        return 1
    print("E2E superado:")
    for check in checks:
        print(f"PASS: {check}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
