/* Vektolab — Traducción automática de contenido dinámico y de claves i18n.
   Fuente por defecto: español (textos de admin y diccionario base).
   Uso:
     await VKTranslate.translateText("Llavero corazón", "ja");
     await VKTranslate.translateAll(["a","b"], "zh");
     await VKTranslate.translateText("Price", "ja", "en"); // fuente inglés
*/
(function () {
  "use strict";

  const GOOGLE_LANG = {
    es: "es", en: "en", pt: "pt", "pt-pt": "pt-PT", it: "it", fr: "fr",
    de: "de", tr: "tr", ru: "ru", ar: "ar", zh: "zh-CN", ja: "ja",
    ko: "ko", fil: "tl", id: "id", sv: "sv", no: "no", af: "af"
  };

  const CACHE_PREFIX = "vk_tr_v2:";

  function cacheKey(text, from, to) {
    return CACHE_PREFIX + from + ">" + to + ":" + text;
  }
  function readCache(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  async function translateText(text, lang, sourceLang) {
    const original = text == null ? "" : String(text);
    const clean = original.trim();
    const from = sourceLang || "es";
    if (!clean || !lang) return original;
    if (lang === from) return original;

    const googleFrom = GOOGLE_LANG[from] || from;
    const googleTo = GOOGLE_LANG[lang] || lang;
    const key = cacheKey(clean, googleFrom, googleTo);
    const cached = readCache(key);
    if (cached != null) return cached;

    try {
      const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" +
        encodeURIComponent(googleFrom) + "&tl=" + encodeURIComponent(googleTo) +
        "&dt=t&q=" + encodeURIComponent(clean);
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
      const translated = segments.map(function (seg) {
        return Array.isArray(seg) ? (seg[0] || "") : "";
      }).join("");
      const result = translated || original;
      writeCache(key, result);
      return result;
    } catch (e) {
      return original;
    }
  }

  // Traduce en lotes para no saturar la API ni la URL
  async function translateAll(list, lang, sourceLang) {
    const items = list || [];
    const out = new Array(items.length);
    const CHUNK = 12;
    for (let i = 0; i < items.length; i += CHUNK) {
      const slice = items.slice(i, i + CHUNK);
      const part = await Promise.all(slice.map(function (text) {
        return translateText(text, lang, sourceLang);
      }));
      for (let j = 0; j < part.length; j++) out[i + j] = part[j];
    }
    return out;
  }

  window.VKTranslate = { translateText, translateAll };
})();
