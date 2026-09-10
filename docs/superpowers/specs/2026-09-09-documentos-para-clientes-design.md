# Documentos para clientes — diseño

Fecha: 2026-09-09
Estado: diseño aprobado en chat. Falta la revisión del spec y el plan.

## El problema, y el problema que se había resuelto en su lugar

Leonardo pidió, desde el principio, **plantillas de documentos que el director arma una vez
y cada asesor comparte con sus clientes con sus propios datos**: una presentación de la
inmobiliaria, las condiciones de la exclusiva, una guía para preparar la casa. Con link,
con la marca de la agencia, con PDF — como la ficha del ACM.

Lo que se construyó en Asesores → Plantillas (Etapa C, ago-2026) resolvió otro problema:
detectar el molde de un **contrato Word** comparando los documentos de tres asesores,
versionarlo y regenerarlo. Es un módulo grande, con tests y con guía funcional, y **en
producción tiene cero plantillas cargadas** con 24 asesores activos en Central. No porque
esté roto: porque no era lo que se pidió. Queda anotado para que la próxima vez se
confirme el pedido antes de construir.

Víctor volvió a pedir lo mismo el 9-sep, con un dibujo: un editor con header, cuerpo y
footer, formato como Word, y variables `@nombre`, `@email`, `@celular` que el sistema ya
conoce.

## Qué se construye

Dentro de **Asesores → Plantillas**, dos sub-solapas:

1. **Documentos para clientes** — lo nuevo y lo principal. Lista de plantillas y el botón
   **"Crear nueva plantilla"**.
2. **Contratos desde Word** — lo que ya existe, con ese nombre. No se toca su lógica; solo
   pasa a ser la segunda solapa y cambia el título, para que se entienda que es otra cosa.

El asesor no ve nada de eso. En su **Biblioteca** aparece una solapa nueva, **"Para
compartir"**, con las plantillas activas de su agencia y un botón por cada una.

**No se toca el menú.** Todo vive en pantallas que ya existen.

## Cómo funciona, de punta a punta

1. El director toca "Crear nueva plantilla", le pone nombre, arma el cuerpo en el editor,
   sube header y footer si los tiene, escribe el bloque del asesor con las variables, y
   guarda. Puede dejarla inactiva mientras la termina.
2. El asesor entra a Biblioteca → Para compartir, ve la plantilla, toca **"Compartir"**.
   PRISMA arma el documento con **sus** datos y le devuelve el link, que puede copiar o
   mandar por WhatsApp.
3. El cliente abre el link sin sesión: ve el documento con la marca de la agencia, el
   header y el footer, y el bloque del asesor con nombre, categoría, mail y celular. Puede
   bajarlo en PDF.
4. Si el director mejora la plantilla, la próxima vez que cualquier asesor comparta sale
   la versión nueva. **Nadie tiene que hacer nada.** Los links ya enviados no cambian.

## La plantilla

Tabla nueva `documentos_plantillas`:

| Columna | Qué es |
|---|---|
| `id` uuid | |
| `agency_id` uuid | la agencia dueña |
| `nombre` text | "Presentación de la inmobiliaria" |
| `cuerpo` jsonb | lo que escribió el director, como estructura de Tiptap (no HTML) |
| `header_path` text, nullable | ruta de la imagen en el bucket, o null |
| `footer_path` text, nullable | ídem |
| `bloque_asesor` jsonb | `{ texto: <estructura Tiptap de una o dos líneas>, posicion: "header" \| "footer" \| "ambos" \| "ninguno" }` |
| `version` integer | arranca en 1, sube 1 en cada guardado |
| `activa` boolean | solo las activas se pueden compartir |
| `created_by`, `created_at`, `updated_at` | |

RLS: el director de la agencia hace todo; el asesor de la agencia solo lee las activas.
Las plantillas de otra agencia no se ven nunca.

