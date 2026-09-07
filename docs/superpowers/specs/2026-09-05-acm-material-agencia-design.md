# Material de la agencia dentro del ACM — diseño

Fecha: 2026-09-05
Estado: diseño aprobado. Falta escribir el plan de implementación.

## El problema

La ficha del ACM que recibe hoy el propietario justifica muy bien el precio —
comparables, matriz, Pirámide del Precio, conclusiones — pero no dice **quién** se lo
está diciendo ni **qué va a pasar después**. El propietario recibe un número muy bien
fundado de una agencia sobre la que el documento no cuenta nada.

Las inmobiliarias ya tienen ese material escrito. Central tiene tres PDF
(`Our Company 2025`, `Nueva bienvenida Experiencia CentralRE`, `20 PASOS 2025`) que
hoy manda por separado, o no manda.

## Qué se construye

Una solapa **Configuración** dentro del módulo de ACM, donde el director de cada
agencia carga su propio material institucional. Ese material se inserta en la ficha
del ACM en cuatro lugares fijos. **Si la agencia no carga nada, la ficha sale
exactamente como sale hoy.**

Es opcional por agencia y opcional por sección: cada una de las cuatro se muestra
solo si tiene texto cargado. Y todo es editable para siempre: los archivos se pueden
reemplazar cuando sea, y el texto se puede corregir a mano cuando sea.

## Lo que ya existe y se reusa

Todo el cableado está construido y probado. Esto es un agregado, no una obra nueva.

| Pieza | Dónde | Qué aporta |
|---|---|---|
| `agencies.marketing_ai_config` (jsonb) | `app/api/marketing-ia/settings/route.ts` | Config por agencia. GET libre, POST solo director. |
| Armado del `brand` de la ficha | `app/api/acm/ficha/route.ts:239-244` | Ya lee ese mismo jsonb y arma colores, logo, tipografía y aviso legal. |
| Snapshot congelado | `shared_acm_reports.snapshot` | La ficha emitida no cambia nunca más. |
| Render de la ficha | `app/ficha-acm/[token]/page.tsx` | Portada, entorno, comparables, matriz, pirámide, conclusiones, contacto. |
| Extracción de texto de PDF/Word | `app/api/contratos/convert-template/route.ts` | `pdf-parse-fork` y `mammoth`, ya en `package.json`. |
| Subida por agencia a Storage | `app/api/marketing-ia/settings/upload-logo/route.ts` | Patrón de upload con `createAdminClient`. |
| Consumo de créditos IA | `consumeAiCredits(feature, amount, resumen)` | `feature` es un string libre. |

Nota aparte, verificada: `brand.legal_notice` **ya existe y ya se imprime al pie de
cada hoja de la ficha** (`page.tsx:86`). No hay que construir nada para eso: alcanza con
que la agencia cargue ese campo en Marketing IA. Qué texto pone es decisión suya.

## Decisiones tomadas

1. **Lo que manda es el texto guardado, no el archivo.** El archivo es la fuente para
   generarlo, pero lo que la ficha muestra es el texto que quedó guardado y aprobado.
2. **La IA propone, el director decide. Siempre.** Ninguna operación de IA escribe
   directo sobre lo guardado: propone, se muestra al lado de lo actual, y el director
   acepta o descarta. Esto vale tanto al subir un archivo como al pulir a mano.
3. **Las cuatro secciones son fijas.** La IA no puede inventar secciones nuevas. Si
   pudiera, cada propietario recibiría una ficha con una forma distinta.
4. **Van siempre todas las cargadas.** Sin switches por ACM: el asesor no tiene que
   acordarse de nada y la agencia controla su mensaje de punta a punta.
5. **Se copia solo el texto.** Los gráficos, fotos y logos de los archivos subidos no
   pasan a la ficha. La ficha se dibuja con la marca de la agencia.
6. **Nada es definitivo.** Archivos y texto se cambian en cualquier momento, sin
   límite de veces.

### Por qué no se muestran las carillas del PDF tal cual

Se evaluó mostrar cada carilla como imagen, para conservar el diseño original de la
agencia. Se descartó: el carpetón de Central pesa 21 MB y son seis carillas de imagen.
La ficha se volvería inusable en el celular, y el diseño ajeno chocaría con el resto
de la ficha, que está maquetada por PRISMA. La contra asumida es real: se pierden los
gráficos propios de la agencia, como la torta de origen de compradores.

