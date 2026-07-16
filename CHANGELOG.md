# Changelog — Voice Cari

## v3.3.0 (2026-07-14) — Calidad, procesado y consentimiento reforzado

### Procesado de audio (todo en el navegador, sin dependencias)
- **Medidor de calidad de muestra**: al guardar una muestra se analiza duración, nivel de pico, saturación (clipping) y relación señal/ruido (SNR estimada por percentil de energía). Puntuación 0–100 con veredicto y avisos concretos (muy corta, saturada, nivel bajo, ruido de fondo) antes de guardar.
- **Recorte de silencios** en los extremos (detección por umbral de energía con 120 ms de margen).
- **Normalización de volumen** a −1 dB de pico con headroom para no saturar. Ambos opcionales y marcados por defecto en el modal de revisión.
- **Fusión de muestras**: selecciona varias muestras del banco y créalas como una sola referencia larga (con 0,4 s de silencio entre ellas y normalización del conjunto). Los motores clonan mejor con 1–3 min de audio variado.

### Consentimiento
- **Consentimiento grabado**: flujo para que la persona grabe ella misma la frase de permiso; se guarda en el banco marcada como prueba de consentimiento (no fusionable, distinguida visualmente). Es el registro de permiso más sólido posible.

### Procedencia
- **Etiqueta de procedencia** en cada WAV generado: chunk RIFF LIST/INFO con "voz sintética generada por IA" (ISFT, ICMT, IGNR, ICRD). Legible por reproductores y herramientas como ffprobe, sin corromper el audio.

### Verificación
- 10 pruebas unitarias de DSP con señales controladas y medición (score, clipping, nivel, SNR, trim que recorta silencios pero conserva señal continua, normalización a −1 dB sin clipping, longitud de fusión).
- 16 pruebas E2E nuevas (Chromium real): modal de calidad, bloqueo sin consentimiento, guardado con procesado verificado (pico −1 dB medido tras decodificar), fusión con duración coherente, consentimiento grabado, y **validación externa de la etiqueta de procedencia con ffprobe** más integridad del WAV con ffmpeg.
- Regresión completa: 51 (base) + 20 (clonación) + 13 (banco) sin fallos. Total: 100 pruebas verdes.
- Caché SW `voice-cari-v8`.

## v3.1.0 (2026-07-14) — Copia de seguridad del banco de voz

### Banco de voz
- **Exportar banco completo**: genera un ZIP estándar con todas las muestras WAV + `manifest.json` (nombre, fecha, duración y registro de consentimiento de cada muestra). Escritor ZIP propio en vanilla JS (STORE, nombres UTF-8, CRC-32), cero dependencias.
- **Importar banco**: el mismo campo de importación detecta si le das un audio suelto o un ZIP de banco (magia «PK»). Restaura muestras con sus metadatos de consentimiento originales; los duplicados (mismo nombre y tamaño) se omiten. ZIP corrupto o con compresión ajena → error claro sin romper nada.
- Si el ZIP importado no trae manifest propio, se exige confirmar el consentimiento una vez para todo el lote.

### Verificación
- 13 pruebas E2E nuevas de ida y vuelta: exportar → **validación externa con `unzip -t` y `zipfile` de Python** (CRC e integridad) → vaciar → reimportar → generar con la muestra restaurada; más duplicados, ZIP corrupto y ZIP deflate ajeno.
- Regresión completa: 51/51 (v2) y 20/20 (clonación) sin cambios. Total acumulado: 84/84.
- Caché SW `voice-cari-v6`.

## v3.0.0 (2026-07-14) — Clonación de voz local real

### Clonación
- Nueva sección **Clonar** con cuatro módulos: motor local, banco de voz, generación y guion de banco de voz.
- **Motor local XTTS-v2** (carpeta `server/`): FastAPI + coqui-tts, 100 % offline, escucha solo en 127.0.0.1. Clonación zero-shot en español (y 15 idiomas más) desde muestras de 10–30 s. Modo demo (`VOICE_CARI_DEMO=1`) para validar la tubería sin descargar el modelo (~1,9 GB). El servidor además sirve la propia app en la raíz (cero CORS).
- **Banco de voz en IndexedDB**: muestras del grabador o importadas, convertidas en el navegador a WAV mono 24 kHz PCM16 (decodeAudioData + OfflineAudioContext, sin dependencias). Escuchar, descargar y eliminar por muestra.
- **Consentimiento en dos capas**: confirmación explícita al guardar cada muestra (queda registrada en la propia muestra) y casilla obligatoria antes de cada generación.
- Guion de banco de voz: frases fonéticamente ricas en español y guía para preservar una voz (varias tomas, audio largo en bruto).
- Reset ahora borra también el banco de voz (conexiones IDB se cierran tras cada transacción para no bloquear `deleteDatabase`).

