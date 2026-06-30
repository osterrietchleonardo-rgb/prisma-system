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
| Google Gemini | `gemini-embedding-001` | `lib/gemini.ts` → `generateEmbedding(text, taskType)` | Embeddings vectoriales 768 dims (`RETRIEVAL_DOCUMENT` al indexar / `RETRIEVAL_QUERY` en la consulta del Buscador IA) |
| Google Gemini | `imagen-3.0-generate-002` | `lib/gemini.ts` → `generateImage()` | Generación de imágenes para marketing |
| OpenAI | `gpt-5.4-mini` | `lib/openai.ts` → `openaiIA` | Consultor/Buscador IA, Tutor IA (intent + response). Usa `max_completion_tokens` (familia GPT-5) |

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

### 4.1 Registro — dos modos ("Crear" vs "Unirme")

**Archivo:** `lib/actions/auth.ts` → `register()`  
**Callback:** `app/auth/callback/route.ts`  
**Form:** `components/auth-register-form.tsx`

La pantalla de registro tiene dos pestañas según la **intención** (`mode`), no según el rol:

- **"Crear inmobiliaria nueva"** (`mode: 'crear'`): funda una agencia. Requiere un código de **admin/Vakdor** (tabla `director_invites`). El rol resultante es siempre `director`.
- **"Unirme a una inmobiliaria"** (`mode: 'unirme'`): entra a una agencia existente con un código de invitación (tabla `agency_invites`). **El rol lo define el código** (`agency_invites.role`): puede ser `director` o `asesor`. La persona NO elige su rol.

**Regla de aislamiento:** cada tipo de código vive en su propia tabla, así que **no se cruzan**: un código de `agency_invites` usado en "Crear" no se encuentra en `director_invites` → devuelve **"Código incorrecto"**, y viceversa.

**Flujo "crear":**
1. El usuario ingresa nombre, email, contraseña, nombre de agencia + código de Vakdor.
2. Se valida el código en `director_invites` (existe y no usado).
3. `signUp()` → email de confirmación; se crea `profiles` (rol `director`), se crea la `agencies` con `invite_code`, se asocia `profiles.agency_id`, se marca el `director_invite` como usado.

**Flujo "unirme":**
1. La persona recibe un código de un director (puede ser de asesor o de director).
2. Ingresa nombre, email, contraseña + código.
3. Se valida el código en `agency_invites` (existe y no usado) y se lee su `role`.
4. `signUp()` → `profiles` con ese rol y `agency_id` del invite; se marca el invite como `is_used: true` (con `used_by`).
5. El callback (`exchangeCodeForSession`) redirige a `/director/dashboard` o `/asesor/dashboard` según el rol real del perfil.

> **Múltiples directores por agencia:** no hay límite ni jerarquía. Todo se rige por `profiles.role='director' + agency_id` en las políticas RLS, así que cualquier director ve y gestiona todo lo de su agencia. El primer director de cada agencia se crea con código de Vakdor ("crear"); los demás directores los invita cualquier director existente desde Configuración (código de `agency_invites` con `role='director'`).

### 4.2 Flujo de Login

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
| ACM | `/director/acm` | Análisis Comparativo de Mercado (ex Tasaciones) |
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
| ACM | `/asesor/acm` | Análisis Comparativo de Mercado (ex Tasaciones) |
| Biblioteca | `/asesor/documentos` | Documentos de la agencia |
| Configuración | `/asesor/configuracion` | Config personal |
| Sugerencias | `/asesor/feedback` | Feedback |

---

## 6. Base de Datos — Esquema Completo

### 6.1 Tablas Principales

El esquema está definido en `supabase/schema.sql`. Las tablas principales son:

#### Autenticación y Perfiles
- **`profiles`** — Perfil de usuario (id, email, full_name, role, agency_id, phone, avatar_url, status, created_at)
- **`agencies`** — Agencias inmobiliarias (id, name, logo_url, tokko_api_key, address, phone, email, invite_code, owner_id, performance_config, marketing_ai_config, buscador_ia_config, created_at)
- **`agency_invites`** — Códigos de invitación (agency_id, code, **role** [`director`/`asesor`], **invitee_name**, is_used, used_at, used_by). El `role` define qué será la persona al registrarse; `invitee_name` es el nombre del invitado (visible antes de usarse). RLS: cualquier **director** de la agencia ve y crea códigos (lista compartida); validación pública por código sin usar.

#### Propiedades y Leads
- **`properties`** — Propiedades sincronizadas (id, tokko_id, agency_id, assigned_agent_id, title, description, price, currency, property_type, status, address, city, bedrooms, bathrooms, total_area, covered_area, images[], tokko_data, embedding vector(768))
- **`leads`** — Leads del CRM (id, agency_id, assigned_agent_id, full_name, email, phone, source, status, pipeline_stage, notes, tokko_contact_id, first_response_time, chat_analysis)
- **`lead_activities`** — Historial de actividades de leads
- **`scheduled_visits`** — Visitas agendadas (id, agency_id, agent_id, lead_id, nombre_completo, telefono, email, propiedad_titulo, zona_propiedad, fecha_visita, hora_visita, tipo_operacion, presupuesto, calificacion_lead, score_bant, intereses_clave, objeciones_detectadas, decisores, resumen_conversacion, origen_consulta, estado_visita [agendada|cancelada|completada], motivo_cambio, created_at)
- **`visits`** — Visitas (legacy)
- **`closings`** — Cierres de operaciones

#### WhatsApp
- **`whatsapp_instances`** — Instancias de WhatsApp (id, agency_id, token, phone_number_id, business_id, evo_instance_name, integration_type, templates_status, flows_active)
- **`wa_conversations`** — Conversaciones/chats (id, agency_id, instance_id, contact_phone, contact_name, status, bot_active, unread_count, last_message_at, last_inbound_at, etiquetas[], **clasificacion** (origen del lead), score, pipeline_stage, funnel_status, visit_status, follow_ups_sent, follow_ups_history, requires_follow_up, recovery_stage, next_follow_up_at, opt_out, metricas jsonb)
- **`wa_contacts`** — Agenda de contactos para campañas (id, agency_id, phone, name, tags[], **clasificacion**, metadata, campaign_statuses, last_campaign_*). Tabla **separada** de `wa_conversations`: la solapa "Contactos" lee de acá; se sincroniza por teléfono con las conversaciones. `UNIQUE (agency_id, phone)`
- **`wa_messages`** — Mensajes individuales (id, conversation_id, agency_id, content, role, message_type, wamid, metadata)
- **`wa_templates`** — Templates de WhatsApp (id, agency_id, template_name, status, components, rejection_reason, meta_template_id)
- **`n8n_chat_histories`** — Historial de chat para n8n (session_id = conversation_id, message jsonb)
- **`wa_campaigns`** / **`wa_campaign_recipients`** — Campañas masivas por **goteo diario**: la campaña apunta a una clasificación (segmento) + una plantilla, y guarda `bot_active_on_reply` (si los chats nuevos nacen con el bot IA prendido o apagado); cada destinatario tiene su estado (pending/sent/error). Un cron envía cada día hasta el **límite real de Meta**, marca enviados y **no repite** (idempotente, aunque se pause/reanude).

> **Clasificación del lead (`clasificacion`):** identifica el origen y se muestra como badge de color (con filtro) en Leads WhatsApp, Contactos y la bandeja. Valores: `Whatsapp-Consulta` (entró por consulta de WhatsApp), `Whatsapp-Manual` (alta manual desde Tracking o Calendario), o **personalizada** (definida por el usuario al importar en Contactos; "Importado" por defecto). Registros previos quedan en "Sin clasificar". Se mantiene sincronizada por teléfono entre `wa_conversations` y `wa_contacts`.

#### IA y Documentos
- **`consultor_chat_sessions`** — Sesiones del Consultor IA
- **`consultor_chat_messages`** — Mensajes del Consultor IA
- **`shared_properties`** — Fichas compartibles del Buscador IA (token + snapshot; RLS sin políticas, solo service-role)
- **`tutor_chat_sessions`** — Sesiones del Tutor IA
- **`tutor_chat_messages`** — Mensajes del Tutor IA
- **`agency_documents`** — Documentos subidos (con embedding para RAG)
- **`document_folders`** — Carpetas de la Biblioteca de Conocimiento (IA)
- **`official_documents`** — Documentos Oficiales descargables (NO consultados por IA)
- **`official_document_folders`** — Carpetas de los Documentos Oficiales (jerárquicas vía `parent_id`: admiten subcarpetas)
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
| `match_properties_ia(p_agency_id, p_query_embedding, p_operation, p_type_patterns, p_rooms, p_bedrooms, p_bathrooms, p_price_max/min, p_currency, p_loc_patterns, p_amenity_patterns, p_floor_min, p_floor_max, p_free_text_patterns, p_include/exclude_agent, p_limit)` | **Buscador IA — cartera propia/agencia**: filtro duro (ambientes ±1, presupuesto, zona, tipo) + **banda de piso suave** + **free-text** + ranking vectorial HNSW + `match_pct`. Devuelve `id, match_pct, semantic_sim, assigned_agent_id`. |
| `match_roomix_ia(p_query_embedding, p_operation, p_type_patterns, p_rooms, p_bedrooms, p_bathrooms, p_price_max/min, p_currency, p_loc_patterns, p_amenity_patterns, p_agency_name_patterns, p_floor_min, p_floor_max, p_free_text_patterns, p_limit)` | **Buscador IA — red de colaboración** (~69k filas). El filtro duro corre sobre TODA la base; `hnsw.ef_search` y el pool de candidatos = **1000** (jun-30, antes 400) → de las que pasan el filtro toma las 1000 más parecidas y rankea. Mismo esquema (+ piso suave + free-text). Devuelve `id, match_pct, semantic_sim`. |
| `increment_shared_view(p_token)` | Suma 1 al `view_count` de una ficha compartida (`shared_properties`). SECURITY DEFINER. |
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
   - **Superficies:** `cubierta` = `roofed_surface` (la techada real; NO `surface`, que suele ser el lote); `total` = `total_surface` con respaldo a `surface`/`roofed_surface`. Evita el bug de mostrar el lote como superficie cubierta.
   - **Sanitización:** se elimina `internal_data` (datos del propietario, comisión, ubicación de llaves) antes de guardar `tokko_data`, para no filtrarlo al navegador.
   - Extrae imágenes: `photos[].image`
   - Mapea agente: busca `agent_id` del agente Tokko en `profiles.tokko_agent_id`
   - Genera embedding del título+descripción+dirección via `generateEmbedding()`
7. Upsert masivo en `properties` usando `adminClient` (bypass RLS) con `onConflict: 'tokko_id,agency_id'`