### Por qué los archivos no se atan a una sección

Un mismo archivo alimenta varias secciones: el carpetón "Nueva bienvenida" de Central
cubre tres de las cuatro. Atar un archivo a una sección obligaría a subir el mismo PDF
tres veces. Por eso los archivos son una lista común, y el conflicto que eso genera
—reemplazar un archivo puede pisar una sección ya corregida a mano— se resuelve con
la aceptación por sección descrita más abajo, no evitando el problema.

## Estructura de datos

Dentro de `agencies.marketing_ai_config`, una clave nueva:

```json
"acm_material": {
  "archivos": [
    {
      "id": "uuid",
      "nombre": "Nueva bienvenida Experiencia CentralRE.pdf",
      "path": "<agencyId>/<uuid>.pdf",
      "subido_el": "2026-09-05T14:20:00Z"
    }
  ],
  "secciones": {
    "quienes_somos":        "",
    "como_comercializamos": "",
    "como_preparar":        "",
    "roles_venta":          ""
  }
}
```

`secciones` es lo único que llega a la ficha. Vacío o ausente = esa sección no se
dibuja. La clave `acm_material` entera ausente (toda agencia de hoy) = la ficha sale
como siempre.

`archivos` es interno de la configuración. **No viaja al snapshot**: el propietario no
tiene por qué recibir los nombres de los archivos internos de la agencia.

Los archivos van a un bucket propio, `acm-material`, con la ruta
`<agencyId>/<uuid>.<ext>` — separados de `contratos` (documentos legales) y de
`marketing-images` (piezas gráficas), que tienen otro ciclo de vida.

El bucket es **privado**: nadie muestra esos archivos, ni la ficha ni la pantalla de
configuración. El único que los abre es el servidor, con el cliente admin, cuando el
director toca *Volver a leer*. Por eso se guarda la ruta interna y no una URL pública.

Quitar un archivo de la lista **no borra** el texto que ya se aceptó a partir de él.
El texto aprobado es independiente de su origen.

Topes de largo, con contador en pantalla como el que ya tiene `legal_notice`:

| Campo | Tope |
|---|---|
| `quienes_somos` | 1200 |
| `como_comercializamos` | 1800 |
| `como_preparar` | 1500 |
| `roles_venta` | 500 |

El tope existe para que la ficha siga siendo una valuación y no se convierta en un
folleto donde el propietario nunca llega al precio.

## Dónde aparece en la ficha

| Sección | Lugar exacto |
|---|---|
| Quiénes somos | Hoja 2 — después de la portada, **antes** de la valuación. |
| El rol de cada uno en la venta | Hoja final, pegado a la Pirámide del Precio. |
| Cómo comercializamos su propiedad | Después de las conclusiones, antes de la tarjeta de contacto. |
| Cómo preparar su propiedad | Última hoja. |

Todo dibujado con el logo, los colores y la tipografía de esa agencia, igual que el
resto de la ficha.

## La pantalla de configuración

Va en el **módulo de ACM**, como una tercera solapa junto a "Nuevo ACM" y "Mis ACM".
Ahí es donde el director está cuando piensa en cómo sale la ficha; obligarlo a irse a
Marketing IA para configurar el ACM es mandarlo a otro lado a mitad de una idea.

**Solo la ve el director.** `AcmModule` lo comparten asesor y director
(`app/director/acm/page.tsx` importa el mismo componente), así que la solapa se
habilita con una prop que solo pasa la página del director. Los endpoints igual
rechazan a cualquier otro rol: la solapa oculta es comodidad, el 403 es la defensa.

### Lo que viene de Marketing IA, se muestra pero no se edita

Arriba de todo, una tarjeta informativa de solo lectura con la marca que la ficha ya
usa: los colores, el logo y el aviso legal. Con una línea que aclara de dónde salen y
un enlace a Marketing IA → Configuración para cambiarlos.

Sirve para que el director entienda por qué la ficha se ve como se ve, y para que sepa
que el aviso legal existe y dónde se edita. Qué texto pone ahí es decisión de cada
agencia: la pantalla informa si está cargado o no, nada más.

