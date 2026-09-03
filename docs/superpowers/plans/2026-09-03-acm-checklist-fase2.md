# ACM Fase 2 (checklist enriquecido) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el ACM aproveche la riqueza de `mercado_avisos`: 4 dimensiones nuevas que puntúan (cocheras, piso, orientación, disposición), 7 badges informativos en la tarjeta, sub-barrio como barrio propio en el matching, "a estrenar" pleno vía loader, y el copy "sin avisos aún".

**Architecture:** El SQL vivo se transforma con el método del corte (reemplazos exactos verificados por script sobre `acm-mercado.sql`, la copia canónica del scratchpad). La vista de compatibilidad gana columnas ADITIVAS. El checklist es data-driven (`lib/acm/checklist.ts` arma las filas; la UI las mapea), así que las dimensiones nuevas son mayormente servidor. Deploy: DDL primero (params con default + columnas extra = inocuo para el código viejo), código después, loader/backfill al final.

**Tech Stack:** PostgreSQL 17.6 (Supabase, Management API), plpgsql, Next.js, vitest, chrome-devtools para verificación en navegador.

**Spec:** `docs/superpowers/specs/2026-09-02-acm-checklist-fase2-design.md`

## Global Constraints

- **DDL solo por Management API** (runner `sql.mjs` del scratchpad); validar con función de prueba + `BEGIN…ROLLBACK` donde aplique; las migraciones del repo NO se aplican solas.
- **La cota superior del `pool` DEBE sumar los pesos nuevos** (invariante de 20260819120100): piso/orientación/disposición entran con su score real (se calculan en `cand`); cocheras entra valuada en tope (`+ s.w_coch`, se calcula en `con_sem` porque lee texto).
- **Sin dato pasa sin castigo** en toda dimensión nueva (peso 0 cuando sujeto o candidato no declaran) — salvo cocheras, donde `cocheras=0` + texto sin mención = score 0 (el sujeto la pidió).
- **`cocheras=0` NO es confiable solo** (medido: 4.266 de 14.085 deptos con cocheras=0 mencionan cochera en el texto) → la defensa `p_cochera_patron` es obligatoria.
- Cambiar el RETURNS de `acm_match_roomix` exige **DROP FUNCTION + CREATE** en una transacción, re-aplicando el `SET statement_timeout = '25s'`.
- Vocabularios verificados contra producción: `disposicion` ∈ {frente, contrafrente, lateral, interno} · `orientacion` ∈ {N, NE, E, SE, S, SO, O, NO} · Sujeto: `Orientacion` = 'norte'…'so'|'nd', `Vista` = 'frente'|'contrafrente'|'lateral'|'al_verde'|'panoramica'|'nd' (al_verde/panoramica/nd → no comparan).
- Pesos nuevos espejados en TRES lugares que deben coincidir: función SQL, `PESOS` de `lib/acm/checklist.ts`, y este plan: **cocheras 10 · piso 6 · orientación 5 · disposición 5**.
- Umbral del badge "bajó de precio": `variacion_precio_pct <= -3`.
- Flujo git: worktree nuevo desde `main` (EnterWorktree), nunca `git add -A`, PR + merge por API de GitHub. Commits/PRs con la atribución vigente.
- Verificación final en navegador como PRISMAIA-VAKDOR, escritorio + celular emulado (390x844x3,mobile,touch).
- El runner SQL y la copia canónica de la función viven en el scratchpad de la sesión: `sql.mjs`, `acm-mercado.sql` (= cuerpo vivo actual, con el fix de obra).

---

## File Structure

- Create: `supabase/migrations/20260903120000_acm_fase2.sql` — TODO el DDL de la fase (vista + índice sub-barrio + drop/create de la función). Un solo archivo, como el corte.
- Modify: `mercado-sync/loader.mjs` — detección "a estrenar" → `antiguedad_anios = 0`.
- Modify: `lib/tasacion/types.ts` — `ChecklistItem.dimension` (+4), `AcmComparable` (+campos de badges).
- Modify: `lib/acm/subject.ts` — mappers nuevos (`sujetoCochera`, `orientacionParam`, `disposicionParam`, `COCHERA_PATRON`); cochera sale de `AMENITY_TOKENS`.
- Modify: `lib/acm/checklist.ts` — `SubScores` (+4), `PESOS` (+4), 4 filas nuevas.
- Modify: `app/api/acm/comparables/route.ts` — params nuevos al RPC, columnas nuevas al re-fetch, badges al payload.
- Modify: `app/asesor/acm/components/comparables-result.tsx` — badges + posición vs mediana.
- Modify: `app/asesor/acm/components/barrio-combobox.tsx` — "sin avisos aún".
- Modify: `app/ficha-acm/[token]/page.tsx` — badges de precio en la ficha pública.
- Test: `lib/acm/subject.test.ts`, `lib/acm/checklist.test.ts` (nuevo), scratchpad SQL harness.

