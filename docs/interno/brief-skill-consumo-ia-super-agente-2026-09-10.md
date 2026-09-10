# Brief para la skill de consumo del Super Agente: costo de IA y análisis antes/después (10/9/2026)

> Para otra terminal de Claude Code. Objetivo: que la skill `/consumo` (ya existe en
> `.claude/skills/consumo/`: `SKILL.md`, `medir.mjs`, `verificar.mjs`, `informe-base.md`) mida
> **solo la IA** del Super Agente (las plantillas de WhatsApp las paga cada cliente a Meta) y
> calcule el **antes/después** y la **oportunidad** para una ventana de 30 días que se corre un
> día concreto. Todo lo de abajo se corrió en producción el 10/9/2026 contra Central
> (`agency_id = 4962bf85-a92c-4c33-ba07-380686bbab76`); los números citados son los reales de esa
> corrida y sirven para verificar que la skill reproduce lo mismo.

## 0. Lo que ya existe y lo que hay que cambiar

`medir.mjs` → función `superAgente(clienteId)` (líneas ~238-300). Hoy:
- Suma `seguimiento_decisiones.costo_usd` (modo `activo`). **Problema:** ese campo lo calcula
  `lib/seguimiento/agente.ts` con `TARIFA = { entrada: 3, salida: 15, cacheLeido: 0.3 }`, que es la
  tarifa de Sonnet 4.6. El modelo real es `claude-sonnet-5` (`MODELO` en
  `lib/admin-vakdor/marketing/claude.ts`): 2 / 10 / 0,20. **Sobreestima un 50 %.** Recalcular
  desde los tokens (sección 2A), no leer `costo_usd`.
- Valoriza notas y despedidas a `USD_POR_LECTURA = 0.0067` fijo. Es una estimación (sección 2B);
  lo correcto es guardar `usage` en el evento y leerlo (sección 7).
- No hace el cruce con la Admin API de Anthropic (sección 2C) ni el antes/después (sección 4).

Parámetros de ventana: `--desde`, `--hasta` (por defecto últimos 30 días hasta hoy). La skill
tiene que separar siempre dos tramos dentro de la ventana:

```sql
select modo, activo_desde from seguimiento_config where agency_id = '<agency_id>';
-- Central: activo desde 2026-09-01 00:07:32+00. Antes de esa fecha el modo era 'sombra'
-- (decidía y registraba, no mandaba). Cada fila de seguimiento_decisiones trae su `modo`.
```

Días activos en la ventana = días entre `max(desde, activo_desde)` y `hasta`, inclusive.

## 1. Tarifas y unidades (con fuente)

| Qué | Valor | Fuente |
|---|---|---|
| Claude Sonnet 5, entrada | US$ 2 / millón de tokens | tabla de modelos de la API de Claude (skill `claude-api`, cacheada 24/6/2026) |
| salida | US$ 10 / millón | ídem |
| lectura de caché | US$ 0,20 / millón | ídem |
| escritura de caché | US$ 2,50 / millón | ídem |
| Admin API `cost_report` | `amount` viene en **centavos** como string → `/100` | `lib/admin-vakdor/finance/providers.ts` (verificado contra el saldo de la consola) |

**Regla: la tarifa NO va escrita a mano en la skill.** Leonardo encontró listas públicas con
Sonnet 5 a 3 / 15 ("tarifas permanentes ajustadas tras ofertas previas"). Lo que la cuenta de
Vakdor pagó de verdad del 1 al 10/9 (cost_report ÷ usage_report, misma ventana) fue: entrada
3,018 / 1.508.944 tok = **2,00**; salida 2,185 / 218.501 = **10,00**; escritura de caché
0,702 / 280.686 = 2,50; lectura 0,089 / 446.380 = 0,20 (USD por millón). La skill calcula en
cada corrida la **tarifa efectiva** = costo del concepto ÷ tokens del concepto (Admin API,
sección 2C), la muestra en "Cómo se midió" y la usa para valorizar 2A y 2B. Si Anthropic sube el
precio, el informe lo refleja solo; si `usage_report` no trae tokens para el período, recién ahí
cae a la tabla de arriba y lo declara como supuesto.

Meta (referencia, NO se factura: lo paga el cliente): Argentina, por mensaje, vigente 1/7/2026:
marketing 0,0618 · utilidad 0,0260 · autenticación 0,0260 USD (hoja de tarifas USD de
developers.facebook.com/docs/whatsapp/pricing).

