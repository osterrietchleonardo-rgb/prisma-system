# 📋 PROGRESO — PRISMA IA (v1.0.4)
> Estado: Producción activa. Primer cliente real onboardeado (MaxRE Inmobiliaria). Bugs corregidos.
> Actualizar al finalizar cada tarea, prompt o sesión de trabajo.

---

## 📌 INFO DEL PROYECTO
- Nombre: PRISMA IA
- Stack: Next.js 14 · Supabase · Gemini API · Tokko API · TypeScript · Tailwind · shadcn/ui
- Repo GitHub: [URL del repo]
- Supabase Project: `vutopjvdrwmvrkgnrfno` (prisma) — región `sa-east-1`
- Versión actual: v1.0.4
- Último deploy: 2026-05-28

---

## 🛡️ REGLAS DE SEGURIDAD (Supabase Data API)
> [!IMPORTANT]
> **Actualización Supabase 2026:** A partir del 30 de Mayo (proyectos nuevos) y 30 de Octubre (proyectos existentes), Supabase NO expone tablas en el esquema `public` por defecto.
> 
> **MANDATORIO para cada nueva tabla o migración:**
> Siempre incluir sentencias `GRANT` explícitas para permitir el acceso vía `supabase-js` (PostgREST/GraphQL).
> 
> ```sql
> -- Ejemplo obligatorio en cada migración de tabla nueva:
> GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_tabla TO authenticated;
> GRANT SELECT ON public.mi_tabla TO anon;
> GRANT ALL ON public.mi_tabla TO service_role;
> ```


---

## ✅ LO QUE SE USA (decisiones confirmadas)
- Next.js 14 App Router (NO Pages Router)
- Supabase para DB, Auth y Storage
- Gemini API (gemini-2.0-flash) para todos los bots e IA
- Tokko Broker API para sync de propiedades y contactos
- @dnd-kit para el Kanban
- Recharts para gráficos
- next-themes para dark/light mode
- Zod para validación de inputs
- date-fns para manejo de fechas
- MCP de GitHub para todos los deploys
- Admin Vakdor: JWT propio (HS256) independiente de Supabase Auth

## ❌ LO QUE NO SE USA (decisiones explícitas)
- Pages Router
- fetch directo a Postgres (siempre usar cliente Supabase)
- CSS custom (solo Tailwind + variables en globals.css)
- Librerías de animación pesadas (solo CSS transitions/animations)
- Git CLI para commits/push (siempre usar MCP de GitHub)
- Deploy sin confirmación explícita del usuario

---

## 🗄️ BASE DE DATOS — TABLAS PRINCIPALES
| Tabla | Propósito |
|---|---|
| `profiles` | Usuarios (director / asesor). Cols: id, role, full_name, email, phone, avatar_url, agency_id, estado, deleted_at, tokens_invalidos_desde, notification_prefs |
| `agencies` | Inmobiliarias. Cols: id, name, logo_url, tokko_api_key, address, phone, email, invite_code, owner_id, performance_config, marketing_ai_config, estado, deleted_at, **last_sync_at** |
| `agency_ai_credits` | Créditos IA por agencia. Cols: agency_id, feature, credits_total, credits_used, credits_director, credits_asesores, credits_used_director, credits_used_asesores, period_start, period_end, reset_interval |
| `leads` | Pipeline de leads. upsert por `tokko_contact_id` |
| `properties` | Propiedades Tokko. upsert por `tokko_id` |
| `tokko_agents` | Agentes de Tokko. upsert por `tokko_id` |
| `admin_vakdor_users` | Admins de Vakdor (sistema separado de auth) |
| `admin_vakdor_activity_log` | Auditoría de acciones admin |
| `log_creditos_admin` | Historial de cambios de créditos por admin |
| `pagos_agencia` | Pagos registrados por mes. Col ID: `agencia_id`, `fecha_registro` |
| `agency_invites` | Códigos de invitación para asesores |
| `director_invites` | Códigos de invitación para directores |
| `whatsapp_instances` | Instancias de WhatsApp por agencia |
| `wa_conversations`, `wa_messages`, `wa_templates`, `wa_contacts` | Módulo WhatsApp |
| `performance_logs` | Actividades de desempeño de asesores |

---

## 🪣 STORAGE — BUCKETS
| Bucket | Público | Uso |
|---|---|---|
| `logos` | ✅ | Logos generales (avatares, etc.) |
| `documents` | ✅ | Documentos de agencia |
| `marketing-images` | ✅ | Imágenes generadas por Marketing IA + logos de agencia |