---

### Task 1: Vista de compatibilidad — columnas nuevas (aditivo)

**Files:**
- Create: `supabase/migrations/20260903120000_acm_fase2.sql` (sección 1)

**Interfaces:**
- Produces: la vista `roomix_properties` expone además `cocheras int, expensas numeric, expensas_moneda text, dias_publicado int, variacion_precio_pct numeric, precio_inicial numeric, disposicion text, orientacion text, es_dueno_directo bool, apto_credito bool, en_construccion bool, precio_m2 numeric, publicador_puntaje numeric, publicador_resenas int`. Las consumen Task 5 (re-fetch) y Task 6 (ficha).

- [ ] **Step 1: Escribir el CREATE OR REPLACE de la vista** — el SELECT completo actual (archivo `20260902121500`, líneas 29-69) + al final, antes del `from`, las columnas nuevas:

```sql
  r.cocheras                                        as cocheras,
  r.expensas                                        as expensas,
  r.expensas_moneda                                 as expensas_moneda,
  r.dias_publicado                                  as dias_publicado,
  r.variacion_precio_pct                            as variacion_precio_pct,
  r.precio_inicial                                  as precio_inicial,
  r.disposicion                                     as disposicion,
  r.orientacion                                     as orientacion,
  r.es_dueno_directo                                as es_dueno_directo,
  r.apto_credito                                    as apto_credito,
  r.en_construccion                                 as en_construccion,
  r.precio_m2                                       as precio_m2,
  p.puntaje                                         as publicador_puntaje,
  p.resenas                                         as publicador_resenas,
```

OJO: `create or replace view` NO permite agregar columnas en el medio — las nuevas van AL FINAL de la lista (después de `updated_at`). Si aún así falla por orden, `drop view + create` en la misma transacción (los grants se re-aplican).

- [ ] **Step 2: Validar en BEGIN…ROLLBACK** con un DO que exige: `select cocheras, variacion_precio_pct, publicador_puntaje from roomix_properties limit 1` no explota, y `count(*) where operation='sale'` > 0 (la regresión del corte sigue pasando).

- [ ] **Step 3: Commit del archivo** (`git add supabase/migrations/20260903120000_acm_fase2.sql`).

---

### Task 2: `acm_match_roomix` v2 — dimensiones nuevas + sub-barrio propio

**Files:**
- Modify: `supabase/migrations/20260903120000_acm_fase2.sql` (sección 2)
- Scratchpad: `patch-fase2-acm.mjs` (transforma `acm-mercado.sql` → `acm-fase2.sql`)

**Interfaces:**
- Consumes: `acm-mercado.sql` (cuerpo vivo actual, fix de obra incluido).
- Produces: `public.acm_match_roomix` con params nuevos `p_cochera boolean default null, p_piso integer default null, p_orientacion text default null, p_disposicion text default null, p_cochera_patron text default null` y salidas nuevas `sc_cocheras int, sc_piso int, sc_orientacion int, sc_disposicion int` (después de `sc_semantica`, antes de `cand_m2`). Task 4/5 dependen de estos nombres EXACTOS.

- [ ] **Step 1: Escribir `patch-fase2-acm.mjs`** con el patrón de `patch-obra.mjs` (rep() con conteo esperado + aserciones). Reemplazos, en orden:

**(a) Firma** — 1×:
```
de:  p_peso_semantica smallint DEFAULT 10, p_limit integer DEFAULT 50)
a:   p_peso_semantica smallint DEFAULT 10, p_limit integer DEFAULT 50, p_cochera boolean DEFAULT NULL::boolean, p_piso integer DEFAULT NULL::integer, p_orientacion text DEFAULT NULL::text, p_disposicion text DEFAULT NULL::text, p_cochera_patron text DEFAULT NULL::text)
```

