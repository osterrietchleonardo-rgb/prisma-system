# Vista Pipeline en Tracking Performance

**Fecha:** 2026-07-28
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** agregar una vista de tablero (kanban) por etapas dentro de la solapa *Actividad* de Tracking Performance, sin modificar el comportamiento actual del listado.

---

## 1. Problema

Hoy Tracking Performance muestra las actividades como un listado plano: cada fila es un registro de `performance_logs`. Un mismo cliente que recorrió prospección → prebuying → reserva aparece tres veces, y no hay forma de ver de un vistazo en qué etapa está parado cada cliente ni de hacerlo avanzar sin abrir el formulario completo.

Se pide una vista de columnas por etapa donde cada cliente aparezca **una sola vez**, en su etapa actual, y se pueda mover entre etapas con mouse, dedo o botón.

## 2. Principio rector

**La vista Pipeline no es un módulo nuevo: es otra forma de mirar los mismos datos.**

No se duplica lógica. El popup de carga es el mismo `PerformanceLogForm`, guarda con la misma server action `savePerformanceLog`, y todo lo que se cree desde el tablero aparece en el listado actual como cualquier otra actividad. Los filtros (tipo, estado, asesor, fecha, búsqueda) son los mismos y se comparten entre ambas vistas.

## 3. Contexto verificado

Todo lo de abajo se comprobó contra el código y la base de producción el 2026-07-28, no se asumió.

### 3.1 Modelo de datos actual

- `performance_logs`: una fila por actividad. Campos relevantes: `type` (las 6 etapas), `agent_id`, `agency_id`, `lead_id`, `wa_contact_id`, `property_id`, `propiedad_ref`, `monto_operacion`, `comision_generada`, `fecha_actividad`, `metadata` (jsonb), `status` (`original`/`modificada`/`eliminada`).
- Volumen actual: **27 registros**, el más reciente del 2026-07-23 (uso real, no datos de prueba).

### 3.2 El embudo es ramificado, no lineal

Confirmado en `lib/queries/dashboard.ts:136-145`:

| Métrica | Fórmula | Implica |
|---|---|---|
| `hitRate` | captación ÷ **prelisting** | rama vendedor: prospección → prelisting → captación |
| `tasaOferta` | reserva ÷ **prebuying** | rama comprador: prospección → prebuying → reserva |
| `tasaCierre` | cierre ÷ reserva | tramo común final |

Prelisting y prebuying son caminos **alternativos** (vendedor vs comprador), no pasos consecutivos.

**Decisión:** el tablero igual usa un orden **lineal** por posición de columna (prospección → prelisting → prebuying → captación → reserva → cierre). Mover a la derecha es avanzar, a la izquierda es retroceder. El asesor de un comprador simplemente saltea prelisting y captación. Es predecible y no bloquea nada; el ramificado real vive en el Dashboard, que no se toca.

### 3.3 El cliente vinculado hoy es opcional y casi no se usa

De 27 registros: **20 no tienen cliente vinculado** (74%), 3 tienen `lead_id`, 4 tienen `wa_contact_id`. El patrón se repite en todas las etapas y hasta la carga más reciente.

### 3.4 Los teléfonos están en formatos distintos entre tablas

| Tabla | Filas | Con teléfono | En formato `+…` |
|---|---|---|---|
| `leads` | 8.325 | 7.829 | 3.477 |
| `wa_contacts` | 1.529 | 1.529 | 0 |

Comparar el texto crudo fallaría. Ya existe `normalizePhoneE164()` en `lib/whatsapp/phone.ts` (usado por campañas y por el alta manual de contactos), que devuelve dígitos E.164 sin `+` y resuelve el "9" móvil argentino. **Se reutiliza tal cual, no se escribe otro normalizador.**

Nota: la migración del repo `20260331035500_create_leads_table.sql` declara la columna `telefono`, pero la columna real en producción es `phone`. El código debe escribirse contra el esquema real.

### 3.5 El desplegable de WhatsApp lista desde `wa_conversations`

Cambio ya en `main` (commit `f3067d2`). `getTrackingOptions.ts:52-86` lista los contactos de WhatsApp desde `wa_conversations` (donde el `agent_id` refleja al dueño real del lead) pero **devuelve el id de `wa_contacts`**, porque `performance_logs.wa_contact_id` es una FK contra esa tabla. El cruce es por teléfono exacto.

