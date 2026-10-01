# Vekto — Vektolab Assistant 0.6.1

Vekto es el asistente de escritorio de Vektolab. Queda disponible junto al escritorio, muestra los generadores y puede sincronizar nuevos generadores/archivos desde GitHub sin reinstalar la aplicación.

## Qué hace esta versión

- Vekto aparece como asistente flotante en el borde de la pantalla.
- Incluye una cara animada (`web/vekto-face.gif`). Puedes reemplazar ese GIF por tu propia animación sin cambiar el código.
- Se registra para iniciar automáticamente con Windows cuando está instalado.
- Queda disponible desde el área de notificaciones (bandeja del sistema).
- Comprueba actualizaciones del programa cada 30 minutos y también al iniciar.
- Comprueba contenido cada 30 minutos y al iniciar.
- El botón `Buscar actualizaciones` comprueba ambos sistemas.
- Los generadores siguen viviendo en `content/generadores/` y pueden añadirse/modificarse sin crear una nueva versión del instalador.
- El acceso de Patreon que ya existe dentro de los generadores no se reemplaza.

## Desarrollo

```bash
npm install
npm start
```

## Instalador

```bash
npm run dist
```

El instalador se genera en `release/`.

## GitHub

Repositorio configurado:
`https://github.com/vektolab/vektolab-vektolab-assistant-updates`

### Cambiar/agregar un generador

1. Copia el HTML a `content/generadores/`.
2. Copia su imagen a `content/imagenes/` usando el mismo nombre base si corresponde.
3. Haz commit y push a `main`.
4. GitHub Actions actualiza `content/manifest.json`.
5. Los Vekto instalados descargan únicamente los archivos que cambiaron.

No hace falta crear una Release para un nuevo generador.

### Cambiar el programa

Si modificas Electron, la interfaz o las funciones de Vekto:

1. Cambia la versión en `package.json`.
2. Haz commit.
3. Crea un tag como `v0.6.1`.
4. GitHub Actions crea la Release y el instalador.
5. Los Vekto instalados detectan la nueva versión y la descargan.

## Nota de seguridad

Los generadores HTML que se ejecutan localmente necesariamente llegan a la PC del usuario. El sistema Patreon puede controlar el acceso a la descarga/uso, pero no existe una forma absoluta de impedir que un usuario avanzado inspeccione código que su navegador/Electron ejecuta. Si en el futuro quieres proteger la lógica propietaria, conviene mover esa parte al backend y dejar en Vekto solamente la interfaz.
