# Motor local de clonación — Voice Cari v3

Todo se ejecuta **en tu ordenador**. La voz nunca se sube a ningún servicio.

## Requisitos

- Windows 10/11, macOS o Linux.
- **Python 3.10 u 3.11** (recomendado; 3.12+ puede dar problemas con coqui-tts).
- ~6 GB de disco (modelo + PyTorch) y 8 GB de RAM. GPU NVIDIA opcional (mucho más rápido).

## Instalación (Windows, PowerShell)

```powershell
cd voice-cari-v3\server
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Probar la tubería SIN descargar el modelo (modo demo)

```powershell
$env:VOICE_CARI_DEMO = "1"
python xtts_server.py
```

Abre http://127.0.0.1:8020 (el servidor también sirve la app), pestaña **Clonar** →
«Probar conexión» → añade una muestra → «Generar». Recibirás un beep: la tubería funciona.

## Motor real

```powershell
python xtts_server.py
```

- La **primera generación** descarga XTTS-v2 (~1,9 GB) y carga el modelo: puede tardar varios minutos.
- En CPU, generar una frase tarda ~20–60 s. Con GPU NVIDIA (CUDA), ~2–5 s.
- Para GPU: instala primero la build CUDA de PyTorch según https://pytorch.org y luego `pip install -r requirements.txt`.

## Consejos de calidad para la muestra

- 10–30 s de voz limpia bastan; sin música ni ruido de fondo, sin eco.
- Volumen constante, tono natural. Varias muestras (neutra, cálida, pausada) dan flexibilidad.
- Guarda también **grabaciones largas en bruto** fuera de la app: los motores futuros las aprovecharán mejor.

## Privacidad y licencia

- El servidor escucha solo en `127.0.0.1`: no es accesible desde la red.
- Muestra y audio se procesan en carpetas temporales que se borran al terminar cada petición.
- XTTS-v2 usa la *Coqui Public Model License* (**no comercial**). Uso personal/familiar: correcto.
- El audio generado es voz sintética: identifícalo como tal si algún día lo compartes.
