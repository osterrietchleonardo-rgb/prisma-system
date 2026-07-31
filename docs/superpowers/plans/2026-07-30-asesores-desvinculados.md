# Asesores desvinculados: filtrado + borrado definitivo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un asesor desvinculado (`profiles.estado = 'eliminado'`) deje de aparecer en las tablas y filtros del director, y que exista una acción separada para borrar de verdad un perfil duplicado, con una verificación que impida destruir el historial de alguien real.

**Architecture:** Dos partes independientes en la misma rama. (A) Filtrado: se agrega `.neq("estado", "eliminado")` a las consultas de `profiles` que alimentan listas de asesores; `getDashboardData` recibe un parámetro opt-in para el único llamador que necesita ver a los eliminados. (B) Borrado: una función Postgres recorre dinámicamente los 33 FKs que apuntan a `profiles` y devuelve la huella de datos del perfil; una server action clasifica esa huella contra una lista blanca de rastros administrativos y sólo borra si no hay trabajo real.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (postgres + auth), Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-30-asesores-desvinculados-filtrado-y-borrado-design.md`

## Global Constraints

- **No hay framework de tests en este repo** (ni jest, ni vitest, ni playwright). La verificación de cada tarea es: `npm run build`, `npm run lint`, prueba manual en `npm run dev`, y consultas a la base por Management API. No inventar un suite de tests.
- **Rama:** `feat/filtrar-asesores-desvinculados` (ya creada desde `origin/main` @ 93c962b).
- **Commitear SÓLO los archivos de cada tarea.** El working tree tiene cambios ajenos sin commitear (`.agents/AGENTS.md`, `.claude/skills/vakdor-video/*`, `.gitignore`, `roomix-sync/condensar-descripcion.mjs`). **Nunca `git add -A` ni `git add .`**
- **Las migraciones del repo NO se aplican solas.** Se aplican por Management API con `SUPABASE_API_KEY_MANAGEMENT` del `.env`, project ref `vutopjvdrwmvrkgnrfno`.
- **El valor de estado desvinculado es la cadena exacta `'eliminado'`.** Los otros son `'activo'` y `'pausado'`.
- **Los pausados NO se filtran en ningún lado.** Sólo `'eliminado'`.
- Textos de UI en español rioplatense, sin tecnicismos (el usuario final es un director de inmobiliaria).

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `supabase/migrations/20260730120000_borrado_definitivo_asesor.sql` | crear | función `asesor_huella_datos` + `equipo_acciones` nullable/nuevo tipo | 1 |
| `lib/queries/dashboard.ts` | modificar | param `incluirDesvinculados` en `getDashboardData` | 2 |
| `app/actions/performance.ts` | modificar | único llamador que pide incluirlos | 2 |
| `lib/tracking/objetivos.ts` | modificar | matriz de objetivos | 3 |
| `actions/tracking/objetivos.ts` | modificar | editor de metas | 3 |
| `actions/tracking/getTrackingOptions.ts` | modificar | desplegable de Tracking | 3 |
| `lib/queries/director.ts` | modificar | `getAgencyAgents` (+ filtro de rol) | 3 |
| `app/director/calendario/page.tsx` | modificar | filtro de asesor del calendario | 4 |
| `components/calendar/NewVisitDialog.tsx` | modificar | filtrar el **render** del desplegable | 4 |
| `components/ai-credits-dashboard.tsx` | modificar | integrantes de la agencia | 4 |
| `components/tracking/TrackingPerformanceView.tsx` | modificar | cruce contra la lista vigente | 4 |
| `app/actions/asesores.ts` | modificar | `getHuellaDatosAsesor` + `eliminarAsesorDefinitivamente` | 5 |
| `app/director/asesores/page.tsx` | modificar | entrada de menú + diálogo de borrado | 6 |

---

### Task 1: Migración — huella de datos y auditoría del borrado

**Files:**
- Create: `supabase/migrations/20260730120000_borrado_definitivo_asesor.sql`

**Interfaces:**
- Produces: función SQL `public.asesor_huella_datos(p_id uuid) RETURNS TABLE (tabla text, columna text, filas bigint)`. Devuelve **sólo** las filas con `filas > 0`. `tabla` viene **sin prefijo de esquema** (`leads`, no `public.leads`) porque `regclass::text` usa el nombre más corto no ambiguo con `search_path` incluyendo `public`.
- Produces: `equipo_acciones.asesor_id` pasa a nullable y `tipo_accion` acepta `'eliminacion_definitiva'`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260730120000_borrado_definitivo_asesor.sql`:

```sql
-- ============================================================================
-- Borrado definitivo de un perfil de asesor (duplicados / cargas por error).
--
-- Por qué hace falta una función: 33 tablas apuntan a public.profiles con
-- comportamiento heterogeneo al borrar (7 CASCADE, 17 NO ACTION, 9 SET NULL).
-- Entre las CASCADE esta performance_logs: borrar a alguien con historial le
-- destruiria toda la actividad registrada EN SILENCIO. Por eso ningun borrado
-- se ejecuta sin antes medir que tiene el perfil encima.
--
-- La funcion recorre los FKs del catalogo (no una lista hardcodeada), asi que
-- una tabla nueva a futuro entra sola en la verificacion en vez de quedar
-- ignorada. Quien decide que bloquea y que no es la lista blanca de la server
-- action (app/actions/asesores.ts): aca solo se mide.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.asesor_huella_datos(p_id uuid)
RETURNS TABLE (tabla text, columna text, filas bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
    ORDER BY 1, 2
  LOOP
    -- r.tbl sale del catalogo (regclass), no de entrada del usuario.
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col)
      INTO n USING p_id;

    IF n > 0 THEN
      tabla := r.tbl;
      columna := r.col;
      filas := n;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Solo el backend la usa (server action con service_role). Nadie mas.
REVOKE ALL ON FUNCTION public.asesor_huella_datos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asesor_huella_datos(uuid) TO service_role;

-- ── Auditoria del borrado definitivo ────────────────────────────────────────
-- El perfil deja de existir, asi que la fila de auditoria NO puede apuntarlo:
-- asesor_id pasa a nullable y la identidad del borrado queda en el motivo.
ALTER TABLE public.equipo_acciones
  ALTER COLUMN asesor_id DROP NOT NULL;

ALTER TABLE public.equipo_acciones
  DROP CONSTRAINT IF EXISTS equipo_acciones_tipo_accion_check;

ALTER TABLE public.equipo_acciones
  ADD CONSTRAINT equipo_acciones_tipo_accion_check
  CHECK (tipo_accion IN ('pausa', 'reanudacion', 'desvinculacion', 'eliminacion_definitiva'));
```

- [ ] **Step 2: Aplicar la migración por Management API**

Crear un script temporal en el scratchpad (NO en el repo) que lea `SUPABASE_API_KEY_MANAGEMENT` del `.env` y haga POST a `https://api.supabase.com/v1/projects/vutopjvdrwmvrkgnrfno/database/query` con el contenido del `.sql`.

Esperado: respuesta `[]` (sin error).

- [ ] **Step 3: Verificar que la función mide bien**

Ejecutar por Management API, contra los dos perfiles reales de Lorena Perez:

```sql
-- Duplicado (debe dar SOLO rastros administrativos)
SELECT * FROM public.asesor_huella_datos('8b3a3d3d-9d99-4bcd-891f-fd27c0e20e92');
-- Perfil bueno (debe dar leads, properties, wa_conversations con valores altos)
SELECT * FROM public.asesor_huella_datos('3df58653-60fe-448f-8dc8-531af75e7eae');
```

Esperado duplicado: exactamente 2 filas → `equipo_acciones/asesor_id = 2` y `agency_invites/used_by = 1`.
Esperado bueno: filas en `leads/assigned_agent_id`, `properties/assigned_agent_id` y `wa_conversations/agent_id` (al 2026-07-31: 49, 17 y 12 — el de leads sube solo, no es un valor fijo).

**Confirmar que `tabla` viene sin prefijo `public.`** — de eso depende la lista blanca de la Task 5.

- [ ] **Step 4: Verificar el CHECK nuevo**

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'equipo_acciones_tipo_accion_check';
```

Esperado: incluye `'eliminacion_definitiva'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260730120000_borrado_definitivo_asesor.sql
git commit -m "feat(asesores): funcion asesor_huella_datos y auditoria de borrado definitivo"
```

---

### Task 2: `getDashboardData` deja de listar desvinculados

**Files:**
- Modify: `lib/queries/dashboard.ts:3` (firma) y `:44-48` (consulta de perfiles)
- Modify: `app/actions/performance.ts:41`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `getDashboardData(agencyId: string, agentId?: string, startDate?: string, endDate?: string, opts?: { incluirDesvinculados?: boolean })`. Por defecto **excluye** desvinculados.

**Contexto:** esta consulta alimenta el ranking del dashboard (`PerformanceLeaderboard`), el desplegable `AdvisorFilter`, y las tarjetas de la página de Asesores. Esa última **sí** necesita a los eliminados (tiene un filtro dedicado), por eso el parámetro.

- [ ] **Step 1: Cambiar la firma y la consulta**

En `lib/queries/dashboard.ts`, reemplazar la línea 3:

```ts
export async function getDashboardData(agencyId: string, agentId?: string, startDate?: string, endDate?: string) {
```

por:

```ts
export async function getDashboardData(
  agencyId: string,
  agentId?: string,
  startDate?: string,
  endDate?: string,
  opts?: { incluirDesvinculados?: boolean }
) {
```

Y reemplazar el bloque de las líneas 43-48:

```ts
  // 3. Profiles — only asesores (directors are excluded from the leaderboard)
  const { data: agencyProfiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("agency_id", agencyId)
    .eq("role", "asesor");
```

por:

```ts
  // 3. Profiles — only asesores (directors are excluded from the leaderboard).
  // Los desvinculados (estado='eliminado') quedan fuera del ranking y del
  // desplegable: ya no son del equipo. Sus performance_logs igual siguen
  // sumando a los KPIs de la agencia, que se calculan por agency_id mas
  // arriba y no dependen de esta lista.
  // La pagina de Asesores es la unica que los pide (tiene su filtro propio).
  let profilesQuery = supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, estado")
    .eq("agency_id", agencyId)
    .eq("role", "asesor");

  if (!opts?.incluirDesvinculados) {
    profilesQuery = profilesQuery.neq("estado", "eliminado");
  }

  const { data: agencyProfiles } = await profilesQuery;
```

- [ ] **Step 2: El único llamador que pide los desvinculados**

En `app/actions/performance.ts`, reemplazar la línea 41:

```ts
  const data = await getDashboardData(profile.agency_id)
```

por:

```ts
  // La pagina de Asesores muestra a proposito a los desvinculados (tiene un
  // filtro "Eliminados" para la trazabilidad), asi que necesita sus numeros.
  const data = await getDashboardData(profile.agency_id, undefined, undefined, undefined, {
    incluirDesvinculados: true,
  })
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos nuevos.

- [ ] **Step 4: Verificar que los totales NO se movieron**

Levantar `npm run dev`, entrar como director a `/director/dashboard` y anotar los KPIs de la agencia (facturación, cierres, captaciones).

Esperado: **idénticos** a antes del cambio. Si cambiaron, el filtro se coló en `perfLogs` y está mal (los KPIs salen de `performance_logs` por `agency_id`, no de la lista de perfiles).

Esperado en el ranking: el duplicado de Lorena (`lorenap@maxre.com.ar`) ya **no** aparece; el perfil bueno (`lperez@maxre.com.ar`) sí.

- [ ] **Step 5: Verificar que la página de Asesores NO perdió a los eliminados**

En `/director/asesores`, filtro "Eliminados": el duplicado tiene que seguir apareciendo **con sus tarjetas de performance**. Si desapareció o quedó sin números, el `incluirDesvinculados` del Step 2 no está llegando.

- [ ] **Step 6: Commit**

```bash
git add lib/queries/dashboard.ts app/actions/performance.ts
git commit -m "feat(dashboard): excluir asesores desvinculados del ranking y del filtro"
```

---

### Task 3: Objetivos, Tracking y Pipeline dejan de listar desvinculados

**Files:**
- Modify: `lib/tracking/objetivos.ts:96-100`
- Modify: `actions/tracking/objetivos.ts:60-65`
- Modify: `actions/tracking/getTrackingOptions.ts:91-96`
- Modify: `lib/queries/director.ts:188-199`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `getAgencyAgents` pasa a devolver **sólo asesores vigentes** (antes devolvía también directores).

- [ ] **Step 1: Matriz de objetivos**

En `lib/tracking/objetivos.ts`, reemplazar las líneas 96-100:

```ts
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("agency_id", agencyId)
    .eq("role", "asesor");
```

por:

```ts
  // Los desvinculados no figuran: ya no tienen objetivos que cumplir.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("agency_id", agencyId)
    .eq("role", "asesor")
    .neq("estado", "eliminado");
```

- [ ] **Step 2: Editor de metas**

En `actions/tracking/objetivos.ts`, reemplazar las líneas 60-65:

```ts
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("agency_id", agencyId)
    .eq("role", "asesor")
    .order("full_name", { ascending: true });
```

por:

```ts
  // Mismo criterio que la matriz: al desvinculado no se le cargan metas.
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("agency_id", agencyId)
    .eq("role", "asesor")
    .neq("estado", "eliminado")
    .order("full_name", { ascending: true });
```

- [ ] **Step 3: Desplegable de Tracking**

En `actions/tracking/getTrackingOptions.ts`, reemplazar las líneas 91-96:

```ts
    const { data: agentsData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("agency_id", profile.agency_id)
      .eq("role", "asesor");
    agents = agentsData;
```

por:

```ts
    const { data: agentsData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("agency_id", profile.agency_id)
      .eq("role", "asesor")
      .neq("estado", "eliminado");
    agents = agentsData;
```

- [ ] **Step 4: `getAgencyAgents` (Pipeline + asignar asesor en Leads)**

En `lib/queries/director.ts`, reemplazar las líneas 192-196:

```ts
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .eq("agency_id", agencyId)
    .order("full_name")
```

por:

```ts
  // Alimenta el filtro de asesor del Pipeline y el selector de "asignar
  // asesor" de Leads: solo asesores vigentes. Antes no filtraba por rol y
  // metia directores en un desplegable rotulado "asesor".
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .eq("agency_id", agencyId)
    .eq("role", "asesor")
    .neq("estado", "eliminado")
    .order("full_name")
```

- [ ] **Step 5: Verificar que compila**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 6: Verificar en la app**

Con `npm run dev`, como director, confirmar que el duplicado de Lorena **no** aparece en:
- `/director/tracking-performance` → desplegable de asesor del formulario de carga
- `/director/tracking-performance` → solapa de Objetivos (matriz y editor)
- `/director/pipeline` → filtro "Asesor"
- `/director/leads` → modal de un lead, selector de asesor

Y en Pipeline confirmar además que **ya no aparecen directores** en ese desplegable.

- [ ] **Step 7: Commit**

```bash
git add lib/tracking/objetivos.ts actions/tracking/objetivos.ts actions/tracking/getTrackingOptions.ts lib/queries/director.ts
git commit -m "feat(asesores): excluir desvinculados de objetivos, tracking y pipeline"
```

---

### Task 4: Calendario, visitas, créditos y el filtro derivado de Tracking

**Files:**
- Modify: `app/director/calendario/page.tsx:159-165`
- Modify: `components/calendar/NewVisitDialog.tsx:611`
- Modify: `components/ai-credits-dashboard.tsx:149-153`
- Modify: `components/tracking/TrackingPerformanceView.tsx:119-161`

**Interfaces:**
- Consumes: nada de tareas previas.

**Cuidado (spec §3.8):** en `NewVisitDialog` se filtra el **render del desplegable**, NO la consulta. Esa lista se usa además para emparejar el asesor de Tokko por email (línea 148) y resolver el perfil activo (línea 164); filtrar la consulta haría que una propiedad de un ex-asesor pierda el nombre de su agente.

- [ ] **Step 1: Filtro de asesor del Calendario**

En `app/director/calendario/page.tsx`, reemplazar las líneas 159-163:

```ts
      const { data: agentsData } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("agency_id", agencyId)
        .eq("role", "asesor")
```

por:

```ts
      const { data: agentsData } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("agency_id", agencyId)
        .eq("role", "asesor")
        .neq("estado", "eliminado")
```

- [ ] **Step 2: Desplegable "Asesor Responsable" de una visita nueva**

En `components/calendar/NewVisitDialog.tsx`, reemplazar la línea 611:

```tsx
                      {allAgencyProfiles?.map(agent => (
```

por:

```tsx
                      {allAgencyProfiles
                        ?.filter(a => a.role === "asesor" && a.estado !== "eliminado")
                        .map(agent => (
```

- [ ] **Step 3: Traer los campos que ese filtro necesita**

El filtro del paso anterior necesita `role` y `estado`, que hoy no se seleccionan. En `components/calendar/NewVisitDialog.tsx`, reemplazar las líneas 121-125:

```ts
        // Fetch all profiles for the agency to match assigned_agent by email
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("agency_id", agencyId)
```

por:

```ts
        // La lista completa (incluidos desvinculados) hace falta para emparejar
        // el asesor de Tokko de una propiedad por email y para resolver el
        // perfil activo. El desplegable de "Asesor Responsable" filtra en el
        // render, no aca: si filtraramos la consulta, una propiedad de un
        // ex-asesor perderia el nombre de su agente.
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email, role, estado")
          .eq("agency_id", agencyId)
```

- [ ] **Step 4: Integrantes en el panel de créditos IA**

En `components/ai-credits-dashboard.tsx`, reemplazar las líneas 149-153:

```ts
    supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("agency_id", agencyId)
      .then(({ data }) => setMembers((data ?? []) as AgencyMember[]))
```

por:

```ts
    supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("agency_id", agencyId)
      .neq("estado", "eliminado")
      .then(({ data }) => setMembers((data ?? []) as AgencyMember[]))
```

(Acá **no** se filtra por rol: el panel muestra directores y asesores a propósito, ver línea 381.)

- [ ] **Step 5: Cruzar el filtro derivado de Tracking contra la lista vigente**

`TrackingPerformanceView` arma su desplegable con los asesores que aparecen en los registros de actividad, no con la tabla de perfiles (spec §3.7). Un ex-asesor con actividad histórica reaparece por ahí.

En `components/tracking/TrackingPerformanceView.tsx`, agregar el estado junto a los demás `useState` del componente:

```ts
  const [asesoresVigentes, setAsesoresVigentes] = useState<Set<string> | null>(null);
```

En `fetchAgencyConfig` (línea 119), después del bloque que lee `profile.agency_id`, agregar la consulta de vigentes. El `useCallback` ya tiene el cliente y el `agency_id` a mano:

```ts
    if (profile?.agency_id) {
      const { data: vigentes } = await supabase
        .from("profiles")
        .select("id")
        .eq("agency_id", profile.agency_id)
        .eq("role", "asesor")
        .neq("estado", "eliminado");
      setAsesoresVigentes(new Set((vigentes ?? []).map(v => v.id)));
    }
```

Y reemplazar el `useMemo` de las líneas 150-161:

```ts
  const advisorOptions = useMemo(() => {
    if (!isDirector) return [];
    const map = new Map<string, string>();
    for (const log of logs) {
      if (log.agent_id && log.profiles?.full_name && !map.has(log.agent_id)) {
        map.set(log.agent_id, log.profiles.full_name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [logs, isDirector]);
```

por:

```ts
  const advisorOptions = useMemo(() => {
    if (!isDirector) return [];
    const map = new Map<string, string>();
    for (const log of logs) {
      if (log.agent_id && log.profiles?.full_name && !map.has(log.agent_id)) {
        // Los asesores salen de los registros, no de la tabla de perfiles, asi
        // que un desvinculado con actividad historica reapareceria aca. Se
        // cruza contra la lista vigente. Mientras no cargo (null) no se
        // descarta a nadie, para no vaciar el filtro en el primer render.
        if (asesoresVigentes && !asesoresVigentes.has(log.agent_id)) continue;
        map.set(log.agent_id, log.profiles.full_name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [logs, isDirector, asesoresVigentes]);
```

- [ ] **Step 6: Verificar que compila y lintea**

Run: `npm run build && npm run lint`
Expected: build exitoso; sin warnings nuevos de `react-hooks/exhaustive-deps` en los archivos tocados.

- [ ] **Step 7: Verificar en la app**

Con `npm run dev`, como director, confirmar que el duplicado de Lorena **no** aparece en:
- `/director/calendario` → filtro de asesor
- `/director/calendario` → "Nueva visita" → desplegable "Asesor Responsable"
- panel de créditos IA → lista de integrantes
- `/director/tracking-performance` → filtro de asesor de la solapa Actividad

Y confirmar que en "Nueva visita", al elegir una propiedad de Tokko, **sigue** apareciendo el mensaje de asesor asignado automáticamente (no la advertencia de "no se encontró perfil"). Eso prueba que la consulta no se filtró de más.

- [ ] **Step 8: Commit**

```bash
git add app/director/calendario/page.tsx components/calendar/NewVisitDialog.tsx components/ai-credits-dashboard.tsx components/tracking/TrackingPerformanceView.tsx
git commit -m "feat(asesores): excluir desvinculados de calendario, visitas, creditos y tracking"
```

---

### Task 5: Server actions del borrado definitivo

**Files:**
- Modify: `app/actions/asesores.ts` (agregar al final, sin tocar lo existente)

**Interfaces:**
- Consumes: función SQL `asesor_huella_datos(p_id uuid)` de la Task 1.
- Produces:
  - `getHuellaDatosAsesor(agentId: string): Promise<{ puedeBorrarse: boolean; bloqueantes: { etiqueta: string; filas: number }[] }>`
  - `eliminarAsesorDefinitivamente(agentId: string, motivo: string): Promise<{ success: true; borrado: { nombre: string; email: string } }>`

- [ ] **Step 1: Lista blanca y etiquetas legibles**

Agregar al final de `app/actions/asesores.ts`:

```ts
// ─── Borrado definitivo (duplicados / cargas por error) ─────────────────────
//
// Distinto de desvincular: desvincular marca y conserva; esto borra la fila.
// Solo se permite sobre un perfil SIN trabajo real encima, porque 7 de las 33
// tablas que apuntan a profiles estan en CASCADE — entre ellas performance_logs
// — y un borrado sobre alguien real le destruiria el historial en silencio.
//
// Criterio de LISTA BLANCA, no de lista negra: aca van solo las tablas que son
// subproducto de haber tenido una cuenta. TODO lo demas bloquea el borrado.
// Asi, una tabla nueva a futuro bloquea por defecto en vez de ser ignorada.
//
// Los nombres van SIN prefijo de esquema: asesor_huella_datos devuelve
// regclass::text, que con search_path=public da "leads", no "public.leads".
const RASTROS_ADMINISTRATIVOS = new Set([
  "equipo_acciones",        // la auditoria de la propia gestion del perfil
  "agency_invites",         // el codigo de invitacion que consumio
  "notifications",          // notificaciones personales
  "google_calendar_tokens", // token de su calendario
  "whatsapp_ai_settings",   // su configuracion personal
  "system_feedback",        // feedback enviado (queda anonimizado por SET NULL)
])

// Nombre legible para el mensaje que ve el director.
const ETIQUETAS_TABLA: Record<string, string> = {
  leads: "leads",
  properties: "propiedades",
  wa_conversations: "conversaciones de WhatsApp",
  wa_contacts: "contactos de WhatsApp",
  performance_logs: "registros de actividad",
  performance_objectives: "objetivos cargados",
  tracking_pipeline_moves: "movimientos de pipeline",
  closings: "cierres",
  visits: "visitas",
  scheduled_visits: "visitas agendadas",
  valuations: "tasaciones",
  contratos: "contratos",
  contract_templates: "plantillas de contrato",
  contract_template_versions: "versiones de plantilla",
  lead_activities: "actividades de leads",
  acm_searches: "análisis de mercado",
  shared_acm_reports: "informes de ACM compartidos",
  shared_properties: "fichas compartidas",
  agency_documents: "documentos subidos",
  document_folders: "carpetas de documentos",
  wa_campaigns: "campañas de WhatsApp",
  ai_credit_transactions: "consumo de créditos IA",
  agencies: "inmobiliarias a su nombre",
  director_invites: "invitaciones de director",
  performance_objective_weights: "pesos de objetivos",
}

function etiquetaDe(tabla: string) {
  return ETIQUETAS_TABLA[tabla] ?? tabla
}
```

- [ ] **Step 2: La verificación previa**

Agregar a continuación:

```ts
/**
 * Mide que tiene el perfil encima y decide si puede borrarse definitivamente.
 * Se usa para pintar el dialogo ANTES de que el director confirme, y la vuelve
 * a correr `eliminarAsesorDefinitivamente` antes de borrar (no se confia en
 * que el cliente haya chequeado).
 */
