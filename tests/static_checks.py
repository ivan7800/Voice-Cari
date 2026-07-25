#!/usr/bin/env python3
"""Comprobaciones estáticas reproducibles de Voice Cari sin dependencias externas."""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = "3.3.2"


class IdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.refs: list[str] = []
        self.sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if data.get("id"):
            self.ids.append(data["id"] or "")
        for key in ("aria-labelledby", "aria-describedby", "aria-controls", "for"):
            if data.get(key):
                self.refs.extend((data[key] or "").split())
        for key in ("src", "href"):
            value = data.get(key)
            if value and not value.startswith(("#", "http://", "https://", "mailto:", "data:")):
                self.sources.append(value.split("?", 1)[0])


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"PASS: {message}")


def main() -> int:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    server = (ROOT / "server" / "xtts_server.py").read_text(encoding="utf-8")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

    parser = IdParser()
    parser.feed(html)
    duplicates = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
    check(not duplicates, f"no hay IDs HTML duplicados ({duplicates or 'ninguno'})")

    missing_refs = sorted(set(parser.refs) - set(parser.ids))
    check(not missing_refs, f"las referencias ARIA/label apuntan a IDs existentes ({missing_refs or 'todas válidas'})")

    js_ids = set(re.findall(r"\$\(['\"]#([A-Za-z][\w:-]*)['\"]\)", app))
    missing_js = sorted(js_ids - set(parser.ids))
    check(not missing_js, f"los selectores directos de app.js existen en el HTML ({missing_js or 'todos válidos'})")

    for source in parser.sources:
        path = ROOT / source.lstrip("./")
        check(path.exists(), f"existe el recurso referenciado {source}")

    cached = re.findall(r"['\"](\./[^'\"]+)['\"]", sw)
    for source in cached:
        if source == "./":
            continue
        check((ROOT / source[2:]).exists(), f"existe el recurso PWA {source}")

    check(manifest.get("start_url") == "./index.html", "el manifest usa una ruta relativa compatible con GitHub Pages")
    check(manifest.get("scope") == "./", "el scope de la PWA queda limitado al repositorio")
    check(all((ROOT / icon["src"]).exists() for icon in manifest.get("icons", [])), "todos los iconos del manifest existen")

    check(f"v{EXPECTED_VERSION}" in html, "index.html muestra la versión actual")
    check(f"APP_VERSION = '{EXPECTED_VERSION}'" in app, "app.js declara la versión actual")
    check(f'APP_VERSION = "{EXPECTED_VERSION}"' in server, "el servidor declara la versión actual")
    check("voice-cari-v10" in sw, "el service worker usa una caché nueva para la versión")

    forbidden = ["eval(", "new Function(", "innerHTML = user", "allow_origins=[\"*\"]", "shell=True"]
    hits = [token for token in forbidden if token in app or token in server]
    check(not hits, f"no aparecen patrones inseguros críticos conocidos ({hits or 'ninguno'})")

    print("\nTodas las comprobaciones estáticas han pasado.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
