# DOCUMENTO TÉCNICO — SISTEMA PRISMA

> **Audiencia:** equipo de desarrollo, DevOps e integradores.
> **Fecha:** Junio 2026
> **Base:** análisis directo del código fuente (`app/`, `lib/`, `components/`, `supabase/`, `roomix-sync/`). Complementa a `LOGICA-PRISMA.md` (lógica funcional detallada de cada endpoint).
> **Naturaleza:** documento de arquitectura e ingeniería. No describe procedimientos de uso (ver los documentos funcionales `FUNCIONAL-ASESOR-PRISMA.md` y `FUNCIONAL-DIRECTOR-PRISMA.md`).

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Stack y Dependencias](#2-stack-y-dependencias)
3. [Arquitectura General](#3-arquitectura-general)
4. [Multi-Tenancy y Modelo de Datos](#4-multi-tenancy-y-modelo-de-datos)
5. [Seguridad](#5-seguridad)
6. [Autenticación y Onboarding](#6-autenticación-y-onboarding)
7. [Capa de API (Backend)](#7-capa-de-api-backend)
8. [Integraciones Externas](#8-integraciones-externas)
9. [Subsistema WhatsApp + n8n](#9-subsistema-whatsapp--n8n)
10. [Subsistema de IA](#10-subsistema-de-ia)
11. [Roomix Crawler (Worker Docker)](#11-roomix-crawler-worker-docker)
12. [Sistema de Créditos IA y Costos](#12-sistema-de-créditos-ia-y-costos)
13. [Rate Limiting](#13-rate-limiting)
14. [Cron Jobs](#14-cron-jobs)
15. [Push Notifications](#15-push-notifications)
16. [Panel Super-Admin Vakdor](#16-panel-super-admin-vakdor)
17. [Frontend: estructura y convenciones](#17-frontend-estructura-y-convenciones)
18. [Despliegue y entornos](#18-despliegue-y-entornos)
19. [Variables de Entorno](#19-variables-de-entorno)
20. [Deuda técnica y código legacy](#20-deuda-técnica-y-código-legacy)

---

## 1. Resumen Ejecutivo

PRISMA es un **SaaS multi-tenant** para inmobiliarias argentinas. Cada inmobiliaria es un *tenant* (tabla `agencies`) aislado por **Row Level Security (RLS)** en Supabase. Tres tipos de usuario:

- **Director** — dueño/administrador de la agencia. Acceso total al tenant.
- **Asesor** — vendedor del equipo. Ve solo su información o lo compartido por la agencia.
- **Admin Vakdor** — super-administrador de la plataforma (Vakdor), con auth propio separado de Supabase.

El producto integra: CRM (Tokko Broker), WhatsApp bidireccional (Evolution API + Meta Cloud API) orquestado por **n8n** con IA conversacional, y un conjunto de módulos de IA propios (Buscador, Tutor, Marketing, Contratos, Tasaciones, Análisis de chat), más un módulo de datos de mercado real ("Pulso de Mercado").

---

## 2. Stack y Dependencias

### Core
| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 14/15 (App Router) | Framework fullstack (RSC + API Routes) |
| React | 18/19 | UI |
| TypeScript | 5+ | Tipado estático |
| Tailwind CSS | 3 | Estilos |
| shadcn/ui (Radix UI) | — | Componentes UI |
| Supabase JS | v2 (`@supabase/ssr`, `@supabase/supabase-js`) | Auth, DB, Storage, Realtime |

### IA / LLM
| Proveedor | Modelo | Wrapper | Uso |
|---|---|---|---|
| OpenAI | `gpt-4.1-mini` | `lib/openai.ts` → `openaiIA` | Buscador IA, Tutor IA (intent + respuesta) |
| Google Gemini | `gemini-2.0-flash` / `gemini-3.5-flash` | `lib/gemini.ts` → `prismaIA` | Marketing copy, Análisis de chat, Conversión de plantillas, Tasador legacy |
| Google Gemini | `gemini-embedding-001` | `lib/gemini.ts` → `generateEmbedding(text, taskType)` | Embeddings (768 dims). `RETRIEVAL_DOCUMENT` al indexar (RAG docs + propiedades); `RETRIEVAL_QUERY` para la consulta del Buscador IA (`match_properties_ia`/`match_roomix_ia`) |
| Google Gemini | Imagen / Nano Banana Pro | `lib/gemini.ts` → `generateImage()` | Generación de imágenes de marketing |

### Librerías clave
- `@google/generative-ai` — SDK Gemini.
- `mammoth` — extracción de texto de `.docx`.
- `pdf-parse-fork` — parsing de PDFs.
- `papaparse` — parsing de CSV.
- `xlsx` — lectura de Excel (parser de mercado/ICC).
- `youtube-transcript` — transcripciones de YouTube.
- `jspdf` — generación de PDFs de contratos en cliente.
- `zod` — validación de esquemas en endpoints.
- `jose` — firma/verificación de JWT del admin Vakdor.
- `@upstash/ratelimit` + `@upstash/redis` — rate limiting distribuido.
- `zustand` — estado en componentes complejos (ej. Kanban del Pipeline).
- `next-themes` — tema claro/oscuro.

---

## 3. Arquitectura General

```
┌──────────────────────────────────────────────────────────┐
│                        FRONTEND                            │
│  Next.js App Router (RSC + Client Components)              │
│  ├── /(public)/*        → Landing, login, registro, legal │
│  ├── /director/*        → Panel Director                  │
│  ├── /asesor/*          → Panel Asesor                    │
│  └── /admin-vakdor/*    → Panel Super-Admin Vakdor        │
├──────────────────────────────────────────────────────────┤
│                       MIDDLEWARE                           │
│  middleware.ts → Auth + Rate Limit + Redirect             │
├──────────────────────────────────────────────────────────┤
│                       API ROUTES                           │
│  /api/ai/*  /api/marketing-ia/*  /api/tokko/*             │
│  /api/tokko-proxy/*  /api/webhooks/*  /api/whatsapp/*     │
│  /api/n8n/*  /api/contratos/*  /api/mercado/*            │
│  /api/documents/*  /api/conversational-insights/*        │
│  /api/push/*  /api/cron/*  /api/admin-vakdor/*           │
├──────────────────────────────────────────────────────────┤
│                    SERVICIOS EXTERNOS                       │
│  Supabase · Tokko Broker · Evolution API · Meta Cloud API │
│  Google Gemini · OpenAI · n8n · Upstash Redis · Roomix    │
│  Vercel (hosting + cron) · Easypanel (worker Docker)      │
└──────────────────────────────────────────────────────────┘
```

**Patrón de ejecución:** Server Components para lectura inicial (con cliente Supabase server-side, RLS aplicada por sesión); Client Components para interactividad; API Routes para mutaciones, integraciones y operaciones privilegiadas (con `service_role` cuando hace falta bypassear RLS, p. ej. webhooks).

---

## 4. Multi-Tenancy y Modelo de Datos

### 4.1 Principio de aislamiento
Toda tabla principal tiene `agency_id`. Las políticas RLS resuelven el tenant vía:
```sql
agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
```
La obtención server-side del tenant se centraliza en `lib/auth/tenant-validation.ts` → `requireTenant()` (ver §5.3).

### 4.2 Esquema (definido en `supabase/schema.sql` + migraciones)

**Autenticación y perfiles**
- `profiles` — id, email, full_name, role (`director`/`asesor`), agency_id, phone, avatar_url, `estado` (`activo`/`pausado`/`eliminado`), `tokens_invalidos_desde`, `deleted_at`/`deleted_by`, notification_prefs (jsonb), tokko_agent_id. (El bloqueo de acceso se evalúa por `estado` + `tokens_invalidos_desde` en los guards de layout.)
- `agencies` — id, name, logo_url, tokko_api_key, invite_code, owner_id, `performance_config`, `marketing_ai_config`, `buscador_ia_config` (todas jsonb).
- `agency_invites` — agency_id, code, is_used, used_at, used_by.

**Propiedades y leads**
- `properties` — tokko_id, agency_id, assigned_agent_id, título, precio, moneda, tipo, estado, ubicación, ambientes/baños, superficies, images[], `tokko_data` (jsonb), `embedding vector(768)`, `ai_description` (jsonb: `{v1, v2, suggestion, model, v1_at, v2_at}` — descripción mejorada con IA; aislada del sync de Tokko, ver §Propiedades en la capa de API).
- `leads` — agency_id, assigned_agent_id, datos de contacto, source, status, pipeline_stage, tokko_contact_id, first_response_time, `chat_analysis` (jsonb).
- `lead_activities` — historial de actividades.
- `scheduled_visits` — agendamiento de visitas (lead, propiedad/zona, fecha/hora, calificación, score_bant, intereses, objeciones, decisores, resumen, origen, `estado_visita`: agendada/cancelada/completada, motivo_cambio).
- `visits`, `closings` — legacy/cierres.

**Tracking de performance**
- `performance_logs` — registro de actividad comercial por asesor (agency_id, agent_id, `type`: prospeccion/prelisting/prebuying/captacion/reserva/cierre, monto_operacion, comision_generada, fecha_actividad, metadata jsonb, `status`: original/modificada/eliminada). Fuente de los KPIs y del Ranking del Dashboard.
- `performance_objectives` — objetivos mensuales por asesor (agency_id, agent_id, `year`, `month` 1-12, `metric`: `facturacion`/`captacion`, `target_value` numeric, created_by). `UNIQUE (agent_id, year, month, metric)` para upsert idempotente; `metric` con `CHECK` ampliable. RLS: SELECT para toda la agencia, INSERT/UPDATE/DELETE solo `role='director'`. Lo "alcanzado" no se guarda: se deriva de `performance_logs` (facturación = Σ monto·comisión/100 sobre cierres; captación = nº de captaciones). Migración `20260615120000_create_performance_objectives.sql`.

**WhatsApp**
- `whatsapp_instances` — agency_id, token, phone_number_id, business_id, evo_instance_name, integration_type, templates_status, flows_active, status.
- `wa_conversations` — agency_id, instance_id, agent_id, contact_phone/name, status, bot_active, unread_count, last_message_at/last_inbound_at, etiquetas[], `clasificacion` (origen del lead), score, pipeline_stage, funnel_status, visit_status, follow_ups_sent, `follow_ups_history` (jsonb array), requires_follow_up, recovery_stage, next_follow_up_at, opt_out, `metricas` (jsonb).
- `wa_contacts` — agency_id, phone, name, tags[], `clasificacion` (origen del lead), metadata (incluye `email` en altas manuales), campaign_statuses (jsonb), last_campaign_status/template/sent_at. `UNIQUE (agency_id, phone)`. Es la "agenda" para campañas (solapa Contactos); separada de `wa_conversations` (los chats), sincronizada por teléfono.
- `wa_messages` — conversation_id, agency_id, content, role (`lead`/`bot`/`agent`), message_type, wamid, metadata.
- `wa_templates` — agency_id, template_name, status, components, rejection_reason, meta_template_id.
- `n8n_chat_histories` — session_id (= conversation_id), message (jsonb formato LangChain).
- `wa_campaigns` — campaña masiva por goteo (agency_id, name, template_name, template_language, variable_map jsonb, audience_clasificacion, daily_limit, `bot_active_on_reply` (bool, default true), status `active`/`paused`/`completed`, created_by). Migraciones `20260618130000_create_wa_campaigns.sql` y `20260622120000_add_bot_active_on_reply.sql`.
- `wa_campaign_recipients` — un registro por destinatario (campaign_id, agency_id, contact_id, phone, name, status `pending`/`sent`/`error`/`skipped`, sent_at, error_message). `UNIQUE (campaign_id, phone)` → idempotencia. Funciones SQL: `enroll_campaign_recipients(p_campaign_id)` (inscribe el segmento + marca `en_cola` en wa_contacts).
- **Clasificación del lead** (`clasificacion`, migración `20260618120000_add_clasificacion_leads.sql`): columna nullable en `wa_conversations` y `wa_contacts`, con índice `(agency_id, clasificacion)`. Valores: `Whatsapp-Consulta` (entrante por webhook), `Whatsapp-Manual` (alta manual en tracking/calendario vía `createManualContact`), o personalizada en la importación. NULL = "Sin clasificar" (registros previos, sin backfill). Helper único de etiquetas/colores: `lib/whatsapp/clasificacion.ts`.
- **Alta manual de contacto** (`components/shared/ManualContactFields.tsx`): componente compartido por `PerformanceLogForm` (Tracking) y `NewVisitDialog` (Calendario). Recolecta nombre/celular/email/etiqueta y reporta hacia arriba `{name, phone, email, tags, isValid}` vía `onChange` (ref para evitar loops); `phone` ya sale en **E.164 sin "+"** listo para Meta. `isValid` = nombre/celular/email reescritos coinciden (en celular se compara el E.164 normalizado, no el texto; nombre/email case-insensitive) **y** formato válido (celular vía libphonenumber, email regex) **y** casilla de certificación tildada. Los campos de verificación bloquean `onPaste`/`onDrop`.
- **Normalización telefónica** (`lib/whatsapp/phone.ts`): `normalizePhoneE164(raw, country='AR')` parsea con `libphonenumber-js` y devuelve dígitos E.164 (elimina 0 de trunk, 15 móvil; para AR fuerza el "9" si quedó sin él). `formatPhoneInternational` devuelve el preview lindo a partir del E.164. `getPhoneCountries(locale)` arma la lista de países para el selector (nombres vía `Intl.DisplayNames`, bandera emoji desde el ISO, código vía `getCountryCallingCode`; prioriza AR/UY/CL/PY/BO/MX/ES/US). El helper de campañas/import `lib/whatsapp/phone-ar.ts` (`normalizeArgPhone`) delega en este mismo `normalizePhoneE164`, así alta manual e importación comparten una sola regla de normalización. `createManualContact` recibe ahora `email` y lo persiste en `wa_contacts.metadata.email`.

**IA y documentos**
- `consultor_chat_sessions` / `consultor_chat_messages` — Buscador IA (memoria por sesión).
- `tutor_chat_sessions` / `tutor_chat_messages` — Tutor IA.
- `agency_documents` — base de conocimiento con embedding para RAG (title, type, file_url/video_url, content_text, embedding, visibility, ai_enabled, folder_id).
- `official_documents` / `official_document_folders` — Documentos Oficiales descargables (sin embedding, **NO consultados por IA**; file_url en bucket `documents` prefijo `official/`, version, file_size). La subida del director acepta **múltiples archivos a la vez** (`OfficialDocsSection.tsx`, input `multiple`): cada `title` se deriva del nombre del archivo sin extensión, todos van a la carpeta elegida, suben en serie con progreso y tolerancia a fallos.
- `ipc_profiles` — perfiles IPC de Marketing IA.
- `generated_images` — imágenes generadas.
- `roomix_properties` — cartera global pre-sincronizada por el crawler (operation, ubicación, precio, `roomix_agency_name`, canonical_url, imágenes CDN).

**Contratos**
- `contract_templates` — plantillas (+ `codigo_unico`, `archivo_original_url`, `is_system_default`).
- `contratos` — contratos generados (template_id, tipo, form_data jsonb, estado, `codigo_unico`, `estado_gestion`: original/modificado/eliminado, `motivo_gestion`, created_by, pdf_url).
- `contract_signatures` — firmas (conservada; flujo vigente usa firma presencial).

**Mercado**
- `mercado_icc` (1 fila id=1), `mercado_zonas` (histórico por zona+mes), `mercado_barrios`, `mercado_escrituras` (PK periodo), `mercado_stats`.

**Analytics / Admin / Push**
- `dashboard_conversational_insights` — cache de analytics agregado.
- `admin_vakdor_users`, `audit_logs`, `ai_credit_transactions`, `push_subscriptions`.

### 4.3 Funciones RPC (PostgreSQL / Supabase)
| Función | Uso |
|---|---|
| `match_properties(query_embedding, threshold, count, p_agency_id)` | Búsqueda vectorial de propiedades (existe; no usada por el Buscador actual) |
| `match_agency_documents(query_embedding, threshold, count, p_agency_id, p_user_role)` | RAG de documentos (Tutor IA), filtra por visibilidad |
| `consume_ai_credits(p_agency_id, p_user_id, p_feature, p_amount, p_summary)` | Reserva créditos, retorna txId |
| `update_ai_transaction_cost(p_transaction_id, p_input_tokens, p_output_tokens, p_usd_cost)` | Registra costo real post-generación |

---

## 5. Seguridad

### 5.1 Middleware (`middleware.ts`)
Intercepta todas las requests:
1. **Rate limiting global** (Upstash en prod / memoria en dev): login 10 req/15 min por IP; IA 30 req/min por IP.
2. **Protección de rutas:** públicas excluidas (`/`, `/auth/*`, `/api/webhooks/*`, `/api/n8n/*`, `/api/cron/*`, `/api/messages/*`, `/api/whatsapp/dispatch`); el resto bajo `/director/*` y `/asesor/*` requiere sesión.
3. **Refresh de sesión** Supabase en cada request.
4. **Redirección inteligente:** autenticado en `/auth/*` → su dashboard; no autenticado en ruta protegida → `/auth/login`.

### 5.2 Headers (`next.config.mjs`)
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva, **CSP con whitelist explícita**. Imágenes remotas autorizadas: `static.tokkobroker.com`, `*.supabase.co`, `images.unsplash.com`, `cdn.roomix.ai`.

### 5.3 Tenant isolation (`lib/auth/tenant-validation.ts`)
`requireTenant()`: obtiene usuario (`auth.getUser()`), busca su `profiles` → `{ userId, agencyId, role }`. Si falta `agency_id`, lanza error "Tenant isolation failure". Se ejecuta en cada endpoint protegido.

### 5.4 Tres clientes Supabase
| Cliente | Archivo | Permisos |
|---|---|---|
| Browser | `lib/supabase/client.ts` | `anon_key` (RLS aplica) |
| Server | `lib/supabase/server.ts` | `anon_key` + cookies (RLS por sesión) |
| Admin | `lib/supabase/admin.ts` | `service_role_key` (bypass RLS) |

El cliente Admin se usa solo en operaciones privilegiadas controladas: inserciones desde webhooks, sync masivo de Tokko, escritura de datos de mercado, persistencia de PDFs/originales de contratos.

### 5.5 Audit logging
`logSecurityAlert(action, details)` → tabla `audit_logs`. El admin Vakdor registra su actividad vía `logAdminActivity()` (`lib/admin-vakdor/logger.ts`).

---

## 6. Autenticación y Onboarding

**Archivos:** `lib/actions/auth.ts`, `app/auth/callback/route.ts`.

- **Registro Director:** `signUp` con metadata `{ role:'director', agency_name, full_name }` → email de confirmación → callback `exchangeCodeForSession` → crea `profiles` + `agencies` (con `invite_code` de 6 chars, usando adminClient) + `agency_invites` → redirige a `/director/dashboard`.
- **Registro Asesor:** `signUp` con `{ role:'asesor', invite_code }` → callback busca `agency_invites` por código, asocia a la agencia, marca invite usado → `/asesor/dashboard`.
- **Login:** rate limit → `signInWithPassword` → redirige según rol. El bloqueo por cuenta (`estado` `pausado`/`eliminado`) lo aplican los **guards de layout** (`app/(director|asesor)/layout.tsx`), que fuerzan logout; un asesor desvinculado por el director (server action `desvincularAsesor`) queda con `estado='eliminado'` + `tokens_invalidos_desde` + email en `emails_bloqueados`.
- **Google OAuth:** `signInWithOAuth` con state (`role`, `inviteCode`, `agencyName`) → mismo callback.
- **Guards de layout:** los layouts `(director)`/`(asesor)` revalidan sesión, estado de cuenta/agencia y coincidencia rol↔ruta. Endpoint de apoyo: `GET /api/auth/check-status`.

---

## 7. Capa de API (Backend)

Patrón estándar de un endpoint protegido:
1. `requireTenant()` (auth + tenant) **o** auth por secret (webhooks/cron/dispatch).
2. Rate limit cuando aplica.
3. (IA) `consumeAiCredits(feature, amount, summary)` → txId.
4. Lógica + llamada a servicio externo.
5. (IA) `updateAiTransactionCost(txId, inTok, outTok, usd)`.
6. Persistencia (cliente con o sin RLS según contexto) + respuesta.

### Mapa de API Routes (verificado contra `app/api/**/route.ts`)

**IA**
- `POST/GET/PATCH/DELETE /api/ai/consultor` — Buscador IA + gestión de sesiones.
- `GET/POST /api/ai/consultor/settings` — notas/directivas del director (POST solo director).
- `POST/GET/PATCH/DELETE /api/ai/tutor` — Tutor IA (RAG).
- `POST /api/ai/analyze-chat` — análisis de chat pegado.

**Marketing IA**
- `POST /api/marketing-ia/generate-batch`, `/generate-image` (flujo vigente). `POST /api/marketing-ia/generate-copy` existe pero está **sin uso en la UI** (legacy, ver §20).
- `GET/POST /api/marketing-ia/settings` (POST solo director), `POST /api/marketing-ia/settings/upload-logo`.
- `GET /api/marketing-ia/tokko-search`.

**Propiedades**
- `POST /api/propiedades/[id]/ai-description` — genera la **descripción mejorada con IA** de una propiedad. Body `{ version: 1|2, suggestion?: string }`. Valida agencia (`requireTenant` + chequeo `property.agency_id`), consume 1 crédito (`consumeAiCredits("propiedades_descripcion")`), llama a `prismaIA` (`gemini-3.5-flash`), registra costo real por tokens (`updateAiTransactionCost`) y guarda en `properties.ai_description` (jsonb) con `createAdminClient()` (el asesor no tiene UPDATE por RLS). **Tope estricto:** rechaza (409) si la versión pedida ya existe o si se pide V2 sin V1. La V2 reescribe la V1 aplicando `suggestion`. No toca `properties.description` (la de Tokko). Componente UI: `components/propiedades/AiDescription.tsx`, embebido en las fichas de asesor y director.

**Tokko**
- `POST /api/tokko/sync` (propiedades), `POST /api/tokko/sync-leads`, `GET /api/tokko-proxy/[...path]`.

**WhatsApp / n8n / mensajes**
- `GET/POST /api/webhooks/evolution`, `GET/POST /api/webhooks/meta`.
- `POST /api/n8n/reply`, `POST /api/messages/bot-reply` (legacy).
- `POST /api/whatsapp/dispatch` (templates), `POST /api/whatsapp/ai-settings/knowledge-upload`.

**Contratos**
- `GET/POST /api/contratos`, `GET/PUT/DELETE /api/contratos/[id]`, `POST /api/contratos/[id]/pdf`, `GET/POST /api/contratos/[id]/signatures`.
- `POST /api/contratos/convert-template`, `POST /api/contratos/generate-pdf`.
- `GET/POST /api/contract-templates`, `PUT/DELETE /api/contract-templates/[id]`, `PATCH /api/contract-templates/[id]/activate`.

**Mercado**
- `GET /api/mercado/sync?source=...`, `GET /api/mercado/zonaprop`, `GET /api/mercado/refresh`.

**Documentos / Analytics / Créditos / Push / Cron**
- `POST /api/documents/process`, `POST /api/documents/extract`.
- `POST /api/conversational-insights/analyze`, `GET /api/conversational-insights/status`.
- `GET /api/asesor/creditos`, `GET /api/auth/check-status`.
- `POST/DELETE /api/push/subscribe`.
- `GET /api/cron/sync-templates`.

**Admin Vakdor** — ver §16.

> **Debug:** `GET /api/debug/env-check` y `GET /api/debug/rls-check` existen para diagnóstico; revisar su exposición en producción.

---

## 8. Integraciones Externas

### 8.1 Tokko Broker (CRM)
- **Sync propiedades** (`/api/tokko/sync`): paginado `GET tokkobroker.com/api/v1/property/?key=...&limit=100&offset=n`; mapeo de campos + imágenes + agente (`profiles.tokko_agent_id`); upsert masivo con adminClient (`onConflict: tokko_id,agency_id`); luego genera/actualiza embeddings (`lib/tokko-sync.ts` → `syncPropertyEmbeddings`) solo de propiedades **nuevas o modificadas** (Gemini `gemini-embedding-001`, best-effort, no corta el sync, tope 100/corrida). Rate limit 1 req/5 min por agencia.
  - **Superficies** (`lib/tokko-shared.ts` → `pickSurfaces`): `covered_area` = `roofed_surface` (la techada real; NO usar `surface`, que suele ser el lote); `total_area` = `total_surface` → `surface` → `roofed_surface` (primer valor > 0). Los campos de superficie de Tokko vienen inconsistentes según quién cargó la propiedad.
  - **Sanitización** (`stripTokkoSensitive`): se elimina `internal_data` (datos del propietario, comisiones, ubicación de llaves) del `tokko_data` antes de guardarlo, porque el detalle de propiedad sirve `tokko_data` completo al navegador.
- **Sync leads** (`/api/tokko/sync-leads`): `GET .../contact/?...&limit=50&order_by=-created_at` (más nuevos primero), delay 350 ms entre páginas, tope 1000; upsert en `leads`.
  - El endpoint `/contact/` devuelve **solo 20 campos** (no trae propiedad consultada ni origen como campos sueltos). El **origen** real, la operación y el tipo viven en `tags` (`{name, group_name}`); se extraen con `deriveLeadOrigin`/`findTagByGroup` de forma flexible por agencia (grupo `~origen`, o nombre de canal conocido como "Web"/"Zonaprop").
  - **Asignación automática**: el lead se asigna al asesor de PRISMA cuyo email coincida con `agent.email` de Tokko (`buildAgentEmailMap`). Si el director elige un asesor manual, ese gana.
  - `deleted_at` en `/contact/` **NO es borrado**: es la fecha de **última actualización** (viene en el 100% de los contactos). NO filtrar por él. Se muestra como "Última Actualización" en el detalle del lead.
- **Proxy** (`/api/tokko-proxy/[...path]`): inyecta el `tokko_api_key` de la agencia y reenvía a Tokko.
- **Sync automático** (cron): `GET /api/cron/tokko-sync` (protegido por `CRON_SECRET`) recorre **todas** las agencias con `tokko_api_key` y corre propiedades + leads. Lo dispara `.github/workflows/tokko-sync.yml` **2×/día** (`10:00` y `21:00` UTC = 7am y 6pm Argentina). Así los asesores ven los cambios sin que el director sincronice a mano.
- Toda la lógica de mapeo/upsert vive en **`lib/tokko-sync.ts`** (`runPropertiesSync` / `runLeadsSync`), compartida entre los endpoints manuales y el cron — una sola fuente de verdad.
- La API key es **por agencia** (columna `agencies.tokko_api_key`); `TOKKO_API_KEY` global es solo fallback.
- **Configuraciones distintas por agencia**: algunas inmobiliarias toman a cada asesor como una *sucursal* (`branch.name` = `producer.name` = asesor). La asignación de propiedades sigue siendo por email del `producer`; la de leads por email del `agent`. Si el asesor no está registrado en PRISMA con su email real de Tokko, su propiedad/lead queda sin asignar (esperado).

### 8.2 Pulso de Mercado (datos reales)
`app/api/mercado/sync/route.ts`, sync **por fuente** (`?source=`) para mantener cada request < 10 s (límite Vercel Hobby):
- `icc` → `mercado_icc` (XLSX de estadisticaciudad.gob.ar, parser `xlsx`).
- `zonaprop&zona=...` → `mercado_zonas` (PDFs zpindex, parser `pdf-parse-fork`, histórico por zona+mes).
- `mudafy` → `mercado_barrios` (tabla HTML, precio m² oferta).
- `escrituras` → `mercado_escrituras` (Colegio de Escribanos CABA, histórico por periodo).

**Principios:** cero datos inventados (sin dato → `null` y UI "Sin datos"); único real-time es el dólar (`dolarapi.com`); escritura con `service_role`; fuente que falla nunca pisa lo existente. Lectura cacheada con `revalidateTag('mercado')`.

---

## 9. Subsistema WhatsApp + n8n

PRISMA soporta **dos integraciones simultáneas**: Evolution API (preferida) y Meta Cloud API (fallback).

### 9.1 Flujo entrante
```
Lead → Evolution/Meta → webhook PRISMA → identifica instancia (agency_id)
   → dedup por wamid (si ya existe el mensaje, se ignora)
   → crea/actualiza wa_conversations → guarda wa_messages (role:'lead')
   → si bot_active: arma enrichedPayload (últimos 10 msgs + etiquetas + score)
        → triggerN8nWithSafetyNet → POST N8N_WEBHOOK_URL (3 intentos, timeout 15s c/u)
             → si fallan todos: guarda en wa_n8n_dead_letter (NO se pierde el lead)
   → si bot OFF: guarda en n8n_chat_histories (contexto para reactivación)
```
- `POST /api/webhooks/evolution` — identifica por `evo_instance_name`.
- `GET/POST /api/webhooks/meta` — verificación GET por `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; POST maneja `message_template_status_update` y `messages` (text/image/interactive), identifica por `phone_number_id`.
- Ambos webhooks: `export const maxDuration = 60` (para que Vercel no mate la función antes de terminar los reintentos a n8n).
- **Dedup por `wamid`:** antes de procesar, se consulta `wa_messages` por `wamid`; si existe, se ignora (Meta/Evolution pueden reentregar el mismo mensaje sin duplicar ni re-disparar n8n).

### 9.1.1 Disparo robusto a n8n + red de contención (anti "lead perdido")
- **Helper `lib/whatsapp/n8nTrigger.ts`:** reemplaza el viejo `fetch(...).catch(()=>log)` que tragaba los fallos. `callN8n(payload)` reintenta hasta **3 veces** (backoff 500/1000 ms, timeout 15 s por intento) y devuelve `{ok, attempts, error}`. `triggerN8nWithSafetyNet(supabase, payload, ctx)` envuelve a `callN8n` y, si agota los intentos, **persiste el disparo en `wa_n8n_dead_letter`** (`status='pending'`) para reproceso. n8n responde el webhook al instante (ACK) y devuelve la respuesta de la IA async vía `/api/n8n/reply`, por lo que un timeout = "no llegó", no "está procesando" → reintentar es seguro.
- **Tabla `wa_n8n_dead_letter`** (migración `20260624120000_wa_n8n_dead_letter.sql`): `conversation_id, agency_id, message_id, contact_phone, source('meta'|'evolution'|'manual'), payload(jsonb), attempts, last_error, status('pending'|'reprocessed'|'failed'), timestamps`. RLS ON sin policies (solo `service_role`). Índice parcial sobre `(status, created_at) WHERE status='pending'`.
- **Reproceso `POST /api/n8n/retry-pending`** (auth `N8N_REPLY_SECRET` por header `x-retry-secret` o `?secret=`; `?limit=1..100`, default 25): drena la cola, re-dispara con `callN8n`; éxito → `status='reprocessed'`; sigue fallando → suma `attempts` y guarda `last_error`. Pensado para correr manual o por cron (GitHub Action).
- **Origen:** caso real Ivana Marti (23/06/2026): el disparo único falló transitoriamente, el `.catch` lo tragó y el lead quedó sin respuesta y sin rastro en n8n. Esta arquitectura lo vuelve recuperable.

### 9.2 Flujo de respuesta (`POST /api/n8n/reply`)
Auth por `N8N_REPLY_SECRET`. Verifica anti-cruce de instancias; si el bot fue pausado, descarta. Normaliza `media_type`; calcula delay de tipeo (~40 ms/char, 800–4000 ms); envía vía Evolution (`sendText`/`sendMedia`) o Meta (`graph.facebook.com/v20.0/{phone_number_id}/messages`); persiste `wa_messages` (role `bot`); actualiza conversación; **broadcast Realtime** al canal `agency-{id}` (evento `refresh-whatsapp`).

### 9.3 Templates de seguimiento (`POST /api/whatsapp/dispatch`)
Auth por `DISPATCH_SECRET`. Prefijo por agencia `ag{agency_id[0:6]}_`. 8 templates: `seg_f1_seguimiento`, `seg_f2_valor`, `seg_f3_breakup`, `visita_recordatorio_24h/3h/1h`, `visita_post_noshow`, `reactivacion_snoozed`. Persiste en `wa_messages` + `n8n_chat_histories` + registra en `follow_ups_history` (con snapshot del estado). Broadcast Realtime.

### 9.4 Cron de aprobación de templates
`GET /api/cron/sync-templates` (diario, `CRON_SECRET`): consulta Meta Graph API por estado de los 8 templates; cuando los 8 están `APPROVED` marca `templates_status='approved'` y `flows_active=true`.

### 9.5 `n8n_chat_histories`
Formato LangChain: `session_id` = conversation_id; `message` = `{ type:'human'|'ai', content, additional_kwargs, response_metadata, tool_calls, invalid_tool_calls }`.

### 9.6 Gestión de leads y agenda (Leads WhatsApp ↔ Contactos)
- **Dos tablas, sincronizadas por teléfono:** `wa_conversations` (chats; alimenta "Leads WhatsApp" y la bandeja) y `wa_contacts` (agenda; alimenta la solapa "Contactos" y las campañas).
- **Editar/Eliminar lead** (`app/actions/whatsapp.ts`): `updateConversationDetails(id, {contact_name, contact_phone, etiquetas, clasificacion})` actualiza la conversación y replica los campos al contacto por teléfono (best-effort). `deleteConversation(id)` borra la conversación (CASCADE en `wa_messages`), limpia `n8n_chat_histories` por `session_id`, y elimina el contacto en `wa_contacts` solo si ninguna otra conversación comparte ese teléfono.
- **Agenda de Contactos:** `importContacts(contacts, clasificacion?)` deduplica por teléfono dentro del archivo y descarta los que ya existen en la agencia (insert, no upsert) → devuelve `{inserted, skipped}`. `deleteContact(id)` borra solo de `wa_contacts` (no toca chats).
- **Clasificación automática:** webhooks Evolution/Meta marcan `Whatsapp-Consulta` al crear conversación y contacto; `createManualContact` marca `Whatsapp-Manual`; el import aplica la clasificación del lote (o "Importado"). `sendCampaignMessage`, al crear la conversación de un contacto, hereda su `clasificacion`.
- **UI:** badge de color (helper `getClasificacionStyle`) con filtro por clasificación en "Leads WhatsApp", "Contactos" y la bandeja (`ConversationsList`).

### 9.7 Campañas masivas por goteo diario (drip)
- **Modelo:** `wa_campaigns` (definición) + `wa_campaign_recipients` (cola por destinatario). Al crear (`createSegmentCampaign` en `app/actions/whatsapp-campaigns.ts`) la campaña queda **`paused`** (no envía hasta lanzarla), se inscribe todo el segmento de la clasificación vía la función SQL `enroll_campaign_recipients` (INSERT...SELECT eficiente para 15k+) y se marca `en_cola` en `wa_contacts.campaign_statuses[plantilla]`.
- **Lógica de envío compartida:** `lib/whatsapp/campaign-sender.ts → processCampaign(campaign, supabaseAdmin, maxToSend)`. La usan el cron y el botón "Lanzar ahora". Valida token, lee el **límite real de Meta**, calcula cupo = `límite − enviados_últimas_24h`, envía hasta `maxToSend` pendientes por Meta Cloud API, marca `sent`/`error` (idempotente: no reenvía), crea la conversación (heredando clasificación) y refleja el estado en `wa_contacts.campaign_statuses`. Al agotar pendientes → `completed`. Token vencido → no quema la cola.
- **Bot IA prendido/apagado por campaña:** al crear, el director elige `bot_active_on_reply` (default `true`). El chat **nuevo** que crea la campaña nace con `wa_conversations.bot_active = campaign.bot_active_on_reply ?? true` (en `processCampaign` y en `sendCampaignMessage` del envío manual puntual). Si el chat **ya existía**, no se toca su `bot_active` (no se pisa la config manual del asesor). Caso de uso: campañas de reclutamiento u otros no-clientes → bot apagado para que la IA no responda. El webhook (`/api/webhooks/meta`) ya respeta `bot_active`: si está OFF guarda el mensaje del lead en `n8n_chat_histories` y no dispara n8n.
- **Lanzar ahora (desde el sistema):** `POST /api/campaigns/launch` (auth de director por sesión, `maxDuration=120`) activa la campaña y envía un **primer lote inmediato** (`IMMEDIATE_BATCH=50`); el resto sigue por el cron. El director no necesita GitHub.
- **Motor automático (cron):** `GET /api/cron/campaigns` (auth `CRON_SECRET`, `maxDuration=300`, `MAX_PER_RUN=400`) procesa todas las campañas `active` con `processCampaign`. Programado por GitHub Action `.github/workflows/campaigns-drip.yml` (cada hora, gratis; el conteo rolling de 24h respeta el límite). Techo práctico ~9.600/día (400×24); tiers más altos requieren worker dedicado.
- **Acciones:** `getCampaignsWithStats`, `setCampaignStatus` (pausar), `deleteCampaign`. UI: `ScheduledCampaignManager` dentro de `CampaignsTab` (botón **Lanzar ahora**).

### 9.8 Límite de Meta y token permanente
- **Límite real:** Meta ya **no** expone `messaging_limit_tier` en el número; está en la **WABA**: `GET /{business_id}?fields=whatsapp_business_manager_messaging_limit` → tier (ej. `TIER_2K`=2000). Se lee y persiste en `whatsapp_instances.messaging_limit_tier` (parser robusto `TIER_2K/10K/100K/UNLIMITED`). Lo usan el cron y la UI.
- **Token:** `validateMetaToken` / `updateMetaToken` (`app/actions/whatsapp.ts`) + UI `MetaTokenManager` (Configuración → Costos Meta): valida contra Meta y permite pegar el token permanente (System User) sin reconectar.

### 9.9 Importación de contactos (bases grandes + teléfonos AR)
- `ContactsTab`: carga **paginada** (de a 1000) para soportar 15k+, tabla con **paginación de 100/página**. Importación con **dedupe por teléfono** (intra-archivo y contra la base; `importContacts` hace `insert`, no upsert) + clasificación de lote.
- **Detección de columnas flexible:** teléfono por nombre (regex `tel|cel|phone|whats|movil|numero|contacto`, incluye `csTelefono1/2`) o por heurística de valor; **nombre opcional**. Soporta varias columnas de teléfono (toma el primer válido por fila).
- **Normalización AR:** `lib/whatsapp/phone-ar.ts` (`normalizeArgPhone`) **delega en `normalizePhoneE164(raw,"AR")`** de `lib/whatsapp/phone.ts` (fuente única compartida con el alta manual de contactos): convierte cualquier formato (con/sin +, 0 de trunk, 15 de móvil, áreas 11/221/2227…) al formato WhatsApp y **fuerza el "9" móvil** aunque se cargue el celular sin el 15. Mantiene un fallback de último recurso para planillas sucias.

---

## 10. Subsistema de IA

### 10.1 Buscador IA (`/api/ai/consultor`, GPT-4.1-mini)
Asistente de búsqueda con **memoria por chat**. Flujo vigente (rediseño jun-2026):
1. `requireTenant()` + `consumeAiCredits('consultor_ia', 1)`.
2. Lee `agencies.buscador_ia_config` (notas/directivas del director) + nombre de agencia.
3. Sesión `consultor_chat_sessions/_messages`; últimos 12 turnos alimentan intención y respuesta.
4. **Intent con memoria** → criterios acumulados (operation, type, location, amenities/servicios, agency, price_max/min, currency, **rooms = ambientes**, **bedrooms = dormitorios**, bathrooms). Distingue "2 ambientes"→`rooms` de "2 dormitorios"→`bedrooms` (la columna `bedrooms` = `suite_amount` = dormitorios). Red de seguridad: si el mensaje dice "ambientes" pero el modelo lo metió en `bedrooms`, se corrige a `rooms`.
5. Búsqueda con **estrategia "Cartera_Propiedades" (paridad con el agente n8n)**: 2 funciones SQL — `match_properties_ia` (cartera propia/agencia; 2 llamadas, include/exclude agente) y `match_roomix_ia` (red de colaboración, sobre las ~54k **sin** el viejo límite de 400). Cada una hace, dentro de SQL: **filtro duro** (operación, tipo, **ambientes ±1**, presupuesto ×1.20 con moneda, zona) + **ranking vectorial** (embedding Gemini `RETRIEVAL_QUERY`; patrón *vector-search-then-rerank* con índices **HNSW** `idx_properties_embedding_hnsw` / `idx_roomix_embedding_hnsw`, `hnsw.iterative_scan=relaxed_order`) y devuelve `match_pct`.
6. **% de coincidencia (`match_pct`):** se calcula con criterios concretos = ambientes 35 (exacto=full, ±1=mitad) + amenities 35 (cobertura). El **precio NO entra al puntaje** (lo decide el cliente). La **semántica solo ordena** dentro de cada escalón (incluirla en el % lo saturaba a ~100 porque las propiedades parecidas tienen similitud altísima). Si no se pide ningún criterio concreto → `match_pct` null y se ordena puro por embedding.
7. Re-trae filas completas por id (preserva join de perfil) y combina cartera interna (Tokko) + red de colaboración (`roomix_properties`). Render en `consultor-results.tsx` (3 secciones + **badge de % por tarjeta**). Enlaces: internas → `tokko_data.public_url`; Roomix → `canonical_url`. `updateAiTransactionCost()`.

> **Ambas tablas usan embeddings** (`embedding vector(768)`: 580/580 en properties y 54.566/54.566 en roomix) vía las funciones SQL `match_properties_ia` / `match_roomix_ia` (rama `fix/buscador-ia-logica-n8n`, jun-2026). Sustituyó al viejo flujo de filtro-en-memoria sobre 400 filas, que confundía ambientes con dormitorios y no filtraba amenities (causaba "pedí 2 amb + terraza, devolvía 3 amb + balcón").

**Frontend / responsive (jun-2026):** `app/{asesor/consultor-ia,director/consultor}/page.tsx` comparten layout. El historial (`<aside>`) es **columna fija que empuja** en `md+` (`md:w-80`↔`md:w-0`) y **cajón superpuesto** en `<md` (`max-md:fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs` + `translate-x`), con backdrop `md:hidden` para cerrar. `isSidebarOpen` arranca `false` y un `useEffect` lo abre solo si `innerWidth>=768`; `closeSidebarOnMobile()` lo cierra al abrir/crear sesión en móvil. Tarjetas (`consultor-results.tsx`): flechas del carrusel visibles en touch (`opacity-100 md:opacity-0 md:group-hover:opacity-100`).

### 10.2 Tutor IA (`/api/ai/tutor`, GPT-4.1-mini)
Mentor con **RAG** sobre `agency_documents`. Intent RETRIEVAL/GENERAL; si RETRIEVAL → `generateEmbedding()` + `match_agency_documents(threshold 0.15, count 5, p_user_role)`. Resume el tópico de la sesión cada 4 mensajes.

### 10.3 Análisis de chat (`/api/ai/analyze-chat`, Gemini 2.0 Flash)
Rate limit 30 req/h por usuario; validación Zod (10–50000 chars); `parseWhatsAppChat()`; output JSON comercial (lead_name, phone, search_intent, response_time_eval, lead_attitude, commercial_process_eval, summary, next_step).

### 10.4 Marketing IA
- **Flujo vigente — "Crear Anuncio" (`copy-generator-flow.tsx`):** es un **multi-generador todo-en-uno**. El usuario elige IPC + tipo de copy (`video` | `post`) + formato de imagen (`reels`/`post`/`historia`) + estilo, y un único botón orquesta desde el cliente: `POST /generate-batch` (3 copies) → inserta 3 `copy_drafts` → `POST /generate-image` **×3** (una por draft). No hay UI de "copy simple" ni de imagen suelta.
- **Costo real por "Generar 3 Variantes":** `generate-batch` consume **1** crédito + `generate-image` consume **2** créditos **por imagen** (×3) = **~7 créditos**. ⚠️ El texto al pie del componente ("Cada generación consume 1 crédito IA") solo refleja el batch de textos, no el total — discrepancia de UI a corregir.
- **Batch** (`/generate-batch`, Gemini 3.5 Flash): 3 variaciones (PAS, Transformación, Autoridad/Datos) en una llamada. Usa IPC + `creative_directive`. Regla explícita: **no inventa ni menciona** propiedades/precios/m² concretos. El `propiedad_tokko_id` del IPC "vender" se puede traer de Tokko pero **no se usa en el copy** (función reservada a futuro).
- **Copy individual** (`/generate-copy`, Gemini 3.5 Flash): genera 1 copy (post/historia: hook/desarrollo/cta; video: hook/problema/agitación/solución/cta). **Endpoint legacy: ningún componente lo invoca** (ver §20). El flujo actual usa solo `generate-batch`.
- **Imagen** (`/generate-image`, Gemini 3 Pro Image / Nano Banana Pro): integra branding (`marketing_ai_config`: colores, logo de referencia, tipografía, posición/tamaño de logo), `creative_directive` y `legal_notice` (franja inferior). Sube a Storage `marketing-images` + `generated_images`.
- **Settings** (`/settings`, POST solo director): branding (hasta 3 colores, logo + posición + tamaño, tipografía) + directiva creativa (≤1000) + aviso legal (≤300). UI en la pestaña "Configuración IA" (solo director; el asesor no la ve). Galería/edición/borrado de anuncios en `marketing-history.tsx` (pestaña Historial). Pestaña "Guía Mágica" (`ad-guide.tsx`): contenido estático de buenas prácticas de Meta Ads, sin backend.

### 10.5 Contratos IA
- **Conversión documento→plantilla** (`/convert-template`, Gemini 3.5 Flash): `.docx`/`.pdf` ≤ 25 MB; sube original a bucket `contratos`; reemplaza datos por placeholders `{{PREFIJO_CAMPO}}`; 1 crédito.
- **CRUD** con visibilidad por rol (director ve todo el equipo incl. eliminados; asesor solo lo suyo, sin eliminados). Soft-delete (`estado_gestion='eliminado'` + motivo). `codigo_unico` compartido plantilla↔contrato.
- **PDF** en cliente (jsPDF, `lib/contratos/`), subido a Storage (`{agency}/generados/{id}.pdf`, path estable + cache-busting). **Firma presencial** (papel); `contract_signatures` conservada pero no alimentada.

### 10.6 Tasaciones IA
**Vivo:** Wizard MCM **client-side** (4 pasos, `lib/tasacion/calculos.ts`), persiste en `tasaciones`. **Legacy:** `/api/valuation/generate` + tabla `valuations` (Gemini) — sin uso confirmado en frontend (ver §20).

### 10.7 Conversational Insights (`/api/conversational-insights/analyze`)
Analytics **sin IA** (agregación pura), solo director. Lee `wa_conversations.metricas` + `wa_messages`; cache en `dashboard_conversational_insights` (refresh > 6 h). Bloques: KPIs, funnel, perfil del lead, demanda, comportamiento temporal, calidad de atención.

### 10.8 Documentos / base de conocimiento
`/api/documents/process`: extracción por tipo → `generateEmbedding(texto[:5000])` → `agency_documents` (con `visibility` director/asesor). El backend soporta PDF/imagen (Gemini), DOCX (mammoth), CSV (papaparse) y YouTube (transcript), pero el **uploader de la UI solo acepta `.pdf/.doc/.docx/.csv` + YouTube** (no permite seleccionar imágenes). Para docs `director` (privados) hay un flag `ai_enabled` que habilita su consulta por Tutor IA sin exponer el archivo. Subida directa a Storage `documents` (evita el límite de 4.5 MB de Vercel).

**Documentos Oficiales descargables** (solapa aparte, **NO consultada por IA**): tablas propias `official_documents` + `official_document_folders`, aisladas del RAG (`match_agency_documents` solo lee `agency_documents`). Sin embeddings ni extracción: el cliente sube directo a Storage (bucket `documents`, prefijo `official/{agencyId}/`) e inserta la fila — no consume créditos IA. Componente compartido `components/documentos/OfficialDocsSection.tsx` (prop `readOnly`): director gestiona (crear/subir/reemplazar versión/mover/eliminar/descargar), asesor solo lee y descarga. RLS: ver = miembro de la agencia, gestionar = solo `director`. Reemplazo de versión = sube archivo nuevo, `version+1`, borra el anterior del storage.

---

## 11. Roomix Crawler (Worker Docker)

Carpeta `roomix-sync/`. Alimenta diariamente `roomix_properties` (red de colaboración del Buscador IA).
- **Tecnología:** Playwright en modo *stealth* (bypass anti-bot); extrae JSON-LD de fichas de Roomix.
- **Producción:** contenedor Docker en **Easypanel**; `node-cron` dispara a las **03:00 AM**; `child_process.spawn` aísla el proceso para evitar fugas de memoria de Chromium.
- **Health check:** mini servidor HTTP nativo en puerto 80 (`cron.js`, `CMD ["node","cron.js"]`) para satisfacer Easypanel y evitar SIGTERM.
- **Control de Concurrencia:** El schedule de `cron.js` cuenta con un sistema de lock (`isRunning`) para evitar la ejecución de instancias paralelas si el procesamiento se extiende al día siguiente.
- **Descarga de Sitemaps:** Evita bloqueos por challenges de Cloudflare ejecutando un `fetch` nativo *dentro* de la instancia del navegador (`page.evaluate`), heredando el fingerprint TLS y las cookies de sesión (`cf_clearance`). Incluye reintentos exponenciales y timeout de 90s. Lee `/properties/sitemap/0..6` (7 sitemaps, `SITEMAP_COUNT`; antes solo 0..5). **`SITEMAP_COUNT` está blindado** (`crawler.mjs:64`): si la env está vacía, negativa o con basura → cae al default **7** (`Number.isFinite && >= 0`); el `0` explícito se respeta (desactivar sitemaps en pruebas). Antes una env **vacía** en Easypanel daba `NaN` → `Array.from({length:NaN})` = `[]` → **0 sitemaps** (catálogo completo apagado) sin error visible.
- **Sincronización Diferencial:** Consulta a Supabase (`roomix_properties`) mediante paginación explícita (`.range()`) para bypassear el límite estándar de 1.000 filas de PostgREST, garantizando que el *diff* reconozca todo el inventario ya sincronizado. **Paginación con `.order('id')` obligatorio** (`diffWithSupabase` y `deleteMissing`): sin orden explícito Postgres no garantiza el mismo orden entre páginas de `.range()` → filas repetidas y otras salteadas → conteos de nuevas/eliminar inconsistentes (en una corrida, sobre la misma tabla con segundos de diferencia: borrado calculó 54.581 a eliminar y el diff 32.976).
- **Imagen:** `mcr.microsoft.com/playwright:v1.60.0-jammy`.
- **Imágenes/CDN:** consumidas vía `cdn.roomix.ai` (whitelisted en `next.config.mjs`).

### 11.1 Cambios Junio 2026 (`crawler.mjs` v4.1)

- **Operación correcta (`operation_type`):** `operation` se deriva de `operation_type` (`venta`/`alquiler`) del payload Next.js + fallback al prefijo del título (`parseOperationType`). **Reemplaza** la lógica vieja basada en `businessFunction` del JSON-LD, que era inservible (las ventas no lo traen; los alquileres siempre dicen `LeaseOut`) → producía 0 ventas y 962 `null`. `businessFunction` queda solo como último fallback.
- **Cola priorizada (`priorityRank`):** Venta AMBA (0) → Venta resto prov. BsAs (1) → Venta resto Argentina (2) → Alquiler AMBA (3) → Alquiler resto (4). **Toda venta antes que cualquier alquiler.**
- **Recolección de ventas (`fetchVentaSeeds`):** Fuente prioritaria desde listados `/buscar/comprar/<seed>?page=N` (paginados), agrupados por tier de zona (`VENTA_SEED_GROUPS`). El sitemap barre el resto. Tope de prueba global: `VENTA_MAX_PAGES`.
  - **Fix Junio 24 (c) — seeds de zona reales (AMBA = CABA + 29 partidos):** los slugs viejos eran engañosos (verificado contra Roomix real): `en-buenos-aires` devolvía el listado **genérico idéntico a `en-capital-federal`** (overlap 99/99 → `+0` siempre) y `en-zona-norte`/`en-zona-sur` filtraban por la **costa atlántica** (Villa Gesell), NO por el conurbano. Por eso AMBA solo juntaba lo de CABA (670) y los demás grupos daban `+0`. Ahora `tier 0 AMBA = ['en-capital-federal', ...CONURBANO_SEEDS]` con los **29 partidos** del conurbano por su slug propio (`en-vicente-lopez`, `en-la-matanza`, `en-quilmes`, …), los 29 verificados (overlap ~0 con capital, ~40-50 props/página). Se eliminó el tier 1 (`en-buenos-aires` genérico); el resto del país lo cubre `en-argentina` (tier 2). **Verificado en local:** AMBA con 1 sola página/seed = **1.356 ventas** (antes 670 usando todas las páginas de capital).
  - **Fix Junio 24 — tope por grupo (`maxPages`):** `en-argentina` (tier 2) tiene cientos de páginas y casi siempre trae +1 nueva, así que el corte por `emptyStreak>=2` no se gatillaba → `fetchVentaSeeds` se colgaba horas (+ throttling CF) y la tubería **nunca llegaba a `processQueue`** (síntoma: ~10 ventas con catálogo de miles). Ahora cada grupo lleva `maxPages`: `en-argentina` = `VENTA_AR_MAX_PAGES` (default **60**). Tope efectivo = `VENTA_MAX_PAGES` (override global de pruebas) > `group.maxPages`.
  - **Fix Junio 25 — tope de páginas para AMBA (`VENTA_AMBA_MAX_PAGES`, default 25):** medido en producción, **Roomix permite pedir hasta ~100 páginas por búsqueda y solo devuelve vacío en la p101** — de la p1 a la p100 SIEMPRE trae propiedades (de la zona, ~50/pág; verificado: en p60 de `en-vicente-lopez` siguen siendo Olivos/Martínez/Florida, no relleno aleatorio). Con los 29 partidos a `maxPages 0`, el autocorte por `emptyStreak>=2` recién saltaba a las 100 págs **en cada seed** → 30 seeds × 100 págs ≈ **3 h solo recolectando**, sin llegar a guardar (mismo cuelgue que tenía `en-argentina`, ahora multiplicado). El grupo AMBA pasa de `maxPages 0` a `VENTA_AMBA_MAX_PAGES` (default **25** ≈ 1.000-1.200 ventas/zona, recolección ~35 min). **Verificado en local:** con `maxPages 2`, las 30 zonas cortan en `alcanzó el tope de 2 páginas` y AMBA junta 2.436 ventas; muestra de 226 ventas reales → 221 son **nuevas** en la BD (no estaban mal clasificadas como `rent`: el catálogo tenía pocas ventas porque casi no se recolectaban, no por mala operación).
- **Borrado seguro (`deleteMissing`):** Borra las que salieron de Roomix; solo en corrida completa (sin `--limit`), solo si **todos los sitemaps cargaron OK**, y aborta si borraría **>40%** de la base.
- **Updates desbloqueados (`clearCheckpoint`):** El `checkpoint.json` es solo para reanudar corridas cortadas; se **vacía al terminar bien** para que el *diff* por `lastmod` detecte y re-baje las modificadas en la próxima corrida (antes quedaban bloqueadas).
- **Backfill puntual (`backfill-operation.mjs`):** Script idempotente de una vez; re-etiquetó las 962 filas con `operation = null` (UPDATE solo de `operation`). Resultado: 961 `rent` + 1 `sale`.
- **Concurrencia configurable (`CONCURRENCY`):** default **4** (antes 2 fijo), vía env `CRAWLER_CONCURRENCY`. Balance velocidad/CF; `extractProperty` ya reintenta 403/429/5xx (×2, backoff). Muchos `⏳` en logs → bajarla.
- **Catálogo vs base (medido Junio 24):** sitemaps ≈ **181.971** propiedades; `roomix_properties` ≈ **54.600** (~30%). Ponerse al día con todo es throughput (≈1 día/corrida a conc. 4); `checkpoint.json` reanuda entre corridas. Ventas no se ven afectadas (van primeras en la cola).
- **Env de producción:** `VENTA_MAX_PAGES`, `VENTA_AR_MAX_PAGES`, `SITEMAP_COUNT`, `CRAWLER_CONCURRENCY`, `PROPERTY_LIMIT` sin definir (defaults: ventas AMBA completas, `en-argentina`=60 pág, 7 sitemaps, conc. 4).
- **Fix Junio 24 (b) — sitemaps apagados por env vacía + paginación sin orden:** una corrida real loggeó `Descargando 0 sitemaps` → solo se recolectaron ventas (2.195), el diff vio casi todo el catálogo como "a borrar" (lo frenó el tope >40%) y procesó solo 2.192 nuevas. Dos causas, dos fixes: **(1)** `SITEMAP_COUNT` venía **vacío** en Easypanel y el código asumía que `undefined` = 7, pero `''` → `NaN` → 0 sitemaps → ahora blindado: vacío/negativo/basura → 7; el `0` **explícito** sí se respeta (desactivar sitemaps a propósito en pruebas). **(2)** Las dos lecturas paginadas (`diffWithSupabase:391`, `deleteMissing:419`) no tenían `.order('id')` → conteos inconsistentes entre sí (32.976 vs 54.581 sobre la misma tabla). Verificado: `id` es único (54.806/54.806), así que la inconsistencia era 100% paginación, no datos duplicados.

---

## 12. Sistema de Créditos IA y Costos

**Reserva/registro** (`lib/auth/tenant-validation.ts`): `consumeAiCredits(feature, amount, summary)` → RPC `consume_ai_credits` (txId); luego `updateAiTransactionCost(txId, inTok, outTok, usd)` → RPC `update_ai_transaction_cost`.

**Precios centralizados** en `utils/aiCostCalculator.ts` (`AI_PRICING` / `IMAGE_PRICING`); `calculateCost`/`calculateImageCost` por modelo (modelo desconocido → $0 + log, nunca error).

| Feature | Créditos | Modelo | Costo (por 1M tokens) |
|---|---|---|---|
| `consultor_ia` | 1 | GPT-4.1-mini | $0.40 in / $1.60 out |
| `tutor_ia` | 1 | GPT-4.1-mini | $0.40 in / $1.60 out |
| `marketing_ia` (copy/batch) | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `marketing_ia` (image) | 2 | Nano Banana Pro | $0.134/img (1K-2K) · $0.24 (4K) |
| `contratos_ia` (convert) | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `contratos_ia` (generate-pdf) | 5 | — | — |
| `tasador_ia` (legacy) | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out — **el tasador vigente (MCM) es client-side y NO consume créditos** |
| `analisis_chat_ia` | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `documentos_ia` | 1 | Gemini Embedding 004 | $0.02 in |

**Cuota por asesor:** `GET /api/asesor/creditos` calcula límite mensual = pool de asesores de la agencia / nº de asesores activos; renueva el 1° de cada mes. Dashboard director en `components/ai-credits-dashboard.tsx`.

---

## 13. Rate Limiting

- **Memoria** (`lib/rate-limiter.ts`, dev): `LIMITS.AI` 30/h, `TOKKO_SYNC` 1/5min, `VALUATION` 20/h, `DOCUMENTS` 10/h, `AUTH` 5/15min.
- **Upstash Redis** (`lib/rate-limit.ts`, prod): `loginRateLimit` 10/15min, `aiRateLimit` 30/min. Admin Vakdor login: 5/10min por IP.

---

## 14. Cron Jobs

`vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/sync-templates", "schedule": "0 0 * * *" }] }
```
Diario a medianoche → verifica aprobación de templates de WhatsApp (§9.4). El crawler Roomix (03:00) corre fuera de Vercel, en Easypanel.

---

## 15. Push Notifications

`POST/DELETE /api/push/subscribe`. El cliente registra Service Worker (`/sw.js`), pide permiso, se suscribe con `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, y hace upsert en `push_subscriptions` (`user_id + endpoint`). DELETE con endpoint borra una; sin endpoint borra todas las del usuario. UI en config del asesor (eventos: nuevos leads, recordatorios de visita).

---

## 16. Panel Super-Admin Vakdor

**Auth separado de Supabase** (`lib/admin-vakdor/`):
- `auth.ts` — `signAdminToken()`/`verifyAdminToken()` (JWT `jose`, cookie `admin_vakdor_token`).
- `guard.ts` — `requireAdminVakdor()` / `requireAdmin()`.
- `logger.ts` — `logAdminActivity()`, `getClientIp()`, `getAdminDb()`.

Login (`POST /api/admin-vakdor/login`): rate limit 5/10min; hash SHA-256 con salt `email + ADMIN_VAKDOR_JWT_SECRET`; busca `admin_vakdor_users`.

**Endpoints:** agencias (lista/detalle/créditos/estado/pagos/sugerencias/tokko-stats), asesores/directores (estado), bloqueados, dashboard/metricas, invitaciones, pagos, sugerencias (+ métricas/estado), usuarios desbloquear, logout, y **bandejas** (`GET /api/admin-vakdor/bandejas` y `/[id]`) — **monitoreo cross-tenant** de conversaciones WhatsApp de todas las agencias vía `service_role`, con filtros por agencia/estado/texto. Páginas en `app/admin-vakdor/*`.

---

## 17. Frontend: estructura y convenciones

- **App Router** con grupos: `(public)`, `director`, `asesor`, `admin-vakdor`. Layouts por rol con guards.
- **Navegación:** `components/director-sidebar.tsx` (18 ítems) y `components/asesor-sidebar.tsx` (17 ítems). Headers con `ModeToggle`.
- **Accesos personalizables por agencia:** algunos módulos se habilitan/deshabilitan por `agency_id`. El primer caso vive en `lib/access/contratos-ia.ts` (`CONTRATOS_IA_AGENCIA_DESHABILITADA` + helper `contratosIaDeshabilitado(agencyId)`). Se aplica en dos capas: (1) **UI** — los sidebars reciben `agencyId` (layout → sidebar, y layout → header → sidebar móvil) y, si coincide, renderizan "Contratos IA" como `<div>` atenuado no clickeable con badge "Deshabilitada" en vez de `<Link>`; (2) **acceso directo** — las páginas `app/{director,asesor}/contratos-ia/page.tsx` (ahora server components `async`) leen `profiles.agency_id` y hacen `redirect()` al dashboard del rol si la agencia está deshabilitada. Patrón a reutilizar para futuras customizaciones por cliente.
- **UI:** shadcn/ui (Radix), iconos `lucide-react`, toasts `sonner`. Estado: hooks estándar + `zustand` (Kanban).
- **Tema** (`next-themes`, estrategia `class`): `defaultTheme="dark"`, `enableSystem={false}`. Tokens semánticos HSL en `app/globals.css` (`:root` claro / `.dark` oscuro). Regla: nunca `text-white` standalone sobre superficies theme-aware (usar `text-foreground`); `text-white` solo sobre fondos de color fijo. Excepciones oscuras: landing pública, simulaciones de marketing, panel Vakdor, drafts Roomix.
- **Realtime:** canales Supabase `agency-{id}` para refrescar la bandeja de WhatsApp (evento `refresh-whatsapp`).
- **Componentes compartidos clave:** Pipeline (`PipelineClient`), Tasaciones (wizard en `app/asesor/tasaciones/components/`, reusado por director), Contratos (`components/contratos-ia/ContratosIAPage.tsx`, prop `role`), WhatsApp bot (`components/whatsapp/WhatsAppTabsWrapper.tsx` con tabs Chat/Plantillas/Contactos/Campañas/Configuración IA). **Plantillas** (`TemplatesTab`) es CRUD completo (crear/editar/borrar plantillas propias + `syncTemplatesFromMeta`), no solo lectura de las 8 de seguimiento. **Campañas** (`CampaignsTab`) admite importar CSV/Excel (papaparse/xlsx) con mapeo de columnas y variables, además de seleccionar contactos.
- **Objetivos de performance:** Tracking Performance (`components/tracking/TrackingPerformanceView.tsx`) expone al director las solapas Actividad/Objetivos/Configuración IA; el editor de metas es `components/tracking/PerformanceObjectivesEditor.tsx`. El Dashboard (director y asesor) muestra `components/dashboard/ObjectivesDashboard.tsx` (tabla objetivo/alcanzado/% + gráfico recharts `ComposedChart`) antes del Ranking. Lógica server en `lib/tracking/objetivos.ts` (cálculo de alcanzado y matriz del dashboard) y server actions en `actions/tracking/objetivos.ts` (`saveObjectives` con upsert vía adminClient + validación de mes cerrado/rol). Tipos puros (sin `next/headers`) aislados en `lib/tracking/objetivos-types.ts` para poder importarlos desde componentes cliente.

---

## 18. Despliegue y entornos

- **Hosting:** Vercel (`framework: nextjs`, `buildCommand: npm run build`, `outputDirectory: .next`). Funciones serverless con timeout ~25 s → webhooks usan `AbortSignal.timeout(25000)`. Plan Hobby condiciona el sync de mercado (por fuente, < 10 s).
- **Worker Roomix:** Easypanel (Docker, ver §11).
- **Servicios gestionados:** Supabase (DB/Auth/Storage/Realtime), Upstash Redis, n8n (orquestador), Evolution API (servidor propio/gestionado), Meta Cloud API.
- **Storage buckets:** `marketing-images`, `contratos` (públicos), almacenamiento de documentos y logos.

---

## 19. Variables de Entorno

| Grupo | Variables |
|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| IA | `GEMINI_API_KEY`, `OPENAI_API_KEY` |
| Tokko | `TOKKO_API_KEY` (fallback global) |
| WhatsApp/Evolution | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| n8n | `N8N_WEBHOOK_URL`, `N8N_REPLY_SECRET`, `APP_URL` |
| Rate limit | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Admin Vakdor | `ADMIN_VAKDOR_JWT_SECRET` |
| Secrets | `BOT_REPLY_SECRET`, `DISPATCH_SECRET`, `CRON_SECRET` |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (+ clave privada VAPID server-side) |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 bytes), opcional `GOOGLE_OAUTH_REDIRECT_URI` |

---

## 19.1 Integración Google Calendar (sync una dirección PRISMA → Google)

Sincroniza las visitas (`scheduled_visits`) hacia el Google Calendar personal de cada asesor que conecta su cuenta. **Una sola dirección**: PRISMA es la fuente de verdad; lo que pase en Google no altera PRISMA.

- **Scope OAuth:** `https://www.googleapis.com/auth/calendar.events` (mínimo, sensible). `access_type=offline` + `prompt=consent` para obtener `refresh_token`.
- **Almacenamiento:** tabla `google_calendar_tokens` (`user_id` PK → `profiles`, `refresh_token_enc`, `google_email`, `scope`). El refresh token se guarda **encriptado AES-256-GCM** (`lib/google-calendar/crypto.ts`). RLS activa; el backend accede con `service_role`. Nunca se expone el token al cliente.
- **Columna espejo:** `scheduled_visits.google_event_id` guarda el id del evento de Google para poder editarlo/borrarlo.
- **Librería** (`lib/google-calendar/`): `config.ts` (env/redirect/scope), `client.ts` (fetch directo a OAuth + Calendar API v3, sin dependencia `googleapis`), `sync.ts` → `reconcileVisit(visitId)` idempotente (crea/actualiza/borra según `estado_visita` y `google_event_id`; nunca lanza), `triggerSync.ts` (helper cliente fire-and-forget).
- **Disparo:** tras `insert`/`update`/`cancel` en cliente, se llama `triggerCalendarSync(visitId)` → `POST /api/google-calendar/sync` (best-effort, no bloquea ni rompe el guardado). Puntos cableados: `NewVisitDialog`, `EditVisitDialog`, cancelación en `app/asesor/calendario`.
- **Rutas:** `connect` (inicia OAuth), `callback` (guarda token), `status` (estado conexión), `disconnect` (revoca + borra), `sync` (reconcilia). Todas `runtime = "nodejs"`.
- **UI:** pestaña *Integraciones* en `app/asesor/configuracion`.
- **Requisito Google Cloud:** registrar redirect URI `<APP_URL>/api/google-calendar/callback` (y `http://localhost:3000/...` para dev). El scope de calendario es sensible → requiere verificación de la app (en producción funciona con pantalla de advertencia hasta verificar).

---

## 20. Deuda técnica y código legacy

- **Tasaciones legacy:** `/api/valuation/generate` + tabla `valuations` (Gemini) sin uso confirmado en frontend; `getAsesorKPIs` (`lib/queries/asesor.ts`) y `useAsesorDashboard` consumían solo esta rama. **No eliminado** por precaución.
- **`contract_signatures`:** conservada del diseño de firma digital; el flujo vigente es firma presencial (no se alimenta).
- **Columna `embedding`** (`properties` y `roomix_properties`): la usan tanto el agente n8n `Cartera_Propiedades` como **el Buscador IA web** (desde jun-2026, rama `fix/buscador-ia-logica-n8n`), vía las funciones SQL `match_properties_ia` / `match_roomix_ia` + índices HNSW. Ya **no** es "sin uso": es el corazón del ranking semántico del buscador.
- **`/api/messages/bot-reply`:** endpoint legacy de respuesta (solo Evolution, `BOT_REPLY_SECRET`); el flujo vigente es `/api/n8n/reply`.
- **`/api/marketing-ia/generate-copy`:** genera 1 copy individual, pero **ningún componente lo llama**; el flujo vigente de "Crear Anuncio" usa `generate-batch` + `generate-image`. **No eliminado** (sirve de base para un futuro modo "copy simple").
- **Marketing IA — vincular propiedad al IPC "vender":** el `PropertySelector` y el fetch de `propiedad_tokko_id` desde Tokko existen, pero el copy **no usa** los datos concretos de la propiedad (regla anti-invención). Función reservada para un modo futuro.
- **Endpoints de debug** (`/api/debug/*`): validar que no queden expuestos en producción.
- **Inconsistencia documental:** el diagrama §26.3 de `LOGICA-PRISMA.md` describe el flujo vectorial original del Consultor; el vigente es el de §10.3 (ya anotado en el doc).

---

## FIN DEL DOCUMENTO

Documento técnico de PRISMA basado en análisis directo del código fuente, sin ejecución ni modificación del sistema. Para la lógica detallada endpoint por endpoint, ver `LOGICA-PRISMA.md`.
