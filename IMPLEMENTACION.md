# Entrega e instalación · Libro de caja

El aplicativo se puede entregar **sin contar efectivo real durante el desarrollo**. La aprobación técnica usa datos ficticios; la aprobación operativa, si se decide hacerla, corresponde a la panadería después de instalarlo. No sustituyas una prueba técnica por un corte ficticio en la base de operación.

## 1. Verificar la entrega en desarrollo

- Ejecutar `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run build` y `npm run test:e2e` tal como indica el [README](README.md). La prueba de navegador crea su propia base temporal.
- Para una demostración manual, preparar una base de pruebas y ejecutar `db:seed:demo`; incluye cortes cuadrados, con faltante, con sobrante y abiertos.
- Confirmar que las imágenes `app` y `migrate` se compilan y que se puede restaurar un respaldo de prueba a una base nueva. Nunca ensayar la restauración sobre la base de operación.

## 2. Preparar el lugar de instalación

| Decisión | Qué debe quedar registrado |
| --- | --- |
| Equipo y acceso | Dónde correrá Docker, quién lo mantendrá y desde qué equipos accederá caja. |
| Origen HTTPS | Dominio y proxy inverso, con certificado válido en la computadora del cajero. `BETTER_AUTH_URL` debe coincidir con el origen HTTPS que se abrirá en el navegador. |
| Datos de la panadería | Nombre y zona horaria IANA en el archivo de entorno; confirmar que el día operativo que aparece en pantalla es correcto. |
| Cuentas | Un administrador y una cuenta individual por cajero. Entregar contraseñas por un canal seguro, nunca en `.env` ni en el repositorio. |
| Respaldos | Responsable, frecuencia, almacenamiento fuera del equipo y procedimiento de [restauración](README.md#respaldo-y-restauración). |

Mantén PostgreSQL en la red privada de Compose. No uses `compose.local.yml` en producción ni abras el puerto de PostgreSQL. Mantén la configuración y los volúmenes fuera del control de versiones.

## 3. Instalar y comprobar, sin tocar efectivo

1. Configurar un `.env.production` con secretos propios y seguir los [comandos Docker](README.md#ejecución-en-docker). No copiar la base de desarrollo: iniciar con un volumen nuevo para la instalación.
2. Confirmar en `docker compose ps -a` que PostgreSQL está saludable, la migración terminó con código `0` y la app está saludable. Desde la máquina anfitriona, `GET http://127.0.0.1:18080/readyz` debe devolver `200` y `{"status":"ready"}` (ajusta el puerto si cambiaste `APP_PORT`).
3. Comprobar desde la computadora del cajero que el sitio abre por HTTPS y acepta el inicio y cierre de sesión con una cuenta individual. **No abras un turno falso en producción.** Usa la base de pruebas si quieres ensayar el flujo completo.
4. Dar por terminada la instalación cuando estén confirmados la conectividad, los accesos y un respaldo inicial. Comparar un turno futuro con el papel es una validación adicional de la operación; la [guía del piloto](PILOTO.md) queda disponible para entonces.

**Si falla la instalación:** revisa `docker compose logs migrate app` con las mismas opciones de proyecto y entorno que usaste al arrancar. Conserva el volumen. Si hay datos previos y necesitas restaurar, valida el respaldo en otra base antes de cambiar la conexión.
