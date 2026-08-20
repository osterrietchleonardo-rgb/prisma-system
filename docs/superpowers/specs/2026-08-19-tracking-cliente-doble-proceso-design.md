# Tracking Performance: un cliente, dos procesos (Compra y Venta)

> ⚠️ **Superado por el Addendum — 20-ago-2026** (al final de este documento): el título
> y el cuerpo de abajo describen el diseño original, de dos valores (Compra/Venta). Al
> día siguiente `proceso` pasó a cuatro valores (vendedor/comprador/locador/locatario) y
> un cliente puede llegar a tener hasta cuatro tarjetas, no dos. El cuerpo queda como
> registro histórico de esa primera decisión; el addendum es la versión vigente.

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
   (⚠️ **Superado por el Addendum — 20-ago-2026**: con cuatro valores esas etapas dejaron
   de tener una única respuesta posible — Prelisting/Captación admiten vendedor **o**
   locador, Prebuying admite comprador **o** locatario — así que el campo ya no viene
   fijo, se pregunta. Ver "Qué valores admite cada etapa" en el addendum.)
4. Al arrastrar, **se bloquean las columnas del otro lado del negocio**.

## 4. Modelo de datos

### 4.1 Columna nueva `proceso`

> ⚠️ **Superado por el Addendum — 20-ago-2026** (al final de este documento): `proceso`
> pasó de dos a cuatro valores. Ver "Modelo nuevo" en el addendum.

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

> ⚠️ **Superado por el Addendum — 20-ago-2026**: este `CHECK` se reemplazó por uno que
> valida contra la lista de valores de cada etapa (cuatro procesos, no dos). Ver
> "Migración" en el addendum.

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

> ⚠️ **Superado por el Addendum — 20-ago-2026**: `PROCESO_FIJO` se eliminó. Ninguna
> etapa fija ya un único valor — la reemplaza `PROCESOS_POR_ETAPA`, una lista por
> etapa. Ver "Qué valores admite cada etapa" en el addendum.

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
- Un cliente con actividades de compra **y** de venta genera **dos tarjetas**. (⚠️
  **Superado en parte por el Addendum — 20-ago-2026:** `proceso` pasó a tener cuatro
  valores, no dos; un mismo cliente puede llegar a tener hasta cuatro tarjetas. El
  mecanismo de `cardKey` en sí no cambió — ver "Qué valores admite cada etapa" en el
  addendum.)
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

> ⚠️ **Superado por el Addendum — 20-ago-2026**: `ETAPAS_POR_PROCESO` sigue existiendo
> con ese nombre, pero ahora tiene cuatro claves derivadas del lado del negocio
> (`ladoDelNegocio`), no dos. Ver "Qué valores admite cada etapa" en el addendum.

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

> ⚠️ **Superado por el Addendum — 20-ago-2026**: con cuatro valores el botón de la
> ficha del cliente ofrece hasta tres opciones, no una sola "Compra/Venta". Ver "Qué NO
> cambia" en el addendum.

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

> ⚠️ **Superado por el Addendum — 20-ago-2026**: el diálogo de un clic que este párrafo
> da por pendiente **ya se construyó** (`PipelineClientSheet` + server action
> `asignarProcesoATarjeta`). Ver "Qué NO cambia" en el addendum y el resolutor descrito
> en TECNICO / FUNCIONAL.

Las 4 tarjetas que quedan "Sin definir" muestran un cartelito ámbar. **Eso es lo único
que se implementó de este punto.** No existe ningún diálogo de un clic para asignarles
proceso — esa parte quedó pendiente, es un follow-up conocido, no un olvido a
redescubrir.

Comportamiento real de una tarjeta "Sin definir" hoy:

- No tiene ninguna restricción de movimiento: se arrastra a cualquier columna, igual
  que en el tablero viejo (a diferencia de las tarjetas COMPRA/VENTA, que sí tienen
  columnas bloqueadas — ver 5.4).
- Si se la arrastra a una etapa donde ese cliente todavía no tiene actividad, se abre
  el formulario normal de actividad, que pide (o autocompleta) un `proceso` real de
  verdad (`compra` o `venta`). Guardar ese formulario **crea una tarjeta nueva**; la
  tarjeta "Sin definir" original no se toca y se queda donde estaba, con sus
  actividades viejas intactas. Un mismo cliente puede terminar así con **tres**
  tarjetas: sin-definir, compra y venta.
