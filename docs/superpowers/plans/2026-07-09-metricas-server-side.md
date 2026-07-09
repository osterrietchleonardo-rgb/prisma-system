# Métricas server-side (Exp 2 y 3 autónomos) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Que los Expertos 2 (Salud) y 3 (Redes) se actualicen solos cada día SIN depender de una sesión de Claude ni de MCPs locales — reimplementando la recolección como código server-side que llama a las APIs REST reales, colgado del cron `tokko-sync.yml`.

**Architecture:** Cada experto es un módulo en `lib/admin-vakdor/audit/` que junta datos de varias fuentes vía `fetch`, arma el mismo jsonb (`grupos`, `n8n_workflows`, `sub_semaforos`) que la UI YA renderiza, calcula el semáforo con regla fija (`peorSemaforo`), redacta con `redactarResumen` (Gemini) y guarda con `guardarSnapshot`. Dos endpoints cron nuevos, colgados de tokko-sync como los de Exp 1.

**Tech Stack:** Next 14 route handlers, `fetch`, `getAdminDb()` (Supabase service role), `getGoogleAccessToken(scope)` (service account JWT ya existente), Gemini flash.

## Global Constraints

- DB server-side: `getAdminDb()` de `@/lib/admin-vakdor/logger`. Cron auth: `Bearer CRON_SECRET` → 401.
- Reusar núcleo existente: `types.ts` (`peorSemaforo`, `Semaforo`, `AuditSnapshot`), `store.ts` (`guardarSnapshot`), `narrate.ts` (`redactarResumen`).
- El jsonb producido debe respetar EXACTO las claves que la UI ya lee (`components/admin-vakdor/audit-section.tsx`): Exp2 → `metricas.grupos` (obj de objs), `metricas.n8n_workflows` (obj con `{estado,errores,ultimo_error,causa,correccion}`), `metricas.n8n_nota`, `metricas.sub_semaforos`. Exp3 → `metricas.grupos`, `metricas.sub_semaforos`.
- Semáforo: `verde|amarillo|rojo|gris`; overall = `peorSemaforo(sub_semaforos)`.
- Sin framework de tests: verificación = `npx tsc --noEmit` + `curl` real al endpoint con CRON_SECRET + consulta SQL de la fila + ver el dashboard.
- Todo en rama `feat/metricas-auditoria-diaria`, merge con OK.

**Recetas verificadas (usar tal cual):**
- **EasyPanel:** `POST https://panel.vakdor.com/api/trpc/projects.listProjectsAndServices` body `{"json":null}`, header `Authorization: Bearer ${EASYPANEL_API_KEY}`. Salud por servicio: `POST .../services.common.getServiceError` body `{"json":{projectName,serviceName}}` (null = sano). Core a vigilar: n8n, evolution-api, roomix-worker, acm-extractor, redis (excluir chatwoot).
- **n8n:** base `https://vn8nv.vakdor.com/api/v1`, header `X-N8N-API-KEY: ${N8N_API_KEY}` (nombre real a confirmar en `.env`). `GET /workflows` (lista), `GET /executions?status=error&limit=50` (errores). Mapear los 6 workflows por nombre→id y su último error.
- **GitHub:** `GET https://api.github.com/repos/osterrietchleonardo-rgb/prisma-system/actions/runs?per_page=25`, header `Authorization: Bearer ${GH_TOKEN}`. Agrupar por `name`, tomar el último de cada workflow (`conclusion`).
- **Dead-letters:** Supabase `getAdminDb().from("wa_n8n_dead_letter").select count where status='pending'`.
- **Buffer:** `POST https://api.buffer.com/` header `Authorization: Bearer ${BUFFER_API_KEY}`, body GraphQL. Org `6a4ac991dd4b5f5519aeb552`. Canales: LinkedIn personal `6a4aca1140483446287320b8` (motor), IG `6a4acb7940483446287325e3`, LinkedIn página `6a4aca1140483446287320b9`. Métricas: query `aggregatedPostMetrics(organizationId,startDateTime,endDateTime,channelIds)` → `metrics{type,value,unit}`.
- **Clarity:** reusar la lógica de `scripts/clarity.mjs` (token de `.env`, API `https://www.clarity.ms/export-data/api/v1/project-live-insights`). Límite 10 req/día, ventana 1-3 días → 1×/día.
- **GA:** `getGoogleAccessToken("https://www.googleapis.com/auth/analytics.readonly")` → `POST https://analyticsdata.googleapis.com/v1beta/properties/526455345:runReport` body `{dateRanges:[{startDate:"7daysAgo",endDate:"today"}],metrics:[{name:"activeUsers"},{name:"sessions"},{name:"screenPageViews"},{name:"newUsers"}]}`.
- **GSC:** `getGoogleAccessToken("https://www.googleapis.com/auth/webmasters.readonly")` → `POST https://searchconsole.googleapis.com/webmasters/v3/sites/{encodeURIComponent('https://www.vakdor.com/')}/searchAnalytics/query` body `{startDate,endDate}`.

