# Piloto · Un turno en paralelo con papel

**Objetivo:** comprobar durante un turno real que el libro digital se puede operar con el teclado y que reproduce los mismos movimientos y totales que el papel. No se da por completado hasta que el cajero y el responsable revisen el resultado.

## Antes de abrir

1. Elegir **fecha, turno y cajero responsable**. Verificar que la fecha que muestra la aplicación corresponda al establecimiento. Si se cambia `BAKERY_TIME_ZONE` en `.env`, reiniciar la aplicación y comprobarla de nuevo antes de capturar.
2. Usar una computadora de la panadería. Si se ejecuta localmente en esa computadora, abrir `http://127.0.0.1:5174`. No exponer Vite ni PostgreSQL a la red para habilitar otra computadora; usar el despliegue con HTTPS descrito en el [README](README.md).
3. Crear una cuenta individual con rol `cajero` y comprobar que puede entrar. No usar la cuenta de administrador para la captura. No compartir contraseñas por chat ni guardarlas en este documento.
4. Verificar que no haya un corte de demostración para esa fecha y turno. No usar `db:seed:demo` en la base del piloto. Si el turno ya existe o el trabajo es solo un ensayo, resolverlo primero en una base aparte; no borrar ni alterar cortes de operación.
5. Mantener el registro en papel como respaldo del piloto. Registrar solo operaciones en efectivo; tarjeta y transferencia quedan fuera de la comparación.

## Durante el turno

1. Contar el fondo inicial y registrar el mismo importe en papel y en el corte digital.
2. Anotar las ventas por categoría y registrar por separado gastos, retiros y ventas especiales. Guardar periódicamente. Identificar qué ventas ya entraron en cada total para no registrar dos veces el efectivo.
3. Confirmar que aparece «Movimientos guardados». Si falla, conservar el borrador en esa pestaña y continuar en papel hasta recuperar el acceso. Revisar los movimientos ya guardados antes de volver a capturar para evitar duplicados. El borrador de la sesión no sustituye al papel ante el cierre de la pestaña o una falla del equipo.
4. Antes del cierre, comparar papel y aplicación: fondo, ingresos, egresos y esperado. Si difieren los registros, corregir el corte **mientras está abierto**. Contar el efectivo físico y escribir ese monto, sin ajustarlo para forzar un cuadre.
5. Revisar el resultado del arqueo en ambos registros. Si hay faltante o sobrante real, consignar una explicación breve y cerrar solo con aprobación del responsable del piloto. Una vez cerrado no se reabre.

## Criterio de aceptación

| Comprobación | Resultado esperado |
| --- | --- |
| Captura | El cajero abre y guarda con su propia cuenta. |
| Totales | Fondo, ingresos, egresos y efectivo esperado coinciden con el papel, al centavo. |
| Arqueo | El contado y la diferencia coinciden; si no cuadra, hay explicación. Un faltante real no invalida el piloto si coincide en ambos registros. |
| Historial | El corte figura como cerrado, con fecha, turno y responsable correctos. |
| Archivos | PDF y XML coinciden con el corte cerrado; revisar al menos ingresos, egresos, contado y diferencia. |

**Si algo falla:** mantener el papel como fuente operativa hasta resolverlo. Si se detecta un error después del cierre, conservar el corte y documentar la incidencia por separado con el responsable; no corregir la base manualmente ni simular un nuevo turno para cuadrar.

**Acta breve (guardar fuera del repositorio):** fecha y turno · cajero y responsable · identificador de corte (en el XML) · comprobaciones aprobadas o pendientes · incidencias y decisión de continuar. No adjuntar datos contables o contraseñas a tickets públicos.

Si se apagó la computadora, vuelve a iniciar el entorno siguiendo el [README](README.md). Si ya tienes el entorno completo iniciado en Docker, no ejecutes `npm run dev` en paralelo: ambos intentarán usar el puerto de la aplicación.
