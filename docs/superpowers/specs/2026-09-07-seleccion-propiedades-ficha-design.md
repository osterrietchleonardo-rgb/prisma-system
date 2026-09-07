# Selección de propiedades → ficha para el cliente

**Fecha:** 2026-09-07
**Estado:** diseño aprobado por Leonardo, pendiente de plan de implementación
**Rama:** `feat/seleccion-propiedades-ficha`

## El problema

El asesor busca en el mapa o en el Buscador IA, encuentra cuatro propiedades que le sirven
para un cliente, y hoy solo puede compartirlas **de a una**: abre el detalle, toca
"Compartir ficha", copia el link, lo pega en WhatsApp, y repite cuatro veces. El cliente
recibe cuatro links sueltos, sin ningún hilo que los una y sin una palabra del asesor sobre
por qué eligió esas.

Lo que falta es poder decir "de todo lo que hay, estas cuatro son para vos", en **una sola
pieza con la marca de la inmobiliaria**.

## Lo que ya existe (y se reusa)

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Ficha pública de **una** propiedad | `app/api/ficha/share/route.ts` + `app/ficha/[token]/page.tsx` | El molde del snapshot `{ property, agent, agency, brand }`, la marca por agencia y la tarjeta de contacto del asesor |
| Ficha pública del **ACM** (varias) | `app/api/acm/ficha/route.ts` + `app/ficha-acm/[token]/page.tsx` | El molde de "varias propiedades en una ficha con token", la tabla `shared_acm_reports`, el tope de 12 y la barra flotante de selección |
| Modal de detalle **compartido** | `components/shared/consultor-results.tsx` (`UnifiedPropertyDetail`) | Lo usan el Buscador IA **y** el mapa (`components/mapa/mapa-ficha.tsx:26`) |
| Las 3 secciones del Buscador | `consultor-results.tsx:591` (`ConsultorResultsSection`) → `PropertySection:537` | Propias, agencia y red, las tres con la misma `UnifiedPropertyCard` |
| Marca de la agencia | `agencies.marketing_ai_config` | Colores, tipografía y logo; con default navy+dorado si no configuró |
| Proxy de fotos de la red | `lib/acm/fotos-url.ts` (`urlsFotoRed`) | El CDN de origen da 404 el 12% de las veces |

**El id es el mismo en las dos solapas:** `roomix_<slug>` para la red, el uuid para
`properties`. El endpoint actual ya acepta las dos formas, así que la selección no necesita
traducir nada entre el mapa y el chat.

**`roomix_properties` ya no es una tabla, es una vista** sobre `mercado_avisos`
(`supabase/migrations/20260902121500_corte_mercado_vista.sql:29`) que conserva `slug` e
`is_active`. Esta función no arrastra ninguna migración de datos.

## Las decisiones que tomó Leonardo

1. **Termina en "link copiado".** No manda el WhatsApp desde PRISMA. Esto saca del alcance
   la ventana de 24 h de Meta, las plantillas aprobadas y todo el subsistema de envío —
   que era el mayor riesgo de la función.
2. **La selección es de un solo uso.** Se marca, se genera el link, se termina. No se
   guarda para editar después. Mismo criterio que el ACM.
3. **Una sola selección para las dos solapas.** Lo marcado en el chat sigue marcado al
   pasar al mapa y al revés, y se manda todo junto en una ficha. Se vacía al salir de la
   página.

   > **Esta decisión se tomó dos veces, y la primera fue sobre una premisa falsa.** Se
   > había dicho que el mapa y el Buscador eran dos pantallas distintas y Leonardo eligió,
   > razonablemente, una selección por pantalla. **No son dos pantallas:** el mapa es una
   > solapa adentro de la página del Buscador —mismo componente, misma ruta, un botón
   > arriba que cambia entre "Buscador" y "Mapa" (`app/asesor/consultor-ia/page.tsx:284-308`)—
   > y `MapaTab` no se importa desde ningún otro lado. Con eso, compartir la selección pasó
   > a ser lo **barato** (un solo provider arriba de la solapa) y separarla, lo caro (dos
   > providers y vaciar uno al cambiar de solapa). Y separarla tenía un costo peor que el
   > trabajo: el asesor que marca cuatro en el chat y toca "Mapa" para ver dónde caen,
   > al volver las perdía.
