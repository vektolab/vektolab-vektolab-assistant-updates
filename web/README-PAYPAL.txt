VEKTOLAB + PAYPAL — VERSION DE PRUEBA

Qué cambia:
- Patreon sigue funcionando igual.
- Al pulsar Descargar STL, si el usuario no tiene Patreon aparece una segunda opción:
  "Comprar esta descarga" con PayPal.
- El precio está definido en el Worker, no en el navegador.
- Precio inicial: USD 2.00 por descarga.

IMPORTANTE:
Esta versión necesita un Cloudflare Worker adicional: paypal-worker.js
No pongas el Client Secret de PayPal dentro de HTML/JS público.

CONFIGURACIÓN DEL WORKER
1. Crea una app en PayPal Developer.
2. Para pruebas usa Sandbox y crea Client ID + Secret.
3. Crea un nuevo Cloudflare Worker y pega paypal-worker.js.
4. Configura estas variables/secrets:
   PAYPAL_CLIENT_ID = tu Client ID
   PAYPAL_CLIENT_SECRET = tu Client Secret (SECRET)
   PAYPAL_ENV = sandbox
   PAYPAL_PRICE = 2.00
5. Publica el Worker, por ejemplo:
   https://vektolab-paypal.vektocreativeteam.workers.dev
6. Abre patreon-gate.js y cambia PAYPAL_BASE por la URL real de ese Worker.

PARA PASAR A PRODUCCIÓN
- Cambia PAYPAL_ENV a live.
- Usa las credenciales LIVE de PayPal.
- Comprueba primero varias compras en Sandbox.

NOTA DE SEGURIDAD
Los generadores actuales generan el STL en el navegador. Por eso la protección de Patreon/PayPal es un gate de descarga del lado cliente. Un usuario técnicamente avanzado podría modificar el JavaScript y saltarse el botón. Para una protección fuerte habría que mover la generación/entrega del STL al servidor. Esta versión está pensada para añadir PayPal de forma práctica sin rehacer los generadores.
