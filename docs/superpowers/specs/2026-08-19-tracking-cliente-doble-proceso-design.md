# Tracking Performance: un cliente, dos procesos (Compra y Venta)

**Fecha:** 19-ago-2026
**Rama:** `feat/tracking-cliente-doble-proceso`
**Origen:** sugerencia de Matías Gomez (asesor, Central Real Estate Argentina), 18-ago-2026 06:06.

> "En Tracking Performance sugiero que se pueda cargar más de una actividad, dado que
> en ocasiones una persona que compra se encuentra en ocasión de vender por lo que es
> un cliente Prebuying y Prelisting en caso de hacerle seguimiento para captar su
> propiedad a la venta."

---

## 1. El problema real

Cargar más de una actividad por cliente **ya se puede hoy**: `performance_logs` no
tiene ninguna restricción que lo impida y la vista Lista las muestra todas.

Lo que no se puede es que un cliente esté **en dos etapas a la vez**. El tablero arma
una tarjeta por cliente y la ubica en la etapa del evento más reciente
(`lib/tracking/pipeline.ts`, `buildPipeline`):

```ts
const stage: ActivityType = movioDespues ? move!.to_stage : ultima.type;
```

Consecuencia exacta del caso de Matías: tiene un cliente en **Prebuying** (le busca
para comprar), le carga una actividad de **Prelisting** (para captarle la propiedad
que vende) → **la tarjeta se va de Prebuying** y pierde de vista el seguimiento de la
compra. Y al revés.

El código ya sabía que el embudo es ramificado. Está escrito en `lib/tracking/pipeline.ts`:

> *"el embudo real es ramificado (prelisting/captación son del vendedor, prebuying del
> comprador). El tablero igual usa orden lineal a propósito: es predecible y no bloquea nada."*

Matías se chocó justo contra esa decisión de diseño.

## 2. Estado real de los datos (consultado en producción, 19-ago-2026)

| Dato | Valor |
|---|---|
| Filas en `performance_logs` | 33 (26 vivas, 7 eliminadas) |
| De Central Real Estate Argentina | 18 vivas |
| De PRISMAIA - VAKDOR | 8 vivas |
| Vivas **con cliente vinculado** (las únicas que arman tarjeta) | 11, sobre 10 clientes |
| Clientes que hoy ya tienen los dos lados | **0** |
| Filas en `tracking_pipeline_moves` | 4 |

El módulo es nuevo. La migración de histórico son 11 filas de actividad y 4 de
movimientos: el riesgo de backfill es prácticamente nulo, y hoy no existe ningún
cliente en conflicto.

## 3. Decisiones tomadas (Leonardo, 19-ago-2026)

1. **Dos tarjetas separadas**, no una tarjeta con dos etiquetas ni la misma ficha
   duplicada en varias columnas. Cada proceso avanza por su cuenta.
2. **El proceso se elige siempre**, en cada actividad — no sólo en los clientes que
   tienen dos procesos.
3. En las tres etapas donde la respuesta ya está determinada por la etapa
   (Prelisting, Captación, Prebuying) el campo **se muestra pero viene fijo**.
4. Al arrastrar, **se bloquean las columnas del otro lado del negocio**.

## 4. Modelo de datos

### 4.1 Columna nueva `proceso`

```ts
export type ProcesoNegocio = 'compra' | 'venta';
```

Va en dos tablas, **nullable** en ambas:

| Tabla | Columna | Significado |
|---|---|---|
| `public.performance_logs` | `proceso text` | de qué lado del negocio es esta actividad |
| `public.tracking_pipeline_moves` | `proceso text` | qué tarjeta movió este arrastre |

`NULL` significa **"sin definir"**: sólo lo tienen filas históricas que el backfill no
pudo resolver. Toda alta nueva lleva valor obligatorio (lo exige el formulario y lo
valida el server action).

**No se pone `NOT NULL`** a propósito: obligar en base rompería las filas históricas
ambiguas y forzaría a inventarles un lado.

### 4.2 Coherencia garantizada en base

`CHECK` a nivel tabla en `performance_logs`, para que un registro que se contradice a
sí mismo no pueda existir ni por API ni por SQL directo:

