# Módulo Marketing — HANDOFF (estado actual + qué falta)

> Para retomar en otra sesión. Módulo = `/admin-vakdor/marketing` (sala de control del "Agente IA de Marketing"). Specs: `docs/superpowers/specs/2026-07-15-marketing-pipeline-design.md` y `2026-07-16-marketing-motor-local-design.md`. Receta del motor: `docs/interno/motor-marketing-local.md`.

## ✅ HECHO y EN PRODUCCIÓN (mergeado a `main`, deployado en Vercel; env vars ya cargadas por Leo)
- **Tablero kanban** (6 columnas idea→en_proceso→en_revision→aprobada→publicada / rechazada): mover (drag+botones), alta manual, **reformular** con IA, ver/descargar assets. Tabla `marketing_ideas` (Supabase PRISMA, RLS sin políticas) + bucket privado `marketing-assets`.
- **Desarrollar contenido** al pasar a "En proceso" (botón in-app, Claude) + **visor** "Ver contenido" (texto + **preview de imagen de marca** + links a PDF).
- **Calendario** (toggle Tablero/Calendario, grilla mensual, filtros fuente/formato/ángulo, botón 📅 Programar fecha).
- **Publicar blog** (botón) → escribe en `blog_posts` de **vakdor-app** (`PROJECT_URL` + `SERVICE_ROLE_SECRET`), con `featured_image_url` = portada pública. Bucket público `blog-images` en vakdor-app (creado).
- **Publicar LinkedIn** (botón) → Buffer `createPost` (verificado en borrador contra la API real). Postea texto + imagen; **el primer comentario NO va por API (requiere plan pago Buffer)** → el botón te lo muestra para pegar a mano.
- **Cron auto-publicar** (endpoint `publicar-programadas` + workflow `.github/workflows/marketing-publish.yml` cada 30 min) — un solo cron saca todas las programadas vencidas. **✅ ACTIVO y corriendo** (secrets `SITE_DOMAIN`+`CRON_SECRET` ya en el repo; verificado 18-jul: 2 corridas OK, respuesta `{"revisadas":0,"publicadas":0,"errores":[]}`).
- **Motor de ideas (Disparo 1)** probado a mano: 5 ideas reales fundamentadas (GA + Search Console + memoria + copywriter) insertadas.

## ✅ El WORKER (el "automático" que quería Leo) — HECHO y verificado
- Carpeta: **`Prisma - MK/marketing-worker/`**. Ahora **modular**: `watch.mjs` (orquestador) + `content.mjs` (prompts Claude) + `render.mjs` (portada/slides + carousel.pdf) + `vakdor-pdf.mjs` (markdown→PDF on-brand) + `iniciar-worker.bat` + `README.md`. Deps en Prisma-MK: playwright + @anthropic-ai/sdk + @supabase/supabase-js + pdfkit + **marked** (nueva). Lee las claves del `.env` de PRISMA-SYSTEM.
- **Qué hace:** observa "En proceso" cada 20s → por cada idea: desarrolla contenido (Claude + copywriter + `memoria.md`) si falta + genera **assets de marca según el `formato`** (ver abajo) → sube a `blog-images` (público, cada asset con `url`) → setea contenido/`featured_image_url`/`assets` → pasa a "En revisión".
- **Assets por formato:** `carrusel` → N slides 1080×1080 (portada+cuerpo+CTA final) + `carousel.pdf`; `lead_magnet` → `magnet.pdf` on-brand (scorecard con tabla+casillas, vía Vakdor-PDF) + portada; **resto** → portada única (blog 1200×630 / LinkedIn 1080×1080).
- **Cómo se corre:** doble clic a `iniciar-worker.bat` (o `node watch.mjs`). Para Leo = automático (mueve tarjeta → worker la procesa).
- **Fix logos (18-jul):** los logos ahora se embeben como **data-URI base64**, no `file://`. Las rutas `file://` con espacios ("Antigravity - Apps"/"Prisma - MK") no cargaban → portadas salían **sin logos**. El data-URI además corre en EasyPanel (sin rutas absolutas de Windows).
- **Verificado (18-jul-2026):** corrida en vivo end-to-end OK — se crearon ideas reales `carrusel`/`lead_magnet`, el worker generó y subió los assets (9 y 2), quedaron en `en_revision` con URLs públicas 200. Render on-brand + prompts (JSON válido) verificados.