**Fase 2 (requiere tokens nuevos — NO en este plan):** Vercel (crear token → `GET /v9/projects/{id}/deployments`), Cloudflare (crear token → `GET /zones`), Meta Ads (system user token), Supabase advisors (management token). Hasta entonces, esos grupos se muestran "no consultado".

## File Structure

- Create: `lib/admin-vakdor/audit/sources/easypanel.ts`, `n8n.ts`, `github.ts`, `buffer.ts`, `clarity.ts`, `google.ts` (GA+GSC) — una fuente por archivo, cada una exporta una función `async () => datos`.
- Create: `lib/admin-vakdor/audit/sistema.ts` (orquesta easypanel+n8n+github+deadletters → AuditSnapshot).
- Create: `lib/admin-vakdor/audit/redes.ts` (orquesta buffer+clarity+google → AuditSnapshot).
- Create: `app/api/cron/audit-sistema/route.ts`, `app/api/cron/audit-redes/route.ts`.
- Modify: `.github/workflows/tokko-sync.yml` (2 pasos).

---

## Task 1: Fuentes de datos server-side (sources/*)

**Files:** Create los 6 archivos en `lib/admin-vakdor/audit/sources/`.

**Interfaces — Produces:**
- `getEasypanelHealth(): Promise<{ servicios: Record<string,string>; sub: Semaforo }>` — estado de los 5 core.
- `getN8nHealth(): Promise<{ vivo: boolean; errores24h: number; workflows: Record<string, {estado,errores,ultimo_error,causa,correccion}>; sub: Semaforo }>`.
- `getGithubActions(): Promise<{ runs: Record<string,string>; sub: Semaforo }>`.
- `getBufferMetrics(): Promise<{ grupos: Record<string,Record<string,string>>; sub: Semaforo }>`.
- `getClarityInsights(): Promise<{ kvs: Record<string,string>; sub: Semaforo }>`.
- `getGoogleTraffic(): Promise<{ ga: Record<string,string>; gsc: Record<string,string>; subGa: Semaforo; subGsc: Semaforo }>`.

Cada función: try/catch → si falla, devolver `sub: "gris"` y un valor "no disponible" (nunca romper la corrida). Las recetas exactas están en Global Constraints.

- [ ] **Step 1:** Confirmar nombres reales de env en `.env`: `EASYPANEL_API_KEY`, la key de n8n (`grep -iE 'N8N' .env`), la de Clarity (`grep -iE 'CLARITY' .env`), `GH_TOKEN`, `BUFFER_API_KEY`, `CLIENT_EMAIL`/`PRIVATE_KEY`. Ajustar los `process.env.*` a los nombres reales.
- [ ] **Step 2:** Escribir los 6 archivos con las recetas de Global Constraints. Umbrales de semáforo: EasyPanel rojo si algún core caído; n8n rojo si caído o error en últimas 24h, amarillo si históricos; GitHub rojo si último run de algún workflow = failure; GA/GSC amarillo si bajo, rojo si 0; Buffer verde si hay actividad; Clarity amarillo por defecto.
- [ ] **Step 3:** `npx tsc --noEmit` (excluir `.next/types`) sin errores nuevos.
- [ ] **Step 4:** Commit `feat(metricas): fuentes server-side para auditoría (easypanel/n8n/github/buffer/clarity/google)`.

