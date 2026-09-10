# Costos variables del Super Agente de Seguimiento — Central Real Estate (10/9/2026)

> Pedido de Leonardo: "análisis detallado de los gastos variables de este super agente, y todo
> lo que hace detrás, cada costo, para solicitar que mi cliente me pague estos gastos por mes".
> Todo lo de acá sale de la base de producción (Central, agencia `4962bf85`) y de las tarifas
> oficiales, con la fuente al lado. Período medido: **1 al 9 de septiembre de 2026** (9 días
> completos desde el encendido del 1/9 00:07). La proyección mensual es ×30/9 sobre ese ritmo.

## 1. Qué hace el Super Agente cada media hora (y qué cuesta cada paso)

Un reloj en n8n llama tres tareas cada 30 minutos entre las 6 y las 23 (hora Argentina).

| Paso | Qué hace | Costo variable que genera |
|---|---|---|
| **Escalera del lead que espera a un humano** | Detecta clientes derivados a un asesor sin respuesta humana y avisa a las 2 h (asesor), 5 h (asesor + director), 10 h (asesor) y 20 h (asesor + director). | Un **WhatsApp por plantilla de utilidad** (Meta) y un **email** (Resend) por cada aviso. |
| **Lectura de la nota interna** (desde el 4/9) | Si el asesor dejó una nota después del último mensaje del cliente, la IA la lee y decide si el cliente ya está atendido. | Una llamada a **Claude Sonnet 5** por nota. |
| **Lectura de la despedida** (desde el 7/9) | Si no hay nota, la IA lee la conversación y decide si el cliente espera respuesta o se despidió. | Una llamada a **Claude Sonnet 5** por caso (una sola vez por caso). |
| **Seguimiento al cliente** | Para leads que se enfriaron (20 h sin mensajes), la IA investiga con herramientas (mensajes, intentos, compromisos, propiedad) y decide: contactar, esperar, abandonar o escalar. | Un bucle de **3 a 6 llamadas a Claude Sonnet 5** por decisión, más **un WhatsApp al cliente** (plantilla de marketing o de utilidad) si decide contactar. |
| **Recordatorios de visita** | 24 h, 3 h y 1 h antes de cada visita agendada, y un mensaje si el cliente no fue. | Un WhatsApp de utilidad por recordatorio (marketing el de no-show). En el período no se disparó ninguno. |
| **Registro en la bitácora del lead** | Cada paso deja un evento en `lead_eventos` (trazabilidad del director). | Solo base de datos: costo fijo, no variable. |

## 2. Lo que pasó del 1 al 9 de septiembre (datos reales)

| Medición (Central, 1–9/9) | Cantidad | Fuente |
|---|---|---|
| Leads escalados (esperando a un humano) | 104 | `lead_eventos` tipo `escalera`, distintos `conversation_id` |
| Niveles de escalera disparados | 355 | `lead_eventos` tipo `escalera` |
| WhatsApp de aviso entregados al equipo (con `wamid` de Meta) | **526** (352 a asesores, 174 al director) | `interacciones_canal`, canal `whatsapp`, salida |
| Emails de aviso enviados al equipo | **527** (353 asesores, 174 director) | `interacciones_canal`, canal `email`, `resend_id` |
| Pico diario de avisos | 87 el 8/9 (mínimo 44 el 6/9) | `interacciones_canal` por día |
| Veredictos de IA: notas internas | 13 | `lead_eventos` tipo `nota_evaluada` |
| Veredictos de IA: despedidas | 101 | `lead_eventos` tipo `despedida_evaluada` |
| Decisiones del agente de seguimiento al cliente (1–10/9) | 35 (16 contactar, 15 escalar, 4 abandonar) | `seguimiento_decisiones` |
| Mensajes de seguimiento enviados a clientes (1–10/9) | 28 (13 `seg_pendiente` utilidad; 15 marketing: 8 `seg_retomar`, 5 `seg_puerta_abierta`, 2 `seg_valor`) | `seguimiento_decisiones` ejecutadas |
| Tokens del agente de seguimiento (35 decisiones) | 265.092 entrada · 61.182 salida · 246.885 leídos de caché | `contexto_snapshot.tokens` |
| Tokens de entrada por veredicto (medido con `count_tokens` sobre 12 casos reales) | 2.600 promedio (1.933–3.026) | `scratch/_contar-tokens-veredictos.mjs` |
| Gasto total de la cuenta de Anthropic (todo Vakdor, 1–10/9) | US$5,99 | Admin API `cost_report` (`scratch/_anthropic-costos.mjs`) |

## 3. Tarifas usadas (con fuente)

| Proveedor | Tarifa | Fuente |
|---|---|---|
| Meta WhatsApp, Argentina, por mensaje, vigente desde 1/7/2026 | **Marketing US$0,0618 · Utilidad US$0,0260 · Autenticación US$0,0260** | Hoja de tarifas en USD de Meta (`meta-usd.csv`, bajada el 10/9 desde developers.facebook.com/docs/whatsapp/pricing). Las plantillas de utilidad entregadas dentro de una ventana de atención abierta (el destinatario escribió en las últimas 24 h) son gratis. |
| Claude Sonnet 5 (Anthropic) | **Entrada US$2 · Salida US$10 · Lectura de caché US$0,20 · Escritura de caché US$2,50, por millón de tokens** | Tabla de modelos de la API de Claude (cacheada 24/6/2026). Ojo: `agente.ts` calcula `costo_usd` con la tarifa vieja de Sonnet 4.6 (3/15/0,30); el dato guardado sobreestima un 50 %. Acá se recalcula con la tarifa real. |
| Resend (email) | **Plan Free: 3.000 emails/mes y 100 por día, US$0. Plan Pro: US$20/mes hasta 50.000.** | resend.com/pricing (10/9). Qué plan tiene la cuenta de Vakdor: **a confirmar en el panel de Resend**. |

