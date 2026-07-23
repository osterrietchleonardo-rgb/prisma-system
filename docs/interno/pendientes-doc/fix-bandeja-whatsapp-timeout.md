# Pendiente de documentación — Bandeja WhatsApp: timeout por RLS

**Rama:** `fix/bandeja-whatsapp-timeout` · **Fecha:** 23 de julio de 2026
**Origen:** sugerencia `3902f144-e115-4a7a-911c-b50c590c765e` de `marianan@maxre.com.ar`.

> Se deja acá en vez de editar los 4 documentos, siguiendo la Opción 1 del anexo del plan
> `2026-07-22-sugerencias-clientes-pendientes.md` (varias ramas vivas en paralelo).

---

## Va en TECNICO-PRISMA.md — sección de WhatsApp / base de datos

**Regla de acceso de `wa_conversations` (RLS).**
La política `wa_conversations_access_policy` se reescribió el 23/07/2026 por un problema de
rendimiento que sacaba la bandeja de servicio.

La versión anterior usaba un `EXISTS` correlacionado contra `profiles`. Como dependía de
`wa_conversations.agency_id` y `.agent_id`, Postgres no podía cachear el subquery y lo
re-ejecutaba **una vez por fila**: 1.436 ejecuciones por cada carga de la bandeja.

La versión actual compara contra las funciones helper que ya existían (`get_my_agency_id()`,
`get_my_role()`), envueltas en `(SELECT ...)` para que el planner las evalúe una sola vez:

```sql
USING (
  agency_id = (SELECT get_my_agency_id())
  AND (
    (SELECT get_my_role()) = 'director'
    OR agent_id = (SELECT auth.uid())
  )
)
```

Índices agregados: `(instance_id, last_message_at DESC)` y `(agent_id)`.

Migración: `supabase/migrations/20260723130000_fix_wa_conversations_rls_performance.sql`.

**Al escribir políticas RLS nuevas, evitar el `EXISTS` correlacionado contra `profiles`.**
Usar las funciones helper envueltas en `(SELECT ...)`. Es la diferencia entre una consulta
de 2 segundos y una de 2 milisegundos.

**Refresco de la bandeja:** el respaldo por polling de `ConversationsList.tsx` pasó de 5 a 30
segundos. La entrega instantánea la hace la suscripción realtime; el polling solo cubre que
esa suscripción se caiga (típico en celular, cuando el navegador suspende la pestaña).

---

## Va en FUNCIONAL-ASESOR-PRISMA.md — sección Bandeja de WhatsApp

Si alguna vez la bandeja no llega a cargar las conversaciones, aparece un cartel que dice
**"No pudimos cargar las conversaciones"** con un botón **Reintentar**. Casi siempre es una
demora momentánea: con reintentar alcanza.

(Antes ese cartel mostraba un texto técnico en inglés y, una vez que aparecía, quedaba fijo
hasta recargar la página aunque el sistema ya se hubiera recuperado.)

---

## No va en LOGICA-PRISMA.md ni en FUNCIONAL-DIRECTOR-PRISMA.md

No cambia ninguna regla de negocio ni quién ve qué: se verificó que la política nueva devuelve
exactamente las mismas filas que la anterior (37 usuarios comparados, 0 diferencias).

---

## Hallazgo lateral — reportado, NO arreglado en esta rama

El mismo antipatrón (`EXISTS` correlacionado con `auth.uid()` sin envolver) está en **29
políticas más**, entre ellas `wa_messages`, `wa_contacts`, `performance_logs`, `visits` y
`lead_activities`.

**La de `wa_messages` es la más urgente y sigue rota.** Es la que carga los mensajes al abrir
un chat, y su política tiene un `EXISTS` anidado (profiles → wa_conversations), o sea el
problema al cuadrado. Medido en producción el 23/07, después de arreglar `wa_conversations`
y reseteando las estadísticas para tener números limpios:

| Consulta | Llamadas reales | Media | Máximo |
|---|---|---|---|
| Bandeja (`wa_conversations`) — ya arreglada | 16 | **1,2 a 2,2 ms** | 2,3 ms |
| Abrir un chat (`wa_messages`) — sin arreglar | 6 | **5.944 a 6.098 ms** | 6.230 ms |

Seis segundos para abrir un chat, contra un `statement_timeout` de 8 s: queda a 1,8 s de
empezar a fallar igual que fallaba la bandeja.

No se tocó acá para no mezclar alcances. Conviene tratarlo como tarea propia, tabla por tabla
y con la misma verificación de equivalencia que se usó en esta (comparar los pares
usuario/fila visibles antes y después).
