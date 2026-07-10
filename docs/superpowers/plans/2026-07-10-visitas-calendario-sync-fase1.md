# Fase 1 — Núcleo de sincronización calendario→conversación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `wa_conversations.visit_status`, `visit_scheduled_at` y una nueva `visit_address` se rijan automáticamente por la tabla `scheduled_visits` (el calendario), vía un trigger en la base, para todos los estados de visita.

**Architecture:** Un trigger `AFTER INSERT/UPDATE/DELETE` en `scheduled_visits` propaga el estado de la visita a la(s) conversación(es) de WhatsApp que matchean por `agency_id` + teléfono normalizado. Se le quita al bot (n8n `Actualizar_Metricas2`) la escritura de `visit_status`/`visit_scheduled_at` para que no pise al calendario. La rama V del motor usa la dirección real sincronizada, con el LLM `Mensaje V` como fallback.

**Tech Stack:** PostgreSQL (Supabase) plpgsql trigger + migración SQL; n8n (workflows `PRISMA` y `Seguimiento`) vía MCP `n8n_update_partial_workflow`.

## Global Constraints

- Zona horaria de las visitas: `America/Argentina/Buenos_Aires` (copiar verbatim).
- Match teléfono: `regexp_replace(<campo>,'\D','','g')` en ambos lados (`wa_conversations.contact_phone` y `scheduled_visits.lead_id`).
- Mapeo de estados `scheduled_visits.estado_visita` → `wa_conversations.visit_status`: `agendada→scheduled`, `confirmada→confirmed`, `realizada→completed`, `no_asistio→no_show`, `cancelada→cancelled`.
- Escritura en n8n: requiere OK explícito de Leonardo antes de aplicar (validar con `validateOnly:true` primero).
- Número de prueba real: `5492213089334` (Leonardo). Tiene conversación y visitas cargadas.
- Rama de trabajo: `feat/visitas-calendario-sync` (ya creada desde main). No usar `git add -A`; commitear solo archivos propios.

---

### Task 1: Migración — columna `visit_address` + trigger de sincronización

**Files:**
- Create: `supabase/migrations/20260710120000_visitas_calendario_sync.sql`

**Interfaces:**
- Produces: función `public.sync_visit_to_conversation()` y trigger `trg_sync_visit_to_conversation` sobre `public.scheduled_visits`; columna `public.wa_conversations.visit_address text`.
- Consumes: tablas existentes `scheduled_visits` (cols `lead_id, fecha_visita, hora_visita, estado_visita, propiedad_titulo, zona_propiedad, agency_id`) y `wa_conversations` (cols `contact_phone, agency_id, visit_status, visit_scheduled_at, requires_follow_up, next_follow_up_at, visit_reminder_24h_sent, visit_reminder_3h_sent, visit_reminder_1h_sent`).

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260710120000_visitas_calendario_sync.sql` con este contenido exacto:

```sql
-- Fase 1: Sincronización calendario (scheduled_visits) -> wa_conversations
-- El calendario es la ÚNICA fuente de verdad de visit_status / visit_scheduled_at / visit_address.

-- 1) Nueva columna: dirección de la visita para el recordatorio ({{3}} de la plantilla)
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS visit_address text;

COMMENT ON COLUMN public.wa_conversations.visit_address IS
  'Dirección/ubicación de la visita agendada, sincronizada desde scheduled_visits por trigger. NULL si no hay visita activa.';

-- 2) Función de sincronización
CREATE OR REPLACE FUNCTION public.sync_visit_to_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.scheduled_visits;
  v_phone      text;
  v_status     text;
  v_scheduled  timestamptz;
  v_address    text;