```sql
CHECK (
  proceso IS NULL
  OR (type IN ('prelisting','captacion') AND proceso = 'venta')
  OR (type = 'prebuying'                 AND proceso = 'compra')
  OR (type IN ('prospeccion','reserva','cierre'))
)
```

### 4.3 Índice

```sql
CREATE INDEX IF NOT EXISTS performance_logs_proceso_idx
  ON public.performance_logs (agency_id, proceso);
```

No hay índice nuevo en `tracking_pipeline_moves`: los índices actuales
(`agency_id, client_key`) siguen sirviendo; el proceso se filtra en memoria sobre un
conjunto ya chico.

### 4.4 RLS

Sin cambios. Ninguna política de ninguna de las dos tablas menciona columnas
específicas; agregar una columna no las afecta.

## 5. Reglas de negocio

### 5.1 Proceso fijo por etapa

```ts
export const PROCESO_FIJO: Partial<Record<ActivityType, ProcesoNegocio>> = {
  prelisting: 'venta',
  captacion:  'venta',
  prebuying:  'compra',
};
```

- Etapas con proceso fijo: **Prelisting, Captación → Venta**; **Prebuying → Compra**.
  El campo se muestra en el formulario, relleno y deshabilitado.
- Etapas donde el asesor elige: **Prospección, Reserva, Cierre**. Campo obligatorio,
  sin valor por defecto — se elige a conciencia, no por inercia.

Justificación: una "captación de compra" no es un caso de uso, es un error de carga.
La etapa ya contiene la respuesta.

### 5.2 La tarjeta del tablero

La unidad del tablero deja de ser el cliente y pasa a ser **(cliente, proceso)**.

```ts
cardKey = `${clientKey}::${proceso ?? 'sin-definir'}`
```

- `clientKey` se sigue calculando igual que hoy (`clientKeyFromLog`: teléfono E.164, o
  `lead:<uuid>` / `wa:<uuid>` de respaldo). No se toca.
- Un cliente con actividades de compra **y** de venta genera **dos tarjetas**.
- Un cliente con un solo proceso genera **una** tarjeta, igual que hoy.
- Las filas `proceso = NULL` se agrupan en su propia tarjeta **"Sin definir"**, que se
  comporta exactamente como el tablero de hoy (sin restricciones de arrastre).

`PipelineCard` suma dos campos: `cardKey: string` y `proceso: ProcesoNegocio | null`.
`clientKey` se mantiene, porque lo usan `movePipelineCard` y la ficha del cliente.

### 5.3 Movimientos manuales por tarjeta

El mapa de "último movimiento" en `buildPipeline` pasa a estar indexado por
`client_key + proceso`, no sólo por `client_key`. Sin esto, arrastrar la tarjeta de
Compra movería también la de Venta.

`movePipelineCard` recibe y guarda el `proceso` de la tarjeta movida.

### 5.4 Columnas permitidas al arrastrar

```ts
export const ETAPAS_POR_PROCESO: Record<ProcesoNegocio, ActivityType[]> = {
  venta:  ['prospeccion', 'prelisting', 'captacion', 'reserva', 'cierre'],
  compra: ['prospeccion', 'prebuying', 'reserva', 'cierre'],
};
```

- Tarjeta de **Compra**: no entra en Prelisting ni Captación.
- Tarjeta de **Venta**: no entra en Prebuying.
- Tarjeta **Sin definir**: entra en todas (comportamiento actual intacto).

Al intentar un destino no permitido la tarjeta vuelve sola a su lugar — ya pasa así
hoy, porque la posición se recalcula desde los datos — y sale un toast que explica el
motivo, no un error genérico. El mismo bloqueo se aplica al menú "Mover a…" de la
tarjeta: las etapas del otro lado aparecen deshabilitadas.

### 5.5 Cómo se abre el segundo proceso

No hace falta ningún mecanismo nuevo: alcanza con cargar una actividad del otro lado
para ese cliente. Dos caminos, los dos terminan en el mismo formulario:

1. Botón **"Nueva Actividad"** → elegir el cliente → elegir etapa y proceso.
2. Botón **"Abrir proceso de Compra / Venta"** en la ficha del cliente
   (`PipelineClientSheet`), que abre el formulario con el cliente ya fijado y el
   proceso preseleccionado. Existe por descubribilidad: es donde Matías va a estar
   mirando cuando se le presente el caso.

