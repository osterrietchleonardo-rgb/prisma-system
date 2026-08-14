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

## ✅ Preview real en el visor + reformular con visuales (rama `feat/marketing-preview-y-reformular-visuales`)
- **Visor "Ver contenido"** (`PreviewPieza`): carrusel = **galería slide por slide** (◀▶ + puntos) + **Descargar PDF**; lead_magnet = **PDF embebido** + descargar; resto = portada. El `contenido` se etiqueta **"Descripción del posteo"**. Descarga forzada con `?download=` de Supabase Storage.
- **Descripción con hook + storytelling:** los prompts del worker (`content.mjs`) desarrollan `contenido` como un posteo con gancho + storytelling (no un pie de foto), para carrusel y lead_magnet.
- **Reformular con visuales:** check "También regenerar imágenes/PDF" (carrusel/lead_magnet). Marcado → `regenerarVisuales(id, comentario)` limpia contenido+assets, → `en_proceso`, y el worker rehace **descripción + slides/PDF** alineados al comentario (`ajusteIdea`). Sin marcar → solo texto (para estas piezas, el texto es la descripción del posteo).
- **Verificado (18-jul) en dev real** (login admin + Playwright): galería carrusel navegable (slide 3/8), lead_magnet PDF embebido, checkbox visible; flujo reformular+regenerar end-to-end (carrusel real → en_proceso → worker rehace descripción limpia + 8 slides + pdf → en_revision).

## ✅ Artículo de blog → CROSS-POST web + LinkedIn (rama `feat/blog-crosspost-linkedin`)
- Publicar un `articulo_blog` (`fuente=blog`) ahora hace **las dos**: web (`blog_posts` + portada) **y** LinkedIn (post teaser standalone + misma portada, **sin links** ni mención del artículo — el link vive en el perfil). Helper `publicarArticuloBlog` en `publisher.ts`, usado por el botón y el cron.
- El **worker** genera la versión LinkedIn del artículo (`blog.linkedin_post` / `linkedin_primer_comentario` / `linkedin_hashtags`); el visor la muestra ("Versión LinkedIn") para revisarla.
- **Fix de 2 bugs** del botón manual de blog: no mandaba la portada (web salía sin imagen) y exigía `category` que el worker no setea (daba 400). Ahora pasa portada + defaultea category.
- **Verificado (18-jul):** worker desarrolla artículo + portada + versión LinkedIn (sin links, confirmado por query); crosspost a LinkedIn = post con la portada como imagen (Buffer draft OK). Web = vía ya probada por el cron.

## ✅ Embudo TOFU/MOFU/BOFU + estructura copywriter + desarrollo solo-worker (main)
- **Desarrollo solo por el worker:** mover a "En proceso" ya NO dispara el desarrollo in-app (texto sin imágenes, que volcaba las slides como texto y no generaba imagen en blog). Desarrolla el worker (estructura + imágenes de marca). Se quitó ese botón.
- **Estructura vakdor-copywriter:** las descripciones de LinkedIn (post, carrusel, versión LinkedIn del blog) siguen la estructura de `platform_structures.md` (hook→fricción→quiebre→solución→prueba→CTA, 1500-2500 car).
- **Embudo:** columna `funnel` (`tofu|mofu|bofu`) + badge de color en la tarjeta/visor + selector en Nueva idea + filtro en calendario + el motor balancea las 3 etapas. El worker adapta el contenido a la etapa (`instruccionCta`): TOFU no vende, MOFU muestra el mecanismo, BOFU manda a **ver el video de la demostración** (`vakdor.com/demostracion`, y el link va **solo en el primer comentario**). Verificado (TOFU vs BOFU dan tono/CTA distintos).

## ✅ Skills reales + análisis diario (main)
- **Skills reales (`marketing-worker/skills.mjs`):** el worker carga los `.md` reales de vakdor-copywriter (+ platform_structures/angles/hooks), vakdor-carousel y Vakdor-LeadMagnet (~85K car) y los sigue al pie. Van como bloque de system **cacheado** (`cache_control: ephemeral`) → se escribe 1 vez por ráfaga, las piezas siguientes leen barato (verificado: cache_write 42.764 la 1ª, cache_read después). `SKILLS_DIR` override para EasyPanel.
- **Análisis diario (`marketing-worker/insights.mjs` + tabla `marketing_insights`):** 1×/día trae los posts publicados de LinkedIn de Buffer (query `Posts` status `sent`, con text + engagement por post), arma el ranking (qué rinde más/menos) y lo cachea en Supabase. Se inyecta en los prompts del worker Y en el motor `generar`. Verificado con datos reales: 40 posts, top = "Tu equipo te interrumpe 15 veces al día…" (6.85%). Migración `20260718121000_marketing_insights.sql`.
- **Nota:** el análisis usa la API de Buffer directo (misma key `BUFFER_API_KEY`); cubre lo que pedías de "leer Buffer + métricas 1×/día". La skill vakdor-metricas es el equivalente interactivo (mismo dato).

