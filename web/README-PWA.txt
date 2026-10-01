VEKTOLAB PWA - primera versión

Incluye:
- manifest.webmanifest
- sw.js (caché offline básica + base para Web Push)
- icon-192.png / icon-512.png
- botón de instalación en index.html cuando el navegador ofrece la instalación

IMPORTANTE:
1. Debe publicarse por HTTPS (Cloudflare Pages/Workers, tu hosting, etc.).
2. El service worker solo controla la carpeta donde está publicado.
3. Las notificaciones push todavía NO están conectadas a Firebase: sw.js ya tiene el receptor para Web Push, pero falta configurar FCM/VAPID y un servidor o panel de envío.
4. La caché usa network-first para HTML, para que las actualizaciones de tu web se publiquen sin quedar atrapadas en una versión vieja.

Prueba rápida:
- Sube toda la carpeta vektolab al hosting.
- Abre la web por HTTPS.
- Chrome/Edge deberían detectar que es instalable y mostrar el botón "Instalar app" cuando corresponda.