4. **Las dos notas son opcionales:** una por propiedad y una final del grupo. **Si están
   vacías, no se dibujan** — ni el título, ni el recuadro, ni el espacio.
5. **La página es para el celular**, y tiene que verse bien también en la compu. **No hay
   botón de PDF ni versión para imprimir.**
6. **Se marca desde el listado y desde adentro del detalle, en las dos solapas.** En el
   Buscador, desde las tarjetas de las tres secciones —propia, agencia y red— y también
   desde el detalle si lo abrió. En el mapa, desde el popup que abre el pin y desde el
   detalle, pudiendo abrir varios pines uno tras otro e ir sumando.

7. **El asesor lee y corrige los textos antes de generar la ficha.** Ver la sección
   siguiente: es la decisión más importante que se tomó, y salió de un hallazgo.

## El hallazgo que cambió el diseño: la descripción delata al colega

Probando la ficha con datos reales apareció esto al final de una propiedad de la red:

> *Kinach, Gustavo Luis — Corredor Inmobiliario CUCICBA — Matrícula 1516*

El logo, el teléfono y los links del colega ya estaban tapados (§10.8). Lo que nadie había
mirado es que **la descripción del aviso la escribe la inmobiliaria que publica, y ahí adentro
mete su propia identidad**. Medido sobre los 60.278 avisos de la vista:

| | |
|---|---|
| 33.368 (**55%**) | dicen matrícula, CUCICBA, corredor inmobiliario o martillero |
| 25.489 (**42%**) | traen el nombre del publicador |
| 4.390 (**7%**) | invitan a contactarlo ("whatsapp", "contactanos", "llamanos") |

**Esto ya pasa hoy en producción**, en la ficha de UNA propiedad: verificado contra la base,
`shared_properties` y `shared_selections` guardan la misma descripción de 1350 caracteres con
el mismo nombre adentro.

**Por qué no se limpia solo.** Medido sobre 400 avisos: el nombre del publicador cae en el
MEDIO del texto en el 65% de los casos, y los formatos no se parecen entre sí. El caso que
cierra la discusión: en un aviso, "Goyena Bienes Raíces" matcheaba con **"Av. Pedro Goyena
1600"**, que es la calle de la propiedad. Un limpiador automático le habría borrado la
dirección al aviso. Una regla que borre lo suficiente rompe descripciones legítimas; una que
no rompa nada deja pasar fugas.

**La decisión de Leonardo:** *"si la limpieza es gratis y confiable sí; si no, antes de generar
la ficha se le muestran al asesor todos los textos que se incluirán para cada propiedad, y
tiene la posibilidad de editar/mejorar; cuando acepte, se genera."* No es confiable, así que
va la revisión — de **título y descripción de todas** las propiedades, de las tres fuentes.

**Cómo se resuelve, en dos niveles, y ninguno borra solo** (`lib/seleccion/textos.ts`):

- **Frases seguras** — las que dicen matrícula, CUCICBA, corredor, martillero, "no ejerce el
  corretaje", XINTEL o invitan a contactar. Se listan y el asesor las saca **de un toque**.
  Medido sobre 500 avisos reales: de los 329 con fuga evidente, **los 329 quedan limpios**, y
  se saca apenas el **7% del texto** en promedio.
- **Menciones al nombre del publicador** — solo se señalan, con el aviso de que puede ser el
  nombre de la calle. **Nunca entran en el sacado de un toque**, justamente por el caso Goyena.

> Ese "los 329 quedan limpios" prueba que el sacado por frases funciona completo, **no** que la
> lista de patrones sea exhaustiva. Por eso el asesor igual lee y edita: la máquina señala, la
> persona decide.

**Lo que no se puede arreglar con código:** en la foto de esa misma propiedad se ve un cartel
que dice "KINACH PROPIEDADES". Eso está en los píxeles del aviso.

## El diseño

### 1. Dónde se marca