La tarjeta que ya existía **no se mueve**. Ese es el objetivo de todo el cambio.

## 6. Backfill del histórico

Se ejecuta dentro de la misma migración, en este orden:

| Paso | Regla | Filas afectadas (medido 19-ago-2026) |
|---|---|---|
| 1 | `type IN ('prelisting','captacion')` → `venta` | 3 vivas |
| 2 | `type = 'prebuying'` → `compra` | 3 vivas |
| 3 | Filas ambiguas (`prospeccion`/`reserva`/`cierre`) de un cliente que quedó con **un solo** lado definido tras los pasos 1-2 → ese lado | 1 |
| 4 | El resto → queda `NULL` ("Sin definir") | 4 con cliente + 15 sin cliente |
| 5 | `tracking_pipeline_moves`: hereda el proceso resuelto de su `client_key`, si ese cliente quedó con un solo lado | ≤ 4 |

Las filas con `status = 'eliminada'` también se completan, para que un director que
filtra por Eliminadas las siga viendo consistentes.

**Nada se borra, ningún `type` cambia, ningún monto se mueve, ningún `status` se toca.**
El backfill escribe únicamente la columna nueva.

Las 4 tarjetas que quedan "Sin definir" muestran un cartelito ámbar y un botón que
abre un diálogo de un clic para asignarles proceso. Esa asignación escribe `proceso` en
todas las actividades de esa tarjeta; no marca las actividades como `modificada`
porque no cambia contenido comercial, sólo las clasifica.

## 7. Interfaz

### 7.1 Formulario de actividad (`PerformanceLogForm`)

Campo nuevo **"Proceso"** en la sección "Actividad a registrar", inmediatamente debajo
de "Tipo de Actividad":

```
Tipo de Actividad *   [ Prospección          ▾ ]
Proceso *             ( ) Compra   ( ) Venta
```

- En Prelisting / Captación / Prebuying: relleno, deshabilitado, con la leyenda de por
  qué ("Un Prelisting es siempre del lado de la venta").
- Al cambiar el tipo de actividad se recalcula (hoy ya se resetean `metadata`,
  `monto_operacion` y `comision_generada` en ese mismo `onValueChange`).
- Cuando el formulario viene del tablero (`forcedType` + `lockedClient`), el proceso
  llega ya decidido por la tarjeta y no se pregunta.
- Al **editar** una actividad histórica sin proceso, el campo aparece vacío y
  obligatorio: es el camino natural para resolver los "Sin definir".

### 7.2 Tarjeta del tablero (`PipelineCard`)

Cartelito de proceso arriba a la izquierda, con los colores que ya usan las etapas
correspondientes en `PIPELINE_STAGES`:

| Proceso | Color | Texto |
|---|---|---|
| Compra | violeta (`violet-500`, el de Prebuying) | COMPRA |
| Venta | índigo (`indigo-500`, el de Prelisting) | VENTA |
| Sin definir | ámbar (`amber-500`) | SIN DEFINIR |

### 7.3 Ficha del cliente (`PipelineClientSheet`)

- Encabezado: qué procesos tiene abiertos ese cliente y en qué etapa está cada uno.
- El historial de actividades se muestra completo (los dos procesos), con su cartelito,
  para que el asesor vea la relación con el cliente entera y no a media luz.
- Botón "Abrir proceso de Compra / Venta" para el lado que le falta.

### 7.4 Vista Lista (`PerformanceHistoryList`)

Cartelito de proceso junto al tipo de actividad. Sin filtros nuevos: el volumen de
datos no los justifica y se pueden agregar después si aparece la necesidad.

## 8. Qué NO cambia

Verificado en `lib/queries/dashboard.ts`: **todas** las métricas se calculan filtrando
por `type` (`l.type === 'prospeccion'`, `'prelisting'`, `'prebuying'`, `'captacion'`,
`'reserva'`, `'cierre'`). Ninguna agrupa por cliente ni por tarjeta.

Por lo tanto quedan idénticos:

- Dashboard del director y del asesor (KPIs, embudo, tasas, GCI).
- Objetivos mensuales y sus pesos.
- Informe semanal del director (`lib/reports/weekly/`).
- Evaluación IA de actividades (`lib/tracking/performance-evaluator.ts`).
- El leaderboard de performance.

