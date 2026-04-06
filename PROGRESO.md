# 📋 PROGRESO — PRISMA IA (v1.0.1)
> Estado: Sincronización completa. Correcciones de build (dependencies, tsconfig, JSX) aplicadas.
> Actualizar al finalizar cada tarea, prompt o sesión de trabajo.

---

## 📌 INFO DEL PROYECTO
- Nombre: PRISMA IA
- Stack: Next.js 14 · Supabase · Gemini API · Tokko API · TypeScript · Tailwind · shadcn/ui
- Repo GitHub: [URL del repo]
- Supabase Project: [URL del proyecto]
- Versión actual: v1.0.0 (Sistema Completo - Producción)
- Último deploy: 2026-03-22 (Validación final exitosa)

---

## ✅ LO QUE SE USA (decisiones confirmadas)
- Next.js 14 App Router (NO Pages Router)
- Supabase para DB, Auth y Storage
- Gemini API (gemini-2.0-flash) para todos los bots e IA
- Tokko Broker API para sync de propiedades
- @dnd-kit para el Kanban
- Recharts para gráficos
- next-themes para dark/light mode
- Zod para validación de inputs
- date-fns para manejo de fechas
- MCP de GitHub para todos los deploys

## ❌ LO QUE NO SE USA (decisiones explícitas)
- Pages Router
- fetch directo a Postgres (siempre usar cliente Supabase)
- CSS custom (solo Tailwind + variables en globals.css)
- Librerías de animación pesadas (solo CSS transitions/animations)
- Git CLI para commits/push (siempre usar MCP de GitHub)
- Deploy sin confirmación explícita del usuario

---

## 📦 HISTORIAL DE VERSIONES
| Versión | Fecha | Qué incluye |
|---------|-------|-------------|
| v0.1.0  | 2026-03-21 | Fundación técnica: Next.js 14, Supabase (9 tablas), RLS, Middleware, Libs. |
| v0.2.0  | 2026-03-21 | Landing Page & Auth: Landing premium, registro roles (Director/Asesor), Google OAuth. |
| v0.3.0  | 2026-03-21 | Director Layout & Dashboard: Sidebar, Header, KPIs, Recharts, Actividad, Mobile UX. |
| v0.7.0  | 2026-03-22 | Bots IA (Tutor/Consultor), Leads avanzados, Tasaciones y Configuración de Agencia. |
| v1.0.0  | 2026-03-22 | CIERRE PRODUCCIÓN: Seguridad robusta, Rate Limiting, UI Polish, SEO y 404 custom. |

---

## 🔄 ENTRADAS DE PROGRESO

### 2026-04-06 | P4 Extra — WhatsApp Module: Lead Traceability
- **Nuevo Componente `LeadTraceability.tsx`**:
  - Panel informativo lateral anidado (Desktop) / por Tabulación (Mobile) para inluir metadata dinámica del lead.
  - **SECCIÓN 1 (Datos)**: Copiado de teléfono interactivo, edición inline del nombre `contact_name` guardado onBlur, Selector de pipeline state (active/pending/closed), e indicador de score (0-100).
  - **SECCIÓN 2 (Timeline)**: Registro cronológico truncado de actividad (`WAConversation`) con distinción visual estricta de orígenes (`lead`, `bot`, `human`, `internal`).
  - **SECCIÓN 3 (Recomendadas)**: Extracción reactiva sobre payloads de metadata del modelo JSON de Supabase.
  - **SECCIÓN 4 (Visitas)**: Implementación de query *single* vía Try/Catch sobre la tabla `visits` local para agendamientos.
  - **SECCIÓN 5 (Estadísticas)**: Volumetría, antigüedad en días, latencia media en tiempo de respuesta del Bot en base a cálculo acumulativo.
- **Modificación `ActiveChat.tsx`**:
  - Reestructurado del wrapper Flex para permitir tercera columna full-height en breakpoint `lg`.
  - Implementación de estado `activeTab` que transmuta el layout en móvil mediante Header customizado (Info / Volver al Chat).

