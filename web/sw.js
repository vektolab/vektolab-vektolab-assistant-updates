// Firebase Cloud Messaging (FCM) background support.
// Compat is used here because this file is a classic service worker.
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyB-ZWsv774bOZf_cTEt8Xr92noWpYqlERA",
  authDomain: "vektolab-c9ac6.firebaseapp.com",
  projectId: "vektolab-c9ac6",
  storageBucket: "vektolab-c9ac6.firebasestorage.app",
  messagingSenderId: "524336407537",
  appId: "1:524336407537:web:d61fc9921813ff2398da50",
  measurementId: "G-PFBB7BR5DY"
});

const fcmMessaging = firebase.messaging();

fcmMessaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "Vektolab";
  const options = {
    body: payload.notification?.body || payload.data?.body || "Tienes una nueva notificación.",
    icon: payload.notification?.icon || "./icon-192.png",
    badge: payload.notification?.badge || "./icon-192.png",
    data: { url: payload.data?.url || "./index.html" }
  };
  return self.registration.showNotification(title, options);
});

const CACHE_NAME = "vektolab-pwa-v6-coupons-i18n-fix";
const APP_SHELL = [
  "./",
  "./index.html",
  "./logo.png",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.webmanifest",
  "./patreon-gate.js",
  "./generadores/cartel-luna.html",
  "./generadores/cortador-galletas.html",
  "./generadores/placa-nombre-3d.html",
  "./generadores/llavero.html",
  "./generadores/silueta-2d.html",
  "./imagenes/silueta-2d.webp",
  "./imagenes/placa-nombre-3d.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // HTML: network-first so published changes appear quickly; cache is fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    // JS: network-first. Estos archivos cambian seguido (i18n, lógica de
    // cupones, etc.) y con cache-first quedaban pegados a una versión vieja
    // aunque se subiera una nueva al repo. Si no hay red, se usa la caché.
    if (url.pathname.endsWith(".js")) {
      event.respondWith(
        fetch(request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            return response;
          })
          .catch(() => caches.match(request))
      );
      return;
    }

    // Resto de assets locales (imágenes, css, etc.): cache-first.
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }))
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
