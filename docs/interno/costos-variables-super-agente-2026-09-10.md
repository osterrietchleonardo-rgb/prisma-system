# El Super Agente de Seguimiento en Central: qué hace, qué vale, qué cuesta (últimos 30 días)

> Pedido de Leonardo (10/9): análisis de los gastos variables del Super Agente "para solicitar
> que mi cliente me pague estos gastos por mes", del período de los últimos 30 días, "más
> explicado para mostrarle lo que vale, qué es lo que hace, cuál es el valor, la oportunidad".
> Período: **11 de agosto al 10 de septiembre de 2026**. Todo sale de la base de producción de
> Central (agencia `4962bf85`) y de tarifas oficiales, con la fuente al lado. Versión para
> compartir: artefacto "Costos del Super Agente" (misma información, en página).

## 1. Qué es, en una frase

Un sistema que cada media hora, de 6 a 23, revisa todas las conversaciones de WhatsApp de la
agencia y se ocupa de dos cosas que antes no hacía nadie: **que ningún cliente quede esperando
a un asesor sin que alguien se entere**, y **que ningún cliente que se enfrió quede olvidado**.
Deja escrito todo lo que hace en la ficha de cada cliente, y el director lo ve en Trazabilidad.

## 2. Antes y después (el dato que lo explica todo)

Derivaciones del bot a un asesor ("Handoff activado") y qué pasó con ellas, por mes. Fuente:
`wa_messages` (marca de handoff; atendida = un mensaje humano o una nota después).

| Mes | Derivaciones | Atendidas | % atendidas | Mediana de horas hasta la respuesta | Atendidas en menos de 24 h |
|---|---|---|---|---|---|
| Julio | 55 | 16 | 29 % | 17,5 h | 11 |
| Agosto (sistema en sombra) | 113 | 19 | **17 %** | **238 h (10 días)** | 7 |
| Septiembre, 1 al 10 (sistema activo) | 34 | 17 | **50 %** | **12,3 h** | 12 |

Con el sistema encendido, la proporción de clientes atendidos se triplicó respecto de agosto y
el tiempo de respuesta bajó de diez días a doce horas. Muestra chica (10 días), pero es el
mismo equipo, los mismos clientes y la misma temporada.

## 3. Qué hizo en los 30 días

Dos tramos: **en sombra** del 11 al 31 de agosto (decidía y registraba, sin mandar nada: la
prueba antes de encender) y **activo** desde el 1 de septiembre.

| Lo que hizo | Sombra 11–31/8 | Activo 1–10/9 | Fuente |
|---|---|---|---|
| Decisiones de seguimiento al cliente (la IA leyó el chat y decidió) | 725 (378 contactar, 284 escalar, 55 abandonar, 8 posponer), ninguna ejecutada | 35 (16 contactar, 15 escalar, 4 abandonar), 32 ejecutadas | `seguimiento_decisiones` |
| Mensajes de seguimiento enviados a clientes | 0 | 28 (13 de utilidad, 15 de marketing) | `seguimiento_decisiones` ejecutadas |
| Clientes que respondieron a ese mensaje en 7 días | — | **10 de 28 (36 %)** | `wa_messages` role `lead` posterior |
| Escaleras "cliente esperando" | 223 simuladas en 131 chats | **355 avisos reales en 104 clientes** | `lead_eventos` |
| Clientes avisados que recibieron respuesta humana después del aviso | — | **44 de 131 casos** (42 dentro de las 24 h; mediana 1,6 h después del aviso) | `wa_messages` role `human` posterior al primer aviso |
| Notas internas leídas por la IA (desde el 4/9) | — | 13 | `lead_eventos` `nota_evaluada` |
| Despedidas leídas por la IA (desde el 7/9) | — | 101 en 90 chats | `lead_eventos` `despedida_evaluada` |
| WhatsApp de aviso entregados al equipo | 0 | 526 (352 asesores, 174 director) | `interacciones_canal` con `wamid` |
| Emails de aviso al equipo | 0 | 527 | `interacciones_canal` con `resend_id` |
| Compromisos "el asesor responde en 24 h" creados | 138 en 58 chats (sombra y activo) | | `lead_eventos` `compromiso_creado` |

Lo que todavía no se ve en los datos: de los 104 clientes escalados en septiembre, 1 tiene una
visita cargada en el calendario después del aviso y 2 fueron gestionados desde los botones de
PRISMA. Es el punto que el aviso nuevo (7/9) empuja: que la gestión quede registrada.

## 4. La oportunidad, en plata

- **104 clientes en 10 días** quedaron esperando a un asesor y el sistema los persiguió. Al mismo
  ritmo son **unos 300 por mes**.
- **Presupuesto mediano declarado** por esos clientes: **US$ 97.000** (73 de los 104 lo dijeron;
  fuente: `metricas.presupuesto`/`presupuesto_max`).
- Con un honorario de compra del 3 % (**a confirmar con Kevin**), cada uno de esos clientes vale
  en promedio **≈ US$ 2.900 de honorarios** si se cierra.
- En agosto, **94 de 113 derivaciones** quedaron sin atender. Desde julio, la IA contó **146**
  derivaciones con un compromiso real del asesor sin resolver (análisis del 7/9).
- El costo variable de todo el sistema (≈ US$ 56/mes, sección 5) es **menos del 2 % de un solo
  honorario**. Con que una operación al año se cierre porque el cliente fue atendido a tiempo, el
  sistema se pagó cuatro veces.

## 5. Qué cuesta

### 5.1 Los últimos 30 días, real