### 2026-04-06 | P6 — WhatsApp Module: Interfaz de Plantillas (UI)
- **Modificación `page.tsx`**: Integración de componente `<Tabs>` (vía shadcn/ui) sin mutar la lógica server-side original del chequeo de `instance`. Tabs: `chat` & `plantillas`.
- **Componente `TemplatesTab.tsx`**:
  - **Vista Lista**: Carga `wa_templates` (filtra por `agency_id`, ORDEN DESC), botonera para "Sincronizar desde Meta", UI visual indicando status (Badge color verde, amarillo, rojo con Tooltip de razón de rechazo). Acceso a Preview embebida en `<Drawer>`.
  - **Builder Dinámico (React)**: Diseño a 2 columnas (Form + Preview simulada).
  - Validaciones de campos (regex `a-z0-9_` para nombre, limits precisos).
  - Variables dinámicas con `Regex` detectando `{{n}}`.
  - Select para Botones (Ninguno, Respuesta Rápida, Enlace URL) inyectados adaptativamente en payload de Meta.
  - Preview reactiva con `useDeferredValue` que simula la burbuja nativa verde/blanca the WhatsApp Mobile App.

### 2026-04-06 | P5 — WhatsApp Module: Lógica y Webhooks
- **Variables de entorno**: Se añadió `BOT_REPLY_SECRET` a `.env` y `.env.example`.
- **Server Actions** (`/app/actions/whatsapp.ts`):
  - `createTemplate()`: Construye estructuradas, crea template en Meta vía POST y guarda registro local en BD `wa_templates` con estado PENDING.
  - `syncTemplatesFromMeta()`: GET de todos los templates desde Meta, sincronizando iterativamente campos y estado en local mediante upsert en `wa_templates`.
- **Tipos** (`/types/whatsapp.ts`): Se añadió la interfaz `CreateTemplateInput`.
- **API Webhooks**:
  - `/api/webhooks/evolution`: POST. Extrae el texto del mensaje, identifica instancia, crea o ubica la conversación correspondiente con el lead, inserta en `wa_messages` y si `bot_active=true` dispara un payload vía webhook genérico (listo para n8n).
  - `/api/messages/bot-reply`: POST desde n8n. Autenticado vía header auth contra `BOT_REPLY_SECRET`. Inserta respuesta (role: 'bot') en Supabase y efectúa el fetch directo POST `/message/sendText` contra Evolution API. Opcionalmente actualiza métricas temporales de la conversación y `wamid`.
  - `/api/webhooks/meta`: GET suscripción al endpoint validando token propio de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; POST recibiendo array con properties de statuses para iterar actualizaciones automáticas a `wa_templates`.