**El cambio es puramente aditivo sobre las métricas.** Eso es lo que lo vuelve de bajo
riesgo pese a tocar el corazón del tablero.

## 9. Testing

### 9.1 Automático (vitest, `lib/tracking/pipeline.test.ts` — archivo nuevo)

Sobre `buildPipeline`, que es donde vive toda la lógica:

1. Cliente con actividades de compra y de venta → **dos tarjetas**, cada una en la
   etapa de su propio evento más reciente.
2. Cliente con un solo proceso → **una** tarjeta (no regresa el comportamiento actual).
3. Un movimiento manual sobre la tarjeta de Compra **no mueve** la de Venta.
4. Filas con `proceso = NULL` → tarjeta "Sin definir", sin mezclarse con las demás.
5. Un cliente sin cliente vinculado sigue contando en `sinCliente` y no arma tarjeta.
6. `etapasPermitidas()` devuelve el set correcto para compra, venta y sin definir.

### 9.2 En el navegador (obligatorio antes de entregar)

Con la cuenta **PRISMAIA - VAKDOR** — nunca Central Real Estate, que es del cliente real:

1. Cargar una actividad de Prebuying a un cliente → aparece tarjeta COMPRA.
2. Cargarle una de Prelisting al mismo cliente → aparece una **segunda** tarjeta VENTA
   y la de COMPRA **sigue en Prebuying**.
3. Arrastrar la de COMPRA a Reserva → se mueve sola; la de VENTA no se movió.
4. Intentar arrastrar la de COMPRA a Captación → vuelve sola con el toast explicando.
5. Abrir la ficha del cliente → se ven los dos procesos y el historial completo.
6. Dashboard antes y después: los números no cambiaron.
7. Repetir el recorrido en **celular** (emulación de dispositivo real, no achicando la
   ventana).

## 10. Riesgos y cómo se acotan

| Riesgo | Mitigación |
|---|---|
| El backfill clasifica mal una actividad ambigua | Sólo hereda cuando el cliente tiene **un único** lado; ante duda deja `NULL` y lo resuelve el asesor. Son 4 filas. |
| El bloqueo al arrastrar molesta a un asesor con un flujo propio | Es una constante en un solo lugar (`ETAPAS_POR_PROCESO`); sacarlo es borrar la validación, no rehacer nada. |
| Un cliente que alquila (ni compra ni vende) no encaja | Fuera de alcance: las 6 etapas actuales tampoco lo modelan. Puede cargarse del lado que corresponda o quedar Sin definir. |
| El código se despliega antes que la migración | Rompería: `savePerformanceLog` escribiría una columna que no existe. El orden es al revés que en el índice único de chats: acá va **primero la migración**, que es aditiva y no molesta al código viejo (simplemente no escribe la columna), y después el código. |

## 11. Archivos que se tocan

**Nuevos**
- `supabase/migrations/20260819140000_add_proceso_a_tracking.sql`
- `lib/tracking/pipeline.test.ts`

**Modificados**
- `lib/tracking/types.ts` — `ProcesoNegocio`, campo en `PerformanceLog`, en el schema zod y en `PipelineMove`
- `lib/tracking/pipeline.ts` — `PROCESO_FIJO`, `ETAPAS_POR_PROCESO`, `cardKey`, agrupación y movimientos por proceso
- `lib/tracking/queries.ts` — traer la columna nueva
- `actions/tracking/savePerformanceLog.ts` — validar/derivar `proceso`
- `actions/tracking/movePipelineCard.ts` — guardar `proceso`
- `components/tracking/PerformanceLogForm.tsx` — campo Proceso
- `components/tracking/PerformanceHistoryList.tsx` — cartelito
- `components/tracking/pipeline/PipelineBoard.tsx` — regla de arrastre
- `components/tracking/pipeline/PipelineCard.tsx` — cartelito y menú "Mover a…"
- `components/tracking/pipeline/PipelineColumn.tsx` — id de tarjeta = `cardKey`
- `components/tracking/pipeline/PipelineStageDialog.tsx` — pasar el proceso al formulario
- `components/tracking/pipeline/PipelineClientSheet.tsx` — procesos abiertos y botón de alta
