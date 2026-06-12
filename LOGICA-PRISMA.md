# LÓGICA COMPLETA DEL SISTEMA PRISMA

> **Versión:** 1.0 — Generado por análisis exhaustivo del código fuente  
> **Fecha:** Junio 2026  
> **Objetivo:** Documentar cada funcionalidad, flujo, API, webhook, integración y lógica interna del sistema PRISMA para que pueda ser replicado exactamente.

---

## ÍNDICE

1. [Arquitectura General](#1-arquitectura-general)
2. [Stack Tecnológico y Dependencias](#2-stack-tecnológico-y-dependencias)
3. [Seguridad Global](#3-seguridad-global)
4. [Sistema de Autenticación y Creación de Cuentas](#4-sistema-de-autenticación-y-creación-de-cuentas)
5. [Estructura de Roles y Navegación](#5-estructura-de-roles-y-navegación)
6. [Base de Datos — Esquema Completo](#6-base-de-datos--esquema-completo)
7. [Integración Tokko Broker (CRM)](#7-integración-tokko-broker-crm)
8. [Integración WhatsApp — Doble Vía](#8-integración-whatsapp--doble-vía)
9. [Motor de Automatización n8n](#9-motor-de-automatización-n8n)
10. [Módulo de IA — Buscador](#10-módulo-de-ia--buscador)
11. [Módulo de IA — Tutor](#11-módulo-de-ia--tutor)
12. [Módulo de IA — Análisis de Chat](#12-módulo-de-ia--análisis-de-chat)
13. [Módulo Marketing IA](#13-módulo-marketing-ia)
14. [Módulo de Contratos IA](#14-módulo-de-contratos-ia)
15. [Módulo de Tasaciones IA](#15-módulo-de-tasaciones-ia)
16. [Módulo Pulso de Mercado](#16-módulo-pulso-de-mercado)
17. [Módulo Conversational Insights (Analytics)](#17-módulo-conversational-insights-analytics)
18. [Módulo de Documentos / Base de Conocimiento](#18-módulo-de-documentos--base-de-conocimiento)
19. [Sistema de Créditos IA](#19-sistema-de-créditos-ia)
20. [Sistema de Rate Limiting](#20-sistema-de-rate-limiting)
21. [Cron Jobs y Tareas Programadas](#21-cron-jobs-y-tareas-programadas)
22. [Push Notifications](#22-push-notifications)
23. [Panel Admin Vakdor (Super-Admin)](#23-panel-admin-vakdor-super-admin)
24. [Configuración de Despliegue (Vercel)](#24-configuración-de-despliegue-vercel)
25. [Variables de Entorno Completas](#25-variables-de-entorno-completas)
26. [Diagrama de Flujos Principales](#26-diagrama-de-flujos-principales)
27. [Sistema de Temas (Claro / Oscuro)](#27-sistema-de-temas-claro--oscuro)

---

## 1. Arquitectura General

PRISMA es un SaaS **multi-tenant** para inmobiliarias argentinas. Cada inmobiliaria (agency) es un tenant aislado mediante Row Level Security (RLS) en Supabase.

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│  Next.js 14+ App Router (React Server Components)       │
│  ├── /auth          → Login/Register                    │
│  ├── /(director)/*  → Panel Director                    │
│  ├── /(asesor)/*    → Panel Asesor                      │
│  └── /(admin-vakdor)/* → Panel Super-Admin Vakdor       │
├─────────────────────────────────────────────────────────┤
│                     MIDDLEWARE                           │
│  middleware.ts → Auth + Rate Limit + Redirect Logic      │
├─────────────────────────────────────────────────────────┤
│                     API ROUTES                          │
│  /api/ai/*          → Consultor, Tutor, Analyze Chat    │
│  /api/marketing-ia/* → Copy, Image, Batch, Settings     │
│  /api/tokko/*       → Sync propiedades, Sync leads      │
│  /api/tokko-proxy/* → Proxy directo a Tokko API         │
│  /api/webhooks/*    → Evolution API, Meta Cloud API     │
│  /api/whatsapp/*    → Dispatch templates, AI Settings   │
│  /api/n8n/*         → Reply endpoint para n8n           │
│  /api/messages/*    → Bot reply (legacy)                │
│  /api/contratos/*   → CRUD + PDF + Signatures           │
│  /api/valuation/*   → Tasaciones IA                     │
│  /api/mercado/*     → Sync mercado + Refresh            │
│  /api/documents/*   → Upload, Extract, Process          │
│  /api/conversational-insights/* → Analytics agregado    │
│  /api/push/*        → Push notification subscriptions   │
│  /api/cron/*        → Tareas programadas                │
│  /api/admin-vakdor/* → Super-admin endpoints            │
├─────────────────────────────────────────────────────────┤
│                   SERVICIOS EXTERNOS                    │
│  ├── Supabase (Auth + DB + RLS + Storage + Realtime)    │
│  ├── Tokko Broker API (CRM inmobiliario)                │
│  ├── Evolution API (intermediario WhatsApp)             │
│  ├── Meta Cloud API (WhatsApp Business, fallback)       │
│  ├── Google Gemini (gemini-2.0-flash, Imagen 3)         │
│  ├── OpenAI (GPT-4.1-mini vía @google/generative-ai)   │
│  ├── n8n (Orquestador de automatizaciones)              │
│  ├── Upstash Redis (Rate limiting en producción)        │
│  └── Vercel (Hosting + Edge + Cron)                     │
└─────────────────────────────────────────────────────────┘
```

**Patrón de Multi-Tenancy:** Toda tabla principal tiene una columna `agency_id`. Las políticas RLS de Supabase garantizan que cada usuario solo acceda a datos de su propia agencia. Se obtiene `agency_id` desde `profiles.agency_id` vinculado al `auth.uid()`.

---

## 2. Stack Tecnológico y Dependencias

### Core
| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 14+ (App Router) | Framework fullstack |
| React | 18+ | UI Components |
| TypeScript | 5+ | Tipado estático |
| Supabase | v2 | Auth, DB, Storage, Realtime |

### IA / LLM
| Proveedor | Modelo | Archivo | Uso |
|---|---|---|---|
| Google Gemini | `gemini-2.0-flash` | `lib/gemini.ts` → `prismaIA` | Marketing copy, Tasaciones, Analyze Chat, Embeddings |
| Google Gemini | `gemini-2.0-flash` | `lib/gemini.ts` → `generateEmbedding()` | Embeddings vectoriales (text-embedding-004) |
| Google Gemini | `imagen-3.0-generate-002` | `lib/gemini.ts` → `generateImage()` | Generación de imágenes para marketing |
| OpenAI (via Google) | `gpt-4.1-mini` | `lib/openai.ts` → `openaiIA` | Consultor IA, Tutor IA (intent + response) |

### Integraciones Externas
| Servicio | Protocolo | Uso |
|---|---|---|
| Tokko Broker | REST API (HTTPS) | CRM: propiedades, leads, agentes |
| Evolution API | REST API (HTTPS) | Intermediario WhatsApp (envío/recepción) |
| Meta Cloud API | Graph API v19/v20 | WhatsApp Business (fallback + templates) |
| n8n | Webhooks HTTP | Orquestación de flujos automatizados |
| Upstash Redis | REST API | Rate limiting distribuido |
| YouTube Transcript | npm package | Extracción de transcripciones |

### Bibliotecas Clave
- `@supabase/ssr` + `@supabase/supabase-js` — Clientes Supabase (server/browser/admin)
- `@google/generative-ai` — SDK de Google Gemini
- `mammoth` — Extracción de texto de .docx
- `papaparse` — Parsing de CSV
- `pdf-parse-fork` — Parsing de PDFs
- `youtube-transcript` — Transcripción de YouTube
- `xlsx` — Lectura de archivos Excel
- `zod` — Validación de esquemas
- `jose` — JWT para admin tokens
- `@upstash/ratelimit` + `@upstash/redis` — Rate limiting

---

## 3. Seguridad Global

### 3.1 Middleware (`middleware.ts`)

El middleware intercepta TODAS las requests y aplica:

1. **Rate Limiting Global:** En producción (Upstash Redis) o en memoria, limita:
   - Login: 10 requests / 15 min por IP
   - IA: 30 requests / 1 min por IP
   
2. **Protección de Rutas:**
   - Rutas públicas excluidas: `/`, `/auth/*`, `/api/webhooks/*`, `/api/n8n/*`, `/api/cron/*`, `/api/messages/*`, `/api/whatsapp/dispatch`
   - Rutas protegidas: Todo bajo `/(director)/*` y `/(asesor)/*` requiere sesión activa
   
3. **Refresh de Sesión:** Refresca tokens de Supabase en cada request

4. **Redirección Inteligente:**
   - Si el usuario está autenticado y va a `/auth/*` → redirige a su dashboard
   - Si no está autenticado y va a ruta protegida → redirige a `/auth/login`

### 3.2 Headers de Seguridad (`next.config.mjs`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Content-Security-Policy: [restrictiva, con whitelist explícita]
```

### 3.3 Tenant Isolation (`lib/auth/tenant-validation.ts`)

La función `requireTenant()` se ejecuta en CADA endpoint protegido:
1. Obtiene el usuario autenticado via `supabase.auth.getUser()`
2. Busca su perfil en `profiles` para obtener `agency_id` y `role`
3. Si falta `agency_id` → lanza error "Tenant isolation failure"
4. Retorna `{ userId, agencyId, role }`

### 3.4 Audit Logging

`logSecurityAlert(action, details)` escribe en la tabla `audit_logs` para trazabilidad.

### 3.5 Clientes Supabase (3 niveles)

| Cliente | Archivo | Contexto | Permisos |
|---|---|---|---|
| Browser | `lib/supabase/client.ts` | Client Components | `anon_key` → RLS aplica |
| Server | `lib/supabase/server.ts` | Server Components / API Routes | `anon_key` + cookies → RLS aplica con sesión |
| Admin | `lib/supabase/admin.ts` | API Routes privilegiadas | `service_role_key` → RLS bypassed |

---

## 4. Sistema de Autenticación y Creación de Cuentas

### 4.1 Flujo de Registro — Director

**Archivo:** `lib/actions/auth.ts` → `register()`  
**Callback:** `app/auth/callback/route.ts`

1. El usuario ingresa: nombre, email, contraseña, nombre de agencia
2. `supabase.auth.signUp()` con metadata: `{ role: 'director', agency_name, full_name }`
3. Supabase envía email de confirmación
4. El usuario confirma → redirige a `/auth/callback?code=...`
5. El callback:
   a. Intercambia el code por sesión (`exchangeCodeForSession`)
   b. Crea el perfil en `profiles` (usando adminClient para bypass RLS)
   c. Crea la agencia en `agencies` con un `invite_code` aleatorio (6 chars)
   d. Asocia `profiles.agency_id` con la nueva agencia
   e. Crea entrada en `agency_invites` con el código
   f. Sincroniza metadata en Auth (`updateUserById`)
   g. Redirige a `/director/dashboard`

### 4.2 Flujo de Registro — Asesor

1. El asesor recibe un código de invitación del director
2. Ingresa: nombre, email, contraseña, código de invitación
3. `supabase.auth.signUp()` con metadata: `{ role: 'asesor', invite_code }`
4. En el callback:
   a. Busca `agency_invites` por código → obtiene `agency_id`
   b. Si el código es válido y no usado → asocia asesor a la agencia
   c. Marca el invite como `is_used: true`
   d. Redirige a `/asesor/dashboard`

### 4.3 Flujo de Login

**Archivo:** `lib/actions/auth.ts` → `login()`

1. Rate limiting: verifica con Upstash Redis (10 req / 15 min por IP)
2. `supabase.auth.signInWithPassword({ email, password })`
3. Obtiene perfil → determina rol
4. Verificación de estado:
   - Si `profile.status === 'pausado'` → error "Cuenta pausada"
   - Si `profile.status === 'eliminado'` → error "Cuenta eliminada"
5. Redirige a `/director/dashboard` o `/asesor/dashboard` según rol

### 4.4 Login con Google (OAuth)

**Archivo:** `lib/actions/auth.ts` → `loginWithGoogle()`

1. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`
2. El `redirectTo` incluye parámetros de estado: `role`, `inviteCode`, `agencyName`
3. Google autentica → redirige a callback → mismo flujo que arriba

### 4.5 Guards de Layout

Los layouts de `(director)` y `(asesor)` actúan como guardias adicionales:
- Verifican sesión activa
- Cargan perfil del usuario
- Si `profile.status === 'pausado'` → muestran página de "Cuenta suspendida"
- Si `profile.status === 'eliminado'` → muestran página de "Cuenta eliminada"
- Verifican que el rol coincida con la ruta (director no accede a /asesor y viceversa)
- Cargan datos de la agencia y los pasan al sidebar

### 4.6 Verificación de Estado (`/api/auth/check-status`)

Endpoint que los layouts consultan para verificar si la cuenta sigue activa. Retorna `{ status, agency_status }`.

---

## 5. Estructura de Roles y Navegación

### 5.1 Director — Sidebar (`components/director-sidebar.tsx`)

| Sección | Ruta | Descripción |
|---|---|---|
| Dashboard | `/director/dashboard` | KPIs, métricas, resumen |
| Pulso de Mercado | `/director/mercado` | Dólar, ICC, Zonaprop, barrios, escrituras |
| Pipeline | `/director/pipeline` | Tablero Kanban de leads |
| Propiedades | `/director/propiedades` | Cartera de propiedades (Tokko) |
| Tracking Performance | `/director/tracking-performance` | Rendimiento de asesores |
| Leads Tokko | `/director/leads` | Leads importados de Tokko |
| Asesor IA WhatsApp | `/director/asesor-ia-whatsapp` | Config del bot IA de WhatsApp |
| Leads WhatsApp | `/director/leads-whatsapp` | Leads capturados via WA |
| Marketing IA | `/director/marketing-ia` | Generador de copy + imágenes |
| Contratos IA | `/director/contratos-ia` | Generador de contratos |
| Asesores | `/director/asesores` | Gestión de equipo |
| Documentos | `/director/documentos` | Base de conocimiento |
| Tasaciones | `/director/tasaciones` | Tasador IA |
| Calendario | `/director/calendario` | Agenda de visitas |
| Tutor IA | `/director/tutor` | Chat formativo IA |
| Consultor IA | `/director/consultor` | Buscador de propiedades IA |
| Configuración | `/director/configuracion` | Config de agencia, Tokko, WA |
| Sugerencias | `/director/feedback` | Feedback al equipo Vakdor |

### 5.2 Asesor — Sidebar (`components/asesor-sidebar.tsx`)

| Sección | Ruta | Descripción |
|---|---|---|
| Mi Dashboard | `/asesor/dashboard` | KPIs personales |
| Pulso de Mercado | `/asesor/mercado` | Datos de mercado |
| Mi Pipeline | `/asesor/pipeline` | Leads asignados |
| Mis Propiedades | `/asesor/propiedades` | Propiedades asignadas |
| Tracking Performance | `/asesor/tracking-performance` | Mi rendimiento |
| Leads Tokko | `/asesor/leads` | Leads de Tokko asignados |
| WhatsApp Bandeja | `/asesor/whatsapp` | Bandeja de entrada WA |
| Leads WhatsApp | `/asesor/leads-whatsapp` | Leads capturados WA |
| Marketing IA | `/asesor/marketing-ia` | Generador marketing |
| Contratos IA | `/asesor/contratos-ia` | Contratos |
| Mi Calendario | `/asesor/calendario` | Agenda personal |
| Tutor IA | `/asesor/tutor-ia` | Aprendizaje IA |
| Buscador IA | `/asesor/consultor-ia` | Búsqueda de propiedades |
| Tasaciones | `/asesor/tasaciones` | Tasador |
| Biblioteca | `/asesor/documentos` | Documentos de la agencia |
| Configuración | `/asesor/configuracion` | Config personal |
| Sugerencias | `/asesor/feedback` | Feedback |

---

## 6. Base de Datos — Esquema Completo

### 6.1 Tablas Principales

El esquema está definido en `supabase/schema.sql`. Las tablas principales son:

#### Autenticación y Perfiles
- **`profiles`** — Perfil de usuario (id, email, full_name, role, agency_id, phone, avatar_url, status, created_at)
- **`agencies`** — Agencias inmobiliarias (id, name, logo_url, tokko_api_key, address, phone, email, invite_code, owner_id, marketing_ai_config, created_at)
- **`agency_invites`** — Códigos de invitación (agency_id, code, is_used, used_at, used_by)

#### Propiedades y Leads
- **`properties`** — Propiedades sincronizadas (id, tokko_id, agency_id, assigned_agent_id, title, description, price, currency, property_type, status, address, city, bedrooms, bathrooms, total_area, covered_area, images[], tokko_data, embedding vector(768))
- **`leads`** — Leads del CRM (id, agency_id, assigned_agent_id, full_name, email, phone, source, status, pipeline_stage, notes, tokko_contact_id, first_response_time, chat_analysis)
- **`lead_activities`** — Historial de actividades de leads
- **`visits`** — Visitas agendadas
- **`closings`** — Cierres de operaciones

#### WhatsApp
- **`whatsapp_instances`** — Instancias de WhatsApp (id, agency_id, token, phone_number_id, business_id, evo_instance_name, integration_type, templates_status, flows_active)
- **`wa_conversations`** — Conversaciones (id, agency_id, instance_id, contact_phone, contact_name, status, bot_active, unread_count, last_message_at, last_inbound_at, etiquetas[], score, pipeline_stage, funnel_status, visit_status, follow_ups_sent, follow_ups_history, requires_follow_up, recovery_stage, next_follow_up_at, opt_out, metricas jsonb)
- **`wa_messages`** — Mensajes individuales (id, conversation_id, agency_id, content, role, message_type, wamid, metadata)
- **`wa_templates`** — Templates de WhatsApp (id, agency_id, template_name, status, components, rejection_reason, meta_template_id)
- **`n8n_chat_histories`** — Historial de chat para n8n (session_id = conversation_id, message jsonb)

#### IA y Documentos
- **`consultor_chat_sessions`** — Sesiones del Consultor IA
- **`consultor_chat_messages`** — Mensajes del Consultor IA
- **`tutor_chat_sessions`** — Sesiones del Tutor IA
- **`tutor_chat_messages`** — Mensajes del Tutor IA
- **`agency_documents`** — Documentos subidos (con embedding para RAG)
- **`ipc_profiles`** — Perfiles de IPC para Marketing IA (Ideal Prospect Client)
- **`generated_images`** — Imágenes generadas por Marketing IA
- **`valuations`** — Tasaciones generadas

#### Contratos
- **`contract_templates`** — Plantillas de contratos
- **`contratos`** — Contratos generados (template_id, tipo, form_data, estado)
- **`contract_signatures`** — Firmas digitales

#### Mercado
- **`mercado_icc`** — Índice de Costo de Construcción (IDECBA). 1 fila (`id=1`)
- **`mercado_zonas`** — Precios por zona (Zonaprop), histórico por `(zona, mes_reporte)`
- **`mercado_barrios`** — Precio m² por barrio: oferta (`precio_m2_usd`, Mudafy) y cierre (`precio_cierre_m2_usd`)
- **`mercado_escrituras`** — Escrituras CABA mensual (`periodo` PK, Colegio de Escribanos)
- **`mercado_stats`** — Estadísticas agregadas de cierre (Reporte Inmobiliario)

#### Analytics
- **`dashboard_conversational_insights`** — Cache de análisis conversacional agregado

#### Admin
- **`admin_vakdor_users`** — Usuarios super-admin
- **`audit_logs`** — Logs de auditoría
- **`ai_credit_transactions`** — Transacciones de créditos IA

#### Push
- **`push_subscriptions`** — Suscripciones a notificaciones push

### 6.2 Funciones RPC (Supabase)

| Función | Uso |
|---|---|
| `match_properties(query_embedding, match_threshold, match_count, p_agency_id)` | Búsqueda vectorial de propiedades (cosine similarity) |
| `match_agency_documents(query_embedding, match_threshold, match_count, p_agency_id, p_user_role)` | Búsqueda vectorial de documentos (RAG) |
| `consume_ai_credits(p_agency_id, p_user_id, p_feature, p_amount, p_summary)` | Consume créditos IA y retorna txId |
| `update_ai_transaction_cost(p_transaction_id, p_input_tokens, p_output_tokens, p_usd_cost)` | Actualiza costo real post-generación |

### 6.3 RLS (Row Level Security)

Todas las tablas principales tienen políticas RLS basadas en:
```sql
-- Patrón típico:
CREATE POLICY "Users can view own agency data" ON properties
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );
```

Las tablas de webhook (`wa_messages`, `wa_conversations`) usan `service_role_key` (admin client) para bypass de RLS durante inserciones desde webhooks externos.

---

## 7. Integración Tokko Broker (CRM)

### 7.1 Sincronización de Propiedades

**Endpoint:** `POST /api/tokko/sync`  
**Archivo:** `app/api/tokko/sync/route.ts`

**Flujo:**
1. Requiere autenticación (`requireTenant()`)
2. Rate limit: 1 req / 5 min por agencia (`LIMITS.TOKKO_SYNC`)
3. Obtiene `tokko_api_key` de la tabla `agencies`
4. Hace fetch a `https://tokkobroker.com/api/v1/property/?key={KEY}&format=json&limit=100&offset={n}`
5. Paginación automática hasta agotar resultados
6. Para cada propiedad de Tokko:
   - Mapea campos: `publication_title → title`, `operations[0].prices[0] → price/currency`, etc.
   - Extrae imágenes: `photos[].image`
   - Mapea agente: busca `agent_id` del agente Tokko en `profiles.tokko_agent_id`
   - Genera embedding del título+descripción+dirección via `generateEmbedding()`
7. Upsert masivo en `properties` usando `adminClient` (bypass RLS) con `onConflict: 'tokko_id,agency_id'`

**API Tokko usada:**
```
GET https://tokkobroker.com/api/v1/property/?key={KEY}&format=json&limit=100&offset={n}
```

### 7.2 Sincronización de Leads

**Endpoint:** `POST /api/tokko/sync-leads`  
**Archivo:** `app/api/tokko/sync-leads/route.ts`

**Flujo:**
1. Autenticación + Rate limit
2. Fetch paginado a Tokko API con delay de 350ms entre requests (respeta rate limits de Tokko)
3. Para cada contacto/lead:
   - Mapea datos del contacto
   - Asocia `assigned_agent_id` si tiene agente asignado
4. Upsert en `leads` con `adminClient`

**API Tokko usada:**
```
GET https://tokkobroker.com/api/v1/contact/?key={KEY}&format=json&limit=20&offset={n}
```

### 7.3 Proxy Tokko

**Endpoint:** `GET /api/tokko-proxy/[...path]`  
**Archivo:** `app/api/tokko-proxy/[...path]/route.ts`

Proxy transparente para cualquier endpoint de Tokko API. Inyecta automáticamente el `tokko_api_key` de la agencia del usuario.

**Uso:** El frontend puede hacer `fetch('/api/tokko-proxy/property/12345')` y el proxy hace `GET https://tokkobroker.com/api/v1/property/12345/?key={KEY}`.

---

## 8. Integración WhatsApp — Doble Vía

PRISMA soporta **dos integraciones de WhatsApp** simultáneamente:

### 8.1 Evolution API (Preferida)

Evolution API actúa como intermediario entre PRISMA y WhatsApp Business.

#### 8.1.1 Recepción de Mensajes

**Endpoint:** `POST /api/webhooks/evolution`  
**Archivo:** `app/api/webhooks/evolution/route.ts`

**Flujo completo de un mensaje entrante:**

1. **Recepción:** Evolution API envía webhook con el mensaje
2. **Identificación:** Busca `whatsapp_instances` por `evo_instance_name` → obtiene `agency_id`
3. **Conversación:**
   - Busca conversación existente por `instance_id + contact_phone`
   - Si no existe → crea nueva con `bot_active: true`, `status: 'active'`
   - Si existe → incrementa `unread_count`, actualiza `last_message_at`
4. **Mensaje:** Inserta en `wa_messages` con role `'lead'`
5. **Contacto:** Sincroniza datos del contacto (nombre) en la conversación
6. **Bot IA (si activo):**
   - Obtiene últimos 10 mensajes de la conversación para contexto
   - Obtiene etiquetas y score actuales
   - Construye `enrichedPayload` con toda la información
   - Dispara POST a `N8N_WEBHOOK_URL` con timeout de 25s
   - El payload incluye:
     ```json
     {
       "debug_v": "5.0_evo_final",
       "webhook_event_id": "uuid",
       "agency_id": "...",
       "conversation_id": "...",
       "contact_phone": "...",
       "contact_name": "...",
       "message": { "id", "content", "type", "wamid" },
       "conversation": { "etiquetas", "score", "status", "bot_active" },
       "history": [{ "role", "content", "at" }],
       "reply_url": "https://app/api/n8n/reply"
     }
     ```
7. **Bot Inactivo (modo manual):**
   - Guarda el mensaje en `n8n_chat_histories` para que n8n tenga contexto cuando el bot se reactive
   - Formato: `{ type: 'human', content: '# Mensaje a responder del usuario: ...' }`

#### 8.1.2 Envío de Mensajes (Texto/Media)

**Endpoint:** `POST /api/n8n/reply`  
**Archivo:** `app/api/n8n/reply/route.ts`

**Flujo de envío:**

1. **Seguridad:** Verifica `N8N_REPLY_SECRET`
2. **Validación Anti-Cruce:** Si `instance_name` viene en el payload, verifica que coincida con la instancia real de la conversación
3. **Si bot fue pausado:** Descarta la respuesta (el humano tomó control)
4. **Normalización de media_type:** Corrige typos comunes (ej: "imege" → "image")
5. **Delay de Tipeo:** Calcula delay proporcional a la longitud del mensaje (~40ms/char, min 800ms, max 4000ms)
6. **Envío via Evolution API:**
   ```
   POST {EVOLUTION_API_URL}/message/sendText/{instanceName}  — para texto
   POST {EVOLUTION_API_URL}/message/sendMedia/{instanceName} — para media
   
   Headers: { apikey: EVOLUTION_API_KEY }
   Body: {
     number: "5491112345678",
     delay: 2000,
     text: "Hola! ...",
     options: { presence: 'composing' }  // Muestra "escribiendo..."
   }
   ```
7. **Persistencia:** Guarda el mensaje en `wa_messages` con role `'bot'` y metadata `{ source: 'n8n' }`
8. **Actualización:** Actualiza `last_message_at` + opcionalmente `score` y `etiquetas`
9. **Realtime Broadcast:** Notifica al frontend via Supabase channels:
   ```typescript
   supabase.channel(`agency-${agency_id}`).send({
     type: 'broadcast',
     event: 'refresh-whatsapp',
     payload: { conversation_id, type: 'bot_reply' }
   })
   ```

#### 8.1.3 Envío de Templates

**Endpoint:** `POST /api/whatsapp/dispatch`  
**Archivo:** `app/api/whatsapp/dispatch/route.ts`

**Flujo:**

1. **Seguridad:** Verifica `DISPATCH_SECRET` via header `x-api-key`
2. **Prefijado de Templates:** Cada agencia tiene un prefijo único: `ag{agency_id[0:6]}_` 
   - Ejemplo: `ag3f8b2c_seg_f1_seguimiento`
3. **Resolución de Texto:** Busca el template en `wa_templates`, sustituye variables `{{1}}`, `{{2}}`, etc.
4. **Envío via Evolution API:**
   ```
   POST {EVOLUTION_API_URL}/message/sendTemplate/{instanceName}
   Body: {
     number: "...",
     name: "ag3f8b2c_seg_f1_seguimiento",
     language: "es_AR",
     variables: [{ type: "body", parameters: [{ type: "text", text: "valor" }] }]
   }
   ```
5. **Persistencia doble:**
   - Guarda en `wa_messages` como role `'bot'`, message_type `'template'`
   - Guarda en `n8n_chat_histories` para que el agente IA tenga contexto
6. **Follow-Up History:** Registra el evento en `wa_conversations.follow_ups_history` (array JSONB inmutable) con snapshot del estado actual:
   ```json
   {
     "type": "seg_f1_seguimiento",
     "template": "ag3f8b2c_seg_f1_seguimiento",
     "at": "2026-06-04T...",
     "wamid": "...",
     "snapshot": {
       "funnel_status": "open",
       "follow_ups_sent": 1,
       "visit_status": "none"
     }
   }
   ```
7. **Broadcast Realtime** al frontend

### 8.2 Meta Cloud API (Fallback)

#### 8.2.1 Webhook de Meta

**Endpoint:** `POST /api/webhooks/meta`  
**Archivo:** `app/api/webhooks/meta/route.ts`

**Verificación GET:**
```
GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=PrismaSaaS2026_Verificacion!&hub.challenge=xxx
```

**Flujo POST:**

1. Verifica `payload.object === 'whatsapp_business_account'`
2. **Caso 1 — Template Status Update:**
   - Campo: `message_template_status_update`
   - Actualiza `wa_templates.status` (APPROVED, REJECTED, PAUSED)
3. **Caso 2 — Mensajes Entrantes:**
   - Campo: `messages` + `val.messages`
   - Identifica instancia por `phone_number_id`
   - Mismo flujo que Evolution: crear/actualizar conversación, guardar mensaje
   - Soporta tipos: `text`, `image`, `interactive` (botones/listas)
   - Dispara n8n webhook con el mismo enrichedPayload

#### 8.2.2 Envío Directo via Meta (en n8n/reply)

Si `integration_type !== 'evolution'`:
```
POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
Headers: { Authorization: Bearer {token} }
Body: {
  messaging_product: 'whatsapp',
  to: '5491112345678',
  type: 'text',
  text: { body: '...' }
}
```

### 8.3 Bot Reply Legacy

**Endpoint:** `POST /api/messages/bot-reply`  
**Archivo:** `app/api/messages/bot-reply/route.ts`

Versión anterior del endpoint de respuesta, usa `BOT_REPLY_SECRET` para auth. Envía solo via Evolution API.

---

## 9. Motor de Automatización n8n

### 9.1 Arquitectura

n8n es el orquestador externo que maneja la lógica de IA conversacional del bot de WhatsApp.

**Flujo completo:**

```
Lead envía WA mensaje
    ↓
PRISMA webhook (Evolution/Meta) recibe
    ↓
Guarda en DB + verifica bot_active
    ↓
POST a N8N_WEBHOOK_URL (enrichedPayload)
    ↓
n8n procesa con IA (usa historial de n8n_chat_histories)
    ↓
n8n genera respuesta
    ↓
POST a {APP_URL}/api/n8n/reply
    ↓
PRISMA envía al lead via Evolution/Meta + guarda en DB
```

### 9.2 Templates de Seguimiento

PRISMA inyecta 8 templates automáticos para cada agencia:

| Sufijo | Propósito |
|---|---|
| `seg_f1_seguimiento` | Primer seguimiento (follow-up 1) |
| `seg_f2_valor` | Segundo seguimiento (aporta valor) |
| `seg_f3_breakup` | Tercer seguimiento (último intento, "breakup") |
| `visita_recordatorio_24h` | Recordatorio de visita a 24 horas |
| `visita_recordatorio_3h` | Recordatorio de visita a 3 horas |
| `visita_recordatorio_1h` | Recordatorio de visita a 1 hora |
| `visita_post_noshow` | Post no-show de visita |
| `reactivacion_snoozed` | Reactivación de leads "dormidos" |

Cada template tiene el prefijo `ag{agency_id[0:6]}_` para aislamiento multi-tenant en la cuenta de WhatsApp Business.

### 9.3 Tabla `n8n_chat_histories`

Almacena el historial de conversación en el formato que n8n (LangChain) espera:
- `session_id`: ID de la conversación de WhatsApp (`wa_conversations.id`)
- `message`: Objeto JSON con estructura LangChain:
  ```json
  {
    "type": "human" | "ai",
    "content": "...",
    "additional_kwargs": {},
    "response_metadata": {},
    "tool_calls": [],
    "invalid_tool_calls": []
  }
  ```

---

## 10. Módulo de IA — Buscador IA (Ex Consultor IA)

**Endpoint:** `POST /api/ai/consultor`  
**Archivo:** `app/api/ai/consultor/route.ts`  
**Modelo:** OpenAI GPT-4.1-mini (via `openaiIA`)

### 10.1 Propósito

Asistente avanzado de búsqueda de propiedades. Ahora opera bajo un formato de "Buscador Inteligente", combinando propiedades de la cartera interna (Tokko) y propiedades globales pre-sincronizadas de Roomix.

### 10.2 Arquitectura de Datos (Roomix Crawler)

El Buscador IA se nutre de la tabla `roomix_properties`, la cual es alimentada diariamente por un **Docker Worker Automático** (carpeta `roomix-sync`).
- **Tecnología del Crawler:** Utiliza Playwright (en modo Stealth) para bypassear bloqueos anti-bot y extrae datos estructurados JSON-LD de las fichas de Roomix.
- **Worker de Producción:** Se ejecuta como un contenedor Docker en Easypanel, utilizando `node-cron` (disparándose a las 03:00 AM) y `child_process.spawn` para aislar el proceso y evitar fugas de memoria del Chromium.
- **Despliegue & Health Check:** El Worker levanta un mini servidor HTTP nativo en el puerto 80 (`cron.js`) y ejecuta Node directamente (`CMD ["node", "cron.js"]` en `Dockerfile`) para cumplir con los requerimientos de Health Check de Easypanel, evitando errores de tipo SIGTERM y garantizando que el proceso se mantenga vivo.
- **Imagen Docker:** `mcr.microsoft.com/playwright:v1.60.0-jammy`

### 10.3 Flujo Completo de Búsqueda

1. **Auth + Créditos:** `requireTenant()` + `consumeAiCredits("consultor_ia", 1)`
2. **Gestión de Sesión:** Crea o recupera `consultor_chat_sessions`
3. **Análisis de Intent con IA:**
   - Detecta si el lead busca propiedades (RETRIEVAL) o hace consultas generales (GENERAL).
   - Identifica filtros duros (precio, ambientes, operación) y filtros blandos (amenities como "luminoso", "pileta").
   
4. **Si intent === RETRIEVAL:**
   
   a. **Búsqueda Híbrida Vectorial:**
   Se generan embeddings del mensaje y se cruzan simultáneamente contra dos fuentes de datos usando funciones RPC de Supabase:
   - `match_properties` (para propiedades internas de Tokko Broker).
   - `match_roomix_properties` (para el catálogo global extraído por el Docker Worker).
   
   b. **Búsqueda por Filtros Estructurados:**
   Además de la búsqueda vectorial, se aplican filtros `ILIKE` en direcciones, barrios, precios y conteo de ambientes (extrayendo variables directamente del JSON-LD de Roomix y Tokko).
   
   c. **Manejo de Imágenes y CDN:**
   Las propiedades de Roomix consumen imágenes de alta calidad autorizadas vía `next.config.mjs` (`cdn.roomix.ai`).
   
   d. **Deduplicación:** Excluye propiedades ya sugeridas en la sesión actual para no repetir.

5. **Generación de Respuesta y Renderizado Frontend:**
   El contexto combinado (Internas + Roomix) se envía a `openaiIA` con el prompt estructurado de "Buscador IA" rioplatense.
   La IA debe retornar una respuesta amigable, y las tarjetas visuales se renderizan dinámicamente en el frontend basadas en los metadatos inyectados (`consultor-results.tsx`).
   - **Mapeo de Agentes:** Al mostrar propiedades internas, se intenta hacer JOIN con la tabla `profiles` (`agent_profile`). Si no hay match relacional, se usa como fallback el nombre extraído directamente de la columna JSONB `assigned_agent` traída de Tokko, evitando el estado "Sin asignar".
   - **Enlaces de Propiedades:** Los botones de "Ver Ficha" de propiedades internas enlazan directamente a la publicación real (`tokko_data.public_url`), mientras que las de la red de Roomix utilizan su respectiva ficha externa (`canonical_url`).

6. **Tracking de costos:** `updateAiTransactionCost()` con tokens reales consumidos.

### 10.4 Endpoints Adicionales

- `GET /api/ai/consultor?sessionId=xxx` → Mensajes de una sesión
- `GET /api/ai/consultor?agencyId=xxx` → Todas las sesiones del usuario
- `DELETE /api/ai/consultor?sessionId=xxx` → Borrar sesión
- `PATCH /api/ai/consultor` → Renombrar sesión

---

## 11. Módulo de IA — Tutor

**Endpoint:** `POST /api/ai/tutor`  
**Archivo:** `app/api/ai/tutor/route.ts`  
**Modelo:** OpenAI GPT-4.1-mini (via `openaiIA`)

### 11.1 Propósito

Mentor IA para capacitación del equipo. Usa RAG (Retrieval-Augmented Generation) contra los documentos subidos por la agencia.

### 11.2 Flujo

1. **Auth + Créditos:** `requireTenant()` + `consumeAiCredits("tutor_ia", 1)`
2. **Sesión:** Crea/recupera `tutor_chat_sessions`
3. **Intent Analysis:** Determina RETRIEVAL vs GENERAL
4. **Si RETRIEVAL:**
   ```typescript
   const queryEmbedding = await generateEmbedding(message)
   supabase.rpc('match_agency_documents', {
     query_embedding: queryEmbedding,
     match_threshold: 0.15,
     match_count: 5,
     p_agency_id: agencyId,
     p_user_role: role  // Filtra por visibilidad del documento
   })
   ```
5. **Generación:** Usa contexto de documentos + historial. Personalidad: "asesor corporativo" en español rioplatense formal.
6. **Topic Summarization:** Cada 4 mensajes, genera título/resumen de la sesión

### 11.3 Endpoints Adicionales

- `GET /api/ai/tutor?sessionId=xxx` → Mensajes
- `GET /api/ai/tutor` → Sesiones del usuario
- `PATCH /api/ai/tutor` → Renombrar sesión
- `DELETE /api/ai/tutor?sessionId=xxx` → Borrar sesión

---

## 12. Módulo de IA — Análisis de Chat

**Endpoint:** `POST /api/ai/analyze-chat`  
**Archivo:** `app/api/ai/analyze-chat/route.ts`  
**Modelo:** Gemini 2.0 Flash (via `prismaIA`)

### 12.1 Propósito

Analiza un fragmento de chat de WhatsApp (pegado por el usuario) y extrae métricas comerciales.

### 12.2 Flujo

1. **Auth + Rate Limit:** 30 req/hora por userId
2. **Validación:** Zod schema (min 10, max 50000 chars)
3. **Parsing:** `parseWhatsAppChat()` limpia el formato de exportación de WA
4. **Prompt a Gemini:** Analiza como "experto analista comercial inmobiliario"
5. **Output JSON:**
   ```json
   {
     "lead_name": "...",
     "phone": "...",
     "search_intent": "Busca 3 ambientes en Palermo...",
     "response_time_eval": "Respuesta en 2 horas...",
     "lead_attitude": "interesado",
     "commercial_process_eval": "...",
     "summary": "...",
     "next_step": "Agendar visita al depto de..."
   }
   ```

---

## 13. Módulo Marketing IA

### 13.1 Perfiles IPC (Ideal Prospect Client)

Los IPC son perfiles estratégicos de marketing que definen:
- **Tipo:** `captar` (captar propietarios) o `vender` (vender propiedades)
- **Flow Data:** Datos específicos del tipo:
  - **Captar:** tipo_propietario, motivo_venta, urgencia, preocupaciones, objeción_principal, angulo_marketing, tono, promesa_central, CTA
  - **Vender:** tipo_comprador_ideal, necesidad_concreta, atractivos_propiedad, angulo_copy, mensaje_central, CTA, propiedad_tokko_id (opcional)

### 13.2 Generación de Copy

**Endpoint:** `POST /api/marketing-ia/generate-copy`  
**Archivo:** `app/api/marketing-ia/generate-copy/route.ts`  
**Modelo:** Gemini 2.0 Flash (`prismaIA`)

**Flujo:**
1. Obtiene IPC del usuario
2. Si hay `propiedad_tokko_id` → fetch datos reales de Tokko API
3. Mapea ángulo de marketing: PAS, autoridad, transformación, social_proof, curiosidad, urgencia, aspiracional, datos
4. Mapea nivel de consciencia: 0 (inconsciente) → 4 (muy consciente)
5. Genera prompt con toda la estrategia del IPC + datos de propiedad
6. **Output:**
   - Copy tipo `post/historia`: `{ hook, desarrollo, cta }`
   - Copy tipo `video`: `{ hook, problema, agitacion, solucion, cta }`

### 13.3 Generación en Batch

**Endpoint:** `POST /api/marketing-ia/generate-batch`  
**Archivo:** `app/api/marketing-ia/generate-batch/route.ts`

Genera **3 variaciones** simultáneas con ángulos PAS, Transformación y Autoridad/Datos en una sola llamada a Gemini. Output: array de 3 objetos.

### 13.4 Generación de Imágenes

**Endpoint:** `POST /api/marketing-ia/generate-image`  
**Archivo:** `app/api/marketing-ia/generate-image/route.ts`  
**Modelo:** Gemini Imagen 3.0 Generate 002

**Flujo:**
1. Obtiene branding de la agencia (`marketing_ai_config`): colores, logo, tipografía
2. Si hay logo → lo descarga y envía como imagen de referencia al modelo
3. Construye prompt con:
   - Formato: reels (1080x1920), post (1080x1080), historia (1080x1920)
   - Estilo: moderno, lujoso, cálido, corporativo, vibrante
   - Hook del copy a incluir en la imagen
   - Datos de la propiedad (si aplica)
4. Genera imagen via `generateImage(prompt, 'pro', imageParts)`
5. Sube a Supabase Storage (`marketing-images`)
6. Guarda registro en `generated_images`
7. Costo: ~$0.06 USD por imagen (Imagen 3 Pro)

### 13.5 Settings de Marketing

**Endpoint:** `GET/POST /api/marketing-ia/settings`  
**Endpoint:** `POST /api/marketing-ia/settings/upload-logo`

Gestiona la configuración de branding de la agencia:
- Colores de marca (`brand_colors[]`)
- Tipografía (`brand_font`: sans, serif, script, display)
- Logo (URL en Storage)
- Posición y tamaño del logo

### 13.6 Búsqueda de Propiedades Tokko

**Endpoint:** `GET /api/marketing-ia/tokko-search`

Busca propiedades en la cartera Tokko de la agencia para vincular a un IPC de tipo "vender".

---

## 14. Módulo de Contratos IA

### 14.1 CRUD de Contratos

**Endpoint:** `GET/POST /api/contratos`  
**Archivo:** `app/api/contratos/route.ts`

- **GET:** Lista contratos de la agencia, ordenados por `created_at DESC`
- **POST:** Crea nuevo contrato con: `template_id`, `tipo`, `nombre_referencia`, `estado` (default: "borrador"), `form_data` (JSON)

### 14.2 Templates de Contratos

**Endpoint:** `GET/POST /api/contract-templates`  
**Endpoint:** `PUT/DELETE /api/contract-templates/[id]`  
**Endpoint:** `PATCH /api/contract-templates/[id]/activate`

Gestión de plantillas reutilizables para contratos.

### 14.3 Conversión de Template

**Endpoint:** `POST /api/contratos/convert-template`

Convierte una plantilla de contrato a un contrato específico, llenando variables del formulario.

### 14.4 Firma y Finalización

**Endpoint:** `POST /api/contratos/generate-pdf`  
**Archivo:** `app/api/contratos/generate-pdf/route.ts`

1. Consume 5 créditos IA
2. Guarda firmas digitales en `contract_signatures` (nombre, DNI, imagen base64)
3. Actualiza estado del contrato: "borrador" → "pendiente_firma" → "firmado"

### 14.5 Firmas

**Endpoint:** `GET/POST /api/contratos/[id]/signatures`

CRUD de firmas digitales asociadas a un contrato.

---

## 15. Módulo de Tasaciones IA

> **Nota (revisión jun-2026):** existen **dos implementaciones** de tasaciones y conviene no confundirlas:
> - **La que está viva y se usa hoy** es el **Wizard MCM client-side** (ver 15.2) que corre en `/asesor/tasaciones` y `/director/tasaciones`, calcula con `lib/tasacion/calculos.ts` y persiste en la tabla `tasaciones`.
> - **La de abajo (15.1)** es una implementación **legacy** basada en Gemini (`/api/valuation/generate` + tabla `valuations`). En la revisión no se encontró **ningún** `fetch` ni import del endpoint desde el frontend, por lo que **parece código muerto**. Se documenta y **se conserva por precaución** (no fue eliminada). Lo mismo aplica a la función `getAsesorKPIs` (`lib/queries/asesor.ts`) y al hook `useAsesorDashboard`, que solo consumían esta rama y no están enganchados a ninguna página.

### 15.1 Flujo (LEGACY — posible código muerto, sin uso confirmado en frontend)

1. **Validación Zod:** tipo, ubicación, metros², ambientes, condición, extra
2. **Rate Limit:** 20 req/hora por agencia
3. **Créditos:** `consumeAiCredits("tasador_ia", 1)`
4. **Prompt:** "Tasador inmobiliario experto en el mercado Argentino"
5. **Output JSON:**
   ```json
   {
     "estimated_value_range": { "min": 85000, "max": 110000 },
     "suggested_price": 95000,
     "price_per_sqm": 2375,
     "market_analysis": "...",
     "comparable_traits": "...",
     "confidence_score": 0.85,
     "disclaimer": "Esta es una estimación generada por IA..."
   }
   ```
6. Guarda resultado en `valuations`

> La tabla `valuations` solo era alimentada por este endpoint. Como el endpoint no se invoca desde el frontend, la tabla queda sin alimentar (la métrica que la leía, `getAsesorKPIs`, tampoco se renderiza). **La tabla se mantiene** —no se dropeó— para no arriesgar datos legacy.

### 15.2 Interfaz de Usuario — Wizard MCM (`/asesor/tasaciones`, `/director/tasaciones`)

La pantalla de Tasaciones es un **wizard de 4 pasos** (Método Comparativo de Mercado homogeneizado). Ambas rutas (asesor y director) son **idénticas** e importan los **mismos componentes compartidos** desde `app/asesor/tasaciones/components/`, por lo que cualquier cambio impacta a los dos roles a la vez.

| Paso | Componente | Función |
|---|---|---|
| 1 | `step1-sujeto.tsx` | Carga del inmueble a tasar (identificación, superficies, características, amenidades, situación) |
| 2 | `step2-comparables.tsx` | Alta de comparables (mín. 3): manual o importados desde Tokko (`/api/tokko-proxy/property`) |
| 3 | `step3-grilla.tsx` | Matriz de homogeneización editable (factores por columna, outliers, exclusiones, ponderado) |
| 4 | `step4-resultado.tsx` | Informe final: rango min/sugerido/máx, gráfico de dispersión, tabla de testigos, imprimir/PDF |

- El cálculo es **client-side** (`lib/tasacion/calculos.ts`, `lib/tasacion/types.ts`), reactivo vía `useMemo`.
- Persistencia: tabla `tasaciones` en Supabase (borrador/finalizada) con autoguardado entre pasos e historial (últimas 10 por usuario).

### 15.3 Responsividad móvil (actualización Junio 2026)

Se corrigieron problemas de la vista de celular del wizard (afecta asesor y director por ser componentes compartidos), solo con clases Tailwind responsivas, **sin cambios de lógica**:

- **Step 2 — cabecera:** la fila título + botones (*Buscar en Tokko* / *Agregar Manual*) ahora apila en móvil (`flex-col sm:flex-row`), evitando que los botones se apretaran contra el título.
- **Step 2 — modal "Agregar Manual":** grid de campos pasa a 1 columna en móvil (`grid-cols-1 sm:grid-cols-2`).
- **Step 2 — resultados de búsqueda Tokko:** cada fila apila info y precio/botón en móvil (`flex-col sm:flex-row`).
- **Step 4 — tarjeta central "Sugerido":** el zoom `scale-105` se limitó a `md:scale-105` para que en columna única móvil no desborde ni recorte la sombra.
- **Step 3 — grilla:** se mantiene con scroll horizontal (`overflow-x-auto`), comportamiento esperado para la matriz ancha de 11 columnas.

---

## 16. Módulo Pulso de Mercado

**Archivo principal:** `app/api/mercado/sync/route.ts`

### Principios

- **Cero datos hardcodeados / inventados.** Si una fuente no devuelve dato real, se
  graba `null` y la UI muestra "Sin datos disponibles". Una fuente que falla devuelve
  `fallback` y **nunca pisa** lo que ya hay en DB.
- **Único dato en tiempo real:** el dólar (`dolarapi.com`, vía `fetchDolares`). El
  resto son reportes oficiales con su fecha real de actualización.
- **Escritura con service-role** (`createAdminClient`): el cliente anon es bloqueado
  por RLS en silencio. La lectura pública va con anon (políticas `SELECT`).
- **Sync partido por fuente** (`?source=`): cada request del servidor queda < 10s
  para respetar el límite de **Vercel Hobby**. El botón "Actualizar" dispara las
  fuentes en paralelo desde el cliente (`components/mercado/RefreshButton.tsx`).

### Endpoint de sync

`GET /api/mercado/sync?source=<fuente>` (modo por-fuente, usado por el botón):

| `?source=` | Hace |
|---|---|
| `icc` | Sincroniza ICC |
| `zonaprop&zona=CABA\|GBA_NORTE\|GBA_OESTE` | Una zona estándar |
| `zonaprop&zona=GBA_SUR&periodo=YYYY-MM` | GBA Sur (barre día del mes dado) |
| `mudafy` | Precios de oferta por barrio |
| `escrituras` | Escrituras CABA |
| _(sin `source`)_ | Modo "todo" (cron); lento, no usado por el botón en Hobby |

En producción requiere `?secret=CRON_SECRET` solo cuando se pasa secret (cron).

### 16.1 ICC (Índice Costo de Construcción) → `mercado_icc`

**Fuente:** `estadisticaciudad.gob.ar` (XLSX mensual).
1. Prueba 6 carpetas (`/{año}/{mes}/EE_ICC_01-16.xlsx`) **en paralelo** (timeout 5s).
   La carpeta de WordPress NO coincide con el mes del reporte, por eso se lee el
   período del propio archivo (`rows[0][0]`) y se elige el más reciente.
2. Parsea con `xlsx`: nivel general, materiales, mano de obra, gastos + sus
   variaciones mensual e interanual. `UPDATE` de la fila `id=1`.

### 16.2 Zonaprop (4 zonas) → `mercado_zonas`

**Fuente:** PDFs zpindex. **Regla de URL:** los datos del mes N se publican en la
carpeta del mes **N+1**: `.../{N+1 año}/{N+1 mes}/{slug}_{N año}-{N mes}.pdf`.
- Zonas: `CABA`, `GBA Norte`, `GBA Oeste` (slug directo) y `GBA Sur` (el nombre
  incluye el día de creación → se barre día 1–28 en paralelo, solo del período ya
  confirmado por las estándar).
- Parser conservador (`pdf-parse-fork`): precio USD/m², variación interanual con
  signo, alquileres 2/3 amb. Lo no inequívoco → `null`.
- **Histórico:** upsert por `(zona, mes_reporte)` → una fila por mes (constraint
  `mercado_zonas_zona_mes_unique`). Los consumidores leen el último mes por zona.

### 16.3 Mudafy (precios de oferta por barrio) → `mercado_barrios`

**Fuente:** tabla HTML estática de `mudafy.com.ar` (Barrio · Comuna · Valor m² USD).
`UPDATE` por barrio de `precio_m2_usd` (45 barrios). No toca `precio_cierre_m2_usd`
(precios de cierre, dato real cargado aparte).

### 16.4 Escrituras CABA → `mercado_escrituras`

**Fuente:** Colegio de Escribanos CABA (un post por mes). **Esquema mensual**
(`periodo` PK, histórico). Scrapea los últimos ~8 artículos de la categoría, parsea
actos, monto, variación mensual/interanual y upsert por `periodo`. El acumulado
anual (YTD) se calcula en query, no se almacena.

### 16.5 Lectura / consumo

- `GET /api/mercado/zonaprop` y los pages → último `mes_reporte` por zona.
- `lib/mercado/fetchBarrios.ts` → barrios + **serie histórica del gráfico** (precio
  m² CABA por mes desde `mercado_zonas`, crece con cada sync).
- `lib/mercado/fetchEscrituras.ts` → último mes + acumulado YTD.
- `lib/mercado/fetchLastUpdated.ts` → `max(fecha_actualizacion)` real (no la hora de
  render) para "Datos de mercado actualizados".
- `GET /api/mercado/refresh` → revalida la caché (`revalidateTag('mercado')`).

---

## 17. Módulo Conversational Insights (Analytics)

**Endpoint:** `POST /api/conversational-insights/analyze`  
**Archivo:** `app/api/conversational-insights/analyze/route.ts`

### 17.1 Propósito

Dashboard de analytics **sin IA** que agrega métricas de todas las conversaciones de WhatsApp de la agencia. Solo accesible por directores.

### 17.2 Flujo

1. **Auth:** Solo rol `director`
2. **Período:** 7d, 30d (default), 90d, o custom (from/to)
3. **Cache:** Guarda resultados en `dashboard_conversational_insights`, refresh si > 6 horas
4. **Datos origen:** Lee `wa_conversations.metricas` (JSONB) + `wa_messages` (timestamps)
5. **Sin IA:** Toda la agregación es pura matemática sobre datos existentes

### 17.3 Bloques de Análisis

#### KPIs
- chats_unicos, leads_calificados, visitas_agendadas, reservas_confirmadas
- solicitudes_humano, derivados_a_humano, apto_credito, necesitan_vender_antes
- seguimientos_ia (templates enviados), tasa_consulta_visita, tasa_visita_reserva
- funnel_status: open, snoozed, closed_lost, closed_won, tasa_cierre_real
- compromisos: alto/medio/bajo (derivado de metricas)

#### Funnel de Conversión
- Etapas: chats_recibidos → leads_calificados → visita_agendada → reserva_confirmada
- Estado real del pipeline por funnel_status

#### Perfil del Lead Buscador
- Top tipos de operación/propiedad, ambientes, zonas/barrios
- Composición familiar, urgencia, experiencia compradora
- Inversores, preaprobación crediticia
- Top amenities, servicios, características consultadas
- Presupuesto promedio (USD compra, ARS alquiler)

#### Análisis de Demanda
- Zonas más demandadas
- Tasa de visita por tipo de propiedad y tipo de operación
- Rangos de presupuesto

#### Comportamiento Temporal
- Distribución por hora y día (heatmap)
- Día y hora pico
- Duración promedio de conversación
- Relación bot_active vs human_attended

#### Calidad de Atención
- Tasa de resolución del bot
- Objeciones frecuentes (precio, ubicación, tamaño, crédito, pareja, tiempo)
- Causas de no avance

### 17.4 Status Endpoint

**Endpoint:** `GET /api/conversational-insights/status`

Retorna el estado del análisis en progreso.

---

## 18. Módulo de Documentos / Base de Conocimiento

### 18.1 Upload y Procesamiento

**Endpoint:** `POST /api/documents/process`  
**Archivo:** `app/api/documents/process/route.ts`

**Tipos soportados:**

| Tipo | Método de Extracción |
|---|---|
| PDF | `extractTextFromDocument()` via Gemini |
| DOCX | `mammoth.extractRawText()` |
| CSV | `Papa.parse()` → JSON |
| Imágenes | `extractTextFromDocument()` via Gemini |
| YouTube | `YoutubeTranscript.fetchTranscript()` |

**Flujo:**

1. **Upload a Storage:**
   - **Path nuevo:** El frontend sube el archivo a Supabase Storage primero, luego envía el `filePath` al backend
   - **Path legacy:** El archivo viene en el body del request (< 4.5 MB)
2. **Extracción de texto** según tipo MIME
3. **Generación de embedding:** `generateEmbedding(textForEmbedding.substring(0, 5000))`
4. **Guardado en `agency_documents`:** Con campos title, type, file_url/video_url, content_text, embedding, visibility, ai_enabled, folder_id

### 18.2 Extracción de Texto

**Endpoint:** `POST /api/documents/extract`

Extrae texto de un documento ya subido (sin generar embedding).

### 18.3 Visibilidad

- `'director'` — Solo directores
- `'asesor'` — Todos los miembros de la agencia

---

## 19. Sistema de Créditos IA

### 19.1 Consumo de Créditos

**Archivo:** `lib/auth/tenant-validation.ts`

```typescript
// Pre-consumo: reserva créditos antes de la llamada IA
const txId = await consumeAiCredits("consultor_ia", 1, "Consultor: qué tenés en Palermo?")
// → Llama a supabase.rpc('consume_ai_credits', { ... })
// → Retorna el UUID de la transacción

// Post-consumo: actualiza el costo real después de la respuesta
updateAiTransactionCost(txId, inputTokens, outputTokens, usdCost)
// → Llama a supabase.rpc('update_ai_transaction_cost', { ... })
```

### 19.2 Features y Costos

| Feature | Créditos | Modelo | Costo Estimado |
|---|---|---|---|
| `consultor_ia` | 1 | GPT-4.1-mini | ~$0.40/M input, $1.60/M output |
| `tutor_ia` | 1 | GPT-4.1-mini | ~$0.40/M input, $1.60/M output |
| `marketing_ia` (copy) | 1 | Gemini 2.0 Flash | ~$0.10/M input, $0.40/M output |
| `marketing_ia` (batch) | 1 | Gemini 2.0 Flash | ~$0.10/M input, $0.40/M output |
| `marketing_ia` (image) | 2 | Imagen 3 Pro | ~$0.06/image |
| `contratos_ia` | 5 | — | — |
| `tasador_ia` | 1 | Gemini 2.0 Flash | ~$0.10/M input |
| `analisis_chat_ia` | 1 | Gemini 2.0 Flash | — |
| `documentos_ia` | 1 | Gemini Embedding | ~$0.02/M tokens |

---

## 20. Sistema de Rate Limiting

### 20.1 Rate Limiter en Memoria (`lib/rate-limiter.ts`)

Implementación en memoria con Map para desarrollo. Cada key tiene `count` y `resetAt`.

| Configuración | Límite | Ventana | Key Prefix |
|---|---|---|---|
| `LIMITS.AI` | 30 req | 1 hora | `rl:ai` |
| `LIMITS.TOKKO_SYNC` | 1 req | 5 min | `rl:tokko` |
| `LIMITS.VALUATION` | 20 req | 1 hora | `rl:valuation` |
| `LIMITS.DOCUMENTS` | 10 req | 1 hora | `rl:docs` |
| `LIMITS.AUTH` | 5 req | 15 min | `rl:auth` |

### 20.2 Rate Limiter Upstash Redis (`lib/rate-limit.ts`)

Para producción, usa Upstash Redis con sliding window:
- `loginRateLimit`: 10 req / 15 min
- `aiRateLimit`: 30 req / 1 min

---

## 21. Cron Jobs y Tareas Programadas

### 21.1 Sync Templates (`vercel.json`)

```json
{
  "crons": [{
    "path": "/api/cron/sync-templates",
    "schedule": "0 0 * * *"
  }]
}
```

**Ejecución diaria a medianoche.**

### 21.2 Lógica del Cron

**Endpoint:** `GET /api/cron/sync-templates`  
**Archivo:** `app/api/cron/sync-templates/route.ts`

**Flujo:**
1. **Auth:** Verifica `CRON_SECRET` via header Authorization
2. Busca instancias con `templates_status = 'pending'`
3. Para cada instancia:
   a. Calcula los 8 nombres de template esperados: `ag{prefix}_{sufijo}`
   b. Fetch a Meta Graph API:
   ```
   GET https://graph.facebook.com/v19.0/{business_id}/message_templates?fields=name,status,rejected_reason,id&limit=100
   Headers: { Authorization: Bearer {token} }
   ```
   c. Filtra solo los 8 templates de PRISMA
   d. Upsert en `wa_templates`
   e. Si las 8 están `APPROVED`:
      - Actualiza `templates_status = 'approved'`
      - Activa `flows_active = true` → Habilita los flujos automatizados de n8n

---

## 22. Push Notifications

**Endpoint:** `POST/DELETE /api/push/subscribe`  
**Archivo:** `app/api/push/subscribe/route.ts`

### 22.1 Suscripción

1. Recibe `endpoint`, `keys.p256dh`, `keys.auth` del Service Worker del navegador
2. Upsert en `push_subscriptions` por `user_id + endpoint`

### 22.2 Desuscripción

- Con endpoint → borra esa suscripción específica
- Sin endpoint → borra todas las suscripciones del usuario

---

## 23. Panel Admin Vakdor (Super-Admin)

### 23.1 Autenticación Separada

**Endpoint:** `POST /api/admin-vakdor/login`  
**Archivo:** `app/api/admin-vakdor/login/route.ts`

Sistema de auth **completamente separado** de Supabase Auth:
1. **Rate limit:** 5 intentos / 10 min por IP (Upstash Redis)
2. Busca en tabla `admin_vakdor_users`
3. Hash de contraseña: SHA-256 con salt = email + `ADMIN_VAKDOR_JWT_SECRET`
4. Firma JWT con `jose` → cookie `admin_vakdor_token`
5. Log de actividad en tabla de auditoría

### 23.2 Auth Utils (`lib/admin-vakdor/`)

| Archivo | Función |
|---|---|
| `auth.ts` | `signAdminToken()`, `verifyAdminToken()`, constantes de cookie |
| `guard.ts` | `requireAdmin()` — middleware de verificación para rutas admin |
| `logger.ts` | `logAdminActivity()`, `getClientIp()` |

### 23.3 Endpoints de Admin

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/admin-vakdor/agencias` | GET | Lista todas las agencias con métricas |
| `/api/admin-vakdor/agencias/[id]` | GET | Detalle de una agencia |
| `/api/admin-vakdor/agencias/[id]/creditos` | POST | Agregar créditos IA a agencia |
| `/api/admin-vakdor/agencias/[id]/estado` | PATCH | Pausar/activar agencia |
| `/api/admin-vakdor/agencias/[id]/pagos` | GET | Historial de pagos |
| `/api/admin-vakdor/agencias/[id]/sugerencias` | GET | Feedback de la agencia |
| `/api/admin-vakdor/agencias/[id]/tokko-stats` | GET | Estadísticas Tokko |
| `/api/admin-vakdor/asesores/[id]/estado` | PATCH | Pausar/activar asesor |
| `/api/admin-vakdor/directores/[id]/estado` | PATCH | Pausar/activar director |
| `/api/admin-vakdor/bloqueados` | GET | Usuarios bloqueados |
| `/api/admin-vakdor/dashboard/metricas` | GET | Métricas globales del SaaS |
| `/api/admin-vakdor/invitaciones` | GET | Códigos de invitación |
| `/api/admin-vakdor/pagos/[pago_id]` | PATCH | Gestionar pago |
| `/api/admin-vakdor/sugerencias` | GET | Todas las sugerencias |
| `/api/admin-vakdor/sugerencias/metricas` | GET | Métricas de sugerencias |
| `/api/admin-vakdor/sugerencias/[id]` | GET | Detalle de sugerencia |
| `/api/admin-vakdor/sugerencias/[id]/estado` | PATCH | Cambiar estado |
| `/api/admin-vakdor/usuarios/[id]/desbloquear` | POST | Desbloquear usuario |
| `/api/admin-vakdor/logout` | POST | Cerrar sesión admin |

---

## 24. Configuración de Despliegue (Vercel)

**Archivo:** `vercel.json`

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "outputDirectory": ".next",
  "crons": [
    {
      "path": "/api/cron/sync-templates",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**Restricciones de Vercel:**
- Timeout de funciones serverless: 25 segundos (por eso los webhooks usan `AbortSignal.timeout(25000)`)
- Las imágenes remotas requieren configuración en `next.config.mjs`:
  - `static.tokkobroker.com` — Fotos de Tokko
  - `*.supabase.co` — Imágenes en Storage
  - `images.unsplash.com` — Placeholder images

---

## 25. Variables de Entorno Completas

### Supabase
| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (con RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (bypass RLS) |

### IA / LLM
| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` | API key de Google Gemini |
| `OPENAI_API_KEY` | API key de OpenAI (para GPT-4.1-mini) |

### Tokko
| Variable | Uso |
|---|---|
| `TOKKO_API_KEY` | Key global de fallback (cada agencia tiene la suya en DB) |

### WhatsApp / Evolution
| Variable | Uso |
|---|---|
| `EVOLUTION_API_URL` | URL del servidor Evolution API |
| `EVOLUTION_API_KEY` | API key global de Evolution |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token de verificación del webhook Meta |

### n8n
| Variable | Uso |
|---|---|
| `N8N_WEBHOOK_URL` | URL del webhook de n8n para mensajes entrantes |
| `N8N_REPLY_SECRET` | Secret compartido para autenticar replies de n8n |
| `APP_URL` | URL base de la app (para construir reply_url) |

### Rate Limiting
| Variable | Uso |
|---|---|
| `UPSTASH_REDIS_REST_URL` | URL de Redis para rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Token de Redis |

---

## 27. Sistema de Temas (Claro / Oscuro)

El sistema usa **`next-themes`** con la estrategia `class` (toggle de la clase `.dark` en `<html>`). Los colores se definen como variables CSS HSL en `app/globals.css`, en dos bloques: `:root` (modo claro) y `.dark` (modo oscuro). Todo el UI debe consumir los tokens semánticos (`text-foreground`, `bg-background`, `bg-card`, `text-muted-foreground`, `bg-accent`, etc.) para ser compatible con ambos modos.

### Configuración

- **Provider:** `app/layout.tsx` → `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>`.
  - `defaultTheme="dark"`: el tema por defecto es **oscuro** (usuarios nuevos arrancan en oscuro).
  - `enableSystem={false}`: **no** se sigue la preferencia del sistema operativo. Solo existen dos temas: claro y oscuro.
- **Selector:** `components/mode-toggle.tsx` → menú con solo dos opciones: **Claro** y **Oscuro** (botón sol/luna).
- **Ubicación del selector en el header:**
  - Director: `components/director-header.tsx` (`<ModeToggle />`).
  - Asesor: `components/asesor-header.tsx` (`<ModeToggle />`).

### Regla para texto / contraste

Nunca usar `text-white` (ni `text-slate-100`, `text-neutral-300`, etc.) como color de texto **standalone** (encabezados, párrafos, valores) sobre superficies theme-aware: en modo claro la superficie se vuelve blanca y el texto desaparece. Usar siempre `text-foreground` (o `text-foreground/90`, `text-muted-foreground`).

`text-white` **sí** es válido cuando va sobre un fondo de color fijo: botones `bg-accent`/`bg-destructive`, overlays `bg-black/40` sobre imágenes, tabs activas `data-[state=active]:bg-accent`, celdas de gráficos coloreadas, o hovers que pintan fondo (`hover:bg-accent hover:text-white`).

**Excepciones intencionalmente oscuras** (fondo oscuro fijo, su texto blanco es correcto): landing pública (`app/(public)/*`), simulaciones de marketing (`components/simulations/*`), panel super-admin Vakdor (`app/admin-vakdor/*`), drafts Roomix (`roomix-sync/*`).

### Admin Vakdor
| Variable | Uso |
|---|---|
| `ADMIN_VAKDOR_JWT_SECRET` | Secret para firmar JWT de admin |

### Seguridad
| Variable | Uso |
|---|---|
| `BOT_REPLY_SECRET` | Secret para endpoint legacy de bot reply |
| `DISPATCH_SECRET` | Secret para endpoint de dispatch de templates |
| `CRON_SECRET` | Secret para cron jobs |

---

## 26. Diagrama de Flujos Principales

### 26.1 Flujo de Mensaje WhatsApp Entrante (Completo)

```
Lead envía mensaje por WhatsApp
         │
         ▼
┌─────────────────────┐
│  Evolution API /     │
│  Meta Cloud API      │
│  (intermediario)     │
└────────┬────────────┘
         │  webhook POST
         ▼
┌─────────────────────────────────┐
│  /api/webhooks/evolution        │
│  /api/webhooks/meta             │
│                                 │
│  1. Identifica instancia        │
│  2. Busca/crea conversación     │
│  3. Guarda mensaje (wa_messages)│
│  4. Verifica bot_active         │
└────────┬────────────────────────┘
         │
    ┌────┴─────┐
    │          │
  bot ON    bot OFF
    │          │
    ▼          ▼
┌──────────┐  ┌──────────────────────┐
│ Obtener  │  │ Guardar en            │
│ contexto │  │ n8n_chat_histories    │
│ (10 msgs)│  │ (para cuando se       │
│          │  │  reactive el bot)     │
└────┬─────┘  └──────────────────────┘
     │
     ▼
┌──────────────────────┐
│ POST N8N_WEBHOOK_URL │
│ (enrichedPayload)    │
│ timeout: 25s         │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  n8n procesa con IA  │
│  (usa chat_histories │
│   como memoria)      │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ POST /api/n8n/reply  │
│ { conversation_id,   │
│   reply,             │
│   update_score?,     │
│   add_etiquetas? }   │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ 1. Verifica bot aún activo       │
│ 2. Anti-cruce de instancias      │
│ 3. Calcula delay de tipeo        │
│ 4. Envía via Evolution/Meta      │
│ 5. Guarda en wa_messages         │
│ 6. Actualiza conversación        │
│ 7. Broadcast Realtime            │
└──────────────────────────────────┘
```

### 26.2 Flujo de Creación de Cuenta (Director)

```
Director llena formulario de registro
         │
         ▼
┌──────────────────────────┐
│ supabase.auth.signUp()   │
│ metadata: { role, name,  │
│  agency_name }           │
└────────┬─────────────────┘
         │
         ▼
  Email de confirmación
         │
         ▼
  Click en link de confirmación
         │
         ▼
┌──────────────────────────────────┐
│ GET /auth/callback?code=xxx      │
│                                  │
│ 1. exchangeCodeForSession()      │
│ 2. Crear profile (adminClient)   │
│ 3. Crear agency con invite_code  │
│ 4. Asociar profile → agency      │
│ 5. Crear agency_invite           │
│ 6. Sync auth metadata            │
│ 7. Redirect → /director/dashboard│
└──────────────────────────────────┘
```

### 26.3 Flujo de Consultor IA

```
Usuario escribe: "Tenés deptos en Palermo con pileta?"
         │
         ▼
┌─────────────────────────────────────┐
│ POST /api/ai/consultor              │
│                                     │
│ 1. requireTenant() + consumeCredits │
│ 2. Session management               │
│ 3. Guardar mensaje del usuario       │
│ 4. Intent Analysis (GPT-4.1-mini):  │
│    → RETRIEVAL                       │
│    → location: ["Palermo"]          │
│    → type: ["departamento"]         │
│    → amenity: ["pileta"]            │
│                                     │
│ 5a. Vector Search:                  │
│     generateEmbedding(msg) →        │
│     match_properties(embedding)     │
│                                     │
│ 5b. Text/Filter Search:            │
│     WHERE address ILIKE %Palermo%   │
│                                     │
│ 6. Type Filter: "departamento"      │
│ 7. Merge + Deduplicate              │
│ 8. Amenity Scoring: "pileta" →      │
│    busca en tags, description       │
│ 9. Top 10 results                   │
│ 10. Generate response (GPT-4.1-mini)│
│ 11. Background: titulo + resumen    │
│                                     │
│ Response:                           │
│ { content, matchedProperties[],     │
│   sessionId }                       │
└─────────────────────────────────────┘
```

### 26.4 Flujo de Follow-Up Automático

```
n8n determina que un lead necesita seguimiento
         │
         ▼
┌────────────────────────────────────┐
│ POST /api/whatsapp/dispatch        │
│ { agency_id, conversation_id,      │
│   contact_phone,                   │
│   template_name: "seg_f1",         │
│   variables: ["Juan"] }            │
│                                    │
│ 1. Calcular prefijo: ag3f8b2c      │
│ 2. Template: ag3f8b2c_seg_f1_...   │
│ 3. Resolver texto real de wa_templ │
│ 4. Enviar via Evolution/Meta       │
│ 5. Guardar en wa_messages          │
│ 6. Guardar en n8n_chat_histories   │
│ 7. Registrar en follow_ups_history │
│    (con snapshot del estado)       │
│ 8. Broadcast Realtime              │
└────────────────────────────────────┘
```

---

## 27. Arquitectura del Frontend y Lógica de Interfaz de Usuario (UI/UX)

El frontend está construido con **Next.js 15 (App Router)**, **React 19**, y **Tailwind CSS**. La biblioteca principal de componentes UI es **shadcn/ui** (Radix UI), complementada con animaciones de `lucide-react` y estado gestionado mayormente por hooks de React estándar (`useState`, `useEffect`, `useCallback`) y `zustand` en componentes complejos como el Kanban.

La aplicación se divide en dos grandes "layouts" protegidos por middleware: `/director` y `/asesor`.

### 27.1 Módulo del Director (`app/director/`)

El Director tiene acceso total a la configuración de la agencia (tenant), estadísticas globales, facturación y gestión de asesores. A continuación, el desglose funcional de cada página:

#### 1. Dashboard (`/director/dashboard`)
- **Objetivo:** Vista panorámica del rendimiento comercial.
- **Componentes Clave:**
  - `PerformanceMetricsGrid`: Tarjetas (KPIs) con leads, captaciones, reservas y cierres (total y variación porcentual).
  - `PerformanceCharts`: Gráfico de evolución temporal (barras) y distribución por canal de origen (dona).
  - `PerformanceLeaderboard`: Ranking de los asesores de la agencia.
  - `DashboardActivity`: Feed en tiempo real de los últimos eventos (ej. nuevo lead, propiedad sincronizada, etc.).
- **Datos:** Llama a `getDashboardData(agency_id)` sin filtrar por asesor.

#### 2. Pipeline / CRM (`/director/pipeline`)
- **Objetivo:** Gestión visual (Kanban) de los leads y oportunidades.
- **Lógica Interna:**
  - Une dos fuentes de datos: `leads` (provenientes de Tokko) y `wa_conversations` (provenientes de WhatsApp).
  - Mapea ambas fuentes a una interfaz común `Lead`.
  - El componente `PipelineClient` maneja el *drag & drop* entre columnas (Nuevo, Contactado, Visita, Negociación, Reserva, etc.).

#### 3. Propiedades (`/director/propiedades`)
- **Objetivo:** Catálogo de la cartera inmobiliaria de la agencia.
- **Lógica Interna:**
  - `page.tsx`: Muestra la grilla o lista (`view_toggle`) de la tabla `properties`. Permite filtrar por texto y tipo (Casa, Depto, etc.).
  - `[id]/page.tsx` (Detalle): Ficha hiper-detallada. Incluye carrusel de imágenes, ficha técnica (ambientes, m²), descripción, y datos comerciales (responsable interno asignado, creador original en Tokko, comentarios internos, precios). Cuenta con un botón oculto para desplegar el `JSON crudo` de Tokko para diagnóstico.

#### 4. Leads y WhatsApp Leads (`/director/leads` y `/director/leads-whatsapp`)
- **Objetivo:** Gestión de contactos individuales.
- **Lógica Interna `leads/[id]`:** Ficha 360 del cliente.
  - Muestra datos de contacto, propiedad consultada, etiquetas de Tokko y el ID de contacto Tokko.
  - Integra el **Análisis de Chat de PRISMA IA** (si existe), mostrando la actitud del lead, intención de búsqueda y recomendación del próximo paso.
  - Muestra el historial cronológico de actividades (`getLeadActivities`).
- **Lógica Interna `leads-whatsapp/[id]`:** Renderiza la interfaz de chat en vivo `ActiveChat` utilizando WebSockets para mensajería bidireccional.

#### 5. Configuración y Asesores (`/director/configuracion`, `/director/asesores`)
- **Objetivo:** Setup inicial y gestión del equipo.
- **Lógica Interna:**
  - **Asesores:** Invitar nuevos asesores mediante links o códigos, asignarles límites, y pausar/activar sus cuentas.
  - **Configuración:** Token de Tokko, Instancia de WhatsApp, Branding (logo y colores para Marketing IA), y facturación.

#### 6. Herramientas IA (Marketing, Contratos, Tasaciones)
- **Marketing IA (`/director/marketing-ia`):** Permite generar "Copy" creando perfiles IPC (Ideal Prospect Client), ya sea para "Vender" (buscando prop en la base) o "Captar". Permite generación simple o "En Lote" (Batch) para múltiples ángulos a la vez. También genera imágenes con Gemini Imagen 3 integrando el branding de la agencia.
- **Tasaciones (`/director/tasaciones`):** Formulario de características de la propiedad que consulta a la IA para emitir un valor mínimo, máximo y sugerido, con análisis del mercado. Consume 1 crédito.
- **Contratos (`/director/contratos-ia`):** Gestión de plantillas y conversión a contratos formales con firma digital incorporada. Consume 5 créditos por contrato.

#### 7. Tracking Performance (`/director/tracking-performance`)
- **Objetivo:** Registrar actividad comercial diaria (llamadas, prelistings, captaciones, etc.) para nutrir el Dashboard.
- **Lógica Interna:** Utiliza tabs para ver historial y para editar la "Configuración IA" de las escalas de performance (qué puntaje da cada acción).

#### 8. Asistentes Conversacionales (Tutor y Consultor IA)
- **Tutor IA (`/director/tutor`):** Chat interactivo para hacer preguntas sobre manuales o documentos internos subidos a la base de conocimiento (RAG). Consume 1 crédito por mensaje. Usa el modelo configurado y retorna las "sources" (fuentes) utilizadas.
- **Consultor IA (`/director/consultor`):** Buscador conversacional de propiedades. Un agente IA que entiende la consulta (ej. "Busco un 3 ambientes en zona norte por menos de 250k"), hace un Vector Search + Filter Search en la DB, y retorna tarjetas visuales (carrousel) de las propiedades que coinciden (incluyendo tags de *amenities* que coinciden o faltan). Consume 1 crédito.

#### 9. Calendario y Pulso de Mercado (`/director/calendario`, `/director/mercado`)
- **Calendario:** Visualiza `scheduled_visits`. Permite filtrar por asesor, cambiar vistas de mes/semana, y hacer click en una visita para ver un modal detallado (BANT score, objeciones, decisores, lead info).
- **Mercado:** Tablero de comando del mercado real. Muestra cotización del dólar (tiempo real), ICC, precios Zonaprop por zona, precios m² por barrio (Mudafy) y escrituras CABA (Colegio de Escribanos). Cada fuente con su fecha real de actualización; sin datos inventados (si falta, "Sin datos"). Sincronización por el botón "Actualizar" (`/api/mercado/sync?source=...`, una fuente por request para respetar el límite de Vercel Hobby).

---

### 27.2 Módulo del Asesor (`app/asesor/`)

El módulo del asesor hereda y reutiliza gran parte de los componentes de UI del director, pero con una capa estricta de filtros aplicada a nivel base de datos (y reforzada en UI) para garantizar que el Asesor solo vea **su propia información** o información compartida públicamente por la agencia.

#### 1. Dashboard Asesor (`/asesor/dashboard`)
- **Diferencia con Director:** Llama a `getDashboardData(agency_id, user.id)`. Solo muestra los KPIs y gráficos de las propiedades, leads y actividades asignadas a este asesor en particular. Sin embargo, muestra el ranking global (`PerformanceLeaderboard`) para que el asesor conozca su posición en la agencia.

#### 2. Pipeline Asesor (`/asesor/pipeline`)
- Mismo Kanban visual (`PipelineClient`), pero la consulta SQL de carga inicial se restringe estrictamente a `assigned_agent_id = user.id`.

#### 3. Propiedades Asesor (`/asesor/propiedades`)
- Catálogo personal. Muestra solo las propiedades que el asesor está manejando (captaciones propias o asignadas por el director para la venta). Incluye botones de acción rápida para "Recomendar a Lead" o compartir ficha.

#### 4. WhatsApp / Inbox Asesor (`/asesor/whatsapp`)
- **Objetivo:** Bandeja de entrada de mensajes asignados.
- **Lógica Interna:** 
  - Renderiza `ChatInterface`. Si el director no configuró WhatsApp, muestra un *blank state* de "WhatsApp no configurado" (no le permite configurar la instancia a él).
  - El inbox lista solo las conversaciones donde el asesor es el responsable. 

#### 5. Restricciones en Herramientas IA
Las herramientas como **Tasaciones, Tutor IA y Consultor IA** funcionan de idéntica manera visualmente, pero debitan créditos de la "bolsa general de la agencia" (Tenant). El asesor no puede recargar créditos, y si la agencia se queda sin saldo, la UI se bloquea para el asesor informando que debe contactar al director.

---

## APÉNDICE: Mapa Completo de API Routes

| Ruta | Método(s) | Auth | Descripción |
|---|---|---|---|
| `/api/admin-vakdor/login` | POST | Público (rate limited) | Login admin |
| `/api/admin-vakdor/logout` | POST | Admin JWT | Logout admin |
| `/api/admin-vakdor/agencias` | GET | Admin JWT | Lista agencias |
| `/api/admin-vakdor/agencias/[id]` | GET | Admin JWT | Detalle agencia |
| `/api/admin-vakdor/agencias/[id]/creditos` | POST | Admin JWT | Agregar créditos |
| `/api/admin-vakdor/agencias/[id]/estado` | PATCH | Admin JWT | Cambiar estado |
| `/api/admin-vakdor/agencias/[id]/pagos` | GET | Admin JWT | Pagos |
| `/api/admin-vakdor/agencias/[id]/sugerencias` | GET | Admin JWT | Feedback |
| `/api/admin-vakdor/agencias/[id]/tokko-stats` | GET | Admin JWT | Stats Tokko |
| `/api/admin-vakdor/asesores/[id]/estado` | PATCH | Admin JWT | Estado asesor |
| `/api/admin-vakdor/bloqueados` | GET | Admin JWT | Usuarios bloqueados |
| `/api/admin-vakdor/dashboard/metricas` | GET | Admin JWT | Métricas globales |
| `/api/admin-vakdor/directores/[id]/estado` | PATCH | Admin JWT | Estado director |
| `/api/admin-vakdor/invitaciones` | GET | Admin JWT | Invitaciones |
| `/api/admin-vakdor/pagos/[pago_id]` | PATCH | Admin JWT | Gestionar pago |
| `/api/admin-vakdor/sugerencias` | GET | Admin JWT | Sugerencias |
| `/api/admin-vakdor/sugerencias/metricas` | GET | Admin JWT | Métricas sug. |
| `/api/admin-vakdor/sugerencias/[id]` | GET | Admin JWT | Detalle sug. |
| `/api/admin-vakdor/sugerencias/[id]/estado` | PATCH | Admin JWT | Estado sug. |
| `/api/admin-vakdor/usuarios/[id]/desbloquear` | POST | Admin JWT | Desbloquear |
| `/api/ai/analyze-chat` | POST | Sesión | Análisis de chat WA |
| `/api/ai/consultor` | GET, POST, PATCH, DELETE | Tenant | Consultor IA |
| `/api/ai/tutor` | GET, POST, PATCH, DELETE | Tenant | Tutor IA |
| `/api/asesor/creditos` | GET | Tenant | Consultar créditos |
| `/api/auth/check-status` | GET | Sesión | Verificar estado cuenta |
| `/api/contract-templates` | GET, POST | Sesión | Templates contratos |
| `/api/contract-templates/[id]` | PUT, DELETE | Sesión | CRUD template |
| `/api/contract-templates/[id]/activate` | PATCH | Sesión | Activar template |
| `/api/contratos` | GET, POST | Sesión | CRUD contratos |
| `/api/contratos/convert-template` | POST | Sesión | Convertir template |
| `/api/contratos/generate-pdf` | POST | Tenant | Finalizar + firmar |
| `/api/contratos/[id]` | GET, PATCH, DELETE | Sesión | Contrato individual |
| `/api/contratos/[id]/signatures` | GET, POST | Sesión | Firmas |
| `/api/conversational-insights/analyze` | POST | Director | Analytics WA |
| `/api/conversational-insights/status` | GET | Director | Estado análisis |
| `/api/cron/sync-templates` | GET | CRON_SECRET | Sync templates Meta |
| `/api/debug/env-check` | GET | — | Debug env vars |
| `/api/debug/rls-check` | GET | — | Debug RLS |
| `/api/documents/extract` | POST | Sesión | Extraer texto |
| `/api/documents/process` | POST | Sesión | Upload + proceso |
| `/api/marketing-ia/generate-batch` | POST | Tenant | 3 copys a la vez |
| `/api/marketing-ia/generate-copy` | POST | Tenant | 1 copy |
| `/api/marketing-ia/generate-image` | POST | Tenant | Imagen IA |
| `/api/marketing-ia/settings` | GET, POST | Tenant | Config branding |
| `/api/marketing-ia/settings/upload-logo` | POST | Tenant | Subir logo |
| `/api/marketing-ia/tokko-search` | GET | Tenant | Buscar propiedades |
| `/api/mercado/refresh` | GET | Sesión | Refresh datos |
| `/api/mercado/sync` | GET | Sesión / CRON_SECRET | Sync por fuente (`?source=icc\|zonaprop\|mudafy\|escrituras`) |
| `/api/mercado/zonaprop` | GET | Sesión | Datos ZonaProp |
| `/api/messages/bot-reply` | POST | BOT_REPLY_SECRET | Bot reply legacy |
| `/api/n8n/reply` | POST | N8N_REPLY_SECRET | Reply desde n8n |
| `/api/push/subscribe` | POST, DELETE | Sesión | Push notifications |
| `/api/tokko/sync` | POST | Tenant + Rate limit | Sync propiedades |
| `/api/tokko/sync-leads` | POST | Tenant + Rate limit | Sync leads |
| `/api/tokko-proxy/[...path]` | GET | Sesión | Proxy Tokko API |
| `/api/valuation/generate` | POST | Sesión + Rate limit | Tasación IA ⚠️ **LEGACY / posible código muerto** (sin uso en frontend; ver §15.1). El módulo vivo es el Wizard MCM client-side |
| `/api/webhooks/evolution` | POST | Público | Webhook Evolution |
| `/api/webhooks/meta` | GET, POST | Público | Webhook Meta |
| `/api/whatsapp/ai-settings/knowledge-upload` | POST | Tenant | Knowledge WA bot |
| `/api/whatsapp/dispatch` | POST | DISPATCH_SECRET | Enviar template WA |
| `/auth/callback` | GET | Público | OAuth callback |

---

## FIN DEL DOCUMENTO

Este documento cubre la lógica completa del sistema PRISMA al nivel de código fuente. Cada endpoint, cada flujo de datos, cada integración y cada mecanismo de seguridad han sido documentados basándose en el análisis directo del código, sin alteración ni ejecución del mismo.
