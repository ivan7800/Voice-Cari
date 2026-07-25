# Aviso de uso responsable, privacidad y licencias

Voice Cari está diseñado para narración, accesibilidad, audiolibros, pruebas técnicas y preservación de voces propias o expresamente autorizadas.

## Uso prohibido

No debe utilizarse para:

- Suplantar a una persona o atribuirle declaraciones falsas.
- Clonar voces sin consentimiento explícito y verificable.
- Fraude, llamadas engañosas, extorsión, acoso o desinformación.
- Ocultar que un audio es sintético cuando pueda inducir a error.
- Tratar voces de menores sin autorización válida de sus responsables y sin una finalidad legítima y segura.
- Vulnerar derechos de privacidad, protección de datos, propiedad intelectual o imagen.

## Consentimiento

La interfaz exige confirmaciones de uso autorizado. Esas confirmaciones ayudan a prevenir errores, pero no sustituyen un contrato, una autorización válida ni las obligaciones legales del usuario.

Los bancos importados deben volver a autorizarse en el dispositivo receptor. Los metadatos de un archivo no se consideran prueba suficiente por sí solos.

## Privacidad

- El frontend almacena texto, perfiles y proyectos en `localStorage`.
- Las muestras del banco se guardan en IndexedDB.
- El servidor procesa referencias y salidas en carpetas temporales locales que se eliminan al terminar la petición.
- No se incluyen servicios de telemetría ni claves API en el frontend.
- Una configuración modificada para escuchar fuera de `127.0.0.1` puede exponer el motor y requiere protección adicional.

## Modelo y dependencias

El motor real usa componentes de terceros, incluido XTTS-v2 mediante `coqui-tts`. Antes de descargar o utilizar el modelo, revisa sus términos y confirma que permiten tu caso de uso. Voice Cari no acepta esos términos automáticamente.

Las licencias y restricciones de modelos o dependencias pueden ser distintas de la licencia del código de esta aplicación. El usuario es responsable de verificarlas antes de un uso comercial o de distribución.

## Procedencia sintética

La aplicación añade metadatos de procedencia a los WAV generados. Es una ayuda técnica, no una marca de agua resistente: los metadatos pueden eliminarse al convertir o editar el archivo. Mantén además una identificación visible o audible cuando sea necesario.

Este documento es informativo y no constituye asesoramiento legal.