export async function getHuellaDatosAsesor(agentId: string) {
  const { admin } = await requireDirectorSobreAsesor(agentId)

  const { data, error } = await admin.rpc("asesor_huella_datos", { p_id: agentId })
  if (error) {
    console.error("Error midiendo la huella del asesor:", error)
    throw new Error("No se pudo verificar si este asesor tiene datos asociados")
  }

  const filas = (data ?? []) as { tabla: string; columna: string; filas: number }[]

  // Se agrupa por tabla: una misma tabla puede apuntar a profiles por mas de
  // una columna (equipo_acciones lo hace por asesor_id y por ejecutado_por).
  const porTabla = new Map<string, number>()
  for (const f of filas) {
    if (RASTROS_ADMINISTRATIVOS.has(f.tabla)) continue
    porTabla.set(f.tabla, (porTabla.get(f.tabla) ?? 0) + Number(f.filas))
  }

  const bloqueantes = Array.from(porTabla.entries())
    .map(([tabla, n]) => ({ etiqueta: etiquetaDe(tabla), filas: n }))
    .sort((a, b) => b.filas - a.filas)

  return { puedeBorrarse: bloqueantes.length === 0, bloqueantes }
}
```

- [ ] **Step 3: El borrado**

Agregar a continuación:

```ts
/**
 * Borra DE VERDAD el perfil de un asesor. Para duplicados o cargas por error.
 * Irreversible y sin rastro del perfil: la unica constancia queda en
 * equipo_acciones con asesor_id=NULL y la identidad escrita en el motivo.
 *
 * Se niega si el perfil tiene trabajo real (ver getHuellaDatosAsesor).
 */
