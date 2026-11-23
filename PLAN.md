# Plan de implementación — Libro de caja de la panadería

**Objetivo:** sustituir el registro en papel por un flujo de apertura, captura, arqueo y cierre que funcione con teclado, preserve importes exactos y permita consultar y exportar los cortes. El éxito del MVP se mide completando ese flujo con datos de prueba y reproduciendo los mismos totales en captura, historial, PDF y XML.

**Alcance:** una panadería, moneda MXN, un corte por fecha y turno, dos roles y exportaciones por corte. No incluye facturación fiscal, inventario, integración bancaria ni gestión de sucursales. La «utilidad neta» del dashboard significa ingresos menos egresos registrados en caja; no es utilidad contable fiscal.

## 1. Arquitectura y organización

Monorepo TypeScript estricto con npm workspaces y un solo lockfile:

```text
panaderia/
├── docker-compose.yml              # PostgreSQL 16, servicios de desarrollo y migración
├── compose.prod.yml                # Configuración de producción sobre la base
├── Dockerfile                      # Build por etapas; imagen final sin hot reload
├── .env.example                    # Nombres y ejemplos no sensibles
├── server/
│   ├── drizzle.config.ts
│   ├── drizzle/                    # SQL y metadatos versionados
│   └── src/{auth,db,routes,services,scripts}/
│       └── db/schema.ts            # Fuente de verdad de base de datos (server/src/db/schema.ts)
├── client/src/{features,components,lib,stores}/
└── packages/domain/src/            # Esquemas Zod, catálogo y cálculos puros
```