**API Tokko usada:**
```
GET https://tokkobroker.com/api/v1/property/?key={KEY}&format=json&limit=100&offset={n}
```

### 7.1.bis Descripción mejorada con IA (por propiedad)

**Endpoint:** `POST /api/propiedades/[id]/ai-description`
**Archivo:** `app/api/propiedades/[id]/ai-description/route.ts`
**UI:** `components/propiedades/AiDescription.tsx` (embebido en la ficha de asesor y de director, debajo de la descripción de Tokko).

**Objetivo:** generar una descripción de venta/alquiler profesional a partir de **todos** los datos de la propiedad, sin pisar la descripción original de Tokko. El prompt (`ESTILO` en el route) pide: storytelling con capa **emocional** (deseos/anhelos del comprador ideal inferidos de tipo+zona+atributos reales, **sin inventar**), optimización **SEO + GEO** (frases clave orgánicas + afirmaciones autocontenidas y entidades concretas que los motores de IA citan mejor), un bloque de **Preguntas Frecuentes (FAQ)** con respuestas basadas solo en datos provistos, tono humano (voseo) sin emojis y viñetas sutiles.

**Flujo:**
1. `requireTenant()` + chequeo explícito `property.agency_id === agencyId` (aislamiento).
2. **Tope estricto** (control de gasto): solo existen **V1** y **V2** por propiedad. Si la versión pedida ya existe, o se pide V2 sin V1, responde `409` y **no consume crédito**.
3. `consumeAiCredits("propiedades_descripcion", 1)` → reserva 1 crédito y devuelve `txId`.
4. Construye el prompt con el contexto completo (tipo, operación, precio/expensas, ubicación, ambientes, baños, superficies, antigüedad, orientación, disposición, tags y la descripción de Tokko como referencia de datos). Para **V2** suma la **V1** + la **sugerencia** del usuario y pide reescribirla.
5. `prismaIA.generateContent()` (`gemini-3.5-flash`, modelo económico).
6. `updateAiTransactionCost(txId, ...)` con tokens reales (`usageMetadata`) → costo USD real en el panel de IA.
7. Guarda en `properties.ai_description` (jsonb) con `createAdminClient()` (el asesor no tiene UPDATE por RLS; ya se validó la agencia). El sync de Tokko **nunca** toca esta columna.

**Por qué columna nueva y no `description`:** la descripción de Tokko se pisa en cada sincronización; guardar la versión IA en `ai_description` evita perderla y permite copiarla/verla siempre y pegarla manualmente en Tokko si se quiere publicar.

### 7.2 Sincronización de Leads

**Endpoint:** `POST /api/tokko/sync-leads`  
**Archivo:** `app/api/tokko/sync-leads/route.ts`

**Flujo:**
1. Autenticación + Rate limit
2. Fetch paginado (`limit=50`, `order_by=-created_at` → más nuevos primero, tope 1000) con delay de 350ms entre requests
3. Para cada contacto/lead:
   - Mapea datos del contacto (el endpoint `/contact/` trae **solo 20 campos**)
   - **Origen** (y operación/tipo): se extraen de `tags` (`{name, group_name}`), de forma flexible por agencia — el origen real (Zonaprop/Web/Mercadolibre…) no viene como campo suelto
   - **Asignación automática:** `assigned_agent_id` = asesor de PRISMA cuyo email coincida con `agent.email` de Tokko
4. Upsert en `leads` con `adminClient`

> **Ojo:** `deleted_at` del contacto **no es borrado** — es la fecha de **última actualización** (viene en el 100% de los contactos). No se filtra por él.

**API Tokko usada:**
```
GET https://tokkobroker.com/api/v1/contact/?key={KEY}&format=json&limit=50&offset={n}&order_by=-created_at
```

### 7.3 Sincronización Automática (cron 2×/día)

**Endpoint:** `GET /api/cron/tokko-sync` (protegido por `CRON_SECRET`)
**Workflow:** `.github/workflows/tokko-sync.yml`

Un GitHub Action lo dispara **dos veces por día** — **7:00 AM** y **6:00 PM** de Argentina (`10:00` y `21:00` UTC). El endpoint recorre **todas las agencias** con `tokko_api_key` y corre el sync de **propiedades + leads** de cada una, así los asesores ven los cambios sin que el director sincronice manualmente. La lógica vive en `lib/tokko-sync.ts` (`runPropertiesSync` / `runLeadsSync`), la misma que usan los botones manuales.

### 7.4 Proxy Tokko

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
   - **Dedup por `wamid`:** si ya existe un `wa_messages` con ese `wamid`, se ignora (Evolution/Meta pueden reentregar el mismo mensaje).
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
   - Dispara POST a `N8N_WEBHOOK_URL` vía `triggerN8nWithSafetyNet` (**3 intentos**, timeout 15s c/u, backoff 500/1000ms)
   - **Red de contención (anti "lead perdido"):** si los 3 intentos fallan, el disparo se guarda en `wa_n8n_dead_letter` (`status='pending'`) en vez de perderse. Se reprocesa con `POST /api/n8n/retry-pending` (manual o cron). Ambos webhooks usan `maxDuration=60` para no ser cortados por Vercel a mitad de los reintentos.
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

### 9.4 Campañas masivas por goteo diario (drip)
Para bases grandes (ej. 15.000 leads) respetando el límite de Meta:
1. **Audiencia por segmento:** se elige una **clasificación** (ej. `reclutamiento`) + una **plantilla**. Al crear, la campaña queda **pausada** (no envía todavía): se inscribe **todo el segmento** en `wa_campaign_recipients` (estado `pending`) y se marca **EN COLA** en la solapa Contactos.
2. **Lanzar ahora:** el director confirma con el botón **"Lanzar ahora"** (`/api/campaigns/launch`), que activa la campaña y manda un **primer lote en el acto**. De ahí en más se envía sola. **No requiere entrar a GitHub.**
3. **Envío automático (goteo):** un cron (`/api/cron/campaigns`, disparado por GitHub Action cada hora) envía cada día **hasta el límite real de Meta** (leído de la WABA: `whatsapp_business_manager_messaging_limit`), marca cada lead como **enviado/error** (idempotente: nunca reenvía, ni al día siguiente ni si se pausó/reanudó), y crea el chat en la bandeja. Cuando se agota el segmento → **finalizada**.
4. **Control y trazabilidad:** lanzar/pausar/eliminar; la tarjeta muestra progreso (enviados/total, en cola, errores, últimas 24h). El estado por-lead se ve en Contactos (EN COLA → ENVIADO/ERROR + fecha, por plantilla).
5. **Bot IA prendido/apagado por campaña:** al crear, el director elige con un interruptor si los chats que cree la campaña nacen con la IA **prendida** (clientes) o **apagada** (reclutamiento u otros no-clientes; el chat queda en modo manual y la IA no responde). Se guarda en `wa_campaigns.bot_active_on_reply` (default `true`) y se aplica al `bot_active` del chat **solo cuando es nuevo**; si el chat ya existía, no se toca. El webhook ya respeta `bot_active` (si está OFF, guarda el mensaje del lead pero no dispara la IA).
6. **Límite:** lo verifica el sistema contra Meta (no lo carga el cliente). Techo del goteo serverless ~9.600/día.
6. **Importación:** acepta cualquier formato de teléfono argentino (normaliza con `libphonenumber-js`), columnas flexibles (incluye `csTelefono1/2`), nombre opcional, dedupe por teléfono.

---

## 10. Módulo de IA — Buscador IA (Ex Consultor IA)

**Endpoint:** `POST /api/ai/consultor`  
**Archivo:** `app/api/ai/consultor/route.ts`  
**Modelo:** OpenAI GPT-5.4-mini (via `openaiIA`; usa `max_completion_tokens`)

### 10.1 Propósito

Asistente avanzado de búsqueda de propiedades. Ahora opera bajo un formato de "Buscador Inteligente", combinando propiedades de la cartera interna (Tokko) y propiedades globales pre-sincronizadas de Roomix.

### 10.2 Arquitectura de Datos (Roomix Crawler)

El Buscador IA se nutre de la tabla `roomix_properties`, la cual es alimentada diariamente por un **Docker Worker Automático** (carpeta `roomix-sync`).
- **Tecnología del Crawler:** Utiliza Playwright (en modo Stealth) para bypassear bloqueos anti-bot y extrae datos estructurados JSON-LD de las fichas de Roomix.
- **Worker de Producción:** Se ejecuta como un contenedor Docker en Easypanel, utilizando `node-cron` (disparándose a las 03:00 AM) y `child_process.spawn` para aislar el proceso y evitar fugas de memoria del Chromium.
- **Despliegue & Health Check:** El Worker levanta un mini servidor HTTP nativo en el puerto 80 (`cron.js`) y ejecuta Node directamente (`CMD ["node", "cron.js"]` en `Dockerfile`) para cumplir con los requerimientos de Health Check de Easypanel, evitando errores de tipo SIGTERM y garantizando que el proceso se mantenga vivo.
- **Concurrencia Segura (Cron):** Implementa un "semáforo" (lock) en el cron de Node para prevenir la ejecución paralela múltiple en extracciones que duren más de 24 horas, evitando baneos por exceso de requests concurrentes.
- **Extracción de Sitemaps:** En lugar de navegación directa (que sufre bloqueos de Cloudflare), extrae los sitemaps utilizando `page.evaluate(fetch)` *dentro* del contexto de Chromium, preservando el fingerprint TLS y las cookies `cf_clearance`, con reintentos exponenciales. Lee los **7 sitemaps** (`/properties/sitemap/0..6`, configurable con `SITEMAP_COUNT`; antes leía solo 0..5 y se salteaba ~30k URLs del sitemap 6).
- **Diff con Supabase:** La consulta de comparación contra la base de datos (`diffWithSupabase`) implementa paginación explícita (`.range()`) para evitar el límite por defecto de 1.000 filas de PostgREST, garantizando la correcta deduplicación frente a bases de datos grandes.
- **Imagen Docker:** `mcr.microsoft.com/playwright:v1.60.0-jammy`

#### Mejoras Junio 2026 (`crawler.mjs` v4.1 — prioridad ventas + datos fieles)