**(b) RETURNS** — 1×:
```
de:  sc_semantica integer, cand_m2 numeric
a:   sc_semantica integer, sc_cocheras integer, sc_piso integer, sc_orientacion integer, sc_disposicion integer, cand_m2 numeric
```

**(c) Declaración de la brújula** (después de `v_op_eq text := …;`) — 1×: agregar
```sql
  -- Orientación como posición en la rosa de los vientos (0..7) para medir adyacencia circular.
  v_ori_suj int := case p_orientacion when 'N' then 0 when 'NE' then 1 when 'E' then 2 when 'SE' then 3
                                      when 'S' then 4 when 'SO' then 5 when 'O' then 6 when 'NO' then 7 end;
```

**(d) cand — valores nuevos** (2×, ambas ramas): después de `r.actualizado_en as updated_at` agregar
```sql
        , r.piso as c_piso, r.disposicion as c_disp, r.cocheras as c_coch,
        case r.orientacion when 'N' then 0 when 'NE' then 1 when 'E' then 2 when 'SE' then 3
                           when 'S' then 4 when 'SO' then 5 when 'O' then 6 when 'NO' then 7 end as c_ori
```

**(e) scored — pesos y scores nuevos** (2×): después de `(case when v_emb is not null then p_peso_semantica else 0 end) as w_sem` agregar
```sql
        ,
        (case when p_cochera then 10 else 0 end) as w_coch,
        (case when p_piso is not null and c.c_piso is not null then 6 else 0 end) as w_piso,
        (case when p_piso is null or c.c_piso is null then 0
              when c.c_piso = p_piso then 1 when abs(c.c_piso - p_piso) <= 2 then 0.5 else 0 end)::numeric as s_piso,
        (case when v_ori_suj is not null and c.c_ori is not null then 5 else 0 end) as w_ori,
        (case when v_ori_suj is null or c.c_ori is null then 0
              when least(abs(c.c_ori - v_ori_suj), 8 - abs(c.c_ori - v_ori_suj)) = 0 then 1
              when least(abs(c.c_ori - v_ori_suj), 8 - abs(c.c_ori - v_ori_suj)) = 1 then 0.5 else 0 end)::numeric as s_ori,
        (case when p_disposicion is not null and c.c_disp is not null then 5 else 0 end) as w_disp,
        (case when p_disposicion is null or c.c_disp is null then 0
              when c.c_disp = p_disposicion then 1 else 0 end)::numeric as s_disp,
        c.c_coch
```
(`scored` hace `select c.id, c.m2, …` con lista explícita: `c.c_coch` viaja porque `con_sem` lo necesita. Verificar en el script que `pool` es `select s.*` — lo es — así `c_coch` llega.)

**(f) pool — la cota superior** (2×):
```
de:  + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.w_amen + s.w_sem)
a:   + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_piso*s.w_piso + s.s_ori*s.w_ori + s.s_disp*s.w_disp + s.w_amen + s.w_sem + s.w_coch)
```
y su denominador (2×):
```
de:  nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0))
a:   nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem+s.w_coch+s.w_piso+s.w_ori+s.w_disp,0))
```
⚠️ ese texto de denominador aparece TAMBIÉN en `con_pct` — el script debe usar contexto para distinguir: en `pool` va precedido por `desc nulls last` después; usar reemplazos con más contexto (la línea completa del ORDER BY vs la de con_pct) y conteos 2×+2×.

**(g) con_sem — score de cocheras** (2×): después de `)::numeric end) as s_sem` agregar
```sql
        ,
        (case when not coalesce(p_cochera, false) then 0
              when p.c_coch > 0 then 1
              when p_cochera_patron is not null
                   and lower(coalesce(r.descripcion,'') || ' ' || coalesce(r.titulo,'') || ' ' ||
                             coalesce(array_to_string(r.amenities,' '),'')) ~* p_cochera_patron then 1
              else 0 end)::numeric as s_coch
```

**(h) con_pct — numerador y denominador** (2×):
```
de:  + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
a:   + s.s_amen*s.w_amen + s.s_sem*s.w_sem + s.s_coch*s.w_coch + s.s_piso*s.w_piso + s.s_ori*s.w_ori + s.s_disp*s.w_disp)
```
(el denominador de con_pct cae en el mismo reemplazo del punto f si se hace por línea completa).