BEGIN
  -- Fila efectiva según la operación
  IF (TG_OP = 'DELETE') THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  v_phone := regexp_replace(COALESCE(v_row.lead_id, ''), '\D', '', 'g');
  IF v_phone = '' OR v_row.agency_id IS NULL THEN
    RETURN NULL; -- nada que sincronizar
  END IF;

  -- Timestamp de la visita en zona AR
  v_scheduled := (v_row.fecha_visita + v_row.hora_visita) AT TIME ZONE 'America/Argentina/Buenos_Aires';

  -- Dirección: título de propiedad, fallback a zona
  v_address := NULLIF(btrim(COALESCE(v_row.propiedad_titulo, v_row.zona_propiedad, '')), '');

  -- Estado efectivo: DELETE se trata como cancelada
  IF (TG_OP = 'DELETE') THEN
    v_status := 'cancelada';
  ELSE
    v_status := v_row.estado_visita;
  END IF;

  IF v_status = 'agendada' THEN
    UPDATE public.wa_conversations wc SET
      visit_status = 'scheduled',
      visit_scheduled_at = v_scheduled,
      visit_address = v_address,
      requires_follow_up = false,
      visit_reminder_24h_sent = false,
      visit_reminder_3h_sent = false,
      visit_reminder_1h_sent = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSIF v_status = 'confirmada' THEN
    UPDATE public.wa_conversations wc SET
      visit_status = 'confirmed',
      visit_scheduled_at = v_scheduled,
      visit_address = v_address,
      requires_follow_up = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSIF v_status = 'realizada' THEN
    UPDATE public.wa_conversations wc SET
      visit_status = 'completed',
      requires_follow_up = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSIF v_status = 'no_asistio' THEN
    UPDATE public.wa_conversations wc SET
      visit_status = 'no_show',
      requires_follow_up = true,
      next_follow_up_at = now(),
      visit_reminder_24h_sent = false,
      visit_reminder_3h_sent = false,
      visit_reminder_1h_sent = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSE -- cancelada (o DELETE, o cualquier estado desconocido = tratar como cancelada)
    UPDATE public.wa_conversations wc SET
      visit_status = 'cancelled',
      visit_scheduled_at = null,
      visit_address = null,
      requires_follow_up = true,
      next_follow_up_at = now(),
      visit_reminder_24h_sent = false,
      visit_reminder_3h_sent = false,
      visit_reminder_1h_sent = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;
  END IF;

  RETURN NULL; -- AFTER trigger, el valor de retorno se ignora
END;
$$;

-- 3) Trigger
DROP TRIGGER IF EXISTS trg_sync_visit_to_conversation ON public.scheduled_visits;
CREATE TRIGGER trg_sync_visit_to_conversation
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduled_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_visit_to_conversation();
```

- [ ] **Step 2: Crear una rama de Supabase para probar sin tocar producción**

Usar MCP `mcp__supabase__create_branch` (nombre: `visitas-sync-test`). Esperar a que quede lista (`list_branches` hasta status ACTIVE_HEALTHY).

- [ ] **Step 3: Aplicar la migración en la rama de prueba**

Usar MCP `mcp__supabase__apply_migration` sobre la rama, con `name: "visitas_calendario_sync"` y el SQL del Step 1.
Esperado: sin error.

- [ ] **Step 4: Test — estado `agendada`**

En la rama, ejecutar (guardar el estado previo de la conversación de prueba para restaurar después no hace falta, es rama descartable):

```sql
-- Tomar una conversación real del número de prueba
-- (en la rama, los datos son copia; usar el mismo teléfono)
INSERT INTO scheduled_visits (lead_id, fecha_visita, hora_visita, estado_visita, propiedad_titulo, zona_propiedad, agency_id, agent_id)
SELECT '5492213089334', (current_date + 2), '15:00', 'agendada', 'Av. Test 1234, Palermo', 'Palermo', wc.agency_id, wc.agent_id
FROM wa_conversations wc
WHERE regexp_replace(wc.contact_phone,'\D','','g') = '5492213089334'
LIMIT 1;

SELECT visit_status, visit_scheduled_at, visit_address, requires_follow_up,
       visit_reminder_24h_sent, visit_reminder_3h_sent, visit_reminder_1h_sent
FROM wa_conversations
WHERE regexp_replace(contact_phone,'\D','','g') = '5492213089334';
```

Esperado: `visit_status='scheduled'`, `visit_scheduled_at` = pasado mañana 15:00 AR, `visit_address='Av. Test 1234, Palermo'`, `requires_follow_up=false`, los tres flags `false`.

- [ ] **Step 5: Test — reprogramar, confirmar, realizar, no-show, cancelar**

```sql
-- Reprogramar
UPDATE scheduled_visits SET hora_visita='18:00'
WHERE lead_id='5492213089334' AND estado_visita='agendada';
-- esperado: visit_scheduled_at ahora 18:00, flags reseteados a false

-- Confirmar
UPDATE scheduled_visits SET estado_visita='confirmada'
WHERE lead_id='5492213089334' AND estado_visita='agendada';
-- esperado: visit_status='confirmed', requires_follow_up=false

-- Realizar
UPDATE scheduled_visits SET estado_visita='realizada'
WHERE lead_id='5492213089334' AND estado_visita='confirmada';
-- esperado: visit_status='completed'

