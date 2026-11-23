# Grabar el recorrido de portafolio

[El video publicado](https://github.com/Nivi018/panaderia-libro-de-caja/releases/download/demo-portafolio/panaderia-recorrido.mp4) se grabó con Playwright sobre la aplicación real. El navegador muestra el cursor, los clics y la escritura de importes. El cajero se autentica antes de grabar; no se muestra la contraseña.

## Preparación y grabación

Desde la raíz, configura el entorno y levanta PostgreSQL según el [README](../README.md#desarrollo-local). La prueba usa una base PostgreSQL temporal, así que el usuario local necesita permiso para crear bases. No necesitas iniciar Vite ni Hono: Playwright los levanta en los puertos `15174` y `13000`.

```sh
npm ci
npx playwright install chromium
npm run build
npm run video:demo
```

El [guion](../tests/e2e/demo-video.spec.ts) abre un turno, registra una venta y un gasto, cierra con un faltante justificado y comprueba ambas descargas. La grabación queda en `video/portfolio/renders/panaderia-recorrido-original.webm`. La prueba no escribe en el libro habitual y elimina su base temporal al finalizar.

## Exportar el MP4

Con FFmpeg instalado, ejecuta desde la raíz:

```sh
ffmpeg -ss 0.70 -i video/portfolio/renders/panaderia-recorrido-original.webm -vf "scale=1728:1080:flags=lanczos,pad=1920:1080:96:0:0x103c47,setsar=1,fps=30" -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -an video/portfolio/renders/panaderia-recorrido.mp4
```

Revisa el inicio del video después de volver a grabar: ajusta `-ss` si la duración de la pantalla de carga varía. Los videos generados no se versionan con el código.
