---
name: vakdor-meta-ads
description: Conecta y opera las cuentas publicitarias de Meta (Instagram/Facebook Ads) de Vakdor vía Marketing API. Úsala SIEMPRE que Leonardo pida ver o crear anuncios/campañas, insights de publicidad, rendimiento de ads, gasto/CPC/CTR/alcance, pausar o activar campañas, o mencione "Meta Ads", "publicidad", "campaña", "anuncio", "Instagram Ads", "Facebook Ads", "insights de ads". Lectura libre; crear/editar/pausar SÍ o SÍ necesita OK explícito de Leonardo.
---

# Vakdor Meta Ads (Marketing API)

Skill para ver y operar la publicidad de Vakdor en Meta (Instagram/Facebook) contra la
**Marketing API** (Graph API), autenticando con `META_TOKEN_PERMANENTE` del `.env` del repo.
Todo lo de acá está **verificado en vivo** contra la API real (v23.0) — no inventes campos ni rutas.

## Lo primero: el CLI (solo lectura, seguro)

```bash
node .claude/skills/vakdor-meta-ads/scripts/meta-ads.mjs accounts       # cuentas de ads
node .claude/skills/vakdor-meta-ads/scripts/meta-ads.mjs campaigns       # campañas de la cuenta
node .claude/skills/vakdor-meta-ads/scripts/meta-ads.mjs insights        # insights de la cuenta (30d)
```

Flags: `--json` (salida cruda), `--act <id>` (otra cuenta), `--version v23.0`.

## Contexto real (verificado)

- **Token:** `META_TOKEN_PERMANENTE` (system user "Leonardo_Vakdor", id `61588212458020`). Es **permanente** (no expira) y tiene scopes `ads_read`, `ads_management`, `business_management` + los de WhatsApp.
- **Cuenta principal:** `act_583233341182808` — **Instagram_Ads** (business Vakdor, `2391978941174272`), moneda **USD**, activa. Es el default del CLI.
- **API:** Graph `v23.0` (también anda v25.0). Base `https://graph.facebook.com/v23.0`.
- Los montos de presupuesto vienen en **centavos** (dividir por 100 para USD).

## La jerarquía de Meta Ads (clave para entender todo)

```
Campaña (Campaign)  → define el OBJETIVO (tráfico, leads, ventas, reconocimiento...)
  └─ Conjunto de anuncios (Ad Set) → PRESUPUESTO + público + puja + calendario
       └─ Anuncio (Ad) → junta el creative con el ad set
            └─ Creative (Ad Creative) → la parte visual (imagen/video + texto + link)
```

Objetivos válidos (nuevos, ODAX): `OUTCOME_TRAFFIC`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_ENGAGEMENT`, `OUTCOME_AWARENESS`, `OUTCOME_APP_PROMOTION`.

## Leer insights (rendimiento)

```bash
# de la cuenta entera, últimos 7 días
node .claude/skills/vakdor-meta-ads/scripts/meta-ads.mjs insights --preset last_7d

# de una campaña puntual, desglosado por día
node .claude/skills/vakdor-meta-ads/scripts/meta-ads.mjs insights --campaign <id> --preset last_30d

# rango custom + breakdown por edad/género/plataforma
node .claude/skills/vakdor-meta-ads/scripts/meta-ads.mjs insights --since 2026-07-01 --until 2026-07-09 --breakdown age
```

Presets: `today, yesterday, last_7d, last_14d, last_30d, last_90d, this_month, last_month, maximum`.
Métricas por defecto: `spend, impressions, clicks, ctr, cpc, cpm, reach, frequency, actions, cost_per_action_type`.
Podés pedir otras con `--fields spend,impressions,...`. Niveles: `--level account|campaign|adset|ad`.

## Explorar la estructura

```bash
node ... campaigns                      # campañas (id, estado, objetivo, presupuesto)
node ... adsets --campaign <id>         # ad sets de una campaña
node ... ads --adset <id>               # ads de un ad set
node ... get <cualquier-id> --fields id,name,status,objective   # objeto crudo
```

## Escritura (crear/pausar/activar) — REGLA DURA

Estas acciones **impactan la publicidad real y el gasto de Leonardo**. Igual que con n8n y EasyPanel:
**NUNCA ejecutes una mutación sin OK explícito de Leonardo en el momento.** La lectura es libre.

Antes de cualquier escritura:
1. Confirmá con Leonardo qué exactamente (objetivo, presupuesto, público, texto, creative).
2. **Creá siempre en estado `PAUSED`** primero, para revisar antes de que salga a gastar.
3. Mostrale lo que se va a crear y esperá el sí.

```bash
# pausar / activar (requiere OK)
node ... pause <id>
node ... activate <id>

# crear campaña en PAUSED (requiere OK). El ad set y el ad se crean después con `raw`.
node ... create-campaign --name "Prueba tráfico" --objective OUTCOME_TRAFFIC --status PAUSED

# llamada cruda para lo no cubierto (ad sets, ads, creatives). Requiere OK.
node ... raw POST /act_583233341182808/adsets --data '{"name":"...","campaign_id":"...","daily_budget":"500","billing_event":"IMPRESSIONS","optimization_goal":"LINK_CLICKS","targeting":"{...}","status":"PAUSED"}'
```

> Un ad set necesita: `campaign_id`, presupuesto (`daily_budget` o `lifetime_budget`, en centavos), `billing_event`, `optimization_goal`, `targeting` (JSON de público) y, para conversiones, `promoted_object`. Un ad necesita `adset_id` + `creative` ({creative_id} o inline). Consultá el shape exacto con `get` sobre un objeto existente antes de crear.

## Gotchas

- **Presupuesto en centavos:** `daily_budget: "500"` = US$5,00/día.
- **Crear siempre PAUSED** y revisar; recién activar con OK.
- **`special_ad_categories`** es obligatorio al crear campaña (el CLI manda `[]` por defecto; si es inmobiliaria/crédito/empleo puede requerir `HOUSING`).
- Si un endpoint tira `(#200) permission`, el system user no tiene acceso a esa cuenta/activo — hay que asignarlo en Business Settings.
- Cuando le informes a Leonardo, resumí en criollo (gasto, CTR, qué campaña rinde), no le tires el JSON crudo salvo que lo pida.