- **Detección de operación CORRECTA (`operation_type`):** El campo se determina por `operation_type` (`venta`/`alquiler`) del payload Next.js de cada ficha, con respaldo en el prefijo del título (`"VENTA…"`/`"ALQUILER…"`). **Antes** se usaba el `businessFunction` del JSON-LD, que es **inservible**: las ventas no lo traen y los alquileres siempre dicen `LeaseOut` → todo terminaba como `rent` o `null` (la columna `operation` tenía **0 ventas**). El `businessFunction` queda solo como último fallback.
- **Prioridad de extracción (ventas + AMBA primero):** El worker arma una cola priorizada antes de procesar (`priorityRank`):
  1. **Venta AMBA** (CABA + conurbano norte/sur/oeste) — tier 0
  2. **Venta resto provincia de Buenos Aires** — tier 1
  3. **Venta resto de Argentina** — tier 2
  4. **Alquiler AMBA** — tier 3
  5. **Alquiler resto del país** — tier 4
  
  Las ventas se recolectan como **fuente prioritaria** desde los listados propios de Roomix `/buscar/comprar/<seed>?page=N` (seeds por zona, paginados), que ya vienen filtrados por operación y zona. El resto del catálogo se barre por sitemaps. **Toda venta se procesa antes que cualquier alquiler.**
  - **Fix Junio 24 — tope a `en-argentina` (la recolección ya termina):** El seed `en-argentina` (tier 2, "todo el país") tiene **cientos de páginas** y casi siempre devuelve alguna propiedad nueva, por lo que el corte por "2 páginas seguidas sin nuevas" **nunca se gatillaba** → la recolección se colgaba ahí **horas** (agravado por throttling de Cloudflare) y **la tubería jamás llegaba a guardar** (por eso había ~10 ventas pese a que el catálogo tiene miles). Ahora cada grupo tiene un tope propio (`maxPages`): AMBA y Prov. BsAs **sin tope** (se autocortan), `en-argentina` topeado en **60 páginas** (env `VENTA_AR_MAX_PAGES`). AMBA —la prioridad— se sigue recolectando completo. Con esto la etapa de recolección termina en minutos y el worker llega a **insertar las ventas** (que ya van primeras en la cola). *Verificado en local: las ventas en `roomix_properties` pasaron de 10 a 70+ en corridas de prueba.*
- **Borrado automático con freno de seguridad (`deleteMissing`):** Elimina de la base las propiedades que ya no están en Roomix (salieron del catálogo). Solo se ejecuta en corrida completa (sin `--limit`), **únicamente si todos los sitemaps cargaron OK**, y **aborta si fuese a borrar >40%** de la base (protección ante catálogo incompleto por error de red).
- **Actualizaciones desbloqueadas (checkpoint):** El `checkpoint.json` sirve para **reanudar** una corrida cortada a la mitad. Al terminar bien, se **vacía** (`clearCheckpoint`) → así las propiedades que Roomix marque como modificadas (por `lastmod`) vuelven a bajarse y se actualizan en la próxima corrida. Antes el checkpoint las bloqueaba para siempre.
- **Embedding:** cada ficha nueva/modificada genera su embedding Gemini (`gemini-embedding-001`, 768 dims, `RETRIEVAL_DOCUMENT`) antes del upsert.
- **Concurrencia configurable (Junio 24):** la extracción de fichas corre con concurrencia **4** por defecto (antes 2, fijo), ajustable por env `CRAWLER_CONCURRENCY`. Es el doble de velocidad con riesgo bajo de Cloudflare; el crawler ya reintenta solo ante 403/429. Si en los logs aparecen muchos `⏳` (reintentos), bajarla.
- **Realidad del catálogo (hallazgo Junio 24):** los 7 sitemaps de Roomix listan **~182.000 propiedades**, pero la base tiene **~54.600** (≈30%). El worker va al día con lo nuevo/modificado y prioriza ventas, pero **ponerse al día con TODO el catálogo es un tema de throughput** (a concurrencia 4, una corrida completa tarda ~1 día; el `checkpoint` permite reanudar entre corridas). Las ventas se salvan igual porque van primeras en la cola.
- **Variables de entorno (producción):** dejar `VENTA_MAX_PAGES`, `VENTA_AR_MAX_PAGES`, `SITEMAP_COUNT` y `CRAWLER_CONCURRENCY` **sin definir** usa los defaults (todas las ventas AMBA, `en-argentina` a 60 páginas, 7 sitemaps, concurrencia 4). `VENTA_MAX_PAGES=N` y `PROPERTY_LIMIT=N` sirven para pruebas acotadas.
- **Backfill puntual (`backfill-operation.mjs`):** Script de una sola vez que re-etiquetó las **962 propiedades históricas que estaban en `operation = null`** (re-visita cada ficha y actualiza **solo** la columna `operation`). Resultado: 961 `rent` + 1 `sale`, 0 errores, 0 sin determinar. Es idempotente (toma solo las que sigan en `null`).

### 10.3 Flujo Completo de Búsqueda (rediseño Junio 2026)

1. **Auth + Créditos:** `requireTenant()` + `consumeAiCredits("consultor_ia", 1)`
2. **Config de la agencia:** lee `agencies.buscador_ia_config` (notas/directivas del director, ver 10.5) y el nombre de la agencia.
3. **Gestión de Sesión + Memoria por chat:** Crea/recupera `consultor_chat_sessions` y carga **todo** el historial de la sesión (`consultor_chat_messages`). Los últimos 12 turnos previos (`priorTurns`) alimentan tanto la extracción de intención como la respuesta final → cada chat tiene memoria real y sigue el hilo.
4. **Análisis de Intent con IA (con memoria):** Sobre el último mensaje + la conversación previa, devuelve los criterios **ACUMULADOS y vigentes** (mantiene los filtros anteriores salvo que el usuario los cambie). Extrae: `operation`, `type_keywords`, `location_keywords`, `amenity_keywords` (servicios/amenities/espacios comunes concretos; los adjetivos subjetivos como "luminoso" NO van acá → los captura el embedding), `agency_keywords` (inmobiliaria), `price_max/min`, `price_currency` (USD/ARS), **`rooms` (ambientes)**, **`bedrooms` (dormitorios)**, `bathrooms`.
   - **Ambientes vs dormitorios (¡bug histórico!):** "2 ambientes"→`rooms:2`; "2 dormitorios/cuartos/habitaciones"→`bedrooms:2`. La columna `bedrooms` de la base es `suite_amount` = **dormitorios**, no ambientes. Red de seguridad por código: si el texto dice "ambiente/amb" pero el modelo lo puso en `bedrooms`, se mueve a `rooms`.

5. **Si intent === RETRIEVAL — estrategia "Cartera_Propiedades" (paridad con el agente n8n), 2 capas en SQL:**

   Se llaman 2 funciones SQL (Supabase): **`match_properties_ia`** (cartera propia + agencia; 2 llamadas, `p_include_agent`=propias / `p_exclude_agent`=agencia) y **`match_roomix_ia`** (red de colaboración, sobre las ~54.566 filas **SIN** el viejo límite de 400). Cada una, dentro de la base:

   a. **Capa 1 — Filtro duro (excluye lo no comparable):** operación, tipo (traducción ES→EN para Roomix), **ambientes ±1** (un "2 ambientes" trae 1/2/3, nunca 4+; ambientes = `room_amount`, o `dormitorios+1` si falta), **presupuesto** (`≤ price_max ×1.20`, con conciencia de moneda; no mezcla USD/ARS), **zona** (`city`/`neighborhood`/`address`/`title`) e **inmobiliaria** puntual (Roomix por `roomix_agency_name`).

   b. **Capa 2 — Ranking por embeddings (Gemini):** se genera el embedding de la consulta (`generateEmbedding(message, "RETRIEVAL_QUERY")`) y se rankea por similitud coseno con índices **HNSW** (`vector_cosine_ops`, `hnsw.iterative_scan=relaxed_order`), patrón *vector-search-then-rerank*. Devuelve **`match_pct`**.

   c. **% de coincidencia (`match_pct`):** = ambientes 35 (exacto=full, ±1=mitad) + amenities 35 (cobertura de los servicios pedidos). **El precio NO entra al puntaje** (lo decide el cliente). La **semántica solo ordena** dentro de cada escalón (incluirla en el % lo saturaba a ~100%). Si no se pidió ningún criterio concreto → `match_pct` null y ordena puro por embedding. Filosofía: **mostrar las justas + comparables con su %, sin perder ventas** (no excluye por amenity faltante; baja el %).

   d. **Imágenes y CDN:** las propiedades de Roomix consumen imágenes vía `next.config.mjs` (`cdn.roomix.ai`).

6. **Generación de Respuesta y Renderizado Frontend:**
   Se re-traen las filas completas por id (preserva el JOIN con `profiles`). El contexto (resumen + notas del director + lista de recomendadas) + los turnos previos van a `openaiIA` con el prompt rioplatense de "Buscador IA". La IA responde breve; las tarjetas se renderizan en `consultor-results.tsx` (3 secciones: propias, agencia, red de colaboración) **con un badge de % de coincidencia por tarjeta** (verde ≥85, ámbar ≥60, gris).
   - **Mapeo de Agentes:** JOIN con `profiles` (`agent_profile`); fallback al JSONB `assigned_agent` de Tokko.
   - **Enlaces:** propiedades internas → `tokko_data.public_url`; red de colaboración → `canonical_url`.

7. **Tracking de costos:** `updateAiTransactionCost()` con tokens reales, precio desde la tabla central (`utils/aiCostCalculator`).

> **Nota (jun-2026, rama `fix/buscador-ia-logica-n8n`):** el flujo pasó de "filtro duro + interpretación en memoria sobre 400 filas" a **paridad total con el agente n8n: filtro duro + embeddings en SQL** sobre AMBAS tablas (`match_properties_ia` / `match_roomix_ia` + índices HNSW). Esto resolvió el bug reportado por cliente ("pedí 2 amb + terraza, devolvía 3 amb + balcón": confundía ambientes con dormitorios y no filtraba amenities) y eliminó el límite de 400 (Roomix ahora se busca completo).

### 10.4 Endpoints Adicionales

- `GET /api/ai/consultor?sessionId=xxx` → Mensajes de una sesión
- `GET /api/ai/consultor?agencyId=xxx` → Todas las sesiones del usuario
- `DELETE /api/ai/consultor?sessionId=xxx` → Borrar sesión
- `PATCH /api/ai/consultor` → Renombrar sesión

### 10.5 Notas y directivas del director (`buscador_ia_config`)

**Solapa "Notas"** dentro del Buscador IA del director (`app/director/consultor/page.tsx` + `components/consultor/buscador-notas-settings.tsx`). El asesor no la ve.
- **Endpoint:** `GET/POST /api/ai/consultor/settings` (POST restringido a `director`).
- **Almacenamiento:** columna `agencies.buscador_ia_config = { notes }` (jsonb, texto libre). La configura solo el director y **aplica a él y a todos sus asesores** (se lee en cada búsqueda).
- **Comportamiento:** el modelo interpreta el texto libre. Si una propiedad recomendada —o su inmobiliaria— coincide con un comentario/directiva de las notas, lo comunica al asesor/director como una **consideración/nota** (ej: avisar que conviene evitar cierta inmobiliaria, o que una propiedad acepta permuta). No se expone el origen "Roomix" ni se usa una lista negra estructurada: todo es texto libre interpretado.

