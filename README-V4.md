# Voice Cari 4.0 · Audiolibros

## Nuevo
- Generación secuencial por fragmentos de un capítulo con una sola muestra vocal autorizada.
- WAV PCM16 mono unificado a 24 kHz y pausas configurables.
- Progreso, cancelación de peticiones y descarga explícita.
- MP3 local opcional mediante `server/CONVERTIR_MP3.bat` con FFmpeg instalado.

## Uso
1. Arranca el motor siguiendo `server/README-SERVIDOR.md` y entra en `http://127.0.0.1:8020`.
2. Importa una muestra propia/autorizada en el banco.
3. Escribe un capítulo en Studio, luego entra en Clonar.
4. Elige la muestra, idioma y confirma el consentimiento.
5. En Producción de audiolibros, pulsa «Generar capítulo completo».
6. Escucha y descarga el WAV. Para MP3, arrastra el WAV sobre `server/CONVERTIR_MP3.bat`.

## Límites y advertencias
- La producción de capítulos requiere el motor local; GitHub Pages por sí solo no sintetiza voces.
- Cada fragmento se limita a 1.500 caracteres; 100 fragmentos máximo y 100 MB de WAV final.
- El progreso no implica trabajo en segundo plano: cerrar la pestaña pierde el audio que no se haya descargado.
- No se garantiza compatibilidad con XTTS real ni calidad de voz sin una prueba con el modelo instalado.
- La división automática respeta pausas aproximadas; requiere revisión de pronunciaciones y prosodia.
- La conversión MP3 exige FFmpeg local; no se instala ni distribuye automáticamente.
- Los datos del usuario no se suben a GitHub.
