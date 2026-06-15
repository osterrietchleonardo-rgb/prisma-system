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
| Google Gemini | `text-embedding-004` | `lib/gemini.ts` → `generateEmbedding()` | Embeddings (768 dims) para RAG de documentos |
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
- `profiles` — id, email, full_name, role (`director`/`asesor`), agency_id, phone, avatar_url, status (`activo`/`pausado`/`eliminado`), notification_prefs (jsonb), tokko_agent_id.
- `agencies` — id, name, logo_url, tokko_api_key, invite_code, owner_id, `performance_config`, `marketing_ai_config`, `buscador_ia_config` (todas jsonb).
- `agency_invites` — agency_id, code, is_used, used_at, used_by.

**Propiedades y leads**
- `properties` — tokko_id, agency_id, assigned_agent_id, título, precio, moneda, tipo, estado, ubicación, ambientes/baños, superficies, images[], `tokko_data` (jsonb), `embedding vector(768)`.
- `leads` — agency_id, assigned_agent_id, datos de contacto, source, status, pipeline_stage, tokko_contact_id, first_response_time, `chat_analysis` (jsonb).
- `lead_activities` — historial de actividades.
- `scheduled_visits` — agendamiento de visitas (lead, propiedad/zona, fecha/hora, calificación, score_bant, intereses, objeciones, decisores, resumen, origen, `estado_visita`: agendada/cancelada/completada, motivo_cambio).
- `visits`, `closings` — legacy/cierres.

**Tracking de performance**
- `performance_logs` — registro de actividad comercial por asesor (agency_id, agent_id, `type`: prospeccion/prelisting/prebuying/captacion/reserva/cierre, monto_operacion, comision_generada, fecha_actividad, metadata jsonb, `status`: original/modificada/eliminada). Fuente de los KPIs y del Ranking del Dashboard.
- `performance_objectives` — objetivos mensuales por asesor (agency_id, agent_id, `year`, `month` 1-12, `metric`: `facturacion`/`captacion`, `target_value` numeric, created_by). `UNIQUE (agent_id, year, month, metric)` para upsert idempotente; `metric` con `CHECK` ampliable. RLS: SELECT para toda la agencia, INSERT/UPDATE/DELETE solo `role='director'`. Lo "alcanzado" no se guarda: se deriva de `performance_logs` (facturación = Σ monto·comisión/100 sobre cierres; captación = nº de captaciones). Migración `20260615120000_create_performance_objectives.sql`.

**WhatsApp**
- `whatsapp_instances` — agency_id, token, phone_number_id, business_id, evo_instance_name, integration_type, templates_status, flows_active, status.
- `wa_conversations` — agency_id, instance_id, agent_id, contact_phone/name, status, bot_active, unread_count, last_message_at/last_inbound_at, etiquetas[], score, pipeline_stage, funnel_status, visit_status, follow_ups_sent, `follow_ups_history` (jsonb array), requires_follow_up, recovery_stage, next_follow_up_at, opt_out, `metricas` (jsonb).
- `wa_messages` — conversation_id, agency_id, content, role (`lead`/`bot`/`agent`), message_type, wamid, metadata.
- `wa_templates` — agency_id, template_name, status, components, rejection_reason, meta_template_id.
- `n8n_chat_histories` — session_id (= conversation_id), message (jsonb formato LangChain).

**IA y documentos**
- `consultor_chat_sessions` / `consultor_chat_messages` — Buscador IA (memoria por sesión).
- `tutor_chat_sessions` / `tutor_chat_messages` — Tutor IA.
- `agency_documents` — base de conocimiento con embedding para RAG (title, type, file_url/video_url, content_text, embedding, visibility, ai_enabled, folder_id).
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
- **Login:** rate limit → `signInWithPassword` → verifica `status` (`pausado`/`eliminado` bloquean) → redirige según rol.
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
- `POST /api/marketing-ia/generate-copy`, `/generate-batch`, `/generate-image`.
- `GET/POST /api/marketing-ia/settings` (POST solo director), `POST /api/marketing-ia/settings/upload-logo`.
- `GET /api/marketing-ia/tokko-search`.

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
- **Sync propiedades** (`/api/tokko/sync`): paginado `GET tokkobroker.com/api/v1/property/?key=...&limit=100&offset=n`; mapeo de campos + imágenes + agente (`profiles.tokko_agent_id`); genera embedding; upsert masivo con adminClient (`onConflict: tokko_id,agency_id`). Rate limit 1 req/5 min por agencia.
- **Sync leads** (`/api/tokko/sync-leads`): `GET .../contact/?...&limit=20`, delay 350 ms entre páginas; upsert en `leads`.
- **Proxy** (`/api/tokko-proxy/[...path]`): inyecta el `tokko_api_key` de la agencia y reenvía a Tokko.
- La API key es **por agencia** (columna `agencies.tokko_api_key`); `TOKKO_API_KEY` global es solo fallback.

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
   → crea/actualiza wa_conversations → guarda wa_messages (role:'lead')
   → si bot_active: arma enrichedPayload (últimos 10 msgs + etiquetas + score)
        → POST N8N_WEBHOOK_URL (timeout 25s)
   → si bot OFF: guarda en n8n_chat_histories (contexto para reactivación)