export async function eliminarAsesorDefinitivamente(agentId: string, motivo: string) {
  if (!motivo?.trim()) throw new Error("Escribí el motivo del borrado")

  const { directorId, agencyId, asesor, admin } = await requireDirectorSobreAsesor(agentId)

  // Se vuelve a verificar en el servidor: el chequeo del dialogo es para
  // mostrar, no para autorizar.
  const { puedeBorrarse, bloqueantes } = await getHuellaDatosAsesor(agentId)
  if (!puedeBorrarse) {
    const detalle = bloqueantes.map(b => `${b.filas} ${b.etiqueta}`).join(", ")
    throw new Error(
      `No se puede eliminar definitivamente: este asesor tiene ${detalle} a su nombre. ` +
      `Eso no es un duplicado. Usá "Desvincular" para que conserve su historial.`
    )
  }

  const identidad = `${asesor.full_name || "(sin nombre)"} <${asesor.email || "sin email"}>`

  // 1. Limpiar los rastros administrativos que bloquearian por FK.
  await admin.from("equipo_acciones").delete().eq("asesor_id", agentId)
  await admin.from("agency_invites").update({ used_by: null }).eq("used_by", agentId)

  // 2. Dejar constancia ANTES de borrar. asesor_id va en NULL a proposito: el
  //    perfil esta por dejar de existir y la FK impediria el borrado.
  await registrarAccion(admin, {
    agencyId,
    asesorId: null,
    ejecutadoPor: directorId,
    tipoAccion: "eliminacion_definitiva",
    motivo: `${identidad} — ${motivo.trim()}`,
  })

  // 3. Destrabar el email por si quedo bloqueado de una desvinculacion previa:
  //    si era un duplicado, esa direccion no tiene por que quedar inutilizable.
  if (asesor.email) {
    await admin.from("emails_bloqueados").delete().eq("email", asesor.email)
  }

  // 4. Borrar el usuario de auth. profiles.id -> auth.users es CASCADE, asi que
  //    la fila de profiles se va sola.
  const { error: authError } = await admin.auth.admin.deleteUser(agentId)
  if (authError) {
    console.error("Error borrando el usuario de auth:", authError)
    throw new Error(`No se pudo borrar la cuenta: ${authError.message}`)
  }

  revalidatePath("/director/asesores")
  return { success: true as const, borrado: { nombre: asesor.full_name || "", email: asesor.email || "" } }
}
```

- [ ] **Step 4: Ajustar `registrarAccion` para aceptar el caso nuevo**

`registrarAccion` (línea 49) hoy tipa `asesorId: string` y `tipoAccion` sin el valor nuevo. Reemplazar su firma:

```ts
    asesorId: string
    ejecutadoPor: string
    tipoAccion: "pausa" | "reanudacion" | "desvinculacion"
