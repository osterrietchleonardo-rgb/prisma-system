# ACM Fase 2 — el checklist de comparables aprovecha la riqueza de `mercado_avisos`

**Fecha:** 2026-09-02
**Estado:** propuesta para revisión de Leonardo
**Pedido (Leonardo, 2-sep):** "analizar de agregar más ítems en el checklist de comparables,
ya que esta nueva fuente de información tiene bastante más para comparar y filtrar
perfectamente" — y desarrollar el spec de TODO lo relevado, no solo los primeros cuatro.

**Contexto:** el corte a `mercado_avisos` está aplicado y verificado (spec
`2026-09-02-corte-mercado-avisos-design.md`). El ACM hoy compara con las variables heredadas
de roomix. La fuente nueva trae campos que roomix no tenía; este spec define cuáles entran,
cómo (excluir / puntuar / informar) y qué hay que tocar en cada capa.

---

## 1. Los tres roles de una variable (principio de diseño)

Cada dato puede jugar UNO de tres roles, y elegir mal el rol rompe el ACM:

- **GATE (excluye):** solo para datos presentes en ~todos los avisos y donde la mezcla
  arruina la comparación (hoy: operación, tipo, barrio, m² 0,6–1,4×, ambientes ±1, obra).
- **SCORE (puntúa el %):** para datos parciales pero frecuentes. Regla heredada que se
  mantiene: **sin dato pasa sin castigo** (si castigara, en zonas de carga floja el asesor
  se queda sin comparables). El peso solo se activa cuando el sujeto declara Y el candidato
  tiene dato.
- **BADGE (informa):** datos que no miden "parecido físico" pero cambian la lectura del
  precio (bajó de precio, días publicado, dueño directo…). Van en la tarjeta/checklist, no
  tocan el %.

**Cobertura medida en producción (2-sep, 20.436 avisos venta ok):** cocheras 100% ·
variación de precio calculada 99,8% (hoy 0% con cambio: la tabla tiene 2 días; se enciende
sola con los refrescos) · días publicado 90,8% · puntaje del publicador 90,4% · disposición
76,1% · expensas 56,5% · orientación 52,2% · apto crédito 23,4% (true) · piso 19,9% ·
"a estrenar" en el texto 17,3% · dueño directo 1,1%.

---

## 2. Los ítems, uno por uno

### 2.1 Cocheras (dato duro nuevo) — SCORE, peso 10

Hoy la cochera se adivina con regex sobre el texto. `mercado_avisos.cocheras` viene contado
(100% no-nulo; 28,7% con ≥1). Comportamiento:
- El sujeto ya lo declara (switches "Cochera Cubierta"/"Cochera Descub." → `quiere_cochera`).
- Sujeto quiere cochera: candidato `cocheras > 0` → 100; `cocheras = 0` **y** el texto
  tampoco la menciona (regex actual) → 0; `cocheras = 0` pero el texto la menciona → 100
  (defensa contra el 0-por-no-parseado, ver §8).
- Sujeto no declara → peso 0 (como el resto).
- La cochera SALE del matching de amenities para no puntuar dos veces.

### 2.2 Piso — SCORE, peso 6

El form ya pide "PISO (0=PB)"; la red nunca lo comparó. `piso` 19,9% declarado → peso
liviano, sin dato pasa. Igual piso → 100; ±2 pisos → 50; más lejos → 0. (PB vs piso alto
importa en luz/ruido/precio; con 20% de cobertura no da para más peso.)

### 2.3 Orientación — SCORE, peso 5

El form ya pide ORIENTACIÓN (N/S/E/O…); `orientacion` 52,2% declarada. Igual → 100;
adyacente (N vs NE) → 50; opuesta → 0; sin dato pasa.

### 2.4 Disposición (la "VISTA" del form) — SCORE, peso 5