### 10.6 Responsividad móvil del Buscador IA (actualización Junio 2026)

Se corrigió la vista de celular del Buscador IA (afecta asesor `app/asesor/consultor-ia/page.tsx` y director `app/director/consultor/page.tsx` por compartir layout, más el componente común `components/shared/consultor-results.tsx`), solo con clases Tailwind responsivas, **sin cambios de lógica**:

- **Historial de búsquedas → cajón superpuesto en celular.** Antes el `<aside>` era una columna fija de `w-80` que arrancaba abierta y aplastaba el chat (en un teléfono de ~360px dejaba el chat en una franja inservible). Ahora en `<md` es un cajón fijo (`max-md:fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs`) que se desliza con `translate-x` y arranca **cerrado**; en `md+` se mantiene el comportamiento previo (`md:w-80` ↔ `md:w-0`, empuja el contenido).
- **Estado inicial dependiente del ancho:** `isSidebarOpen` arranca `false` y un `useEffect` lo abre solo si `window.innerWidth >= 768` (evita el "flash" del cajón sobre el contenido en celular).
- **Fondo oscuro (backdrop) solo en celular** (`md:hidden`) para cerrar el cajón tocando afuera; además se cierra solo al elegir/crear una búsqueda (`closeSidebarOnMobile()` en `loadSession` y `startNewChat`).
- **Encabezado:** deja de desbordar con `min-w-0` + `truncate` en título/subtítulo y `shrink-0` en el ícono y el badge de créditos.
- **Tarjetas de propiedades (`consultor-results.tsx`):** las flechas del carrusel pasan de solo-hover a visibles siempre en celular (`opacity-100 md:opacity-0 md:group-hover:opacity-100`), porque en touch no hay hover. El footer del modal de detalle apila en pantallas angostas (`flex-col sm:flex-row`).

### 10.7 Mejoras Junio 29 (modelo, piso, free-text, compuerta de datos, ficha compartible)

Rama `feat/buscador-ia-venta-piso-conversacional`. Cambios solo aditivos, sin romper el flujo previo.

- **Modelo → GPT-5.4-mini.** `lib/openai.ts` (`openaiIA`) pasó de `gpt-4.1-mini` a `gpt-5.4-mini` (afecta Buscador IA **y** Tutor IA). La familia GPT-5 no acepta `max_tokens`: se usa **`max_completion_tokens`**. El tracking de costos (`utils/aiCostCalculator`) ya tenía `gpt-5.4-mini` (input 0.75 / output 3.00); se actualizó el modelo hardcodeado en `consultor/route.ts` y `tutor/route.ts`.
- **Red de seguridad de operación ("venta trae solo venta"):** el filtro SQL ya filtraba bien (`properties.status='Venta'` / `roomix.operation='sale'`); el hueco era que si el JSON del modelo fallaba, `operation` quedaba en `"ambas"` y mezclaba. Ahora por código: si el mensaje dice "venta/comprar" (y no "alquiler") se fuerza `operation="venta"` (y viceversa) — mismo patrón que la red de ambientes.
- **Piso/nivel del departamento (filtro SUAVE):** nuevo `floor_preference` (`alto`/`bajo`/`medio`). **ALTO = piso 6+** (después del 5°); **BAJO/MEDIO = planta baja (0) al 5°**. Se distingue del tipo "piso" (planta completa): "un piso" = tipo; "piso alto/bajo", "planta alta", "7° piso" = nivel (con red de seguridad por regex). Como el dato de piso está **poco cargado** (`properties.tokko_data->>'floor'` ~32%, `roomix.floor` ~7%), el filtro **no descarta** las fichas sin dato: solo excluye las que tienen piso cargado y contradicen la banda, y prioriza (ORDER BY) las de nivel confirmado. Se traduce a `floorMin/floorMax` y va a las funciones SQL.
- **Búsqueda flexible de características (free-text):** nuevo `free_text_keywords` para lo que NO entra en los filtros duros ni en el diccionario de amenities (ej: "frente", "contrafrente", "a estrenar", "apto crédito", "pozo", "al río"). Se buscan con `~*` sobre **todo el texto de la ficha** (título, descripción, dirección, ciudad/barrio, tipo, tags/amenities) en ambas tablas. Es **suave**: suma como dimensión de ranking (peso 30, como amenities), no descarta. Con array vacío el comportamiento es idéntico al previo.
- **Compuerta de datos mínimos (pregunta antes de buscar):** si la intención es RETRIEVAL pero faltan datos clave —**operación, tipo, zona, ambientes, presupuesto**— el Buscador **NO** llama a la herramienta ni muestra propiedades: el asistente pide lo que falta de forma natural (acumula entre turnos). Cuando ya tiene los 5, busca. Salida de escape por regex ("mostrame igual", "lo que tengas", "sin importar"). Más conversacional: el system prompt instruye a indagar como un asesor experto pensando en el cliente final.
- **Funciones SQL actualizadas** (`match_properties_ia` / `match_roomix_ia`): suman `p_floor_min`, `p_floor_max`, `p_free_text_patterns`. Se aplicaron con `DROP + CREATE` (la firma cambió). Migración versionada: `supabase/migrations/20260629120000_buscador_ia_piso_freetext.sql`.
- **Fix de hidratación + hora real del mensaje:** el timestamp de los mensajes (asesor/director) era un `new Date()` mockeado con locale por defecto (server "10:45 a. m." vs cliente "10:45" → error de hidratación). Ahora `Message` lleva `created_at` (de la base al cargar; `new Date().toISOString()` al enviar/recibir) y se renderiza con `toLocaleTimeString('es-AR', { hour12:false })` + `suppressHydrationWarning`. El saludo inicial no lleva hora (elimina la causa raíz).

### 10.8 Ficha compartible (página pública de lujo)

Permite al asesor/director generar un **link público** de una propiedad (de cualquier sección del Buscador) con su tarjeta de contacto y la marca de su agencia, para mandarle al cliente.

- **Botón "Compartir ficha"** en el modal de detalle (`components/shared/consultor-results.tsx`): hace `POST /api/ficha/share`, abre la ficha en pestaña nueva y copia el link al portapapeles. **Este es el único punto de entrada a la ficha de lujo.**
- **Nota — detalle de Propiedades:** las páginas de detalle de la cartera (`app/asesor/propiedades/[id]` y `app/director/propiedades/[id]`) **no** generan la ficha de lujo. Tenían un botón decorativo "Compartir Ficha" **sin handler** que se **eliminó** por redundante; queda solo **"Ver Ficha Pública"**, que abre el aviso público del portal (`tokko.public_url`) — algo distinto de la ficha compartible de PRISMA.
- **Endpoint `POST /api/ficha/share`** (`app/api/ficha/share/route.ts`, `requireTenant`): saca el perfil del usuario logueado (`profiles`: nombre, email, tel, avatar, rol), la agencia + marca (`agencies.marketing_ai_config`) y la propiedad (Roomix por slug; `properties` por id **validando `agency_id`**). Arma un **snapshot** y lo guarda con un token base62 (~12 chars).
- **Tabla `shared_properties`** (token PK, `property_source`, `property_id`, `snapshot` jsonb, `created_by`, `agency_id`, `view_count`, `created_at`). **RLS activado sin políticas**: solo el server (service-role) la lee/escribe; ni anon ni authenticated acceden directo. Función `increment_shared_view(p_token)` (SECURITY DEFINER) para el contador. Migración: `supabase/migrations/20260629140000_shared_properties.sql`.
- **Página pública `/ficha/[token]`** (`app/ficha/[token]/page.tsx`, **server component**, fuera de `(public)` y de `/asesor`·`/director` → pública por middleware): lee el snapshot con el admin client, suma vista, y renderiza una ficha premium (galería, precio, specs, descripción, amenities, tarjeta del asesor con WhatsApp/Email). Usa los **colores de marca** de la agencia (o un **default de autoridad/lujo** navy+dorado+Playfair si no configuró). `generateMetadata` arma el preview para WhatsApp.
- **Seguridad:** la página es de solo-lectura del snapshot, no crea sesión ni cookies, no toca otras tablas; el `SUPABASE_SERVICE_ROLE_KEY` no es `NEXT_PUBLIC` y solo se usa server-side; los tokens son aleatorios (~71 bits). El link **no** muestra "Ver publicación original" (eso es solo para asesores/directores dentro del Buscador). No es una vía de acceso al sistema.

### 10.9 Mejoras Junio 30 (embedding acumulado, jerga, PH=Condo, monoambiente, escape por IA, roomix 1000)

Rama `feat/buscador-ia-resultados-jerga-embedding`. A pedido del cliente, sobre tres quejas: (1) que pregunte y solo busque al tener los datos o cuando el usuario diga que no tiene más; (2) que traía pocas y solo de cartera general; (3) que entienda la jerga del rubro. Todos los cambios verificados contra la base real.