**(i) SELECT final — columnas sc nuevas** (2×): después de `case when d.w_sem>0  then round(d.s_sem*100)::int  end,` agregar
```sql
      case when d.w_coch>0 then round(d.s_coch*100)::int end,
      case when d.w_piso>0 then round(d.s_piso*100)::int end,
      case when d.w_ori>0  then round(d.s_ori*100)::int  end,
      case when d.w_disp>0 then round(d.s_disp*100)::int end,
```

**(j) Sub-barrio como barrio propio** (rama de zonas, 1×):
```
de:      from zonas z
      join mercado_avisos r
        -- Misma expresión que mercado_avisos_zona_idx: acá es donde el índice engancha.
        on public.acm_norm(btrim(coalesce(nullif(r.barrio, ''), r.ciudad, ''))) = z.k
a:       from (
        -- Un aviso matchea por su barrio O por su sub_barrio (Belgrano R puntúa 100 para un
        -- sujeto de Belgrano R, no 70 como lindero). Si matchea por los dos, gana el mayor.
        select zm.id_aviso, max(zm.score) as score from (
          select r2.id as id_aviso, z.score from zonas z
            join mercado_avisos r2 on public.acm_norm(btrim(coalesce(nullif(r2.barrio, ''), r2.ciudad, ''))) = z.k
           where r2.estado = 'activo' and r2.calidad = 'ok'
          union all
          select r2.id, z.score from zonas z
            join mercado_avisos r2 on public.acm_norm(coalesce(r2.sub_barrio, '')) = z.k
           where r2.estado = 'activo' and r2.calidad = 'ok'
        ) zm group by zm.id_aviso
      ) z
      join mercado_avisos r on r.id = z.id_aviso
```

- [ ] **Step 2: Correr el script** → `acm-fase2.sql`; las aserciones exigen 0 restos y la presencia de cada pieza.

- [ ] **Step 3: Setup de prueba en producción** (aditivo): índice sub-barrio + función bajo nombre `acm_match_fase2_test` + su `set statement_timeout='25s'`:
```sql
create index if not exists mercado_avisos_zona_sub_idx
  on public.mercado_avisos (public.acm_norm(coalesce(sub_barrio, '')), operacion);
```

- [ ] **Step 4: Matriz de validación** (cada consulta con su resultado esperado):
  - **Paridad**: la consulta canónica de Belgrano (params nuevos en null) devuelve LOS MISMOS ids y match_pct que `acm_match_roomix` vivo. Si difiere en una fila → BUG (los pesos nuevos con w=0 no pueden mover el ranking).
  - **Sub-barrio propio**: sujeto `belgrano r` → los avisos con `sub_barrio='Belgrano R'` traen `sc_zona=100` (antes 70); un aviso de Belgrano "a secas" trae 70.
  - **Cocheras**: `p_cochera:=true, p_cochera_patron:='cocher|garage|garaje|estacionamiento'` → `sc_cocheras` ∈ {0,100}; todo candidato con `cocheras>0` da 100; alguno con 0 + texto da 100; y el % ordena a los que tienen arriba.
  - **Piso**: `p_piso:=3` → sc_piso 100 en piso 3, 50 en 1-5, 0 más lejos, null sin dato.
  - **Orientación**: `p_orientacion:='N'` → 100 en N, 50 en NE/NO, 0 en S.
  - **Disposición**: `p_disposicion:='frente'` → 100 frente, 0 contrafrente, null sin dato.
  - **EXPLAIN** del branch sub-barrio: `mercado_avisos_zona_sub_idx` engancha (Bitmap/Index Scan en ambas particiones).
  - **Timeout**: la consulta pesada (Belgrano + linderos + embedding real + todos los params) < 25 s en frío.

- [ ] **Step 5: Volcar a la migración** (sección 2 del archivo): índice + `drop function public.acm_match_roomix(<lista de tipos vieja>);` + el CREATE con nombre real + timeout + `grant execute … to anon, authenticated, service_role` si la función viva lo tenía (verificar con `\df+`/pg_proc antes). Borrar la función de prueba. Commit.

---

### Task 3: Loader "a estrenar" + backfill

**Files:**
- Modify: `mercado-sync/loader.mjs` (donde arma `antiguedad_anios`)

**Interfaces:**
- Produces: avisos nuevos con texto "a estrenar", sin antigüedad declarada y sin `en_construccion` → `antiguedad_anios = 0`. El gate y `fmtAnios` ya entienden 0.

