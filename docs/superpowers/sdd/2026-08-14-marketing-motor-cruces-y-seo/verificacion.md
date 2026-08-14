# Verificación end-to-end — motor de cruces, clusters y SEO

> 14-ago-2026. Rama `feat/marketing-motor-cruces-y-seo`.
> Diseño: `docs/superpowers/specs/2026-08-14-marketing-motor-cruces-y-seo-design.md`
> Plan: `docs/superpowers/plans/2026-08-14-marketing-motor-cruces-y-seo.md`

## Resumen

Las 11 tareas del plan quedaron implementadas y verificadas. El motor produce piezas con
territorio, propósito, estructura compatible y escenas del momento que corresponde a la etapa del
embudo. **Aparecieron dos hallazgos**, uno propio del sistema nuevo y otro preexistente
(secciones 6 y 7).

## 1. Pruebas automáticas

| Suite | Resultado |
|---|---|
| App (`npm test`, los **dos** runners: vitest + `node --test lib/mapa`) | 158 pruebas, todas en verde |
| Worker (`node --test`) | 74 pruebas, todas en verde |
| `npx next build` | Compila sin errores |

Se agregaron 40 pruebas nuevas. Las de prompts corren con un **cliente falso** (`content.mjs`
recibe el cliente de Anthropic por parámetro), así que verifican el prompt real sin gastar una
sola llamada paga.

## 2. Corrida real del worker

Se insertaron 3 ideas de prueba, una por etapa del embudo, con territorios y propósitos distintos.
Antes de insertarlas se verificó que **no hubiera nada en `en_proceso`**, para que el worker no
tocara trabajo real.

| Pieza | Embudo | Territorio | Propósito | Estructura elegida | Revisión |
|---|---|---|---|---|---|
| 1 | tofu | leads_inmobiliarios | convencer | `concesion_vuelta` | aprobada, 0 reintentos |
| 2 | mofu | equipo_y_asesores | ensenar | `framework_pasos` | 1 reintento, marcada |
| 3 | bofu | kpis_y_gobernanza | probar_con_dato | `autopsia` | aprobada, 0 reintentos |

**Las 3 estructuras son distintas y cada una es compatible con su propósito**, incluida
`framework_pasos`, que es la que se agregó en esta pasada.

## 3. Escenas: momento y área

| Pieza | Escena 1 (momento esperado) | Escena 2 (libre) |
|---|---|---|
| 1 · tofu | `dolor` ✓ — El presupuesto que nunca se pregunta (ventas) | `intento_fallido` — Publicar en más portales (pauta) |
| 2 · mofu | `intento_fallido` ✓ — El manual de procesos en PDF (equipo) | `resuelto` — Todos contestan igual sin guion (equipo) |
| 3 · bofu | `resuelto` ✓ — El seguimiento no depende de quién esté (equipo) | `intento_fallido` — El CRM nuevo que duró dos meses (equipo) |

- La primera escena respetó el momento de la etapa en las 3 piezas.
- La segunda dio contraste en las 3 (nunca dos escenas del mismo tono).
- Las 6 escenas son distintas entre sí.
- **El sesgo por área funcionó**: las 6 cayeron dentro de las áreas afines al territorio de su
  pieza (`leads_inmobiliarios` → ventas + pauta_marketing; los otros dos → equipo).

## 4. Reglas del embudo

| Pieza | Link en el cuerpo | Link en el comentario | Nombra PRISMA |
|---|---|---|---|
| 1 · tofu | no ✓ | no ✓ | no ✓ |
| 2 · mofu | no ✓ | no ✓ | sí ✓ (el mecanismo) |
| 3 · bofu | **no** ✓ | **sí** ✓ | no |

Se cumple exactamente: el link de la demostración aparece únicamente en el primer comentario de la
pieza BOFU, y en ningún cuerpo de post.

## 5. La revisión hizo su trabajo

La pieza 2 no pasó la rúbrica: el juez detectó que repetía el argumento central de una pieza
anterior ("varios asesores responden distinto a la misma consulta"), aunque cambiara la escena.
Se reescribió una vez, siguió repitiendo, y quedó marcada con `aprobado: false` y el motivo
guardado — **en vez de publicarse en silencio**. Es el comportamiento buscado.

## 6. HALLAZGO: las piezas inventan nombres de personas

Dos de las tres piezas inventaron nombres propios de asesores. Textual:

- **Pieza 3 (bofu):** *"Rodríguez cuenta reservas firmadas. Marina cuenta boletos. El tercero te
  pasa las comisiones que cobró él este mes, aunque la operación se cerró en marzo."*
- **Pieza 2 (mofu):** *"Sofía, tu asesora estrella, cierra una visita para el sábado."*

De la pieza 1 solo se leyó la apertura (sin nombres) antes de borrarla, así que **no se verificó
entera**. El hallazgo se sostiene sobre 2 casos confirmados, no 3.