### Seguridad
- CSP ampliada: `connect-src` permite solo `self` y `localhost/127.0.0.1` (el motor local).
- El motor valida: texto ≤ 2000, idioma en lista blanca, referencia WAV real (cabecera RIFF), tamaño ≤ 60 MB, una generación simultánea (lock), temporales autodestruidos.

### Verificación
- 20 pruebas E2E nuevas del flujo completo contra el motor demo real (Chromium + FastAPI): health-check, bloqueos de consentimiento, grabación→WAV→IndexedDB (cabecera RIFF/mono/24 kHz verificada), generación, reproducción, descarga, límites, errores 400/415, importación, borrado y reset.
- Suite de regresión v2 completa: 51/51 sin cambios.
- Caché SW `voice-cari-v5`.

## v2.0.1 (2026-07-14) — Auditoría E2E y endurecimiento

### Seguridad
- Content-Security-Policy en meta (`default-src 'self'`, `object-src 'none'`, `media-src blob:` para el reproductor de muestras). GitHub Pages no permite cabeceras HTTP, así que se aplica vía `<meta>` como defensa en profundidad.

### Navegación
- Listener `hashchange`: cambiar el hash manualmente o desde un enlace externo con la app ya abierta ahora activa la sección correspondiente (antes solo funcionaba en carga fría).

### Verificación
- Suite E2E con Chromium real (Playwright): 51 pruebas cubriendo puerta legal (bypass, focus trap, persistencia), editor, troceo TTS, grabador con micrófono simulado, XSS en perfiles/proyectos, límite de 30 proyectos, payload API sin secretos, contraste WCAG de las 4 skins medido en runtime, deep-links, hash malicioso, móvil 375 px, teclado y reset.
- Service worker con caché renovada (`voice-cari-v4`).

## v2.0.0 (2026-07-11) — Rediseño completo "Console"

### Diseño
- Nueva identidad visual: consola de estudio de grabación (paneles rack, placas mono, LEDs, tally REC, ecualizador animado en hero).
- Eliminado el glassmorphism (paneles translúcidos, blobs aurora, blur decorativo).
- Tipografía de sistema: display pesado en mayúsculas + monoespaciada técnica para etiquetas. Cero CDN.
- 4 skins recalibradas con contraste WCAG AA/AAA verificado por script.
- Animaciones suaves: transición de sección, entrada de tarjetas, micro-interacciones en botones y sliders, toast deslizante. Todas respetan `prefers-reduced-motion`.
- Estilos de impresión.

### Accesibilidad
- Skip-link al contenido principal.
- Focus trap real (Tab/Shift+Tab) dentro de la puerta legal.
- `:focus-visible` global con anillo de la skin activa.
- `aria-current="page"` en navegación; `role="status"` en indicadores de lectura y grabación; `role="img"` + etiqueta en el canvas del medidor; `role="group"` en grupos de controles.
- Atributo nativo `hidden` en lugar de clases para reproductor y aviso legal expandible.
- LED de grabación con indicador textual paralelo (no depende solo del color).

### SEO
- Canonical, meta robots, keywords y author.
- Open Graph completo (site_name, url, image, locale) y Twitter Card.
- Datos estructurados JSON-LD `WebApplication`.
- Título descriptivo con marca.

### Código
- Delegación de eventos en listas de perfiles y proyectos (un listener por lista; antes se re-vinculaban en cada render).
- Guardado de borrador con debounce de 400 ms (menos escrituras en localStorage).
- Color del medidor de onda derivado de `--accent` de la skin activa.
- Constante `APP_VERSION` única.
- HTML validado (balance de etiquetas), JS validado con `node --check`, JSON del manifest validado.

### Compatibilidad
- Datos v1.x intactos: mismas claves `voiceCari:*` (borrador, perfiles, proyectos, skin, voz, consentimiento).
- Service worker: caché `voice-cari-v3`; los usuarios de v1 reciben v2 con una recarga normal.

## v1.1.0
- Versión anterior: troceo anti-corte de Chrome, soporte Safari MP4/AAC, SW network-first, puerta legal con `inert`.