-- No-show (desde otra visita confirmada) y cancelar: repetir el patrón
UPDATE scheduled_visits SET estado_visita='cancelada'
WHERE lead_id='5492213089334';
-- esperado: visit_status='cancelled', visit_scheduled_at=null, visit_address=null, requires_follow_up=true
```

Verificar con el `SELECT` del Step 4 tras cada UPDATE. Confirmar cada fila de la tabla del spec §7.

- [ ] **Step 6: Test — teléfono sin conversación no rompe nada**

```sql
INSERT INTO scheduled_visits (lead_id, fecha_visita, hora_visita, estado_visita, agency_id)
SELECT '540000000000', current_date+1, '10:00', 'agendada', id FROM agencies LIMIT 1;
-- esperado: 0 filas afectadas en wa_conversations, sin error
```

- [ ] **Step 7: Borrar la rama de prueba**

MCP `mcp__supabase__delete_branch` sobre `visitas-sync-test`.

- [ ] **Step 8: Commit de la migración**

```bash
git add supabase/migrations/20260710120000_visitas_calendario_sync.sql
git commit -m "feat(visitas): trigger sync scheduled_visits->wa_conversations + visit_address

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Quitar al bot la escritura de `visit_status`/`visit_scheduled_at` (n8n `PRISMA`)

**Files:**
- Modify: workflow n8n `PRISMA` (id `aNowZdPO_xMlGwKRb54ir`), nodo `Actualizar_Metricas2`.

**Interfaces:**
- Consumes: nada de Task 1 en runtime; es independiente. Pero conceptualmente depende de que el trigger (Task 1) ya sea el dueño de esas columnas.

- [ ] **Step 1: Validar el cambio (sin aplicar)**

MCP `n8n_update_partial_workflow` con `validateOnly:true`:

```json
{
  "id": "aNowZdPO_xMlGwKRb54ir",
  "intent": "Remove visit_status and visit_scheduled_at from Actualizar_Metricas2 mapping so calendar trigger owns them",
  "validateOnly": true,
  "operations": [
    { "type": "updateNode", "nodeName": "Actualizar_Metricas2", "updates": {
      "parameters.columns.value.visit_status": null,
      "parameters.columns.value.visit_scheduled_at": null
    }}
  ]
}
```

Esperado: `valid: true`.

- [ ] **Step 2: Pedir OK a Leonardo y aplicar**

Tras OK explícito, repetir sin `validateOnly`. Esperado: `saved: true`, 1 operación aplicada.

- [ ] **Step 3: Verificar**

`n8n_get_workflow` mode `filtered` nodeNames `["Actualizar_Metricas2"]`. Confirmar que en `parameters.columns.value` ya NO están `visit_status` ni `visit_scheduled_at`, y que SÍ siguen `opt_out` y `requires_follow_up`.

- [ ] **Step 4: Nota**

No hay commit de código (el cambio vive en n8n). Registrar en el doc de progreso al cerrar la fase.

---

### Task 3: Rama V usa `visit_address` con fallback al LLM (n8n `Seguimiento`)

**Files:**
- Modify: workflow n8n `Seguimiento` (id `hr3cuwHg0gzsnlqB`), nodo `Edit Fields`.

**Interfaces:**
- Consumes: columna `visit_address` de `wa_conversations` (Task 1), que ya viene en `$('Filtro - Seguimiento V').item.json.visit_address` porque el filtro hace `SELECT wc.*`.
- Produces: campo `direccion_visita` que usan los nodos `Enviar_Plantilla_V_*` como `{{3}}`.

- [ ] **Step 1: Validar el cambio (sin aplicar)**

El nodo `Edit Fields` tiene el assignment `direccion_visita` con value `={{ $json.output[0].content[0].text }}` (salida del LLM `Mensaje V`). Cambiarlo para preferir `visit_address` y caer al LLM si está vacío:

```json
{
  "id": "hr3cuwHg0gzsnlqB",
  "intent": "Edit Fields uses synced visit_address with LLM fallback for direccion_visita",
  "validateOnly": true,
  "operations": [
    { "type": "patchNodeField", "nodeName": "Edit Fields",
      "fieldPath": "parameters.assignments.assignments.1.value",
      "patches": [{
        "find": "={{ $json.output[0].content[0].text }}",
        "replace": "={{ $('Filtro - Seguimiento V').item.json.visit_address || $json.output[0].content[0].text }}"
      }]
    }
  ]
}
```