```
- `POST /api/webhooks/evolution` — identifica por `evo_instance_name`.
- `GET/POST /api/webhooks/meta` — verificación GET por `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; POST maneja `message_template_status_update` y `messages` (text/image/interactive), identifica por `phone_number_id`.

### 9.2 Flujo de respuesta (`POST /api/n8n/reply`)
Auth por `N8N_REPLY_SECRET`. Verifica anti-cruce de instancias; si el bot fue pausado, descarta. Normaliza `media_type`; calcula delay de tipeo (~40 ms/char, 800–4000 ms); envía vía Evolution (`sendText`/`sendMedia`) o Meta (`graph.facebook.com/v20.0/{phone_number_id}/messages`); persiste `wa_messages` (role `bot`); actualiza conversación; **broadcast Realtime** al canal `agency-{id}` (evento `refresh-whatsapp`).

### 9.3 Templates de seguimiento (`POST /api/whatsapp/dispatch`)
Auth por `DISPATCH_SECRET`. Prefijo por agencia `ag{agency_id[0:6]}_`. 8 templates: `seg_f1_seguimiento`, `seg_f2_valor`, `seg_f3_breakup`, `visita_recordatorio_24h/3h/1h`, `visita_post_noshow`, `reactivacion_snoozed`. Persiste en `wa_messages` + `n8n_chat_histories` + registra en `follow_ups_history` (con snapshot del estado). Broadcast Realtime.

### 9.4 Cron de aprobación de templates
`GET /api/cron/sync-templates` (diario, `CRON_SECRET`): consulta Meta Graph API por estado de los 8 templates; cuando los 8 están `APPROVED` marca `templates_status='approved'` y `flows_active=true`.

### 9.5 `n8n_chat_histories`
Formato LangChain: `session_id` = conversation_id; `message` = `{ type:'human'|'ai', content, additional_kwargs, response_metadata, tool_calls, invalid_tool_calls }`.

---

## 10. Subsistema de IA

### 10.1 Buscador IA (`/api/ai/consultor`, GPT-4.1-mini)
Asistente de búsqueda con **memoria por chat**. Flujo vigente (rediseño jun-2026):
1. `requireTenant()` + `consumeAiCredits('consultor_ia', 1)`.
2. Lee `agencies.buscador_ia_config` (notas/directivas del director) + nombre de agencia.
3. Sesión `consultor_chat_sessions/_messages`; últimos 12 turnos alimentan intención y respuesta.
4. **Intent con memoria** → criterios acumulados (operation, type, location, amenities, agency, price_max/min, currency, bedrooms, bathrooms).
5. Búsqueda en 2 etapas: **filtro duro SQL** (operación + tipo, traducción ES→EN para Roomix; hasta 400 candidatos/tabla) → **interpretación en memoria** (zona estricta, presupuesto con moneda, ambientes tolerante, amenities puntúa, inmobiliaria fuzzy). Sin deduplicación destructiva.
6. Combina cartera interna (Tokko) + red de colaboración (`roomix_properties`). Render en `consultor-results.tsx` (3 secciones). Enlaces: internas → `tokko_data.public_url`; Roomix → `canonical_url`.
7. `updateAiTransactionCost()`.

> Las columnas `embedding` existen pero **no** se usan en este endpoint (el flujo no es vectorial).

### 10.2 Tutor IA (`/api/ai/tutor`, GPT-4.1-mini)
Mentor con **RAG** sobre `agency_documents`. Intent RETRIEVAL/GENERAL; si RETRIEVAL → `generateEmbedding()` + `match_agency_documents(threshold 0.15, count 5, p_user_role)`. Resume el tópico de la sesión cada 4 mensajes.

### 10.3 Análisis de chat (`/api/ai/analyze-chat`, Gemini 2.0 Flash)
Rate limit 30 req/h por usuario; validación Zod (10–50000 chars); `parseWhatsAppChat()`; output JSON comercial (lead_name, phone, search_intent, response_time_eval, lead_attitude, commercial_process_eval, summary, next_step).

### 10.4 Marketing IA
- **Copy** (`/generate-copy`, Gemini 3.5 Flash): usa IPC + `creative_directive`. Regla explícita: **no inventa ni menciona** propiedades/precios/m² concretos. Output por tipo (post/historia: hook/desarrollo/cta; video: hook/problema/agitación/solución/cta).
- **Batch** (`/generate-batch`): 3 variaciones (PAS, Transformación, Autoridad/Datos) en una llamada.
- **Imagen** (`/generate-image`, Gemini 3 Pro Image / Nano Banana Pro): integra branding (`marketing_ai_config`: colores, logo de referencia, tipografía), `creative_directive` y `legal_notice` (franja inferior). Sube a Storage `marketing-images` + `generated_images`.
- **Settings** (`/settings`, POST solo director): branding + directiva creativa + aviso legal.

