# Asesores desvinculados: filtrado en el dashboard + borrado definitivo de duplicados

**Fecha:** 2026-07-30
**Estado:** diseño aprobado, pendiente de plan de implementación
**Rama:** `feat/filtrar-asesores-desvinculados` (desde `origin/main` @ 93c962b)
**Alcance:** que un asesor desvinculado deje de aparecer en las tablas y filtros del director, y agregar una acción separada de borrado real para perfiles duplicados/cargados por error.

---

## 1. Problema

Son dos problemas distintos que hoy comparten el mismo mecanismo.

**a) El desvinculado sigue apareciendo en todos lados.** Cuando el director desvincula a un asesor, `app/actions/asesores.ts:141` pone `profiles.estado = 'eliminado'` y le corta el acceso. Eso funciona. Pero **ninguna consulta del dashboard mira ese campo**: el ex-asesor sigue figurando en el ranking, en los objetivos, y en todos los desplegables donde el director elige a quién asignarle un lead o una visita.

**b) No existe forma de borrar un perfil cargado por error.** Si un asesor se duplica (doble registro, código usado dos veces), la única herramienta disponible es "Desvincular", que está pensada para una persona real que se va: conserva el historial y bloquea el email. Aplicada a un duplicado deja basura permanente, y encima puede bloquear un email que la persona sí usa.

La distinción es de negocio, no técnica:

| | Persona real que se va | Duplicado / error de carga |
|---|---|---|
| ¿Trabajó? | Sí, sus cierres son plata que entró | No, nunca existió como persona |
| ¿Su historial vale? | Sí, es historia de la inmobiliaria | No hay historial que valga |
| Acción correcta | Desvincular (marcar, conservar) | Borrar de verdad |

## 2. Principio rector

**Marcar y borrar son dos acciones distintas, y el sistema no deja confundirlas.**

Desvincular nunca borra datos. Borrar definitivamente sólo se permite sobre un perfil sin trabajo real encima, y el propio sistema lo verifica antes: si el perfil tiene aunque sea un lead, se niega y explica por qué. Es imposible destruir el historial de alguien real apretando el botón equivocado.

## 3. Contexto verificado

Todo lo de abajo se comprobó el 2026-07-30 contra el código y la base de producción (`vutopjvdrwmvrkgnrfno`) vía Management API. No se asumió nada.

### 3.1 Cómo se marca hoy un asesor

`profiles.estado` ∈ {`activo`, `pausado`, `eliminado`}, más `tokens_invalidos_desde` y `deleted_at`/`deleted_by`.

- `pausarAsesor` → `pausado`. Reversible, **no** bloquea el email.
- `desvincularAsesor` → `eliminado` + `deleted_at` + inserta el email en `emails_bloqueados` (best-effort).
- Trazabilidad en `equipo_acciones`.

**No existe borrado real en ninguna parte del sistema.** Ni el director ni el panel de Vakdor (`app/api/admin-vakdor/asesores/[id]/estado/route.ts`) borran filas: todo es soft delete.

### 3.2 Estado real de la base

| Agencia | Estado | Asesores |
|---|---|---|
| Central Real Estate Argentina | activo | 28 |
| Central Real Estate Argentina | pausado | 1 |
| Central Real Estate Argentina | eliminado | **1** |
| PRISMAIA - VAKDOR | activo | 1 |

El único asesor en estado `eliminado` de todo el sistema **es precisamente el duplicado** que motivó este trabajo:

**Lorena Perez**, dos perfiles en Central Real Estate:

| | Perfil bueno | Perfil duplicado |
|---|---|---|
| email | `lperez@maxre.com.ar` | `lorenap@maxre.com.ar` |
| id | `3df58653-60fe-448f-8dc8-531af75e7eae` | `8b3a3d3d-9d99-4bcd-891f-fd27c0e20e92` |
| estado | activo | eliminado |
| creado | 2026-06-30 20:27:47 | 2026-06-30 20:27:00 |
| leads | 48 | **0** |
| propiedades | 17 | **0** |
| conversaciones wa | 12 | **0** |
| actividad registrada | — | **0** |

Los dos perfiles se crearon con **47 segundos de diferencia**: doble registro con dos códigos de invitación distintos. El duplicado no tiene una sola fila de trabajo real. Lo único que le cuelga son **2 rastros administrativos**: 2 filas en `equipo_acciones` (la auditoría de haberlo pausado y desvinculado) y 1 en `agency_invites.used_by` (el código que consumió).

`emails_bloqueados` está **vacío** para ambos emails: el bloqueo nunca llegó a escribirse (es best-effort y falla en silencio, `asesores.ts:170`). O sea que no hay email trabado que limpiar.