**Se marca desde el listado y desde adentro del detalle, en las dos solapas.** El asesor
no tiene que abrir una propiedad para poder elegirla, pero si la abrió para mirarla bien,
tampoco tiene que cerrarla para marcarla.

Suena a muchos lugares. Son **tres componentes**, porque el código ya está unificado:

| Componente | Qué cubre |
|---|---|
| `components/mapa/mapa-resultados.tsx` (`MapaResultados`) | Los **tres** listados del mapa: el panel de la derecha (`mapa-tab.tsx:481`), el popup del pin con varias propiedades y el popup del globito — los dos últimos son el mismo `MapaListaModal`, que dibuja sus filas con este componente (`mapa-lista-modal.tsx:107`) |
| `consultor-results.tsx:82` (`UnifiedPropertyCard`) | Las **tres** secciones del Buscador: propia, agencia y red |
| `consultor-results.tsx:253` (`UnifiedPropertyDetail`) | El detalle abierto, en **las dos** solapas: el Buscador lo abre desde sus tarjetas y el mapa desde `MapaFicha` (`mapa-ficha.tsx:26`) |

En los dos listados, un **check en la esquina** de cada fila/tarjeta. En el detalle, un
botón que dice **"Agregar a la selección"** y, si ya está adentro, **"Sacar de la
selección"**.

Un pin que tiene **una sola** propiedad no abre popup: va derecho al detalle
(`mapa-tab.tsx:278`). Por eso el botón adentro del detalle no es un extra — para ese caso,
que es el más común en el mapa, es el único lugar donde se puede marcar.

> **Por qué no hay "modo selección" que haya que activar antes.** Se descartó: obliga a
> decidir que vas a armar una ficha *antes* de haber visto las propiedades, que es al revés
> de cómo se trabaja. Los checks y el botón están siempre.

**Dos trampas de implementación, anotadas acá para que no se descubran tarde:**

- Las filas de `MapaResultados` son hoy un `<button>` entero (`mapa-resultados.tsx:101`).
  Un check adentro de un botón es HTML inválido y el navegador se come uno de los dos
  clicks. La fila pasa a ser un `<div>` con dos zonas tocables separadas. Lo mismo en
  `UnifiedPropertyCard`, que es un `<div onClick>`: el check tiene que frenar la
  propagación o marcar abriría el detalle.
- El check tiene que medir **44px de lado tocable** en celular, aunque el dibujo sea más
  chico. Es exactamente el caso de "un botón que se ve pero no se toca" que ya pasó antes:
  la captura de pantalla no lo delata, hay que medir dónde cae el dedo.

### 1.b Dónde vive la selección

Un **contexto de React** (`SeleccionProvider`) montado **una sola vez por página, arriba de
la barra de solapas**, en los dos archivos donde vive el Buscador:
`app/asesor/consultor-ia/page.tsx` y `app/director/consultor/page.tsx`. Los tres
componentes de la tabla de arriba leen de ahí.

No es adorno arquitectónico: `MapaResultados` está a tres niveles de profundidad adentro
del popup del mapa, y `UnifiedPropertyDetail` lo abren la solapa del chat y la del mapa.
Pasar la selección por props obligaría a tocar la firma de cinco componentes.

Dos cosas salen gratis de montarlo ahí arriba:

- **La decisión 3** (una sola selección para las dos solapas): el provider está por encima
  del `view === "mapa" ? … : …`, así que cambiar de solapa no lo desmonta. Al salir de la
  página sí se desmonta, y la selección se vacía sola.
- **Ninguna otra pantalla hereda la función.** Si no hay provider, el check y el botón
  simplemente no se dibujan. Importa porque `UnifiedPropertyDetail` es un componente
  compartido y mañana puede usarlo otra pantalla que no tenga nada que ver con esto.

### 2. La barra flotante

Aparece abajo, centrada, en cuanto hay al menos una elegida:

```
3 elegidas   ·   Cancelar   ·   Continuar
```

Va **por portal al `<body>`**. No es prolijidad: adentro del contenedor del mapa las capas
de Leaflet valen de 400 a 700 y le ganan a cualquier `z-index`; está documentado en
`components/mapa/mapa-ficha.tsx:12` y es el mismo motivo por el que el ACM lo hace así.