Riesgo medido: `getTrackingOptions.ts:77` omite las conversaciones sin fila en la agenda. En producción son **2 de 1.526** (0,13%), y el alta *Nuevo Contacto (Manual)* cubre el caso. No bloquea hacer obligatorio el cliente.

### 3.6 Ya existe un kanban funcionando

`components/kanban/` (`kanban-board.tsx`, `kanban-column.tsx`, `kanban-card.tsx`) con `@dnd-kit/core` y `@dnd-kit/sortable`, ambos ya en `package.json`. Se reutiliza el patrón (sensores, `DragOverlay`, rollback ante error en `kanban-board.tsx:137`) y el lenguaje visual. No se instala nada nuevo.

## 4. Diseño

### 4.1 Ubicación

Dentro de la solapa **Actividad** se agrega un switch **Lista | Pipeline**, junto al filtro de fechas. Las solapas *Objetivos* y *Configuración IA* no se tocan. La barra de filtros superior es la misma para las dos vistas.

```
Tracking Performance      [ Actividad ][ Objetivos ][ Config IA ]  [+ Nueva Actividad]

  +--------------------------------------------------------------+
  | [Todos][Prospección][Prelisting][Prebuying][Captación]...     |
  | [asesor v] [buscar...]  [fechas v]        ( Lista |PIPELINE ) |
  +--------------------------------------------------------------+

  PROSPECCIÓN   PRELISTING   PREBUYING   CAPTACIÓN   RESERVA   CIERRE
  +---------+   +---------+  +--------+  +--------+  +-------+ +-----+
  | Juan P. |   | Ana M.  |  | Luis R.|  |  ...   |  |  ...  | | ... |
  | 11-5555 |   | Sta Fe  |  | U$120k |  |        |  |       | |     |
  | 3 activ.|   | 2 activ.|  |        |  |        |  |       | |     |
  +---------+   +---------+  +--------+  +--------+  +-------+ +-----+
```

### 4.1.1 Cómo se comportan los filtros compartidos en el tablero

La barra de filtros es la misma, pero no todos los filtros significan lo mismo en un tablero. Se define así para que no haya sorpresas:

| Filtro | En Lista | En Pipeline |
|---|---|---|
| Tipo de actividad (Todos / Prospección / …) | filtra filas | **se oculta**: las columnas *son* las etapas, filtrar por tipo dejaría el tablero vacío o con una sola columna |
| Estado (original / modificada / eliminada) | filtra filas | **se oculta**: la etapa actual siempre se calcula sobre las no eliminadas (ver 4.3) |
| Asesor (director) | filtra filas | filtra **tarjetas** por el asesor dueño de las actividades |
| Búsqueda | busca en propiedad y metadata | busca en **nombre y celular del cliente**, además de la propiedad |
| Fechas | filtra por `fecha_actividad` | filtra **qué tarjetas se muestran** (las que tuvieron actividad en el rango), pero la etapa de cada tarjeta se calcula **siempre con todo su historial** |

La última fila es la más importante: si el rango de fechas recortara el historial, un cliente que cerró en mayo aparecería parado en prospección al filtrar julio. El filtro decide **qué tarjetas ves**, nunca **en qué columna caen**.

### 4.2 Identidad de la tarjeta: una por cliente

La clave de agrupación es el **celular normalizado** con `normalizePhoneE164()`:

- Registro con `wa_contact_id` → se toma `wa_contacts.phone`.
- Registro con `lead_id` → se toma `leads.phone`.
- Si un registro tiene **los dos**, manda `wa_contact_id`. Es el vínculo que más se usa hoy y el que el desplegable garantiza con teléfono presente (`wa_contacts.phone` es no nulo en las 1.529 filas; `leads.phone` está vacío en 496).
- Si dos registros normalizan al mismo celular, son **la misma tarjeta**, aunque uno venga de Tokko y el otro de WhatsApp. Esto es lo que evita los duplicados.
- Si el teléfono no se puede normalizar (nulo o inválido), la clave cae a `lead:<uuid>` o `wa:<uuid>` para que la tarjeta no se pierda.

La propiedad **no** forma parte de la clave. Es un atributo del recorrido: la tarjeta muestra la propiedad del último registro, y si el cliente cambia de propiedad se corrige en la etapa actual y las siguientes; el cambio queda visible en la trazabilidad.

