# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Cajero:** abre el turno, registra ingresos y egresos en una computadora, cuenta el efectivo y cierra caja. El teclado es el medio principal de captura; móvil y tableta son secundarios.
- **Administrador:** supervisa los cortes, consulta el historial y los totales del periodo, revisa diferencias de arqueo y descarga respaldos.

## Product Purpose

Sustituir el libro de caja en papel de una panadería por un registro por fecha y turno. Un corte completo permite reconstruir lo que entró y salió, compararlo con el efectivo contado y consultar el mismo resultado en el historial, PDF y XML.

## Positioning

Es un libro operativo de efectivo, no un sistema de punto de venta ni de contabilidad fiscal. Conserva la captura por filas que resulta familiar en papel, con cálculo inmediato y un cierre verificado en el servidor.

## Operating Context

- Flujo habitual: retomar el único corte propio abierto o abrir con un fondo inicial, capturar totales de ventas por categoría y otros movimientos por separado, revisar el efectivo esperado y registrar el conteo. Si el arqueo no cuadra, se exige una explicación antes de cerrar.
- El cajero utiliza `Enter` y `Tab` para capturar varias filas seguidas. Un error de guardado no debe borrar lo que escribió.
- Los turnos disponibles son matutino, vespertino y completo. La fecha se interpreta en la zona horaria de la panadería.
- El arqueo distingue cuatro estados: sin conteo, cuadra, faltante y sobrante. Contar cero no equivale a no haber contado.

## Capabilities and Constraints

- La primera versión registra **solo efectivo**. Tarjetas y transferencias quedan fuera del libro y del cálculo del arqueo.
- Una panadería y una moneda (MXN). Los importes se guardan y calculan sin punto flotante.
- Historial por mes o rango, con ingresos, egresos, utilidad de caja y diferencia acumulada. La utilidad excluye el fondo inicial y no se presenta como utilidad fiscal.
- El PDF formal y el XML estructurado usan los datos oficiales del corte.
- No están definidos la zona horaria definitiva, la coexistencia del turno completo con otros turnos del mismo día, el reemplazo del cajero responsable ni el proceso para documentar correcciones después del cierre. El MVP no incluye reapertura.

## Evidence on Hand

- [`PLAN.md`](../PLAN.md) documenta las reglas y las fases del MVP; [`README.md`](../README.md) describe la infraestructura disponible.
- No se han aportado ejemplos del libro en papel ni archivos de identidad de la panadería.

## Product Principles

1. Priorizar la captura continua con teclado sobre los pasos y confirmaciones repetitivas.
2. Distinguir lo capturado, lo guardado y lo cerrado para que el cajero sepa qué falta.
3. Proteger la captura ante errores y evitar sobrescribir el trabajo de otra sesión.
4. Mantener resultados exactos y coherentes entre el corte, el historial y las exportaciones.

## Accessibility & Inclusion

La captura y el cierre se deben poder completar con teclado. El foco y los errores deben ser perceptibles, y el estado del arqueo debe comunicarse con texto, no solo mediante color. La interfaz usa español de México.
