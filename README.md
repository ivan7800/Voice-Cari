# Voice Cari v3.3.0 — Authorized Voice Studio

App web estática premium para GitHub Pages, orientada a **voz sintética autorizada**: narración con voces del navegador, grabación local de muestras, perfiles vocales con consentimiento y exportación de paquetes API-ready. Proyecto del ecosistema **Universo 404**.

**100 % local. Sin claves API. Sin subida de audio a servidores. Frontend con cero dependencias.**

## v3.0.0 — Clonación de voz local

La pestaña **Clonar** conecta con un motor XTTS-v2 que corre **en tu propio ordenador** (carpeta `server/`, ver `server/README-SERVIDOR.md`). Flujo: graba o importa una muestra (10–30 s) → se convierte a WAV en el navegador → se guarda con consentimiento en IndexedDB → escribe el texto en el Studio → genera → WAV con la voz clonada. La voz nunca sale de tu máquina. Modo demo sin modelo: `VOICE_CARI_DEMO=1 python server/xtts_server.py`. Consejo: abre la app directamente en `http://127.0.0.1:8020` (el motor la sirve) y todo funciona sin configurar nada.

**Calidad y procesado (v3.3)**: al guardar una muestra, Voice Cari la analiza (duración, nivel, saturación, ruido) y te da una puntuación con avisos antes de guardarla. Puede recortar silencios y normalizar el volumen automáticamente. Puedes **fusionar** varias muestras en una referencia larga (mejor para clonar) y grabar un **consentimiento hablado** que queda archivado como prueba. Cada audio generado lleva una etiqueta interna de "voz sintética".

**Copia de seguridad de la voz**: el botón **Exportar banco** descarga un ZIP con los WAV de referencia y su registro de consentimiento. Guárdalo en varios sitios (disco externo, nube): es el molde de la voz y sirve en cualquier navegador o PC — impórtalo por el mismo campo de importación.

## Novedades v2.0.0 — Rediseño completo

- **Nueva identidad visual "consola de estudio"**: paneles tipo rack con placa identificadora, LEDs de estado, luz de tally REC y ecualizador animado en el hero. Adiós al glassmorphism.
- **Tipografía de sistema** (display condensado + monoespaciada técnica): cero fuentes externas, la PWA sigue funcionando 100 % offline.
- **4 skins recalibradas** (Gold Noir, Cari Blue, Crimson, Aurora) con contraste verificado WCAG AA/AAA en todos los pares texto/fondo.
- **Accesibilidad reforzada**: skip-link, focus trap real en la puerta legal, foco visible global, `aria-current` en navegación, `role="status"` en indicadores, medidor con `role="img"`, `prefers-reduced-motion` completo (pausa ecualizador y LEDs) y estilos de impresión.
- **SEO completo**: canonical, robots, Open Graph, Twitter Card y datos estructurados JSON-LD (`WebApplication`).
- **Código más limpio**: delegación de eventos en listas de perfiles/proyectos (antes se re-vinculaban listeners en cada render), guardado de borrador con debounce (menos escrituras en localStorage), color del medidor derivado de la skin activa.
- **Compatibilidad de datos**: se conservan las claves `voiceCari:*`, así que perfiles, proyectos, borrador y consentimiento de v1.x se mantienen al actualizar.
- Service worker con caché renovada (`voice-cari-v3`).

## Funciones

- Pantalla legal obligatoria con triple consentimiento antes de entrar.
- Editor de narración con contador de caracteres, palabras y tiempo estimado.
- Presets: terror cósmico, tráiler oscuro, audiolibro y corporativo.
- Lectura con voces locales (SpeechSynthesis) con troceo automático anti-corte de Chrome y voz seleccionada persistente.
- Grabador local (MediaRecorder) con medidor de onda en vivo, compatible con Chrome, Edge, Firefox y Safari (WebM/Opus o MP4/AAC según navegador).
- Perfiles vocales autorizados con tipo de consentimiento registrado.
- Biblioteca de proyectos locales (máx. 30) con cargar/exportar/eliminar.
- Preparador de payload API-ready **sin claves** para backend seguro o proveedor autorizado.
- PWA instalable con service worker network-first (las actualizaciones llegan siempre).

## Límites legales y técnicos (léelo)

- **Esta versión no clona voces reales dentro del navegador.** Es un estudio local de narración, muestras y preparación de perfiles.
- Solo debe usarse con **voz propia o voces con permiso explícito y verificable**.
- Todo audio generado o transformado debe identificarse como **sintético** cuando pueda inducir a confusión.
- Prohibido usarla para suplantación, fraude, acoso, llamadas engañosas o desinformación. Ver `LICENSE_NOTICE.md`.
- GitHub Pages es público: **nunca subas claves API al repositorio**. La integración real con un proveedor autorizado debe hacerse desde un backend propio que guarde la clave en variables de entorno del servidor.

## Arquitectura futura recomendada (API segura)

```
Navegador (Voice Cari) ──payload JSON──▶ Backend propio (clave en env) ──▶ Proveedor TTS/clonación autorizado
```

El botón «Generar paquete API-ready» produce exactamente el JSON que ese backend necesitaría, incluyendo el registro de consentimiento.

## Publicación en GitHub Pages

1. Crea un repositorio (por ejemplo `voice-cari`).
2. Sube **todo el contenido de esta carpeta** a la raíz del repositorio (no la carpeta contenedora).
3. Settings → Pages → Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)` → Save.
4. Espera 1–2 minutos y abre `https://TU_USUARIO.github.io/voice-cari/`.
5. Gracias a la caché renovada (`voice-cari-v3`), quien tuviera la v1 instalada recibirá la v2 con una recarga normal.

Todas las rutas son relativas: funciona igual en raíz de dominio o en subcarpeta de proyecto.

> Si tu URL final no es `ivan7800.github.io/voice-cari/`, actualiza el `<link rel="canonical">` y las metas `og:url` / `og:image` de `index.html`.

## Estructura

```
voice-cari/
├── index.html
├── styles.css
├── app.js
├── manifest.json
├── sw.js
├── README.md
├── CHANGELOG.md
├── LICENSE_NOTICE.md
└── assets/
    └── icons/
        ├── icon.svg
        ├── icon-192.png
        └── icon-512.png
```

## Solución de problemas

| Problema | Causa | Solución |
|---|---|---|
| No aparecen voces | El sistema aún no las cargó | Espera 1–2 s; se recargan solas con `voiceschanged` |
| El micrófono no graba | Permiso denegado | Candado de la barra de direcciones → permitir micrófono |
| La lectura se corta a los ~15 s | Bug de Chrome | Corregido: el texto se trocea por frases automáticamente |
| En Safari no descarga WebM | Safari graba MP4/AAC | Corregido: detección de formato y extensión `.m4a` |
| Cambios no aparecen tras actualizar el repo | Caché del SW | Navegación network-first + caché v3; recarga normal basta |

## Privacidad

Texto, perfiles, proyectos y consentimiento se guardan solo en `localStorage` de tu navegador. Las grabaciones viven en memoria hasta que las descargas o las borras. El botón **Reset** elimina todos los datos locales de la app.