**Header y footer son por plantilla, no por agencia**, y cada uno es opcional: si no
está, no se muestra y el documento sale sin esa franja. Las imágenes van al bucket
público `marketing-images` (ya existe y ya sirve las imágenes de marca), en
`<agencyId>/documentos/<plantillaId>/<header|footer>-<uuid>.<png|jpg>`. Al reemplazar una
imagen, la anterior se borra del bucket.

## Header y footer: la guía al director

De cómo esté armada la imagen depende que el documento salga bien, así que la pantalla lo
explica al lado del botón de subir:

> **Cómo tiene que ser la imagen.** Una franja apaisada de ancho completo: PNG o JPG, de
> **al menos 1600 px de ancho**, hasta 2 MB. Los logos, el teléfono, la web y la dirección
> de la inmobiliaria van adentro de la imagen, como vos los diseñes.
>
> **Lo que NO tiene que tener: los datos del asesor.** Nombre, categoría, mail y celular
> los pone PRISMA por cada persona, con lo que escribas abajo en "Bloque del asesor". Si
> los dibujás en la imagen, salen fijos con los datos de uno solo.

Al lado, una **vista previa con un asesor real de la agencia**, actualizada al escribir,
para que el director vea el resultado antes de guardar.

Reglas de aceptación al subir: PNG o JPG; ancho mínimo 1600 px (se mide del archivo, no
se supone); tope 2 MB; si no cumple, se rechaza con el motivo en criollo y el archivo
sigue elegido para que corrija sin empezar de cero.

## El bloque del asesor y las variables

Una o dos líneas que escribe el director, con formato y variables. El caso de Central:

```
**@nombre** | @categoria
@email | Cel: @celular
```

Se ubica debajo del header, arriba del footer, en los dos, o en ninguno.

Las variables que se ofrecen al tipear `@`, y de dónde sale cada una:

| Variable | Fuente | Cómo sale |
|---|---|---|
| `@nombre` | `profiles.full_name` | tal cual |
| `@email` | `profiles.email` | tal cual |
| `@celular` | `profiles.phone` | formateado como en la ficha del ACM (`formatPhoneInternational`) |
| `@categoria` | `profiles.clasificacion` | legible: `client_director` → "Client Director", `client_support` → "Client Support"; sin clasificación → "Asesor/a", como en la ficha |
| `@agencia` | `agencies.name` | tal cual |

**Si a un asesor le falta un dato, ese fragmento se omite** — se saca la variable y el
separador que la acompaña — para que nunca salga un hueco en un documento que va a un
cliente. En "Para compartir", al lado del botón, el asesor ve qué le falta y que se
completa en Configuración. Verificado el 9-sep: los 24 asesores activos de Central tienen
nombre, mail y celular; 23 tienen categoría.

Las mismas variables sirven **dentro del cuerpo**: "Hola, soy @nombre de @agencia".

## El editor

**Tiptap** (ProseMirror para React), con estas extensiones y ninguna más: párrafo,
títulos (dos niveles), negrita, cursiva, subrayado, listas con viñetas y numeradas,
alineación (izquierda, centro, derecha), y **Mention** para las variables con `@`.

Lo que se guarda es la estructura de Tiptap en JSON, y al mostrar se genera el HTML **en el
servidor** con esas mismas extensiones y nada más. Un nodo que no esté en la lista no se
dibuja. Así **no hay forma de meter código en un documento que va a ser público**, sin
necesidad de un sanitizador aparte.

Fuera de esta versión: imágenes y tablas dentro del cuerpo, colores de texto, tipografías.

## Compartir: el documento público

Tabla nueva `shared_documentos`, calcada de `shared_selections` (7-sep): `token` PK,
`snapshot` jsonb, `created_by`, `agency_id`, `view_count`, `created_at`. RLS encendida
**sin políticas**: solo la lee el servidor con service-role, igual que las otras fichas.

El snapshot congela todo lo que hace falta para dibujar el documento aunque después
cambie la plantilla, el asesor o la marca:

```json
{
  "plantilla": { "id", "nombre", "version", "cuerpo", "header_url", "footer_url", "bloque_asesor" },
  "agent":     { "full_name", "email", "phone", "clasificacion", "avatar_url" },
  "agency":    { "id", "name" },
  "brand":     { "colors", "font", "logo_url" },
  "created_at": "..."
}
```