## 2. Costo de IA del Super Agente en la ventana

### 2A. Decisiones del seguimiento al cliente (medido, tokens reales)

Cada decisión guarda los tokens del bucle completo en `contexto_snapshot.tokens`
(`entrada`, `salida`, `cacheLeido`). Escrituras de caché no se guardan (ver 7).

```sql
select modo, accion, count(*) as n, count(*) filter (where ejecutada) as ejecutadas,
       sum((contexto_snapshot->'tokens'->>'entrada')::bigint)    as tok_entrada,
       sum((contexto_snapshot->'tokens'->>'salida')::bigint)     as tok_salida,
       sum((contexto_snapshot->'tokens'->>'cacheLeido')::bigint) as tok_cache
from seguimiento_decisiones
where agency_id = '<agency_id>' and creado_en >= '<desde>' and creado_en < '<hasta + 1 día>'
group by 1, 2 order by 1, 3 desc;
```

Costo = `tok_entrada × 2 + tok_salida × 10 + tok_cache × 0,20`, todo `/ 1e6`. Sumar aparte
`sombra` y `activo`: el de sombra es la prueba antes de encender, se informa como tal y no se
proyecta.

Valores del 10/9 (ventana 11/8–10/9, Central): activo 35 decisiones (16 contactar, 15 escalar,
4 abandonar; 32 ejecutadas) = 265.092 / 61.182 / 246.885 tokens → **US$ 1,19** (+≈0,15 de
escritura de caché); sombra 725 decisiones = 5,99 M / 1,2 M / 6,65 M → **≈ US$ 25,4**.
Promedio por decisión activa: 7.574 entrada, 1.748 salida, 7.054 caché ≈ US$ 0,034.

Detalle útil: `contexto_snapshot.pasos` es la lista de herramientas que usó (promedio 3-4 por
decisión); `resultado` y `plantilla` dicen qué se mandó.

### 2B. Veredictos de la escalera: notas internas y despedidas (hoy estimado)

```sql
select tipo, count(*), count(distinct conversation_id) as chats
from lead_eventos
where agency_id = '<agency_id>' and ts >= '<desde>' and ts < '<hasta + 1 día>'
  and tipo in ('nota_evaluada', 'despedida_evaluada', 'nota_error', 'despedida_error')
group by 1;
```

OJO: la columna de fecha de `lead_eventos` es **`ts`** (no `created_at`); la de
`seguimiento_decisiones` es `creado_en`; la de `interacciones_canal` es `ts`.

Cada veredicto es UNA llamada a `claude-sonnet-5` con tool forzado, sin caché. Los eventos no
guardan `usage` (ver 7). Mientras tanto, el tamaño se mide gratis con `count_tokens` sobre casos
reales: `scratch/_contar-tokens-veredictos.mjs` (worktree superagente; reconstruye la semilla y
pregunta a la API). Medido el 10/9: **2.600 tokens de entrada promedio** (1.933–3.026) y ~150 de
salida → **≈ US$ 0,0067 por veredicto**. Del 1 al 10/9: 13 notas + 101 despedidas = 114 → US$ 0,76.
La primera barrida de la despedida (7/9) evaluó backlog acumulado; en régimen son menos por día.

### 2C. Cruce con la cuenta real de Anthropic (Admin API)

Script listo: `scratch/_anthropic-costos.mjs <desde> <hasta>` (clave `ANTHROPIC_ADMIN_API_KEY`
del `.env`). Hace tres cosas:
1. `GET https://api.anthropic.com/v1/organizations/cost_report?starting_at=&ending_at=&group_by[]=workspace_id&group_by[]=description&limit=31`
   → costo en USD por concepto (`amount`/100). Paginar con `next_page`.
2. `GET /v1/organizations/usage_report/messages?bucket_width=1d&group_by[]=model&group_by[]=api_key_id`
   → tokens por modelo y clave (`uncached_input_tokens`, `output_tokens`,
   `cache_read_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`).
3. `GET /v1/organizations/api_keys` → nombre de cada clave.

Cabeceras: `x-api-key: <admin key>` y `anthropic-version: 2023-06-01`.

