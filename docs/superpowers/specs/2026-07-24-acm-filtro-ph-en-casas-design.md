# ACM · Opción para excluir PH en comparables de Casa

**Fecha:** 2026-07-24
**Estado:** Diseño aprobado (pendiente de spec-review del usuario)
**Autor:** Leonardo + Claude

---

## Problema

En el módulo ACM, cuando el cliente busca comparables de una propiedad tipo **Casa**,
los **PH** aparecen mezclados con las casas. Esto pasa porque en los portales (red de
colaboración `roomix_properties`) un PH suele venir tipado como **"House"**, y el filtro
de tipo del ACM para casa incluye `%house%` (`ROOMIX_TYPE.casa = ["%house%", "%singlefamily%"]`
en `lib/acm/subject.ts:65`). Un PH **no siempre es comparable con una casa**, así que el
cliente necesita poder decidir, **antes de buscar**, si quiere considerarlos o no.

En la cartera propia (`properties`, Tokko) el problema casi no ocurre: un PH está tipado
como "PH" y no matchea el patrón `%casa%`. El foco real es la red de colaboración.

## Objetivo

Dar al cliente una **casilla (checkbox)** que aparezca **solo cuando el tipo de propiedad
es Casa**, para elegir si los PH se consideran comparables o no. Por defecto viene
**tildada (incluir PH)**, de modo que el comportamiento actual no cambia para quien no la
toca. Es una opción puramente **opt-out**.

## No-objetivos (fuera de alcance)

- No se toca la búsqueda de otros tipos (departamento, PH, local, oficina, terreno). Los PH
  también podrían mezclarse en "departamento", pero queda fuera de este trabajo.
- No se cambian pesos, sub-scores ni el % de comparabilidad.
- No se toca la ficha pública ni la grilla MCM.
- Los ACM ya guardados en "Mis ACM" se reabren igual (usan su snapshot; ver más abajo).

---

## Diseño

### 1. UI — checkbox contextual (`app/asesor/acm/components/subject-input.tsx`)

- Debajo del selector de **Operación** se agrega una casilla, **renderizada solo cuando
  `sujeto.tipo_propiedad === "casa"`**:

  ```
  ☑ Considerar PH como comparables
     Los PH figuran como "casa" en los portales. Destildá si querés
     comparar solo casas puras.
  ```

- Estado por defecto: **tildada** = incluir PH (comportamiento actual).
- Cuando el tipo **no** es "casa", la casilla no se muestra y el filtro no aplica.
- El estado vive en el componente padre `AcmModule` (junto a `sujeto`/`operacion`), como
  un booleano `considerarPh` (default `true`), y se resetea a `true` en `handleReset()`
  igual que operación/sujeto.

**Componente de checkbox:** usar el que ya exista en `components/ui`. Verificar en la
implementación si hay `components/ui/checkbox.tsx` (shadcn); si no existe, usar un
`<input type="checkbox">` estilado acorde, sin agregar dependencias nuevas.

### 2. Detección de PH

Se considera PH un aviso cuyo **título, descripción o tipo** contiene "PH" **como palabra
suelta**. Regex case-insensitive con límites de palabra de Postgres:

```
\mph\M
```

- ✅ Detecta: `"Hermoso PH en Villa Crespo"`, `"ph al frente"`, `"Casa tipo PH"`, tipo `"PH"`.
- ❌ No confunde: palabras que contienen "ph" adentro (evita falsos positivos), porque
  exige que "PH" esté aislada entre no-palabras.
- **No** se matchea la frase "propiedad horizontal": en Argentina la mayoría de los
  departamentos son legalmente PH, así que matchearla sobre-excluiría. Solo la sigla suelta.

El filtro se aplica **únicamente** cuando el cliente destildó la casilla en una búsqueda de
casa. En cualquier otro caso el SQL ni evalúa el PH.

### 3. Filtrado en SQL (lugar elegido)

Se agrega un parámetro nuevo a las **dos** funciones del ACM:

- `public.acm_match_properties(...)`
- `public.acm_match_roomix(...)`

Nuevo parámetro, **al final de la firma**, con default que preserva el comportamiento:

```
p_exclude_ph boolean DEFAULT false
```

Cuando `p_exclude_ph = true`, se agrega una condición al `WHERE` del CTE `cand` que
**descarta** las filas-PH **antes de rankear y antes del `limit`**:

- En `acm_match_properties` (haystack sobre `properties`):
  ```sql
  and (not p_exclude_ph
       or (coalesce(p.property_type,'') || ' ' || coalesce(p.title,'') || ' ' ||
           coalesce(p.description,'')) !~* '\mph\M')
  ```
- En `acm_match_roomix` (haystack sobre `roomix_properties`):
  ```sql
  and (not p_exclude_ph
       or (coalesce(r.property_type,'') || ' ' || coalesce(r.title,'') || ' ' ||
           coalesce(r.description,'')) !~* '\mph\M')
  ```

**Por qué en SQL y no en JS:** filtrar antes del `limit` mantiene el conteo correcto y
evita que, en un barrio con muchos PH, queden afuera casas buenas por el corte de 50/100.