- [ ] **Step 1: Ubicar en `loader.mjs`** dónde se setea `antiguedad_anios` (grep `antiguedad`) y agregar, con el mismo estilo del archivo:
```js
// "A estrenar" viaja solo en el texto del aviso (el payload no trae campo para estos;
// verificado 3-sep: 17,3% de los avisos lo dicen). La codificación 0 = a estrenar es la
// que acm_pasa_obra y fmtAnios ya entienden (roomix la usaba igual).
const A_ESTRENAR = /\ba estrenar\b/i;
if (aviso.antiguedad_anios == null && !aviso.en_construccion &&
    A_ESTRENAR.test(`${aviso.titulo ?? ''} ${aviso.descripcion ?? ''}`)) {
  aviso.antiguedad_anios = 0;
}
```
(adaptar nombres de variables a los reales del archivo al leerlo).

- [ ] **Step 2: Muestra anti-falsos-positivos**: `select titulo from mercado_avisos where (titulo||' '||coalesce(descripcion,'')) ~* '\ba estrenar\b' and antiguedad_anios is null and not en_construccion order by random() limit 30` — leer los 30; si aparece un uso que NO significa obra nueva, ajustar el regex antes del backfill.

- [ ] **Step 3: Ensayo del backfill en BEGIN…ROLLBACK**: el UPDATE + `get diagnostics`/count esperado (~3.500):
```sql
update public.mercado_avisos
   set antiguedad_anios = 0
 where antiguedad_anios is null and not en_construccion
   and (titulo || ' ' || coalesce(descripcion, '')) ~* '\ba estrenar\b';
```

- [ ] **Step 4: Aplicar el backfill** (commit real) y verificar: `count(*) where antiguedad_anios = 0` ≈ el ensayo; y `acm_match_roomix` con sujeto `p_obra:='estrenar'` en Belgrano ahora devuelve filas (antes 0).

- [ ] **Step 5: Commit** de `mercado-sync/loader.mjs`.

---

### Task 4: TS — mappers del sujeto + checklist (TDD)

**Files:**
- Modify: `lib/tasacion/types.ts`, `lib/acm/subject.ts`, `lib/acm/checklist.ts`
- Test: `lib/acm/subject.test.ts` (extender), Create: `lib/acm/checklist.test.ts`

**Interfaces:**
- Produces (Task 5 los consume con estos nombres):
  - `sujetoCochera(s): boolean` — true si `amenidades.cochera_cubierta || amenidades.cochera_descubierta`.
  - `COCHERA_PATRON = 'cocher|garage|garaje|estacionamiento'` (export const).
  - `orientacionParam(s): string | null` — 'norte'→'N', 'sur'→'S', 'este'→'E', 'oeste'→'O', 'ne'→'NE', 'no'→'NO', 'se'→'SE', 'so'→'SO', 'nd'→null.
  - `disposicionParam(s): string | null` — 'frente'|'contrafrente'|'lateral' tal cual; 'al_verde'|'panoramica'|'nd'→null.
  - `SubScores` gana `sc_cocheras, sc_piso, sc_orientacion, sc_disposicion: number | null`.
  - `ChecklistItem.dimension` gana `'cocheras' | 'piso' | 'orientacion' | 'disposicion'`.
  - `PESOS` gana `cocheras: 10, piso: 6, orientacion: 5, disposicion: 5`.
  - `buildChecklist` acepta en sujeto/comp: `cocheras: boolean | number | null`, `piso: number | null`, `orientacion: string | null`, `disposicion: string | null` y arma las 4 filas nuevas (después de "Baños", antes de "Antigüedad" las de estructura: cocheras y piso; orientación y disposición después de "Antigüedad").
  - `AcmComparable` gana opcionales: `variacion_pct?: number | null; dias_publicado?: number | null; expensas?: number | null; expensas_moneda?: string | null; dueno_directo?: boolean; apto_credito?: boolean; en_construccion?: boolean; publicador_puntaje?: number | null; publicador_resenas?: number | null;`.
- **Cochera sale de `AMENITY_TOKENS`** (`cochera_cubierta`/`cochera_descubierta` dejan de generar patrón de amenities — ahora puntúan solas): `amenityTokens` las saltea; `amenityLabels` las CONSERVA (el texto del sujeto para el embedding sigue diciéndolo).

