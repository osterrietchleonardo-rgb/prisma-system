# Agente de propietarios (captación) — diseño (16/9/2026)

> Disparador: sugerencia de Yanil Torres (asesora de Central, 9/9): que al cargar en el tracking
> semanal → Prospección → "Dueño vende", el asistente haga seguimiento cada 15 días con plantillas
> distintas, genere conversación, detecte objeciones ("no trabajo con inmobiliarias", honorarios),
> y busque llevar al propietario a una reunión presencial.
>
> Decisión de Leonardo (16/9): no hacerlo con plantillas y listo. **Construir desde cero, en el
> código de PRISMA, un agente propio de propietarios** con la arquitectura que venimos definiendo
> (grafo determinista + nodo agéntico, capas, herramientas, diálogo, ultracalificación, derivación,
> seguimiento y trazabilidad). El bot de compradores sigue en n8n.
>
> Depende del runtime definido en `2026-09-15-agente-conversacional-design.md` (ventana, candado,
> guardarraíles, traza). Este documento define QUÉ agente se construye sobre ese runtime.
> **Nada aprobado para construir**: cada fase arranca con su OK.

---

## 1. Por qué este agente primero

| | Bot de compradores (n8n) | Agente de propietarios (nuevo) |
|---|---|---|
| Volumen | 122 mensajes de clientes por día | 7 fichas "Dueño Vende" en septiembre |
| Riesgo si falla | Central deja de atender leads reales | Un asesor manda el mensaje a mano, como hoy |
| Vara | igualar 59 mil caracteres de prompt afinados 6 meses | no existe: hoy no hay nada |
| Qué valida | el reemplazo | **el mismo motor que después reemplaza al bot** |

Es el piloto ideal: construye el runtime nuevo con volumen bajo, sin paridad que igualar y sin un
cliente en vivo colgando de él. Lo que se aprenda acá baja después al agente de compradores.

Datos del 15-16/9 (medidos): 12 fichas de prospección en septiembre, 7 con origen "Dueño Vende",
cargadas por tres asesoras distintas (Yanil Torres, Matías Di Leo, Ana Castagnino). Cada ficha ya
trae nombre, celular verificado (doble verificación + certificación), dirección, barrio, y a veces
el detalle del aviso (`zonaprop`, `150 días publicación`, `643 visualizaciones`). El contacto queda
en `wa_contacts` con la etiqueta `DUEÑO VENDE` y crea una conversación **vacía**: nadie escribió
desde PRISMA y el dueño nunca escribió. El número de Central está sano (tier 2K, 688 leídos y 3
fallidos en 30 días) después del bloqueo de julio.