- **Embedding de la consulta ACUMULADO (fix raíz de "pocas y solo cartera general").** El vector se armaba con `generateEmbedding(message)` = **solo el último mensaje**; en un turno de refinamiento ("Comprar", "sí") el vector quedaba sin sentido y el escaneo HNSW sobre las ~69k filas de `roomix_properties` colapsaba (devolvía 0), mientras la tabla chica `properties` igual encontraba sus pocas. Ahora el embedding se construye con un **`canonicalQuery`** (armado en código desde operación/tipo/zona/ambientes/amenities/free-text) **+ `search_summary`** (campo nuevo que el extractor redacta acumulando todo, incluidos matices subjetivos como "luminoso"). El canonical en código garantiza el fix aunque el modelo no llene `search_summary`. Verificado: embedding bueno → roomix devuelve 10 (75-100%); embedding malo → 0.
- **Compuerta: igual de estricta, pero el escape lo decide la IA (`force_search`), no una regex.** Se mantiene la regla de pedir los 5 datos (operación, tipo, zona, ambientes, presupuesto) y **NO** buscar con solo el primero. La diferencia: el extractor devuelve `force_search: true/false` interpretando si el usuario quiere ver YA con lo que haya, **dicho de cualquier forma** ("mostrame igual", "dale", "lo que sea", "no tengo más", "avanzá", "ya fue tirame opciones"…). La regex vieja queda **solo de respaldo** si falla el JSON. Anti-alucinación: el system prompt prohíbe decir "mirá las tarjetas" cuando no hay resultados.
- **Jerga inmobiliaria AR (en el prompt + diccionario).** "espacio aéreo / expansión / aire libre" y los pedidos con "o" ("patio o balcón") → **un solo amenity `espacio aereo`** (matchea cualquier exterior, no penaliza por tener solo uno; `AMENITY_SYNONYMS` ampliado). Glosario en el prompt: a estrenar, pozo, apto crédito, semipiso, monoambiente, dúplex, categoría/premium, frente/contrafrente (= orientación, **NO** nivel de piso → free_text).
- **PH = "Condo" en Tokko.** En `properties` los PH se guardan con `property_type='Condo'` (verificado: en la agencia del cliente, 3 de 22 Condos **no** dicen "PH" en el título y antes se perdían). `SLANG_MAP.ph = ["ph","condo"]` → al pedir "depto y ph" trae Departamento **y** PH(Condo). En `roomix` los PH son `House`/`Apartment`/`Accommodation` (ya cubiertos por `roomixTypeMap.ph`).
- **Monoambiente blindado como 1 ambiente.** En Tokko/roomix el monoambiente es `Departamento`/`Apartment` con `room_amount=1` y no siempre lo dice el título. Si piden **solo** "monoambiente" sin cantidad, se fija `roomsFilter=1` y se amplía el patrón de tipo a Departamento/Apartment → agarra también los que no escriben la palabra (verificado: 74 → **88** de 103; los 15 restantes son Bussiness Premises/Oficina/Garage/Lote con 1 ambiente, que se descartan **bien**). De paso, ya no pregunta "cuántos ambientes" para un monoambiente.
- **Roomix: presupuesto de escaneo 400 → 1000.** `match_roomix_ia` pasa `hnsw.ef_search` y el pool de candidatos de 400 a **1000** (paridad con `match_properties_ia`). Importante: el **filtro duro (zona/precio/tipo/operación/ambientes) corre sobre TODA la base** (verificado: un filtro amplio matchea 13.423 de las 69k); el 1000 es cuántas de las que pasan el filtro se traen — **las más parecidas por significado** — para rankear y mostrar el top 10 (`p_limit`). NO es "buscar solo en 1000". Migración: `supabase/migrations/20260630120000_roomix_ia_ef_search_1000.sql` (`CREATE OR REPLACE`, misma firma).

---

## 11. Módulo de IA — Tutor

**Endpoint:** `POST /api/ai/tutor`  
**Archivo:** `app/api/ai/tutor/route.ts`  
**Modelo:** OpenAI GPT-5.4-mini (via `openaiIA`; usa `max_completion_tokens`)

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

> **Estructura de la página:** Marketing IA funciona con pestañas. Director: **Crear Anuncio · Clientes Ideales (IPC) · Historial/Galería · Guía Mágica · Configuración IA** (`app/director/marketing-ia/page.tsx`, título "Marketing IA Pro"). Asesor: las mismas salvo **Configuración IA** (4 pestañas, título "Marketing IA Asesor"). "Guía Mágica" (`ad-guide.tsx`) es contenido estático de buenas prácticas de Meta Ads (sin backend); "Historial/Galería" (`marketing-history.tsx`) lista los anuncios generados agrupados por tanda, con ver/editar/descargar/borrar.

### 13.2 Generación de Copy individual (legacy — sin uso en la UI)

**Endpoint:** `POST /api/marketing-ia/generate-copy`  
**Archivo:** `app/api/marketing-ia/generate-copy/route.ts`  
**Modelo:** Gemini 3.5 Flash (`prismaIA`, `maxOutputTokens: 8192`)

> ⚠️ **Endpoint legacy:** genera 1 copy individual, pero **ningún componente lo invoca**. El flujo vigente de "Crear Anuncio" usa solo `generate-batch` + `generate-image` (ver 13.3). Se conserva como base para un futuro modo "copy simple".

**Flujo (si se usara):**
1. Obtiene IPC del usuario y la `creative_directive` de la agencia (ver 13.5)
2. Mapea ángulo de marketing: PAS, autoridad, transformación, social_proof, curiosidad, urgencia, aspiracional, datos
3. Mapea nivel de consciencia: 0 (inconsciente) → 4 (muy consciente)
4. Genera prompt con la estrategia del IPC + la **directiva creativa** del director + (si el IPC tiene `propiedad_tokko_id`) los **datos reales de la propiedad asociada** vía `buildPropertyDirective()`. Con propiedad: el copy se apoya en 2-4 atributos persuasivos reales (sin ficha técnica, sin inventar, respetando `no_mostrar`). Sin propiedad: regla explícita que prohíbe inventar/mencionar direcciones, m², ambientes o precios concretos.
5. **Output:**
   - Copy tipo `post/historia`: `{ hook, desarrollo, cta }`
   - Copy tipo `video`: `{ hook, problema, agitacion, solucion, cta }`

### 13.3 Flujo vigente: "Crear Anuncio" (Batch + 3 imágenes)

**Endpoints:** `POST /api/marketing-ia/generate-batch` + `POST /api/marketing-ia/generate-image` (×3)  
**Componente:** `components/marketing-ia/copy-generator-flow.tsx`

Es un **multi-generador todo-en-uno**. El usuario elige IPC + tipo de copy (`video` | `post`) + formato de imagen (`reels`/`post`/`historia`) + estilo, y un único botón **"Generar 3 Variantes Automáticamente"** orquesta desde el cliente:
1. `generate-batch` → **3 variaciones** simultáneas (ángulos PAS, Transformación y Autoridad/Datos) en una llamada a Gemini 3.5 Flash. Respeta la **directiva creativa** del director. Si el IPC "vender" tiene propiedad asociada, **inyecta sus datos reales** (tipo, ubicación, m², ambientes, baños, precio, amenities, descripción) en las 3 variantes con criterio psicológico (`buildPropertyDirective`); si no, mantiene la regla de no inventar propiedades. Output: array de 3 objetos.
2. Inserta los 3 `copy_drafts` y llama `generate-image` **una vez por draft** (3 imágenes).

> 💰 **Costo real:** `generate-batch` = 1 crédito + `generate-image` = 2 créditos × 3 = **~7 créditos por tanda**. El cartel "1 crédito" del componente solo refleja el batch de textos (discrepancia de UI a corregir).

### 13.4 Generación de Imágenes

**Endpoint:** `POST /api/marketing-ia/generate-image`  
**Archivo:** `app/api/marketing-ia/generate-image/route.ts`  
**Modelo:** Gemini 3 Pro Image (Nano Banana Pro)

**Flujo:**
1. Obtiene branding de la agencia (`marketing_ai_config`): colores, logo, tipografía, **directiva creativa** y **aviso legal**
2. Si hay logo → lo descarga y envía como imagen de referencia al modelo
3. Construye prompt con:
   - Formato: reels (1080x1920), post (1080x1080), historia (1080x1920)
   - Estilo: moderno, lujoso, cálido, corporativo, vibrante
   - Hook del copy a incluir en la imagen
   - **Directiva creativa** del director (obligatoria)
   - **Aviso legal** (si está cargado): texto legal en letra pequeña y legible en la franja inferior, sin tapar otros elementos
4. Genera imagen via `generateImage(prompt, 'pro', imageParts)`
5. Sube a Supabase Storage (`marketing-images`) y guarda en `generated_images`
6. Costo desde la tabla central: ~$0.134/imagen (Nano Banana Pro, 1K/2K) · $0.24 (4K)

### 13.5 Settings de Marketing

**Endpoint:** `GET/POST /api/marketing-ia/settings` (POST restringido a `director`)  
**Endpoint:** `POST /api/marketing-ia/settings/upload-logo`

Gestiona la configuración de branding de la agencia (`marketing_ai_config`):
- Colores de marca (`brand_colors[]`)
- Tipografía (`brand_font`: sans, serif, script, display)
- Logo (URL en Storage), posición y tamaño
- **Aviso legal** (`legal_notice`): texto legal para la franja inferior de las imágenes
- **Directiva creativa** (`creative_directive`): indicaciones de estilo que la IA respeta al crear copies e imágenes; la define el director y aplica a todos sus asesores

### 13.6 Búsqueda de Propiedades Tokko

**Endpoint:** `GET /api/marketing-ia/tokko-search`

Busca propiedades para vincular a un IPC de tipo "vender". Lee la **cartera completa de la agencia** desde la tabla local `properties` (la misma fuente sincronizada que usa el ACM), no la API de Tokko en vivo. Por eso el **director (y el asesor) ven toda su cartera** —no un tope de 10—: filtra por `agency_id` + `is_active` (RLS por agencia), operación y tipo, con buscador de texto libre (título/dirección/zona/descripción). Devuelve el `id` de Tokko de cada propiedad para que, al asociarla y generar el anuncio, se traiga su ficha real desde Tokko.

---

## 14. Módulo de Contratos IA

> **Actualización jun-2026 — Gestión de plantillas y contratos generados.** Se incorporó
> trazabilidad completa (código único, estado de gestión con motivo), guardado del archivo
> original y del PDF generado en Storage, y una vista diferenciada por rol (director ve todo
> el equipo; asesor solo lo suyo). Migración: `supabase/migrations/20260612120000_contratos_ia_gestion.sql`.

> **Personalización por agencia (jun-2026).** El módulo es **deshabilitable por cliente** vía `lib/access/contratos-ia.ts` (`CONTRATOS_IA_AGENCIA_DESHABILITADA` + `contratosIaDeshabilitado(agencyId)`). Para esas agencias: (1) en los sidebars el ítem "Contratos IA" se muestra atenuado con badge "Deshabilitada" y no es navegable; (2) las páginas `app/{director,asesor}/contratos-ia/page.tsx` redirigen al dashboard del rol si `profiles.agency_id` coincide. Cliente actual: **Kevin Arlandi** (`4962bf85-a92c-4c33-ba07-380686bbab76`). Es el patrón base para futuras customizaciones de accesos por cliente.

### 14.0 Cambios de esquema (migración `20260612120000_contratos_ia_gestion`)

**`contract_templates`** — nuevas columnas:
- `codigo_unico text` — código corto identificatorio de la plantilla (`PLT-XXXXXX`).
- `archivo_original_url text` — URL pública del .docx/.pdf original subido por el director.
- Índice único parcial `contract_templates_codigo_unico_idx` sobre `(agency_id, codigo_unico)` donde `codigo_unico IS NOT NULL` (permite NULL en plantillas del sistema preexistentes).

**`contratos`** — nuevas columnas:
- `codigo_unico text` — **comparte** el código de la plantilla usada, de modo que el código del documento subido por el director coincide con el del contrato que genera el asesor (fallback `CTR-XXXXXX` si el contrato no tiene plantilla persistida). **No es único**: varios contratos generados comparten el código de su plantilla → índice **no único** `contratos_codigo_unico_idx`.
- `estado_gestion text NOT NULL DEFAULT 'original'` — trazabilidad: `original` | `modificado` | `eliminado` (CHECK constraint `contratos_estado_gestion_check`).
- `motivo_gestion text` — motivo de la modificación o eliminación (lo exige la UI antes de modificar/borrar).