Lo que dio el 10/9: 11–31/8 **US$ 31,83** (el Super Agente en sombra fue ≈ 85 %); 1–10/9
**US$ 5,99** (el Super Agente ≈ un tercio). Todo corre por la clave `Anthropic_api_key`
(workspace default) junto con el generador de contenido y otros módulos, así que el cruce es
una **cota superior**, no una atribución exacta. Ver 7 para separarlo.

Regla de verificación de la skill: `costo_IA_super_agente (2A+2B) <= cost_report del período`;
si no, algo está mal.

## 3. Qué hizo en la ventana (volumen)

```sql
-- eventos por tipo
select tipo, count(*), count(distinct conversation_id) as chats
from lead_eventos
where agency_id = '<agency_id>' and ts >= '<desde>' and ts < '<hasta + 1 día>'
  and tipo in ('escalera','escalera_simulada','nota_evaluada','despedida_evaluada','decision',
               'envio','envio_simulado','compromiso_creado','aviso_equipo')
group by 1 order by 2 desc;

-- avisos entregados al equipo (con confirmación de Meta = wamid) y emails
select canal, destinatario, direccion, count(*) as total,
       count(*) filter (where wamid is not null) as con_wamid, count(distinct conversation_id) as chats
from interacciones_canal
where agency_id = '<agency_id>' and ts >= '<desde>' and ts < '<hasta + 1 día>'
group by 1, 2, 3 order by 4 desc;

-- mensajes de seguimiento enviados a clientes, por plantilla
select plantilla, canal, resultado, count(*)
from seguimiento_decisiones
where agency_id = '<agency_id>' and ejecutada and creado_en >= '<desde>' and creado_en < '<hasta + 1 día>'
group by 1, 2, 3 order by 4 desc;
```

Semántica: `escalera` = un nivel disparado (2/5/10/20 h, en `datos->>'nivel'`); un "caso" es
`(conversation_id, datos->>'t0')` (t0 = último mensaje del lead); `escalera_simulada` es lo mismo
en sombra; `aviso_equipo` cuenta cada envío por canal (por eso es mayor que `escalera`);
`interacciones_canal` es la verdad de lo que salió (email con `metadata.resend_id`, WhatsApp
con `wamid`). Categoría de cada plantilla (para el informe, no para cobrar): `wa_templates`
(`seg_pendiente`, `asesor_*`, `director_*`, `visita_recordatorio_*` = UTILITY; `seg_*` restantes
y `visita_post_noshow` = MARKETING).

Valores 1–9/9: 104 clientes escalados, 355 niveles, 526 WhatsApp al equipo (352 asesores + 174
director), 527 emails, 28 mensajes a clientes (13 utilidad + 15 marketing).

## 4. Antes y después (la prueba del valor)

### 4A. Derivaciones atendidas y tiempo de respuesta (la métrica principal)

Una derivación = mensaje `role='internal'` cuyo `content ilike '%Handoff activado%'` (lo escribe
el flujo Gestion_Handoff de n8n). Atendida = después de la última marca hay un mensaje
`role='human'` o una nota `role='internal'` que no sea la marca. Es exactamente la lógica del
panel del director (`lib/queries/handoffs.ts`).

```sql
with h as (
  select m.conversation_id, max(m.created_at) as handoff_at
  from wa_messages m join wa_conversations c on c.id = m.conversation_id
  where c.agency_id = '<agency_id>' and m.role = 'internal' and m.content ilike '%Handoff activado%'
    and m.created_at >= '<inicio_antes>' and m.created_at < '<hasta + 1 día>'
  group by 1
), r as (
  select h.*,
    (select min(x.created_at) from wa_messages x
      where x.conversation_id = h.conversation_id and x.created_at > h.handoff_at
        and (x.role = 'human' or (x.role = 'internal' and x.content not ilike '%Handoff activado%'))) as atendido_en
  from h
)
select case when handoff_at < '<activo_desde>' then 'antes' else 'despues' end as tramo,
       count(*) as derivaciones, count(atendido_en) as atendidas,
       round(100.0 * count(atendido_en) / count(*)) as pct_atendidas,
       round(percentile_cont(0.5) within group (order by extract(epoch from (atendido_en - handoff_at)) / 3600)::numeric, 1) as mediana_horas,
       count(*) filter (where atendido_en < handoff_at + interval '24 hours') as atendidas_en_24h
from r group by 1 order by 1;
```