### Guardar sin pisar la marca

El `POST /api/marketing-ia/settings` que ya existe **reemplaza el jsonb completo**
(`update({ marketing_ai_config: config })`). Guardar desde el ACM mandando solo el
material borraría los colores, el logo y el aviso legal de la agencia.

Por eso el material tiene su propio endpoint, que lee el jsonb actual, le cambia
únicamente la clave `acm_material` y lo vuelve a guardar. El merge se hace en el
servidor, no en el navegador: así dos pestañas abiertas no se pisan entre sí.

### La guía de qué subir

El texto guía es parte del diseño, no un adorno. Sin él, el director no sabe qué
archivo de su carpeta corresponde y la función queda vacía.

Encabezado de la tarjeta:

> **Material para el ACM** (opcional)
>
> Lo que tu inmobiliaria le cuenta al propietario dentro del informe de valuación.
> Si no cargás nada, el ACM sale como siempre.
>
> Arrastrá acá los PDF o Word que ya usás con tus propietarios — podés subir varios
> juntos. PRISMA lee el texto, lo reparte en las cuatro secciones de abajo, y vos lo
> corregís antes de guardar. Si preferís, escribilas a mano y no subas nada.
>
> **Se copia solo el texto.** Los gráficos, las fotos y los logos de tus archivos no
> pasan: la ficha los dibuja con los colores y el logo de tu agencia.

### La lista de archivos

Debajo del encabezado, la lista de lo que hay cargado hoy. Por cada archivo: nombre,
fecha de subida, y dos acciones — **Reemplazar** y **Quitar**. Abajo de todo,
**Agregar archivo**. Sin límite de cantidad; tope de 25 MB por archivo, el mismo de
Contratos.

Cuando la lista cambia (se agrega, se quita o se reemplaza algo), aparece el botón
**Volver a leer con IA**. No se dispara solo: el director decide cuándo.

### Los cuatro cuadros

Cada sección es un cuadro de texto editable, siempre, con su contador de caracteres.
Debajo del título, la guía de qué subir, y una línea que dice dónde va a salir en la
ficha ("Sale en la hoja 2, antes del precio"), para que el director entienda qué está
armando.

| Sección | Texto de ayuda |
|---|---|
| Quiénes somos | *Qué subir: la carpeta de presentación, el "quiénes somos" de tu web, o el brochure que le das al cliente en la primera reunión.* |
| Cómo comercializamos su propiedad | *Qué subir: tu plan de marketing — en qué portales publicás, cómo trabajás con otras inmobiliarias, cada cuánto le informás al propietario.* |
| Cómo preparar su propiedad | *Qué subir: la guía de cómo preparar la casa para las muestras — orden, luz, limpieza, qué hacer el día de la visita.* |
| El rol de cada uno en la venta | *Qué subir: el cuadro de quién define qué — quién pone el precio de oferta, quién el estado de la propiedad, quién el plan de marketing y quién termina definiendo el precio final.* |

Cada cuadro tiene además un botón **Acomodar con IA**: toma lo que el director
escribió a mano y lo deja redactado para el ACM, respetando lo que dice. El resultado
se muestra para aceptar o descartar; nunca reemplaza el texto sin que él lo vea.

## Los dos caminos para actualizar

Ambos terminan igual: una propuesta que el director acepta o descarta por sección.

### Camino A — cambió un archivo

1. El director agrega, quita o reemplaza archivos en la lista.
2. Toca **Volver a leer con IA**.
3. El servidor extrae el texto de **todos** los archivos de la lista
   (`pdf-parse-fork` para PDF, `mammoth` para DOCX) y Gemini lo reparte entre las
   cuatro secciones.
4. La pantalla muestra, en cada sección, el texto **nuevo propuesto** al lado del
   **actual**, con un botón *Usar este* por sección.
5. El director acepta las que quiera. Las que no acepte quedan intactas, incluidas las
   que había corregido a mano.
6. Recién al guardar se escribe en `marketing_ai_config`.

### Camino B — editó el texto a mano

1. El director escribe o corrige directamente en el cuadro. Puede guardar así, sin IA.
2. Si quiere, toca **Acomodar con IA** en esa sección.
3. Gemini reescribe *ese* texto en tono de ficha para propietario, sin agregar
   información que el director no haya puesto.