## ✅ Motor de voz humana (rama `feat/marketing-voz-humana`, prueba end-to-end ago-2026)

Antes, todas las piezas salían con el mismo molde (hook → fricción → quiebre → solución → prueba → CTA), lo que se notaba como "todo escrito por la misma fórmula". Ahora cada pieza sortea su propia forma de un banco de recursos, y pasa por una revisión antes de quedar lista.

- **Cómo ampliar el banco de escenas (sin tocar código ni redeployar):** el banco vive en la tabla `marketing_recursos` de Supabase. Para agregar una escena nueva alcanza con un `insert` directo:
  ```sql
  insert into marketing_recursos (tipo, titulo, detalle)
  values ('escena', 'Título corto de la escena', 'La situación concreta desarrollada en 1-2 frases, con un detalle específico (hora/día/tipo de propiedad).');
  ```
  Entra a la rotación automáticamente en el próximo ciclo del worker — no hace falta reiniciar nada.

  **Qué se puede agregar solo con SQL y qué no** (importante, para no romper el generador):
  - **Escenas: libres.** Agregá todas las que quieras con el `insert` de arriba. Es la única fila que se lee entera desde la base (`titulo` + `detalle`), así que una escena nueva funciona sola.
  - **Editar el `canon`** (fila única `tipo='canon'`): libre también, se lee entero desde la base.
  - **Estructuras y tipos de comentario nuevos: TAMBIÉN son libres desde el 14-ago-2026.** Antes hacía falta tocar el código (el texto vivía en `voz.mjs`/`voz.ts` y el generador solo usaba la `clave`). Ya no: el texto se lee de la columna `detalle`, y la validación se hace contra las claves activas de la base en vez de contra una lista cerrada. Una estructura o un comentario que insertes por SQL entra en la corrida siguiente **sin desplegar nada**.
  - Para sacar una escena/estructura/comentario de circulación sin borrarla, poner `activo=false` en vez de borrar la fila (así no se pierde el historial de usos).
- **Qué significa cada campo de `receta`** (columna jsonb en `marketing_ideas`, se llena sola al procesar la idea):
  - `estructura`: la forma narrativa que usó esa pieza (una de las 9 del banco, ej. `confesion`, `contraste`, `framework_pasos`).
  - `proposito`: el para qué de la pieza (una de las 5 claves, ej. `ensenar`). Es lo que decidió qué estructuras podían sortearse.
  - `cluster`: el territorio de la pieza, copiado de la idea, para poder auditar el cruce completo.
  - `escenas`: los 2 ids de `marketing_recursos` (tipo `escena`) que sirvieron de apoyo.
  - `comentario_tipo`: el tipo del primer comentario (una de las 5 claves, ej. `pregunta_binaria`).
  - `modelo`: el modelo de IA que escribió la pieza (`claude-sonnet-5`).
  - `revision`: `{aprobado, reintentos, fallos, reescritura_descartada}` — si `aprobado=true` y `reintentos=0`, pasó la revisión a la primera; si `reintentos=1`, falló algún punto de la rúbrica (los motivos están en `fallos`) y se reescribió una vez antes de quedar lista. Si además `reescritura_descartada=true`, la reescritura volvió rota (vacía o cortada a la mitad) y se dejó el texto original: los `fallos` siguen ahí sin corregir, conviene mirar esa pieza a mano.
- **`ANTHROPIC_API_KEY` tiene que estar en 3 lugares** (si falta en cualquiera de los 3, esa parte del sistema no genera nada):
  1. **Local:** `.env` de PRISMA-SYSTEM (confirmado presente).
  2. **EasyPanel:** variables del servicio del worker de Marketing (pendiente de confirmar por Leo — no se puede chequear desde acá).
  3. **Vercel:** variables de entorno del proyecto — **confirmado por Leo el 14-ago-2026**. Sin esta variable en Vercel, los botones "Reformular" del panel fallan en producción (son los que corren in-app, no en el worker).
- **Prueba end-to-end (ago-2026):** se insertaron 3 ideas de prueba (una por etapa del embudo) y se corrió el worker hasta procesarlas. Las 3 terminaron con contenido, portada y `receta` completos: 3 estructuras distintas, 6 escenas distintas (sin repetir entre piezas), 3 tipos de primer comentario distintos, y el link `vakdor.com/demostracion` apareció únicamente en el comentario de la pieza BOFU (nunca en un cuerpo de post). Detalle completo (texto de las 3 piezas + verificación punto por punto) en `docs/superpowers/sdd/2026-08-10-marketing-voz-humana/task-12-report.md`.