```

por:

```ts
    // asesorId va en null solo en el borrado definitivo: el perfil deja de
    // existir y la FK impediria guardar la constancia.
    asesorId: string | null
    ejecutadoPor: string
    tipoAccion: "pausa" | "reanudacion" | "desvinculacion" | "eliminacion_definitiva"
```

- [ ] **Step 5: Traer `full_name` en el guard**

`requireDirectorSobreAsesor` (línea 26) no selecciona `full_name`, que hace falta para la constancia. Reemplazar:

```ts
    .select("id, email, role, agency_id")
```

por:

```ts
    .select("id, email, full_name, role, agency_id")
```

- [ ] **Step 6: Verificar que compila**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 7: Commit**

```bash
git add app/actions/asesores.ts
git commit -m "feat(asesores): borrado definitivo con verificacion previa de datos"
```

---

### Task 6: Botón y diálogo de "Eliminar definitivamente"

**Files:**
- Modify: `app/director/asesores/page.tsx`

**Interfaces:**
- Consumes: `getHuellaDatosAsesor` y `eliminarAsesorDefinitivamente` de la Task 5.

**Contexto:** el archivo ya tiene el patrón de diálogo con motivo obligatorio para desvincular (`handleConfirmDesvincular`, línea 178) y el menú ⋮ por tarjeta. Se replica ese patrón, en rojo y con la verificación previa mostrada.

- [ ] **Step 1: Importar las acciones nuevas**

En el import existente de `@/app/actions/asesores`, agregar `getHuellaDatosAsesor` y `eliminarAsesorDefinitivamente`.

- [ ] **Step 2: Estado del diálogo**

Agregar junto a los demás `useState`:

```tsx
  const [agentToDelete, setAgentToDelete] = useState<any | null>(null)
  const [deleteReason, setDeleteReason] = useState("")
  const [borrando, setBorrando] = useState<string | null>(null)
  const [huella, setHuella] = useState<{ puedeBorrarse: boolean; bloqueantes: { etiqueta: string; filas: number }[] } | null>(null)
  const [verificandoHuella, setVerificandoHuella] = useState(false)