**Contenido de la tarjeta:** nombre del cliente, celular formateado, propiedad del último registro, etapa actual, cantidad de actividades, fecha de la última actividad, y el asesor cuando mira el director.

### 4.3 En qué columna cae cada tarjeta

Etapa actual = **el evento más reciente del cliente**, donde "evento" es:

1. una actividad de `performance_logs` (su `type`), o
2. un movimiento manual del tablero (su etapa destino).

Se ordena por el momento en que se **registró** el evento (`created_at`), no por `fecha_actividad`. Motivo: un movimiento manual no tiene fecha de actividad, y lo último que hizo el asesor tiene que mandar aunque cargue una actividad con fecha retroactiva.

Los registros con `status = 'eliminada'` **no cuentan como evento para nadie**, tampoco para el director. `getPerformanceLogs()` hoy se los muestra al director en el listado (para auditar), pero una actividad eliminada no puede definir en qué etapa está parado un cliente. En el listado se siguen viendo igual que ahora.

### 4.4 Mover una tarjeta: una sola regla

> **¿La etapa destino ya tiene alguna actividad de ese cliente?**
>
> - **Sí** → la tarjeta se mueve. No pide nada, **no crea actividad, no toca métricas**. Se registra el movimiento (quién y cuándo) para trazabilidad.
> - **No** → se abre el popup con **exactamente los campos que pide hoy esa etapa** en `PerformanceLogForm`. Al guardar se crea la actividad vía `savePerformanceLog` y la tarjeta se mueve.

La regla es la misma hacia adelante y hacia atrás. El caso "volver atrás no pide nada" sale solo de la regla, porque las etapas ya recorridas ya tienen actividad.

Campos que pide cada etapa (los actuales, sin cambios — `PerformanceLogForm.tsx:196-444`):

| Etapa | Campos propios |
|---|---|
| Prospección | Origen, Tipo de Lead |
| Prelisting | Valor tasado/estimado (USD) |
| Prebuying | Presupuesto del comprador (USD) |
| Captación | Condición (exclusiva/no exclusiva), Valor de publicación inicial, Honorarios (%) |
| Reserva | Valor de publicación actual, Valor ofertado, Monto depositado |
| Cierre | Valor final, Honorarios totales (%), Participación |

Más los comunes: propiedad, referencia en texto, zona/barrio, propiedad en colaboración, cliente vinculado y fecha de actividad.

**Precarga del popup:** viene con el cliente ya fijado (es la tarjeta) y la propiedad del último registro, **editable**.

### 4.5 Formas de mover

1. **Arrastrar y soltar** con `@dnd-kit`, mismo patrón que `kanban-board.tsx`.
2. **Menú "Mover a…"** en cada tarjeta, con las 6 etapas. Es la vía para celular, donde arrastrar es incómodo.

Ambas disparan exactamente el mismo camino de la sección 4.4.

### 4.6 Persistencia del movimiento manual

Tabla nueva, **solo se agrega, nunca se pisa**:

```
tracking_pipeline_moves
  id            uuid pk
  agency_id     uuid not null
  agent_id      uuid not null      -- quién movió
  client_key    text not null      -- celular normalizado o lead:<id> / wa:<id>
  lead_id       uuid null          -- referencia para poder reconstruir el cliente
  wa_contact_id uuid null
  from_stage    text null
  to_stage      text not null
  created_at    timestamptz default now()
```

RLS por `agency_id`, con la misma forma que el resto de las tablas del proyecto: el asesor ve/escribe lo suyo, el director lo de su agencia.

**Alternativas evaluadas y descartadas:**

- *Una columna "etapa actual" que se sobrescribe.* Más simple de consultar, pero se pierde el historial de movimientos y el pedido explícito fue conservar la trazabilidad.
- *Crear un `performance_log` de movimiento marcado como "no cuenta".* Ensuciaría la tabla que alimenta el Dashboard y obligaría a filtrarla en todos los cálculos. Descartada.

### 4.7 Abrir la tarjeta

Click en la tarjeta → panel lateral con la **trazabilidad del cliente**:

- todas sus actividades en orden cronológico, con los datos cargados en cada una,
- los movimientos manuales intercalados,
- cambios de propiedad visibles como parte de esa secuencia.

