VEKTOLAB — Ofertas, cupones, multi-foto y categorías
====================================================

Panel (admin-tienda.html)
- Pestaña Ofertas: % 0–100, alcance categorías / subcategorías / productos / todo, fechas opcionales.
- Pestaña Cupones: código, %, usos totales, usos por persona, monto mínimo USD, fechas, alcance.
- Pestaña Categorías: crear categorías y subcategorías persistentes (también aparecen en el alta de producto).
- Nuevo producto: varias fotos (la primera es portada).
- En producto.html: campo de cupón debajo del botón de compra (STL y generadores).

API (vektolab-api Worker) — redesplegar si falta soporte de cupones
- Tablas: taxonomy, offers, coupons, coupon_redemptions + columna images_json.
- GET /api/price?product=ID&coupon=CODE&person=KEY → precio final.
- GET /api/taxonomy, GET /api/offers
- Admin CRUD: /api/admin/taxonomy|offers|coupons

PayPal (paypal-worker.js) — redesplegar
- Variable: VEKTOLAB_API_URL = URL del API worker (sin barra final).
- create-order consulta /api/price y cobra el monto con oferta/cupón.
- Tras capture, registra el uso del cupón.

Si al guardar un cupón aparece "Failed to fetch"
-------------------------------------------------
1) Confirmá que entraste con la ADMIN_KEY correcta (la del secret del Worker).
2) Confirmá que store-config.js apunta a:
     https://vektolab-api.vektocreativeteam.workers.dev
3) Creá las tablas en D1 si aún no existen:

Cloudflare Dashboard → Workers & Pages → D1 → base vektolab-db → Console
Pegá y ejecutá:

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  percent REAL NOT NULL DEFAULT 0,
  max_uses_total INTEGER NOT NULL DEFAULT 0,
  max_uses_per_person INTEGER NOT NULL DEFAULT 1,
  min_cents INTEGER NOT NULL DEFAULT 0,
  scope_type TEXT NOT NULL DEFAULT 'all',
  scope_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL,
  code TEXT,
  person_key TEXT,
  product_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percent REAL NOT NULL DEFAULT 0,
  scope_type TEXT NOT NULL DEFAULT 'all',
  scope_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS taxonomy (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  parent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

4) Si el Worker de la API es una versión vieja (sin rutas /api/admin/coupons),
   redesplegá el código actual del Worker que incluye cupones y ofertas.
5) Recargá admin-tienda.html con Ctrl+F5 y volvé a guardar el cupón
   con alcance "Todo el catálogo" para probar.

Despliegue
1. Publicar el Worker de la API (con rutas de cupones/ofertas).
2. Publicar paypal-worker.js y setear VEKTOLAB_API_URL.
3. Subir admin-tienda.html (y el resto del sitio) a Pages.
4. Crear las tablas D1 de arriba si no existen.


Cambio de panel de cupones
--------------------------
- La pestaña Cupones muestra debajo del formulario solamente los cupones habilitados y vigentes.
- Cada cupón muestra código, descuento, usos, mínimo, alcance y fechas.
- Se puede editar o eliminar directamente desde esa lista.
- Los cupones inactivos, futuros o vencidos no aparecen en "Cupones activos".
- El panel intenta primero /api/admin/discount-codes para evitar bloqueadores que interfieren con URLs que contienen "coupon".