> **Logo de Agencia**: se sube vía `POST /api/marketing-ia/settings/upload-logo` (usa adminClient, ruta: `{userId}/branding/logo_{timestamp}.{ext}`). La URL pública se guarda en `agencies.logo_url` al guardar ajustes.

---

## 📦 HISTORIAL DE VERSIONES
| Versión | Fecha | Qué incluye |
|---------|-------|-------------|
| v0.1.0 | 2026-03-21 | Fundación técnica: Next.js 14, Supabase (9 tablas), RLS, Middleware, Libs. |
| v0.2.0 | 2026-03-21 | Landing Page & Auth: Landing premium, registro roles (Director/Asesor), Google OAuth. |
| v0.3.0 | 2026-03-21 | Director Layout & Dashboard: Sidebar, Header, KPIs, Recharts, Actividad, Mobile UX. |
| v0.7.0 | 2026-03-22 | Bots IA (Tutor/Consultor), Leads avanzados, Tasaciones y Configuración de Agencia. |
| v1.0.0 | 2026-03-22 | CIERRE PRODUCCIÓN: Seguridad robusta, Rate Limiting, UI Polish, SEO y 404 custom. |
| v1.0.1 | 2026-04-06 | WhatsApp Module completo: Schema, RLS, Realtime, Chat Interface, Plantillas, Webhooks. |
| v1.0.2 | 2026-05-12 | RLS Audit: aislamiento multi-tenant, seguridad granular en 3 tablas. |
| v1.0.3 | 2026-05-27 | WhatsApp: desconexión segura sin FK violation, bugs de plantillas y webhook UX. |
| v1.0.4 | 2026-05-28 | Primer cliente real (MaxRE). Bug `last_sync_at` corregido. Logo upload implementado. |
| v1.0.5 | 2026-05-29 | Documentación completa del módulo Marketing IA. Skill `vakdor-video` creado. |

---

## 🎨 MÓDULO: MARKETING IA PRO (`/director/marketing-ia`)

> Módulo end-to-end de generación de contenido publicitario para inmobiliarias argentinas. Permite a directores y asesores crear anuncios de alto impacto (copy + imagen HD) en segundos, sin conocimientos de diseño ni copywriting.

### Flujo completo del sistema

```
IPC Manager → IPC Form (5 pasos) → Copy Generator Flow → API generate-batch (Gemini) → API generate-image (Gemini Imagen) → Marketing History (Galería)
```

### Tabs de la página

| Tab | Componente | Función |
|-----|-----------|---------|
| Crear Anuncio | `CopyGeneratorFlow` | Multi-generador IA: 3 variantes (copy + imagen) con un clic |
| Clientes Ideales (IPC) | `IpcManager` | CRUD de perfiles de cliente ideal |
| Historial / Galería | `MarketingHistory` | Galería de todo el contenido generado |
| Guía Mágica | `AdGuide` | Guía de Meta Ads 2026 integrada |
| Configuración IA | `MarketingAiSettings` | Identidad visual de la agencia para las imágenes |

---

### 📋 IPC Manager (`ipc-manager.tsx`)

Panel de gestión de perfiles IPC (Ideal Client Profile). Funcionalidades:
- Grid de cards con todos los IPCs del usuario (cargados de `ipc_profiles`)
- Búsqueda por nombre y tipo en tiempo real
- Filtros: Todos · Captación (barra ámbar) · Comercialización (barra verde)
- Cada card muestra: nombre, objetivo, formato preferido, tipo de lead, zona geográfica
- Acciones por card: **Editar** (abre IpcForm) · **Eliminar** (confirmación destructiva) · **Ver detalles**
- Estado vacío educativo con CTA para crear primer IPC

---

### 📋 IPC Form (`ipc-form.tsx`) — El núcleo del sistema

**Pantalla inicial:** El usuario elige entre dos workflows completamente distintos:
- 🏠 **IPC para CAPTAR** → Atraer propietarios que quieren vender
- 🏷️ **IPC para VENDER** → Atraer compradores para una propiedad específica

#### FLOW A — CAPTAR PROPIETARIOS (5 pasos)