El form pide VISTA (Frente/Contrafrente…); en la fuente es `disposicion`
(frente/contrafrente/lateral/interno), 76,1% declarada. Igual → 100; distinta → 0; sin
dato pasa. Mapeo form→dato: Frente→frente, Contrafrente→contrafrente, Lateral→lateral,
Interno→interno (verificar los valores exactos del combo en implementación).

**Pesos resultantes:** hoy ≈120 máx (zona 20 · sup 22 · amb 16 · dorm 14 · baños 12 ·
ant 14 · amen 12 · sem 10). Se suman cocheras 10 + piso 6 + orientación 5 + disposición 5.
Todos condicionales, igual que los actuales. ⚠️ **La cota superior del `pool` DEBE sumar
los pesos nuevos** (w_coch + w_piso + w_ori + w_disp valuados en tope) — si no, el corte a
1.500 candidatas puede descartar filas que entrarían al top 50 y el ranking queda mal
(es la invariante que protege la migración 20260819120100).

### 2.5 Bajó de precio — BADGE

`variacion_precio_pct` + `precio_inicial` (y el detalle en `mercado_precios`). Tarjeta:
**"↓ Bajó 12% (de US$ 320.000)"** cuando `variacion_precio_pct <= -3` (bajo el 3% es ruido
de redondeo). Hoy no se enciende ninguno (tabla de 2 días); con el refresco mensual y el
descubrimiento se va poblando solo. No toca el %.

### 2.6 Días publicado — BADGE

`dias_publicado` (90,8%): **"Publicado hace N días"**, con acento visual si N > 90 (lleva
mucho tiempo = precio probablemente alto — señal de liquidez para tasar). No toca el %.

### 2.7 Expensas — BADGE

`expensas` + `expensas_moneda` (56,5%): **"Expensas $X"** en la tarjeta. Regla vigente que
se respeta: es "lo que figura hoy" (la moneda se asume ARS; el portal no la declara). Sin
dato → no se muestra nada (nunca "sin expensas").

### 2.8 Dueño directo — BADGE

`es_dueno_directo` (1,1%): **"Dueño directo"**. Los dueños tasan distinto; el asesor tiene
que verlo. Con 1,1% no amerita filtro.

### 2.9 Apto crédito — BADGE

`apto_credito` (23,4% true): **"Apto crédito"**. Relevante para compradores financiados.

### 2.10 En construcción — BADGE

`en_construccion`: **"En construcción"**. El gate de obra ya los excluye/incluye según el
sujeto (fix del 2-sep); el badge hace VISIBLE por qué ese comparable está ahí cuando el
sujeto es en pozo.

### 2.11 Reputación del publicador — en la tarjeta

`publicador_puntaje` + `publicador_resenas` (90,4%): junto al nombre de la inmobiliaria,
**"★ 4,5 (120)"**. Un comparable de un publicador serio pesa más en la cabeza del asesor.

### 2.12 Posición vs la mediana del conjunto — BADGE (solo UI)

Con los ≤100 comparables ya traídos, el navegador calcula la mediana de US$/m² del conjunto
y cada tarjeta muestra **"+8% sobre la mediana"** / **"−5% bajo la mediana"**. Cero SQL:
puro cliente. Es la lectura más rápida de "caro/barato relativo" que puede tener el asesor.

### 2.13 "A estrenar" pleno — LOADER + BACKFILL (prerequisito del gate)

**ENMIENDA (3-sep, implementación):** la señal SÍ viene estructurada — el feature `CFT5`
del detalle dice literalmente "A estrenar" en **9.048 avisos (44%)** y "En construcción"
en 23; el loader la tiraba porque su regex solo extraía dígitos. Mucho mejor que el plan
original de regex sobre el texto (17,3%). Además se cazó un segundo bug: el loader
contaba **toilettes como cocheras** (en el detalle CFT4 = toilette; las cocheras reales
viajan en `CFT7` — 3.570 falsas y 1.804 perdidas). Lo aplicado:
- **Loader**: `CFT5` "A estrenar" → `antiguedad_anios = 0`; `CFT5` "En construcción" →
  `en_construccion = true`; cocheras desde `CFT7` (el backstop de card-CFT4 se eliminó).