- **Desarrollo:** Vite sirve la SPA y reenvía `/api` a Node.js con Hono. Compose levanta PostgreSQL con volumen y verificación de salud, y permite ejecutar la app y las migraciones.
- **Producción:** un mismo origen HTTPS sirve la SPA compilada y `/api`; PostgreSQL queda en red privada. Las migraciones corren como tarea única del despliegue, no al iniciar cada instancia. El fallback de la SPA no intercepta `/api/*`.
- **Configuración:** documentar `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `BAKERY_NAME`, `BAKERY_TIME_ZONE` y `SEED_ADMIN_PASSWORD`. Validar entorno del servidor al arrancar; no publicar secretos en variables `VITE_*`.
- **Contrato:** Hono registra los endpoints con rutas encadenadas, `@hono/zod-validator` y códigos HTTP explícitos. Exporta `AppType` desde un punto de entrada solo de tipos; la SPA lo importa con `import type` y usa `hc<AppType>` desde `hono/client`. Se comparte la versión de Hono, se comprueba el contrato en CI y no se empaqueta Drizzle ni el código de autenticación del servidor en la SPA. Se tipifican también los errores comunes que provienen del middleware.
- **Estado:** TanStack Query consume directamente los métodos de `hc`, unifica errores y mantiene la caché de datos remotos. React Hook Form y `useFieldArray` controlan la edición activa; Zustand guarda filtros, turno seleccionado y borradores por usuario y corte. Los borradores nunca sustituyen el estado confirmado del servidor ni almacenan credenciales.

## 2. Modelo y reglas de negocio

| Tabla | Modelo y restricciones |
|---|---|
| `user`, `session`, `account`, `verification` | Esquema compatible con la versión fijada de Better Auth y su adaptador Drizzle. `user.role` admite `admin` y `cajero`; el valor por defecto es `cajero` y no se acepta desde el cliente. |
| `daily_ledgers` | UUID; `date` como `DATE` (`YYYY-MM-DD`); `shift`: `matutino`, `vespertino`, `completo`; `openingBalance` y `physicalCashCount` como `numeric(12,2)` (el segundo nullable); `notes`; `status`: `abierto` o `cerrado`; `createdBy` FK; `createdAt` y `updatedAt` con zona; `version` entera para concurrencia. Unicidad en `(date, shift)`. |
| `ledger_entries` | UUID; `ledgerId` FK con `ON DELETE CASCADE`; `type`: `ingreso` o `egreso`; `category` y `concept` con longitud acotada; `amount` `numeric(12,2)`; `createdAt` con zona. Índice por corte y orden de captura. |

- **Dinero exacto:** importes JSON como cadenas decimales canónicas, p. ej. `"1234.50"`; nunca `float` ni conversiones a `Number` para cálculos. Se rechazan más de dos decimales y valores fuera de rango antes de persistir. El dominio calcula con centavos `bigint` y serializa a cadenas; PostgreSQL agrega con `numeric` sin restringir las sumas a la precisión de una sola fila. Movimientos estrictamente positivos; fondo y conteo no negativos.
- **Cálculos:** `esperado = fondo + ingresos − egresos`; `diferencia = contado − esperado`. `null` es «sin arqueo» y `0.00` es «cuadra»; negativo es «faltante» y positivo «sobrante». El cliente calcula una vista previa y el servidor deriva el resumen de los datos persistidos; no acepta totales enviados por la SPA.
- **Qué entra en caja:** el MVP registra solo efectivo, como quedó confirmado en [el contexto de producto](client/PRODUCT.md). Tarjeta y transferencia quedan fuera y no afectan el arqueo. El catálogo es compartido y valida la combinación de tipo y categoría (p. ej., `pan_dulce` como ingreso, `proveedores` como egreso y `otros` para ambos).
- **Cierre:** exige un conteo, incluso si es cero. Un corte cerrado no se edita, elimina ni reabre en el MVP. Cualquier escritura contable toma un bloqueo sobre el corte, comprueba permisos, estado y versión, y avanza la versión en la misma transacción. Esto impide editar un turno que otra sesión acaba de cerrar y evita sobrescrituras silenciosas.
- **Fecha operativa:** la apertura y los filtros usan la fecha local de la panadería, con zona IANA configurable (`America/Mexico_City` solo como ejemplo). Los timestamps representan instantes; no se usa la fecha UTC para elegir el turno o mes.
- **Historial:** propuestas iniciales: KPIs de cortes cerrados, calculados sobre todo el rango filtrado y no solo sobre la página visible. La utilidad excluye el fondo inicial. La diferencia acumulada suma diferencias con signo y advierte que faltantes y sobrantes pueden compensarse. Los cortes abiertos pueden consultarse mediante filtro sin alterar los KPIs.

## 3. API y permisos

Se monta Better Auth en `/api/auth/*`; las demás rutas de `/api/*` pasan por un middleware de sesión. La autenticación usa correo y contraseña, cookies `HttpOnly` y `Secure` en producción, orígenes de confianza explícitos y sin registro público. La identidad, el rol y `createdBy` se resuelven en el servidor. El seed inicial habilita `admin@panaderia.local` con contraseña suministrada externamente; nunca queda en código ni se imprime. La creación de cajeros se hace mediante una operación administrativa fuera de la SPA en el MVP.

| Método y ruta | Propósito |
|---|---|
| `GET /api/ledgers` | Historial paginado con mes o rango, turno y estado; orden estable por fecha e ID. |
| `GET /api/ledgers/summary` | KPIs del periodo para cortes cerrados, sin paginación. |
| `POST /api/ledgers`, `GET /api/ledgers/:id` | Abrir y consultar un corte, con movimientos y resumen oficial en el detalle. |
| `PATCH /api/ledgers/:id`, `DELETE /api/ledgers/:id` | Actualizar datos de apertura/arqueo o eliminar un corte abierto cuando el rol lo permite. |
| `POST /api/ledgers/:id/entries`, `PATCH/DELETE /api/ledgers/:id/entries/:entryId` | CRUD de movimientos; la lectura forma parte del detalle del corte. Se verifica que cada movimiento pertenezca al corte de la URL. |
| `POST /api/ledgers/:id/entries/batch` | Guardar altas, ediciones y bajas de la cuadrícula de manera atómica; devuelve el detalle y resumen canónicos. |
| `POST /api/ledgers/:id/close` | Registrar el conteo final y cerrar de forma atómica. |

**Permisos propuestos:** ambos roles consultan historial y exportan cortes cerrados. El cajero abre cortes y modifica o cierra los cortes abiertos que creó; el admin actúa sobre cualquier corte abierto y es el único que puede eliminarlo. La API devuelve errores uniformes con `code`, `message` y, cuando aplique, errores por campo: `401` sin sesión, `403` sin permiso, `404` si no existe el recurso, `409` por duplicado/cierre/versión, y `400` por validación.

## 4. Experiencia de captura y exportación

**Requisito previo a la UI:** cargar `impeccable` antes de diseñar o construir vistas o componentes. La skill oficial está instalada y el contexto del workspace `client` quedó documentado en [PRODUCT.md](client/PRODUCT.md).

- **Ingreso:** pantalla en español con un objetivo único, errores accionables y navegación al corte activo o al historial según corresponda.
- **Captura:** ingresos y egresos claramente diferenciados; `Tab` conserva la navegación nativa; `Enter` avanza o agrega una fila desde la última celda válida, sin enviar todo el formulario accidentalmente. El resumen sí cambia mientras se escribe. El arqueo se distingue con texto además de color, y los errores de campo preservan el foco y lo capturado.
- **Guardado:** TanStack Query cancela refetches en curso, toma una copia de caché y aplica la actualización optimista al detalle. Si falla, revierte la caché y conserva el borrador. Con `409` recupera la versión oficial y deja revisar las diferencias sin reenviar automáticamente. En éxito reemplaza los datos optimistas por los de la API e invalida historial y KPIs. Se serializan los guardados de un mismo corte y se evita ejecutar el cierre con cambios sin guardar.
- **Historial:** filtros con contexto visible, estados vacío/error/carga diferenciados y paginación. Verificación de accesibilidad con teclado, foco visible, contraste y lectores de pantalla; en pantallas estrechas, ninguna acción principal depende del desplazamiento horizontal.
- **PDF:** generación cliente desde el detalle canónico de un corte cerrado, con carga diferida de `jspdf` y `jspdf-autotable`. Incluye encabezado, fecha, turno, responsable, dos tablas, resumen, arqueo y firma; importes como `$1,234.50 MXN`. Probar acentos y cortes de página.
- **XML:** el mismo origen de datos que el PDF, en UTF-8, con raíz `<LibroContable>` y nodos `<Metadatos>`, `<Ingresos>`, `<Egresos>` y `<BalanceGeneral>`. Generación nativa con nodos de texto y `XMLSerializer`, sin concatenar contenido del usuario. Importes sin formato de presentación; probar que el archivo vuelve a parsear con `&`, `<`, comillas y acentos.

## 5. Fases y criterios de salida

| Fase | Entregables | Criterio verificable |
|---|---|---|
| **1. Infraestructura y esquema** | Workspaces, TS estricto, Compose, Dockerfile, `.env.example`, configuración Drizzle y migración inicial. | `docker compose config` pasa; PostgreSQL 16 inicia saludable; `db:migrate` funciona desde una base vacía y una segunda ejecución no repite cambios. Se verifican tipos monetarios, restricciones, FK e índices en PostgreSQL real. |
| **2. Autenticación** | Adaptador Drizzle, montaje Better Auth, middleware Hono, permisos y seed administrativo idempotente. | Inicio y cierre de sesión funcionan; una petición sin sesión recibe `401`; un cajero no puede asumir el rol admin ni mutar cortes ajenos. |
| **3. API y dominio** | CRUD, lotes, arqueo, cierre, filtros, agregación y contrato RPC. | Las pruebas cubren centavos exactos, límites, duplicados, rollback de lotes y competencia entre cerrar y editar. La SPA puede inferir cuerpos y respuestas con `hc<AppType>` sin tipos duplicados. |
| **4. UI de operación** | Skill `impeccable` aplicada, Tailwind/shadcn/ui, acceso, captura y dashboard. | Flujo de apertura a cierre usable con teclado; un guardado fallido no pierde filas; historial y filtros funcionan en móvil y escritorio. |
| **5. Exportación y entrega** | PDF, XML, `db:seed:demo` con cinco días reproducibles, pruebas E2E, README y guía de despliegue. | Flujo completo con corte cuadrado, sobrante, faltante y turno abierto; exportaciones coinciden con los datos oficiales. En entorno de prueba se restaura un respaldo y se consulta un corte. |

## 6. Verificación y operación

- **CI:** instalación con lockfile, lint, comprobación de tipos, pruebas unitarias, integración contra PostgreSQL 16 desde migraciones y build de producción; agregar E2E con Playwright al incorporar la SPA.
- **Rendimiento:** listas paginadas, agregados en PostgreSQL, guardado en lotes, consultas sin N+1 y exportadores fuera del bundle inicial. Medir consultas del historial y render de una captura extensa con datos representativos antes de fijar objetivos de latencia.
- **Operación:** documentar `.env`, arranque, migración, seed, backups y restauración. Separar `db:seed` de `db:seed:demo`, y prohibir datos demo en producción. No registrar cookies, contraseñas ni notas de caja; incluir identificador de petición en errores operativos.
- **Validaciones con la panadería antes de cerrar el contrato:** zona horaria exacta, si `completo` puede coexistir con otros turnos ese día, quién toma un turno si falta el cajero responsable y cómo se documenta una corrección posterior al cierre. Mientras no se confirme lo contrario, se aplica la unicidad por fecha y turno solicitada, sin un flujo de reapertura.

**Primer incremento implementable:** crear la estructura del monorepo, `docker-compose.yml`, `.env.example`, `server/drizzle.config.ts` y `server/src/db/schema.ts`; generar y aplicar la migración inicial en PostgreSQL 16. No iniciar componentes visuales en ese incremento.

### Referencias técnicas

- [Hono RPC: inferencia de rutas, respuestas y errores](https://hono.dev/docs/guides/rpc)
- [Better Auth: integración con Hono](https://www.better-auth.com/docs/integrations/hono)
- [Drizzle: tipos de PostgreSQL](https://orm.drizzle.team/docs/column-types/pg) y [migraciones](https://orm.drizzle.team/docs/migrations)