| Paso | Nombre | Campos principales |
|------|--------|--------------------|
| 1 | Objetivo | Nombre del perfil · Objetivo de captación (atraer/reactivar/referidos) · Zona · Tipo de inmueble (multi) · Rango de precio |
| 2 | Perfil | Tipo de propietario · Motivo real de venta · Etapa actual (solo pensando / buscando tasación / ya publicado sin éxito) · Dependencia de la venta para comprar (Sí/No) |
| 3 | Psicología | Preocupaciones multi-select (quema de prop / cobrar menos / inseguridad en visitas / trámites / honorarios caros / demora) · Objeción principal vs inmobiliarias · Mayor freno hoy · Miedo más frecuente · Logro esperado |
| 4 | Estrategia | Prioridad (velocidad / precio máx / seguridad / tranquilidad) · Tipo de inmobiliaria en la que confía · **Ángulo de marketing (8 opciones)** · Tono de comunicación |
| 5 | Resumen | Nivel de conciencia (Eugene Schwartz, 5 niveles) · Resumen del IPC en una frase · Promesa central · CTA recomendado |

#### FLOW B — VENDER PROPIEDAD (5 pasos)

| Paso | Nombre | Campos principales |
|------|--------|--------------------|
| 1 | Propiedad | **Integración Tokko Broker** — busca propiedades reales de la cartera. Auto-popula nombre, zona, tipo, precio. También permite configuración manual. |
| 2 | Comprador | Tipo de comprador ideal (primer vivienda / inversor renta / upgrade / familia / downsize) · Situación de vida · Necesidad concreta · Problema que resuelve el inmueble |
| 3 | Atractivos | Multi-select: Luminosidad · Vista abierta · Balcón/Terraza · Bajas expensas · Cerca del subte · Cochera · Silencioso · Oportunidad de precio · Objeción común de compradores |
| 4 | Estrategia | **8 ángulos de copy** · Tono · Promesa central · **"¿Qué NO mostrar/mencionar?"** (exclusión estratégica) |
| 5 | Resumen | Nivel de conciencia (Eugene Schwartz) · Resumen comprador · Mensaje central · CTA |

#### Los 8 Ángulos de Marketing disponibles

1. Necesidad/Problema (PAS)
2. Emoción/Deseo (Transformación)
3. Exclusividad/Estatus (Aspiracional)
4. Comparación/Competencia (Autoridad)
5. Autoridad/Prueba Social (Social Proof)
6. Dolor/Miedo (Agitación)
7. Inmediatez/Escasez (Urgencia)
8. Beneficio Lógico/Pragmático (Datos)

#### Niveles de Conciencia (Eugene Schwartz) — 5 niveles
- **1. Inconsciente**: No sabe que tiene un problema
- **2. Consciente del Problema**: Siente la necesidad pero no sabe por dónde empezar
- **3. Consciente de la Solución**: Busca inmobiliarias o ayuda
- **4. Consciente del Producto**: Te conoce y te evalúa vs. competencia
- **5. Muy Consciente**: Listo para contratar. Solo necesita el empujón final

---

### 📋 Copy Generator Flow (`copy-generator-flow.tsx`) — El Multi-Generador IA

**Un solo botón genera 3 variantes completas (copy + imagen) automáticamente.**

#### Campos de configuración del usuario

1. **Selección de IPC** — dropdown con todos sus perfiles (🏠 captar / 🏷️ vender)
2. **Tipo de Copy**: Video/Reel (guión estructurado) o Post/Texto (estructura directa)
3. **Contexto extra** — textarea opcional para urgencias, descuentos, novedades
4. **Formato de imagen**: Reels 9:16 · Post 1:1 · Historia 9:16
5. **Estilo visual**: Moderno · Lujoso · Cálido · Corporativo · Vibrante

#### Flujo de generación (un solo botón, consumo: 1 crédito IA)

1. `POST /api/marketing-ia/generate-batch` → Gemini genera 3 variantes JSON con ángulos distintos (PAS / Transformación / Autoridad o Datos)
2. Inserta 3 drafts en `copy_drafts` con mismo `session_id`
3. Para cada draft: `POST /api/marketing-ia/generate-image` (en serie, con fault tolerance — si una falla, continúa con las demás)
4. Dispara evento `generation-complete` → auto-navega a la galería
5. Dispara evento `prisma-refresh-credits` → actualiza badge de créditos en tiempo real
6. Progreso visible: "Generando copys..." → "Se está generando la imagen..." → "¡Todo listo!"

**Formato del copy generado:**
- **Video/Reel**: `{ hook, problema, agitacion, solucion, cta }`
- **Post/Texto**: `{ hook, desarrollo, cta }`