**Storage:** bucket **`contratos`** (público). Guarda los originales subidos (`{agency_id}/originales/...`) y los PDFs generados (`{agency_id}/generados/{contrato_id}.pdf`). Las escrituras se hacen siempre con `service_role` (`createAdminClient`); la lectura es vía `getPublicUrl`.

### 14.1 Página y navegación por pestañas

**Componente:** `components/contratos-ia/ContratosIAPage.tsx` (rutas `/director/contratos-ia` y `/asesor/contratos-ia`, mismo componente con prop `role`).

| Pestaña | Visible para | Contenido |
|---|---|---|
| **Nuevo Contrato** | director + asesor | `TipoContratoSelector` → `ContratoWizard` (creación o edición) |
| **Contratos Generados** / **Mis Contratos** | director + asesor | `ContratosGenerados` (tabla) |
| **Mis Plantillas** | **solo director** | `PlantillasList` |

El wizard se reutiliza para **crear** y para **editar** (modo edición vía `isEditing` + `motivoEdicion`, abierto desde la tabla de contratos generados).

### 14.2 CRUD de Contratos — visibilidad por rol

**Endpoint:** `GET/POST /api/contratos` — `app/api/contratos/route.ts`

- **GET:**
  - **Director:** ve **todos** los contratos de la agencia (incluidos los `eliminado`, con su motivo). Cada fila se enriquece con `asesor_nombre` (JOIN a `profiles` por `created_by`).
  - **Asesor:** ve **solo los propios** (`created_by = user.id`) y **excluye** los `estado_gestion = 'eliminado'`.
- **POST:** crea contrato con `template_id`, `tipo`, `nombre_referencia`, `estado` (default `borrador`), `form_data`, `estado_gestion = 'original'`, `created_by`. Resuelve `codigo_unico`:
  - Si la plantilla ya tiene código → lo hereda.
  - Si la plantilla aún no tiene código (p.ej. del sistema) → genera `PLT-XXXXXX` y lo **persiste en la plantilla** con `createAdminClient` (un asesor no podría editar plantillas por RLS).
  - Sin plantilla persistida → genera `CTR-XXXXXX` propio.

**Endpoint:** `GET/PUT/DELETE /api/contratos/[id]` — `app/api/contratos/[id]/route.ts`
- **PUT (editar):** actualiza `form_data`/`estado`/`pdf_url`/`nombre_referencia`. Si cambió `form_data` → marca `estado_gestion = 'modificado'` y guarda `motivo_gestion`.
- **DELETE (soft-delete):** **no borra la fila**; marca `estado_gestion = 'eliminado'` + `motivo_gestion`. El director conserva el historial completo.

### 14.3 Tabla "Contratos generados"

**Componente:** `components/contratos-ia/ContratosGenerados.tsx`

Columnas: (Asesor — solo director), Contrato, **Código** (badge mono), Cliente / Propiedad (derivados del `form_data` probando varias convenciones de placeholder), (Estado de gestión + Motivo — solo director), PDF, Acciones.

- **Estado de gestión** con color: `original` (verde), `modificado` (amarillo), `eliminado` (rojo); fila eliminada se atenúa.
- **PDF:** si hay `pdf_url` → link "Ver" (abre Storage); si no → botón "Descargar" que genera el PDF en cliente.
- **Modificar / Eliminar:** ambos abren un diálogo que **exige el motivo**. Modificar reabre el wizard en modo edición con el motivo; Eliminar hace `DELETE` con el motivo.

### 14.4 Templates de Contratos

**Endpoint:** `GET/POST /api/contract-templates` — `PUT/DELETE /api/contract-templates/[id]` — `PATCH /api/contract-templates/[id]/activate`

- **GET:** lista plantillas de la agencia + las `is_system_default`. Si la agencia no tiene ninguna, **siembra** las 4 del sistema (Locación Habitacional Ley 27.551/DNU 70/2023, Locación Comercial CCyC, Boleto de Compraventa, Reserva de Venta), cada una con su `codigo_unico` (`PLT-XXXXXX`).
- **POST (subir plantilla):** **solo directores** (los asesores únicamente las usan). Límite **50 plantillas subidas por agencia** (no cuenta las del sistema). Guarda `codigo_unico` y `archivo_original_url`.

### 14.5 Conversión de documento → plantilla (IA)

**Endpoint:** `POST /api/contratos/convert-template` — `app/api/contratos/convert-template/route.ts`  
**Modelo:** Gemini (`gemini-3.5-flash`)

1. Recibe un `.docx` o `.pdf` (máx **25 MB**). Extrae texto con `mammoth` (docx) o `pdf-parse-fork` (pdf).
2. **Sube el archivo original** al bucket `contratos` (`{agency_id}/originales/{uuid}.ext`) → guarda `archivo_original_url`.
3. Consume **1 crédito IA** (`contratos_ia`) y registra costo real de tokens (`updateAiTransactionCost`).
4. La IA convierte el contrato en plantilla reutilizable reemplazando todos los datos variables por placeholders `{{PREFIJO_CAMPO}}` (LOCADOR_, LOCATARIO_, INMUEBLE_, PRECIO_, etc.), detectando también campos vacíos (rayas, puntos suspensivos, `[COMPLETAR]`, `XXXX`).
5. **Output JSON:** `{ template_body, placeholders_detectados, tipo_contrato_detectado, advertencias, archivo_original_url }`.

### 14.6 Generación del PDF y guardado en Storage

**Helper:** `lib/contratos/download-helper.ts`
- `buildContratoDoc()`: obtiene el contrato + su plantilla, **interpola** el `template_body` con el `form_data` (`interpolateTemplate`) y genera el PDF en **cliente** (`pdf-generator.ts`, jsPDF), agregando las líneas de **firma presencial** según el tipo de contrato (`FIRMANTES_POR_TIPO`).
- `downloadContractFromId()`: descarga el PDF directamente.
- `uploadContractPDF()`: genera el PDF y lo **sube a Storage** vía `POST /api/contratos/[id]/pdf`.

**Endpoint:** `POST /api/contratos/[id]/pdf` — guarda el PDF en `{agency_id}/generados/{contrato_id}.pdf` (`upsert`, path estable: al modificar reemplaza el archivo y el link se mantiene) y persiste `pdf_url` con **cache-busting** (`?v=timestamp`). El `ContratoWizard` llama a `uploadContractPDF` tras crear o editar.

### 14.7 Finalización (firma presencial)

**Endpoint:** `POST /api/contratos/generate-pdf` — `app/api/contratos/generate-pdf/route.ts`

1. Consume **5 créditos IA** (`contratos_ia`).
2. Marca el contrato como `pendiente_firma`. **La firma es presencial (en papel)**: no se almacenan firmas digitales en este flujo; el PDF queda listo para imprimir y firmar.

> La tabla `contract_signatures` (y `GET/POST /api/contratos/[id]/signatures`) se conserva del diseño original pero el flujo vigente usa **firma presencial**, por lo que no se alimenta en la operación normal.

---

## 15. Módulo ACM — Análisis Comparativo de Mercado (ex Tasaciones)

> **Actualización (jun-2026): la página "Tasaciones" pasó a ser "ACM (Análisis Comparativo de Mercado)".**
> - Rutas nuevas: `/asesor/acm` y `/director/acm` (las viejas `/…/tasaciones` redirigen 308 a las nuevas, ver `next.config.mjs`).
> - **Nueva lógica:** se elige UNA propiedad sujeto por **(a) formulario manual**, **(b) link de cualquier portal** (botón "Analizar", extracción server-side) o **(c) desplegable de la cartera** de la agencia. El backend busca **comparables reales** en `properties` (cartera) + `roomix_properties` (red de colaboración) con **filtros duros + embedding (Gemini 768d)**, devolviendo cada comparable con **% de comparabilidad** y un **checklist** (qué coincide y qué no). El **precio queda FUERA del %**.
> - **Funciones SQL nuevas:** `acm_match_properties` y `acm_match_roomix` (migración `20260625130000_acm_match_functions.sql`). Filtros duros: misma operación + mismo tipo + m² ±40% + ambientes ±1. % ponderado: Zona 25 · Superficie 25 · Ambientes 20 · Baños 10 · Amenities 10 (Jaccard ES+EN) · Semántica 10; los pesos se redistribuyen si falta dato. Tipo y operación son **gates** (peso máximo, siempre coinciden).
> - **Endpoints nuevos:** `app/api/acm/comparables`, `app/api/acm/extract`, `app/api/acm/cartera`. Librerías en `lib/acm/` (`extract.ts`, `subject.ts`, `checklist.ts`, `tokko.ts`).
> - **Extracción por link en cascada:** Tier 1 (server-side: JSON-LD → OpenGraph → IA). Tier 2 (servicio con navegador stealth `roomix-sync/extractor-server.mjs`, env `ACM_EXTRACTOR_URL`) para portales que bloquean (ML/ZonaProp/Argenprop). Ver `roomix-sync/ACM-EXTRACTOR-EASYPANEL.md`.
> - **Fix robustez del link (jun-2026):** el Tier 2 se invoca **una sola vez** como máximo (antes podía llamarse dos veces y, con `maxDuration=60` del route, la función se cortaba y devolvía HTML de error no-JSON → el front rompía con `Unexpected token 'A'… is not valid JSON`). Tiempos acotados (fetch 12s + servicio 38s) para entrar bajo 60s y el cliente (`subject-input.tsx`) ahora tolera respuestas no-JSON con mensaje claro. **Cartera con buscador:** el modo "Desde la cartera" pasó de `<Select>` simple a **combobox con búsqueda por texto** (título/dirección/ciudad). **Reset por solapa:** al cambiar de modo (manual/cartera/link) se limpia el formulario (`onReset` en `AcmModule`). Todo aplica a asesor y director (`/director/acm` reusa `AcmModule`).
> - **Reservado a futuro:** la grilla MCM de valuación (`lib/tasacion/calculos.ts`, `step3-grilla.tsx`, `step4-resultado.tsx`) **se conserva en el repo pero NO se renderiza**; se reusará para el informe con marca. Lo descrito en 15.1/15.2 queda como referencia histórica.

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

### 18.4 Documentos Oficiales descargables (sección aparte, NO consultada por IA)

Solapa independiente dentro de `/director/documentos` y `/asesor/documentos` para alojar **documentación oficial de la agencia** (contratos, reglamentos, etc.) pensada para **descarga**, sin ningún procesamiento de IA.

