/* Vektolab — Asistente virtual (preguntas frecuentes)
   Widget flotante, autónomo y sin dependencias externas.
   Para agregar o editar respuestas, modifique el arreglo FAQ_DB de abajo.
   Se incluye igual en todas las páginas con: <script src="./asistente.js"></script>
*/
(function () {
  const FAQ_DB = [
    {
      id: "membresia",
      label: "Membresía y descarga",
      keywords: ["patreon", "membresia", "miembro", "suscripcion", "suscribir", "descargar", "descarga", "gratis", "verificar"],
      answer: 'Los diseños de Vektolab pueden descargarse sin costo con una membresía activa de Vektolab en Patreon. Al presionar "Comprar y descargar", el sistema verifica la membresía de forma automática. El proceso completo, paso a paso, está disponible en el botón "Cómo funciona" de la ficha de cada diseño.'
    },
    {
      id: "paypal",
      label: "Comprar sin ser miembro",
      keywords: ["paypal", "comprar", "pago", "individual", "sin suscribirme", "tarjeta", "precio"],
      answer: 'Cuando la publicación lo permite, es posible adquirir la descarga de un diseño en particular mediante PayPal, sin necesidad de suscribirse a Patreon. Esta opción se muestra automáticamente al intentar descargar el archivo, cuando está disponible para ese diseño en particular.'
    },
    {
      id: "licencias",
      label: "Licencias",
      keywords: ["licencia", "comercial", "vender", "derechos", "redistribuir", "uso personal"],
      answer: 'Cada diseño indica su tipo de licencia en la sección "Licencia" de su ficha (por ejemplo, uso personal, uso comercial permitido o Creative Commons). Se recomienda revisar la licencia específica de cada publicación antes de imprimir o comercializar una pieza.'
    },
    {
      id: "materiales",
      label: "Materiales e impresora",
      keywords: ["material", "pla", "filamento", "impresora", "impresion", "capas", "fdm", "petg"],
      answer: 'La mayoría de los diseños están optimizados para filamento PLA con una altura de capa de 0.2 mm, aunque cada ficha detalla el tamaño del modelo y el material sugerido. Cuando esté disponible, también puede encontrar productos recomendados en la sección "Materiales y equipo recomendado" de cada diseño.'
    },
    {
      id: "catalogo",
      label: "Buscar diseños",
      keywords: ["catalogo", "buscar", "categoria", "generador", "personalizar", "encontrar"],
      answer: 'El catálogo completo puede explorarse desde la página principal, utilizando el buscador o filtrando por categoría. Los diseños marcados como "Generador" permiten personalizar el modelo antes de descargarlo.'
    },
    {
      id: "envios",
      label: "Envíos",
      keywords: ["envio", "envios", "entrega", "correo", "delivery", "domicilio"],
      answer: "Vektolab no realiza envíos físicos: todos los productos son archivos digitales (STL) que se descargan directamente desde el sitio, una vez verificada la membresía o completada la compra."
    },
    {
      id: "contacto",
      label: "Contacto y soporte",
      keywords: ["contacto", "soporte", "ayuda", "problema", "falla", "reclamo", "consulta"],
      answer: "Para recibir asistencia personalizada o informar cualquier inconveniente, puede comunicarse a través de la sección de soporte del sitio. Con gusto le responderemos a la brevedad."
    }
  ];

  const FALLBACK = 'I couldn\'t find an exact answer to that. You can pick one of the suggested topics, search for a design by describing what you need, or contact our support team.';
  const GREETING = 'Welcome to Vektolab. I\'m the site\'s virtual assistant. How can I help you? You can also tell me what design you\'re looking for, e.g. "a vase" or "a fire truck".';

  // Usa el diccionario compartido i18n.js si está cargado en la página; si no, cae al texto en español de arriba.
  function tt(key, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key);
    } catch (e) {}
    return fallback;
  }

  function getActiveLang() {
    try {
      if (typeof window.getLang === "function") return window.getLang();
      if (typeof currentLang !== "undefined") return currentLang;
    } catch (e) {}
    try { return localStorage.getItem("vektolab_lang_v3") || "en"; } catch (e) { return "en"; }
  }

  // Traduce textos del asistente (FAQ, respuestas) al idioma activo.
  // Fuente: español. Caché por idioma en memoria + localStorage vía VKTranslate.
  const faqTranslateCache = {};
  async function translateFaqText(text, lang) {
    if (!text || !lang) return text;
    if (lang === "es") return text;
    const key = lang + "::" + text;
    if (faqTranslateCache[key]) return faqTranslateCache[key];
    try {
      if (typeof VKTranslate !== "undefined" && VKTranslate.translateText) {
        const result = await VKTranslate.translateText(text, lang, "es");
        faqTranslateCache[key] = result || text;
        return faqTranslateCache[key];
      }
    } catch (e) {}
    return text;
  }

  async function getTranslatedFaqEntry(entry, lang) {
    if (!entry) return null;
    if (!lang || lang === "es") return { label: entry.label, answer: entry.answer };
    const [label, answer] = await Promise.all([
      translateFaqText(entry.label, lang),
      translateFaqText(entry.answer, lang)
    ]);
    return { label: label || entry.label, answer: answer || entry.answer };
  }

  // Precarga todas las FAQ en el idioma activo (chips + respuestas instantáneas)
  async function prewarmFaq(lang) {
    lang = lang || getActiveLang();
    if (!lang || lang === "es") return;
    await Promise.all(FAQ_DB.map(function (e) { return getTranslatedFaqEntry(e, lang); }));
  }


  function escHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const API = (window.VEKTOLAB_API || "").replace(/\/$/, "");
  let productsCache = null;

  async function getProducts() {
    if (productsCache) return productsCache;
    if (!API) return [];
    try {
      const r = await fetch(API + "/api/products", { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!r.ok) return (productsCache = []);
      const data = await r.json();
      productsCache = Array.isArray(data) ? data : (data.products || data.items || []);
    } catch (e) {
      productsCache = [];
    }
    return productsCache;
  }

  function searchTextFor(p) {
    return normalize([
      p.name, p.description, p.category, p.subcategory, p.keywords,
      Array.isArray(p.tags) ? p.tags.join(" ") : p.tags
    ].filter(Boolean).join(" "));
  }

  async function searchDesigns(query) {
    const q = normalize(query);
    const tokens = q.split(/\s+/).filter(w => w.length > 2);
    if (!tokens.length) return [];
    const products = await getProducts();
    const scored = products
      .map(p => {
        const text = searchTextFor(p);
        let score = 0;
        tokens.forEach(tok => { if (text.indexOf(tok) !== -1) score++; });
        return { p, score };
      })
      .filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 4).map(x => x.p);
  }

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function findAnswer(query) {
    const q = normalize(query);
    if (!q) return null;
    let best = null, bestScore = 0;
    FAQ_DB.forEach(entry => {
      let score = 0;
      entry.keywords.forEach(k => { if (q.indexOf(normalize(k)) !== -1) score++; });
      if (score > bestScore) { bestScore = score; best = entry; }
    });
    return bestScore > 0 ? best : null;
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .vkbot-btn{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;background:#f5c518;border:0;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:9500;transition:transform .15s}
      .vkbot-btn:hover{transform:scale(1.06);background:#eab308}
      .vkbot-btn svg{width:26px;height:26px;color:#111827}
      .vkbot-dot{position:absolute;top:6px;right:6px;width:10px;height:10px;border-radius:50%;background:#e11d48;border:2px solid #fff}
      .vkbot-panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 32px);height:460px;max-height:calc(100vh - 130px);background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;z-index:9500;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
      .vkbot-panel.open{display:flex}
      .vkbot-head{background:#172238;color:#fff;padding:15px 16px;display:flex;align-items:center;gap:10px}
      .vkbot-head svg{width:20px;height:20px;flex:none}
      .vkbot-head-text{flex:1;min-width:0}
      .vkbot-head-text strong{display:block;font-size:13.5px}
      .vkbot-head-text span{display:block;font-size:11px;color:#b7c0d1;margin-top:1px}
      .vkbot-close{flex:none;width:28px;height:28px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
      .vkbot-close:hover{background:rgba(255,255,255,.22)}
      .vkbot-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;background:#f7f8fa}
      .vkbot-msg{max-width:86%;font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:12px}
      .vkbot-msg.bot{align-self:flex-start;background:#fff;border:1px solid #e6e9ee;color:#293241;border-bottom-left-radius:3px}
      .vkbot-msg.user{align-self:flex-end;background:#172238;color:#fff;border-bottom-right-radius:3px}
      .vkbot-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;background:#f7f8fa}
      .vkbot-chip{border:1px solid #dfe4ea;background:#fff;color:#3a4a63;font-size:11px;font-weight:650;padding:6px 10px;border-radius:999px;cursor:pointer}
      .vkbot-chip:hover{background:#eef1f5}
      .vkbot-inputrow{display:flex;gap:8px;padding:11px;border-top:1px solid #eceff3;background:#fff}
      .vkbot-inputrow input{flex:1;border:1px solid #dfe4ea;border-radius:10px;padding:9px 11px;font:inherit;font-size:12.5px}
      .vkbot-inputrow input:focus{outline:none;border-color:#b9c2cf}
      .vkbot-send{flex:none;width:38px;height:38px;border-radius:10px;border:0;background:#f5c518;cursor:pointer;display:flex;align-items:center;justify-content:center}
      .vkbot-send:hover{background:#eab308}
      .vkbot-send svg{width:17px;height:17px;color:#111827}
      .vkbot-results{display:flex;flex-direction:column;gap:6px;background:transparent!important;border:0!important;padding:0!important;max-width:100%!important}
      .vkbot-result{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:7px 9px;text-decoration:none;color:#293241;font-size:12px;font-weight:600;transition:background .12s}
      .vkbot-result:hover{background:#eef1f5}
      .vkbot-result img{width:34px;height:34px;border-radius:7px;object-fit:cover;flex:none;background:#f1f2f5}
      @media(max-width:480px){.vkbot-panel{right:14px;left:14px;width:auto;bottom:82px}.vkbot-btn{right:16px;bottom:16px}}
    `;
    document.head.appendChild(style);
  }

  function injectMarkup() {
    const btn = document.createElement("button");
    btn.className = "vkbot-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", tt("bot_open", "Open virtual assistant"));
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><span class="vkbot-dot"></span>';

    const panel = document.createElement("div");
    panel.className = "vkbot-panel";
    panel.innerHTML = `
      <div class="vkbot-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <div class="vkbot-head-text"><strong>${escHtml(tt("bot_title", "Vektolab Assistant"))}</strong><span>${escHtml(tt("bot_subtitle", "Questions & design search"))}</span></div>
        <button type="button" class="vkbot-close" aria-label="${escHtml(tt("bot_close", "Close"))}">×</button>
      </div>
      <div class="vkbot-body" id="vkbotBody"></div>
      <div class="vkbot-chips" id="vkbotChips"></div>
      <div class="vkbot-inputrow">
        <input type="text" id="vkbotInput" placeholder="${escHtml(tt("bot_placeholder", "Type your question or the design you're looking for..."))}" autocomplete="off">
        <button type="button" class="vkbot-send" id="vkbotSend" aria-label="${escHtml(tt("bot_send", "Send"))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-8-8 18-2-8-8-2Z"/></svg>
        </button>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const body = panel.querySelector("#vkbotBody");
    const chips = panel.querySelector("#vkbotChips");
    const input = panel.querySelector("#vkbotInput");
    const send = panel.querySelector("#vkbotSend");
    let greeted = false;

    function addMsg(text, who) {
      const div = document.createElement("div");
      div.className = "vkbot-msg " + who;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return div;
    }

    async function renderDesignResults(designs) {
      const lang = getActiveLang();
      const wrap = document.createElement("div");
      wrap.className = "vkbot-msg bot vkbot-results";
      const items = await Promise.all(designs.map(async p => {
        let name = p.name || tt("bot_view_design", "View design");
        if (lang && lang !== "es" && p.name && typeof VKTranslate !== "undefined") {
          try { name = await VKTranslate.translateText(p.name, lang); } catch (e) {}
        }
        return `<a class="vkbot-result" href="./producto.html?id=${encodeURIComponent(p.id)}">
          ${p.image ? `<img src="${escHtml(p.image)}" alt="" loading="lazy">` : ""}
          <span>${escHtml(name)}</span>
        </a>`;
      }));
      wrap.innerHTML = items.join("");
      body.appendChild(wrap);
      body.scrollTop = body.scrollHeight;
    }

    async function renderChips() {
      const lang = getActiveLang();
      const translated = await Promise.all(FAQ_DB.map(async e => {
        const t = await getTranslatedFaqEntry(e, lang);
        return { id: e.id, label: t.label, answer: t.answer };
      }));
      chips.innerHTML = translated.map(e => `<button type="button" class="vkbot-chip" data-id="${e.id}">${escHtml(e.label)}</button>`).join("");
      chips.querySelectorAll(".vkbot-chip").forEach(c => {
        c.onclick = async () => {
          const entry = FAQ_DB.find(e => e.id === c.dataset.id);
          if (!entry) return;
          const t = await getTranslatedFaqEntry(entry, getActiveLang());
          addMsg(t.label, "user");
          addMsg(t.answer, "bot");
        };
      });
    }

    async function handleQuery() {
      const val = input.value.trim();
      if (!val) return;
      addMsg(val, "user");
      input.value = "";
      const entry = findAnswer(val);
      let designs = [];
      try { designs = await searchDesigns(val); } catch (e) { designs = []; }
      if (designs.length) {
        addMsg(tt("bot_found_designs", "I found these designs related to your search:"), "bot");
        await renderDesignResults(designs);
        if (entry) {
          const te = await getTranslatedFaqEntry(entry, getActiveLang());
          addMsg(te.answer, "bot");
        }
      } else if (entry) {
        const te = await getTranslatedFaqEntry(entry, getActiveLang());
        addMsg(te.answer, "bot");
      } else {
        addMsg(tt("bot_fallback", FALLBACK), "bot");
      }
    }

    send.onclick = handleQuery;
    input.addEventListener("keydown", e => { if (e.key === "Enter") handleQuery(); });

    function applyChromeLang() {
      btn.setAttribute("aria-label", tt("bot_open", "Open virtual assistant"));
      const strong = panel.querySelector(".vkbot-head-text strong");
      const span = panel.querySelector(".vkbot-head-text span");
      if (strong) strong.textContent = tt("bot_title", "Vektolab Assistant");
      if (span) span.textContent = tt("bot_subtitle", "Questions & design search");
      const closeBtn = panel.querySelector(".vkbot-close");
      if (closeBtn) closeBtn.setAttribute("aria-label", tt("bot_close", "Close"));
      input.placeholder = tt("bot_placeholder", "Type your question or the design you're looking for...");
      send.setAttribute("aria-label", tt("bot_send", "Send"));
    }

    async function waitLangReady() {
      try {
        if (window.vkI18nReady && typeof window.vkI18nReady.then === "function") {
          await window.vkI18nReady;
        } else if (typeof ensureLangTranslations === "function") {
          await ensureLangTranslations(getActiveLang());
        }
      } catch (e) {}
    }

    async function showGreeting() {
      await waitLangReady();
      applyChromeLang();
      try { await prewarmFaq(getActiveLang()); } catch (e) {}
      body.innerHTML = "";
      addMsg(tt("bot_greeting", GREETING), "bot");
      await renderChips();
      greeted = true;
    }

    async function open() {
      panel.classList.add("open");
      btn.querySelector(".vkbot-dot")?.remove();
      if (!greeted) {
        await showGreeting();
      }
      setTimeout(() => input.focus(), 100);
    }
    function close() { panel.classList.remove("open"); }

    btn.onclick = () => { panel.classList.contains("open") ? close() : open(); };
    panel.querySelector(".vkbot-close").onclick = close;
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

    // Al cambiar idioma: actualiza chrome, limpia chat y vuelve a saludar en el idioma nuevo
    async function onLangChange(ev) {
      const phase = ev && ev.detail && ev.detail.phase;
      applyChromeLang();
      // Solo reinicia el chat cuando el diccionario está listo (phase ready o sin phase)
      if (phase === "start") return;
      await waitLangReady();
      applyChromeLang();
      try { await prewarmFaq(getActiveLang()); } catch (e) {}
      if (panel.classList.contains("open")) {
        await showGreeting();
      } else {
        greeted = false;
        body.innerHTML = "";
      }
    }
    document.addEventListener("vk-lang-changed", onLangChange);
    document.addEventListener("vk-lang-ready", onLangChange);

    // Chrome inicial cuando el idioma esté listo
    waitLangReady().then(function () { applyChromeLang(); });
  }

  function init() {
    injectStyles();
    injectMarkup();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