| Concepto | US$ | Fuente |
|---|---|---|
| IA en sombra (11–31/8): 725 decisiones, 5,99 M tokens de entrada, 1,2 M de salida, 6,6 M de caché | **≈ 27** | tokens de `seguimiento_decisiones` a tarifa Sonnet 5 (+ escritura de caché). Control: la cuenta entera de Anthropic gastó US$ 31,83 en ese tramo (Admin API); el Super Agente fue el 85 %. |
| IA activa (1–10/9): 35 decisiones + 114 veredictos | ≈ 2,1 | tokens reales + `count_tokens` sobre 12 casos (2.600 de entrada por veredicto) |
| WhatsApp al equipo: 526 × 0,0260 | 13,68 | hoja de tarifas de Meta, Argentina, USD, vigente 1/7/2026 |
| WhatsApp a clientes: 13 × 0,0260 + 15 × 0,0618 | 1,27 | ídem |
| Emails: 527 | 0 (Free) o parte del fijo (Pro) | resend.com/pricing |
| **Total 30 días** | **≈ 44** | |

La sombra fue el período de prueba antes de encender y **no se repite**: son US$ 27 que Vakdor
absorbió para validar el sistema con datos reales antes de que le llegara un solo mensaje a un
asesor de Central.

### 5.2 Lo que va a costar por mes, al ritmo de septiembre (×30/9)

| Concepto | Unidades por mes | Unitario US$ | US$ por mes |
|---|---|---|---|
| WhatsApp de avisos al equipo (utilidad) | ≈ 1.750 | 0,0260 | **≈ 45,6** |
| WhatsApp de seguimiento a clientes | ≈ 39 utilidad + 45 marketing | 0,0260 / 0,0618 | ≈ 3,8 |
| IA, decisiones de seguimiento | ≈ 105 | ≈ 0,038 | ≈ 4,0 |
| IA, veredictos de notas y despedidas | ≈ 340 | ≈ 0,0067 | ≈ 2,3 |
| Recordatorios de visita | 0 en el período | 0,0260 | 0 |
| Emails | ≈ 1.750 | 0 (Free) | 0, o US$ 20 fijos si el plan es Pro |
| **Total variable por mes** | | | **≈ 56 (hasta ≈ 76)** |

### 5.3 Tarifas usadas

| Proveedor | Tarifa | Fuente |
|---|---|---|
| Meta, WhatsApp, Argentina, por mensaje | Marketing 0,0618 · Utilidad 0,0260 · Autenticación 0,0260 (USD), vigente desde 1/7/2026 | hoja de tarifas USD de developers.facebook.com/docs/whatsapp/pricing (bajada el 10/9). Utilidad gratis dentro de una ventana de atención abierta (el destinatario escribió en las últimas 24 h). |
| Claude Sonnet 5 | Entrada 2 · Salida 10 · Lectura de caché 0,20 · Escritura de caché 2,50 (USD por millón de tokens) | tabla de modelos de la API de Claude. `agente.ts` guarda `costo_usd` con la tarifa vieja de Sonnet 4.6 (3/15/0,30): sobreestima 50 %; acá se recalculó. |
| Resend | Free: 3.000/mes y 100/día, US$ 0 · Pro: US$ 20/mes | resend.com/pricing. Plan de la cuenta: a confirmar. |

## 6. Lo que no es variable

Hosting (Vercel), base de datos (Supabase), el servidor del reloj (EasyPanel) y las
suscripciones de Vakdor: fijos, compartidos, dentro del abono. Las conversaciones del bot Sofía
con los clientes son otro módulo con su propio costo.

## 7. Antes de facturar, verificar

1. **Quién le paga a Meta por la WABA de Central.** Los 526 avisos salieron por el número de
   Central (plantillas `ag4962bf_*`). Si el medio de pago es de Central, Meta ya se lo cobra y no
   se refactura; si es de Vakdor, sí. Administrador comercial de Meta → Facturación de WhatsApp.
2. **Plan de Resend** (Free o Pro): US$ 20 de diferencia.
3. **Ventana gratis de utilidad**: solo 27 respuestas de asesores por WhatsApp en el período;
   el cálculo asume que se cobran todos los avisos (conservador).

## 8. El dato que cambia la conversación con Kevin

El 82 % del costo variable son los avisos al equipo, y cada aviso existe porque un cliente quedó
esperando: 355 avisos para 104 clientes, 3,4 por cliente. Si el asesor contesta, deja una nota
o el cliente se despide, el aviso no sale. **El costo es proporcional a la falta de respuesta
del equipo, no al uso del sistema.** Cuanto mejor atienda Central, menos paga.

## 9. Cómo pedirlo

- **Cargo fijo con colchón: US$ 80/mes** por "mensajería e IA del seguimiento", revisión
  trimestral contra el real. Simple; cubre el peor caso medido.
- **Reembolso al costo + 25 %**: hoy ≈ US$ 70, con estas tablas adjuntas cada mes.

Las dos suponen que Meta le cobra a Vakdor (7.1). Si Meta le cobra a Central directo, lo único
facturable es la IA (≈ US$ 6–7/mes) y conviene dejarla dentro del abono.

## Cómo se recalcula el mes que viene

```
node scratch/_anthropic-costos.mjs 2026-10-01 2026-10-31   # gasto real de Anthropic (Admin API)
node scratch/_contar-tokens-veredictos.mjs                 # tokens por veredicto (gratis)
```
y las consultas de las secciones 2 y 3 sobre `wa_messages`, `lead_eventos`,
`seguimiento_decisiones` e `interacciones_canal` con el rango nuevo.