### 10.5 Contratos IA
- **Conversión documento→plantilla** (`/convert-template`, Gemini 3.5 Flash): `.docx`/`.pdf` ≤ 25 MB; sube original a bucket `contratos`; reemplaza datos por placeholders `{{PREFIJO_CAMPO}}`; 1 crédito.
- **CRUD** con visibilidad por rol (director ve todo el equipo incl. eliminados; asesor solo lo suyo, sin eliminados). Soft-delete (`estado_gestion='eliminado'` + motivo). `codigo_unico` compartido plantilla↔contrato.
- **PDF** en cliente (jsPDF, `lib/contratos/`), subido a Storage (`{agency}/generados/{id}.pdf`, path estable + cache-busting). **Firma presencial** (papel); `contract_signatures` conservada pero no alimentada.

### 10.6 Tasaciones IA
**Vivo:** Wizard MCM **client-side** (4 pasos, `lib/tasacion/calculos.ts`), persiste en `tasaciones`. **Legacy:** `/api/valuation/generate` + tabla `valuations` (Gemini) — sin uso confirmado en frontend (ver §20).

### 10.7 Conversational Insights (`/api/conversational-insights/analyze`)
Analytics **sin IA** (agregación pura), solo director. Lee `wa_conversations.metricas` + `wa_messages`; cache en `dashboard_conversational_insights` (refresh > 6 h). Bloques: KPIs, funnel, perfil del lead, demanda, comportamiento temporal, calidad de atención.

### 10.8 Documentos / base de conocimiento
`/api/documents/process`: extracción por tipo (PDF/imagen → Gemini; DOCX → mammoth; CSV → papaparse; YouTube → transcript) → `generateEmbedding(texto[:5000])` → `agency_documents` (con `visibility` director/asesor).

---

## 11. Roomix Crawler (Worker Docker)

Carpeta `roomix-sync/`. Alimenta diariamente `roomix_properties` (red de colaboración del Buscador IA).
- **Tecnología:** Playwright en modo *stealth* (bypass anti-bot); extrae JSON-LD de fichas de Roomix.
- **Producción:** contenedor Docker en **Easypanel**; `node-cron` dispara a las **03:00 AM**; `child_process.spawn` aísla el proceso para evitar fugas de memoria de Chromium.
- **Health check:** mini servidor HTTP nativo en puerto 80 (`cron.js`, `CMD ["node","cron.js"]`) para satisfacer Easypanel y evitar SIGTERM.
- **Imagen:** `mcr.microsoft.com/playwright:v1.60.0-jammy`.
- **Imágenes/CDN:** consumidas vía `cdn.roomix.ai` (whitelisted en `next.config.mjs`).

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
| `tasador_ia` | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
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
- **UI:** shadcn/ui (Radix), iconos `lucide-react`, toasts `sonner`. Estado: hooks estándar + `zustand` (Kanban).
- **Tema** (`next-themes`, estrategia `class`): `defaultTheme="dark"`, `enableSystem={false}`. Tokens semánticos HSL en `app/globals.css` (`:root` claro / `.dark` oscuro). Regla: nunca `text-white` standalone sobre superficies theme-aware (usar `text-foreground`); `text-white` solo sobre fondos de color fijo. Excepciones oscuras: landing pública, simulaciones de marketing, panel Vakdor, drafts Roomix.
- **Realtime:** canales Supabase `agency-{id}` para refrescar la bandeja de WhatsApp (evento `refresh-whatsapp`).
- **Componentes compartidos clave:** Pipeline (`PipelineClient`), Tasaciones (wizard en `app/asesor/tasaciones/components/`, reusado por director), Contratos (`components/contratos-ia/ContratosIAPage.tsx`, prop `role`), WhatsApp bot (`components/whatsapp/WhatsAppTabsWrapper.tsx` con tabs Chat/Plantillas/Contactos/Campañas/Configuración IA).
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

---

## 20. Deuda técnica y código legacy

- **Tasaciones legacy:** `/api/valuation/generate` + tabla `valuations` (Gemini) sin uso confirmado en frontend; `getAsesorKPIs` (`lib/queries/asesor.ts`) y `useAsesorDashboard` consumían solo esta rama. **No eliminado** por precaución.
- **`contract_signatures`:** conservada del diseño de firma digital; el flujo vigente es firma presencial (no se alimenta).
- **Columnas `embedding`** en `properties`/`roomix_properties`: presentes pero el Buscador IA actual no las usa (búsqueda no vectorial).
- **`/api/messages/bot-reply`:** endpoint legacy de respuesta (solo Evolution, `BOT_REPLY_SECRET`); el flujo vigente es `/api/n8n/reply`.
- **Endpoints de debug** (`/api/debug/*`): validar que no queden expuestos en producción.
- **Inconsistencia documental:** el diagrama §26.3 de `LOGICA-PRISMA.md` describe el flujo vectorial original del Consultor; el vigente es el de §10.3 (ya anotado en el doc).

---

## FIN DEL DOCUMENTO

Documento técnico de PRISMA basado en análisis directo del código fuente, sin ejecución ni modificación del sistema. Para la lógica detallada endpoint por endpoint, ver `LOGICA-PRISMA.md`.