## ✅ Arreglado (venía de la prueba end-to-end)
- **El "ranking de qué rinde más" ya se arma.** Al worker le faltaba pasar el cliente de IA en esa llamada y fallaba en silencio en cada ciclo. Corregido. Además, ahora el análisis se intenta **una sola vez por día**: si un día no hay datos suficientes o falla, no se vuelve a intentar hasta el día siguiente (antes lo reintentaba cada 20 segundos, y cada reintento era una llamada paga).
- **Ya no se cuelan las tres comillas (`"""`) en el texto.** Cuando una pieza necesitaba reescritura, el texto final podía quedar envuelto en `"""` y había que limpiarlo a mano. Corregido: el texto se limpia solo. Y si la reescritura vuelve vacía o cortada a la mitad, **se conserva el texto bueno anterior** en vez de pisarlo.

## ✅ Motor de cruces, territorios y SEO (rama `feat/marketing-motor-cruces-y-seo`, 14-ago-2026)

El problema que resolvió: las 30 escenas eran todas del mismo tipo (dolor operativo), las tres etapas del embudo tiraban de la misma bolsa, y no había ningún eje temático. Ahora cada pieza se arma cruzando **seis ejes**.

| Eje | Qué define | Cuántos |
|---|---|---|
| `cluster` | El territorio del que habla (sirve a blog y a LinkedIn) | 8 |
| `proposito` | Para qué se escribe | 5 |
| `estructura` | Cómo se narra | 9 |
| `escena` | La materia prima | 90 |
| `funnel` | A quién y en qué etapa | 3 |
| `comentario` | El primer comentario | 5 |

**La regla que no hay que romper:** el propósito **no** define la forma, solo restringe qué estructuras pueden sortearse. La instrucción de forma sale de un único lugar (`bloqueVoz` en `content.mjs`). Si dos bloques del prompt piden formas distintas, la pieza sale incoherente y se paga un reintento.

**Las escenas ahora tienen `area` y `momento`.** El momento se ata a la etapa: TOFU tira de `dolor`, MOFU de `intento_fallido`, BOFU de `resuelto`. De las 2 escenas de cada pieza, la primera respeta ese momento y la segunda es libre, para dar contraste. Ningún filtro bloquea: si no hay del momento pedido, salen dos igual.

### Cómo agregar cosas al banco (todo por SQL, sin desplegar)

```sql
-- Una escena. `area`: captacion_tasacion | ventas | alquileres_administracion | equipo | direccion | pauta_marketing
--             `momento`: dolor | intento_fallido | resuelto
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','Título corto','La situación concreta en 1-2 frases, con un detalle específico (hora/día/tipo de propiedad).','ventas','dolor');

-- Un territorio nuevo. `areas` sesga qué escenas le son afines.
insert into marketing_clusters (clave, titulo, descripcion, keyword_pilar, url_pilar, fractura, areas) values
('mi_cluster','Título','Descripción.','keyword principal','/mi-cluster/','hemorragia','{ventas,equipo}');

-- Una estructura nueva. `propositos` dice qué propósitos la habilitan.
insert into marketing_recursos (tipo, clave, titulo, detalle, propositos) values
('estructura','mi_forma','Nombre','Cómo se escribe esta forma, en detalle.','{convencer}');
```

**Regla al agregar estructuras:** ningún propósito puede quedarse sin al menos 2 estructuras compatibles, porque la rotación evita repetir la estructura de las piezas recientes y se trabaría. Se chequea así:

```sql
select p.clave, count(e.id) from marketing_recursos p
 left join marketing_recursos e on e.tipo='estructura' and e.activo and p.clave = any(e.propositos)
 where p.tipo='proposito' group by p.clave order by 2;
```

### Search Console entró al motor

`fetchGscOportunidades` (en `metricas.ts`) trae las búsquedas en **posición 4-20 con 5+ impresiones**: las que ya aparecen sin estar arriba. Va a dos lados: al prompt del motor de ideas (para elegir sobre qué escribir) y a un bloque del panel. Es una consulta **aparte** de la que ya alimentaba el panel — esa no se tocó.

Los artículos de blog ahora reciben además los ya publicados (para 2-3 enlaces internos), la página pilar de su territorio y la keyword objetivo. LinkedIn no recibe nada de eso: los links bajan el alcance.