4. Se muestra el resultado al lado del suyo. Acepta o descarta.

Los archivos originales quedan en Storage y son la fuente del camino A, así que se
puede volver a leer las veces que haga falta sin volver a subir nada.

Consumo de créditos: `consumeAiCredits("acm_material", 1, ...)` en cada *Volver a
leer* y en cada *Acomodar con IA*. Es por operación de IA, nunca por ACM generado.

### Las dos reglas duras del prompt

1. **Si no encuentra material para una sección, la deja vacía.** Nunca inventa. El
   PDF de Central casi no habla de "roles" más allá de un cuadro; ese campo tiene que
   volver vacío y que el director decida, no relleno con algo verosímil. En el camino
   B, la regla equivalente: acomoda lo que el director escribió, no le agrega datos.
2. **Siempre devuelve español rioplatense.** "Our Company 2025" tiene medio contenido
   en inglés.

## Qué NO se toca

- La valuación entera: comparables, matriz, Pirámide del Precio, conclusiones y la
  hoja del entorno no cambian una línea.
- El snapshot sigue congelando. **Una ficha ya enviada no se modifica** si mañana la
  agencia reemplaza un archivo o corrige un texto. Los ACM viejos quedan como se
  enviaron.
- Fichas anteriores a este cambio: sin `acm_material` en el snapshot, salen como
  siempre. Nunca acceder al campo sin verificar que existe.

## Cómo se prueba

Con la cuenta PRISMAIA - VAKDOR. **Central no se toca.**

1. Subir los tres PDF reales de Central y verificar el reparto en las cuatro secciones.
2. Verificar que una sección sin material en el archivo vuelve vacía y no inventada.
3. Verificar que el texto vuelve en español aunque el archivo esté en inglés.
4. **Reemplazo sin pisar trabajo:** corregir a mano la sección 2, reemplazar el archivo
   que la alimentaba, volver a leer, aceptar solo la sección 1 y comprobar que la 2
   quedó como el director la había dejado.
5. **Quitar un archivo** y comprobar que el texto ya aceptado sigue en su lugar.
6. **Acomodar con IA** sobre un texto escrito a mano: verificar que no agrega datos
   que el director no puso, y que descartar deja el original intacto.
7. Generar un ACM real y abrir la ficha en el navegador: escritorio y celular emulado.
8. **La prueba que más importa:** una agencia sin `acm_material` genera una ficha
   idéntica a la de hoy. Se verifica sacando el campo y comprobando que las cuatro
   hojas desaparecen y el resto queda intacto.
9. Verificar que una ficha ya emitida no cambia después de reemplazar el material.
10. **Que guardar el material no borre la marca:** anotar los colores y el logo de la
    agencia, guardar material desde la solapa del ACM, y volver a Marketing IA →
    Configuración a comprobar que siguen ahí. Es el error más caro de este cambio.
11. Verificar que un asesor no ve la solapa Configuración en su módulo de ACM, y que
    aun llamando a los endpoints a mano recibe 403.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La IA rellena secciones que el archivo no cubre. | Regla dura en el prompt, más la revisión del director antes de guardar. Es el punto donde esto puede salir mal. |
| Un reemplazo de archivo pisa correcciones hechas a mano. | La aceptación es por sección: lo que no se acepta no se toca. Es la razón de ser del diseño de los dos caminos. |
| El director sube el carpetón esperando ver sus gráficos. | El aviso "se copia solo el texto" va bien visible en la pantalla de carga, no en letra chica. |
| La ficha se vuelve un folleto y el propietario no llega al precio. | Topes de largo con contador, y "Quiénes somos" acotada a una carilla. |
| Gasto de créditos por releer muchas veces. | *Volver a leer* nunca se dispara solo: siempre lo toca el director. El costo por operación se muestra igual que en el resto de los módulos de IA. |
| Guardar el material borra los colores y el logo de la agencia. | Endpoint propio que hace merge en el servidor sobre la clave `acm_material`, sin tocar el resto del jsonb. Es el error más caro de este cambio y tiene su propia prueba. |
| El material queda desactualizado y nadie se entera. | Fuera de alcance por ahora. Queda anotado como pendiente. |