**Compatibilidad:** el parámetro tiene default `false`, así que cualquier invocación que no
lo mande se comporta **exactamente igual que hoy**. Como cambia la firma, la migración hace
`DROP FUNCTION ... ; CREATE OR REPLACE ...` — el mismo patrón que ya usa la migración
`20260702120000_acm_barrio_gate_and_dims.sql`. El resto del cuerpo de las funciones se
**recrea sin cambios** salvo la línea del filtro y el nuevo parámetro.

### 4. Endpoint (`app/api/acm/comparables/route.ts`)

- Leer del body: `const considerarPh = body.considerar_ph !== false;` (default: considerar).
- Calcular el flag efectivo: solo excluye si el sujeto es casa **y** el cliente destildó:
  ```ts
  const excludePh = sujeto.tipo_propiedad === "casa" && considerarPh === false;
  ```
- Pasar `p_exclude_ph: excludePh` en **ambas** llamadas `supabase.rpc(...)`.
- Guardar en el historial: opcionalmente incluir `considerar_ph` dentro del objeto `sujeto`
  o del registro guardado, **solo para trazabilidad**. No es necesario para reabrir (el
  snapshot de `resultados` ya refleja el filtro aplicado). Decisión: **no persistir un
  campo nuevo** en esta iteración para no tocar el esquema de `acm_searches`; el snapshot
  guardado ya es consistente.

### 5. Cliente que dispara la búsqueda (`app/asesor/acm/components/acm-module.tsx`)

- Nuevo estado `const [considerarPh, setConsiderarPh] = useState(true);`
- Incluirlo en el body del `fetch` a `/api/acm/comparables`:
  ```ts
  body: JSON.stringify({ sujeto, operacion, exclude_id: excludeId, considerar_ph: considerarPh }),
  ```
- Pasar `considerarPh` / `setConsiderarPh` a `SubjectInput`.
- Resetear a `true` en `handleReset()`.
- Al reabrir un ACM guardado (`handleAbrirGuardado`), no depende del flag (usa snapshot);
  se puede dejar `considerarPh` en su default sin efecto visible.

---

## Flujo de datos (resumen)

```
Cliente destilda "Considerar PH" (solo visible si tipo = Casa)
        │
        ▼
AcmModule.considerarPh = false
        │  fetch POST { sujeto, operacion, exclude_id, considerar_ph:false }
        ▼
/api/acm/comparables
        │  excludePh = (tipo === "casa" && considerar_ph === false) = true
        ▼
supabase.rpc(acm_match_properties, { ..., p_exclude_ph:true })
supabase.rpc(acm_match_roomix,     { ..., p_exclude_ph:true })
        │  WHERE ... and (not p_exclude_ph or haystack !~* '\mph\M')
        ▼
Comparables sin PH → ranking → checklist → resultados (y snapshot guardado)
```

## Manejo de errores / bordes

- **Tipo distinto de casa:** `excludePh` siempre `false` → SQL idéntico a hoy.
- **Casilla tildada (default):** `excludePh` `false` → SQL idéntico a hoy.
- **Aviso sin descripción:** `coalesce(...,'')` evita null; si el título/tipo tampoco menciona
  PH, no se descarta (correcto).
- **PH mal tipados en cartera:** aunque un PH de la cartera matcheara `%casa%` por título, el
  filtro por título/descripción lo alcanza igual.
- **Migración:** se aplica por Management API (ver memoria `supabase-migraciones-management-api`)
  y se prueba en local con `npm run dev` antes de mergear.

## Testing / verificación

1. **SQL directo:** contra la BD, correr `acm_match_roomix` con `p_exclude_ph=false` y con
   `=true` sobre un barrio conocido y confirmar que (a) con `false` el resultado es idéntico
   al actual, (b) con `true` desaparecen los avisos cuyo título/descr. dicen "PH" y no se
   caen casas legítimas.
2. **App en local:** buscar comparables de una Casa con la casilla tildada (deben verse los
   PH) y destildada (no deben verse), comparando conteos.
3. **Regresión:** una búsqueda de Departamento no muestra la casilla y devuelve lo mismo que
   antes.

## Documentación a actualizar (modo de trabajo)

Al cerrar: actualizar los docs afectados según la regla de los 4 documentos
(`LOGICA-PRISMA`, `TECNICO-PRISMA`, `FUNCIONAL-ASESOR`, `FUNCIONAL-DIRECTOR`) en lo que
corresponda al ACM, y la memoria `acm-modulo-comparativo`.

## Archivos afectados

- `supabase/migrations/<nueva>_acm_exclude_ph.sql` (nueva migración: recrea las 2 funciones)
- `lib/acm/subject.ts` (posible helper del patrón PH, si conviene centralizarlo)
- `app/api/acm/comparables/route.ts` (leer flag + pasar `p_exclude_ph`)
- `app/asesor/acm/components/acm-module.tsx` (estado + body del fetch)
- `app/asesor/acm/components/subject-input.tsx` (checkbox contextual)
