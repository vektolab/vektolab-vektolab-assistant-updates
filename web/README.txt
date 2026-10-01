VEKTOLAB — Cómo subir a Cloudflare Pages
==========================================

Estructura (esta carpeta "vektolab" es la que subís):

  vektolab/
  ├── index.html                 ← página principal (catálogo)
  ├── generadores/
  │   └── silueta-2d.html        ← generador Silueta 2D
  └── imagenes/                  ← acá podés poner .webp / .png de miniatura

Cómo funciona la navegación
---------------------------
1) El usuario entra a index.html
2) Al tocar cualquier diseño del grid o del modal, abre:
     generadores/silueta-2d.html
3) Dentro del generador, el botón "Volver a inicio" apunta a:
     ../index.html
   (sube un nivel y vuelve al catálogo)

En Cloudflare Pages
-------------------
- Proyecto → Create → Upload assets  (o conectar Git)
- Subí TODO el contenido de esta carpeta vektolab (no la carpeta padre)
- Build command: (vacío)
- Output directory: /   (o dejá el default si subís el zip raíz)

Cuando agregues más generadores
-------------------------------
1) Guardá el HTML en generadores/nombre.html
2) En index.html, en el array DESIGNS, podés agregar un campo:
     url: "generadores/nombre.html"
   y en renderGrid usar ${d.url || "generadores/silueta-2d.html"}

Por ahora todos los diseños de ejemplo abren el mismo generador
(silueta-2d) para que veas el flujo completo funcionando.

Logo
----
index.html referencia logo.png. Si no lo tenés, el icono no se verá
pero la página funciona igual. Poné logo.png al lado de index.html.