### 2026-04-06 | P1 — WhatsApp Module: Schema + RLS + Realtime
- **Tablas creadas** (4): `whatsapp_instances`, `wa_conversations`, `wa_messages`, `wa_templates`
- **RLS**: Habilitado en las 4 tablas con política `director_only_*` que verifica `agency_id` + `role='director'`. Usuarios con `role='asesor'` NO tienen acceso.
- **CHECK constraints**: `status`, `role`, `category` validados en todas las tablas correspondientes.
- **Realtime**: Habilitado en `wa_conversations` y `wa_messages` vía `supabase_realtime` publication.
- **Variables de entorno**: Agregadas `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Actualizada `NEXT_PUBLIC_APP_URL` a producción.
- **Validación**: 4/4 tablas con RLS=true, 4/4 políticas director-only, 2/2 tablas en Realtime, 5/5 CHECK constraints correctos.
- **Restricción**: Solo CREATE TABLE. NO se modificó ninguna tabla existente (agencies, profiles, leads, properties, etc.).

### 2026-04-06 | P2 — WhatsApp Module: Types + Server Actions
- **Types** (`/types/whatsapp.ts`): 6 union types (`InstanceStatus`, `ConversationStatus`, `MessageRole`, `TemplateStatus`, `TemplateCategory`) + 4 interfaces (`WhatsAppInstance`, `WAConversation`, `WAMessage`, `WATemplate`) + action types.
- **Server Actions** (`/app/actions/whatsapp.ts`): 6 actions + helper `getDirectorProfile()`.
  - `getDirectorProfile()`: Verifica auth + role='director'. Lanza error claro si asesor.
  - `connectWhatsApp()`: POST Evolution API `/instance/create` con webhook config completo. INSERT `whatsapp_instances`.
  - `getInstanceStatus()`: GET Evolution API `/instance/connectionState/{name}`.
  - `toggleBotActive()`: UPDATE `wa_conversations.bot_active`. Flag que n8n lee.
  - `sendDirectMessage()`: Query instance → query conversation → POST Evolution `/message/sendText` → INSERT `wa_messages` role='human'.
  - `addInternalNote()`: INSERT `wa_messages` role='internal'.
  - `updateEtiquetas()`: UPDATE `wa_conversations.etiquetas`.
- **Env example**: Agregadas `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` a `.env.example`.
- **Seguridad**: Todas las actions retornan `{success:false, error}` si `getDirectorProfile()` falla. No se loggean tokens.
- **Restricción**: Solo archivos nuevos. NO se modificó ningún archivo existente excepto `.env.example`.

### 2026-04-06 | P3 — WhatsApp Module: Página + SetupWizard + Sidebar
- **Página** (`/app/director/asesor-ia-whatsapp/page.tsx`): Server Component con doble verificación (auth + role='director'). Redirect a `/dashboard` si asesor. Query `whatsapp_instances` → SetupWizard sin instancia, ChatInterface placeholder con instancia.
- **SetupWizard** (`/components/whatsapp/SetupWizard.tsx`): 6 pasos con checkbox obligatorio. Desktop: sidebar 260px sticky + contenido fade-in. Mobile: pills scrolleables + nav fijo al pie. Progress bar y paso activo en copper (#b87333).
  - P1 "Cuenta Meta": Link externo + checkbox.
  - P2 "Creá tu app": Lista ordenada + checkbox.
  - P3 "Agregá WhatsApp": Lista ordenada + checkbox.
  - P4 "System User y Token": Alert warning token UNA VEZ + lista + checkbox.
  - P5 "Configurar Webhook": Alert info paso crítico + URL/token badges + warning "messages" + checkbox.
  - P6 "Credenciales": Inputs validados (token≥20, phone 10-16 dígitos, business 8-16 dígitos) + botón "Conectar WhatsApp" → loading → polling 5s → router.refresh().
- **Sidebar**: Agregado ítem "Asesor IA WhatsApp" con ícono MessageSquare después de "Leads". Solo se añadió, no se reemplazó nada.
- **ChatInterface placeholder** (`/components/whatsapp/ChatInterface.tsx`): Stub para dynamic import (P4).
- **Checkbox shadcn/ui**: Instalado componente faltante via `npx shadcn@latest add checkbox`.
- **TypeScript**: Sin errores nuevos en archivos WhatsApp (errores preexistentes en contratos/scripts no relacionados).

### 2026-04-06 | P4 — WhatsApp Module: Chat Interface Completo
- **ChatInterface** (`/components/whatsapp/ChatInterface.tsx`): Orchestrador desktop/mobile. Desktop: flex-row `h-[calc(100vh-64px)]`, lista 300px + chat flex-1. Mobile: toggle fullscreen lista↔chat.
- **ConversationsList** (`/components/whatsapp/ConversationsList.tsx`):
  - Carga `wa_conversations WHERE instance_id` + Realtime channel con INSERT/UPDATE/DELETE. Cleanup en return.
  - Búsqueda local contact_name/phone. Tabs "Todos|Bot activo|Pausados".
  - Items: avatar bg-amber-100, nombre bold, timestamp relativo, ícono Bot verde/rojo, max 2 etiquetas, fondo amber-50 si activo.
- **ActiveChat** (`/components/whatsapp/ActiveChat.tsx`):
  - Header: "← Volver" mobile, avatar, badge status, score (red<40, yellow 40-70, green≥70).
  - Etiquetas pills con X + Popover "+" (7 predefinidas). `updateEtiquetas()` optimistic.
  - Switch "Asesor IA": `toggleBotActive()` optimistic (local primero, revert si error).
  - Mensajes: 50 últimos ASC + Realtime INSERT + auto-scroll. Date separators.
    - lead: justify-end, bg-neutral-100, rounded-br-sm.
    - bot: justify-start, bg-orange-50, label "Asesor IA".
    - human: justify-start, bg-blue-50, label "Director".
    - internal: justify-center, bg-yellow-50, ícono Lock, "Nota interna" italic.
  - Zona inferior sticky: bot_active=true → banner verde "Pausar y tomar control". bot_active=false → Textarea + Enviar + Separator + Input nota interna + Agregar. Limpieza tras envío.
  - "Cargar anteriores" si count>50.
- **Realtime**: Cleanup en todos useEffect (wa_conversations + wa_messages).
- **TypeScript**: 0 errores en archivos WhatsApp.

### 2026-03-22 | Fase 7: Operativa Avanzada y Configuración (v0.7.0)
- **Bots de IA (Asesor)**: Tutor IA entrenado con documentos y Consultor IA para matchear propiedades vía Gemini.
- **Leads Asesor**: Carga manual, importación IA vía captura de WhatsApp y Sync con Tokko completados.
- **Tasaciones AVM**: Módulo reutilizado para el Asesor para generar análisis comerciales instantáneos.
- **Configuración (Asesor y Director)**: Actualización de perfiles, logo, credenciales (Tokko API) y generación de códigos de invitación (Director).
- **Build**: Verificación de types (`tsc --noEmit`) asegurada sin errores.

### 2026-03-22 | Fase 6: Advisor Area Implementation
- **Layout & Dashboard Asesor**: Sidebar personalizada, header con búsqueda y KPIs personales (Leads, Ventas, Cierres).
- **Mis Propiedades**: Vista de cartera filtrada por `agent_id` con soporte para Grid/Lista y recomendación a leads.
- **Mi Pipeline**: Kanban personal integrado con `LeadDetailSheet` refactorizado para registro de actividad.
- **Mis Leads & Calendario**: Tabla de prospectos y calendario de visitas personal con diálogos de detalle.
- **UI/UX**: Instalación de `dialog` de shadcn/ui y corrección de errores de lint en componentes compartidos.
- **Build**: Verificación exitosa de producción.


### 2026-03-21 | Fase 4: Pipeline & Propiedades (Tokko Sync) Implementation
- **Pipeline Kanban**: Implementado con `@dnd-kit`, 9 etapas del embudo comercial, drag & drop y persistencia en DB.
- **Detalle de Lead**: Panel lateral dinámico con historial de actividad y acciones de gestión.
- **Sincronización Tokko**: API Route `/api/tokko/sync` con rate limiting (5 min) y mapeo automático de propiedades.
- **Catálogo Propiedades**: Vista dual (Grid/Lista) con filtros por tipo y búsqueda en tiempo real.
- **Esquema DB**: Actualizado con `last_sync_at` en `agencies` y tabla `properties` vinculada.
- **Build**: Verificación de producción exitosa (0 errores).

### 2026-03-21 | Fase 3: Director Layout & Dashboard Implementation
- **Layout Director**: Sidebar navegable (desktop/mobile), header con breadcrumbs y menú de usuario.
- **Dashboard Overview**: KPI Cards, gráficos dinámicos (Leads vs Venta, Distribución) y feed de actividad.
- **Data Hooking**: Integración de sesión de Supabase y acción de `logout`.
- **Componentes UI**: Creación de `Avatar`, `Table`, `Sheet`, `Select`, `Calendar` (v9 compatible) y otros.
- **Build**: Verificación exitosa de producción sin errores de linting ni tipos.

### 2026-03-21 | Fase 2: Landing & Auth Implementation
- **Landing Page**: Implementada con estética dark premium, sticky header, hero animado, stats y secciones de beneficios por rol.
- **Autenticación**: Sistema completo con login y registro diferencial para Director (crea inmobiliaria) y Asesor (valida código).
- **OAuth**: Integración con Google (Supabase) configurada.
- **Middleware**: Refinado para manejo de roles y protección de rutas.
- **Build**: Verificación exitosa de producción (`npm run build`).