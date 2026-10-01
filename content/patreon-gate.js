/* Vektolab Patreon / PayPal download + generator access gate
   - Publicaciones normales: intercepta #downloadBtn
   - Generadores (producto.html): intercepta #generatorBtn → modal → al confirmar lleva al generador
   - Dentro del generador: intercepta #downloadBtn (una descarga por pago PayPal)
   Configure AUTH_BASE y PAYPAL_BASE con las URLs de los Workers.
*/
(function(){
  const AUTH_BASE = "https://round-moon-e1f4vektolabs-gate.vektocreativeteam.workers.dev";
  const SESSION_KEY = "vektolab_patreon_session_v1";
  // PayPal Worker. Replace with your deployed Cloudflare Worker URL.
  const PAYPAL_BASE = "https://vektolab-paypal.vektocreativeteam.workers.dev";

  const GEN_ACCESS_KEY = "vektolab_gen_access_v1";
  const GEN_TOKEN_KEY = "vektolab_gen_paypal_token_v1";

  let memberSession = null;
  /** 'download' | 'generator' — qué acción se está autorizando */
  let pendingAction = "download";

  function tt(key, fallback){
    try {
      if (typeof t === "function") {
        const v = t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function loadSession(){
    try { return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY); } catch(e) { return null; }
  }
  function saveSession(v){
    try { sessionStorage.setItem(SESSION_KEY, v); } catch(e) {}
    try { localStorage.setItem(SESSION_KEY, v); } catch(e) {}
    memberSession = v;
  }
  function clearSession(){
    try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
    try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
    memberSession = null;
  }

  function parseReturnToken(){
    const hash = location.hash || "";
    if(!hash.startsWith("#")) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get("vk_session");
    const error = params.get("vk_error");
    if(token){
      saveSession(token);
      history.replaceState(null, "", location.pathname + location.search);
      showToast(tt("gate_connected", "✓ Patreon connected"), "ok");
      // Si el usuario volvía de Patreon tras intentar abrir un generador, reintentar
      try {
        const pendingGen = sessionStorage.getItem("vk_pending_gen_url");
        if (pendingGen) {
          sessionStorage.removeItem("vk_pending_gen_url");
          grantGeneratorAccess(null);
          setTimeout(function(){ location.href = pendingGen; }, 400);
        }
      } catch (e) {}
    } else if(error === "not_member") {
      history.replaceState(null, "", location.pathname + location.search);
      setTimeout(()=>openGateModal("not_member", loadPendingExclusive()), 80);
    } else if(error) {
      history.replaceState(null, "", location.pathname + location.search);
      setTimeout(()=>openGateModal("error", loadPendingExclusive()), 80);
    }
  }

  function savePendingExclusive(v){
    try { sessionStorage.setItem("vk_gate_exclusive", v ? "1" : "0"); } catch(e) {}
  }
  function loadPendingExclusive(){
    try { return sessionStorage.getItem("vk_gate_exclusive") === "1"; } catch(e) { return false; }
  }

  function authUrl(){
    const ret = location.href.split("#")[0];
    return AUTH_BASE + "/login?return=" + encodeURIComponent(ret);
  }

  function joinUrl(){ return AUTH_BASE + "/join"; }

  async function checkMember(){
    const token = memberSession || loadSession();
    if(!token) return false;
    try{
      const r = await fetch(AUTH_BASE + "/check", {
        method:"GET",
        headers:{ "Authorization":"Bearer " + token },
        cache:"no-store"
      });
      if(!r.ok) { clearSession(); return false; }
      const data = await r.json();
      if(data && data.active === true){ memberSession = token; return true; }
    }catch(e){}
    clearSession();
    return false;
  }

  function showToast(message, kind){
    const old=document.getElementById("vkPatreonToast"); if(old) old.remove();
    const el=document.createElement("div");
    el.id="vkPatreonToast";
    el.textContent=message;
    el.style.cssText="position:fixed;right:18px;bottom:18px;z-index:99999;padding:11px 15px;border-radius:10px;background:#15151b;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);";
    if(kind === "ok") el.style.borderColor="rgba(80,220,140,.45)";
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 2800);
  }

  function getGeneratorUrl(){
    // Prefer window.vkGeneratorUrl set by producto.html, then data-url on the button
    try {
      if (window.vkGeneratorUrl) return String(window.vkGeneratorUrl);
      const btn = document.getElementById("generatorBtn");
      if (btn && btn.dataset && btn.dataset.url) return btn.dataset.url;
    } catch (e) {}
    return "";
  }

  function grantGeneratorAccess(paypalToken){
    try {
      const key = getProductKey();
      const payload = JSON.stringify({
        product: key,
        at: Date.now(),
        // Acceso válido durante esta sesión del navegador (no se comparte entre dispositivos)
        exp: Date.now() + 6 * 60 * 60 * 1000
      });
      sessionStorage.setItem(GEN_ACCESS_KEY, payload);
      if (paypalToken) {
        // Token de una sola descarga: se consume al exportar el STL en el generador
        sessionStorage.setItem(GEN_TOKEN_KEY, String(paypalToken));
      }
    } catch (e) {}
  }

  function hasValidGeneratorAccess(){
    try {
      const raw = sessionStorage.getItem(GEN_ACCESS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.exp || Date.now() > data.exp) {
        sessionStorage.removeItem(GEN_ACCESS_KEY);
        return false;
      }
      return true;
    } catch (e) { return false; }
  }

  function consumePayPalTokenForGenerator(){
    try {
      const tok = sessionStorage.getItem(GEN_TOKEN_KEY);
      if (tok) {
        sessionStorage.removeItem(GEN_TOKEN_KEY);
        return tok;
      }
    } catch (e) {}
    return null;
  }

  async function startPayPalCheckout(){
    const old = document.getElementById("vkPayPalScript");
    if(!old){
      try{
        const info = await fetch(PAYPAL_BASE+"/api/paypal/client-id",{cache:"no-store"}).then(r=>r.json());
        const env = String(info.env||"sandbox").toLowerCase();
        const script=document.createElement("script");
        script.id="vkPayPalScript";
        script.src = env === "live"
          ? "https://www.paypal.com/web-sdk/v6/core"
          : "https://www.sandbox.paypal.com/web-sdk/v6/core";
        script.onload=()=>renderPayPalButton();
        script.onerror=()=>showToast("No se pudo cargar PayPal", "error");
        document.head.appendChild(script);
      }catch(e){
        showToast("No se pudo inicializar PayPal", "error");
        const loadBtn=document.querySelector(".vk-pg-paypal-load");
        if(loadBtn){ loadBtn.disabled=false; loadBtn.textContent=tt("gate_paypal", "💳 Buy with PayPal"); }
      }
    } else if(window.paypal) renderPayPalButton();
  }

  let paypalRendered=false;
  async function renderPayPalButton(){
    if(paypalRendered || !window.paypal) return;
    const host=document.getElementById("vkPaypalButton");
    if(!host) return;
    paypalRendered=true;
    try{
      const sdk=await window.paypal.createInstance({clientId: await getPayPalClientId(), components:["paypal-payments"], pageType:"checkout"});
      const session=sdk.createPayPalOneTimePaymentSession({
        onApprove: async ({orderId})=>{
          const r=await fetch(PAYPAL_BASE+"/api/paypal/capture-order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orderId,product:getProductKey(),coupon:getCouponCode(),person:getPersonKey()})});
          const data=await r.json();
          if(!r.ok || !data.approved) throw new Error(data.error||"Pago no confirmado");
          const modal=document.getElementById("vkPatreonGateModal");
          if(modal) modal.remove();

          if (pendingAction === "generator") {
            const url = getGeneratorUrl();
            grantGeneratorAccess(data.downloadToken);
            showToast("✓ Pago confirmado. Abriendo generador…", "ok");
            if (url) {
              setTimeout(function(){ location.href = url; }, 500);
            }
          } else {
            approveOneDownload(data.downloadToken);
            showToast("✓ Pago confirmado. Descarga habilitada", "ok");
          }
        },
        onCancel:()=>{},
        onError:(err)=>{ console.error("PayPal",err); showToast("No se pudo completar el pago", "error"); }
      });
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="vk-pg-paypal-btn";
      btn.textContent = pendingAction === "generator"
        ? (tt("gate_paypal_gen", "💳 Comprar acceso y personalizar") || "💳 Comprar acceso y personalizar")
        : "💳 Comprar esta descarga";
      btn.onclick=async()=>{
        btn.disabled=true;
        try{
          const orderPromise=fetch(PAYPAL_BASE+"/api/paypal/create-order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({product:getProductKey(),coupon:getCouponCode(),person:getPersonKey(),returnUrl:location.href.split("#")[0]})}).then(r=>r.json()).then(data=>{if(!data.id) throw new Error(data.error||"No se pudo crear el pedido"); return {orderId:data.id};});
          await session.start({presentationMode:"auto"},orderPromise);
        }catch(e){ console.error(e); showToast(e.message||"Error de PayPal","error"); }
        finally{btn.disabled=false;}
      };
      host.innerHTML=""; host.appendChild(btn);
    }catch(e){
      paypalRendered=false;
      console.error(e);
      showToast("PayPal no está disponible todavía", "error");
      const loadBtn=document.querySelector(".vk-pg-paypal-load");
      if(loadBtn){ loadBtn.disabled=false; loadBtn.textContent=tt("gate_paypal", "💳 Buy with PayPal"); }
      const host=document.getElementById("vkPaypalButton");
      if(host && !host.querySelector(".vk-pg-paypal-btn")){
        host.innerHTML='<button type="button" class="vk-pg-paypal-load">'+tt("gate_paypal", "💳 Buy with PayPal")+'</button>';
        host.querySelector(".vk-pg-paypal-load").onclick=()=>{ startPayPalCheckout(); };
      }
    }
  }

  async function getPayPalClientId(){
    const r=await fetch(PAYPAL_BASE+"/api/paypal/client-id",{cache:"no-store"});
    const data=await r.json();
    if(!r.ok || !data.clientId) throw new Error(data.error||"No se pudo inicializar PayPal");
    return data.clientId;
  }

  function getProductKey(){
    try {
      const q = new URLSearchParams(location.search);
      const id = q.get("id") || q.get("product") || q.get("generator");
      if (id) return String(id).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
    } catch (e) {}
    return location.pathname.split("/").pop().replace(/\.html$/i,"") || "vektolab";
  }
  function getCouponCode(){
    try {
      const q = new URLSearchParams(location.search);
      return String(q.get("coupon") || q.get("cupon") || window.vkCouponCode || "").trim();
    } catch (e) { return String(window.vkCouponCode || "").trim(); }
  }
  function getPersonKey(){
    try {
      let k = localStorage.getItem("vk_person_key");
      if (!k) { k = "p-" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("vk_person_key", k); }
      return k;
    } catch (e) { return "anon"; }
  }

  function approveOneDownload(token){
    const btn=document.getElementById("downloadBtn");
    if(!btn) return;
    btn.dataset.vkPayPalApproved="1";
    btn.dataset.vkPayPalToken=token||"";
    btn.click();
    setTimeout(()=>{ delete btn.dataset.vkPayPalApproved; delete btn.dataset.vkPayPalToken; }, 1000);
  }

  function openGateModal(reason, exclusive){
    let modal=document.getElementById("vkPatreonGateModal");
    if(modal) { modal.style.display="flex"; return; }
    modal=document.createElement("div");
    modal.id="vkPatreonGateModal";

    const isGen = pendingAction === "generator";
    const title = isGen
      ? tt("gate_title_gen", "Acceso al generador")
      : tt("gate_title", "Members-only download");
    const main = isGen
      ? tt("gate_main_gen", "Para personalizar y descargar este diseño necesitás membresía o una compra única.")
      : tt("gate_main", "You can use Vektolab to create designs for free.");
    const sub = isGen
      ? tt("gate_sub_gen", "Tras confirmar, se abre el generador. El pago PayPal habilita una sola descarga del STL.")
      : tt("gate_sub", "To download the STL file you need an active Vektolab membership on Patreon.");
    const paypalLabel = isGen
      ? (tt("gate_paypal_gen", "💳 Comprar acceso y personalizar") || "💳 Comprar acceso y personalizar")
      : tt("gate_paypal", "💳 Buy with PayPal");
    const orLabel = isGen
      ? tt("gate_or_gen", "o comprar solo este acceso")
      : tt("gate_or", "or buy only this download");

    modal.innerHTML=`
      <div class="vk-pg-backdrop"></div>
      <div class="vk-pg-card" role="dialog" aria-modal="true" aria-labelledby="vkPgTitle">
        <button class="vk-pg-close" aria-label="${tt("p_close", "Close")}">×</button>
        <div class="vk-pg-lock">🔒</div>
        <h2 id="vkPgTitle">${title}</h2>
        <p class="vk-pg-main">${main}</p>
        <p class="vk-pg-sub">${sub}</p>
        <div class="vk-pg-actions">
          <a class="vk-pg-join" href="${joinUrl()}" target="_blank" rel="noopener">${tt("gate_join", "⭐ Become a member")}</a>
          <a class="vk-pg-login" href="${authUrl()}">${tt("gate_login", "Connect with Patreon")}</a>
          ${exclusive ? '' : `
          <div class="vk-pg-or">${orLabel}</div>
          <div id="vkPaypalButton" class="vk-pg-paypal-wrap"><button type="button" class="vk-pg-paypal-load">${paypalLabel}</button></div>`}
        </div>
        ${reason === "error" ? '<div class="vk-pg-error">'+tt("gate_err_verify", "Could not verify Patreon. Please try again.")+'</div>' : ''}
        ${reason === "not_member" ? '<div class="vk-pg-error">'+tt("gate_err_member", "No active membership found on the connected Patreon account.")+'</div>' : ''}
      </div>`;
    const style=document.createElement("style");
    style.textContent=`
      #vkPatreonGateModal{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
      .vk-pg-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(5px)}
      .vk-pg-card{position:relative;width:min(460px,100%);box-sizing:border-box;padding:30px 28px 26px;border-radius:18px;background:#15151b;color:#f5f5f7;border:1px solid rgba(255,255,255,.12);box-shadow:0 25px 80px rgba(0,0,0,.5);text-align:center}
      .vk-pg-close{position:absolute;right:12px;top:8px;width:36px;height:36px;border:0;background:transparent;color:#aaa;font-size:28px;cursor:pointer}
      .vk-pg-lock{font-size:34px;margin-bottom:8px}.vk-pg-card h2{margin:0 0 12px;font-size:24px}.vk-pg-main{margin:0 auto 8px;line-height:1.5;color:#fff}.vk-pg-sub{margin:0 auto;color:#aaa;line-height:1.5;font-size:14px;max-width:390px}
      .vk-pg-actions{display:grid;gap:10px;margin-top:22px}.vk-pg-actions a{display:block;text-decoration:none;padding:13px 16px;border-radius:10px;font-weight:800;letter-spacing:.2px}.vk-pg-join{background:#ff424d;color:#fff}.vk-pg-login{background:#26262e;color:#fff;border:1px solid rgba(255,255,255,.12)}.vk-pg-or{margin:17px 0 9px;color:#888;font-size:12px}.vk-pg-paypal-wrap{min-height:48px}.vk-pg-paypal-load,.vk-pg-paypal-btn{width:100%;box-sizing:border-box;padding:13px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#f5c542;color:#111;font-weight:900;cursor:pointer}.vk-pg-paypal-load:disabled,.vk-pg-paypal-btn:disabled{opacity:.6;cursor:wait}.vk-pg-error{margin-top:13px;color:#ff9aa0;font-size:13px}
    `;
    document.head.appendChild(style); document.body.appendChild(modal);
    modal.querySelector(".vk-pg-close").onclick=()=>modal.remove();
    modal.querySelector(".vk-pg-backdrop").onclick=()=>modal.remove();
    // Guardar URL del generador por si el usuario vuelve de Patreon
    if (isGen) {
      try {
        const u = getGeneratorUrl();
        if (u) sessionStorage.setItem("vk_pending_gen_url", u);
      } catch (e) {}
    }
    if(!exclusive){
      const loadBtn=modal.querySelector(".vk-pg-paypal-load");
      if(loadBtn){ loadBtn.disabled=true; loadBtn.textContent=tt("gate_paypal_loading", "Loading PayPal…"); }
      paypalRendered=false;
      startPayPalCheckout();
    }
  }

  async function gateDownload(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingAction = "download";
    const btn=event.target.closest ? event.target.closest("#downloadBtn") : document.getElementById("downloadBtn");
    const exclusive = !!(btn && btn.dataset.vkExclusive === "1");
    savePendingExclusive(exclusive);

    // Si el usuario ya pagó en la página del producto y llegó al generador con token, usarlo una vez
    const prepaid = consumePayPalTokenForGenerator();
    if (prepaid) {
      if (btn) {
        btn.dataset.vkPayPalApproved = "1";
        btn.dataset.vkPayPalToken = prepaid;
        btn.click();
        setTimeout(function(){
          delete btn.dataset.vkPayPalApproved;
          delete btn.dataset.vkPayPalToken;
        }, 1000);
      }
      return;
    }

    const ok=await checkMember();
    if(ok){
      if(!btn) return;
      btn.dataset.vkPatreonApproved="1";
      btn.click();
      setTimeout(()=>delete btn.dataset.vkPatreonApproved, 0);
    } else {
      openGateModal(undefined, exclusive);
    }
  }

  async function gateGenerator(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingAction = "generator";
    const url = getGeneratorUrl();
    if (!url) {
      showToast("Generador no disponible", "error");
      return;
    }

    // Miembros de Patreon: acceso directo
    const ok = await checkMember();
    if (ok) {
      grantGeneratorAccess(null);
      location.href = url;
      return;
    }

    // Si ya tiene acceso de sesión (pago reciente en esta pestaña), permitir
    if (hasValidGeneratorAccess()) {
      location.href = url;
      return;
    }

    savePendingExclusive(false);
    openGateModal(undefined, false);
  }

  function install(){
    parseReturnToken();
    document.addEventListener("click", function(e){
      // Generador: botón "Personalizar y descargar" en producto.html
      const genBtn = e.target && e.target.closest ? e.target.closest("#generatorBtn") : null;
      if (genBtn) {
        if (genBtn.dataset.vkPatreonApproved === "1" || genBtn.dataset.vkPayPalApproved === "1") return;
        gateGenerator(e);
        return;
      }

      // Descarga STL (publicaciones normales o dentro del generador)
      const btn = e.target && e.target.closest ? e.target.closest("#downloadBtn") : null;
      if (!btn) return;
      if (btn.dataset.vkPatreonApproved === "1" || btn.dataset.vkPayPalApproved === "1") return;
      gateDownload(e);
    }, true);
  }

  // Exponer helpers por si se necesitan desde otros scripts
  window.vkGate = {
    hasValidGeneratorAccess: hasValidGeneratorAccess,
    grantGeneratorAccess: grantGeneratorAccess,
    checkMember: checkMember
  };

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