### 3.3 Qué pasa si se borra una fila de `profiles`

33 tablas apuntan a `public.profiles`. El comportamiento al borrar es **heterogéneo y peligroso**:

| Al borrar | Cuántas | Qué pasa | Tablas críticas |
|---|---|---|---|
| **CASCADE** | 7 | Se borran solas y **en silencio** | `performance_logs`, `performance_objectives`, `tracking_pipeline_moves`, `document_folders`, `notifications`, `google_calendar_tokens`, `whatsapp_ai_settings` |
| **NO ACTION** | 17 | El borrado **falla con error de FK** | `leads`, `properties`, `closings`, `visits`, `valuations`, `contratos`, `equipo_acciones`, `agency_invites`, `lead_activities`, … |
| **SET NULL** | 9 | La fila sobrevive **huérfana** | `wa_conversations`, `wa_contacts`, `scheduled_visits`, `acm_searches`, `ai_credit_transactions`, … |

La consecuencia que manda el diseño: **un borrado sobre alguien con historial destruiría `performance_logs` sin previo aviso** (CASCADE). Por eso el borrado real no puede ofrecerse sin una verificación previa obligatoria.

`profiles.id → auth.users` es **CASCADE**: borrando el usuario de auth, el perfil se va solo. Ese es el camino limpio.

### 3.4 Dónde NO se filtra hoy

Las 10 superficies del director que listan asesores sin mirar `estado`:

| Superficie | Archivo | Nota |
|---|---|---|
| Ranking de asesores del dashboard | `lib/queries/dashboard.ts:44` | arma 1 fila por asesor de la agencia |
| Filtro de asesor del dashboard | ídem (`AdvisorFilter`) | |
| Objetivos — matriz | `lib/tracking/objetivos.ts:96` | |
| Objetivos — editor de metas | `actions/tracking/objetivos.ts:60` | |
| Filtro de asesor en Tracking Performance | `actions/tracking/getTrackingOptions.ts:91` | |
| Filtro en Pipeline + asignar asesor en Leads | `lib/queries/director.ts:188` | tampoco filtra `role`: **mete directores** |
| Filtro de asesor en Calendario | `app/director/calendario/page.tsx:159` | |
| Asignar visita nueva | `components/calendar/NewVisitDialog.tsx:611` | ver §3.8: se filtra el desplegable, **no** la consulta |
| Créditos IA por miembro | `components/ai-credits-dashboard.tsx:150` | |

Las que **sí** filtran bien y no se tocan:
- `app/director/asesores/page.tsx:342` — la página de gestión, con su selector activo/pausado/eliminado.
- `app/api/asesor/creditos/route.ts:52` — ya tiene `.eq("estado", "activo")`, que además de los eliminados excluye a los pausados. Correcto para repartir créditos.

### 3.8 En `NewVisitDialog` la lista de perfiles sirve para tres cosas

`allAgencyProfiles` (`NewVisitDialog.tsx:122`) se usa en:

| Línea | Uso | ¿Filtrar? |
|---|---|---|
| 148 | emparejar el asesor de Tokko de una propiedad, por email | **No** |
| 164 | resolver el perfil del asesor activo por id | **No** |
| 611 | el desplegable "Asesor Responsable" | **Sí** |

Filtrar la consulta rompería el emparejamiento: una propiedad cuyo agente de Tokko es un ex-asesor perdería el nombre y mostraría la advertencia "No se encontró un perfil en PRISMA". **Se filtra sólo en el render del desplegable.**

### 3.5 Los totales de la agencia no dependen de la lista de asesores

Verificado en `lib/queries/dashboard.ts:31-41`: los KPIs (facturación, cierres, captaciones) salen de `performance_logs` filtrando por `agency_id`, **no** de la lista de perfiles. El ranking por asesor (`dashboard.ts:223`) es lo único que itera la lista.

**Implica:** sacar a un ex-asesor del ranking **no baja los totales de la inmobiliaria**. Sus cierres siguen sumando al año. Sólo desaparece su fila.

### 3.6 Enganche: la página de Asesores comparte la consulta del ranking

`getAgencyAdvisorsPerformanceAction` (`app/actions/performance.ts:41`) llama a `getDashboardData` y usa `data.advisors` para las tarjetas de la página de Asesores — que **sí** necesita ver a los eliminados, porque tiene un filtro dedicado para ellos.

Si se filtra dentro de `getDashboardData` sin más, esa página pierde los números de los eliminados que muestra a propósito.

### 3.7 El filtro de Tracking no sale de `profiles`