"Cancelar" vacía la selección y pide confirmación si hay 3 o más (perder ocho propiedades
marcadas por un toque de más es caro).

### 3. El repaso antes de generar

"Continuar" abre la pantalla donde el asesor **lee y corrige lo que va a ver su cliente**.
Las elegidas van **en el orden en que se marcaron**, y de cada una:

- La foto de portada y el precio.
- El **título** y la **descripción**, editables. Lo que quede ahí es exactamente lo que se
  publica: el endpoint prioriza el texto revisado sobre el de la base, incluso si mientras
  tanto cambió, porque es el que el asesor aprobó.
- Si hay frases que identifican al colega, un recuadro ámbar que **las lista** y un botón
  para **sacarlas de un toque**. Si aparece el nombre del publicador, un aviso aparte que
  solo lo señala.
- Un campo de **nota opcional** suya, y un botón para sacar la propiedad.

Abajo de todo, la **nota final del grupo**, también opcional, y **"Crear la ficha"**.

Los textos se piden al servidor al abrir el repaso (`POST /api/seleccion/textos`): el
listado del mapa trae solo la portada, así que la descripción completa —que es justo la que
hay que revisar— no está en pantalla. Ese endpoint devuelve además el nombre del publicador,
**solo para señalar dónde mirar**; es de uso interno, como el teléfono del colega en la
tarjeta del Buscador, y nunca se guarda en el snapshot.

No hay arrastrar para reordenar. Se evaluó y no se hace todavía: es bastante trabajo (touch
+ mouse + accesibilidad) para un problema que el orden de marcado ya resuelve casi siempre.

### 4. Lo que ve el cliente

Página pública `/seleccion/[token]`, pensada para el teléfono y que se acomoda a la compu.

- **Barra superior** con el logo y el nombre de la inmobiliaria, en su color de marca. Se
  reusa `readableOn()` de `app/ficha/[token]/page.tsx:23` para que el texto sea legible
  sobre cualquier color que haya cargado la agencia.
- **Encabezado:** "Selección para vos" y la cantidad de propiedades.
- **Una tarjeta grande por propiedad:** galería que se desliza con el dedo, precio,
  ambientes, baños, m², dirección, descripción y características.
- **La nota del asesor, si la hay,** destacada dentro de la tarjeta de su propiedad. Es lo
  que convierte un listado en una recomendación.
- **Al final:** la nota del grupo si existe, y la tarjeta de contacto del asesor con su
  WhatsApp y su mail — se reusa la que ya tiene `/ficha/[token]`.

**Lo que NO va, y es deliberado:**

- **Ningún dato de la inmobiliaria que publica** una propiedad de la red: ni nombre, ni
  logo, ni teléfono, ni link al aviso original. Cualquiera de esos manda al cliente directo
  al colega. Regla ya decidida por Leonardo, escrita en `LOGICA-PRISMA.md` §10.8.
- **El % de coincidencia ni el badge de origen** (Mía / Agencia / Colaboración): son de uso
  interno del asesor.

### 5. Por dentro

**Tabla `shared_selections`**, calcada de `shared_acm_reports`
(`supabase/migrations/20260703120000_shared_acm_reports.sql`):

```
token       text PRIMARY KEY        -- base62 ~12 chars, ~71 bits
snapshot    jsonb NOT NULL          -- { properties[], nota_final, agent, agency, brand, created_at }
created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL
agency_id   uuid
view_count  integer NOT NULL DEFAULT 0
created_at  timestamptz NOT NULL DEFAULT now()
```

Con **RLS activado y sin políticas**: ni anon ni authenticated la tocan; la lee solo el
servidor con la service key. Más `increment_shared_selection_view(p_token)` como las otras
dos fichas.

Cada elemento de `properties[]` es el mismo objeto que hoy guarda `shared_properties`, con
un campo más: `nota` (string, puede faltar).

**Endpoint `POST /api/seleccion`**, con `requireTenant`, tope de **12** propiedades (el
mismo `MAX_FICHA` del ACM) y tope de **16 fotos** por propiedad (también del ACM: doce
propiedades con treinta fotos cada una no abre en el celular del cliente).

