# Voice Cari v3.3.1 — Authorized Voice Studio

Voice Cari es un estudio de voz sintética autorizada del ecosistema **Universo 404**. Combina:

- Un frontend web/PWA sin claves API.
- Narración con las voces instaladas en el navegador.
- Grabación e importación de muestras propias o autorizadas.
- Banco de voz local en IndexedDB con análisis, recorte y normalización.
- Clonación real mediante un servidor local XTTS-v2 incluido en `server/`.

Los textos, perfiles, proyectos y muestras se mantienen en el dispositivo. El servidor escucha por defecto solo en `127.0.0.1`.

## Importante: qué funciona en GitHub Pages

GitHub Pages puede alojar el **frontend**, pero no puede ejecutar Python ni XTTS. Por tanto:

- La narración del navegador, el grabador, los perfiles, la biblioteca y los paquetes JSON funcionan como web estática.
- La pestaña **Clonar** necesita que `server/xtts_server.py` esté ejecutándose en el ordenador del usuario.
- La forma más fiable de usar la clonación es abrir la app desde el propio servidor local: `http://127.0.0.1:8020`.
- No abras `index.html` directamente con `file://` para clonar.

## Inicio rápido en modo demo

El modo demo prueba todo el recorrido sin descargar XTTS. Genera un tono de prueba; **no clona la voz**.

### Windows

```powershell
cd voice-cari-v3\server
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-base.txt
$env:VOICE_CARI_DEMO = "1"
python xtts_server.py
```

También puedes ejecutar `server/start-demo.bat` después de instalar las dependencias.

Abre después:

```text
http://127.0.0.1:8020
```

## Motor real XTTS-v2

1. Lee la licencia aplicable al modelo XTTS-v2 y confirma que tu uso está permitido.
2. Activa el entorno virtual.
3. Instala el motor real con `pip install -r requirements.txt`.
4. Declara la aceptación de la licencia.
5. Inicia el servidor.

### Windows PowerShell

```powershell
$env:COQUI_TOS_AGREED = "1"
python xtts_server.py
```

### Linux/macOS

```bash
export COQUI_TOS_AGREED=1
python xtts_server.py
```

La primera generación puede descargar un modelo grande y tardar varios minutos. El modo real requiere más recursos que el modo demo; una GPU NVIDIA compatible puede reducir mucho la latencia.

## Flujo recomendado

1. Acepta la puerta de consentimiento.
2. Graba o importa una muestra limpia de 10–30 segundos o más.
3. Revisa el análisis de calidad.
4. Confirma que la voz es propia o que existe autorización expresa.
5. Guarda la muestra en el banco.
6. Escribe el texto en **Studio**.
7. Abre **Clonar**, comprueba el motor y selecciona la muestra.
8. Genera, escucha y descarga el WAV.
9. Identifica el resultado como voz sintética cuando pueda confundirse con una grabación real.

## Seguridad y privacidad

- El servidor se enlaza a `127.0.0.1` por defecto.
- Las webs externas no autorizadas reciben `403`; CORS no está abierto globalmente.
- Los WAV se validan como PCM de 16 bits antes de procesarse.
- Se aplican límites de texto, tamaño y duración.
- Los archivos temporales se eliminan al finalizar cada petición.
- Los errores internos se registran en la consola del servidor sin exponer rutas o trazas al navegador.
- Un banco ZIP importado exige una confirmación nueva de autorización, aunque incluya un manifiesto previo.
- No subas claves, modelos, muestras de voz ni entornos virtuales al repositorio.

Para permitir otro frontend autorizado, define una lista separada por comas:

```powershell
$env:VOICE_CARI_ALLOWED_ORIGINS = "https://ejemplo.com,https://otro.example"
```

El origen público predeterminado es `https://ivan7800.github.io`. Puede cambiarse con `VOICE_CARI_PUBLIC_ORIGIN`.

## Publicación del frontend en GitHub Pages

1. Sube el contenido de esta carpeta a la raíz del repositorio.
2. En GitHub: **Settings → Pages → Deploy from a branch**.
3. Selecciona `main` y `/ (root)`.
4. Revisa en `index.html` las etiquetas `canonical`, `og:url` y `og:image` si cambia la URL final.

La clonación seguirá requiriendo el servidor local.

## Estructura

```text
voice-cari-v3/
├── index.html
├── styles.css
├── app.js
├── manifest.json
├── sw.js
├── README.md
├── CHANGELOG.md
├── LICENSE_NOTICE.md
├── AUDIT_REPORT.md
├── .gitignore
├── assets/
│   └── icons/
├── server/
│   ├── xtts_server.py
│   ├── requirements-base.txt
│   ├── requirements.txt
│   ├── README-SERVIDOR.md
│   ├── start-demo.bat
│   └── start-real.bat
└── tests/
    ├── smoke_server.py
    ├── e2e_frontend.py
    └── requirements-e2e.txt
```

## Pruebas

Prueba automatizada del servidor en modo demo:

```bash
python tests/smoke_server.py
```

Prueba E2E opcional con Chromium:

```bash
pip install -r tests/requirements-e2e.txt
python -m playwright install chromium
python tests/e2e_frontend.py
```

Comprobaciones básicas de sintaxis:

```bash
node --check app.js
python -m py_compile server/xtts_server.py
python -m json.tool manifest.json
```

## Limitaciones verificables

- El modo demo solo valida la tubería.
- La clonación real depende de la instalación de Coqui TTS, PyTorch, el modelo y la compatibilidad del equipo.
- El proyecto no incluye el modelo ni muestras de voz.
- No se han incluido métricas MOS, PESQ, STOI o similitud de hablante sin mediciones reales.
- La cancelación del navegador puede detener la espera del cliente, pero no garantiza interrumpir inmediatamente un cálculo ya iniciado dentro del modelo.

## Uso responsable

Solo debe utilizarse con voz propia o con autorización expresa y verificable. Quedan fuera del uso previsto la suplantación, el fraude, el acoso, la desinformación y cualquier uso que vulnere derechos de terceros. Consulta `LICENSE_NOTICE.md`.