`components/tracking/TrackingPerformanceView.tsx:149` deriva los asesores **de los registros de actividad**, no de la tabla de perfiles. Un ex-asesor con actividad histórica reaparece por ahí aunque se arreglen las consultas de `profiles`.

(Lo mismo pasa en el filtro de WhatsApp, `components/whatsapp/ConversationsList.tsx:258`, que sale de los emails de las conversaciones. **Queda fuera de alcance**, ver §7.)

## 4. Decisiones de producto

Tomadas con Leonardo el 2026-07-30:

1. **Desvinculado desaparece de las listas.** Ranking de asesores y objetivos incluidos. Sin opción de "incluir ex-asesores".
2. **Pausado no se toca.** La pausa es reversible y la persona sigue siendo del equipo: sigue en rankings y desplegables como hoy.
3. **Los totales de la agencia no se tocan.** El historial del ex-asesor sigue sumando a los números de la inmobiliaria (§3.5).
4. **Donde un registro viejo todavía lo apunta** (un lead que sigue asignado a él), se lo marca con una etiqueta gris **"Ex-asesor"** al lado del nombre.
5. **Borrar definitivamente es una acción aparte**, sólo para duplicados, con verificación previa obligatoria.
6. **Sin detección automática de duplicados.** Adivinar por nombre es peligroso (dos "Juan Pérez" reales existen). El director elige; el sistema sólo lo frena si se equivoca.

## 5. Diseño

### 5.1 Parte A — Filtrado

Regla única: **`estado = 'eliminado'` no figura en ninguna lista de asesores.**

Se agrega `.neq("estado", "eliminado")` a las consultas de §3.4, con dos salvedades de diseño:

**`getDashboardData` recibe un parámetro nuevo.** Firma: `getDashboardData(agencyId, agentId?, startDate?, endDate?, opts?: { incluirDesvinculados?: boolean })`, con `false` por defecto. El único llamador que pasa `true` es `getAgencyAdvisorsPerformanceAction` (§3.6). Así el comportamiento seguro es el default y la excepción es explícita.

**`getAgencyAgents` además filtra por rol.** Hoy devuelve directores mezclados con asesores en un desplegable rotulado "asesor" (§3.4). Se agrega `.eq("role", "asesor")` junto con el filtro de estado.

**El filtro de Tracking se cruza contra la lista vigente.** `TrackingPerformanceView` sigue derivando los asesores de los registros (§3.7), pero descarta los que no estén vigentes. La lista vigente la trae el propio componente con el cliente de Supabase que ya usa en `fetchAgencyConfig` — no se llama a `getTrackingOptions`, que además trae propiedades, leads y contactos que acá no hacen falta.

**En `NewVisitDialog` se filtra el render, no la consulta** (§3.8): la consulta sigue devolviendo todos los perfiles para los emparejamientos, y el desplegable de la línea 611 filtra por `estado !== 'eliminado'` y `role === 'asesor'`.

### 5.2 Parte B — Borrado definitivo

**Nueva acción `eliminarAsesorDefinitivamente(agentId, motivo)`** en `app/actions/asesores.ts`, junto a las existentes, reutilizando el guard `requireDirectorSobreAsesor`.

**Verificación previa — la red de seguridad.** Antes de borrar nada, se calcula la *huella de datos* del perfil: cuántas filas tiene en cada una de las 33 tablas que apuntan a `profiles`.

El criterio es **allowlist, no blocklist**: se define un conjunto chico de tablas consideradas *rastro administrativo* (subproducto de haber tenido una cuenta, no trabajo hecho). **Todo lo demás bloquea el borrado.**

| Rastro administrativo (se limpia, no bloquea) | Por qué |
|---|---|
| `equipo_acciones` (`asesor_id`, `ejecutado_por`) | auditoría de la propia gestión del perfil |
| `agency_invites.used_by` | el código de invitación que consumió |
| `notifications.user_id` | notificaciones personales |
| `google_calendar_tokens.user_id` | token de su calendario |
| `whatsapp_ai_settings.agent_id` | su configuración personal |
| `system_feedback.user_id` | feedback enviado (queda anonimizado por SET NULL) |

Cualquier fila fuera de esa lista — un lead, una propiedad, una conversación, un registro de actividad, un cierre, una visita, un contrato — **bloquea el borrado**. La ventaja del allowlist: si mañana se agrega una tabla nueva que apunta a `profiles`, bloquea por defecto en vez de ser ignorada en silencio.

