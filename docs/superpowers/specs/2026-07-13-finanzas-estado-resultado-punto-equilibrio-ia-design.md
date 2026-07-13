# Trabajo 3 — Finanzas: Estado de Resultado + Punto de Equilibrio + Experto IA

**Fecha:** 2026-07-13
**Módulo:** admin-vakdor → página "Finanzas"
**Alcance:** una rama propia (`feat/finanzas-estado-resultado-ia`), probar en local, OK de Leonardo, actualizar docs, mergear a main.

---

## 1. Objetivo

La página de Finanzas ya muestra ingresos, costos de IA, gastos, márgenes y un mini "Estado de Resultados" en formato de margen de contribución. Queremos tres cosas:

- **A) Estado de Resultado (formato contable clásico y completo):** ventas → costo de ventas → utilidad bruta → gastos operativos → utilidad operativa → gastos financieros → utilidad antes de impuestos → impuestos → utilidad neta.
- **B) Punto de Equilibrio:** precio, costo variable unitario, gastos fijos, margen de contribución unitario y punto de equilibrio (en unidades = agencias). **Prellenado con datos reales pero editable** para simular escenarios.
- **C) Experto IA:** un modelo **Gemini 3.5 Flash** analiza toda la info y devuelve comentarios de mejoras, optimización y próximos pasos. Corre **junto con el botón general de actualizar** (hoy "Sincronizar costos", que se renombra a **"Actualizar"**), no como botón aparte. Se guarda el último análisis para no gastar IA en cada visita.

Decisiones ya tomadas con Leonardo:

- Clasificación de gastos para el estado de resultado: **automática por categoría** (mapa fijo, definido abajo) + una categoría nueva **"Financiero"**.
- Punto de equilibrio: **prellenar con datos reales + editable**.
- IA: **Gemini 3.5 Flash**, disparada por el botón **"Actualizar"**, análisis guardado.

---

## 2. Estado actual (verificado en código)

- **Página:** `app/admin-vakdor/finanzas/page.tsx` → `components/admin-vakdor/finanzas-client.tsx`.
- **API métricas:** `app/api/admin-vakdor/finance/metricas/route.ts` (GET `?mes=YYYY-MM`).
  - Junta: `finance_api_costs` (costos IA, USD), `pagos_agencia` (ingresos), `finance_expenses` (gastos), `finance_fx` (tipo de cambio USD→ARS).
  - `gastoDelMes(e, mes)` prorratea según recurrencia (mensual/anual/único) y ventana de fechas.
  - `kpisDeMes(mes)` calcula en USD: `ingresos, costosIa, gastosFijos, gastosVariables, costosVariables (=costosIa+gastosVariables), mc, ebit, costosTotal, dol, margenPct`.
  - Devuelve KPIs, breakdowns (proveedor/categoría), `evolucion` (12 meses), `expenses`, `fxList`.
- **Gastos:** `finance_expenses` con `categoria` ∈ {suscripcion, infraestructura, proxy, marketing, sueldos, impuestos, otro}, `tipo` ∈ {fijo, variable}. La validación de categoría está en `app/api/admin-vakdor/finance/expenses/route.ts` (array `CATEGORIAS`, con fallback a "otro"). **Verificar si `finance_expenses.categoria` tiene un CHECK en la BD**; si lo tiene, la migración debe permitir 'financiero'.
- **Cliente:** `finanzas-client.tsx`
  - Botón "Sincronizar costos" → `POST /api/admin-vakdor/finance/sync?days=3` y luego `load(mesSel)`.
  - Bloque "Estado de Resultados" (línea ~260): `PnLRow` en formato MC → EBIT (a reemplazar por el clásico).
  - Mapas `CAT_LABEL` / `CAT_COLORS` para categorías.
- **Gemini:** `lib/gemini.ts` → `prismaIA.generateContent(prompt)` (`gemini-3.5-flash`), `result.response.text()` y `result.response.usageMetadata`. **El costo de esta llamada ya lo captura el sync de costos Gemini→BigQuery** (misma `GEMINI_API_KEY`), así que no hay que registrar tokens aparte.

---

## 3. A) Estado de Resultado clásico

### 3.1 Mapa de categorías → renglones (fijo)