---

## Task 2: Orquestadores + endpoints Exp 2 y 3

**Files:** Create `sistema.ts`, `redes.ts`, y los 2 route handlers.

**Interfaces:**
- Consumes: las 6 funciones de Task 1 + `peorSemaforo`, `guardarSnapshot`, `redactarResumen`.
- Produces: `auditarSistema(): Promise<AuditSnapshot>` (scope global, arma `grupos`+`n8n_workflows`+`n8n_nota`+`sub_semaforos`); `auditarRedes(): Promise<AuditSnapshot>` (arma `grupos`+`sub_semaforos`). Endpoints `GET /api/cron/audit-sistema` y `/audit-redes`.

- [ ] **Step 1:** `sistema.ts` → junta easypanel+n8n+github+deadletters, arma el jsonb con las MISMAS claves que la UI lee, `semaforo = peorSemaforo([...subs])`. Grupos Vercel/Cloudflare = `{Estado:"no consultado (Fase 2)"}`.
- [ ] **Step 2:** `redes.ts` → junta buffer+clarity+google, mismo patrón. Grupo Meta Ads = `{Estado:"no consultado (Fase 2)"}`.
- [ ] **Step 3:** Los 2 endpoints (patrón de `audit-whatsapp/route.ts`): auth Bearer, llaman al orquestador, `s.resumen = await redactarResumen(...)`, `guardarSnapshot(s)`, responden `{ok,semaforo}`. `maxDuration=120`.
- [ ] **Step 4:** `npx tsc --noEmit` limpio.
- [ ] **Step 5:** Commit `feat(metricas): orquestadores + endpoints cron Exp2 y Exp3 server-side`.

---

## Task 3: Enganche al cron + verificación live

**Files:** Modify `.github/workflows/tokko-sync.yml`.

- [ ] **Step 1:** Agregar 2 pasos al final de `jobs.sync.steps` (patrón `if: always()` + `continue-on-error: true`), curl a `/api/cron/audit-sistema` y `/api/cron/audit-redes` con `Bearer ${{ secrets.CRON_SECRET }}`.
- [ ] **Step 2 (controlador, live):** `npm run dev` + `curl` a los 2 endpoints con CRON_SECRET. Esperado `{ok:true}` en ambos.
- [ ] **Step 3 (controlador, live):** SQL: `select experto,semaforo,left(resumen,80),metricas->'grupos' from audit_snapshots where experto in ('sistema','redes') order by run_at desc limit 2`. Confirmar que los grupos traen datos reales (EasyPanel 5 servicios, n8n workflows, GitHub, Buffer, GA/GSC, Clarity) y coinciden con lo que se vio manual.
- [ ] **Step 4 (controlador, live):** Abrir `/admin-vakdor/dashboard` y confirmar que los paneles Salud y Redes muestran lo mismo que traía la corrida manual.
- [ ] **Step 5:** Commit `feat(metricas): engancha Exp2 y Exp3 server-side a tokko-sync (autónomos 2×/día)`.

---

## Self-Review (cobertura)
- Exp2 server-side (EasyPanel, n8n×6, GitHub, dead-letters): Task 1+2. ✔ (Vercel/Cloudflare/advisors = Fase 2, marcados "no consultado").
- Exp3 server-side (Buffer, Clarity, GA, GSC): Task 1+2. ✔ (Meta = Fase 2).
- Autonomía diaria sin MCP/sesión: Task 3 (colgado de tokko-sync). ✔
- UI sin cambios: los orquestadores producen el jsonb que la UI ya renderiza. ✔
- Fase 2 (tokens Vercel/Cloudflare/Meta) queda fuera, documentada.