**Consecuencia dura:** el primer mensaje es contacto en frío. Meta exige permiso previo y respetar
la baja ([política](https://business.whatsapp.com/policy),
[opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)).
Por eso el primer toque lo habilita el asesor que prospectó, con plantilla propia y baja explícita.

---

## 2. Qué es este agente

**Objetivo primario:** que el propietario acepte una reunión con el asesor (pasar de `prospección` a
`prelisting` en el tablero, que ya existe).
**Objetivo secundario, igual de valioso:** dejar la propiedad **ultracalificada** en PRISMA, lista
para el ACM y para la ficha de captación.
**Lo que NO es:** un vendedor. No tasa por WhatsApp, no negocia honorarios, no promete valores.

### 2.1 Las capas

1. **Elegibilidad (determinista).** Quién entra (ficha con origen "Dueño Vende" + contacto
   verificado + asesor asignado), horario 6-23, topes diarios, baja, y el OK del asesor para el
   primer toque.
2. **Decisión de cuándo tocar.** El Super Agente de seguimiento con un "juego" propio: contactar
   hoy / posponer / abandonar / escalar, eligiendo entre las plantillas de propietarios.
3. **Diálogo.** El agente conversacional (runtime del 15/9) con prompt y herramientas de captación.
4. **Ultracalificación.** Después de cada turno, la charla se convierte en campos duros (§3).
5. **Guardarraíles.** Lo que nunca se dice ni se hace (§5).
6. **Traza y medición.** Un turno, una fila: herramientas, razón, tokens, costo, resultado (§7).

### 2.2 El grafo

```
A) Ficha "Dueño Vende" cargada          B) El dueño responde                 C) Silencio
   ↓                                       ↓                                    ↓
   candidato de captación                  ventana 45 s + candado               reloj del seguimiento
   ↓                                       ↓                                    ↓
   el asesor aprueba el 1er toque          contexto (ficha + charla + zona)     ¿toca el 2º/3er toque?
   ↓                                       ↓                                    (15 y 30 días, tope 3)
   plantilla de propietarios               AGENTE (loop con herramientas)       ↓
                                           ↓                                    plantilla distinta
                                           guardarraíles → responder            o abandonar
                                           ↓
                                           ultracalificación + aviso al asesor
```

---

## 3. Ultracalificación del propietario

Dos bloques. El primero es lo que **el ACM ya exige** para tasar (`lib/tasacion/types.ts`, `Sujeto`);
el segundo es lo que decide si es negocio, y sale del propio tracking de la agencia.

**De la propiedad** (mínimo para correr un ACM: dirección + barrio + superficie):
dirección · barrio · tipo · m² cubiertos / semicubiertos / descubiertos (o terreno) · ambientes ·
dormitorios · baños · antigüedad o estado de obra (a estrenar / en pozo) · cochera · piso ·
orientación · disposición · amenities · estado de conservación (de las fotos, si las manda).

**Del dueño y la operación** (lo que hoy el asesor carga a mano en la ficha):
motivo de la venta · plazo · precio pretendido y cómo lo definió · hace cuánto está publicada y en
qué portales · consultas, visitas y ofertas recibidas · si trabaja con otra inmobiliaria y en qué
condición (`Exclusiva` / `No Exclusiva`, que ya es un campo del tracking) · quién decide (cotitulares,
sucesión) · ocupación (vacía, inquilino) · documentación (escritura, deuda, hipoteca) · si compra
algo después · disposición a una reunión.

Cada dato se guarda donde ya vive: los de la propiedad en el sujeto del ACM, los de la operación en
`metricas` de la conversación y en la `metadata` de la ficha (misma regla de nombres que el bot de
compradores: la clave que escribe el extractor es la que lee el prompt, carácter por carácter).

**Regla de oro:** no es un interrogatorio. Un dato por turno como mucho, y solo si la conversación
lo pide. El agente prefiere quedarse sin un dato antes que sonar a formulario.

---

## 4. Herramientas

| Herramienta | Qué hace |
|---|---|
| `leer_ficha_de_prospeccion` | lo que cargó el asesor: dirección, barrio, portal, detalles del aviso |
| `ver_la_zona` | qué se publica hoy en ese barrio y en qué rango de valores (cartera + mercado). Para conversar con datos, **nunca para dar una tasación** |
| `guardar_calificacion` | escribe los campos duros de §3 |
| `proponer_reunion` | ofrece franjas del asesor y deja la reunión pendiente de confirmación |
| `avisar_al_asesor` | el dueño respondió algo que el asesor tiene que ver hoy |
| `derivar_a_humano` | apaga el agente y se lo pasa al asesor, con el resumen |
| `responder` | cierre obligatorio del turno |
| más adelante: `enviar_informe_de_zona` | el ACM ya genera la ficha en PDF; es el gancho más fuerte que tenemos |

Los ids (agencia, conversación, contacto, asesor) los inyecta el código. El modelo nunca los escribe.

---

## 5. Guion y guardarraíles

De la sugerencia de Yanil, convertida en reglas duras que valida el código, no el modelo:

| Situación | Qué hace |
|---|---|
| "No trabajo con inmobiliarias" | pregunta qué le pasó antes, con empatía. **Prohibido rebatir o vender** en ese turno |
| "¿Cuánto cobran?" / "cobran mucho" | no da porcentajes ni negocia por chat: lleva a la reunión donde se explica el trabajo |
| "¿Cuánto vale mi propiedad?" | **nunca tasa por WhatsApp**. Ofrece el informe de la zona o la visita |
| "Ya tengo inmobiliaria" | pregunta la condición y hasta cuándo, deja la puerta abierta, no compite ahí |
| "No me escribas más" | baja inmediata, registro, y nunca más un toque automático |
| Ofertas o visitas recibidas | lo registra y avisa al asesor: es señal de que el dueño está activo |
| Dato que no tiene | lo dice una vez y sigue. Prohibidas las promesas ("lo averiguo y te aviso") |

Más los del runtime: nunca silencio, nada inventado, todo efecto una sola vez, todo con la agencia
en el filtro.

---

## 6. Cadencia y modo sombra con humano en el lazo

- Toques a los 0, 15 y 30 días, plantillas distintas, y corte. Si contesta, manda el diálogo.
- **La sombra acá es distinta**: como no hay bot actual contra el cual comparar, el agente redacta
  y **el asesor aprueba, edita o descarta con un toque**. Se mide qué porcentaje sale sin cambios.
  Cuando ese número se sostiene alto, el primer toque pasa a automático y el asesor queda solo para
  las señales. Es sombra real, medible, y de paso entrena al equipo.

---

## 7. Medición

Cuántos responden · cuántos aceptan reunión · cuántas captaciones · objeciones por tipo · campos de
§3 completados por conversación · mensajes aprobados sin cambios · costo por captación. Sin esto no
se sabe si el agente sirve, y es lo que hoy nadie puede contestar.

---

## 8. Fases

| Fase | Qué |
|---|---|
| 0 | Plantillas de propietarios aprobadas en Meta, segmento "Propietario - Dueño vende", aviso al asesor con el mensaje listo. **Sin IA**: mide si los dueños responden |
| 1 | El runtime de turnos (ventana, candado, traza) corriendo con propietarios, con el asesor aprobando cada mensaje |
| 2 | Ultracalificación + objeciones + propuesta de reunión |
| 3 | Automático con guardarraíles; el asesor entra por señal |
| 4 | Lo aprendido baja al agente de compradores (plan del 15/9) |

---

## 9. Decisiones de Leonardo

1. ¿El primer toque siempre con OK del asesor? (recomendado: sí)
2. Cuando el dueño responde, ¿conversa el agente o va directo al asesor en la fase 1? (recomendado:
   conversa, con el asesor aprobando cada mensaje)
3. ¿Se ofrece el informe de zona del ACM como gancho? (recomendado: sí, es lo que nos diferencia)
4. ¿Arrancamos con las 7 fichas reales o esperamos a juntar 20? (recomendado: las 7, una por una)