---

### 📋 Property Selector (`property-selector.tsx`)

Integración directa con Tokko Broker para buscar propiedades reales de la cartera.
- Búsqueda por dirección, barrio o referencia
- Filtros: Tipo (Todos/Departamento/Casa/PH) · Operación (Venta/Alquiler)
- Vista de cada propiedad: foto thumbnail · título · dirección+zona · superficie m² · ambientes · baños · precio con moneda
- Al seleccionar: auto-popula todos los campos del IPC
- Botón "Saltar este paso" disponible

---

### 📋 Marketing History / Galería (`marketing-history.tsx`)

Galería de todos los creativos generados, agrupados por sesión.

**Vista principal (cards de sesión):**
- Thumbnails de las 3 variantes (carrusel deslizable)
- Badge "N VARIANTES" por sesión
- Fecha y hora en español
- Hook del copy como título
- Badges de ángulos por variante

**Dialog fullscreen al inspeccionar (click "Ver variantes"):**
- Tabs por variante: "Variante 1: PAS · Variante 2: Transformación · Variante 3: Autoridad"
- Imagen HD (500px height desktop) con overlay "Descargar HD"
- Panel de copy estructurado con labels: HOOK / PROBLEMA / AGITACIÓN / SOLUCIÓN / CTA (video) o HOOK / Desarrollo / CTA (post)
- Botón **"Copiar Todo"** — copia al portapapeles en un clic
- **Edición inline** — edita cualquier campo del copy, guarda en Supabase
- **Descargar HD** — PNG con nombre `prisma-v{n}-{id}.png`

**Eliminación granular:**
- Eliminar variante individual (borra copy_draft + imagen)
- Eliminar conjunto completo de sesión (con confirmación destructiva en rojo)

**Auto-reload:** escucha evento `generation-complete` → recarga y selecciona automáticamente el grupo recién generado.

---

### 📋 Ad Guide (`ad-guide.tsx`) — "Guía Maestra 2026"

**Título:** "Guía Maestra 2026 — Captación de Leads de Alta Calidad"

5 fases colapsables de educación sobre publicidad en Meta Ads para inmobiliarias:

| Fase | Color | Presupuesto | Contenido clave |
|------|-------|-------------|-----------------|
| 1 — Preparando el Terreno | Azul | **75% del budget** | Campaña "Clientes Potenciales" en Meta, segmentación MANUAL (no automática), ciudad + rango etario 30-65 años, 3-4 intereses (Inversiones inmobiliarias / Real Estate / Propiedades de lujo), activar "Segmentación Detallada Advantage" |
| 2 — El Anuncio / La Vidriera | Violeta | — | Videos Reels de recorrido o hablando a cámara, botón "Más información". ⚠️ NUNCA dejar que Meta elija la música automáticamente |
| 3 — El Formulario "Filtro de Oro" | Ámbar | — | Tipo "Mayor grado de intención" (deslizador de confirmación). **Para captaciones (vendedores):** zona · urgencia (< 3 meses / urgente) · ¿ya está tasada? **Para compradores/inversores:** presupuesto con rangos reales · ¿capital propio o financiación? · ¿para vivir o renta? + Lógica Condicional para descartar no calificados |
| 4 — Retargeting | Verde | **25% del budget** | Re-engagement de quienes vieron el video pero no completaron el form. Hablar como aliados, no como vendedores |
| 5 — Medición y Seguimiento | Rosa | — | **3 Reglas de Oro:** 🔥 Un lead inmobiliario se enfría en **5 minutos** · 📊 Mirar Costo por Lead **Calificado** (no total) · 🧹 Si entran muchos números falsos, agregar una pregunta más |

**Consejo final integrado:** "No busques volumen. Buscá calidad. Es preferible cerrar con 5 personas calificadas por día que tener 50 que no saben por qué dejaron sus datos."

---

### 📋 Marketing AI Settings (`marketing-ai-settings.tsx`)

Configura la **identidad visual de la agencia** aplicada a TODAS las imágenes generadas.

| Configuración | Detalle |
|---------------|---------|
| Colores de Marca | Hasta 3 colores (color picker + input hex), con vista previa |
| Logo de la Empresa | Upload PNG transparente (mín 500×500px recomendado). Almacenado en bucket `marketing-images` |
| Posición del Logo | 4 opciones: Arriba Izq · Arriba Der · Abajo Izq · Abajo Der |
| Tamaño del Logo | Chico (Sutil) / Mediano (Estándar) / Grande (Prominente) — con preview animado |
| Tipografía de Marca | Moderna/Sans · Elegante/Serif · Manuscrita/Script · Impacto/Bold |

