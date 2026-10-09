# Voice Cari — verificación de navegador y XTTS real

## Estado de esta entrega

- Las pruebas estáticas y smoke del servidor en modo demo pasan en el entorno de creación.
- E2E Chromium **no certificado aquí**: el entorno bloquea navegaciones web incluso a localhost (`ERR_BLOCKED_BY_ADMINISTRATOR`). Ejecuta las pruebas en tu equipo.
- XTTS-v2 real **no certificado aquí**: `TTS`/Coqui no está instalado y no existe GPU NVIDIA disponible. Un tono de demo NO demuestra clonación.

## Windows — E2E de navegador real

1. Instala Python compatible con la versión de Coqui a usar y Chromium de Playwright.
2. Desde la carpeta del proyecto ejecuta:

```powershell
python -m pip install -r server/requirements-base.txt -r tests/requirements-e2e.txt
python -m playwright install chromium
python tests/e2e_frontend.py
```

Si el navegador del entorno corporativo bloquea localhost, usa un Windows sin esa restricción; no desactives políticas corporativas.

## Prueba manual de recuperación completa

1. Arranca el servidor demo y abre la app. Acepta condiciones e importa una muestra de voz WAV propia/autorizada.
2. En Studio, introduce texto suficientemente largo para producir al menos 3 fragmentos. Ve a Clonar > Producción de audiolibros. Confirma el consentimiento.
3. Pulsa Generar. Cuando se hayan guardado al menos 1-2 fragmentos, cancela.
4. Recarga la pestaña. Comprueba que aparece `Recuperación disponible: N/M`. Pulsa `Restaurar texto pendiente`.
5. Verifica que se restauran texto, nombre, idioma y muestra, cuando continúa presente en el banco de voces.
6. Confirma de nuevo consentimiento, pulsa Generar y verifica que reanuda en el fragmento N+1, que el resultado es WAV y que permite convertir a MP3 con FFmpeg.
7. Repite cerrando la pestaña y relanzándola; comprueba el descarte con `Descartar progreso pendiente`.

Precaución: IndexedDB depende del origen (dominio/puerto) y almacenamiento del navegador. Modo incógnito, borrado de datos o cambio de puerto pueden eliminar/ocultar el progreso.

## Clonación real con XTTS-v2

1. Consulta la licencia y los requisitos de Coqui/XTTS-v2; acepta la licencia **solo si corresponde**. No uses voces ajenas sin permiso.
2. Prepara entorno virtual separado y dependencias de `server/requirements.txt` con una versión Python compatible.
3. Ejecuta el servidor sin `VOICE_CARI_DEMO=1` y comprueba que `GET /health` devuelve modo real.
4. Importa una muestra hablada limpia y autorizada (no tono sintético). Genera frases de prueba en castellano, primero cortas y después un capítulo.
5. Evalúa inteligibilidad, identidad vocal, prosodia, artefactos, consumo de RAM/VRAM, duración y errores. Guarda los resultados.

No publiques el puerto del motor local ni compartas los audios de muestra sin autorización.