- **Backfill** desde el payload guardado (sin re-scrapear), ensayado y aplicado el 3-sep:
  cocheras>0 pasó de 6.213 corruptas a 4.312 reales; ~9.000 avisos con antigüedad 0.
- Con eso, el gate queda completo: sujeto "A estrenar" matchea los 0; "En pozo" matchea
  los `en_construccion` (derivado -1, fix del 2-sep); "usada" excluye ambos.
- Efecto colateral deseado: los "a estrenar" dejan de puntuar antigüedad como "sin dato"
  y pasan a puntuar como 0 años (correcto: un estrenar NO es comparable liso de un usado
  de 30 años, hoy pasa sin castigo).

### 2.14 Sub-barrio como barrio propio en el matching — SQL

Del reporte de Leonardo del 3-sep (el desplegable en 0): el conteo ya se arregló (la vista
cuenta barrio + sub_barrio), pero el matching tiene un refinamiento pendiente: un sujeto en
"Belgrano R" hoy encuentra sus avisos vía la relación de zonas (puntaje 70, "lindero"),
cuando los avisos con `sub_barrio = 'Belgrano R'` deberían puntuar como barrio PROPIO (100).
Cambio en `acm_match_roomix`: el JOIN de zonas matchea también
`acm_norm(sub_barrio) = clave` con score 100 (con su índice de expresión espejo, mismo
patrón que los demás). Aplica a Belgrano R/C/Chico, Palermo Hollywood/Soho/Chico,
Las Cañitas, Botánico, Lomas de Núñez… (todos con conteo real ya visible).

### 2.15 Los "0 avisos" verdaderos — copy de UI

Los ~90 barrios del catálogo aún sin cargar muestran "0 avisos" (verdad, pero suena a
roto). La opción pasa a decir **"sin avisos aún"** (y sigue al fondo del orden). Cuando
Leonardo carga la zona por Apify, el número aparece solo.

---

## 3. Cambios por capa

### 3.1 Vista de compatibilidad (`roomix_properties`) — ADITIVO

Se agregan columnas con sus nombres reales de mercado (no rompen nada: los `select`
existentes piden columnas puntuales, y el `select('*')` del Buscador ignora las extra):
`cocheras, expensas, expensas_moneda, dias_publicado, variacion_precio_pct, precio_inicial,
disposicion, orientacion, es_dueno_directo, apto_credito, en_construccion, precio_m2,
publicador_puntaje, publicador_resenas`.

### 3.2 `acm_match_roomix` — parámetros y salidas nuevas

- Parámetros nuevos **con DEFAULT** (para que el código viejo siga llamando igual):
  `p_cochera boolean default null` · `p_piso integer default null` ·
  `p_orientacion text default null` · `p_disposicion text default null` ·
  `p_cochera_patron text default null` (la regex de texto para la defensa del 0).
- Salidas nuevas: `sc_cocheras, sc_piso, sc_orientacion, sc_disposicion` (int, null si el
  peso no aplica — mismo contrato que las actuales).
- ⚠️ Cambiar el RETURNS exige **DROP FUNCTION + CREATE** (no alcanza `or replace`), en una
  transacción, con el `ALTER … SET statement_timeout='25s'` re-aplicado.
- La cota superior del pool suma los pesos nuevos (§2.4).
- Método: mismo de siempre — definición viva + reemplazos verificados por script.

### 3.3 Route (`app/api/acm/comparables/route.ts`) + subject

- `lib/acm/subject.ts`: `sujetoCochera()` (de los dos switches), mapeos de orientación y
  vista→disposición a los valores de la base.
- El route pasa los params nuevos y mapea `sc_*` nuevos al payload del checklist.
- El re-fetch de filas suma las columnas nuevas de §3.1 a su `select` puntual.