```

- [ ] **Step 3: Verificar al abrir el diálogo**

```tsx
  // Al abrir el dialogo se mide que tiene el perfil encima, para mostrarselo al
  // director antes de que confirme. La autorizacion real la hace el servidor.
  const abrirDialogoBorrado = async (agent: any) => {
    setAgentToDelete(agent)
    setDeleteReason("")
    setHuella(null)
    setVerificandoHuella(true)
    try {
      setHuella(await getHuellaDatosAsesor(agent.id))
    } catch (e: any) {
      toast.error(e.message || "No se pudo verificar el asesor")
      setAgentToDelete(null)
    } finally {
      setVerificandoHuella(false)
    }
  }

  const handleConfirmBorrado = async () => {
    if (!agentToDelete) return
    if (!deleteReason.trim()) {
      toast.error("Escribí el motivo del borrado")
      return
    }
    try {
      setBorrando(agentToDelete.id)
      const res = await eliminarAsesorDefinitivamente(agentToDelete.id, deleteReason)
      toast.success(`Perfil de ${res.borrado.nombre || res.borrado.email} eliminado definitivamente.`)
      setAgentToDelete(null)
      setDeleteReason("")
      setSelectedAgent(null)
      fetchAgents()
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar el perfil")
    } finally {
      setBorrando(null)
    }
  }
