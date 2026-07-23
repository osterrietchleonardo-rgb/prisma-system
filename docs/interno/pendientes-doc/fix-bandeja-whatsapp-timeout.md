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

## Segunda parte — `wa_messages` (también corregida en esta rama)

Migración: `supabase/migrations/20260723150000_fix_wa_messages_rls_performance.sql`.

La política de `wa_messages` tenía el mismo antipatrón **al cuadrado**: un `EXISTS` contra
`profiles` que a su vez contenía otro `EXISTS` contra `wa_conversations`.

**Dónde se notaba, que no era donde parecía.** Al detectarlo se asumió que era "abrir un
chat". No lo era: esa consulta filtra por `conversation_id` y siempre fue barata. La consulta
de 6 segundos era la del **Dashboard** — "Response Time Analytics"
(`lib/queries/dashboard.ts:334`), que recorre todos los mensajes de la agencia con un join
lateral y sin filtrar por conversación. Medido para un asesor:

| Momento | Dashboard de un asesor |
|---|---|
| Antes de arreglar `wa_conversations` | ~6.100 ms |
| Después de aquel fix, antes de este | 669 a 896 ms |
| **Con este fix** | **5,3 a 5,5 ms** |

Para el director pasa de 64 ms a 48 ms: nunca fue el caso malo, porque la rama `director`
corta antes por el `OR` y no llega a evaluar el `EXISTS`.

Índice agregado: `(conversation_id, created_at DESC)`. La tabla no tenía **ningún** índice por
`conversation_id` —solo la PK por `id` y el unique por `wamid`—, y todas las lecturas de la app
filtran por ahí. Abrir un chat pasó de 2,8 ms a 1,6 ms.

Se probó además un índice `(agency_id, created_at)` para la consulta del dashboard y **se
descartó con la medición**: empeoraba las dos consultas (abrir un chat pasaba de 1,6 ms a
6,9 ms) porque el planner lo elegía en lugar del de conversación.

Verificación de equivalencia: 19.315 pares (usuario, mensaje) con la lógica vieja y con la
nueva, 0 diferencias. Prueba directa de aislamiento sobre un chat de 96 mensajes de Carlos:
Carlos ve 96, el director ve 96, otra asesora ve 0.

---

## Hallazgo lateral — reportado, NO arreglado

El mismo antipatrón sigue en **27 políticas más**, entre ellas `wa_contacts`,
`performance_logs`, `visits`, `lead_activities` y `n8n_chat_histories`. Ninguna se midió como
crítica hoy, pero todas van a degradarse igual a medida que crezcan las tablas.

Conviene tratarlo como tarea propia, tabla por tabla, con la misma verificación de
equivalencia que se usó acá (comparar los pares usuario/fila visibles antes y después) y
midiendo si el índice hace falta en vez de agregarlo por las dudas.

No se tocó acá para no mezclar alcances. Conviene tratarlo como tarea propia, tabla por tabla
y con la misma verificación de equivalencia que se usó en esta (comparar los pares
usuario/fila visibles antes y después).