### 3.4 UI (tarjeta + "Ver checklist de comparabilidad")

- Checklist: filas nuevas Cocheras / Piso / Orientación / Disposición (mismo formato % que
  las actuales; si `sc_*` viene null, la fila no se muestra — igual que hoy).
- Tarjeta: badges §2.5–2.10 + reputación §2.11 + posición vs mediana §2.12. Diseño sobrio:
  los badges informativos NO compiten visualmente con el % de coincidencia.
- Celular: los badges envuelven (wrap), nada tapado (regla de verificación de siempre).

### 3.5 Loader + backfill (§2.13)

En `mercado-sync/loader.mjs` (rama nueva) + un UPDATE de backfill aplicado por Management
API con BEGIN…ROLLBACK de ensayo y conteo esperado (~3.500) verificado antes del commit.

### 3.6 Ficha compartible (`/ficha-acm/[token]`)

Los badges de precio (bajó / días publicado / expensas) también en la ficha que ve el
cliente final — misma fuente, misma lógica. (La reputación del publicador NO va en la
ficha pública: es lectura interna del asesor.)

---

## 4. Orden de deploy (sin ventana rota)

1. **DB primero** (vista aditiva + drop/create de la función con defaults): el app viejo
   sigue funcionando idéntico (params con default, columnas extra ignoradas).
2. **Deploy del código** (route + UI + subject).
3. **Loader + backfill** en cualquier momento posterior (independiente).

## 5. Verificación (matriz mínima)

- SQL, por cada score nuevo: sujeto que declara → candidatos ordenan como se espera;
  sujeto que no declara → `sc_* = null` y el % no cambia vs hoy (regresión de paridad:
  misma consulta de Belgrano de la matriz del 2-sep, mismos ids y pcts con los params
  nuevos en null).
- La cota del pool: variante sin corte (v_pool enorme) vs con corte → mismas filas y orden
  (el método de 20260819120100).
- Backfill estrenar: la cuenta coincide con el criterio (~3.500) y `acm_pasa_obra` con
  sujeto estrenar devuelve solo edad 0.
- Navegador (PRISMAIA-VAKDOR, escritorio + celular): checklist con filas nuevas, badges
  legibles, ficha compartible, y el caso del reporte original (usado de 5 años) sin pozos.

## 6. Fuera de alcance (dicho a propósito)

- Filtros nuevos en el FORM (p.ej. "solo dueño directo", "expensas hasta X"): primero se
  mira si los badges alcanzan; agregar controles es fricción para el asesor.
- Tocar el Buscador IA o el Mapa (tienen su propia fase 2).
- Alquileres (el corte es venta; la regla de expensas de alquiler no aplica acá).

## 7. Costo estimado

Solo desarrollo + verificación (sin gasto de servicios): 1 migración DDL aditiva, 1
drop/create de función, ~4 archivos de app, loader + 1 backfill. Todo con el método del
corte (definición viva + reemplazos verificados + BEGIN…ROLLBACK + navegador).

## 8. Ítems a verificar durante la implementación (no asumir)

- **Cocheras = 0**: muestrear payloads para distinguir "declara 0" de "no parseado"
  (si el campo fuente falta en el payload y el loader escribió 0 por default, la defensa
  del texto de §2.1 es obligatoria; si el 0 es confiable, se puede simplificar).
- Valores EXACTOS de los combos del form (ORIENTACIÓN, VISTA) vs valores reales de
  `orientacion`/`disposicion` en la base (construir los CASE con datos, como se hizo con
  los tipos).
- Que el checklist UI tolere `sc_*` null (debería: ya lo hace con los actuales).
- El regex de "a estrenar" contra falsos positivos ("a estrenar la temporada…" no existe
  en este dominio, pero mirar 30 matches al azar antes del backfill).
- Los pesos: correr 3 ACM reales conocidos antes/después y mirar que el top 10 siga
  teniendo sentido (los pesos nuevos diluyen ~18% el denominador).
