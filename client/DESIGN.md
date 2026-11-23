# Diseño · Libro de caja

## Puesto de caja

La superficie de operación combina una cuadrícula de movimientos con un arqueo lateral, sin navegación de dashboard ni decoración que compita con la captura. La identidad entra por la barra azul petróleo, la escala de texto y el contraste entre la hoja blanca y el fondo verde grisáceo. El gesto distintivo es comparar lado a lado el efectivo esperado y el contado.

## Tokens

| Uso | Valor |
| --- | --- |
| Barra | `#103C47` |
| Acción y cursor | `#145666` |
| Fondo de página | `#F3F7F6` |
| Superficie | `#FFFFFF` |
| Fondo de cabecera y selección suave | `#EAF2F1` |
| Texto | `#142C30` |
| Texto secundario | `#4B6267` |
| Borde | `#CBD9D8` |
| Foco | `#17677B` |
| Arqueo cuadrado | texto `#165C40`, fondo `#E5F4EB` |
| Diferencia de arqueo | texto `#70420A`, fondo `#FFF0D8` |
| Error de operación | texto `#742331`, fondo `#FFF4F4` |

- **Tipografía:** Segoe UI o sans del sistema; título de 1.85–2.4 rem, encabezados de 1.22 rem, números tabulares alineados a la derecha.
- **Controles:** Button, Input y Label de shadcn/ui, selectores y áreas de texto nativos. Foco perceptible, estado deshabilitado y etiquetas explícitas por fila.
- **Composición:** ancho máximo de 1320 px. El arqueo pasa debajo de los movimientos a 1010 px; a 620 px la captura agrupa controles en dos líneas y mantiene el importe junto a la acción de quitar.
- **Estados:** no usar el color por sí solo. La diferencia empareja la palabra «Faltante» o «Sobrante» con su valor; «Sin conteo» es distinto de «Cuadra».
