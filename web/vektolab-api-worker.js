// Se mantiene fuera del handler para que sobreviva entre requests que reutilizan
// el mismo isolate de Worker: así el ALTER TABLE de migración corre una sola vez
// (la primera petición fría) y no en cada visita a la tienda.
let schemaEnsured = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Aceptamos el binding del bucket R2 sin importar cómo lo hayas nombrado
    // en Cloudflare (algunos proyectos lo llaman "R2", otros "FILES").
    const R2 = env.R2 || env.FILES;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json; charset=UTF-8" }
    });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const SELECT_COLS = `id,name,description,price_cents,image,images_json,stl_path,category,subcategory,created_at,
      product_type,generator_url,tags,keywords,size_model,layer_height,material,
      license,pdf_url,model_3d_url,file_size,patreon_exclusive,materiales_json`;

    async function ensureSchema() {
      if (schemaEnsured) return;
      const alters = [
        `ALTER TABLE products ADD COLUMN product_type TEXT DEFAULT 'stl'`,
        `ALTER TABLE products ADD COLUMN generator_url TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN tags TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN keywords TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN size_model TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN layer_height TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN material TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN license TEXT DEFAULT 'personal'`,
        `ALTER TABLE products ADD COLUMN pdf_url TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN model_3d_url TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN file_size TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN patreon_exclusive INTEGER DEFAULT 0`,
        `ALTER TABLE products ADD COLUMN materiales_json TEXT DEFAULT '[]'`,
        `ALTER TABLE products ADD COLUMN subcategory TEXT DEFAULT ''`,
        `ALTER TABLE products ADD COLUMN images_json TEXT DEFAULT '[]'`,
        `ALTER TABLE coupons ADD COLUMN created_at TEXT`,
        `ALTER TABLE offers ADD COLUMN created_at TEXT`
      ];
      await Promise.all(alters.map(sql => env.DB.prepare(sql).run().catch(() => {})));
      const creates = [
        `CREATE TABLE IF NOT EXISTS taxonomy (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
          parent TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
        `CREATE TABLE IF NOT EXISTS offers (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, percent REAL NOT NULL DEFAULT 0,
          scope_type TEXT NOT NULL DEFAULT 'categories', scope_json TEXT DEFAULT '[]',
          active INTEGER DEFAULT 1, starts_at TEXT DEFAULT '', ends_at TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')))`,
        `CREATE TABLE IF NOT EXISTS coupons (
          id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, percent REAL NOT NULL DEFAULT 0,
          max_uses_total INTEGER DEFAULT 0, max_uses_per_person INTEGER DEFAULT 1,
          used_count INTEGER DEFAULT 0, min_cents INTEGER DEFAULT 0,
          scope_type TEXT NOT NULL DEFAULT 'all', scope_json TEXT DEFAULT '[]',
          active INTEGER DEFAULT 1, starts_at TEXT DEFAULT '', ends_at TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')))`,
        `CREATE TABLE IF NOT EXISTS coupon_redemptions (
          id TEXT PRIMARY KEY, code TEXT NOT NULL, person_key TEXT NOT NULL,
          product_id TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
        `CREATE TABLE IF NOT EXISTS used_download_tokens (
          token_hash TEXT PRIMARY KEY, used_at TEXT DEFAULT (datetime('now')))`
      ];
      await Promise.all(creates.map(sql => env.DB.prepare(sql).run().catch(() => {})));
      await Promise.all([
        env.DB.prepare("UPDATE coupons SET created_at = datetime('now') WHERE created_at IS NULL").run().catch(() => {}),
        env.DB.prepare("UPDATE offers SET created_at = datetime('now') WHERE created_at IS NULL").run().catch(() => {})
      ]);
      schemaEnsured = true;
    }

    // Firma/verificación compatible con el downloadToken que emite paypal-worker.js
    function b64url(bytes) {
      let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    async function hmacSha256(secret, text) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
    }
    async function sha256Hex(text) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function parseJsonArr(v) {
      try {
        const a = JSON.parse(v || "[]");
        return Array.isArray(a) ? a : [];
      } catch (e) { return []; }
    }

    function inDateRange(starts, ends, nowIso) {
      const n = nowIso || new Date().toISOString();
      if (starts && String(starts).trim() && n < String(starts)) return false;
      if (ends && String(ends).trim() && n > String(ends)) return false;
      return true;
    }

    function scopeMatches(scopeType, scopeJson, product) {
      const items = parseJsonArr(scopeJson).map(String);
      if (scopeType === "all" || !items.length && scopeType === "all") return true;
      if (scopeType === "all") return true;
      const cat = String(product.category || "");
      const sub = String(product.subcategory || "");
      const pid = String(product.id || "");
      if (scopeType === "categories") return items.some(x => x.toLowerCase() === cat.toLowerCase());
      if (scopeType === "subcategories") return items.some(x => x.toLowerCase() === sub.toLowerCase());
      if (scopeType === "products") return items.includes(pid);
      return false;
    }

    async function computePrice(product, couponCode, personKey) {
      const original = Math.max(0, Number(product.price_cents) || 0);
      let offerPercent = 0;
      let offerId = null;
      try {
        const offers = await env.DB.prepare("SELECT * FROM offers WHERE active=1").all();
        const now = new Date().toISOString();
        for (const o of (offers.results || [])) {
          if (!inDateRange(o.starts_at, o.ends_at, now)) continue;
          if (!scopeMatches(o.scope_type, o.scope_json, product)) continue;
          const p = Math.min(100, Math.max(0, Number(o.percent) || 0));
          if (p > offerPercent) { offerPercent = p; offerId = o.id; }
        }
      } catch (e) {}

      let afterOffer = Math.round(original * (100 - offerPercent) / 100);
      let couponPercent = 0;
      let couponId = null;
      let couponError = null;
      if (couponCode) {
        try {
          const c = await env.DB.prepare("SELECT * FROM coupons WHERE lower(code)=lower(?) LIMIT 1")
            .bind(String(couponCode).trim()).first();
          if (!c || !c.active) couponError = "Cupón inválido o inactivo";
          else if (!inDateRange(c.starts_at, c.ends_at)) couponError = "Cupón fuera de fecha";
          else if (Number(c.max_uses_total) > 0 && Number(c.used_count) >= Number(c.max_uses_total))
            couponError = "Cupón agotado";
          else if (Number(c.min_cents) > 0 && afterOffer < Number(c.min_cents))
            couponError = "No alcanza el monto mínimo del cupón";
          else if (!scopeMatches(c.scope_type, c.scope_json, product))
            couponError = "Cupón no aplica a este producto";
          else {
            if (personKey && Number(c.max_uses_per_person) > 0) {
              const used = await env.DB.prepare(
                "SELECT COUNT(*) AS n FROM coupon_redemptions WHERE lower(code)=lower(?) AND person_key=?"
              ).bind(c.code, String(personKey)).first();
              if (used && Number(used.n) >= Number(c.max_uses_per_person))
                couponError = "Ya usaste este cupón el máximo de veces";
            }
            if (!couponError) {
              couponPercent = Math.min(100, Math.max(0, Number(c.percent) || 0));
              couponId = c.id;
            }
          }
        } catch (e) { couponError = "No se pudo validar el cupón"; }
      }
      const finalCents = Math.round(afterOffer * (100 - couponPercent) / 100);
      return {
        original_cents: original,
        price_cents: finalCents,
        offer_percent: offerPercent,
        offer_id: offerId,
        coupon_percent: couponPercent,
        coupon_id: couponId,
        coupon_error: couponError,
        amount: (finalCents / 100).toFixed(2)
      };
    }

    function authOk(request) {
      const auth = request.headers.get("Authorization") || "";
      return env.ADMIN_KEY && auth === "Bearer " + env.ADMIN_KEY;
    }

    // ---------- Health ----------
    if (url.pathname === "/api/health") {
      try {
        await ensureSchema();
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ success: true, database: result, r2: !!R2 });
      } catch (e) {
        return json({ success: false, error: String(e) }, 500);
      }
    }

    // ---------- Public products ----------
    // El link real del archivo (stl_path) NUNCA se manda al público: se saca
    // del JSON y se reemplaza por un booleano. El archivo solo se sirve por
    // /api/download, tras verificar pago (PayPal) o membresía (Patreon).
    function stripFileUrl(p) {
      const { stl_path, ...rest } = p;
      rest.has_file = !!(stl_path && String(stl_path).trim());
      return rest;
    }
    if (url.pathname === "/api/products" && request.method === "GET") {
      try {
        await ensureSchema();
        const result = await env.DB.prepare(
          `SELECT ${SELECT_COLS} FROM products ORDER BY created_at DESC`
        ).all();
        return json({ success: true, products: (result.results || []).map(stripFileUrl) });
      } catch (e) {
        try {
          const result = await env.DB.prepare(
            `SELECT id,name,description,price_cents,image,stl_path,category,created_at FROM products ORDER BY created_at DESC`
          ).all();
          return json({ success: true, products: (result.results || []).map(stripFileUrl) });
        } catch (e2) {
          return json({ success: false, error: String(e2) }, 500);
        }
      }
    }

    // ---------- Protected download ----------
    // Exige UNA de estas dos pruebas, verificadas del lado del servidor:
    //  a) Authorization: Bearer <sesión de Patreon>  -> se valida en vivo contra AUTH_BASE/check
    //  b) ?dtoken=<downloadToken firmado por paypal-worker.js tras un pago capturado>
    //     -> se valida la firma, que sea para ESTE producto, que no tenga más
    //        de 30 minutos, y que no se haya usado antes (evita compartir el link).
    if (url.pathname === "/api/download" && request.method === "GET") {
      try {
        await ensureSchema();
        const productId = url.searchParams.get("product") || url.searchParams.get("id") || "";
        if (!productId) return json({ success: false, error: "product requerido" }, 400);
        const product = await env.DB.prepare("SELECT id, name, stl_path FROM products WHERE id=?").bind(productId).first();
        if (!product || !product.stl_path) return json({ success: false, error: "Archivo no disponible" }, 404);

        let authorized = false;

        // a) Patreon
        const auth = request.headers.get("Authorization") || "";
        const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (bearer && env.AUTH_BASE) {
          try {
            const r = await fetch(String(env.AUTH_BASE).replace(/\/$/, "") + "/check", {
              headers: { Authorization: "Bearer " + bearer },
              cache: "no-store"
            });
            if (r.ok) {
              const d = await r.json().catch(() => ({}));
              if (d && d.active === true) authorized = true;
            }
          } catch (e) {}
        }

        // b) PayPal (token de un solo uso)
        if (!authorized) {
          const dtoken = url.searchParams.get("dtoken") || "";
          if (dtoken && env.PAYPAL_CLIENT_SECRET) {
            try {
              const decoded = atob(dtoken);
              const dot = decoded.lastIndexOf(".");
              const payload = decoded.slice(0, dot);
              const sig = decoded.slice(dot + 1);
              const [prod, , ts] = payload.split("|");
              const expected = await hmacSha256(env.PAYPAL_CLIENT_SECRET, payload);
              const ageMs = Date.now() - Number(ts || 0);
              if (sig === expected && prod === productId && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 30 * 60 * 1000) {
                const tokenHash = await sha256Hex(dtoken);
                const already = await env.DB.prepare("SELECT 1 FROM used_download_tokens WHERE token_hash=?").bind(tokenHash).first();
                if (!already) {
                  await env.DB.prepare("INSERT INTO used_download_tokens (token_hash) VALUES (?)").bind(tokenHash).run().catch(() => {});
                  authorized = true;
                }
              }
            } catch (e) {}
          }
        }

        if (!authorized) return json({ success: false, error: "No autorizado" }, 401);
        if (!R2) return json({ success: false, error: "R2 no configurado" }, 500);

        // Resolver la key de R2 a partir de stl_path (soporta ambos formatos
        // con los que /api/admin/upload puede haberlo guardado).
        let key = String(product.stl_path);
        const filesMarker = "/api/files/";
        if (key.includes(filesMarker)) {
          key = decodeURIComponent(key.split(filesMarker).pop());
        } else if (env.R2_PUBLIC_URL && key.startsWith(String(env.R2_PUBLIC_URL).replace(/\/$/, ""))) {
          key = key.slice(String(env.R2_PUBLIC_URL).replace(/\/$/, "").length + 1);
        }
        if (/^https?:\/\//i.test(key)) {
          return json({ success: false, error: "No se pudo resolver el archivo" }, 500);
        }

        const obj = await R2.get(key);
        if (!obj) return json({ success: false, error: "Archivo no encontrado" }, 404);
        const headers = new Headers(cors);
        headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
        headers.set("Content-Disposition", `attachment; filename="${String(product.name || "modelo").replace(/[^\w\-]+/g, "_")}.stl"`);
        headers.set("Cache-Control", "private, no-store");
        return new Response(obj.body, { status: 200, headers });
      } catch (e) {
        return json({ success: false, error: String(e) }, 500);
      }
    }

    // ---------- Public taxonomy ----------
    if (url.pathname === "/api/taxonomy" && request.method === "GET") {
      try {
        await ensureSchema();
        const result = await env.DB.prepare("SELECT * FROM taxonomy ORDER BY kind, name").all();
        return json({ success: true, items: result.results || [] });
      } catch (e) {
        return json({ success: true, items: [] });
      }
    }

    // ---------- Public active offers ----------
    if (url.pathname === "/api/offers" && request.method === "GET") {
      try {
        await ensureSchema();
        const result = await env.DB.prepare("SELECT * FROM offers WHERE active=1").all();
        const now = new Date().toISOString();
        const items = (result.results || []).filter(o => inDateRange(o.starts_at, o.ends_at, now));
        return json({ success: true, offers: items });
      } catch (e) {
        return json({ success: true, offers: [] });
      }
    }

    // ---------- Public price calculation (ofertas + cupón) ----------
    if (url.pathname === "/api/price" && request.method === "GET") {
      try {
        await ensureSchema();
        const productId = url.searchParams.get("product") || url.searchParams.get("id") || "";
        const coupon = url.searchParams.get("coupon") || "";
        const person = url.searchParams.get("person") || "";
        if (!productId) return json({ success: false, error: "product requerido" }, 400);
        const product = await env.DB.prepare(`SELECT ${SELECT_COLS} FROM products WHERE id=?`).bind(productId).first();
        if (!product) return json({ success: false, error: "Producto no encontrado" }, 404);
        const pricing = await computePrice(product, coupon, person);
        return json({ success: true, product_id: productId, ...pricing });
      } catch (e) {
        return json({ success: false, error: String(e) }, 500);
      }
    }

    // ---------- Redeem coupon (after successful payment) ----------
    if (url.pathname === "/api/coupons/redeem" && request.method === "POST") {
      try {
        await ensureSchema();
        const body = await request.json();
        const code = String(body.code || "").trim();
        const person = String(body.person_key || body.person || "anon").trim() || "anon";
        const productId = String(body.product_id || "");
        if (!code) return json({ success: false, error: "code requerido" }, 400);
        const c = await env.DB.prepare("SELECT * FROM coupons WHERE lower(code)=lower(?)").bind(code).first();
        if (!c) return json({ success: false, error: "Cupón no encontrado" }, 404);
        await env.DB.prepare(
          "INSERT INTO coupon_redemptions (id, code, person_key, product_id) VALUES (?,?,?,?)"
        ).bind("r-" + crypto.randomUUID(), c.code, person, productId).run();
        await env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE id=?").bind(c.id).run();
        return json({ success: true });
      } catch (e) {
        return json({ success: false, error: String(e) }, 500);
      }
    }

    // ---------- Admin upload (image / stl / pdf / 3mf) ----------
    if (url.pathname === "/api/admin/upload" && request.method === "POST") {
      if (!authOk(request)) return json({ success: false, error: "No autorizado" }, 401);
      try {
        if (!R2) {
          return json({
            success: false,
            error: "El bucket de archivos no está configurado en el Worker. Agrega un binding de R2 llamado \"R2\" o \"FILES\" y vuelve a intentar."
          }, 500);
        }
        const form = await request.formData();
        const file = form.get("file");
        const type = String(form.get("type") || "file");
        const product = String(form.get("product") || "general").replace(/[^a-z0-9\-]/gi, "-").slice(0, 40);
        if (!file || typeof file.arrayBuffer !== "function") {
          return json({ success: false, error: "Archivo no recibido" }, 400);
        }
        const original = file.name || "archivo";
        const ext = (original.includes(".") ? original.split(".").pop() : "bin").toLowerCase();
        const allowed = {
          image: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
          stl: ["stl"],
          pdf: ["pdf"],
          model3d: ["3mf", "glb", "gltf"]
        };
        const list = allowed[type] || ["png", "jpg", "jpeg", "webp", "stl", "pdf", "3mf", "glb"];
        if (!list.includes(ext)) {
          return json({ success: false, error: `Tipo de archivo no permitido (.${ext}) para ${type}` }, 400);
        }
        const bytes = await file.arrayBuffer();
        const sizeBytes = bytes.byteLength;
        const key = `${type}/${product}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const contentType = file.type || (
          ext === "png" ? "image/png" :
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
          ext === "webp" ? "image/webp" :
          ext === "pdf" ? "application/pdf" :
          ext === "stl" ? "model/stl" :
          ext === "3mf" ? "model/3mf" :
          "application/octet-stream"
        );
        // Images and 3D previews public; STL/PDF can be public URL for now (STL protection can be layered later)
        await R2.put(key, bytes, {
          httpMetadata: { contentType },
          customMetadata: { original, type, product }
        });
        // Public URL pattern — adjust if you use a custom domain for R2
        const publicBase = env.R2_PUBLIC_URL || "";
        let publicUrl = "";
        if (publicBase) {
          publicUrl = publicBase.replace(/\/$/, "") + "/" + key;
        } else {
          // Fallback: serve via worker proxy
          publicUrl = new URL("/api/files/" + key, url.origin).toString();
        }
        const sizeLabel = sizeBytes > 1024 * 1024
          ? (sizeBytes / (1024 * 1024)).toFixed(1) + " MB"
          : Math.max(1, Math.round(sizeBytes / 1024)) + " KB";
        return json({
          success: true,
          key,
          url: publicUrl,
          type,
          filename: original,
          size_bytes: sizeBytes,
          file_size: sizeLabel
        });
      } catch (e) {
        return json({ success: false, error: String(e) }, 500);
      }
    }

    // ---------- Public file proxy (for R2 objects) ----------
    if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
      try {
        if (!R2) return new Response("R2 no configurado", { status: 500 });
        const key = decodeURIComponent(url.pathname.replace("/api/files/", ""));
        if (!key || key.includes("..")) return new Response("Ruta inválida", { status: 400 });
        const obj = await R2.get(key);
        if (!obj) return new Response("No encontrado", { status: 404 });

        const isStl = /\.stl$/i.test(key);
        const headers = new Headers(cors);
        headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
        if (obj.size) headers.set("Content-Length", String(obj.size));

        if (isStl) {
          // El STL es el archivo pago/protegido: forzamos descarga en vez de
          // dejar que el navegador lo intente previsualizar, y no lo cacheamos.
          headers.set("Content-Disposition", `attachment; filename="${key.split("/").pop()}"`);
          headers.set("Cache-Control", "private, no-store");
        } else {
          headers.set("Cache-Control", "public, max-age=86400");
        }
        return new Response(obj.body, { status: 200, headers });
      } catch (e) {
        return new Response(String(e), { status: 500 });
      }
    }

    // ---------- Admin products ----------
    if (url.pathname.startsWith("/api/admin/")) {
      if (!authOk(request)) return json({ success: false, error: "No autorizado" }, 401);
      await ensureSchema();

      if (url.pathname === "/api/admin/products" && request.method === "GET") {
        try {
          const result = await env.DB.prepare(
            `SELECT ${SELECT_COLS} FROM products ORDER BY created_at DESC`
          ).all();
          return json({ success: true, products: result.results || [] });
        } catch (e) {
          return json({ success: false, error: String(e) }, 500);
        }
      }

      if (url.pathname === "/api/admin/products" && request.method === "POST") {
        try {
          const body = await request.json();
          const id = (body.id || ("producto-" + crypto.randomUUID())).toString();
          if (!body.name) return json({ success: false, error: "El nombre es obligatorio" }, 400);
          const price = Number(body.price_cents);
          if (!Number.isInteger(price) || price < 0) return json({ success: false, error: "price_cents inválido" }, 400);
          const productType = body.product_type === "generator" ? "generator" : "stl";
          const generatorUrl = String(body.generator_url || "").trim();
          if (productType === "generator" && !generatorUrl) {
            return json({ success: false, error: "Para generadores debes indicar la URL del generador" }, 400);
          }

          await env.DB.prepare(
            `INSERT INTO products (
              id,name,description,price_cents,image,images_json,stl_path,category,subcategory,
              product_type,generator_url,tags,keywords,size_model,layer_height,material,
              license,pdf_url,model_3d_url,file_size,patreon_exclusive,materiales_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            id,
            String(body.name),
            String(body.description || ""),
            price,
            String(body.image || ""),
            String(body.images_json || "[]"),
            String(body.stl_path || ""),
            String(body.category || "General"),
            String(body.subcategory || ""),
            productType,
            generatorUrl,
            String(body.tags || ""),
            String(body.keywords || ""),
            String(body.size_model || ""),
            String(body.layer_height || ""),
            String(body.material || ""),
            String(body.license || "personal"),
            String(body.pdf_url || ""),
            String(body.model_3d_url || ""),
            String(body.file_size || ""),
            body.patreon_exclusive ? 1 : 0,
            String(body.materiales_json || "[]")
          ).run();
          return json({ success: true, id });
        } catch (e) {
          return json({ success: false, error: String(e) }, 400);
        }
      }

      const match = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
      if (match && request.method === "PUT") {
        try {
          const pid = decodeURIComponent(match[1]);
          const body = await request.json();
          if (!body.name) return json({ success: false, error: "El nombre es obligatorio" }, 400);
          const price = Number(body.price_cents);
          if (!Number.isInteger(price) || price < 0) return json({ success: false, error: "price_cents inválido" }, 400);
          const productType = body.product_type === "generator" ? "generator" : "stl";
          const generatorUrl = String(body.generator_url || "").trim();
          if (productType === "generator" && !generatorUrl) {
            return json({ success: false, error: "Para generadores debes indicar la URL del generador" }, 400);
          }

          await env.DB.prepare(
            `UPDATE products SET
              name=?, description=?, price_cents=?, image=?, images_json=?, stl_path=?, category=?, subcategory=?,
              product_type=?, generator_url=?, tags=?, keywords=?, size_model=?,
              layer_height=?, material=?, license=?, pdf_url=?, model_3d_url=?, file_size=?,
              patreon_exclusive=?, materiales_json=?
             WHERE id=?`
          ).bind(
            String(body.name),
            String(body.description || ""),
            price,
            String(body.image || ""),
            String(body.images_json || "[]"),
            String(body.stl_path || ""),
            String(body.category || "General"),
            String(body.subcategory || ""),
            productType,
            generatorUrl,
            String(body.tags || ""),
            String(body.keywords || ""),
            String(body.size_model || ""),
            String(body.layer_height || ""),
            String(body.material || ""),
            String(body.license || "personal"),
            String(body.pdf_url || ""),
            String(body.model_3d_url || ""),
            String(body.file_size || ""),
            body.patreon_exclusive ? 1 : 0,
            String(body.materiales_json || "[]"),
            pid
          ).run();
          return json({ success: true, id: pid });
        } catch (e) {
          return json({ success: false, error: String(e) }, 400);
        }
      }

      if (match && request.method === "DELETE") {
        try {
          await env.DB.prepare("DELETE FROM products WHERE id=?").bind(decodeURIComponent(match[1])).run();
          return json({ success: true });
        } catch (e) {
          return json({ success: false, error: String(e) }, 500);
        }
      }

      // ----- Taxonomy -----
      if (url.pathname === "/api/admin/taxonomy" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT * FROM taxonomy ORDER BY kind, name").all();
        return json({ success: true, items: result.results || [] });
      }
      if (url.pathname === "/api/admin/taxonomy" && request.method === "POST") {
        const body = await request.json();
        const kind = body.kind === "subcategory" ? "subcategory" : "category";
        const name = String(body.name || "").trim();
        if (!name) return json({ success: false, error: "Nombre obligatorio" }, 400);
        const id = String(body.id || (kind + "-" + crypto.randomUUID()));
        const parent = kind === "subcategory" ? String(body.parent || "") : "";
        await env.DB.prepare(
          "INSERT INTO taxonomy (id, kind, name, parent) VALUES (?,?,?,?)"
        ).bind(id, kind, name, parent).run();
        return json({ success: true, id, kind, name, parent });
      }
      if (url.pathname.match(/^\/api\/admin\/taxonomy\/[^/]+$/) && request.method === "DELETE") {
        const tid = decodeURIComponent(url.pathname.split("/").pop());
        await env.DB.prepare("DELETE FROM taxonomy WHERE id=?").bind(tid).run();
        return json({ success: true });
      }

      // ----- Offers -----
      if (url.pathname === "/api/admin/offers" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT * FROM offers ORDER BY created_at DESC").all();
        return json({ success: true, offers: result.results || [] });
      }
      if (url.pathname === "/api/admin/offers" && request.method === "POST") {
        const body = await request.json();
        const id = String(body.id || ("offer-" + crypto.randomUUID()));
        const percent = Math.min(100, Math.max(0, Number(body.percent) || 0));
        const scope_type = ["all","categories","subcategories","products"].includes(body.scope_type)
          ? body.scope_type : "categories";
        await env.DB.prepare(
          `INSERT INTO offers (id,name,percent,scope_type,scope_json,active,starts_at,ends_at)
           VALUES (?,?,?,?,?,?,?,?)`
        ).bind(
          id, String(body.name || "Oferta"), percent, scope_type,
          JSON.stringify(body.scope || body.scope_json || []),
          body.active === false || body.active === 0 ? 0 : 1,
          String(body.starts_at || ""), String(body.ends_at || "")
        ).run();
        return json({ success: true, id });
      }
      if (url.pathname.match(/^\/api\/admin\/offers\/[^/]+$/) && request.method === "PUT") {
        const oid = decodeURIComponent(url.pathname.split("/").pop());
        const body = await request.json();
        const percent = Math.min(100, Math.max(0, Number(body.percent) || 0));
        const scope_type = ["all","categories","subcategories","products"].includes(body.scope_type)
          ? body.scope_type : "categories";
        await env.DB.prepare(
          `UPDATE offers SET name=?, percent=?, scope_type=?, scope_json=?, active=?, starts_at=?, ends_at=? WHERE id=?`
        ).bind(
          String(body.name || "Oferta"), percent, scope_type,
          JSON.stringify(body.scope || body.scope_json || []),
          body.active === false || body.active === 0 ? 0 : 1,
          String(body.starts_at || ""), String(body.ends_at || ""), oid
        ).run();
        return json({ success: true, id: oid });
      }
      if (url.pathname.match(/^\/api\/admin\/offers\/[^/]+$/) && request.method === "DELETE") {
        const oid = decodeURIComponent(url.pathname.split("/").pop());
        await env.DB.prepare("DELETE FROM offers WHERE id=?").bind(oid).run();
        return json({ success: true });
      }

      // ----- Coupons (aliases neutrales: catalog?section=codes, codes, promo-codes, discount-codes)
      const isCouponCatalog = url.pathname === "/api/admin/catalog" && url.searchParams.get("section") === "codes";
      const couponListPaths = ["/api/admin/coupons", "/api/admin/discount-codes", "/api/admin/promo-codes", "/api/admin/codes"];
      if ((couponListPaths.includes(url.pathname) || isCouponCatalog) && request.method === "GET") {
        try {
          const result = await env.DB.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all();
          return json({ success: true, coupons: result.results || [] });
        } catch (e) {
          return json({ success: false, error: String(e) }, 500);
        }
      }
      if ((couponListPaths.includes(url.pathname) || isCouponCatalog) && request.method === "POST") {
        try {
          const body = await request.json();
          const code = String(body.code || "").trim().toUpperCase();
          if (!code) return json({ success: false, error: "Código obligatorio" }, 400);
          const id = String(body.id || ("coupon-" + crypto.randomUUID()));
          const percent = Math.min(100, Math.max(0, Number(body.percent) || 0));
          const scope_type = ["all","categories","subcategories","products"].includes(body.scope_type)
            ? body.scope_type : "all";
          await env.DB.prepare(
            `INSERT INTO coupons (id,code,percent,max_uses_total,max_uses_per_person,min_cents,scope_type,scope_json,active,starts_at,ends_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            id, code, percent,
            Math.max(0, Number(body.max_uses_total) || 0),
            Math.max(0, Number(body.max_uses_per_person) || 1),
            Math.max(0, Math.round(Number(body.min_cents) || 0)),
            scope_type, (function(){ var s = body.scope; if (Array.isArray(s)) return JSON.stringify(s); if (typeof body.scope_json === 'string') return body.scope_json; return JSON.stringify(body.scope_json || []); })(),
            body.active === false || body.active === 0 ? 0 : 1,
            String(body.starts_at || ""), String(body.ends_at || "")
          ).run();
          return json({ success: true, id });
        } catch (e) {
          return json({ success: false, error: String(e) }, 500);
        }
      }
      const couponItemMatch = url.pathname.match(/^\/api\/admin\/(?:coupons|discount-codes|promo-codes|codes)\/[^/]+$/);
      const couponCatalogId = isCouponCatalog ? (url.searchParams.get("id") || "") : "";
      if ((couponItemMatch || (isCouponCatalog && couponCatalogId)) && request.method === "PUT") {
        try {
          const cid = couponCatalogId || decodeURIComponent(url.pathname.split("/").pop());
          const body = await request.json();
          const code = String(body.code || "").trim().toUpperCase();
          const percent = Math.min(100, Math.max(0, Number(body.percent) || 0));
          const scope_type = ["all","categories","subcategories","products"].includes(body.scope_type)
            ? body.scope_type : "all";
          await env.DB.prepare(
            `UPDATE coupons SET code=?, percent=?, max_uses_total=?, max_uses_per_person=?, min_cents=?,
              scope_type=?, scope_json=?, active=?, starts_at=?, ends_at=? WHERE id=?`
          ).bind(
            code, percent,
            Math.max(0, Number(body.max_uses_total) || 0),
            Math.max(0, Number(body.max_uses_per_person) || 1),
            Math.max(0, Math.round(Number(body.min_cents) || 0)),
            scope_type, (function(){ var s = body.scope; if (Array.isArray(s)) return JSON.stringify(s); if (typeof body.scope_json === 'string') return body.scope_json; return JSON.stringify(body.scope_json || []); })(),
            body.active === false || body.active === 0 ? 0 : 1,
            String(body.starts_at || ""), String(body.ends_at || ""), cid
          ).run();
          return json({ success: true, id: cid });
        } catch (e) {
          return json({ success: false, error: String(e) }, 500);
        }
      }
      if ((couponItemMatch || (isCouponCatalog && couponCatalogId)) && request.method === "DELETE") {
        try {
          const cid = couponCatalogId || decodeURIComponent(url.pathname.split("/").pop());
          await env.DB.prepare("DELETE FROM coupons WHERE id=?").bind(cid).run();
          return json({ success: true });
        } catch (e) {
          return json({ success: false, error: String(e) }, 500);
        }
      }


    }

    return json({ success: true, message: "Vektolab API funcionando" });
  }
};
