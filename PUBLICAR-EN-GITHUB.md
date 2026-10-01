# Publicar una nueva versión

## Primera vez

Sube esta carpeta a GitHub como:

`vektolab/vektolab-vektolab-assistant-updates`

El repositorio debe ser público para que `electron-updater` pueda consultar las Releases sin autenticación.

## Nueva versión

1. Cambia el código.
2. En `package.json`, cambia por ejemplo:
   `0.5.2` → `0.5.3`
3. Haz commit y push.
4. Crea y sube el tag:
   `v0.5.3`
5. GitHub Actions compilará y creará la Release.

Ejemplo con Git:

```bash
git add .
git commit -m "Vektolab Assistant 0.5.3"
git push
git tag v0.5.3
git push origin v0.5.3
```

Después de publicar la Release, una instalación existente comprobará automáticamente la nueva versión.

## No publiques secretos

No pongas contraseñas, claves privadas, tokens de Firebase, PayPal, Patreon ni archivos `.env` dentro del repositorio.