`brand` sale de `marcaDeLaAgencia()` en `lib/ficha/snapshot.ts`, la misma función que
usan las fichas de propiedad y de selección.

Página pública `app/documento/[token]/page.tsx`, con el mismo esqueleto que la ficha del
ACM: tipografías de la marca, `.sheet` A4, `@page { margin: 0 }`, botón "Descargar PDF"
que imprime. **En pantalla** el documento es continuo: header arriba, cuerpo, footer
abajo. **Al imprimir**, header y footer se repiten en cada hoja (`position: fixed` en
`@media print`, con `padding` en el cuerpo para que el texto no quede debajo). El bloque
del asesor viaja pegado al header o al footer según su posición.

La solapa "Para compartir" muestra también **los links que ese usuario ya generó**, con
fecha y cantidad de vistas, para no generar diez veces el mismo.

## Qué se congela y qué no

- Editar la plantilla sube `version` y cambia lo que se comparta **de ahí en adelante**.
- Un link ya compartido muestra siempre la versión con la que salió. Ni un cambio de
  plantilla, ni un cambio de datos del asesor, ni un cambio de marca lo mueven.
- Desactivar una plantilla saca el botón de "Compartir"; los links viejos siguen abiertos.
- Borrar una plantilla es posible solo si nunca se compartió; si ya tiene links, se
  desactiva. Un cliente con un link no puede encontrarse con un 404 por una limpieza.

## Qué NO se toca

- La lógica del módulo de contratos Word (`lib/asesor-docs`, `app/api/asesor-docs`,
  `components/asesor-docs`): solo su título y su lugar en la solapa.
- La base de conocimiento (Ayuda → Documentos / Biblioteca Digital).
- Las fichas de ACM, de propiedad y de selección.
- El menú (`lib/nav/menu.ts`) y su test.
- Nada de datos del cliente ni de la propiedad: lo dijo Leonardo, los documentos son
  iguales para todos y solo cambia el asesor que los manda.

## Cómo se prueba

Con **PRISMAIA - VAKDOR**, nunca con Central, en rama y worktree, en el navegador.

1. Crear una plantilla con el header y el footer reales de Central que están en
   Descargas, escribir el cuerpo **tecleando** (no pegando), poner variables con `@`.
2. Ver la vista previa con un asesor real de la agencia.
3. Subir una imagen de 800 px de ancho y comprobar que la rechaza con el motivo.
4. Compartir como asesor. Abrir el link **sin sesión**, en escritorio y en celular
   emulado. Bajar el PDF y mirar que el footer con los datos del asesor salga como el
   dibujo de Víctor, y que en un documento largo header y footer se repitan en cada hoja.
5. Editar la plantilla, compartir de nuevo, y abrir el link viejo: tiene que seguir igual.
6. Un asesor no ve "Crear nueva plantilla" y los endpoints de escritura le devuelven 403.
7. Una plantilla sin header ni footer sale limpia, sin franjas vacías.
8. Un asesor sin celular comparte y el documento sale sin hueco ni "Cel:" suelto.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El PDF corta mal un documento largo o pisa el texto con el footer repetido. | Se mide en el navegador con un cuerpo de tres hojas antes de dar por hecho el render. Es el punto más frágil. |
| Una imagen de header con proporción rara (casi cuadrada) deforma el documento. | Se exige ancho mínimo y se muestra la vista previa; la franja se dibuja a ancho completo y alto proporcional, nunca estirada. |
| Código inyectado en un documento público. | No se guarda HTML: estructura de Tiptap con extensiones fijas, renderizada en el servidor con esa misma lista. |
| El director dibuja los datos del asesor dentro de la imagen. | La guía lo dice explícitamente y la vista previa lo muestra duplicado al instante. |
| El módulo de contratos Word queda huérfano. | Se renombra y se deja como segunda solapa. Qué hacer con él a largo plazo es una decisión de Leonardo, aparte de esto. |