**Página `/seleccion/[token]`**: server component que lee con el admin client y suma la
vista, igual que `/ficha/[token]`.

### 6. El refactor que va incluido

Hoy la lógica que convierte "una propiedad de tal fuente" en el pedazo del snapshot vive
pegada dentro de `app/api/ficha/share/route.ts` — 90 líneas de `if (source === "roomix")`
con todas sus decisiones finas: el mapeo de campos, el proxy de fotos, la regla de no
filtrar datos del colega, los tres errores distintos (503 / 404 red / 404 cartera).

Se extrae a **`lib/ficha/snapshot.ts`** y la usan las dos fichas. Si no, la de una y la de
varias se desincronizan sin que nadie se entere: alguien arregla un campo en una y la otra
sigue mal. Es el tipo de mejora dirigida que corresponde hacer en el código que uno está
tocando, y no toca nada fuera de eso.

### 7. Los bordes

| Qué pasa | Qué hace |
|---|---|
| Una elegida se dio de baja entre marcarla y generar | La vista `roomix_properties` solo expone lo activo, así que desaparece. **La ficha se genera con las que quedaron** y se le dice al asesor cuáles no entraron y por qué. |
| No queda ninguna válida | No se genera nada y se lo explica. Nunca un link a una ficha vacía. |
| Una propiedad de otra agencia | Ya lo corta el filtro por `agency_id`, que se conserva tal cual. |
| Marca 13 | La barra avisa el tope al intentar la número 13, como el ACM. No se descarta ninguna en silencio. |
| Falla la consulta a la base | 503 "probá de nuevo en unos segundos" — distinto de "no existe". La distinción ya está resuelta en el endpoint actual y se conserva. |

## Cómo se prueba

Rama `feat/seleccion-propiedades-ficha`, en su propio worktree. Se levanta en local y se le
pasa el link a Leonardo.

Con **su** cuenta (PRISMAIA - VAKDOR), nunca con la de Central, y nunca entrando como un
asesor.

Casos, en el navegador de escritorio **y** en celular emulado:

1. Una sola elegida.
2. Doce elegidas (el tope), y el aviso al intentar la trece.
3. Sin ninguna nota → la ficha no muestra ningún recuadro ni espacio vacío.
4. Con las dos notas cargadas.
5. Mezcla de las tres fuentes: propia, agencia y red.
6. Una de la red dada de baja → se genera con el resto y avisa.
7. En el mapa, los **cuatro** caminos de marcado, y que los cuatro sumen a la misma
   selección: el check en el panel de la derecha, el check en el popup de un pin con
   varias, el check en el popup del globito, y el botón adentro del detalle de un pin con
   una sola. Abrir un pin, sumar, cerrar, abrir otro, sumar, y generar.
8. En el Buscador, los **dos** caminos: el check en la tarjeta y el botón adentro del
   detalle. De las tres secciones, y de dos búsquedas distintas del mismo chat.
9. Que marcar desde el check **no** abra el detalle, y que tocar la fila **sí** lo abra.
   Las dos cosas, en compu y en celular.
10. Que lo marcado en un lado se vea marcado en el otro: marcar en el listado, abrir el
    detalle, y que el botón ya diga "Sacar de la selección".
11. En el celular: que la barra flotante no tape el último resultado de la lista.
12. **Que la selección cruce las solapas:** marcar dos en el chat, tocar "Mapa", marcar una
    tercera, volver a "Buscador", y que sigan las tres. Y que salir de la página y volver
    la deje vacía.

## Lo que queda afuera a propósito

- **Mandar el WhatsApp desde PRISMA.** Decisión 1. Si más adelante se quiere, el camino es
  una plantilla aprobada por Meta que lleve el link como variable — y eso es un trámite con
  Meta, no código.
- **Guardar la selección para editarla después.** Decisión 2.
- **PDF / versión para imprimir.** Decisión 5.
- **Arrastrar para reordenar.**
- **Saber si el cliente la abrió.** `view_count` se guarda igual (viene con el molde), pero
  no se muestra en ninguna pantalla. Es la base si algún día se quiere.