## ✅ HECHO en la sesión del 18-jul (mergeado a `main`)
- **Carruseles multi-slide + lead-magnets (PDF)** — el worker genera, por `formato`: `carrusel` = N slides + `carousel.pdf`; `lead_magnet` = `magnet.pdf` (Vakdor-PDF) + portada. Se suben como `assets` con `url` público → el visor los previsualiza.
- **Imagen en LinkedIn (cron):** `resolverImagenLinkedIn()` en `buffer-client.ts`; el cron `publicar-programadas` cae a `assets[].url` público igual que el route manual. `url?` en `AssetRef`.
- **Botón de descarga del visor:** abre `a.url` directo si existe.
- **Fix logos (data-URI)** en el worker (ver sección WORKER).

## ✅ Carrusel a LinkedIn como DOCUMENTO (rama `feat/linkedin-carrusel-documento`)
- **Verificado contra la API real de Buffer:** un carrusel de LinkedIn es un **document post** (PDF deslizable). `AssetInput.document{url,title,thumbnailUrl}` — todo URL pública. Draft real creado con `DocumentAsset` (mimeType `application/pdf`) desde el `carousel.pdf` + slide-01 del worker → `PostActionSuccess`. (La otra idea —subir slice por slice y que Buffer arme el PDF— NO aplica: Buffer espera el PDF ya hecho, que el worker ya genera.)
- **Implementado:** helper `resolverDocumentoLinkedIn(titulo, assets)` (elige `carousel.pdf` + primera slide png); `publicarLinkedIn` acepta `document`; el route manual `[id]/publicar` y el cron `publicar-programadas` publican **document post si es `carrusel`**, imagen si no. **Publicar ya (botón) y programar (fecha + cron) funcionan para carruseles.** E2E probado con un carrusel real del worker (draft OK, luego borrado).

## ⏭️ QUÉ FALTA (próximos pasos)
1. **Deploy del worker a EasyPanel** (always-on, sin depender de la PC de Leo) — **igual que el acm-extractor**: Dockerfile con base `mcr.microsoft.com/playwright`, instalar las deps (playwright/@anthropic-ai/sdk/@supabase/supabase-js/pdfkit/marked), env vars como secrets, `CMD ["node","watch.mjs"]`. El worker ya es host-agnóstico (logos data-URI, sin rutas absolutas en el render).
2. **Primer comentario LinkedIn automático:** requiere plan pago de Buffer. Decisión de Leo (por ahora se pega a mano).
3. **(Opcional) lead-magnet como document post** de LinkedIn: hoy va como texto+imagen (portada); se podría publicar el `magnet.pdf` como documento igual que el carrusel si conviene.

## Datos clave verificados (para no re-investigar)
- **Modelo Claude:** `claude-opus-4-8` (sin temperature, sin streaming, max_tokens 4000).
- **Blog vakdor-app:** `PROJECT_URL` (=https://upggigryxdvcmnuwafyl.supabase.co) + `SERVICE_ROLE_SECRET`. Bucket público `blog-images`. URL pública: `{PROJECT_URL}/storage/v1/object/public/blog-images/<path>`.
- **Buffer LinkedIn:** POST `https://api.buffer.com/graphql`, `Authorization: Bearer BUFFER_API_KEY`. Mutación `createPost(input: CreatePostInput!)` → union `PostActionPayload` (`PostActionSuccess{post{id,status}}` / errores con `message`). Input: `channelId` (LinkedIn personal = `6a4aca1140483446287320b8`), `text`, `schedulingType:"automatic"`, `mode:"shareNow"` (ahora) / `"customScheduled"`+`dueAt` (programar), `assets:[{image:{url}}]`, `saveToDraft` (true=probar sin publicar), `metadata:{linkedin:{firstComment}}` (SOLO plan pago). `deletePost(input:{id})` para borrar.
- **Rama/deploy:** todo en `main` (mergeado desde `feat/marketing-pipeline`; main había avanzado con tracking/marketing-ia de otra sesión, merge fue limpio sin conflictos). Build OK. Repo privado `osterrietchleonardo-rgb/prisma-system`.

## Arquitectura (regla dura, para no volver a discutirla)
Todo lo que usa **skills reales o Playwright** (ideas, contenido fiel, imágenes de marca) corre **LOCAL** (worker) o en **EasyPanel** — NUNCA en Vercel. La app (Vercel) hace: tablero, develop rápido in-app (texto), publicar, calendario, cron. El worker/EasyPanel hace: contenido fiel + imágenes de marca.
