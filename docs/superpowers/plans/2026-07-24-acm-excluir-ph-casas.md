# ACM · Excluir PH en comparables de Casa — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al cliente una casilla (solo en tipo Casa) para excluir los PH de los comparables del ACM, filtrándolos en las funciones SQL sin cambiar el comportamiento actual por defecto.

**Architecture:** Un parámetro nuevo `p_exclude_ph` (default `false`) en las funciones SQL `acm_match_properties` / `acm_match_roomix` descarta los avisos-PH antes de rankear y del límite. El endpoint `/api/acm/comparables` calcula el flag (solo Casa + casilla destildada) y lo pasa a ambas RPC. La UI muestra un `Checkbox` contextual en `subject-input.tsx`.

**Tech Stack:** Next.js (App Router) · TypeScript · Supabase Postgres (pgvector) · Radix Checkbox (shadcn). Sin runner de tests: la verificación es `npm run build` / `next lint`, queries SQL por Management API (`scratch/apply-sql.mjs`) y prueba manual en local (`npm run dev`).

## Global Constraints

- **No romper el comportamiento actual:** `p_exclude_ph` default `false`; `considerar_ph` default `true`. Cualquier llamada que no mande el flag se comporta igual que hoy.
- **Solo aplica a tipo Casa:** `excludePh = (sujeto.tipo_propiedad === "casa" && considerar_ph === false)`. Cualquier otro tipo → `false`.
- **Detección de PH:** "PH" como palabra suelta (regex Postgres `\mph\M`, case-insensitive) sobre `property_type + title + description`. No matchear "propiedad horizontal".
- **Migraciones:** se aplican por Management API con `node scratch/apply-sql.mjs <ruta.sql>` (lee `.env`: `SUPABASE_PROJECT_REF` + `SUPABASE_API_KEY_MANAGEMENT`). Las migraciones del repo NO se aplican solas.
- **Modo de trabajo:** rama `feat/acm-excluir-ph-casas` (ya creada) → probar en local → actualizar docs/memoria → merge a `main` SOLO con OK explícito de Leonardo. Commits frecuentes, en español, terminando con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Migración SQL — parámetro `p_exclude_ph` en las 2 funciones ACM

**Files:**
- Create: `supabase/migrations/20260724120000_acm_exclude_ph.sql`
- Create (temporal, verificación): `scratch/verif-acm-ph.sql`

**Interfaces:**
- Produces: `public.acm_match_properties(..., p_exclude_ph boolean DEFAULT false, p_limit integer DEFAULT 50)` y `public.acm_match_roomix(..., p_exclude_ph boolean DEFAULT false, p_limit integer DEFAULT 50)`. Mismo `RETURNS TABLE` que hoy (no cambia).

- [ ] **Step 1: Escribir la query de verificación (define el comportamiento esperado)**

Crear `scratch/verif-acm-ph.sql` con dos conteos sobre la red (roomix es global, sin agency). Reemplazar `%palermo%` por un barrio con datos reales si hace falta:

```sql
-- Con PH (comportamiento actual): trae casas + PH tipados como House.
select 'con_ph' as caso, count(*) as n
from acm_match_roomix(
  null, 'venta', array['%house%','%singlefamily%'], null, null, null, null, null,
  array['%palermo%'], array[]::text[], false, 50
)
union all
-- Sin PH: debe ser <= con_ph y no debe caerse ninguna casa "pura".
select 'sin_ph' as caso, count(*) as n
from acm_match_roomix(
  null, 'venta', array['%house%','%singlefamily%'], null, null, null, null, null,
  array['%palermo%'], array[]::text[], true, 50
);
```

- [ ] **Step 2: Correr la verificación ANTES de la migración para confirmar que falla**