## 4. El costo por unidad de cada cosa

| Unidad | Cálculo | US$ |
|---|---|---|
| Un aviso de escalera por WhatsApp al equipo | plantilla de utilidad, Argentina | **0,0260** |
| Un aviso de escalera por email | dentro del plan de Resend | 0 (Free) o parte del fijo (Pro) |
| Un veredicto de IA (nota o despedida) | 2.600 tok entrada × 2 + ~150 tok salida × 10, /1M | **≈ 0,0067** |
| Una decisión del agente de seguimiento | promedio de 35 reales: 7.574 entrada, 1.748 salida, 7.054 caché | **≈ 0,034** (+ escritura de caché, ≈ 0,004) |
| Un mensaje de seguimiento al cliente, plantilla de utilidad (`seg_pendiente`) | | **0,0260** |
| Un mensaje de seguimiento al cliente, plantilla de marketing | | **0,0618** |
| Un recordatorio de visita | utilidad | 0,0260 |

## 5. Lo que costó el período y la proyección mensual

| Concepto | 1–9/9 (real) | Por mes (×30/9) |
|---|---|---|
| WhatsApp de avisos al equipo: 526 × 0,0260 | US$13,68 | **≈ US$45,6** (≈ 1.750 mensajes) |
| WhatsApp de seguimiento a clientes: 13 × 0,0260 + 15 × 0,0618 | US$1,27 | **≈ US$3,8** |
| Claude, decisiones del seguimiento: 265k×2 + 61k×10 + 247k×0,2 (+ caché) | US$1,19 (+≈0,15) | **≈ US$4,0** |
| Claude, veredictos de notas y despedidas: 114 × 0,0067 | US$0,76 | **≈ US$2,3** (el arranque incluyó backlog; en régimen es menos) |
| Recordatorios de visita | 0 | 0 (a 0,026 cada uno cuando aparezcan) |
| Emails: ≈ 1.750/mes | 0 en Free | **0 (Free) o US$20 fijo (Pro), a confirmar** |
| **Total variable atribuible a Central** | **≈ US$17** | **≈ US$56/mes** (hasta ≈ US$76 si Resend es Pro) |

Control cruzado: la cuenta entera de Anthropic gastó US$5,99 en los 10 días (todo Vakdor, en la
misma clave que usa PRISMA); la parte del Super Agente calculada arriba (≈ US$2,1) es un tercio,
coherente con que en esa clave también corren el generador de contenido y otros módulos.

## 6. Lo que NO es variable (y no se factura aparte)

Vercel (hosting de la app), Supabase (base de datos), el servidor de EasyPanel donde corre el
reloj de n8n, y las suscripciones de Vakdor. Son costos fijos compartidos entre clientes; están
dentro del abono. Las conversaciones del bot Sofía con los clientes (n8n + Gemini/OpenAI) tampoco
entran acá: son otro módulo con su propio costo.

## 7. Tres cosas que Leonardo tiene que verificar antes de facturar

1. **Quién le paga a Meta por la WABA de Central.** Los 526 mensajes salieron por el número de
   Central (plantillas con prefijo `ag4962bf_`). Si el medio de pago de esa cuenta de WhatsApp
   Business es de Central, Meta ya se lo cobra a ellos y no corresponde refacturarlo; si es de
   Vakdor, sí. Se ve en el Administrador comercial de Meta → Facturación de WhatsApp.
2. **El plan de Resend** (Free o Pro): cambia el total en US$20.
3. **La ventana gratis de utilidad**: los avisos al equipo son gratis si el asesor le escribió al
   número de la agencia en las últimas 24 h. En el período hubo solo 27 respuestas de asesores por
   WhatsApp, así que casi todos se cobraron; el cálculo asume que se cobran todos (conservador).

## 8. El dato que cambia la conversación con Kevin

El 80 % del costo variable son los avisos al equipo, y esos avisos existen porque un cliente
quedó esperando: 355 niveles para 104 leads son **3,4 avisos por lead**. Si los asesores
contestan (o dejan una nota, o el cliente se despide y la IA lo lee) antes de las 2 horas, el
aviso no sale y el costo baja solo. El costo es proporcional a la falta de respuesta del equipo,
no al uso del sistema.

## 9. Cómo pedirlo (dos formas, a elección)

- **Cargo fijo mensual con colchón:** US$80/mes por "mensajería y IA del seguimiento", con
  revisión trimestral contra el real. Simple de explicar y de cobrar; cubre el peor caso medido.
- **Reembolso al costo + gestión:** el real del mes (hoy ≈ US$56) + 25 %, con el detalle de esta
  tabla adjunto cada mes. Más justo, más trabajo.

Ambas suponen que Meta le cobra a Vakdor (punto 7.1). Si Meta le cobra a Central directo, lo
único a facturar es Claude: ≈ US$6–7/mes, y conviene meterlo dentro del abono y no cobrarlo.

## Cómo se recalcula el mes que viene

```
node scratch/_anthropic-costos.mjs 2026-10-01 2026-10-31     # gasto real de Anthropic
```
y las consultas de la sección 2 sobre `interacciones_canal`, `lead_eventos` y
`seguimiento_decisiones` con el rango nuevo (están en la bitácora del 10/9).