El canon prohíbe explícitamente inventar "casos con nombre" (punto 4). El texto llega al prompt de
escritura, pero **la rúbrica de revisión no tiene ningún criterio que lo controle**: sus 7 puntos
miran escena concreta, posición, giro, detalles, repetición, CTA y muletillas. Nada verifica que no
se inventen datos, así que la regla existe pero nadie la hace cumplir.

Riesgo real: bajo (se leen como ilustrativos, no como clientes reales), pero contradice una regla
dura del sistema.

**Recomendación:** sumar un criterio a la rúbrica. Tiene un costo: cada criterio nuevo aumenta la
probabilidad de reintento, y cada reintento es una llamada paga. Por eso no se aplicó sin decisión
previa — es el mismo criterio con el que la keyword se limitó solo a los artículos de blog.

**Lo que sí funcionó:** la pieza 3 tenía propósito `probar_con_dato` y **no inventó ninguna
estadística**. El resguardo escrito en el propósito ("si no tenés un número real, cambiá el ángulo
a una observación cualitativa") se respetó.

## 7. HALLAZGO PREEXISTENTE: dos errores en el navegador

Al abrir el panel aparecen 2 errores de consola: un error de hidratación de React en
`SeccionProgramacion`, por una fecha que el servidor y el cliente formatean distinto
(`06/08/2026, 09:41 a. m.` en los dos lados, pero con distinta representación interna).

**No lo causó este trabajo:** `git diff main..HEAD` confirma que no se tocó `SeccionProgramacion`
ni `formatearFechaLocal` ni ninguna función de formato de fecha. React se recupera solo
(cae a renderizado en cliente), así que es cosmético, pero conviene arreglarlo aparte.

## 8. Navegador

**Escritorio (1440×900):** verificado con login real.

- La tarjeta de una pieza nueva muestra `TOFU` + `Leads inmobiliarios` + `Opinion fuerte`.
- Las ideas anteriores a esta versión se ven **sin** esos badges y el tablero no se rompe:
  la tolerancia a `null` funciona.
- El calendario tiene el filtro **"Todos los territorios"**.
- El bloque **"Oportunidades SEO · posición 4-20"** muestra datos reales.

**El filtro de oportunidades demostró su criterio con datos reales.** De las 3 búsquedas que
devuelve Search Console, descartó dos y dejó una:

| Búsqueda | Posición | Impresiones | ¿Entra? |
|---|---|---|---|
| kaudal | 64 | 1 | No — muy abajo, no alcanza con mejorar |
| vaskedotad | 5 | 1 | No — una sola impresión es ruido |
| **se pierden leads inmobiliarios** | **6,6** | **13** | **Sí** → `/blog/por-que-pierdes-leads-inmobiliarios` |

**Celular (390×844, emulación de dispositivo):** el panel se corta porque la barra lateral es de
ancho fijo. **Es preexistente y afecta a todo el panel admin, no solo a Marketing**:
`app/admin-vakdor/layout.tsx` no tiene ninguna media query ni breakpoint (verificado: 0
coincidencias), y este trabajo no tocó ningún layout. Los badges nuevos van en un contenedor con
`flexWrap`, así que no agregan desborde propio.

## 9. Limpieza

Las 3 ideas de prueba se borraron. El tablero volvió exactamente a su estado previo:

| Estado | Antes | Después |
|---|---|---|
| idea | 6 | 6 |
| en_proceso | 0 | 0 |
| en_revision | 9 | 9 |
| publicada | 23 | 23 |
| rechazada | 15 | 15 |

Las 3 portadas que había generado el worker quedaron huérfanas en el bucket `blog-images` y se
borraron. Se encontraron cruzando las carpetas `linkedin/<id>/` del bucket contra los ids vivos de
`marketing_ideas`:

| Archivo | Creado | Acción |
|---|---|---|
| `linkedin/739531ba…/portada.png` | 14-ago 18:15 | borrado |
| `linkedin/d3887b5d…/portada.png` | 14-ago 18:16 | borrado |
| `linkedin/4de56bec…/portada.png` | 14-ago 18:17 | borrado |
| `linkedin/895b1b89…/portada.png` | **18-jul** 06:00 | **se dejó** — es de la sesión de julio, no de esta prueba |

## 10. Pendientes anotados

- **Decidir sobre el hallazgo 6** (criterio de "no inventar" en la rúbrica). Es el único pendiente
  que sale de este trabajo.
- **`ANTHROPIC_API_KEY` en Vercel: confirmado por Leo el 14-ago-2026.** Queda solo EasyPanel sin
  confirmar (no se puede chequear desde acá).
- **El worker no está en git.** Sus cambios se versionan como copias en
  `docs/interno/worker-snapshots/`. Si esa carpeta de `Prisma - MK` se pierde, el snapshot es la
  única copia.
- **Una portada huérfana de julio** sigue en el bucket (ver tabla de arriba). No es de este trabajo.