| Renglón | Fórmula / origen |
|---|---|
| **Ventas** | `ingresos` (pagos_agencia) |
| − **Costo de ventas** | `costosIa` + gastos de categoría {`infraestructura`, `proxy`} |
| = **Utilidad bruta** | Ventas − Costo de ventas |
| − **Gastos operativos** | gastos de categoría {`sueldos`, `marketing`, `suscripcion`, `otro`} |
| = **Utilidad operativa** | Utilidad bruta − Gastos operativos |
| − **Gastos financieros** | gastos de categoría {`financiero`} (nueva) |
| = **Utilidad antes de impuestos** | Utilidad operativa − Gastos financieros |
| − **Impuestos** | gastos de categoría {`impuestos`} |
| = **Utilidad neta** | UAI − Impuestos |

> Nota: este mapa usa la **categoría** del gasto (no la marca fijo/variable). Los costos de IA (`finance_api_costs`) siempre entran en Costo de ventas. Todo prorrateado por `gastoDelMes` y convertido a USD (o ARS según el toggle, en el cliente).

### 3.2 Dónde se calcula

- Extraer la lógica de cómputo de un mes a un helper compartido **`lib/admin-vakdor/finance/metrics.ts`** (`computeFinanceMetrics(mes, {costs, pagos, expenses, fxDe})`), y usarlo tanto en `metricas/route.ts` como en el endpoint de análisis IA (§5), para no duplicar ni desincronizar números. La ruta `metricas` devuelve además un objeto **`estadoResultado`** con los 9 renglones (en USD).
- El cliente renderiza el estado de resultado clásico con `PnLRow` (reutilizando el componente, agregando los renglones nuevos y separadores en Utilidad bruta / operativa / UAI / neta), convirtiendo USD→moneda elegida con el `money()` ya existente.

### 3.3 Categoría "Financiero"

- Agregar `"financiero"` al array `CATEGORIAS` en `finance/expenses/route.ts`.
- Agregar `financiero: "Financiero"` a `CAT_LABEL` y un color a `CAT_COLORS` en `finanzas-client.tsx`.
- Si hay CHECK en BD sobre `categoria`, migración para permitir el nuevo valor (con OK).

---

## 4. B) Punto de Equilibrio

### 4.1 Datos reales para prellenar (desde la ruta métricas)

- `metricas` agrega **`nAgenciasPagando`**: cantidad de agencias distintas con un pago en el mes seleccionado (de `pagos_agencia`).
- Prefills (en la moneda elegida, calculados en el cliente a partir de lo que ya devuelve la ruta):
  - **Precio** (por agencia) = `ingresos / nAgenciasPagando`.
  - **Costo variable unitario** = `(costosIa + gastosVariables) / nAgenciasPagando`.
  - **Gastos fijos** (del mes) = `gastosFijos`.

### 4.2 Cálculo (en el cliente, editable)

- **Margen de contribución unitario** = `precio − costoVariableUnitario`.
- **Punto de equilibrio (unidades)** = `ceil(gastosFijos / mcUnitario)` (cantidad de agencias necesarias para cubrir los fijos). Si `mcUnitario ≤ 0` → mostrar "—" con aviso ("con estos números no hay punto de equilibrio: el precio no cubre el costo variable").

### 4.3 UI

- Un card nuevo "Punto de equilibrio" con 3 inputs editables (precio, costo variable unitario, gastos fijos) prellenados con los reales, y 2 salidas calculadas (MC unitario, punto de equilibrio en agencias).
- Botón chico "Restablecer con datos reales" para volver a los prefills tras simular.
- La unidad se rotula claramente como **"agencias"** (una suscripción = una agencia que paga).

---

## 5. C) Experto IA (Gemini 3.5 Flash)

### 5.1 Endpoint nuevo `POST /api/admin-vakdor/finance/analisis`

- `requireAdminVakdor`.
- Body: `{ mes: "YYYY-MM" }`.
- Recalcula server-side con `computeFinanceMetrics` (mes actual + evolución 12m + estado de resultado + break-even con `nAgenciasPagando`), arma un **prompt en español** tipo:
  > "Sos un CFO / experto en finanzas de una empresa SaaS (Vakdor, que le cobra a inmobiliarias). Estos son los números del mes {mes} y la evolución de 12 meses: {estado de resultado, ingresos/costos/utilidad por mes, punto de equilibrio}. Devolvé SOLO JSON: { diagnostico, mejoras: [], optimizacion_costos: [], proximos_pasos: [], riesgos: [] }. Sé concreto, con números, sin relleno."
