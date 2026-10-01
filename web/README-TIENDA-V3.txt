Vektolab · Tienda integrada V3

ESTADO
- Tu index.html original se conserva.
- Patreon, PayPal, notificaciones, PWA y generadores originales se conservan.
- tienda.html usa https://vektolab-api.vektocreativeteam.workers.dev
- D1 continúa siendo vektolab-db.
- admin.html original NO se reemplaza.
- admin-tienda.html es el nuevo panel de productos.

PASO PARA EL WORKER
1. En Cloudflare abre Workers & Pages > vektolab-api.
2. Edit code.
3. Copia el contenido de vektolab-api-worker-CORS.js de este ZIP y reemplaza el código del Worker.
4. Deploy.
5. Conserva el binding D1 con Variable name DB -> vektolab-db.
6. Conserva el secret ADMIN_KEY que ya configuraste.

PRUEBA
- Abre /api/products y comprueba que aparece el producto de prueba.
- Abre admin-tienda.html desde la web y usa tu ADMIN_KEY.
- Crea un producto de prueba. Luego comprueba tienda.html.

IMPORTANTE
La V3 todavía usa URL/ruta para imagen y STL. No hemos añadido subida de archivos a R2 todavía. Esto evita mezclar almacenamiento de archivos con D1 en esta etapa.