- [ ] **Step 1: Tests que fallan** — en `subject.test.ts`:
```ts
import { sujetoCochera, orientacionParam, disposicionParam, amenityTokens } from "./subject";

describe("fase 2: mappers nuevos del sujeto", () => {
  it("cochera: cualquiera de los dos switches la pide", () => {
    expect(sujetoCochera({ amenidades: { cochera_cubierta: true } as any })).toBe(true);
    expect(sujetoCochera({ amenidades: { cochera_descubierta: true } as any })).toBe(true);
    expect(sujetoCochera({ amenidades: {} as any })).toBe(false);
    expect(sujetoCochera({})).toBe(false);
  });
  it("orientación viaja en el vocabulario de la base (N/NE/…)", () => {
    expect(orientacionParam({ orientacion: "norte" } as any)).toBe("N");
    expect(orientacionParam({ orientacion: "so" } as any)).toBe("SO");
    expect(orientacionParam({ orientacion: "nd" } as any)).toBeNull();
    expect(orientacionParam({})).toBeNull();
  });
  it("vista → disposición solo cuando la base la distingue", () => {
    expect(disposicionParam({ vista: "contrafrente" } as any)).toBe("contrafrente");
    expect(disposicionParam({ vista: "panoramica" } as any)).toBeNull();
  });
  it("la cochera ya no genera patrón de amenities (puntúa sola)", () => {
    const tokens = amenityTokens({ cochera_cubierta: true, pileta: true } as any);
    expect(tokens.some((t) => /cocher/.test(t))).toBe(false);
    expect(tokens.some((t) => /pileta/.test(t))).toBe(true);
  });
});
```
y `checklist.test.ts` (nuevo, mismo estilo vitest): `buildChecklist` con `sc_cocheras: 100, sc_piso: 50, sc_orientacion: null, sc_disposicion: 0` produce filas con dimension/estado/peso correctos (`match`/`parcial`/`na`/`distinto`, pesos 10/6/5/5) y respeta el orden.

- [ ] **Step 2: Verlas fallar** (`npx vitest run lib/acm/subject.test.ts lib/acm/checklist.test.ts`).

- [ ] **Step 3: Implementar** los cambios de la sección Interfaces (código real, estilo del archivo).

- [ ] **Step 4: Suite verde** (`npm test` completo — los tests de mapa corren con `node --test`).

- [ ] **Step 5: Commit.**

---

### Task 5: Route — params, columnas y badges

**Files:**
- Modify: `app/api/acm/comparables/route.ts`

**Interfaces:**
- Consumes: Task 2 (params/salidas SQL), Task 4 (mappers/typos).
- Produces: cada `AcmComparable` de la red trae los badges; el checklist trae las 4 filas.

- [ ] **Step 1:** En el armado de params (~línea 128 en adelante), agregar al RPC de la red:
```ts
        p_cochera: sujetoCochera(sujeto),
        p_cochera_patron: COCHERA_PATRON,
        p_piso: sujeto.piso && sujeto.piso > 0 ? sujeto.piso : null,
        p_orientacion: orientacionParam(sujeto),
        p_disposicion: disposicionParam(sujeto),
```
(verificar el nombre real del campo piso del Sujeto — `piso` — con grep antes; el RPC de cartera `acm_match_properties` NO cambia: la cartera no tiene estos datos → sus `sc_*` nuevos van null y las filas salen "na"... **corrección**: para cartera, pasar los sub-scores nuevos como `null` explícito en el objeto `SubScores`).

- [ ] **Step 2:** Ampliar el `select` del re-fetch de la red (línea ~198) con: `cocheras, expensas, expensas_moneda, dias_publicado, variacion_precio_pct, disposicion, orientacion, es_dueno_directo, apto_credito, en_construccion, publicador_puntaje, publicador_resenas, floor`.

- [ ] **Step 3:** En el `.map` de la red: pasar a `buildChecklist` los valores nuevos del comp (`cocheras: r.cocheras`, `piso: r.floor`, `orientacion: r.orientacion`, `disposicion: r.disposicion`) y del sujeto (de los mappers); y al `AcmComparable` los badges:
```ts
          variacion_pct: r.variacion_precio_pct != null ? Number(r.variacion_precio_pct) : null,
          dias_publicado: r.dias_publicado ?? null,
          expensas: r.expensas != null ? Number(r.expensas) : null,
          expensas_moneda: r.expensas_moneda || "ARS",
          dueno_directo: Boolean(r.es_dueno_directo),
          apto_credito: Boolean(r.apto_credito),
          en_construccion: Boolean(r.en_construccion),
          publicador_puntaje: r.publicador_puntaje != null ? Number(r.publicador_puntaje) : null,
          publicador_resenas: r.publicador_resenas ?? null,
```