> ⚠️ **Solo directores pueden modificar la configuración de marca.** Validado en cliente y en API (`role === 'director'`). Se guarda en `agencies.marketing_ai_config` (JSONB).

---

### 🤖 APIs de Inteligencia Artificial

#### `POST /api/marketing-ia/generate-batch`
- **Modelo**: Gemini 2.0 Flash (`prismaIA`)
- **Costo real**: $0.10/M tokens input + $0.40/M tokens output
- **Consume**: 1 crédito IA por llamada
- **Genera**: 3 variantes con ángulos narrativos distintos (PAS / Transformación / Autoridad)
- **Inyecta datos reales de Tokko** si el IPC es tipo "vender" y tiene propiedad asociada (dirección, precio, m², ambientes, baños, descripción)
- **Idioma**: 100% rioplatense (voseo) — especificado en el prompt del sistema

#### `POST /api/marketing-ia/generate-image`
- **Modelo**: Gemini Imagen (llamado internamente "Nano Banana Pro 2") — calidad `pro`
- **Costo estimado**: ~$0.06 USD por imagen
- **Consume**: 2 créditos IA por imagen
- **Incluye branding completo**: colores, logo (enviado como imagen multi-part), tipografía, posición del logo
- **Resolución**: 1080×1920 px (Reels/Historia) · 1080×1080 px (Post)
- **Pipeline post-generación**: sube a Supabase Storage (`marketing-images/{userId}/{draft_id}/{timestamp}.jpg`) → inserta en `generated_images` → retorna URL pública

#### `GET/POST /api/marketing-ia/settings`
- Lectura y escritura de `agencies.marketing_ai_config`
- Escritura solo para `role === 'director'`

#### `POST /api/marketing-ia/settings/upload-logo`
- Upload de logo al bucket `marketing-images` vía `adminClient`
- Ruta: `{userId}/branding/logo_{timestamp}.{ext}`
- URL pública guardada en `agencies.logo_url`

---

### 🗄️ Tablas de Base de Datos — Módulo Marketing IA

| Tabla | Propósito |
|-------|-----------|
| `ipc_profiles` | Perfiles de cliente ideal. Cols: `id · user_id · nombre_perfil · tipo_ipc · objetivo · tipo_inmueble[] · zona_principal · rango_valor_precio · propiedad_tokko_id · flow_data (JSONB) · created_at · updated_at` |
| `copy_drafts` | Borradores de copy generados. Cols: `id · user_id · ipc_id · copy_type · angle · consciousness_level · extra_context · content (JSONB) · session_id · created_at` |
| `generated_images` | Imágenes generadas por IA. Cols: `id · user_id · draft_id · format · style · storage_path · public_url · width · height · extra_prompt · created_at` |

---

### 📊 Métricas y números clave del módulo

| Dato | Valor |
|------|-------|
| Variantes generadas por sesión | **3 siempre** |
| Créditos por generación de texto (batch) | **1 crédito IA** |
| Créditos por imagen | **2 créditos IA** |
| Formatos de imagen disponibles | Reels 9:16 · Post 1:1 · Historia 9:16 |
| Resolución Reels/Historia | **1080×1920 px** |
| Resolución Post | **1080×1080 px** |
| Ángulos de marketing disponibles | **8 ángulos** |
| Niveles de conciencia (Eugene Schwartz) | **5 niveles** (0 a 4) |
| Colores de marca máximos | **3 colores** |
| Tiempo de enfriamiento de un lead (Ad Guide) | **5 minutos** |
| Distribución de presupuesto ads sugerida | **75% tráfico frío / 25% retargeting** |
| Segmentación etaria sugerida | **30 a 65 años** |
| Ejemplo de ROI citado en Ad Guide | Lead a $5 USD → 2 de 10 son tasaciones de **$200.000 USD** |

---

### 🔑 Detalles técnicos importantes

