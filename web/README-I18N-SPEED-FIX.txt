VEKTOLAB — Fix idioma completo + carga más rápida
=================================================

Idioma
------
1. Idioma por defecto: English (en). Si no hay preferencia guardada, la tienda
   arranca en inglés.

2. Fallback de traducciones: si una clave no existe en el idioma elegido, se
   usa el texto en inglés (mensaje equivalente), ya no el español. Así la
   tienda completa habla el idioma seleccionado.

3. Idiomas incompletos (fr, de, it, etc.): se rellenan automáticamente con las
   claves en inglés que faltaban, para que no queden textos en español.

4. Asistente virtual: títulos, placeholders, saludo y mensajes de i18n se
   traducen con el diccionario. Las respuestas FAQ y los nombres de diseños
   se traducen al vuelo con el mismo servicio de Google (VKTranslate) y se
   cachean. Al cambiar de idioma, el asistente actualiza textos y chips.

5. Textos fijos que estaban en español (badges Nuevo/Popular, Favorito,
   "Agregar", pista del botón "Ver más", atributos title/aria) pasan por i18n.

6. HTML lang="en" y textos visibles de fallback en inglés en index, producto,
   header compartido, etc.

Velocidad
---------
1. Miniaturas del catálogo convertidas de PNG (~0.7–1.2 MB c/u) a WebP
   (~12–49 KB). Referencias actualizadas en index.html, producto.html y sw.js.

2. Scripts de Firebase con defer (no bloquean el primer pintado).

3. loading="lazy" ya estaba en las tarjetas; se mantiene.

Cómo desplegar
--------------
Subí el contenido de la carpeta vektolab (o el ZIP) a Cloudflare Pages /
tu hosting como siempre. No hace falta tocar el Worker de la API.

Notas
-----
- Los textos de productos que vienen de la API (siempre en español) se
  siguen traduciendo al vuelo cuando el idioma no es "es".
- Si el servicio de traducción no responde, se muestra el texto original
  (no se rompe la página).
