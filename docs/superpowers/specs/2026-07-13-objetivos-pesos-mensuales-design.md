# Trabajo 1 — Objetivos con % por mes y reparto del total anual

**Fecha:** 2026-07-13
**Módulo:** Tracking Performance → solapa "Objetivos" (app del director en PRISMA)
**Alcance:** una rama propia (`feat/objetivos-pesos-mensuales`), probar en local, OK de Leonardo, actualizar docs, mergear a main.

---

## 1. Objetivo

Hoy el director carga el objetivo mensual de cada asesor mes por mes, o usa "Aplicar a todos" para **copiar el mismo valor** a los 12 meses. Eso no refleja la estacionalidad del negocio inmobiliario (no se factura/capta igual todos los meses).

Queremos que el director:

1. Defina **una vez por año** un **peso en % para cada mes** (ej. Ene 5%, Feb 6%, … Dic 12%), común a todos los asesores.
2. En la columna de la derecha escriba el **total anual** de cada asesor y, al apretar **Aplicar**, el sistema **reparta** ese total por mes: `objetivo_del_mes = total_anual × (% de ese mes)`.

Decisiones ya tomadas con Leonardo:

- **Los % se guardan** (persisten por año). Al volver a entrar siguen ahí y se pueden ajustar.
- **Un juego de % por métrica**: Facturación tiene sus % y Captación los suyos (son negocios con estacionalidad distinta).
- **Obligar a 100%**: el reparto no se habilita hasta que los 12 % sumen exactamente 100% (para la métrica activa).

---

## 2. Estado actual (verificado en código)

- **UI:** `components/tracking/PerformanceObjectivesEditor.tsx`
  - Toggle de métrica (`facturacion` / `captacion`), selector de año, tabla con filas = asesores y columnas = 12 meses + "Aplicar a todos".
  - `applyToAll(agentId)` toma `bulk[agentId]` y **copia el mismo valor** a los meses no cerrados.
  - `handleSave()` recorre todas las celdas editables de **ambas** métricas y llama `saveObjectives`.
- **Acciones server:** `actions/tracking/objetivos.ts`
  - `getDirectorContext()` fuerza rol director + `agency_id` desde el perfil (nunca desde el cliente).
  - `getAgencyAdvisors()`, `getObjectivesForEditor(year)`, `saveObjectives({year, cells})`.
  - Escritura vía `createAdminClient()` con `upsert(..., { onConflict: "agent_id,year,month,metric" })`.
- **Tipos puros:** `lib/tracking/objetivos-types.ts` → `ObjectiveMetric`, `OBJECTIVE_METRICS`, `MONTH_NAMES`, `isMonthLocked(year, month, now)`.
- **Tabla existente:** `performance_objectives` (agency_id, agent_id, year, month, metric, target_value, created_by, updated_at). Único por `(agent_id, year, month, metric)`.
- **Regla de meses cerrados:** `isMonthLocked` → año pasado = todo cerrado; año actual = meses anteriores al actual cerrados; año futuro = todo editable.

---

## 3. Modelo de datos (nuevo)

Tabla **`performance_objective_weights`** (mismo patrón y RLS que `performance_objectives`):

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | default gen_random_uuid() |
| `agency_id` | uuid | FK a agencies |
| `year` | int | |
| `metric` | text | `facturacion` \| `captacion` |
| `month` | int | 1–12 |
| `weight_pct` | numeric | 0–100, hasta 2 decimales |
| `created_by` | uuid | |
| `updated_at` | timestamptz | |

- **Único:** `(agency_id, year, metric, month)`.
- **RLS:** igual que `performance_objectives` (el director lee/gestiona solo su agencia; las escrituras van por `createAdminClient()` con `agency_id` forzado desde el perfil). Antes de escribir la migración, **verificar en la BD** las policies reales de `performance_objectives` y clonarlas.
- Migración vía `mcp__supabase__apply_migration` (con OK), nombre `performance_objective_weights`.

---

## 4. Acciones server nuevas (`actions/tracking/objetivos.ts`)

```ts
// Lee los % guardados de la agencia para un año (todas las métricas).
getObjectiveWeights(year): Promise<{ metric: ObjectiveMetric; month: number; weight_pct: number }[]>

// Guarda (upsert) los 12 % de UNA métrica para un año.
// Valida: rol director, métrica válida, cada mes 1–12, y que los 12 sumen 100 (±0.01).
saveObjectiveWeights({ year, metric, weights: { month:number; weight_pct:number }[] })
```

- Reutilizan `getDirectorContext()`.
- `saveObjectiveWeights` valida la suma **en el server** (defensa) además de en el cliente. Si no suma 100 → `throw new Error("Los porcentajes deben sumar 100%")`.
- Upsert con `onConflict: "agency_id,year,metric,month"` vía `createAdminClient()`.
- `revalidatePath` de las mismas rutas que `saveObjectives`.

