// Vektolab PayPal Worker
// Secrets/vars:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox|live)
// Bindings (recomendado, evita error 1042):
//   VEKTOLAB_API  = Service binding → worker "vektolab-api"
// Alternativa (URL pública, requiere flag global_fetch_strictly_public):
//   VEKTOLAB_API_URL = https://vektolab-api.vektocreativeteam.workers.dev
// El monto cobrado siempre sale de /api/price (precio + ofertas + cupón).

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type, Authorization',
  'access-control-allow-methods': 'POST, OPTIONS, GET',
};
const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS }
});
const apiBase = (env) => String(env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
  ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
async function paypalToken(env) {
  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const r = await fetch(apiBase(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || 'PayPal authentication failed');
  return d.access_token;
}

/** Llama a la API de la tienda.
 * Preferencia:
 *  1) Service Binding env.VEKTOLAB_API (evita error 1042 worker→worker)
 *  2) URL pública env.VEKTOLAB_API_URL (requiere flag global_fetch_strictly_public)
 */
async function apiFetch(env, pathAndQuery, init) {
  const binding = env.VEKTOLAB_API;
  // Service binding es un objeto con .fetch(); una variable de texto es string
  if (binding && typeof binding === 'object' && typeof binding.fetch === 'function') {
    const url = 'https://vektolab-api.internal' + pathAndQuery;
    return binding.fetch(url, init);
  }
  const api = String(env.VEKTOLAB_API_URL || (typeof binding === 'string' ? binding : '') || '').replace(/\/$/, '');
  if (!api) {
    throw new Error(
      'Configuración incompleta: falta Service Binding VEKTOLAB_API. ' +
      'En Cloudflare → vektolab-paypal → Settings → Variables → Add binding → Service binding: ' +
      'Variable name = VEKTOLAB_API, Service = vektolab-api (el nombre del worker de la API)'
    );
  }
  return fetch(api + pathAndQuery, init);
}

/** Resuelve el monto final (oferta + cupón) desde la API de la tienda.
 * IMPORTANTE: este monto es la única fuente de verdad del precio a cobrar. */
async function resolveAmount(env, product, coupon, person) {
  if (!product) {
    throw new Error('Falta el producto para calcular el precio.');
  }

  const qs = new URLSearchParams({ product });
  if (coupon) qs.set('coupon', coupon);
  if (person) qs.set('person', person);

  const path = '/api/price?' + qs.toString();
  let r, d, rawText = '';
  try {
    r = await apiFetch(env, path, { headers: { Accept: 'application/json' } });
    rawText = await r.text();
    try { d = JSON.parse(rawText); } catch (_) { d = {}; }
  } catch (e) {
    throw new Error(
      'No se pudo consultar el precio del producto (API no respondió: ' +
      (e && e.message ? e.message : 'network') + '). path=' + path
    );
  }

  let amountVal = d && d.amount != null ? d.amount : null;
  if (amountVal == null && d && d.price_cents != null) {
    amountVal = (Number(d.price_cents) / 100).toFixed(2);
  }

  if (!r.ok || amountVal == null) {
    const detail = (d && (d.error || d.message)) ||
      ('HTTP ' + r.status + (rawText ? ': ' + String(rawText).slice(0, 120) : ''));
    throw new Error('No se pudo calcular el precio del producto [' + product + ']: ' + detail);
  }

  const amount = String(Number(amountVal).toFixed(2));
  if (!(Number(amount) >= 0) || Number.isNaN(Number(amount))) {
    throw new Error('El precio calculado por la API no es válido: ' + amount);
  }
  return { amount, pricing: d };
}

async function createOrder(env, product, amount) {
  const token = await paypalToken(env);
  const price = String(Number(amount).toFixed(2));
  const r = await fetch(apiBase(env) + '/v2/checkout/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': crypto.randomUUID()
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: product,
        description: `Vektolab STL - ${product}`,
        custom_id: product,
        amount: { currency_code: 'USD', value: price }
      }]
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'PayPal could not create the order');
  return d;
}