Definición de tramos para una corrida de 30 días: `despues` = `[activo_desde, hasta]`;
`antes` = los 30 días anteriores a `activo_desde` (o, si el sistema lleva más de 30 días activo,
comparar con el mismo mes del encendido y decirlo). Por mes, para referencia: julio 55/16
(29 %, mediana 17,5 h), agosto 113/19 (17 %, 238 h), septiembre 1–10 34/17 (50 %, 12,3 h).

### 4B. Casos avisados que recibieron respuesta humana (las tres cifras que hoy "no mide el script")

```sql
with casos as (
  select conversation_id, datos->>'t0' as t0, min(ts) as primer_aviso
  from lead_eventos
  where agency_id = '<agency_id>' and tipo = 'escalera' and ts >= '<desde>' and ts < '<hasta + 1 día>'
  group by 1, 2
), r as (
  select c.*,
    (select min(m.created_at) from wa_messages m
      where m.conversation_id = c.conversation_id and m.role = 'human' and m.created_at > c.primer_aviso) as resp_humana,
    (select min(m.created_at) from wa_messages m
      where m.conversation_id = c.conversation_id and m.role = 'internal'
        and m.content not ilike '%Handoff activado%' and m.created_at > c.primer_aviso) as nota
  from casos c
)
select count(*) as casos, count(resp_humana) as con_respuesta_humana,
       count(*) filter (where resp_humana < primer_aviso + interval '24 hours') as respondidos_en_24h,
       count(nota) as con_nota_despues,
       round(percentile_cont(0.5) within group (order by extract(epoch from (resp_humana - primer_aviso)) / 3600)::numeric, 1) as mediana_horas_desde_aviso
from r;
```

10/9: 131 casos, 44 con respuesta humana, 42 dentro de las 24 h, 13 con nota, mediana 1,6 h.

### 4C. Respuesta de los clientes a los mensajes de seguimiento

```sql
with env as (
  select conversation_id, creado_en, plantilla from seguimiento_decisiones
  where agency_id = '<agency_id>' and ejecutada and resultado = 'enviada'
    and creado_en >= '<desde>' and creado_en < '<hasta + 1 día>'
)
select count(*) as enviados,
  count(*) filter (where exists (select 1 from wa_messages m where m.conversation_id = env.conversation_id
      and m.role = 'lead' and m.created_at > env.creado_en and m.created_at < env.creado_en + interval '7 days')) as cliente_respondio_7d,
  count(*) filter (where exists (select 1 from wa_messages m where m.conversation_id = env.conversation_id
      and m.role = 'human' and m.created_at > env.creado_en and m.created_at < env.creado_en + interval '7 days')) as asesor_escribio_despues,
  count(*) filter (where exists (select 1 from wa_conversations c where c.id = env.conversation_id
      and c.visit_scheduled_at > env.creado_en)) as visita_agendada_despues
from env;
```

10/9: 28 enviados, 10 respondieron (36 %), 1 con asesor después, 0 visitas.

### 4D. Leads escalados que terminaron en visita o gestión desde PRISMA

```sql
with casos as (
  select conversation_id, min(ts) as primer_aviso from lead_eventos
  where agency_id = '<agency_id>' and tipo = 'escalera' and ts >= '<desde>' and ts < '<hasta + 1 día>'
  group by 1
)
select count(*) as leads,
  count(*) filter (where exists (select 1 from wa_conversations c where c.id = casos.conversation_id and c.visit_scheduled_at > casos.primer_aviso)) as visita_en_conversacion,
  count(*) filter (where exists (select 1 from scheduled_visits v join wa_conversations c on c.id = casos.conversation_id
      where v.agency_id = c.agency_id
        and right(regexp_replace(v.telefono, '\D', '', 'g'), 8) = right(regexp_replace(c.contact_phone, '\D', '', 'g'), 8)
        and v.created_at > casos.primer_aviso)) as visita_en_calendario,
  count(*) filter (where exists (select 1 from lead_eventos e where e.conversation_id = casos.conversation_id
      and e.tipo in ('asesor_tomo', 'reasignacion', 'director_dio_tiempo') and e.ts > casos.primer_aviso)) as gestion_desde_prisma
from casos;
```

10/9: 104 leads, 0 / 1 / 2. Es el dato que muestra que la gestión por teléfono no se registra
(por eso el aviso pide registrarla desde el 7/9).