- La única forma de reclasificar las actividades viejas en sí (para que la tarjeta
  "Sin definir" deje de existir) es hoy editarlas una por una desde la vista Lista.
  Esa edición pide un *motivo*, marca la fila como "Modificada" y le borra la
  calificación de IA — exactamente el costo que este punto decía evitar con el
  diálogo de un clic. Mientras el diálogo no se construya, ese es el único camino.
  (⚠️ **Superado por el Addendum — 20-ago-2026**: el diálogo de un clic ya existe y
  cubre el caso normal sin ese costo; el camino por la Lista solo queda como único
  camino cuando la tarjeta mezcla actividades de los dos lados del negocio. Ver "Qué
  NO cambia" en el addendum.)

## 7. Interfaz

### 7.1 Formulario de actividad (`PerformanceLogForm`)

> ⚠️ **Superado por el Addendum — 20-ago-2026**: el campo ya no viene "relleno,
> deshabilitado" en Prelisting/Captación/Prebuying — en esas etapas hay dos opciones
> válidas y el asesor elige. Solo viene bloqueado cuando el proceso lo impone el
> popup del tablero. Ver "Qué valores admite cada etapa" en el addendum.

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

> ⚠️ **Superado por el Addendum — 20-ago-2026**: la tabla de abajo quedó en dos valores;
> son cuatro (VENDEDOR, COMPRADOR, LOCADOR, LOCATARIO), con el color marcando el lado
> y el texto el valor exacto. Ver "Cartelitos" en el addendum.

Cartelito de proceso arriba a la izquierda, con los colores que ya usan las etapas
correspondientes en `PIPELINE_STAGES`:

| Proceso | Color | Texto |
|---|---|---|
| Compra | violeta (`violet-500`, el de Prebuying) | COMPRA |
| Venta | índigo (`indigo-500`, el de Prelisting) | VENTA |
| Sin definir | ámbar (`amber-500`) | SIN DEFINIR |

### 7.3 Ficha del cliente (`PipelineClientSheet`)

> ⚠️ **Superado por el Addendum — 20-ago-2026**: el botón "Abrir proceso de Compra /
> Venta" pasó a ofrecer hasta tres botones — uno por cada valor que ese cliente todavía
> no tenga — y la etapa de arranque se deriva del lado, no de "compra o venta". Ver
> "Qué NO cambia" en el addendum.

- Encabezado: el cartelito del proceso de esa tarjeta, y una línea que avisa si el
  cliente además tiene el otro proceso abierto.
- El historial muestra **las actividades y los movimientos de esa tarjeta**, no los de
  los dos procesos mezclados: cada proceso tiene su propia historia y su propio botón
  de editar, y mezclarlos volvería ambiguo a qué registro pertenece cada acción. Para
  ver el otro proceso se abre la otra tarjeta.
- Botón "Abrir proceso de Compra / Venta" para el lado que le falta. Abre el formulario
  con el cliente fijado y la etapa de arranque de ese lado (Prelisting para venta,
  Prebuying para compra).

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

**Con una salvedad: "idéntico" no es lo mismo que "consistente con el tablero nuevo".**
`fetchEtapasPipeline` (`lib/reports/weekly/sources.ts`) sigue quedándose con **una sola
etapa por cliente** — es exactamente la regla que tenía antes de este feature, y por eso
está en la lista de arriba: su código no se tocó. Pero el tablero dejó de tener esa
misma regla: ahora arma **una tarjeta por (cliente, proceso)**. Un cliente con compra y
venta abiertas va a aparecer en **dos columnas** del Pipeline y en **una sola etapa**
del informe semanal (la de su evento más reciente, sin distinguir de qué lado es). No es
un bug: es una divergencia real entre dos piezas que antes de este cambio siempre
coincidían, y que ahora dejan de hacerlo justo para el caso que motiva todo el feature.
Documentado también en el funcional del director (`FUNCIONAL-DIRECTOR-PRISMA.md`).
Hacer que el informe semanal distinga por proceso es una decisión de producto aparte,
fuera de esta rama.

## 9. Testing

### 9.1 Automático (vitest, `lib/tracking/pipeline.test.ts` — archivo nuevo)

Sobre `buildPipeline`, que es donde vive toda la lógica:

1. Cliente con actividades de compra y de venta → **dos tarjetas**, cada una en la
   etapa de su propio evento más reciente.
2. Cliente con un solo proceso → **una** tarjeta (no regresa el comportamiento actual).
3. Un movimiento manual sobre la tarjeta de Compra **no mueve** la de Venta.
4. Filas con `proceso = NULL` → tarjeta "Sin definir", sin mezclarse con las demás.
5. Un cliente sin cliente vinculado sigue contando en `sinCliente` y no arma tarjeta.
6. `etapasPermitidas()` devuelve el set correcto para compra, venta y sin definir. (⚠️
   **Superado por el Addendum — 20-ago-2026:** son cuatro valores, no dos —
   `etapasPermitidas()` recibe cualquiera de los cuatro y los deriva por lado. Ver
   `lib/tracking/proceso.test.ts` para la cobertura real.)

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
| Un cliente que alquila (ni compra ni vende) no encaja | Fuera de alcance: las 6 etapas actuales tampoco lo modelan. Puede cargarse del lado que corresponda o quedar Sin definir. (⚠️ **Superado por el Addendum — 20-ago-2026**: dejó de estar fuera de alcance — es el tema entero del addendum. `proceso` ganó `locador` y `locatario`, así que un cliente que alquila ya encaja sin mentirle al sistema. Ver "Por qué" en el addendum.) |
| El código se despliega antes que la migración | Rompería: `savePerformanceLog` escribiría una columna que no existe. El orden es al revés que en el índice único de chats: acá va **primero la migración**, que es aditiva y no molesta al código viejo (simplemente no escribe la columna), y después el código. |

## 11. Archivos que se tocan

> ⚠️ **Superado por el Addendum — 20-ago-2026**: la lista de abajo es la de la primera
> versión (dos valores). El addendum agregó, sobre esta lista: la migración
> `supabase/migrations/20260820120000_proceso_cuatro_valores.sql` (ver "Migración" en
> el addendum), el server action nuevo `actions/tracking/asignarProcesoATarjeta.ts`
> (el resolutor de "Sin definir"), y volvió a tocar `PerformanceLogForm.tsx` (sacar
> "Tipo de Lead" de Prospección) y `lib/queries/dashboard.ts` (contar por `proceso`).

**Nuevos**
- `supabase/migrations/20260819140000_add_proceso_a_tracking.sql`
- `lib/tracking/proceso.ts` — el vocabulario del proceso, puro y sin dependencias de UI
  (lo necesitan también los server actions, que no tienen por qué arrastrar los iconos
  que importa `pipeline.ts`)
- `lib/tracking/proceso.test.ts`
- `lib/tracking/pipeline.test.ts`

**Modificados**
- `lib/tracking/types.ts` — `ProcesoNegocio`, campo en `PerformanceLog`, en el schema zod y en `PipelineMove`
- `lib/tracking/pipeline.ts` — `cardKey` y `proceso` en `PipelineCard`, agrupación y movimientos por tarjeta
- `actions/tracking/savePerformanceLog.ts` — validar/derivar `proceso`
- `actions/tracking/movePipelineCard.ts` — guardar `proceso`
- `components/tracking/PerformanceLogForm.tsx` — campo Proceso
- `components/tracking/PerformanceHistoryList.tsx` — cartelito
- `components/tracking/pipeline/PipelineBoard.tsx` — regla de arrastre
- `components/tracking/pipeline/PipelineCard.tsx` — cartelito y menú "Mover a…"
- `components/tracking/pipeline/PipelineColumn.tsx` — id de tarjeta = `cardKey`
- `components/tracking/pipeline/PipelineStageDialog.tsx` — pasar el proceso al formulario
- `components/tracking/pipeline/PipelineClientSheet.tsx` — procesos abiertos y botón de alta

`lib/tracking/queries.ts` **no se toca**: usa `select("*")`, así que la columna nueva
llega sola.

---

# Addendum — 20-ago-2026: el proceso pasa a tener cuatro valores

## Por qué

Leonardo señaló que el formulario **ya tenía** un campo "Tipo de Lead", con cuatro
valores: Vendedor, Comprador, Locador y Locatario — los dos últimos porque la agencia
también maneja alquileres. Y preguntó si había que sacar `proceso` o redefinirlo.

Lo verificado antes de decidir:

1. **"Tipo de Lead" sólo existe en Prospección** (`PerformanceLogForm.tsx`, dentro del
   bloque `activityType === "prospeccion"`). Confirmado en la base: ninguna Prelisting,
   Prebuying, Captación, Reserva o Cierre tiene ese dato. Por eso **sacar `proceso` no es
   posible**: sin el dato en las seis etapas no se puede partir la tarjeta en dos, que es
   toda la función.
2. **Los alquileres no entran en compra/venta.** Un Locador no vende y un Locatario no
   compra. Hoy habría que mentirle al sistema.
3. **Hay pregunta duplicada.** En Prospección el asesor contesta lo mismo dos veces.
4. **Bug preexistente:** `lib/queries/dashboard.ts` sólo cuenta `'Vendedor'` y
   `'Comprador'`; un Locador o un Locatario no se cuentan en ninguna parte.
5. **Hay 5 actividades con "Tipo de Lead: Vendedor" que quedaron en SIN DEFINIR.** El
   backfill original podía haberlas resuelto y no lo hizo, porque no miró ese campo.
6. **Cero actividades con Locador o Locatario** cargadas hoy: el problema es a futuro,
   no hay nada roto en producción.

Decisión de Leonardo: **`proceso` absorbe a "Tipo de Lead"**. Un solo campo, en las seis
etapas, con los cuatro valores que la agencia ya usa.

## Modelo nuevo

```ts
export type ProcesoNegocio = 'vendedor' | 'comprador' | 'locador' | 'locatario';
```

El "lado del negocio" deja de ser el valor y pasa a ser algo que se **deriva**:

| Proceso | Lado | Qué significa |
|---|---|---|
| `vendedor` | ofrece | tiene una propiedad y la quiere vender |
| `locador` | ofrece | tiene una propiedad y la quiere alquilar |
| `comprador` | busca | quiere comprar una propiedad |
| `locatario` | busca | quiere alquilar una propiedad |

```ts
export function ladoDelNegocio(p: ProcesoNegocio | null): 'ofrece' | 'busca' | null
```

## Qué valores admite cada etapa

`PROCESO_FIJO` (un valor por etapa) deja de existir: una Prelisting puede ser de un
vendedor **o** de un locador. Lo reemplaza una lista:

```ts
export const PROCESOS_POR_ETAPA: Record<ActivityType, ProcesoNegocio[]> = {
  prospeccion: ['vendedor', 'comprador', 'locador', 'locatario'],
  prelisting:  ['vendedor', 'locador'],
  captacion:   ['vendedor', 'locador'],
  prebuying:   ['comprador', 'locatario'],
  reserva:     ['vendedor', 'comprador', 'locador', 'locatario'],
  cierre:      ['vendedor', 'comprador', 'locador', 'locatario'],
};
```

**Consecuencia en el formulario:** el campo ya no viene "relleno y bloqueado" en
Prelisting, Captación y Prebuying, porque en esas etapas hay **dos** opciones válidas, no
una. Lo que hace ahora es **ofrecer sólo las que corresponden**. Es una pregunta más que
antes, y es información que el sistema hoy no tiene: si esa captación es para vender o
para alquilar.

`ETAPAS_POR_PROCESO` se deriva del lado y no cambia de forma:

```ts
ofrece  (vendedor, locador)  → prospeccion, prelisting, captacion, reserva, cierre
busca   (comprador, locatario) → prospeccion, prebuying, reserva, cierre
```

El bloqueo al arrastrar, las dos tarjetas y `cardKey` siguen exactamente igual: la clave
sigue siendo `clientKey::proceso`, sólo que ahora el proceso puede tomar cuatro valores.

## Cartelitos

El color comunica el **lado**, el texto comunica el **valor**. Así se sigue viendo de un
golpe de qué lado está la tarjeta, y se lee sin ambigüedad cuál de los dos es:

| Proceso | Cartelito | Color |
|---|---|---|
| `vendedor` | VENDEDOR | índigo (el de Prelisting) |
| `locador` | LOCADOR | índigo |
| `comprador` | COMPRADOR | violeta (el de Prebuying) |
| `locatario` | LOCATARIO | violeta |
| `null` | SIN DEFINIR | ámbar |

## Migración

Archivo `supabase/migrations/20260820120000_proceso_cuatro_valores.sql`.

Orden obligatorio — el CHECK viejo rechaza los valores nuevos, así que se baja primero:

1. `DROP CONSTRAINT` de los dos CHECK existentes.
2. Renombrar los valores ya cargados: `'venta' → 'vendedor'`, `'compra' → 'comprador'`,
   en `performance_logs` y en `tracking_pipeline_moves`.
3. **Backfill desde `metadata->>'tipo_lead'`** para las filas que siguen en `NULL`:
   `'Vendedor'→vendedor`, `'Comprador'→comprador`, `'Locador'→locador`,
   `'Locatario'→locatario`. Esto resuelve las 5 filas que el backfill anterior dejó sin
   definir teniendo el dato a mano. Filtra además por `type = 'prospeccion'` (donde vivía
   "Tipo de Lead"), para que una fila de etapa fija (prelisting/captacion/prebuying) no
   pueda heredar un valor del lado que no le toca — eso es lo que evita que el
   `ADD CONSTRAINT` del paso 5 aborte por algo que este mismo backfill escribió.
4. Volver a aplicar la herencia por cliente para las ambiguas que sigan en `NULL`, con el
   mismo criterio conservador de la migración anterior (sólo si el cliente quedó con un
   único valor). El `UPDATE` sobre `performance_logs` filtra por
   `type IN ('prospeccion','reserva','cierre')`, mismo motivo que el paso 3. El `UPDATE`
   sobre `tracking_pipeline_moves` **no tiene ese filtro** — esa tabla no distingue etapa
   por fila y su CHECK final sólo limita el dominio de valores, no la combinación con la
   etapa, así que no hay riesgo de abortar. Puede, sí, dejar un movimiento con una pareja
   proceso/etapa que `etapasPermitidas` no dejaría crear hoy (ver el comentario de cabecera
   de la migración); es preexistente y sólo afecta esa tabla de historial.
5. `ADD CONSTRAINT` nuevo, que ahora valida contra la lista de la etapa:

```sql
CHECK (
  proceso IS NULL
  OR (type IN ('prelisting','captacion') AND proceso IN ('vendedor','locador'))
  OR (type = 'prebuying'                 AND proceso IN ('comprador','locatario'))
  OR (type IN ('prospeccion','reserva','cierre')
      AND proceso IN ('vendedor','comprador','locador','locatario'))
);
```

Y en `tracking_pipeline_moves`: `proceso IS NULL OR proceso IN (los cuatro)`.

## El campo duplicado se va

Se elimina el select "Tipo de Lead" del bloque de Prospección. **No se borra
`metadata.tipo_lead` de las filas históricas** — queda como estaba, no molesta a nadie y
borrarlo sería tocar datos sin necesidad. Simplemente deja de escribirse.

## Dashboard

`lib/queries/dashboard.ts` deja de leer `metadata.tipo_lead` y pasa a leer `proceso`,
sumando los dos contadores que faltaban:

```ts
leads: { vendedor: 0, comprador: 0, locador: 0, locatario: 0 }
```

El recuadro "Composición Demanda" (`components/dashboard/PerformanceMetricsGrid.tsx`)
muestra hoy `${V}V / ${C}C`. Pasa a mostrar los de alquiler **sólo cuando existen**, para
que la pantalla de hoy no cambie mientras la agencia no cargue ninguno:

- sin alquileres: `3V / 2C` (idéntico a hoy)
- con alquileres: `3V / 2C / 1L / 2Lt`

## Qué NO cambia

**Sin tocar en esta vuelta:** `buildPipeline` y `cardKey` (`lib/tracking/pipeline.ts`) y
la vista Lista (`PerformanceHistoryList.tsx`). Los tres consumen `etapasPermitidas`,
`badgeDeProceso` y `labelDeProceso`, que conservan su firma — devuelven cuatro valores en
vez de dos, pero el código que los llama no se editó. El bloqueo al arrastrar tampoco
cambió como mecanismo: sigue siendo `ETAPAS_POR_PROCESO` derivado del lado
(`ladoDelNegocio`), sólo que con cuatro claves en vez de dos.

**Lo que sí se tocó — `PipelineClientSheet.tsx` (commit `eb5fd3f`):** este archivo es a
la vez "la ficha del cliente" y "el botón de resolver Sin definir" de más arriba en este
documento, y se reescribió para los cuatro valores (67 líneas). Antes ofrecía un único
botón "Abrir proceso de Compra/Venta"; ahora recorre los cuatro valores y muestra hasta
tres botones "Abrir proceso de…" — uno por cada proceso que ese cliente todavía no tenga.
El resolutor de "Sin definir" pasó de dos opciones a un botón por cada valor de
`procesosPosiblesParaTarjeta` (la intersección de lo que admite cada actividad de la
tarjeta); cuando esa intersección queda vacía —una tarjeta que mezcla los dos lados del
negocio— muestra el mensaje explicándolo en vez de botones, igual que describe la sección
6 de más arriba.

`PipelineBoard.tsx` tuvo un cambio puntual en el mismo commit (4 líneas): `abrirProceso`
deriva la etapa de arranque con `ladoDelNegocio(proceso)` en vez de comparar contra el
literal `'venta'`. El resultado es el mismo de siempre (Prelisting para quien ofrece,
Prebuying para quien busca) — cambió cómo se calcula, no lo que muestra.