- **Fault tolerance en imágenes**: Si una imagen falla durante el batch, el loop continúa con las otras 2 variantes. El proceso nunca falla completo por una imagen.
- **Integración Tokko multitenancy**: Cada agencia usa su propia `tokko_api_key` almacenada en `agencies`.
- **Logo como imagen de referencia multimodal**: El logo de la agencia se descarga en el servidor y se envía como `imagePart` multimodal al modelo Gemini para que lo integre exactamente en la imagen generada.
- **Cost tracking real**: Cada llamada a la IA registra `input_tokens`, `output_tokens` y costo USD real (fire-and-forget vía `updateAiTransactionCost()`).
- **Comunicación entre tabs via eventos**: `generation-complete` y `prisma-refresh-credits` — `window.dispatchEvent()`.
- **Seguridad**: Settings de marca solo modificables por `role === 'director'`, validado tanto en cliente como en API route.



### 2026-05-28 | v1.0.4 — Auditoría cliente real + Bug fixes + Logo upload

#### 🔍 Auditoría: MaxRE Inmobiliaria (primer cliente real)
- Analizado en profundidad el estado de la cuenta del cliente Kevin Arlandi (`kevinarlandi@maxre.com.ar`).
- **Profile ID**: `bfa01079-06f9-4d8d-ae8b-b41ed441b392` | **Agency ID**: `4962bf85-a92c-4c33-ba07-380686bbab76`
- Estado verificado: perfil director activo, agencia activa, API Key de Tokko presente, créditos distribuidos (5,000: 1k director + 4k asesores), pago USD 1,500 registrado en mayo.
- Panel Admin Vakdor operativo: control de créditos, pagos, tokko stats y log de auditoría funcionando correctamente.
- Pendientes del cliente: ejecutar primera sincronización Tokko, invitar asesores (código `589C15`), completar logo/dirección.

#### 🐛 Bug Fix: columna `last_sync_at` faltante en `agencies`
- **Problema**: el endpoint `POST /api/tokko/sync` actualizaba `agencies.last_sync_at` al finalizar la sync, pero esa columna no existía en la tabla → error silencioso, el timestamp nunca se guardaba.
- **Solución**: migración aplicada directamente en Supabase:
  ```sql
  ALTER TABLE agencies ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ NULL;
  ```
- La columna ahora aparece correctamente documentada en el esquema de `agencies`.
- **Nota**: la entrada de la Fase 4 (2026-03-21) mencionaba `last_sync_at` como creada, pero en realidad no existía. Corregido el registro histórico.

#### ✨ Feature: Upload real de logo en Configuración de Agencia
- **Problema**: la sección "Logo de Agencia" en `/director/configuracion` (tab Inmobiliaria) era un div decorativo sin funcionalidad real. El campo `agencies.logo_url` siempre quedaba `null`.
- **Solución** (2 archivos modificados):
  - `app/director/configuracion/page.tsx`: agregado `useRef` para input file oculto, estado `isUploadingLogo`, función `handleLogoUpload` que llama al endpoint existente `/api/marketing-ia/settings/upload-logo`. UI con 2 modos: prompt de upload (sin logo) y preview con botones "Cambiar" / "Quitar logo". `handleSaveAgency` ahora incluye `logo_url`.
  - `app/actions/agency.ts`: `updateAgencyAction` acepta `logo_url?: string` → se persiste en `agencies.logo_url` vía Supabase admin client.
- El endpoint de upload ya existía y funcionaba; solo estaba desconectado de esta página.
- Validaciones: tamaño máx 2MB, solo tipos `image/*`.

### 2026-05-27 | P10 — WhatsApp: Bug Fixes (Disconnect, Templates & UX)
- **Desconexión Segura**:
  - Modificada la función `removeInstance` para evitar violaciones de clave foránea (`foreign key constraint`) con el historial de `wa_conversations`.
  - Al desconectar un número, el sistema ahora actualiza el estado a `disconnected` conservando la instancia, lo que permite que al re-conectar se herede todo el historial de chats sin interrupciones.
- **Flujo Visual (SetupWizard)**:
  - Condicionada la vista del Director para forzar el paso por el `SetupWizard` cuando la instancia actual está en estado `disconnected`, ocultando temporalmente la bandeja de entrada.
  - Agregado scroll interno (`overflow-y-auto`) al contenedor del Wizard para resolver un bug donde el footer (con los botones de Siguiente) quedaba oculto en pantallas pequeñas.
