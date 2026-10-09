# Voice Cari 4.1 · Recuperación y MP3 integrado

- Los fragmentos terminados se guardan en IndexedDB (`voiceCariAudiobooks`, almacén `jobs`); al reabrir, escribe el **mismo texto**, selecciona la misma muestra y el mismo idioma, y pulsa **Generar capítulo completo** para recuperar. La pausa puede cambiarse sin invalidar los fragmentos.
- **Descartar progreso pendiente** borra la copia local; el botón de cancelación detiene la petición activa y conserva los fragmentos completados.
- El WAV resultante está disponible para escucha y descarga. El botón MP3 envía el WAV al **servidor local** (`POST /convert-mp3`), que usa **FFmpeg instalado en PATH** para convertir a 192 kb/s; sin FFmpeg el servidor devuelve 503.
- Solo se conserva un trabajo pendiente. Finalizar y unir un capítulo elimina su checkpoint; es imprescindible descargar el capítulo final antes de cerrar la pestaña.
- Los checkpoints pueden ocupar decenas de MB. El navegador puede borrarlos al liberar almacenamiento; no sustituyen copias de seguridad.
- Las peticiones se hacen en secuencia, no en segundo plano. Al volver a abrir hay que pulsar Generar; no continúa solo.
- GitHub Pages no ejecuta el servidor Python. La clonación y exportación MP3 requieren el servidor local.
- No se ha validado calidad XTTS-v2 con un modelo real: el modo demo no genera habla real.