Run: `node scratch/apply-sql.mjs scratch/verif-acm-ph.sql`
Expected: FAIL (HTTP 400/404) con un error tipo `function acm_match_roomix(..., boolean, integer) does not exist` — porque la firma con `p_exclude_ph` todavía no existe.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260724120000_acm_exclude_ph.sql` con este contenido EXACTO (recrea las 2 funciones = cuerpo idéntico a `20260702120000_acm_barrio_gate_and_dims.sql` + el parámetro nuevo + la línea de filtro PH):

```sql
-- ACM v3: opción de EXCLUIR PH en búsquedas de Casa.
-- Agrega el parámetro p_exclude_ph (default false = comportamiento IDÉNTICO al actual).
-- Cuando p_exclude_ph = true, se descartan los avisos cuyo property_type/title/description
-- mencionan "PH" como palabra suelta (\mph\M), ANTES de rankear y del límite.
-- El resto del cuerpo es idéntico a 20260702120000_acm_barrio_gate_and_dims.sql.

-- Cambia la firma (agrega p_exclude_ph) → drop de las versiones actuales primero.
drop function if exists public.acm_match_properties(uuid, text, text, text[], numeric, integer, integer, integer, integer, text[], text[], uuid, integer);
drop function if exists public.acm_match_roomix(text, text, text[], numeric, integer, integer, integer, integer, text[], text[], integer);