- **Aislamiento total de la IA:** vive en tablas propias (`official_documents` y `official_document_folders`) que la IA **no conoce**. El RAG (`match_agency_documents`) solo lee `agency_documents`, por lo que es imposible que el Tutor IA consulte estos archivos.
- **Sin embeddings ni extracción de texto:** la subida va directo del navegador a Supabase Storage (bucket `documents`, prefijo `official/{agencyId}/`) + insert en `official_documents`. No consume créditos IA.
- **Subida múltiple:** el botón "Subir Documentos" acepta **varios archivos a la vez** (input `multiple`). El `title` de cada documento se deriva del **nombre del archivo sin extensión**; todos se guardan en la **carpeta elegida** (selector único, que lista las carpetas con su ruta completa "Carpeta / Subcarpeta"). Se suben en serie con barra de progreso (`done/total`) y manejo tolerante a fallos (si uno falla, los demás se insertan y se reporta cuál no entró).
- **Carpetas y subcarpetas (jerarquía):** `official_document_folders` tiene `parent_id` (autorreferencia, `ON DELETE CASCADE`); `parent_id NULL` = carpeta de raíz. Se navega con un **breadcrumb** (Inicio › Carpeta › Subcarpeta): "entrar" a una carpeta muestra sus subcarpetas (tarjetas clickeables) y los documentos sueltos de ese nivel. "Nueva Carpeta" crea en la raíz; estando dentro de una carpeta, el mismo botón pasa a **"Nueva Subcarpeta"** y crea con `parent_id` = carpeta actual. Borrar una carpeta **borra también sus subcarpetas** (cascade) y deja los documentos de todo ese subárbol **sin carpeta** (`folder_id` queda `NULL` por el `ON DELETE SET NULL` de `official_documents`). El buscador, cuando hay texto, busca en **todas** las carpetas (ignora el nivel actual).
- **Director:** crea carpetas y subcarpetas con nombre personalizado, sube archivos (sin límite de tamaño, uno o varios a la vez), reemplaza por una versión nueva (borra la anterior del storage y sube `version`), mueve entre carpetas, renombra/elimina y descarga.
- **Asesor:** acceso **solo lectura** — navega carpetas/subcarpetas y descarga; no ve botones de gestión (`readOnly` en el componente compartido).
- **Componente compartido:** `components/documentos/OfficialDocsSection.tsx` (prop `readOnly` distingue asesor de director).
- **Permisos (RLS):** ver = cualquier miembro de la agencia; gestionar = solo `director`.

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

> **Precios centralizados** en `utils/aiCostCalculator.ts` (`AI_PRICING` / `IMAGE_PRICING`). Cada ruta calcula el costo real con `calculateCost` / `calculateImageCost` según el modelo; nunca tiran error (ante un modelo desconocido registran $0 y loguean). Cambiás tarifas en un solo lugar.

| Feature | Créditos | Modelo | Costo (tabla central, por 1M tokens) |
|---|---|---|---|
| `consultor_ia` | 1 | GPT-4.1-mini | $0.40 in / $1.60 out |
| `tutor_ia` | 1 | GPT-4.1-mini | $0.40 in / $1.60 out |
| `marketing_ia` (copy) | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `marketing_ia` (batch) | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `marketing_ia` (image) | 2 | Nano Banana Pro | $0.134/img (1K-2K) · $0.24 (4K) |
| `contratos_ia` (convert-template) | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `contratos_ia` (generate-pdf) | 5 | — | — |
| `tasador_ia` | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `analisis_chat_ia` | 1 | Gemini 3.5 Flash | $0.75 in / $4.50 out |
| `documentos_ia` | 1 | Gemini Embedding 004 | $0.02 in |

`analisis_chat_ia` y `tasador_ia` ahora **sí registran** `usd_cost` real (antes solo descontaban crédito). El dashboard de Créditos IA (`components/ai-credits-dashboard.tsx`) muestra los **7 módulos** con nombre e ícono propios.

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
| `/api/admin-vakdor/bandejas` | GET | Monitoreo cross-tenant de conversaciones WhatsApp de todas las agencias (lista paginada con filtros por agencia/estado/texto) |
| `/api/admin-vakdor/bandejas/[id]` | GET | Detalle de una conversación (mensajes) de cualquier agencia |
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

> **Nota (jun-2026):** este diagrama refleja el diseño **original** (búsqueda híbrida vectorial + filtros). El flujo **vigente** es el descripto en **§10.3** (filtro duro SQL por operación/tipo + interpretación en memoria de zona/precio/ambientes/amenities, con memoria por chat y datos de Roomix). Se conserva el diagrama abajo como referencia histórica.

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
  - `ObjectivesDashboard`: Sección "Objetivos vs Alcanzado" (antes del Ranking). Tabla por asesor con 3 filas por mes (Objetivo / Alcanzado / % cumplido) + gráfico `ComposedChart` (barras objetivo vs alcanzado y línea de %). Filtro de año y toggle de métrica (Facturación / Captación). Re-carga al cambiar año vía server action `getObjectivesDashboardForYear`.
  - `PerformanceLeaderboard`: Ranking de los asesores de la agencia.
  - `DashboardActivity`: Feed en tiempo real de los últimos eventos (ej. nuevo lead, propiedad sincronizada, etc.).
- **Datos:** Llama a `getDashboardData(agency_id)` sin filtrar por asesor. Los objetivos se traen con `getObjectivesDashboard(agency_id, año)` (`lib/tracking/objetivos.ts`), que cruza `performance_objectives` (lo planificado) con lo derivado de `performance_logs` (lo alcanzado). Presente en el dashboard de director **y** de asesor.

#### 2. Pipeline / CRM (`/director/pipeline`)
- **Objetivo:** Gestión visual (Kanban) de los leads y oportunidades.
- **Lógica Interna:**
  - Une dos fuentes de datos: `leads` (provenientes de Tokko) y `wa_conversations` (provenientes de WhatsApp).
  - Mapea ambas fuentes a una interfaz común `Lead`.
  - El Kanban (`KanbanBoard`) maneja el *drag & drop* entre las 9 etapas reales (`KANBAN_STAGES`): nuevo, contacto, calificado, visita_agendada, visita_realizada, propuesta, negociacion, cerrado, perdido. Al soltar, persiste con `updateLeadStage` (Tokko) o `updateWaConversationStage` (WhatsApp). El click en una tarjeta abre `LeadDetailSheet` (panel de **solo lectura**: contacto, actividades y notas).

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
- **Acciones por fila en "Leads WhatsApp"** (`LeadsWhatsappClient`, compartido director/asesor):
  - **Editar** (modal): nombre, teléfono, etiquetas y **clasificación**. Guarda en `wa_conversations` y replica al contacto de la agenda por teléfono (`updateConversationDetails`).
  - **Eliminar**: borra la conversación + sus mensajes (CASCADE) + la memoria del bot (`n8n_chat_histories`) y, si ningún otro chat usa ese teléfono, también el contacto en `wa_contacts` (`deleteConversation`). Pide confirmación.
  - **Columna y filtro por Clasificación** (badge de color). Estas acciones impactan directamente en la bandeja del "Asesor IA WhatsApp" (misma tabla `wa_conversations`).

#### 5. Configuración y Asesores (`/director/configuracion`, `/director/asesores`)
- **Objetivo:** Setup inicial y gestión del equipo.
- **Lógica Interna:**
  - **Asesores:** Invitar nuevos asesores mediante códigos. Cada tarjeta muestra performance real (Captaciones/Cierres/Cartera/Rotación, de `getDashboardData`) y un panel con el embudo de conversión. La única acción de gestión es **Desvincular asesor** (server action `desvincularAsesor`): pone `estado='eliminado'` + `tokens_invalidos_desde` y bloquea el email en `emails_bloqueados`, dejándolo sin acceso al sistema.
  - **Configuración:** Token de Tokko, Instancia de WhatsApp, Branding (logo y colores para Marketing IA), y facturación.

#### 6. Herramientas IA (Marketing, Contratos, Tasaciones)
- **Marketing IA (`/director/marketing-ia`):** Generador de anuncios a partir de perfiles IPC (Ideal Prospect Client) para "Captar" propietarios o "Vender" (atraer compradores). El flujo "Crear Anuncio" genera de una **3 variantes completas (copy + imagen)** con ángulos distintos (no hay "copy simple" en la UI). Las imágenes usan **Nano Banana Pro (Gemini 3 Pro Image)** integrando el branding de la agencia. En el IPC "Vender" se puede vincular una propiedad de Tokko, pero esa función está **reservada a futuro**: hoy el copy no usa sus datos concretos. Ver detalle en §13.
- **Tasaciones (`/director/tasaciones`):** Asistente MCM (Método Comparativo de Mercado) de 4 pasos, **cálculo client-side** que emite rango mínimo/sugerido/máximo. **No usa IA generativa y NO consume créditos.**
- **Contratos (`/director/contratos-ia`):** Gestión de plantillas y conversión a contratos formales. La **firma es presencial (papel)** — se quitó la sección de firma virtual. Consume 5 créditos por contrato finalizado.

#### 7. Tracking Performance (`/director/tracking-performance`, `/asesor/tracking-performance`)
- **Objetivo:** Registrar actividad comercial diaria (llamadas, prelistings, captaciones, etc.) para nutrir el Dashboard, y fijar los objetivos mensuales del equipo.
- **Lógica Interna:** Utiliza tabs. El asesor ve **Actividad**; el director ve además **Objetivos** y **Configuración IA** (escalas de performance: qué puntaje da cada acción).
- **Tab "Objetivos" (solo director, `PerformanceObjectivesEditor`):**
  - Matriz asesores × 12 meses para cargar la meta mensual de **Facturación** (USD) y **Captación** (cantidad). Toggle de métrica + filtro de año.
  - **Edición temporal:** solo el mes en curso y los futuros son editables (`isMonthLocked`); meses cerrados se bloquean y los años anteriores quedan en solo lectura (historial de planificaciones).
  - **"Aplicar a todos":** copia un valor a todos los meses editables de un asesor.
  - **Server Actions** (`actions/tracking/objetivos.ts`): `getAgencyAdvisors`, `getObjectivesForEditor(year)` y `saveObjectives({year, cells})`. `saveObjectives` valida `role='director'`, descarta meses cerrados, fuerza el `agency_id` desde el perfil y hace `upsert` con `createAdminClient()` sobre `performance_objectives` (`onConflict: agent_id,year,month,metric`). Revalida los paths del tracking y los dashboards.
  - **Alcanzado (derivado, no se guarda):** `lib/tracking/objetivos.ts` → `getAchievedByAgentMonth` agrupa `performance_logs` por asesor×mes con la misma fórmula del Dashboard (facturación = Σ monto·comisión/100 sobre cierres; captación = nº de captaciones).
