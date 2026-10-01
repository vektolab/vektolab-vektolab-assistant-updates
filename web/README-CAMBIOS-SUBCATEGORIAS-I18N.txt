VEKTOLAB — Cambios de esta entrega
====================================

1) Tarjeta "Ver más" del catálogo
   - Ahora tiene exactamente el mismo ancho que las demás tarjetas cuando
     hay pocos productos en la fila, y su texto + botón quedan centrados.
   - Archivo: index.html (CSS).

2) Encabezado del index
   - Mismo estilo (fondo, z-index) que el encabezado de producto.html.

3) Texto principal del index
   - Título: "¿Qué vamos a crear hoy?" (más grande).
   - Subtítulo: una sola línea ("Diseños listos para descargar o personalizar.").

4) Ficha de producto (producto.html)
   - Se agregó un ícono de flecha "volver atrás" junto a "Inicio" en el
     breadcrumb (usa el historial del navegador; si no hay historial,
     vuelve al catálogo).

5) Categorías y subcategorías
   - En la barra principal y en el modal "Ver más" del catálogo, cada
     categoría con subcategorías muestra una flechita hacia abajo.
   - Al tocar la categoría se despliega una fila con sus subcategorías
     (ej. Decoración → Cuadros / Floreros / Macetas / Lámparas).
   - El modal ahora también muestra TODAS las categorías principales
     (antes se ocultaban).

6) Panel de administración (admin-tienda.html)
   - Nuevo campo "Subcategoría" al cargar o editar un producto.
   - Se guarda, se edita y se muestra en la tabla de productos.

7) Backend (vektolab-api-worker-CORS.js)
   - Se agregó la columna "subcategory" a la base de datos.
   - IMPORTANTE: tu Worker ya tenía un mecanismo de auto-migración
     (ensureSchema) que agrega columnas nuevas solas la primera vez que
     se ejecuta tras publicar. NO hace falta correr ningún SQL a mano.

8) Traducción unificada (nuevo archivo i18n.js)
   - Se extrajo el diccionario de 19 idiomas (antes solo vivía en
     index.html) a un archivo compartido: i18n.js
   - index.html y producto.html ya lo incluyen (<script src="./i18n.js">)
   - producto.html ahora tiene un selector de idioma funcional en el
     encabezado (antes era solo un link decorativo).
   - El asistente virtual (asistente.js) también usa este diccionario
     para su texto (título, subtítulo, placeholder, saludo, mensajes).

   Si en el futuro agregás una página nueva y querés que también hable
   varios idiomas, alcanza con incluir, en este orden:
     <script src="./i18n.js"></script>
     ... (el resto de tus scripts)
   y marcar los textos con data-i18n="clave" / data-i18n-html="clave" /
   data-i18n-placeholder="clave" / data-i18n-title="clave" /
   data-i18n-aria-label="clave".

   Nota de alcance: el panel de administración (admin-tienda.html) NO
   se tradujo, porque es una herramienta interna que usás vos, no una
   página que ve el público. Si querés que también hable varios
   idiomas, decímelo y lo agrego.

9) Asistente virtual — búsqueda de diseños
   - Si alguien le escribe al asistente algo como "necesito un florero"
     o "un carro de bomberos", el asistente ahora busca en tu catálogo
     real (vía /api/products) por nombre, descripción, categoría,
     subcategoría, tags y palabras clave, y muestra hasta 4 diseños
     como tarjetas clicables que llevan directo a la ficha del
     producto.
   - Si además hay una pregunta frecuente relacionada, la muestra
     también.
   - Para que la búsqueda encuentre más cosas, conviene completar bien
     el campo "Palabras clave" (keywords) de cada producto en el panel
     de administración.