- [ ] **Step 4: Suite + `npx tsc --noEmit`** en verde. Commit.

---

### Task 6: UI — badges, mediana, "sin avisos aún" y ficha pública

**Files:**
- Modify: `app/asesor/acm/components/comparables-result.tsx`, `barrio-combobox.tsx`, `app/ficha-acm/[token]/page.tsx`

- [ ] **Step 1: Badges en la tarjeta** — junto al badge "lindero" existente (misma clase visual, colores sobrios), condicionales:
```tsx
{c.variacion_pct != null && c.variacion_pct <= -3 && (
  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 text-[10px] font-bold uppercase tracking-wide">
    ↓ bajó {Math.abs(Math.round(c.variacion_pct))}%
  </span>
)}
{c.en_construccion && <span className="…ámbar…">en construcción</span>}
{c.dueno_directo && <span className="…violeta…">dueño directo</span>}
{c.apto_credito && <span className="…azul…">apto crédito</span>}
```
y en la línea de precio/inmobiliaria: `dias_publicado` ("hace N días", con clase de alerta si >90), `expensas` ("Expensas $X"), y junto al responsable `publicador_puntaje` ("★ 4,5 (120)").

- [ ] **Step 2: Posición vs mediana** — en el componente de la lista de la red: mediana de `precio_m2` de los items con dato, y en cada tarjeta con `precio_m2`:
```tsx
const pos = Math.round(((c.precio_m2! - mediana) / mediana) * 100);
// "+8% vs mediana" (rojo suave si >0, verde si <0, gris si |pos|<3)
```

- [ ] **Step 3: "sin avisos aún"** — `barrio-combobox.tsx` línea ~151:
```tsx
{o.propio ? "de tu cartera" : o.avisos > 0 ? `${o.avisos.toLocaleString("es-AR")} aviso${o.avisos === 1 ? "" : "s"}` : "sin avisos aún"}
```

- [ ] **Step 4: Ficha pública** — leer `app/ficha-acm/[token]/page.tsx`, ubicar la tarjeta del comparable y agregar SOLO los badges de precio (bajó / días publicado / expensas) — la reputación NO va (interna). Los datos ya viajan en el JSON de la ficha si la ficha se arma desde `AcmComparable` guardado; si la ficha re-consulta, sumar las columnas a su select.

- [ ] **Step 5: Suite + tsc.** Commit.

---

### Task 7: Aplicar, verificar de punta a punta y cerrar

- [ ] **Step 1: Aplicar la migración completa a producción** (Management API, una transacción): vista + índice + drop/create de la función + borrar la fn de prueba. Verificación SQL post-commit: paridad canónica de Belgrano + un llamado con TODOS los params nuevos.
- [ ] **Step 2: Deploy**: push de la rama, PR, merge por API → Vercel.
- [ ] **Step 3: Navegador (escritorio)**: ACM en Belgrano con cochera pedida + orientación N + piso 3 → checklist muestra las 4 filas nuevas con valores; badges visibles; mediana coherente; sujeto A estrenar → comparables (post-backfill); combobox dice "sin avisos aún" en los vacíos.
- [ ] **Step 4: Navegador (celular 390x844)**: badges envuelven sin tapar el %, checklist scrolleable.
- [ ] **Step 5: Ficha pública**: generar/abrir una ficha compartible y ver los badges de precio.
- [ ] **Step 6: Bitácora + memoria** (entrada del día; actualizar `mercado-avisos-reemplazo-roomix.md` y el spec si algo cambió en el camino).

---

## Notas que viajan con el plan

- **Paridad primero**: el test más importante de Task 2 es que con los params nuevos en null NADA cambia. Si cambia, el bug está en la cota del pool o en un peso que se activa solo.
- Las búsquedas viejas guardadas (`acm_searches`) no traen `sc_*` nuevos → `buildChecklist` los recibe undefined → filas "na". Verificar que "Mis ACM" viejos abren sin romper.
- `p_cochera=false` vs null: ambos apagan el peso (el `case when p_cochera then` cubre los dos).
- El `floor` de la vista es `piso` de mercado — el re-fetch lo pide como `floor` (contrato viejo).