- **Formulario de Registro (PerformanceLogForm):**
  - **Activos Vinculados:**
    - **Zona/Barrio:** Campo de texto libre para indicar la zona geográfica de la actividad.
    - **Propiedad (Tokko):** Desplegable con las propiedades de la cartera de Tokko, filtradas por asesor asignado.
    - **Propiedad (Colaboración):** Campo de texto para registrar actividades con propiedades externas a la cartera de Tokko (ej. una colaboración con otra inmobiliaria).
    - **Vincular Cliente:** Búsqueda entre leads de Tokko y contactos de WhatsApp asignados al asesor.
    - **Registro Manual de Lead (componente compartido `ManualContactFields`):** Alternativa para registrar contactos nuevos (amigos, vecinos, referidos) que no existen en la base de datos. Pide **nombre completo, celular, email y etiqueta (opcional)**. **Celular con selector de país + normalización E.164:** un `SearchableSelect` lista los países (vía `getPhoneCountries`, con bandera emoji y código de llamada; default AR) y el usuario escribe el número en formato local; `lib/whatsapp/phone.ts` lo normaliza a E.164 sin "+" con `libphonenumber-js` (`normalizePhoneE164`) y muestra el preview formateado (`formatPhoneInternational`). Para Argentina se fuerza el "9" de móvil tras validar (si el número queda como `54`+área sin `9`), porque los contactos son siempre celulares de WhatsApp. Para evitar cargas falsas/desprolijas, nombre, celular y email tienen **doble verificación**: se reescriben en un segundo campo (sin copiar/pegar — se bloquean `onPaste`/`onDrop`) y el sistema valida en tiempo real que coincidan (indicador ✅/❌); en el celular la comparación es sobre el **E.164 normalizado** (no el texto), así dos formas de escribir el mismo número se consideran iguales. Antes de habilitar la creación, exige tildar una **casilla de certificación** declarando que los datos son reales y obtenidos legítimamente (`isValid` agrupa coincidencias + formatos válidos + certificación). El teléfono se reporta hacia arriba ya en E.164. Para el director, muestra un desplegable de asesores; para el asesor, se autocompleta con su cuenta. El lead se crea vía `createManualContact.ts` (contacto en `wa_contacts` con email en `metadata`, y conversación en `wa_conversations`).
  - **Origen de Consulta:** Lista exhaustiva de canales: Acciones indirectas, Alianzas Estratégicas, Argenprop, Arquitectos/Agrimensores, Buzoneo/Folletos, Chatbot, Cliente Antiguo, Constructor, Dueño Vende, Email Marketing, Eventos, Facebook, Familiar/Amigo, Google Ads, Google Maps, Guardia, Instagram, Landing Page, Letrero, Llamadas en frío, MercadoLibre, OLX, Open House, Portal propio, Prensa, Radio, Referido colegas, Referido cliente, Redes de contacto, Señalética, Telemarketing, TikTok, Tokko CRM, Voz a voz, WhatsApp orgánico, YouTube, ZonaProp, Otros.
  - **Server Action:** `actions/whatsapp/createManualContact.ts` — crea el contacto en `wa_conversations` y devuelve el resultado al formulario.

#### 8. Asistentes Conversacionales (Tutor y Consultor IA)
- **Tutor IA (`/director/tutor`):** Chat interactivo para hacer preguntas sobre manuales o documentos internos subidos a la base de conocimiento (RAG). Consume 1 crédito por mensaje. Usa el modelo configurado y retorna las "sources" (fuentes) utilizadas.
- **Consultor IA (`/director/consultor`):** Buscador conversacional de propiedades. Un agente IA que entiende la consulta (ej. "Busco un 3 ambientes en zona norte por menos de 250k"), hace un Vector Search + Filter Search en la DB, y retorna tarjetas visuales (carrousel) de las propiedades que coinciden (incluyendo tags de *amenities* que coinciden o faltan). Consume 1 crédito.

#### 9. Calendario y Pulso de Mercado (`/director/calendario`, `/asesor/calendario`, `/director/mercado`)

- **Calendario:** Visualiza `scheduled_visits` con vista mensual. Director puede filtrar por asesor; asesor ve solo sus visitas.
  - **Acciones (editar/cancelar) — jun-2026:** tanto asesor como director pueden **Reprogramar/Editar** (`EditVisitDialog`, motivo obligatorio) y **Cancelar** (motivo obligatorio) **solo sobre visitas propias** (`visit.agent_id === userId`), **futuras** y en estado `agendada`. El director ve **todas** las visitas de la agencia, pero los botones de acción aparecen únicamente en las que tiene asignadas a sí mismo; en las de otros asesores ve el detalle sin acciones. La RLS lo respalda: política `"Directors can manage all visits in their agency"` (cmd ALL) permitiría más, pero la UI lo acota a las propias a pedido del producto. Tras editar/cancelar se dispara `triggerCalendarSync(visitId)`.

  **Formulario "Agendar Visita" (`NewVisitDialog.tsx`):**
  - **Información del Lead — 3 alternativas:**
    1. **Buscar desde Tokko:** Desplegable con leads de Tokko asignados al asesor (o todos si es director).
    2. **Buscar desde WhatsApp:** Desplegable con contactos de `wa_conversations` de la agencia.
    3. **Carga Manual (componente compartido `ManualContactFields`):** Nombre completo, celular (formato internacional obligatorio), email y etiqueta (opcional). Igual que en Tracking, nombre/celular/email llevan **doble verificación** (reescritura sin copiar/pegar + validación de coincidencia y formato en tiempo real) y una **casilla de certificación** obligatoria. Crea automáticamente el contacto en `wa_contacts`/`wa_conversations` vía `createManualContact.ts` y guarda el email también en `scheduled_visits`.
  - **Detalle de la Cita:**
    - Fecha y hora.
    - **Propiedad (Tokko):** Desplegable filtrado por las propiedades asignadas al asesor activo (matcheo por email entre `properties.assigned_agent.email` y `profiles.email`). Si es director y selecciona un asesor del desplegable, la lista se filtra automáticamente a las propiedades de ese asesor.
    - **Propiedad (Colaboración):** Campo de texto alternativo para registrar la dirección de una propiedad externa a la cartera de Tokko. El valor se guarda mergeado en la columna `propiedad_titulo` con prefijo "Colaboración:".
  - **Calificación y Perfil:** Tipo de operación, presupuesto, calificación (HOT/WARM/COLD), intereses clave, objeciones detectadas, decisores.
  - **Gestión y Asignación:** Asesor responsable (autocomplete para asesor, desplegable para director), origen de consulta (misma lista exhaustiva que Tracking Performance).
  - **Score BANT:** Se hardcodea a 0 automáticamente, no se muestra en el formulario.

  **Vista de Detalle de Visita (Dialog):**
  - Muestra propiedad, lead, fecha/hora, operación, presupuesto, calificación, intereses, objeciones, decisores y resumen de conversación.
  - **No muestra Score BANT** (oculto tanto en asesor como en director).
  - Si la visita fue modificada (tiene `motivo_cambio` y sigue en estado `agendada`), muestra una etiqueta **"Modificada"** en ámbar.
  - Si la visita fue cancelada, muestra el **"Motivo de Cancelación"** en un recuadro rojo.
  - Si la visita fue modificada sin cancelarse, muestra el **"Motivo de Modificación"** en un recuadro ámbar.

  **Acciones sobre Visitas Futuras (solo si `estado_visita === 'agendada'` y la fecha/hora aún no pasaron):**
  - **Reprogramar / Editar (`EditVisitDialog.tsx`):** Formulario que precarga los datos actuales (fecha, hora, propiedad, zona). El usuario puede modificar los campos que desee; los no modificados quedan iguales. **Requiere motivo de cambio obligatorio** que se guarda en `motivo_cambio`. Al guardar, si se ingresó una "Propiedad (Colaboración)", se mergea en `propiedad_titulo`.
  - **Cancelar Visita:** Pop-up de confirmación para evitar toques accidentales. **Requiere motivo de cancelación obligatorio**. Al confirmar, actualiza `estado_visita` a `cancelada` y guarda el motivo en `motivo_cambio`.
  - **Visitas pasadas:** Los botones de acción no se muestran; aparece el mensaje "Esta visita ya no puede ser modificada."

- **Mercado:** Tablero de comando del mercado real. Muestra cotización del dólar (tiempo real), ICC, precios Zonaprop por zona, precios m² por barrio (Mudafy) y escrituras CABA (Colegio de Escribanos). Cada fuente con su fecha real de actualización; sin datos inventados (si falta, "Sin datos"). Sincronización por el botón "Actualizar" (`/api/mercado/sync?source=...`, una fuente por request para respetar el límite de Vercel Hobby).

---

### 27.2 Módulo del Asesor (`app/asesor/`)

El módulo del asesor hereda y reutiliza gran parte de los componentes de UI del director, pero con una capa estricta de filtros aplicada a nivel base de datos (y reforzada en UI) para garantizar que el Asesor solo vea **su propia información** o información compartida públicamente por la agencia.

#### 1. Dashboard Asesor (`/asesor/dashboard`)
- **Diferencia con Director:** Llama a `getDashboardData(agency_id, user.id)`. Solo muestra los KPIs y gráficos de las propiedades, leads y actividades asignadas a este asesor en particular. Sin embargo, muestra el ranking global (`PerformanceLeaderboard`) y la sección **Objetivos vs Alcanzado** (`ObjectivesDashboard`, a nivel agencia) para que el asesor conozca su posición y las metas del equipo. El asesor **no** puede editar objetivos (la carga es exclusiva del director en Tracking Performance).

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
| `/api/ficha/share` | POST | Tenant | Genera ficha pública compartible (snapshot + token) |
| `/ficha/[token]` | GET (page) | Público | Ficha de propiedad de lujo (solo-lectura del snapshot) |
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
| `/api/marketing-ia/generate-batch` | POST | Tenant | 3 copys a la vez (flujo vigente) |
| `/api/marketing-ia/generate-copy` | POST | Tenant | 1 copy — **legacy, sin uso en la UI** |
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
| `/api/google-calendar/connect` | GET | Sesión | Inicia OAuth Google Calendar |
| `/api/google-calendar/callback` | GET | Sesión | Guarda refresh token encriptado |
| `/api/google-calendar/status` | GET | Sesión | Estado de conexión del asesor |
| `/api/google-calendar/disconnect` | POST | Sesión | Revoca y borra la llave |
| `/api/google-calendar/sync` | POST | Sesión | Reconcilia visita ↔ evento (best-effort) |
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