**Implementación de la verificación:** función Postgres `asesor_huella_datos(p_id uuid)` (SECURITY DEFINER, `SET search_path`), que recorre `pg_constraint` dinámicamente y devuelve `(tabla, columna, filas)` sólo para las que tengan `filas > 0`. Recorrer 33 tablas desde el cliente JS serían 33 viajes; acá es uno solo, y al leer los FKs del catálogo no hay lista hardcodeada que se desactualice.

**Si hay trabajo real → se niega** con un mensaje que dice exactamente qué encontró:

> No se puede eliminar definitivamente: este asesor tiene 49 leads y 17 propiedades a su nombre. Eso no es un duplicado. Usá "Desvincular" para que conserve su historial.

**Si está limpio → borra en orden:**

1. Limpiar los rastros administrativos que bloquearían por FK (`equipo_acciones` del perfil, `agency_invites.used_by → NULL`).
2. Registrar el borrado en `equipo_acciones` **con `asesor_id = NULL`** y el email/nombre en el motivo — para que quede constancia de que ese perfil existió y fue borrado, sin FK que impida el borrado. Requiere migración: `equipo_acciones.asesor_id` pasa a nullable y `tipo_accion` acepta `'eliminacion_definitiva'`.
3. `admin.auth.admin.deleteUser(agentId)` → el perfil se va por CASCADE (§3.3).
4. Limpiar `emails_bloqueados` de ese email si existiera (para no dejar trabado un email que quizá la persona usa).

**UI:** segunda entrada en el menú ⋮ de `app/director/asesores/page.tsx`, **"Eliminar definitivamente"**, en rojo, separada de "Desvincular". Diálogo de confirmación que:
- muestra el resultado de la verificación previa (qué tiene el perfil),
- exige escribir el motivo,
- deja el botón deshabilitado si la verificación encontró trabajo real, explicando por qué.

**La acción está disponible en cualquier estado** (`activo`, `pausado` o `eliminado`). Se evaluó exigir que el perfil estuviera desvinculado primero, y se descartó: eso obligaría a pasar por `desvincularAsesor`, que **bloquea el email** (§1) — justo lo que no se quiere hacer con un duplicado. La protección real no es el estado previo sino la verificación de datos, que no se puede saltear.

### 5.3 Parte C — Etiqueta "Ex-asesor"

Donde un registro viejo sigue mostrando el nombre de un desvinculado (detalle de un lead, listados de leads), se agrega una etiqueta gris `Ex-asesor` al lado del nombre. Alcance chico y contenido: sólo lectura, sin cambios de lógica.

## 6. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Borrar por error a un asesor real y destruir `performance_logs` vía CASCADE | Verificación previa con allowlist (§5.2): cualquier dato de trabajo bloquea. Doble candado: la base misma rechaza por FK en 17 tablas |
| La página de Asesores pierde los eliminados que muestra a propósito | Parámetro explícito `incluirDesvinculados` (§5.1) |
| Los totales del dashboard se mueven al filtrar | No aplica: verificado en §3.5, salen de `performance_logs` por agencia |
| El ex-asesor reaparece por el filtro de Tracking | Cruce contra la lista vigente (§5.1) |
| Una tabla nueva a futuro queda fuera de la verificación | La verificación es allowlist y lee los FKs del catálogo: lo nuevo bloquea por defecto (§5.2) |

## 7. Fuera de alcance

- **Filtro de asesor de WhatsApp** (`ConversationsList.tsx:258`): sale de los emails de las conversaciones, no de `profiles`. Un ex-asesor con chats asignados seguiría apareciendo ahí. Arreglarlo implica decidir qué hacer con las conversaciones huérfanas (reasignarlas a quién), que es un problema aparte. **Queda anotado como pendiente.**
- Detección automática de duplicados (§4.6).
- Reasignación masiva de leads/propiedades de un ex-asesor a otro.
- Cambios en el comportamiento de pausa.

## 8. Verificación

1. `npm run build` sin errores nuevos.
2. Con el duplicado de Lorena presente: confirmar que **no** aparece en ranking, objetivos, ni en los 8 desplegables de §3.4, y que **sí** aparece en la página de Asesores con el filtro "Eliminados".
3. Confirmar que los KPIs de la agencia (facturación, cierres) **no cambian** antes y después del filtrado.
4. Probar "Eliminar definitivamente" contra el perfil **bueno** de Lorena (el que tiene los leads): debe **negarse** con el mensaje de §5.2.
5. Probar contra el duplicado: debe permitir, y tras borrar, verificar por Management API que la fila de `profiles` y el usuario de `auth.users` ya no existen, y que los leads del perfil bueno siguen igual que antes del borrado.
6. Ejecutar el borrado del duplicado de Lorena en producción y reportar el detalle exacto de qué se borró.
