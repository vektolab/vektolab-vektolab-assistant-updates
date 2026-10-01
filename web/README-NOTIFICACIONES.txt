VEKTOLAB — PANEL DE ADMINISTRACIÓN + FCM

Esta versión agrega:
- admin.html: panel para enviar notificaciones a todos los dispositivos registrados.
- worker.js: backend para Cloudflare Workers + Firebase Cloud Messaging HTTP v1.
- index.html: registra automáticamente cada token FCM en /api/register-token.

IMPORTANTE: el panel NO puede enviar FCM directamente desde el navegador. Las credenciales privadas de Firebase deben permanecer en un servidor. Por eso se incluye worker.js.

CONFIGURACIÓN EN CLOUDFLARE

1) Crea un Cloudflare Worker para Vektolab y usa worker.js como código del Worker.
2) Crea una KV Namespace y llámala, por ejemplo, VEKTOLAB_TOKENS.
3) En Bindings del Worker crea:
   - Variable: TOKENS -> selecciona la KV namespace VEKTOLAB_TOKENS
4) Configura estas variables/secrets del Worker:
   FIREBASE_PROJECT_ID = vektolab-c9ac6
   FIREBASE_CLIENT_EMAIL = el campo client_email del JSON de la cuenta de servicio de Firebase
   FIREBASE_PRIVATE_KEY = el campo private_key del JSON de la cuenta de servicio (incluye BEGIN/END PRIVATE KEY)
   ADMIN_KEY = una contraseña larga que solo tú conozcas

5) Para obtener la cuenta de servicio:
   Firebase Console -> Configuración del proyecto -> Cuentas de servicio -> Generar nueva clave privada.
   Descarga el JSON y copia SOLO los campos client_email y private_key a los secrets de Cloudflare. NO publiques el JSON ni la private_key en la web.

6) Configura el Worker para que atienda estas rutas del mismo dominio:
   /api/register-token
   /api/send-notification
   Si tu hosting de Vektolab usa Cloudflare Pages, puedes enrutar /api/* al Worker mediante Pages Functions o un Worker con Routes. Lo importante es que index.html pueda llamar a /api/register-token en el mismo dominio.

7) Panel: https://TU-DOMINIO/admin.html
   Escribe la ADMIN_KEY, título, mensaje y pulsa “Enviar a todos”.

FLUJO
Usuario -> acepta notificaciones -> FCM entrega token -> /api/register-token -> KV de Cloudflare.
Administrador -> admin.html -> /api/send-notification -> Worker -> FCM HTTP v1 -> todos los tokens.

SEGURIDAD
- Nunca pongas FIREBASE_PRIVATE_KEY ni ADMIN_KEY dentro de HTML/JS.
- La API key de Firebase web y la VAPID pública sí pueden estar en el frontend.
- Si un token deja de ser válido, el Worker lo elimina de KV automáticamente.


DIAGNÓSTICO V4
- Se registra un único Service Worker y se le pasa explícitamente a Firebase Messaging.
- Se comprueba HTTPS, soporte del navegador y permisos antes de pedir el token.
- Los errores de Firebase ahora muestran su código real en lugar de asumir que es un problema de HTTPS.
- La prueba de notificación local fue separada del proceso de activación para no convertir un fallo visual en un falso error de registro.


NOTA PARA CLOUDFLARE PAGES

admin.html es solamente la interfaz. Para que “Enviar a todos” funcione, el Worker debe estar conectado a las rutas /api/* del mismo dominio de Vektolab y tener la KV TOKENS y los secrets configurados. No pongas la private_key ni ADMIN_KEY en los archivos públicos.
