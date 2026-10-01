# Actualizar generadores sin crear un nuevo instalador

El Vektolab Assistant separa dos tipos de actualizaciones:

- **Programa:** cambios en Electron, interfaz o funciones. Requieren una nueva Release `vX.Y.Z`.
- **Contenido:** generadores, imágenes y archivos dentro de `content/`. NO requieren un nuevo `.exe`.

## Agregar un generador

1. Sube el HTML a `content/generadores/`.
2. Opcionalmente sube una imagen con el mismo nombre a `content/imagenes/` (por ejemplo `mi-generador.webp`).
3. Haz commit/push a `main`.
4. GitHub Actions actualizará `content/manifest.json` automáticamente.
5. El Assistant detectará el nuevo HTML y lo mostrará automáticamente.

El nombre se toma del `<title>` del HTML; si no existe, se genera a partir del nombre del archivo. `content/generators.json` sigue siendo opcional si más adelante quieres controlar manualmente nombres, imágenes o el orden.

No hace falta cambiar `package.json`, crear una Release ni reinstalar el programa.

## Modificar un generador existente

Reemplaza el HTML o la imagen en `content/`. El manifest calcula el SHA-256 y el Assistant descarga solamente los archivos que cambiaron.

## Eliminar un generador

Elimina el HTML y la imagen de `content/` y elimina también su entrada de `content/generators.json`. El Assistant eliminará los archivos remotos que ya no estén en el manifest.

## Frecuencia

Al iniciar, el Assistant comprueba el contenido. Después vuelve a comprobarlo cada 30 minutos. También puedes usar **Buscar actualizaciones**.
