# Vektolab Assistant — Genesis 2.0

Vekto es el acompañante de escritorio de Vektolab: una presencia pequeña, amigable y útil que da acceso rápido a los generadores y diseños sin reemplazar la web.

## Principios de esta versión

- El avatar es una ventana independiente del menú.
- Abrir/cerrar el menú nunca redimensiona ni reposiciona el avatar.
- El avatar se mueve únicamente cuando el usuario lo arrastra.
- La personalidad se expresa con la animación de Vekto, el pequeño efecto al agarrarlo y la respuesta al soltarlo, sin física de pantalla que pueda interferir con el menú.
- El menú aparece anclado a la posición actual del avatar.
- El contenido se sincroniza desde GitHub y funciona con una copia local si no hay conexión.
- Los generadores siguen siendo locales y conservan su sistema Patreon.
- La aplicación puede comprobar actualizaciones de la aplicación y del contenido.
- Solo se permite una instancia de Vekto.
- El avatar no crea un icono independiente en la barra de tareas.

## Desarrollo

1. Instalar Node.js 22+.
2. Ejecutar `npm install`.
3. Ejecutar `npm start`.
4. Para crear el instalador Windows: `npm run dist`.