```

- [ ] **Step 4: Entrada en el menú ⋮**

En el menú de cada tarjeta, después de la entrada de "Desvincular", agregar:

```tsx
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => abrirDialogoBorrado(agent)}
                      >
                        Eliminar definitivamente
                      </DropdownMenuItem>
```

(Si `DropdownMenuSeparator` no está importado en el archivo, agregarlo al import de `@/components/ui/dropdown-menu`.)

- [ ] **Step 5: El diálogo**

Agregar junto a los otros diálogos del archivo:

```tsx
      <AlertDialog open={!!agentToDelete} onOpenChange={(o) => !o && setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar definitivamente a {agentToDelete?.full_name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Esto <strong>borra el perfil de verdad</strong>. No queda en la lista de eliminados
                  ni se puede recuperar. Es para duplicados o perfiles cargados por error.
                </p>
                <p className="text-muted-foreground">
                  Si es una persona real que se fue de la inmobiliaria, usá <strong>Desvincular</strong>:
                  así conservás su historial.
                </p>

                {verificandoHuella && <p>Verificando si tiene datos asociados…</p>}

                {huella && !huella.puedeBorrarse && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                    <p className="font-medium">No se puede eliminar definitivamente.</p>
                    <p>
                      Este asesor tiene {huella.bloqueantes.map(b => `${b.filas} ${b.etiqueta}`).join(", ")} a
                      su nombre. Eso no es un duplicado.
                    </p>
                  </div>
                )}

                {huella?.puedeBorrarse && (
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <p>Este perfil no tiene ningún dato de trabajo asociado. Se puede borrar sin perder nada.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {huella?.puedeBorrarse && (
            <div className="space-y-2">
              <Label htmlFor="motivo-borrado">Motivo (obligatorio)</Label>
              <Textarea
                id="motivo-borrado"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ej: perfil duplicado, se registró dos veces el 30/06"
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmBorrado() }}
              disabled={!huella?.puedeBorrarse || !deleteReason.trim() || borrando === agentToDelete?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {borrando === agentToDelete?.id ? "Eliminando…" : "Eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 6: Verificar que compila y lintea**

Run: `npm run build && npm run lint`
Expected: build exitoso.

- [ ] **Step 7: Probar el caso que DEBE fallar**

Con `npm run dev`, entrar a `/director/asesores` como director de Central Real Estate. Abrir el menú ⋮ del perfil **bueno** de Lorena (`lperez@maxre.com.ar`, el que tiene todos los leads y propiedades) → "Eliminar definitivamente".

Esperado: el diálogo muestra el recuadro rojo listando sus leads, propiedades y conversaciones de WhatsApp, **no** aparece el campo de motivo, y el botón de confirmar está deshabilitado.

- [ ] **Step 8: Probar el caso que DEBE permitir (sin confirmar todavía)**

Filtrar por "Eliminados" y abrir el menú ⋮ del duplicado (`lorenap@maxre.com.ar`).

Esperado: el diálogo dice que no tiene ningún dato asociado, aparece el campo de motivo, y el botón se habilita recién al escribirlo. **Cancelar sin confirmar** — el borrado real va en la Task 8.

- [ ] **Step 9: Commit**

```bash
git add app/director/asesores/page.tsx
git commit -m "feat(asesores): dialogo de eliminar definitivamente con verificacion previa"
```

---

### Task 7: Etiqueta "Ex-asesor"

**Files:**
- Modify: `app/director/asesores/page.tsx` (tarjeta del asesor)

**Interfaces:**
- Consumes: nada de tareas previas. `fetchAgents` ya hace `select("*")` (línea 137), así que `agent.estado` está disponible sin cambios.

**Contexto:** el archivo ya pinta estados en las líneas 640-644 (`agent.estado === "eliminado"` / `"pausado"`). Esta tarea es acotada: asegurar que donde se muestra el nombre de un desvinculado se lea "Ex-asesor" en gris, con el mismo lenguaje visual del resto.

- [ ] **Step 1: Etiqueta junto al nombre**

En la tarjeta de cada asesor, junto al `full_name`, agregar:

```tsx
                    {agent.estado === "eliminado" && (
                      <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground align-middle">
                        Ex-asesor
                      </span>
                    )}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Verificar en la app**

En `/director/asesores` con el filtro "Eliminados", el duplicado de Lorena muestra la etiqueta gris "Ex-asesor" junto al nombre.

- [ ] **Step 4: Commit**

```bash
git add app/director/asesores/page.tsx
git commit -m "feat(asesores): etiqueta Ex-asesor junto al nombre del desvinculado"
```

---

### Task 8: Verificación end-to-end, borrado real y documentación

**Files:**
- Modify: `docs/interno/LOGICA-PRISMA.md`
- Modify: `docs/interno/TECNICO-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`

**Interfaces:**
- Consumes: todo lo anterior.

**Nota:** `FUNCIONAL-ASESOR-PRISMA.md` **no** se toca: nada de esto lo ve el asesor.

- [ ] **Step 1: Confirmar que los totales de la agencia no se movieron**

Antes de borrar nada, comparar los KPIs del dashboard del director contra los valores previos al trabajo. Deben ser idénticos (spec §3.5).

- [ ] **Step 2: Fotografiar el estado previo del duplicado**

Por Management API, guardar la evidencia de qué se va a borrar:

```sql
SELECT id, email, full_name, estado, created_at FROM profiles
WHERE id = '8b3a3d3d-9d99-4bcd-891f-fd27c0e20e92';

SELECT * FROM asesor_huella_datos('8b3a3d3d-9d99-4bcd-891f-fd27c0e20e92');

SELECT count(*) AS leads_del_perfil_bueno FROM leads
WHERE assigned_agent_id = '3df58653-60fe-448f-8dc8-531af75e7eae';
```

Anotar los valores **en el momento**, justo antes de borrar. No hardcodear el número: la inmobiliaria está trabajando y ese conteo sube solo (era 48 el 2026-07-30 y 49 al día siguiente). Lo que se verifica es que **no cambie por el borrado**, comparando contra la lectura tomada recién.

- [ ] **Step 3: Ejecutar el borrado del duplicado**

Desde la app en local, con el diálogo de la Task 6, borrar `lorenap@maxre.com.ar` con motivo `"Perfil duplicado: doble registro del 30/06/2026, sin actividad"`.

- [ ] **Step 4: Verificar que se borró y que no se llevó nada puesto**

```sql
-- Debe dar 0 filas
SELECT id FROM profiles WHERE id = '8b3a3d3d-9d99-4bcd-891f-fd27c0e20e92';
SELECT id FROM auth.users WHERE id = '8b3a3d3d-9d99-4bcd-891f-fd27c0e20e92';

-- Debe dar EXACTAMENTE el mismo numero que en el Step 2 (no un valor fijo:
-- la inmobiliaria carga leads todo el tiempo)
SELECT count(*) FROM leads WHERE assigned_agent_id = '3df58653-60fe-448f-8dc8-531af75e7eae';

-- Debe quedar la constancia, con asesor_id NULL y la identidad en el motivo
SELECT tipo_accion, motivo, created_at FROM equipo_acciones
WHERE tipo_accion = 'eliminacion_definitiva' ORDER BY created_at DESC LIMIT 1;

-- No debe quedar ningun asesor en estado eliminado en Central
SELECT estado, count(*) FROM profiles p
JOIN agencies a ON a.id = p.agency_id
WHERE p.role = 'asesor' AND a.name = 'Central Real Estate Argentina'
GROUP BY 1;
```

- [ ] **Step 5: Reportar a Leonardo el detalle exacto de lo borrado**

Qué perfil, qué tenía encima, qué se borró y qué quedó intacto. Fue condición explícita al aprobar el diseño.

- [ ] **Step 6: Actualizar los 3 documentos**

- `docs/interno/LOGICA-PRISMA.md`: la regla de negocio — desvinculado sale de las listas pero su historial sigue sumando a los KPIs de la agencia; borrado definitivo sólo para perfiles sin trabajo real.
- `docs/interno/TECNICO-PRISMA.md`: `asesor_huella_datos`, la lista blanca de rastros administrativos, el parámetro `incluirDesvinculados`, y el mapa de las 33 FKs (7 CASCADE / 17 NO ACTION / 9 SET NULL) con la advertencia sobre `performance_logs`.
- `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`: en lenguaje simple, la diferencia entre Pausar / Desvincular / Eliminar definitivamente y cuándo usar cada una.

- [ ] **Step 7: Anotar el pendiente del filtro de WhatsApp**

En `docs/interno/pendientes-doc` (o el archivo de pendientes que corresponda), dejar registrado: el filtro de asesor de WhatsApp (`components/whatsapp/ConversationsList.tsx:258`) sale de los emails de las conversaciones y no de `profiles`, así que un ex-asesor con chats asignados sigue apareciendo. Arreglarlo requiere decidir a quién se reasignan las conversaciones huérfanas. Fuera de alcance por decisión de Leonardo.

- [ ] **Step 8: Anotar el bug latente del bloqueo de email**

Mismo archivo: `desvincularAsesor` inserta en `emails_bloqueados` como best-effort (`app/actions/asesores.ts:170`, sólo hace `console.error`). Se verificó el 2026-07-30 que la tabla estaba **vacía** pese a haber una desvinculación hecha: el bloqueo no se está aplicando. Si mañana se desvincula a alguien real, podría volver a entrar con otro código de invitación.

- [ ] **Step 9: Commit final**

```bash
git add docs/interno/LOGICA-PRISMA.md docs/interno/TECNICO-PRISMA.md docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md docs/interno/pendientes-doc
git commit -m "docs(asesores): filtrado de desvinculados y borrado definitivo en los 3 documentos"
```

---

## Verificación final antes del merge

- [ ] `npm run build` sin errores nuevos
- [ ] `npm run lint` sin warnings nuevos en los archivos tocados
- [ ] El duplicado no aparece en: ranking, filtro del dashboard, objetivos (matriz y editor), Tracking (formulario y filtro de actividad), Pipeline, modal de leads, calendario, nueva visita, créditos IA
- [ ] Los KPIs de la agencia no cambiaron
- [ ] El desplegable de Pipeline ya no lista directores
- [ ] En "Nueva visita", una propiedad de Tokko sigue emparejando su asesor por email
- [ ] "Eliminar definitivamente" se niega sobre el perfil con leads y propiedades
- [ ] Los leads del perfil bueno siguen igual que en la lectura previa al borrado
- [ ] `git status` no muestra archivos ajenos commiteados (`.agents/AGENTS.md`, `.claude/skills/*`, `.gitignore`, `roomix-sync/*`)
- [ ] **Merge a `main` sólo con el OK explícito de Leonardo**
