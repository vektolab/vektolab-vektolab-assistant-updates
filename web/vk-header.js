/* Vektolab — Módulo compartido de cabecera.
   Se incluye en cualquier página DESPUÉS de i18n.js (y de push-config.js si
   la página tiene botón de notificaciones) con:
     <script src="./vk-header.js"></script>

   Qué hace:
   - Inyecta el CSS de los modales de idioma/contacto si la página no lo trae.
   - Inyecta el HTML del modal de idioma y del modal de contacto si no existen
     ya en la página (así no hace falta duplicar ese markup en cada archivo).
   - Conecta los botones de la cabecera #contactBtn, #langBtn, #notifyBtn e
     #installAppBtn con su comportamiento real (antes, en páginas fuera de
     index.html, estos botones no hacían nada o redirigían a index.html sin
     completar la acción).
   - Todo es opcional/defensivo: si un botón o contenedor no existe en la
     página, simplemente no se conecta nada para ese elemento.
*/
(function () {
  "use strict";

  function injectStyleOnce() {
    if (document.getElementById("vk-header-shared-style")) return;
    const style = document.createElement("style");
    style.id = "vk-header-shared-style";
    style.textContent = `
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;align-items:center;justify-content:center;padding:24px}
.modal-overlay.open{display:flex}
.modal{background:#fff;border-radius:20px;width:100%;max-width:920px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.18);overflow:hidden}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 12px;flex-shrink:0}
.modal-title{font-size:17px;font-weight:700;color:#111827}
.modal-close{width:32px;height:32px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6b7280;font-size:18px;line-height:1;font-family:inherit}
.modal-close:hover{background:#f3f4f6}
.modal-body{padding:0 22px 22px;overflow-y:auto;flex:1}
.modal-search{width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:12px;font-size:14px;outline:none;margin-bottom:14px;font-family:inherit;background:#f9fafb}
.modal-search:focus{border-color:#d1d5db;background:#fff}
.lang-modal .modal{max-width:480px}
.lang-list-modal{display:flex;flex-direction:column;gap:4px;max-height:360px;overflow-y:auto}
.lang-opt-modal{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:none;background:transparent;padding:12px 14px;border-radius:12px;cursor:pointer;font-size:15px;color:#111827;font-family:inherit;transition:background .12s}
.lang-opt-modal:hover,.lang-opt-modal.active{background:#f3f4f6}
.lang-opt-modal .flag{font-size:20px}
.lang-opt-modal.hidden{display:none}
.contact-modal .modal{max-width:420px}
.contact-body{padding:8px 22px 28px;text-align:center}
.contact-body p{font-size:15px;line-height:1.55;color:#6b7280;margin-bottom:18px}
.contact-email{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;font-size:15px;font-weight:600;color:#111827;text-decoration:none;transition:background .15s}
.contact-email:hover{background:#f3f4f6}
.contact-email svg{width:18px;height:18px;color:#6b7280}
`.trim();
    document.head.appendChild(style);
  }

  function injectMarkupOnce() {
    if (!document.getElementById("langModal")) {
      const langModal = document.createElement("div");
      langModal.innerHTML = `
<div class="modal-overlay lang-modal" id="langModal" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title" data-i18n="langTitle">Choose language</span>
      <button type="button" class="modal-close" id="langModalClose" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <input type="search" class="modal-search" id="langSearch" data-i18n-placeholder="langSearch" placeholder="Search language…" autocomplete="off">
      <div class="lang-list-modal" id="langListModal"></div>
    </div>
  </div>
</div>`.trim();
      document.body.appendChild(langModal.firstElementChild);
    }

    if (!document.getElementById("contactModal")) {
      const contactModal = document.createElement("div");
      contactModal.innerHTML = `
<div class="modal-overlay contact-modal" id="contactModal" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title" data-i18n="contactTitle">Support</span>
      <button type="button" class="modal-close" id="contactClose" aria-label="Close">×</button>
    </div>
    <div class="contact-body">
      <p data-i18n="contactMsg">For assistance or if you detect any issue, please contact us. We will be happy to help you.</p>
      <a class="contact-email" href="mailto:vektocreativeteam@gmail.com">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
        vektocreativeteam@gmail.com
      </a>
    </div>
  </div>
</div>`.trim();
      document.body.appendChild(contactModal.firstElementChild);
    }

    if (typeof applyI18nDom === "function") applyI18nDom();
  }

  /* ----- Modal de idioma ----- */
  function openLangModal() {
    const search = document.getElementById("langSearch");
    if (search) search.value = "";
    document.getElementById("langModal").classList.add("open");
    document.body.style.overflow = "hidden";
    renderLangList();
    setTimeout(() => { if (search) search.focus(); }, 50);
  }
  function closeLangModal() {
    const modal = document.getElementById("langModal");
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "";
  }
  function renderLangList() {
    if (typeof LANGS === "undefined") return;
    const search = document.getElementById("langSearch");
    const q = (search ? search.value : "").toLowerCase().trim();
    const wrap = document.getElementById("langListModal");
    if (!wrap) return;
    wrap.innerHTML = LANGS.map(l => {
      const match = !q || l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
      return `<button type="button" class="lang-opt-modal${currentLang === l.code ? " active" : ""}${match ? "" : " hidden"}" data-lang="${l.code}">
        <span class="flag">${l.flag}</span> ${l.name}
      </button>`;
    }).join("");
    wrap.querySelectorAll(".lang-opt-modal").forEach(opt => {
      opt.addEventListener("click", () => {
        closeLangModal();
        if (typeof setLang === "function") setLang(opt.dataset.lang);
      });
    });
  }

  /* ----- Modal de contacto ----- */
  function openContactModal() {
    const modal = document.getElementById("contactModal");
    if (!modal) return;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeContactModal() {
    const modal = document.getElementById("contactModal");
    if (!modal) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  function wireModals() {
    const langBtn = document.getElementById("langBtn");
    if (langBtn) langBtn.addEventListener("click", openLangModal);
    const langModalClose = document.getElementById("langModalClose");
    if (langModalClose) langModalClose.addEventListener("click", closeLangModal);
    const langModal = document.getElementById("langModal");
    if (langModal) langModal.addEventListener("click", e => { if (e.target.id === "langModal") closeLangModal(); });
    const langSearch = document.getElementById("langSearch");
    if (langSearch) langSearch.addEventListener("input", renderLangList);

    const contactBtn = document.getElementById("contactBtn");
    if (contactBtn) contactBtn.addEventListener("click", (e) => { e.preventDefault(); openContactModal(); });
    const contactClose = document.getElementById("contactClose");
    if (contactClose) contactClose.addEventListener("click", closeContactModal);
    const contactModal = document.getElementById("contactModal");
    if (contactModal) contactModal.addEventListener("click", e => { if (e.target.id === "contactModal") closeContactModal(); });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeLangModal(); closeContactModal(); }
    });
  }

  /* ----- Notificaciones push (Firebase) ----- */
  function wireNotifications() {
    const notifyBtn = document.getElementById("notifyBtn");
    if (!notifyBtn) return;
    if (typeof firebase === "undefined") {
      console.warn("[Vektolab] notifyBtn presente pero Firebase no está cargado en esta página.");
      return;
    }

    const firebaseConfig = {
      apiKey: "AIzaSyB-ZWsv774bOZf_cTEt8Xr92noWpYqlERA",
      authDomain: "vektolab-c9ac6.firebaseapp.com",
      projectId: "vektolab-c9ac6",
      storageBucket: "vektolab-c9ac6.firebasestorage.app",
      messagingSenderId: "524336407537",
      appId: "1:524336407537:web:d61fc9921813ff2398da50",
      measurementId: "G-PFBB7BR5DY"
    };
    const vapidKey = "BGquMlxx3ZcZqYPdGj1UxcVg5Qsw3On-LF0YyNSUa4zEJQrJkzf2mYEcC7Nr_FeWA7FifpaG3nrrMKQ1U7q1FC4";
    const SW_PATH = "./sw.js";

    const notifyLabel = document.getElementById("notifyBtnLabel");
    const state = (text, disabled = false) => {
      if (notifyLabel) notifyLabel.textContent = text;
      notifyBtn.disabled = disabled;
    };

    const explainError = (err) => {
      const code = (err && err.code) || "";
      const message = (err && err.message) || String(err || "Error desconocido");
      console.error("[Vektolab] FCM:", code, message, err);
      if (code === "messaging/permission-blocked") return 'Chrome bloqueó las notificaciones. Desde la barra de direcciones, abra Permisos del sitio → Notificaciones → Permitir, y vuelva a intentarlo.';
      if (code === "messaging/unsupported-browser") return "Este navegador no es compatible con las notificaciones push de Firebase. Pruebe con la última versión de Chrome o Edge.";
      if (code === "messaging/failed-service-worker-registration") return "El Service Worker de Vektolab no pudo activarse. Recargue la página con Ctrl+F5 y vuelva a intentarlo.";
      if (code === "messaging/token-subscribe-failed") return "Firebase no pudo registrar este navegador para recibir notificaciones push. Revise la clave VAPID y los ajustes de Cloud Messaging del proyecto.";
      if (code === "messaging/invalid-app-id") return "La configuración de Firebase de esta versión de Vektolab no coincide con la aplicación web del proyecto.";
      return `${message}${code ? `\n\nCódigo: ${code}` : ""}`;
    };

    const registerTokenOnServer = async (token) => {
      try {
        const response = await fetch(String(window.VEKTOLAB_PUSH_API || "").replace(/\/$/, "") + "/api/register-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        if (!response.ok) throw new Error(`Servidor de notificaciones respondió HTTP ${response.status}`);
        return true;
      } catch (err) {
        console.warn("[Vektolab] Token FCM obtenido, pero no se pudo registrar en el servidor:", err);
        return false;
      }
    };

    const boot = async () => {
      if (!("serviceWorker" in navigator)) { state((typeof t === "function" ? t("notify_unsupported") : "Not supported"), true); return; }
      if (!("Notification" in window)) { state((typeof t === "function" ? t("notify_unsupported") : "Not supported"), true); return; }
      if (!window.isSecureContext) { state((typeof t === "function" ? t("notify_https") : "HTTPS required"), true); return; }
      try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const supported = await firebase.messaging.isSupported();
        if (!supported) { state((typeof t === "function" ? t("notify_unsupported") : "Not supported"), true); return; }

        const messaging = firebase.messaging();
        const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "./" });
        await navigator.serviceWorker.ready;

        const obtainToken = async () => {
          const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: registration });
          if (!token) throw new Error("Firebase no devolvió un token FCM.");
          localStorage.setItem("vektolab_fcm_token", token);
          await registerTokenOnServer(token);
          return token;
        };

        if (Notification.permission === "granted") {
          try { await obtainToken(); state(typeof t === "function" ? t("notify_active") : "On"); }
          catch (err) { console.warn("[Vektolab] No se pudo recuperar el registro FCM:", err); state(typeof t === "function" ? t("notify_label") : "Enable"); }
        } else if (Notification.permission === "denied") {
          state((typeof t === "function" ? t("notify_blocked") : "Blocked"), true);
          notifyBtn.title = typeof t === "function" ? t("notify_blocked_title") : "Notifications are blocked in the browser";
        } else {
          state(typeof t === "function" ? t("notify_label") : "Enable");
        }

        notifyBtn.addEventListener("click", async () => {
          if (Notification.permission === "denied") {
            alert(typeof t === "function" ? t("notify_denied_alert") : 'Chrome has blocked notifications for Vektolab. Open site permissions and select "Allow".');
            return;
          }
          notifyBtn.disabled = true;
          if (notifyLabel) notifyLabel.textContent = typeof t === "function" ? t("notify_activating") : "Enabling…";
          try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") { state(typeof t === "function" ? t("notify_label") : "Enable"); return; }
            await obtainToken();
            state(typeof t === "function" ? t("notify_active") : "On");
            alert(typeof t === "function" ? t("notify_success") : "Notifications enabled successfully!");
          } catch (err) {
            state(typeof t === "function" ? t("notify_label") : "Enable");
            alert((typeof t === "function" ? t("notify_fail") : "Could not enable notifications.") + "\n\n" + explainError(err));
          }
        });

        messaging.onMessage((payload) => {
          const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "Vektolab";
          const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "Tienes una nueva notificación.";
          navigator.serviceWorker.ready.then(reg => reg.showNotification(title, {
            body,
            icon: (payload.notification && payload.notification.icon) || "./icon-192.png",
            badge: (payload.notification && payload.notification.badge) || "./icon-192.png",
            data: { url: (payload.data && payload.data.url) || "./index.html" }
          })).catch(err => console.warn("[Vektolab] No se pudo mostrar la notificación en primer plano:", err));
        });
      } catch (err) {
        console.error("[Vektolab] No se pudo iniciar FCM:", err);
        if (err && err.code === "messaging/unsupported-browser") state((typeof t === "function" ? t("notify_unsupported") : "Not supported"), true);
        else state(typeof t === "function" ? t("notify_label") : "Enable");
      }
    };

    boot();
  }

  /* ----- Instalar app (PWA) ----- */
  function wireInstall() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js", { scope: "./" })
          .then(() => console.log("[Vektolab] PWA service worker activo"))
          .catch(err => console.warn("[Vektolab] No se pudo registrar el service worker:", err));
      });
    }

    let deferredPrompt = null;
    const installBtn = document.getElementById("installAppBtn");

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      if (installBtn) installBtn.style.display = "inline-flex";
    });

    if (installBtn) {
      installBtn.addEventListener("click", async () => {
        if (!deferredPrompt) {
          alert((typeof t === "function" ? t("install_unavailable") : null) || 'Para instalar la app: en Chrome/Edge/Android use el menú (⋮) → "Instalar aplicación"; en iPhone/iPad use Compartir → "Añadir a pantalla de inicio". Si ya la tiene instalada, no hace falta hacerlo de nuevo.');
          return;
        }
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.style.display = "none";
      });
    }

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      if (installBtn) installBtn.style.display = "none";
    });
  }

  function init() {
    injectStyleOnce();
    injectMarkupOnce();
    wireModals();
    wireNotifications();
    wireInstall();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