- **Plantillas y Webhooks**:
  - Corregido el rechazo de Meta para las plantillas *Seguimiento F1* y *Seguimiento F2* (se agregó texto de cierre para cumplir con las políticas anti-spam que prohíben finalizar con variables `{{2}}`).
  - Corrección crítica en las instrucciones del Webhook: Se reemplazó el texto ilusorio "Webhook automatizado" por advertencias y componentes visuales para que el usuario configure la URL y el Token manualmente, resolviendo la imposibilidad técnica de hacerlo vía API sin pedir el App Secret.

### 2026-05-14 | UI/UX — Mobile WhatsApp Rendering Failure (Resolved)
- **WhatsApp IA — Diagnóstico de Pantalla Blanca en Móvil**:
  - **Identificación del Bloqueo**: Se aisló el error mediante pruebas de exclusión, confirmando que las suscripciones **Supabase Realtime (WebSockets)** provocaban un cuelgue silencioso del renderizado en navegadores móviles (Safari/iOS).
  - **Fix de Resiliencia Realtime**: 
    - Implementada validación de soporte nativo: `typeof window !== 'undefined' && 'WebSocket' in window`.
    - Envoltorio de seguridad `try/catch` en la inicialización de canales para prevenir que fallos de red o de socket bloqueen el hilo principal de ejecución.
    - Garantizado el fallback a **Polling (setInterval)**: El sistema sigue cargando y actualizando datos cada 5 segundos incluso si el Realtime no puede inicializarse.
  - **Extensión a Interfaz de Chat (Confirmado)**: Se aplicó el mismo blindaje en `ActiveChat.tsx`, eliminando definitivamente la pantalla blanca que ocurría al abrir historiales de mensajes en móviles.
  - **Estabilización de Layout**: Reemplazado `ScrollArea` (Radix) por scroll nativo y ajustadas alturas flexibles (`flex-1 min-h-0`) para prevenir colapsos de contenedor en dispositivos móviles.
  - **Restauración de Funcionalidad**: El sistema mantiene todas las características avanzadas (Joins de asesores, Tabs, Selects) operativas en escritorio y estables en móvil.

### 2026-05-14 | UI/UX — Mobile Stabilization & Ultra-Defensive Hardening (Final)
- **WhatsApp IA — Estabilización Crítica iPhone/Safari**:
  - **Hardening de Fechas**: Implementado `try/catch` y validación `isNaN` en todos los componentes de WhatsApp (`ActiveChat`, `ConversationsList`, `LeadTraceability`) para evitar crashes por fechas malformadas o falta de locale en móviles.
  - **Seguridad en UUIDs**: Reemplazado `crypto.randomUUID()` por `safeUUID()` con fallback matemático para contextos no seguros o navegadores antiguos.
  - **Viewport Resilience**: Añadido fallback de `100vh` junto a `100dvh` en `ChatInterface` para garantizar que el layout no colapse en versiones de iOS con barras dinámicas.
  - **Hydration Guards**: Reforzado el patrón de `mounted` state y añadido `try/catch` en suscripciones a eventos globales en `WhatsAppTabsWrapper`.
  - **Global Error Containment**: Implementado `ErrorBoundary` a nivel de módulo (`WhatsAppTabsWrapper`) y sub-módulo (`ChatInterface`) para interceptar excepciones en tiempo de ejecución y permitir recuperación sin recarga total.
- **ConversationsList**: Optimizado el ordenamiento de conversaciones para manejar tiempos nulos o inválidos sin interrumpir el renderizado.
- **LeadTraceability**: Protegidos los cálculos de latencia y antigüedad para devolver valores seguros (0) en caso de datos de mensaje corruptos.
- **Sincronización**: Cambios commiteados y pusheados a la rama principal de GitHub.


### 2026-05-14 | UI/UX — Soporte Mobile & Tablet Completo (Análisis Inicial)
- **Responsividad Global**: 
  - Se inyectaron reglas CSS responsivas en `app/globals.css` a través de bloques `@media (max-width: 1024px)` y `(max-width: 767px)`.
  - Enfoque aditivo: Cero refactorización de código TSX para preservar la integridad funcional de los componentes actuales.