---

## 5. Comportamiento en la UI

### 5.1 Fila de "% por mes"

- Se agrega **una fila** arriba de las filas de asesores (dentro de la misma tabla o como bloque propio arriba), con 12 inputs de % para la **métrica activa** (cambia al togglear métrica).
- Al lado de la fila, un **contador vivo**: "Suma: 100% ✓" (verde) o "Suma: 98% ✗" (rojo).
- Los % se cargan al entrar (`getObjectiveWeights(year)`), se separan por métrica y se muestran los de la métrica activa.
- Botón **"Guardar %"** (o se guardan junto con "Guardar objetivos"): guarda la métrica activa vía `saveObjectiveWeights`. Deshabilitado si la suma ≠ 100 o si el año es de solo lectura.
- **Meses cerrados:** los % son el plan del año completo; los 12 inputs quedan **editables** mientras el año no sea de solo lectura (aunque el mes esté cerrado), porque son números de planificación. El bloqueo real aplica al **reparto** (ver 5.2), no a la definición del %.

### 5.2 Columna "Aplicar a todos" → "Total del año"

- La casilla de la derecha se relabela **"Total del año"** (mismo `bulk[agentId]`).
- `applyToAll(agentId)` cambia:
  1. Requiere que los 12 % de la métrica activa **sumen 100** (si no, `toast.error("Cargá los % del año — deben sumar 100%")` y no reparte).
  2. Para cada mes `m` **no cerrado**: `next[cellKey(agentId, metric, m)] = round(total × weight_pct[m] / 100)`.
  3. Los meses cerrados se **saltean** (mantienen su valor actual), igual que hoy.
  4. `toast.success("Total repartido por mes según los %")`.
- Redondeo: a entero para `captacion` (cantidad) y a 2 decimales o entero para `facturacion` (USD) — definir al implementar; por defecto redondear a entero en ambos para simplicidad visual, salvo que se pida decimales.

### 5.3 Nota al pie (actualizar)

Explicar en el texto de ayuda: "Definí el % de cada mes (deben sumar 100%). Después, por asesor, escribí el total del año y apretá Aplicar: cada mes se completa con total × % del mes. Los meses ya cerrados no se tocan."

---

## 6. Casos borde / validaciones

- **% no suman 100:** botón Guardar % y botón Aplicar deshabilitados/bloqueados; contador en rojo.
- **Año de solo lectura (pasado):** inputs de % en solo lectura, igual que las celdas de meses.
- **Total anual vacío o no numérico:** `toast.error` como hoy.
- **Mitad de año (algunos meses cerrados):** el reparto llena solo los meses editables; el total efectivamente cargado será menor al total anual escrito (los meses cerrados conservan lo suyo). Es el comportamiento esperado y se documenta.
- **Métrica sin % cargados todavía:** contador muestra "Suma: 0% ✗", Aplicar bloqueado hasta cargar.

---

## 7. Archivos a tocar

- **Nueva migración:** tabla `performance_objective_weights` (+ RLS clonada de `performance_objectives`).
- `actions/tracking/objetivos.ts` — agregar `getObjectiveWeights`, `saveObjectiveWeights`.
- `components/tracking/PerformanceObjectivesEditor.tsx` — fila de %, contador de suma, relabel de la columna, nueva lógica de `applyToAll`, carga/guardado de %.
- (Opcional) `lib/tracking/objetivos-types.ts` — helper puro `sumaPesos(weights)` / `pesosSuman100(weights)` reutilizable en cliente y server.

## 8. Prueba (local)

1. `npm run dev`, entrar como director a `/director/tracking-performance` → solapa Objetivos.
2. Cargar % (ej. 12 meses ≈ 8.33%) → contador debe llegar a 100% para habilitar.
3. Guardar %, refrescar, verificar que persisten (y que Captación tiene su propio juego).
4. Escribir un total anual en un asesor, Aplicar, verificar `mes = total × %`.
5. Verificar que los meses cerrados no se modifican.
6. Verificar que un no-director no puede escribir (acción falla por rol).

## 9. Docs a actualizar (workflow de Leonardo)

- `docs/interno/LOGICA-PRISMA.md` y `TECNICO-PRISMA.md` — nueva tabla y lógica de reparto.
- `FUNCIONAL-DIRECTOR` — explicación simple: "cómo cargar la estacionalidad y repartir el objetivo anual". (Es una función del director/cliente.)

## 10. Fuera de alcance (YAGNI)

- Plantillas de % predefinidas.
- Copiar los % de un año a otro.
- Mostrar preview del reparto antes de aplicar.
- % a nivel de asesor individual (los % son comunes a la agencia).