- `prismaIA.generateContent(prompt)` → limpiar markdown ```` ```json ```` → `JSON.parse`.
- Guardar en tabla **`finance_ai_analysis`** (ver 5.2), `upsert` por `mes` (guardamos el último análisis de cada mes).
- Responder el análisis + `generated_at`.
- Manejo de error: si Gemini falla o el JSON no parsea, responder `500` con mensaje y **no** romper el flujo de actualizar (el cliente muestra los números igual, con aviso "no se pudo generar el análisis").

### 5.2 Tabla `finance_ai_analysis`

| Columna | Tipo | Nota |
|---|---|---|
| `mes` | text PK | "YYYY-MM" |
| `contenido` | jsonb | `{ diagnostico, mejoras, optimizacion_costos, proximos_pasos, riesgos }` |
| `generated_at` | timestamptz | |

- Solo se accede vía service-role desde endpoints admin-vakdor (no RLS pública). Migración con OK.

### 5.3 Integración con el botón "Actualizar"

- Renombrar el botón **"Sincronizar costos" → "Actualizar"** en `finanzas-client.tsx`.
- Al apretarlo, en secuencia:
  1. `POST /finance/sync?days=3` (costos IA).
  2. `load(mesSel)` (recarga métricas + estado de resultado + prefills del break-even).
  3. `POST /finance/analisis { mes: mesSel }` y guardar el resultado en estado para mostrarlo.
  - Estados de carga por paso ("Actualizando costos…", "Analizando con IA…").
- **Al entrar a la página** (sin apretar nada): la ruta `metricas` devuelve además el **último análisis guardado** de ese mes (`ultimoAnalisis`), y el cliente lo muestra. Si no hay, muestra "Apretá Actualizar para generar el análisis del experto."

### 5.4 UI del análisis

- Un panel "Análisis del experto (IA)" con secciones: Diagnóstico, Mejoras, Optimización de costos, Próximos pasos, Riesgos (listas). Fecha del análisis (`generated_at`) y aclaración chica: "Generado por IA (Gemini) — revisar antes de decidir."

---

## 6. Archivos a tocar

- **Nuevas migraciones:** `finance_ai_analysis`; permitir categoría `financiero` si hay CHECK.
- `lib/admin-vakdor/finance/metrics.ts` — **nuevo** helper `computeFinanceMetrics` + `estadoResultado` + break-even inputs.
- `app/api/admin-vakdor/finance/metricas/route.ts` — usar el helper; devolver `estadoResultado`, `nAgenciasPagando`, `ultimoAnalisis`.
- `app/api/admin-vakdor/finance/analisis/route.ts` — **nuevo** (Gemini + guardar).
- `app/api/admin-vakdor/finance/expenses/route.ts` — agregar `financiero` a `CATEGORIAS`.
- `components/admin-vakdor/finanzas-client.tsx` — estado de resultado clásico, card de punto de equilibrio, panel de análisis IA, renombrar botón y encadenar los 3 pasos, `CAT_LABEL`/`CAT_COLORS` con "Financiero".

## 7. Prueba (local)

1. `npm run dev`, entrar a admin-vakdor → Finanzas.
2. Cargar gastos de varias categorías (incluida una "Financiero" y una "Impuestos") y verificar que el **estado de resultado** los ubica en el renglón correcto y que la utilidad neta cierra.
3. Verificar el **punto de equilibrio**: prefills con datos reales, editar el precio y ver cómo cambia el punto de equilibrio; caso `mcUnitario ≤ 0` muestra el aviso.
4. Apretar **"Actualizar"**: corre sync → recarga → genera análisis IA; el panel muestra diagnóstico/mejoras/etc.
5. Recargar la página: aparece el **último análisis guardado** sin volver a llamar a la IA.
6. Forzar un error de IA (ej. sin `GEMINI_API_KEY`) y verificar que los números se muestran igual con aviso.

## 8. Docs a actualizar

- `docs/interno/LOGICA-PRISMA.md` y `TECNICO-PRISMA.md` — estado de resultado, punto de equilibrio, endpoint de análisis IA, tabla `finance_ai_analysis`, categoría nueva. Es funcionalidad **interna de Vakdor** (no va en guías FUNCIONAL del cliente).
- Considerar nota en la memoria de proyecto [[finanzas-modulo-costos]] al cerrar.

## 9. Fuera de alcance (YAGNI)

- Editar el mapa categoría→renglón desde la UI (por ahora es fijo en código).
- Punto de equilibrio con múltiples productos/planes.
- Histórico de análisis IA (guardamos solo el último por mes).
- Exportar el estado de resultado a PDF (existe la skill Vakdor-PDF si se pide después).
- Presupuesto/forecast.