- **Solución a Problemas de Interfaz**:
  - **iOS Auto-zoom**: Inputs, selects y textareas forzados a `font-size: 16px !important` para impedir el zoom automático en Safari/iOS.
  - **Viewport en Móviles**: Utilización de `100dvh` sobre los `100vh` existentes (ej. `h-[calc(100vh-64px)]`) para prevenir ocultamiento por barras de navegación dinámicas.
  - **Scroll Horizontal Nativo**:
    - **Tracking Performance**: Implementado scroll suave en las solapas de filtro (Todos, Prospección, etc.) mediante la clase `.tracking-tabs-list`.
    - **Ranking de Asesores**: La tabla de líderes ahora posee scroll horizontal interno contenido mediante `.performance-leaderboard-container`, evitando desbordes del viewport.
    - **Configuración**: Las solapas de configuración ahora permiten scroll lateral táctil.
  - **Dashboard Polish**:
    - Ajustado el botón "Limpiar filtros" para prevenir el desborde del texto en pantallas pequeñas.
    - Los gráficos de Recharts ahora se ajustan al 100% del ancho del contenedor sin romper el layout.
  - **Marketing IA**:
    - Optimizado el tamaño de fuente y padding del botón "Generar 3 variantes" para legibilidad en mobile.
    - Las tarjetas de historial (galería) ahora respetan el ancho máximo del viewport (`100vw`).
  - **WhatsApp IA**:
    - Corregido error de altura en móviles ajustando el contenedor principal a `calc(100dvh - 64px)`.
    - Ajustada la altura de la lista de conversaciones para asegurar que el input de chat sea accesible.
- **Identificadores de Control**: Se añadieron IDs únicos (`#dashboard-content`, `#tracking-performance-page`, `#marketing-ia-page`, `#whatsapp-ia-page`) a los contenedores principales para permitir personalización CSS granular sin afectar la lógica de React.
### 2026-05-12 | P9 — Database Security: RLS Audit & Granular Isolation
- **Security Audit**:
  - Identificación de 3 tablas con RLS habilitado pero sin políticas activas (`lead_activities`, `visits`, `valuations`), lo que bloqueaba el acceso legítimo desde la App.
  - Detección de política insegura en `n8n_chat_histories` que permitía visibilidad global a cualquier usuario autenticado.
- **RLS Implementation**:
  - **Aislamiento Multi-tenant**: Creación de políticas basadas en `agency_id` (vía `get_my_agency_id()`) para `valuations`, `lead_activities` y `visits`.
  - **Jerarquía de Roles**: Los Directores mantienen acceso total a la agencia; los Asesores están restringidos a sus propios registros o leads asignados.
  - **Chat Privacy**: Refactorización de `n8n_chat_histories` para filtrar mensajes por `session_id` vinculado a conversaciones de la agencia del usuario.
- **Mantenibilidad**:
  - Creación de migración SQL (`20260512123000_secure_rls_and_chat_histories.sql`) para sincronización del repositorio.
  - Verificación técnica del cast `UUID::text` para compatibilidad de joins en políticas de historial.

### 2026-04-27 | P8 — WhatsApp: RLS Security & Webhook Reliability
- **RLS Modernization**:
  - Reemplazo de políticas basadas en subqueries por el patrón `EXISTS` en `wa_conversations`, `wa_messages` y `wa_contacts` para máxima fiabilidad.
  - Resolución del problema de "Bandeja Vacía" para Directores: Acceso explícito a toda la agencia garantizado.
  - Actualización de `whatsapp_instances`: Permite lectura a todos los miembros de la agencia, estabilizando la navegación en "Modo Asesor".
- **Webhook Reliability**:
  - Refactorización de handlers `evolution` y `meta` para utilizar **`await fetch`** en llamadas a n8n.
  - Eliminación del efecto "buffering" (mensajes que solo llegaban al enviar un segundo mensaje) causado por la suspensión de procesos en Vercel.
  - Implementación de `Promise.all` en el loop de Meta para procesar batches de mensajes con persistencia garantizada.

### 2026-04-07 | P7 — WhatsApp Module: Webhook UI Polish & UX
- **Refactor `SetupWizard.tsx`**:
  - Mejora de los pasos 5 y 6 con instrucciones simplificadas para usuarios no técnicos.
  - Implementación de `CopyButton`: Facilidad para copiar URL de Callback y Verify Token al portapapeles.
  - Exposición controlada de variables `NEXT_PUBLIC_` para mostrar valores reales dinámicamente.
- **Configuración**:
  - Actualización de `.env` y `.env.example` con los nuevos prefijos públicos.
  - Verificación de la URL del webhook de Evolution (`/webhook/whatsapp`) para conectividad directa de Meta.

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
- **Esquema DB**: Tabla `properties` vinculada. ⚠️ Nota: el código referenciaba `last_sync_at` en `agencies` pero la columna nunca fue creada en este punto — fue corregida el 2026-05-28.
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