## 5. La oportunidad, en plata

- **Clientes escalados por mes** = clientes escalados en la ventana × 30 / días activos.
- **Presupuesto mediano en USD** de esos clientes: `wa_conversations.metricas`, campos
  `presupuesto_max` y `moneda_presupuesto`; **filtrar por moneda** (USD / U$S / DOLARES). Mezclar
  con pesos daba US$ 97.000; en dólares es US$ 65.000. `medir.mjs` ya lo hace bien.
- **Honorario por operación** = 3 % del presupuesto mediano (**a confirmar con el cliente**; es un
  supuesto declarado, no un dato).
- **Relación costo/honorario** = costo mensual de IA del Super Agente / honorario de una
  operación. Con Meta pagado por el cliente, la IA sola son ≈ US$ 6–7 por mes: < 0,5 % de un
  honorario.
- **Lo que quedaba sin atender antes**: derivaciones no atendidas en el tramo `antes` (agosto:
  94 de 113) y, si se quiere el acumulado, la clasificación por IA de las derivaciones sin atender
  (`scratch/_analizar-handoffs-sin-atender.mjs`, solo lectura, ~US$ 1,5 por corrida: el 7/9 dio 146
  de 156 con compromiso real del asesor sin resolver).

## 6. Trampas ya pisadas (no repetirlas)

- `lead_eventos` y `interacciones_canal` usan `ts`; `seguimiento_decisiones` usa `creado_en`;
  `wa_messages` y `wa_conversations` usan `created_at`. `wa_conversations` no tiene `updated_at`.
- `id` es uuid: para recortar, `substr(id::text, 1, 8)`, no `left(id, 8)`.
- Horas y días siempre en Argentina: `ts at time zone 'America/Argentina/Buenos_Aires'`.
- La Management API de Supabase (`scratch/_sa-query.mjs "<sql>"`) devuelve solo el resultado del
  **último** statement: una consulta por llamada. PostgREST: paginar siempre con `order=id.asc`.
- `costo_usd` de `seguimiento_decisiones` está a tarifa vieja (sección 0). No sumarlo.
- La primera barrida de una feature nueva evalúa backlog (la despedida del 7/9 leyó 101 casos en
  tres días); no proyectar ese ritmo. Tope de IA por barrida: 20 llamadas (`MAX_LLAMADAS_IA`).
- El `cost_report` de Anthropic es de toda la organización: cota superior, no atribución.
- Las plantillas de utilidad son gratis dentro de una ventana de atención abierta; como no se
  factura Meta, esto es solo para explicar volúmenes.
- Los tres números del antes/después que el informe hoy copia a mano (44/131, 42, 1,6 h) salen de
  la consulta 4B: la skill tiene que calcularlos, nunca copiarlos.

## 7. Cambios de código que hacen que la skill mida en vez de estimar (pedirlos con OK)

1. `lib/seguimiento/agente.ts`: `TARIFA` → `{ entrada: 2, salida: 10, cacheLeido: 0.2 }` y sumar
   `cache_creation_input_tokens` al `TokensLoop` (hoy se descarta). Una línea + un campo.
2. `lib/seguimiento/nota-interna.ts` y `despedida.ts`: guardar `usage` de la respuesta
   (`input_tokens`, `output_tokens`) en `datos` de `nota_evaluada` / `despedida_evaluada`. Con eso
   la sección 2B pasa de estimada a medida y `USD_POR_LECTURA` desaparece.
3. Una clave de API de Anthropic **propia para el Super Agente** (o un workspace), así
   `usage_report` grupado por `api_key_id` da la atribución exacta y el cruce 2C deja de ser cota.
4. Opcional: un evento `corrida` por barrida con el resumen (`ResumenEscalamiento` +
   `llamadasIA`), para contar corridas y llamadas sin inferirlas.

## 8. Cómo se verifica una corrida de la skill

- Reproducir los valores citados en este documento para la ventana 11/8–10/9 de Central
  (tolerancia: los que dependen de "hoy", como la mediana de presupuesto, pueden variar).
- `2A + 2B <= cost_report` de la misma ventana.
- Ninguna cifra escrita a mano en el informe: todas del JSON de medición (ya lo controla
  `verificar.mjs`; agregar los controles de 4A–4D).
- Antes/después solo si la ventana contiene `activo_desde`; si no, la tabla se saca y se dice.