async function captureOrder(env, orderId) {
  const token = await paypalToken(env);
  const r = await fetch(apiBase(env) + `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'PayPal could not capture the order');
  return d;
}

async function verifyOrder(env, orderId, product, expectedAmount) {
  const token = await paypalToken(env);
  const r = await fetch(apiBase(env) + `/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Could not verify PayPal order');
  const unit = d.purchase_units?.[0];
  const ref = unit?.reference_id || unit?.custom_id;
  const amount = unit?.amount?.value;
  if (ref !== product) throw new Error('Order does not match the requested download');
  if (expectedAmount && amount && Number(amount).toFixed(2) !== Number(expectedAmount).toFixed(2)) {
    throw new Error('Order amount does not match the expected price');
  }
  return d;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === '/api/paypal/client-id' && request.method === 'GET') {
        return json({
          clientId: String(env.PAYPAL_CLIENT_ID || ''),
          env: String(env.PAYPAL_ENV || 'sandbox').toLowerCase()
        });
      }
      // Diagnóstico: ¿está bien configurada la API de precios?
      if (url.pathname === '/api/paypal/debug-price' && request.method === 'GET') {
        const product = url.searchParams.get('product') || 'producto-b50bb3f2-2237-4a6e-a211-416be523806e';
        const hasBinding = !!(env.VEKTOLAB_API && typeof env.VEKTOLAB_API === 'object' && typeof env.VEKTOLAB_API.fetch === 'function');
        const apiUrl = String(env.VEKTOLAB_API_URL || '').replace(/\/$/, '');
        if (!hasBinding && !apiUrl) {
          return json({
            ok: false,
            error: 'Falta Service Binding VEKTOLAB_API',
            hint: 'Settings → Variables → Add → Service binding: name=VEKTOLAB_API, service=vektolab-api'
          }, 500);
        }
        try {
          const resolved = await resolveAmount(env, product, '', '');
          return json({
            ok: true,
            via: hasBinding ? 'service-binding' : 'public-url',
            product,
            amount: resolved.amount,
            pricing: resolved.pricing
          });
        } catch (e) {
          return json({
            ok: false,
            via: hasBinding ? 'service-binding' : 'public-url',
            product,
            error: e.message || String(e)
          }, 500);
        }
      }
      if (url.pathname === '/api/paypal/create-order' && request.method === 'POST') {
        const body = await request.json();
        const product = String(body.product || 'vektolab').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'vektolab';
        const coupon = String(body.coupon || '').trim();
        const person = String(body.person || body.person_key || '').trim();
        const resolved = await resolveAmount(env, product, coupon, person);
        const order = await createOrder(env, product, resolved.amount);
        return json({ id: order.id, amount: resolved.amount, pricing: resolved.pricing });
      }
      if (url.pathname === '/api/paypal/capture-order' && request.method === 'POST') {
        const body = await request.json();
        const orderId = String(body.orderId || '');
        const product = String(body.product || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
        const coupon = String(body.coupon || '').trim();
        const person = String(body.person || body.person_key || '').trim();
        if (!orderId || !product) return json({ error: 'Missing order information' }, 400);
        const resolved = await resolveAmount(env, product, coupon, person);
        const verified = await verifyOrder(env, orderId, product, resolved.amount);
        if (verified.status !== 'APPROVED' && verified.status !== 'COMPLETED') {
          return json({ error: 'Payment is not approved' }, 402);
        }
        let captured = verified;
        if (verified.status === 'APPROVED') captured = await captureOrder(env, orderId);
        if (captured.status !== 'COMPLETED') return json({ error: 'Payment was not completed' }, 402);
        // Registrar uso de cupón si aplica
        if (coupon) {
          try {
            await apiFetch(env, '/api/coupons/redeem', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: coupon, person_key: person || 'paypal', product_id: product })
            });
          } catch (e) {}
        }
        const payload = `${product}|${orderId}|${Date.now()}`;
        const sig = await hmac(env.PAYPAL_CLIENT_SECRET, payload);
        return json({ approved: true, downloadToken: btoa(payload + '.' + sig), amount: resolved.amount });
      }
      return new Response('Vektolab PayPal Worker activo', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS }
      });
    } catch (e) {
      return json({ error: e.message || 'Internal error' }, 500);
    }
  }
};