Esperado: `valid: true`. (Si el índice `.1.value` no matchea el assignment de `direccion_visita`, primero leer el nodo con `n8n_get_workflow` filtered y ajustar el índice.)

- [ ] **Step 2: Pedir OK a Leonardo y aplicar**

Tras OK, repetir sin `validateOnly`. Esperado: `saved: true`.

- [ ] **Step 3: Verificar**

`n8n_get_workflow` filtered nodeNames `["Edit Fields"]`. Confirmar que `direccion_visita` ahora es `={{ $('Filtro - Seguimiento V').item.json.visit_address || $json.output[0].content[0].text }}`.

---

### Task 4: Aplicar migración a producción + verificación final

**Files:**
- Ninguno nuevo (aplica el archivo de Task 1 a la base de producción).

- [ ] **Step 1: Pedir OK a Leonardo para producción**

Confirmar que Tasks 1-3 pasaron en prueba.

- [ ] **Step 2: Aplicar la migración a producción**

MCP `mcp__supabase__apply_migration` (proyecto principal, sin rama) con el SQL de Task 1 / `name: "visitas_calendario_sync"`.
Esperado: sin error. (La migración es idempotente: `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`.)

- [ ] **Step 3: Smoke test en producción (no destructivo)**

```sql
-- Verificar que el trigger existe
SELECT tgname FROM pg_trigger WHERE tgname='trg_sync_visit_to_conversation';
-- Verificar que la columna existe
SELECT column_name FROM information_schema.columns
WHERE table_name='wa_conversations' AND column_name='visit_address';
```

Esperado: ambas filas presentes.

- [ ] **Step 4: Backfill de visitas ya agendadas (una sola vez)**

Sincronizar las visitas que ya existen para que el estado quede coherente desde el arranque:

```sql
UPDATE scheduled_visits SET updated_at = now()
WHERE estado_visita IN ('agendada','confirmada','realizada','no_asistio','cancelada');
-- el UPDATE dispara el trigger para cada fila y sincroniza wa_conversations
```

Verificar una muestra:

```sql
SELECT sv.lead_id, sv.estado_visita, wc.visit_status, wc.visit_scheduled_at, wc.visit_address
FROM scheduled_visits sv
JOIN wa_conversations wc
  ON wc.agency_id = sv.agency_id
 AND regexp_replace(wc.contact_phone,'\D','','g') = regexp_replace(sv.lead_id,'\D','','g')
ORDER BY sv.fecha_visita DESC LIMIT 10;
```

Esperado: `visit_status` coherente con `estado_visita` según el mapeo.

- [ ] **Step 5: Actualizar docs internos**

Editar `docs/interno/LOGICA-PRISMA.md` y `docs/interno/TECNICO-PRISMA.md` documentando: el trigger, la columna `visit_address`, el cambio de propiedad de columnas (calendario dueño de visit_status/scheduled_at), y los 2 cambios en n8n. Commit:

```bash
git add docs/interno/LOGICA-PRISMA.md docs/interno/TECNICO-PRISMA.md docs/superpowers/plans/2026-07-10-visitas-calendario-sync-fase1.md
git commit -m "docs(visitas): documenta sync calendario Fase 1 (trigger + n8n)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge a main (con OK de Leonardo)**

Tras OK, mergear `feat/visitas-calendario-sync` a main.

---

## Self-Review

**Spec coverage:**
- §5 propiedad de columnas → Task 2 (quita del bot) + Task 1 (trigger dueño). ✓
- §6 columna `visit_address` + estados → Task 1. ✓
- §7 lógica del trigger (5 estados) → Task 1 función. ✓
- §9 cambios n8n #1 (`Actualizar_Metricas2`) → Task 2; #2 (`Edit Fields` fallback) → Task 3. ✓
- §12 plan de pruebas → Task 1 Steps 4-6 (rama) + Task 4 Step 3-4 (prod). ✓
- §13 docs → Task 4 Step 5. ✓
- Confirmación por cliente (§8) y UI/`realizada` auto (Fase 3) → **fuera de Fase 1** (Fases 2 y 3). ✓

**Placeholder scan:** sin TBD/TODO; todo el SQL y los JSON de operaciones están completos. El único condicional ("si el índice `.1.value` no matchea") incluye la acción concreta a tomar. ✓

**Type consistency:** nombres de columnas y estados idénticos en spec y plan; `visit_address`, `sync_visit_to_conversation`, `trg_sync_visit_to_conversation` consistentes en todas las tareas. ✓
