# Actualizaciones de Vektolab Assistant

## 1. Programa

Los cambios de Electron, interfaz o funciones se publican mediante una nueva Release.

1. Cambia la versión en `package.json`.
2. Haz commit y push.
3. Crea un tag igual a la versión, por ejemplo `v0.5.3`.
4. GitHub Actions compilará y publicará el instalador.

El Assistant instalado comprobará la Release automáticamente y descargará la nueva versión.

## 2. Generadores y archivos

Los generadores están en `content/generadores/` y las imágenes en `content/imagenes/`.

Puedes agregar, reemplazar o eliminar estos archivos sin generar un nuevo `.exe`.

GitHub Actions actualiza `content/manifest.json`. El Assistant comprueba el contenido al iniciar y cada 30 minutos, y también desde el botón `Buscar actualizaciones`.

Para agregar un generador nuevo normalmente solo necesitas:

- `content/generadores/mi-generador.html`
- opcionalmente `content/imagenes/mi-generador.webp`

El Assistant descubre automáticamente los archivos HTML nuevos.