Desde ahí se edita cualquier actividad con el formulario de siempre (`updatePerformanceLog`, con motivo obligatorio como hoy).

### 4.8 Permisos

- **Asesor:** ve y mueve solo sus clientes. El criterio es el mismo que ya usa `getPerformanceLogs()`: `agent_id = user.id`.
- **Director:** ve y mueve los de toda la agencia. El filtro por asesor de la barra superior sigue aplicando.

### 4.9 Cliente vinculado pasa a ser obligatorio

Es el único cambio que altera la rutina actual del asesor, y es necesario: sin cliente no hay tarjeta.

- `performanceLogSchema` (`lib/tracking/types.ts:84`) pasa a exigir **uno** de `lead_id`, `wa_contact_id`, o un alta manual válida.
- Aplica tanto al popup del tablero como al botón *Nueva Actividad* de siempre, para que no convivan dos comportamientos del mismo formulario.
- El bloque del formulario deja de decir "(Opcional)" y el mensaje de error es explícito.
- **Los 27 registros existentes no se tocan ni se migran.** Siguen visibles en el listado. En el tablero se muestra un aviso del tipo *"20 actividades sin cliente vinculado no se ven acá"*, con un atajo para editarlas y completarlas.

**Caso borde del alta manual, que NO se rompe.** Hoy `createManualContact` puede devolver `wa_contact_id` vacío cuando el número ya pertenece a otro asesor; el formulario guarda igual, solo sin el vínculo (`PerformanceLogForm.tsx:130-132`). Ese comportamiento **se conserva**: bloquear el guardado ahí rompería un flujo que hoy funciona. Lo único que se agrega es un aviso claro de que esa actividad quedará en el listado pero no va a generar tarjeta en el tablero, porque el contacto es de otro asesor. La validación de cliente obligatorio se aplica sobre lo que el usuario **eligió** en el formulario, no sobre el resultado de esa resolución.

### 4.10 Manejo de errores

- Falla el guardado al mover → la tarjeta **vuelve a su posición original** y se muestra un toast, mismo patrón que `kanban-board.tsx:137`.
- El usuario cancela el popup → no se mueve nada y no se guarda nada.
- Cliente sin teléfono normalizable → la tarjeta igual existe con clave de respaldo; no se rompe la vista.
- Conversación de WhatsApp sin fila en la agenda (2 casos en producción) → no aparece en el desplegable; la salida es *Nuevo Contacto (Manual)*.

## 5. Qué NO cambia

- El listado actual de actividades y todos sus filtros.
- El botón *Nueva Actividad* y el drawer, salvo la validación de cliente obligatorio.
- Editar y eliminar actividades, con motivo obligatorio.
- Las solapas *Objetivos* y *Configuración IA*.
- Todos los cálculos del Dashboard: no se crea ninguna actividad extra, así que ninguna métrica cambia de valor.
- El pipeline de leads existente en `/director/pipeline` y sus componentes `components/kanban/`.

## 6. Verificación

- Se implementa en rama aparte, nunca directo sobre `main`.
- Se levanta con `npm run dev` y se prueba en local antes de mergear.
- Casos a probar a mano:
  1. Cliente con actividades en Tokko y en WhatsApp con el mismo celular → aparece **una** tarjeta.
  2. Mover hacia adelante a una etapa nueva → pide los campos de esa etapa y el registro aparece en el listado.
  3. Mover hacia atrás → no pide nada, la tarjeta queda ahí, y el Dashboard **no cambia de números**.
  4. Volver a avanzar a una etapa ya recorrida → no pide nada.
  5. Cambiar la propiedad al avanzar → queda reflejado en la trazabilidad.
  6. Mover desde el menú "Mover a…" en pantalla de celular.
  7. Asesor no ve ni mueve clientes de otro asesor.
  8. Cortar la red al mover → la tarjeta vuelve sola a su lugar.
  9. Filtrar por fechas un rango corto → las tarjetas que quedan siguen en su columna correcta, no retroceden.
  10. Alta manual con un celular que ya es de otro asesor → se guarda igual, con el aviso, sin romperse.
- Merge a `main` solo con OK explícito.

## 7. Documentación a actualizar

- `docs/interno/LOGICA-PRISMA.md`
- `docs/interno/TECNICO-PRISMA.md`
- `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md`
- `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`