**Verificación completa** (corrida real de 3 piezas + navegador): `docs/superpowers/sdd/2026-08-14-marketing-motor-cruces-y-seo/verificacion.md`.

## ⚠️ Pendientes conocidos (no bloquean el uso normal)
- **Las piezas inventan nombres de personas** (en la corrida del 14-ago: *"Rodríguez cuenta reservas firmadas. Marina cuenta boletos"* y *"Sofía, tu asesora estrella"* — confirmado en 2 de las 3 piezas). El canon prohíbe inventar casos con nombre, pero **la rúbrica de revisión no tiene ningún criterio que lo controle**: sus 7 puntos miran escena, posición, giro, detalles, repetición, CTA y muletillas. La regla existe y nadie la hace cumplir. Arreglarlo es sumar un criterio a `RUBRICA`, con el costo de que cada criterio nuevo aumenta los reintentos (que son llamadas pagas). **Decisión pendiente de Leo.**
- **Error de hidratación en el panel:** 2 errores de consola por una fecha que servidor y cliente formatean distinto, en `SeccionProgramacion`. React se recupera solo (cae a render en cliente), así que es cosmético. Viene de antes del trabajo de cruces.
- **El panel no anda en celular:** `app/admin-vakdor/layout.tsx` no tiene ninguna media query y la barra lateral es de ancho fijo. Afecta a **todo** el panel admin, no solo a Marketing.
- **Artículos de blog:** la revisión de calidad se le aplica al artículo de la web, no al post de LinkedIn que lo acompaña. El post de LinkedIn del blog sale sin esa revisión. Conocido, queda para la próxima pasada.
- **El worker no está en git.** `Prisma - MK` no es un repo. Sus archivos se versionan como copias en `docs/interno/worker-snapshots/`. Si esa carpeta se pierde, el snapshot es la única copia.

## ⏭️ QUÉ FALTA (infra)
1. **Deploy del worker a EasyPanel** (always-on, sin depender de la PC de Leo) — **igual que el acm-extractor**: Dockerfile con base `mcr.microsoft.com/playwright`, instalar las deps (playwright/@anthropic-ai/sdk/@supabase/supabase-js/pdfkit/marked), env vars como secrets, `CMD ["node","watch.mjs"]`. El worker ya es host-agnóstico (logos data-URI, sin rutas absolutas en el render).
2. **Primer comentario LinkedIn automático:** requiere plan pago de Buffer. Decisión de Leo (por ahora se pega a mano).
3. **(Opcional) lead-magnet como document post** de LinkedIn: hoy va como texto+imagen (portada); se podría publicar el `magnet.pdf` como documento igual que el carrusel si conviene.

## Datos clave verificados (para no re-investigar)
- **Modelo Claude (ago-2026):** `claude-sonnet-5` (sin `temperature`/`top_p`/`top_k`, thinking adaptativo, `max_tokens` al techo de 8000 porque el thinking consume el mismo presupuesto que el texto visible). Antes era `claude-opus-4-8`.
- **Blog vakdor-app:** `PROJECT_URL` (=https://upggigryxdvcmnuwafyl.supabase.co) + `SERVICE_ROLE_SECRET`. Bucket público `blog-images`. URL pública: `{PROJECT_URL}/storage/v1/object/public/blog-images/<path>`.
- **Buffer LinkedIn:** POST `https://api.buffer.com/graphql`, `Authorization: Bearer BUFFER_API_KEY`. Mutación `createPost(input: CreatePostInput!)` → union `PostActionPayload` (`PostActionSuccess{post{id,status}}` / errores con `message`). Input: `channelId` (LinkedIn personal = `6a4aca1140483446287320b8`), `text`, `schedulingType:"automatic"`, `mode:"shareNow"` (ahora) / `"customScheduled"`+`dueAt` (programar), `assets:[{image:{url}}]`, `saveToDraft` (true=probar sin publicar), `metadata:{linkedin:{firstComment}}` (SOLO plan pago). `deletePost(input:{id})` para borrar.
- **Rama/deploy:** todo en `main` (mergeado desde `feat/marketing-pipeline`; main había avanzado con tracking/marketing-ia de otra sesión, merge fue limpio sin conflictos). Build OK. Repo privado `osterrietchleonardo-rgb/prisma-system`.

## Arquitectura (regla dura, para no volver a discutirla)
Todo lo que usa **skills reales o Playwright** (ideas, contenido fiel, imágenes de marca) corre **LOCAL** (worker) o en **EasyPanel** — NUNCA en Vercel. La app (Vercel) hace: tablero, develop rápido in-app (texto), publicar, calendario, cron. El worker/EasyPanel hace: contenido fiel + imágenes de marca.