CREATE OR REPLACE FUNCTION public.acm_match_properties(
  p_agency_id uuid,
  p_query_embedding text DEFAULT NULL,
  p_operation text DEFAULT 'venta',
  p_type_patterns text[] DEFAULT '{}',
  p_m2 numeric DEFAULT NULL,
  p_rooms integer DEFAULT NULL,
  p_dormitorios integer DEFAULT NULL,
  p_bathrooms integer DEFAULT NULL,
  p_antiguedad integer DEFAULT NULL,
  p_loc_patterns text[] DEFAULT '{}',
  p_amenities text[] DEFAULT '{}',
  p_exclude_id uuid DEFAULT NULL,
  p_exclude_ph boolean DEFAULT false,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id uuid, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer,
  sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer
)
LANGUAGE plpgsql STABLE AS $fn$
declare v_emb vector(768) := null;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
    perform set_config('hnsw.ef_search', '1000', true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  end if;

  return query
  with cand as (
    select
      p.id,
      coalesce(p.total_area, p.covered_area) as m2,
      case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
           when p.bedrooms > 0 then p.bedrooms + 1 else null end as amb,
      case when p.bedrooms > 0 then p.bedrooms else null end as dorm,
      p.bathrooms as ban,
      case when (p.tokko_data->>'age') ~ '^[0-9]+$' then (p.tokko_data->>'age')::int else null end as ant,
      lower(coalesce(p.description,'') || ' ' || coalesce(p.title,'') || ' ' ||
        coalesce((select string_agg(t->>'name',' ') from jsonb_array_elements(p.tokko_data->'tags') t),'')) as amen_hay,
      case when v_emb is null then 0::real else greatest(0::real, (1 - (p.embedding <=> v_emb))::real) end as sem
    from properties p
    where p.agency_id = p_agency_id
      and p.is_active
      and p.embedding is not null
      and (p_exclude_id is null or p.id <> p_exclude_id)
      and (p_operation = 'ambas'
        or (p_operation='venta' and p.status='Venta')
        or (p_operation='alquiler' and p.status in ('Alquiler','Temporary rent')))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where p.property_type ilike tp or p.title ilike tp))
      and (p_m2 is null or coalesce(p.total_area,p.covered_area) is null
        or coalesce(p.total_area,p.covered_area) between p_m2 * 0.6 and p_m2 * 1.4)
      and (p_rooms is null
        or (case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) is null
        or abs((case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) - p_rooms) <= 1)
      -- GATE de BARRIO: todos los comparables son del mismo barrio que el sujeto.
      and (array_length(p_loc_patterns,1) is null
        or exists (select 1 from unnest(p_loc_patterns) lp
                   where public.acm_norm(coalesce(p.city,'') || ' ' ||
                         coalesce(p.tokko_data->'location'->>'name','') || ' ' ||
                         coalesce(p.tokko_data->'location'->>'full_location','')) like public.acm_norm(lp)))
      -- FILTRO PH (opt-in): solo cuando p_exclude_ph = true se descartan los avisos-PH.
      and (not p_exclude_ph
        or (coalesce(p.property_type,'') || ' ' || coalesce(p.title,'') || ' ' || coalesce(p.description,'')) !~* '\mph\M')
    order by case when v_emb is null then 0 else (p.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0 then 22 else 0 end) as w_sup,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0
            then greatest(0, 1 - abs(c.m2 - p_m2)/p_m2) else 0 end)::numeric as s_sup,
      (case when p_rooms is not null and c.amb is not null then 16 else 0 end) as w_amb,
      (case when p_rooms is null or c.amb is null then 0
            when c.amb = p_rooms then 1 when abs(c.amb - p_rooms) = 1 then 0.5 else 0 end)::numeric as s_amb,
      (case when p_dormitorios is not null and c.dorm is not null then 14 else 0 end) as w_dorm,
      (case when p_dormitorios is null or c.dorm is null then 0
            when c.dorm = p_dormitorios then 1 when abs(c.dorm - p_dormitorios) = 1 then 0.5 else 0 end)::numeric as s_dorm,
      (case when p_bathrooms is not null and c.ban is not null and c.ban > 0 then 12 else 0 end) as w_ban,
      (case when p_bathrooms is null or c.ban is null or c.ban = 0 then 0
            when c.ban = p_bathrooms then 1 when abs(c.ban - p_bathrooms) = 1 then 0.5 else 0 end)::numeric as s_ban,
      (case when p_antiguedad is not null and c.ant is not null then 14 else 0 end) as w_ant,
      (case when p_antiguedad is null or c.ant is null then 0
            else greatest(0, 1 - abs(c.ant - p_antiguedad)/20.0) end)::numeric as s_ant,
      (case when array_length(p_amenities,1) is not null then 12 else 0 end) as w_amen,
      (case when array_length(p_amenities,1) is null then 0
            else (select count(*) from unnest(p_amenities) a where c.amen_hay ~* a)::numeric
                 / array_length(p_amenities,1) end) as s_amen,
      (case when v_emb is not null then 10 else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  )
  select
    s.id,
    round(((s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
           / nullif(s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as match_pct,
    case when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
    case when s.w_sup>0  then round(s.s_sup*100)::int  end,
    case when s.w_amb>0  then round(s.s_amb*100)::int  end,
    case when s.w_dorm>0 then round(s.s_dorm*100)::int end,
    case when s.w_ban>0  then round(s.s_ban*100)::int  end,
    case when s.w_ant>0  then round(s.s_ant*100)::int  end,
    case when s.w_amen>0 then round(s.s_amen*100)::int end,
    case when s.w_sem>0  then round(s.s_sem*100)::int  end,
    s.m2, s.amb, s.dorm, s.ant
  from scored s
  order by match_pct desc nulls last, s.s_sem desc
  limit p_limit;
end;
$fn$;


CREATE OR REPLACE FUNCTION public.acm_match_roomix(
  p_query_embedding text DEFAULT NULL,
  p_operation text DEFAULT 'venta',
  p_type_patterns text[] DEFAULT '{}',
  p_m2 numeric DEFAULT NULL,
  p_rooms integer DEFAULT NULL,
  p_dormitorios integer DEFAULT NULL,
  p_bathrooms integer DEFAULT NULL,
  p_antiguedad integer DEFAULT NULL,
  p_loc_patterns text[] DEFAULT '{}',
  p_amenities text[] DEFAULT '{}',
  p_exclude_ph boolean DEFAULT false,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id character varying, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer,
  sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer
)
LANGUAGE plpgsql STABLE AS $fn$
declare v_emb vector(768) := null;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
    perform set_config('hnsw.ef_search', '1000', true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  end if;

  return query
  with cand as (
    select
      r.id,
      r.area_m2 as m2,
      case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end as amb,
      case when r.bedrooms > 0 then r.bedrooms else null end as dorm,
      r.bathrooms as ban,
      case when r.property_age_years >= 0 then r.property_age_years else null end as ant,
      lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
        coalesce(array_to_string(r.amenities,' '),'')) as amen_hay,
      case when v_emb is null then 0::real else greatest(0::real, (1 - (r.embedding <=> v_emb))::real) end as sem
    from roomix_properties r
    where r.embedding is not null
      and (p_operation = 'ambas'
        or (p_operation='venta' and r.operation='sale')
        or (p_operation='alquiler' and r.operation='rent'))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where r.property_type ilike tp or r.title ilike tp))
      and (p_m2 is null or r.area_m2 is null or r.area_m2 between p_m2 * 0.6 and p_m2 * 1.4)
      and (p_rooms is null
        or (case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) is null
        or abs((case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) - p_rooms) <= 1)
      -- GATE de BARRIO (neighborhood/city estructurado, insensible a acentos).
      and (array_length(p_loc_patterns,1) is null
        or exists (select 1 from unnest(p_loc_patterns) lp
                   where public.acm_norm(coalesce(r.neighborhood,'') || ' ' || coalesce(r.city,'')) like public.acm_norm(lp)))
      -- FILTRO PH (opt-in): solo cuando p_exclude_ph = true se descartan los avisos-PH.
      and (not p_exclude_ph
        or (coalesce(r.property_type,'') || ' ' || coalesce(r.title,'') || ' ' || coalesce(r.description,'')) !~* '\mph\M')
    order by case when v_emb is null then 0 else (r.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0 then 22 else 0 end) as w_sup,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0
            then greatest(0, 1 - abs(c.m2 - p_m2)/p_m2) else 0 end)::numeric as s_sup,
      (case when p_rooms is not null and c.amb is not null then 16 else 0 end) as w_amb,
      (case when p_rooms is null or c.amb is null then 0
            when c.amb = p_rooms then 1 when abs(c.amb - p_rooms) = 1 then 0.5 else 0 end)::numeric as s_amb,
      (case when p_dormitorios is not null and c.dorm is not null then 14 else 0 end) as w_dorm,
      (case when p_dormitorios is null or c.dorm is null then 0
            when c.dorm = p_dormitorios then 1 when abs(c.dorm - p_dormitorios) = 1 then 0.5 else 0 end)::numeric as s_dorm,
      (case when p_bathrooms is not null and c.ban is not null and c.ban > 0 then 12 else 0 end) as w_ban,
      (case when p_bathrooms is null or c.ban is null or c.ban = 0 then 0
            when c.ban = p_bathrooms then 1 when abs(c.ban - p_bathrooms) = 1 then 0.5 else 0 end)::numeric as s_ban,
      (case when p_antiguedad is not null and c.ant is not null then 14 else 0 end) as w_ant,
      (case when p_antiguedad is null or c.ant is null then 0
            else greatest(0, 1 - abs(c.ant - p_antiguedad)/20.0) end)::numeric as s_ant,
      (case when array_length(p_amenities,1) is not null then 12 else 0 end) as w_amen,
      (case when array_length(p_amenities,1) is null then 0
            else (select count(*) from unnest(p_amenities) a where c.amen_hay ~* a)::numeric
                 / array_length(p_amenities,1) end) as s_amen,
      (case when v_emb is not null then 10 else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  )
  select
    s.id,
    round(((s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
           / nullif(s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as match_pct,
    case when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
    case when s.w_sup>0  then round(s.s_sup*100)::int  end,
    case when s.w_amb>0  then round(s.s_amb*100)::int  end,
    case when s.w_dorm>0 then round(s.s_dorm*100)::int end,
    case when s.w_ban>0  then round(s.s_ban*100)::int  end,
    case when s.w_ant>0  then round(s.s_ant*100)::int  end,
    case when s.w_amen>0 then round(s.s_amen*100)::int end,
    case when s.w_sem>0  then round(s.s_sem*100)::int  end,
    s.m2, s.amb, s.dorm, s.ant
  from scored s
  order by match_pct desc nulls last, s.s_sem desc
  limit p_limit;
end;
$fn$;
```

- [ ] **Step 4: Aplicar la migración por Management API**

Run: `node scratch/apply-sql.mjs supabase/migrations/20260724120000_acm_exclude_ph.sql`
Expected: `HTTP 200` (o 201) sin cuerpo de error.

- [ ] **Step 5: Correr la verificación DESPUÉS de la migración**

Run: `node scratch/apply-sql.mjs scratch/verif-acm-ph.sql`
Expected: PASS — devuelve dos filas `con_ph` y `sin_ph`, con `sin_ph <= con_ph`. Si el barrio elegido tiene PH, `sin_ph < con_ph`; si no tiene PH, son iguales (correcto).

- [ ] **Step 6: Verificar que los avisos excluidos SON PH (no casas puras)**

Escribir en `scratch/verif-acm-ph.sql` (reemplazando el contenido) una query que liste los ids presentes con `false` pero ausentes con `true`, y sus títulos:

```sql
with con_ph as (
  select id from acm_match_roomix(null,'venta',array['%house%','%singlefamily%'],null,null,null,null,null,array['%palermo%'],array[]::text[], false, 50)
),
sin_ph as (
  select id from acm_match_roomix(null,'venta',array['%house%','%singlefamily%'],null,null,null,null,null,array['%palermo%'],array[]::text[], true, 50)
)
select r.id, r.property_type, left(r.title,80) as titulo
from con_ph c
join roomix_properties r on r.id = c.id
where c.id not in (select id from sin_ph);
```

Run: `node scratch/apply-sql.mjs scratch/verif-acm-ph.sql`
Expected: cada fila listada menciona "PH" en `property_type` o `titulo`. Ninguna casa sin "PH" debe aparecer. (Confirma que el regex `\mph\M` no tiene falsos positivos.)

- [ ] **Step 7: Borrar el archivo de verificación temporal y commitear la migración**

```bash
rm scratch/verif-acm-ph.sql
git add supabase/migrations/20260724120000_acm_exclude_ph.sql
git commit -m "$(printf 'feat(acm): parametro p_exclude_ph en acm_match_* para excluir PH\n\nDefault false = comportamiento identico. Cuando true, descarta avisos\ncuyo property_type/title/description mencionan "PH" como palabra suelta,\nantes de rankear y del limite. Recrea las 2 funciones (misma firma + param).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Endpoint — leer `considerar_ph` y pasar `p_exclude_ph`

**Files:**
- Modify: `app/api/acm/comparables/route.ts` (lectura del body ~línea 51-57; llamadas RPC ~línea 83-110)

**Interfaces:**
- Consumes: `p_exclude_ph boolean` de las RPC (Task 1).
- Produces: el endpoint acepta `considerar_ph` en el body (default `true` = considerar). Calcula `excludePh` y lo pasa a ambas RPC.

- [ ] **Step 1: Leer el flag del body**

En `app/api/acm/comparables/route.ts`, después de la línea `const excludeId: string | null = body.exclude_id || null;`, agregar:

```ts
    // Considerar PH: por defecto SÍ (no cambia nada). Solo se excluyen los PH cuando el
    // sujeto es Casa Y el cliente destildó la casilla. Cualquier otro caso → false.
    const considerarPh = body.considerar_ph !== false;
    const excludePh = sujeto.tipo_propiedad === "casa" && considerarPh === false;
```

- [ ] **Step 2: Pasar `p_exclude_ph` a `acm_match_properties`**

En el objeto de `supabase.rpc("acm_match_properties", { ... })`, agregar la propiedad `p_exclude_ph: excludePh,` justo después de `p_exclude_id: excludeId,`:

```ts
        p_exclude_id: excludeId,
        p_exclude_ph: excludePh,
        p_limit: limit,
```

- [ ] **Step 3: Pasar `p_exclude_ph` a `acm_match_roomix`**

En el objeto de `supabase.rpc("acm_match_roomix", { ... })`, agregar `p_exclude_ph: excludePh,` justo antes de `p_limit: limit,`:

```ts
        p_amenities: amen,
        p_exclude_ph: excludePh,
        p_limit: limit,
```

- [ ] **Step 4: Verificar tipos y build**

Run: `npm run build`
Expected: build OK, sin errores de TypeScript en `app/api/acm/comparables/route.ts`. (El endpoint requiere auth, así que la prueba funcional completa se hace en Task 3 desde la app.)

- [ ] **Step 5: Commit**

```bash
git add app/api/acm/comparables/route.ts
git commit -m "$(printf 'feat(acm): endpoint pasa p_exclude_ph solo en Casa con casilla destildada\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Frontend — estado + checkbox contextual (solo Casa)

**Files:**
- Modify: `app/asesor/acm/components/acm-module.tsx` (estado, body del fetch, props a SubjectInput, reset)
- Modify: `app/asesor/acm/components/subject-input.tsx` (props nuevas + render del Checkbox)

**Interfaces:**
- Consumes: el endpoint acepta `considerar_ph` (Task 2).
- Produces: UI opt-out visible solo en tipo Casa; el estado viaja en el body del fetch.

Nota: ambos archivos se tocan juntos porque `SubjectInput` recibe props nuevas que `AcmModule` le pasa — deben compilar en el mismo paso (`npm run build` fallaría si se separan).

- [ ] **Step 1: Agregar estado `considerarPh` en `AcmModule`**

En `app/asesor/acm/components/acm-module.tsx`, después de `const [operacion, setOperacion] = useState<Operacion>("venta");`, agregar:

```ts
  const [considerarPh, setConsiderarPh] = useState(true); // ACM: considerar PH como comparables (solo aplica a Casa)
```

- [ ] **Step 2: Resetear `considerarPh` en `handleReset`**

En la función `handleReset`, después de `setOperacion("venta");`, agregar:

```ts
    setConsiderarPh(true);
```

- [ ] **Step 3: Incluir `considerar_ph` en el body del fetch**

En `handleBuscar`, cambiar la línea del `body`:

```ts
        body: JSON.stringify({ sujeto, operacion, exclude_id: excludeId, considerar_ph: considerarPh }),
```

- [ ] **Step 4: Pasar las props al `SubjectInput`**

En el render, en el `<SubjectInput ... />`, agregar dos props (por ejemplo después de `onOperacionChange={setOperacion}`):

```tsx
              considerarPh={considerarPh}
              onConsiderarPhChange={setConsiderarPh}
```

- [ ] **Step 5: Declarar las props nuevas en `SubjectInput`**

En `app/asesor/acm/components/subject-input.tsx`, en `interface SubjectInputProps`, después de `onOperacionChange: (o: Operacion) => void;`, agregar:

```ts
  considerarPh: boolean;
  onConsiderarPhChange: (v: boolean) => void;
```

Y desestructurarlas en la firma del componente (después de `onOperacionChange,`):

```ts
  considerarPh,
  onConsiderarPhChange,
```

- [ ] **Step 6: Importar el `Checkbox`**

En `subject-input.tsx`, junto a los otros imports de `@/components/ui/...`, agregar:

```ts
import { Checkbox } from "@/components/ui/checkbox";
```

- [ ] **Step 7: Renderizar el checkbox contextual (solo Casa)**

En el JSX, justo después del bloque `{/* Operación */}` (el `</div>` que cierra el selector de Operación), agregar:

```tsx
      {/* Considerar PH: solo visible cuando el tipo es Casa. Los PH figuran como "casa"
          en los portales, pero no siempre son comparables → el cliente decide. */}
      {sujeto.tipo_propiedad === "casa" && (
        <label className="flex items-start gap-3 p-4 rounded-2xl border border-accent/10 bg-card/20 cursor-pointer">
          <Checkbox
            checked={considerarPh}
            onCheckedChange={(v) => onConsiderarPhChange(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-bold">Considerar PH como comparables</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Los PH figuran como “casa” en los portales. Destildá si querés comparar solo casas puras.
            </span>
          </span>
        </label>
      )}
```

- [ ] **Step 8: Verificar build**

Run: `npm run build`
Expected: build OK, sin errores de tipos en `acm-module.tsx` ni `subject-input.tsx`.

- [ ] **Step 9: Prueba en local (levantar la app)**

Run: `npm run dev` y abrir `/asesor/acm`.
Verificar manualmente:
1. Con tipo **Departamento**: la casilla NO aparece.
2. Con tipo **Casa**, casilla **tildada** (default): buscar comparables → aparecen los PH (igual que hoy).
3. Con tipo **Casa**, casilla **destildada**: buscar de nuevo → desaparecen los avisos-PH y baja el conteo; las casas puras siguen.
Expected: los 3 casos se comportan como se describe.

- [ ] **Step 10: Commit**

```bash
git add app/asesor/acm/components/acm-module.tsx app/asesor/acm/components/subject-input.tsx
git commit -m "$(printf 'feat(acm): casilla "Considerar PH" en la carga del ACM (solo Casa)\n\nTildada por defecto (incluye PH, comportamiento actual). Al destildar en una\nbusqueda de Casa se excluyen los PH via considerar_ph -> p_exclude_ph.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Documentación y memoria

**Files:**
- Modify: `docs/interno/LOGICA-PRISMA.md` (sección ACM — regla del filtro PH)
- Modify: `docs/interno/TECNICO-PRISMA.md` (parámetro `p_exclude_ph` + flag `considerar_ph`)
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md` (uso de la casilla, en lenguaje simple) — verificar nombre/ruta exacta del archivo funcional del asesor antes de editar
- Modify: `C:\Users\LENOVO\.claude\projects\C--Users-LENOVO-Desktop-CODE-Antigravity---Apps-PRISMA-SYSTEM\memory\acm-modulo-comparativo.md` (una línea sobre la opción de excluir PH en Casa)

**Interfaces:**
- Consumes: comportamiento final de Tasks 1-3.

- [ ] **Step 1: Localizar la sección ACM en los docs internos**

Run: `git grep -n "acm_match_roomix\|ACM" docs/interno/LOGICA-PRISMA.md docs/interno/TECNICO-PRISMA.md | head -40`
Expected: ubicaciones donde se describe el matching del ACM.

- [ ] **Step 2: Agregar la regla en LOGICA-PRISMA.md**

En la sección del ACM, agregar un párrafo (redacción simple, no técnica):

```markdown
- **Considerar PH (solo Casa):** al buscar comparables de una casa, el cliente puede
  destildar "Considerar PH" para que no se mezclen los PH (que en los portales figuran
  como "casa"). Por defecto viene tildada (los PH se incluyen, como siempre). El sistema
  detecta el PH por la sigla suelta en el título/descripción del aviso.
```

- [ ] **Step 3: Documentar el parámetro en TECNICO-PRISMA.md**

En la sección técnica del ACM, agregar:

```markdown
- `acm_match_properties` / `acm_match_roomix` aceptan `p_exclude_ph boolean DEFAULT false`.
  Cuando `true`, descartan filas cuyo `property_type + title + description` matchean `\mph\M`
  (PH como palabra suelta), antes del ranking y del límite. El endpoint
  `/api/acm/comparables` calcula `excludePh = tipo === "casa" && considerar_ph === false`
  y lo pasa a ambas RPC. Migración: `20260724120000_acm_exclude_ph.sql`.
```

- [ ] **Step 4: Actualizar la guía funcional del asesor**

Localizar el archivo funcional del asesor (`git grep -ni "acm" docs/compartible -l`) y agregar, en lenguaje de usuario, cómo y cuándo usar la casilla "Considerar PH" (aparece solo en Casa, destildar para comparar solo casas puras).

- [ ] **Step 5: Actualizar la memoria del ACM**

Editar `memory/acm-modulo-comparativo.md`: agregar al final del cuerpo una frase como
"Ahora, en búsquedas de Casa, casilla opt-out 'Considerar PH' (default tildada=incluye) que
excluye PH vía `p_exclude_ph` en `acm_match_*` detectando la sigla suelta `\mph\M`."

- [ ] **Step 6: Commit**

```bash
git add docs/ "C:/Users/LENOVO/.claude/projects/C--Users-LENOVO-Desktop-CODE-Antigravity---Apps-PRISMA-SYSTEM/memory/acm-modulo-comparativo.md"
git commit -m "$(printf 'docs(acm): documentar opcion de excluir PH en comparables de Casa\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 7: Avisar a Leonardo para el merge**

NO mergear a `main`. Avisar que está probado en local y esperar OK explícito, según el modo de trabajo.

---

## Notas de verificación final (antes de pedir OK)

- `npm run build` pasa sin errores.
- La casilla solo aparece en Casa; tildada reproduce el comportamiento actual; destildada excluye PH y baja el conteo.
- Ningún comparable "casa pura" desaparece al destildar (verificado en Task 1 Step 6).
- Migración aplicada y commiteada; las funciones conservan el mismo `RETURNS TABLE`.
