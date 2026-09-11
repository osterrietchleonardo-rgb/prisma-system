# Farming geográfico — diseño

Fecha: 2026-09-11
Estado: diseño aprobado en chat el 11-sep. Falta la revisión de este spec por Leonardo y el
plan de implementación.

## De dónde sale el método

No se inventó nada. El método es el de Central Real Estate, y está en tres archivos que
Leonardo bajó el 10-sep (`~/Downloads`):

| Archivo | Qué aporta |
|---|---|
| `Farming Geografico Central Real Estate corregido.pdf` | el método completo: 10 puntos, la secuencia de 7 contactos, los 9 indicadores semanales y las 5 reglas |
| `Farming Aclaraciones Slides.pptx` (4 slides, puntos 11 a 14) | cómo se cargan las fichas y tres reglas de carga que van directo al modelo de datos |
| `Farming Geografico Fichas.xlsx` (2 hojas) | las columnas exactas de las dos planillas que hoy lleva cada broker a mano |

Lo esencial del PDF, porque manda sobre todo lo demás:

- El farming es **casa por casa**: se camina la cuadra y se registra **cada dirección** —
  tipo, pisos, unidades por piso, unidades totales, encargado, fecha, próxima acción.
- La secuencia son **7+ contactos numerados con tema propio**, arrancando mensual.
- El punto 9, regla 4: **«cada contacto debe tener una próxima acción y una fecha»**.
- El punto 8: **«lo que no se registra no puede gestionarse»**, y ahí están los 9 indicadores.

Y de las slides, tres reglas que son decisiones de diseño, no de estilo:

1. Las unidades totales **se calculan solas** (pisos × unid./piso). No se cargan a mano.
2. El encargado es **el nombre de la persona**, no un sí/no.
3. El broker y la zona se cargan **una sola vez**, no en cada fila.

## El problema que resuelve en PRISMA

Hoy el asesor lleva esto en dos planillas de Excel sueltas, en su propia computadora. El
director no ve nada, el territorio no está repartido (dos asesores le pueden golpear la
puerta al mismo propietario) y todo lo que PRISMA ya sabe del mercado de esa cuadra —quién
vende por dueño directo, a quién se le cayó el aviso, quién lleva 200 días publicado— no
llega nunca a la persona que está caminando esa vereda.

## Las decisiones que tomó Leonardo (11-sep)

Todas en chat, y este spec no se aparta de ninguna:

| Decisión | Qué eligió |
|---|---|
| Qué es una tarjeta | **Dos tipos, en solapas separadas**: el relevamiento a pie (el pipeline) y los avisos a la venta de la zona (la lista que alimenta ese pipeline) |
| Choque de zonas | **Primero que la dibuja, la gana**. No deja guardar, muestra el recorte que choca, y el trazo del asesor no se borra |
| Compartir zona | **Trabajan juntos de verdad**: los dos mueven y editan. Cada movimiento queda firmado. El dueño es el único que puede borrarla o sacar a alguien |
| Dónde se dibuja | **En el Buscador IA, solapa Mapa**, con un botón «usar para farming» al lado de cada zona guardada |
| Columnas del pipeline | **6, fieles a los indicadores del PDF** + «descartada» al costado |
| Próxima acción | **Obligatoria al mover la tarjeta**. Sin fecha, no se mueve |
| Enganche con Tracking | **Sí, con un botón, nunca solo** |
| Carga manual | **El asesor puede cargar una dirección y sus propietarios aunque no exista ningún aviso publicado** (pedido explícito del 11-sep) |
| Editar el trazo | **Redibujar entero y sumar pedazos.** Una zona puede tener más de un pedazo |
| Tarjeta que queda fuera | **Se saca sola solo si está vacía.** Con cualquier dato cargado se queda, marcada |

## Qué NO se toca

Esto va primero a propósito, porque es lo que importa:

- **`mapa_zonas` queda exactamente como está.** Mismas columnas, misma regla de privacidad
  (`user_id = auth.uid()`). Las zonas guardadas del Buscador siguen siendo privadas y nadie
  más las ve. **No se modifica ninguna política existente.**
- **`mercado_avisos` no se toca.** Solo se lee. Ni una columna nueva, ni un índice nuevo: ya
  tiene el que hace falta (`mercado_avisos_geom_idx`).
- **El Buscador IA, el mapa, el ACM y Tracking Performance siguen funcionando igual.** Lo
  único que se agrega en el Buscador es un botón en el panel de zonas.
- **Nada se borra y ninguna tabla existente cambia de forma.** Todo vive en 6 tablas nuevas.

## Qué se construye

### 1. Dónde se dibuja, y por qué la zona se COPIA

**Dos puertas, el mismo lápiz.** El mapa y el lápiz (`components/mapa/`) se usan en los dos
lados; es el mismo componente, no una copia:

- **Desde el Buscador** (`components/mapa/mapa-zonas-panel.tsx`): cada zona guardada suma un
  botón **«usar para farming»**. Es el atajo para cuando el asesor ya tiene dibujada una
  zona de una búsqueda y la quiere reusar como territorio.
- **Desde Farming**: dibujar una zona nueva, redibujar una que ya tiene y sumarle pedazos.
  Esta puerta **es obligatoria**: la zona de farming es una copia, así que en el Buscador
  «Belgrano R farming» ni siquiera existe — no hay cómo editarla desde allá.

Al crearla se pide un nombre y **se copia el polígono** a `farming_zonas`.

Se copia, no se referencia, y es a propósito: si el asesor redibuja esa zona en el Buscador
para otra búsqueda, **su territorio exclusivo no se tiene que mover solo**. Un territorio
que cambia de forma sin que nadie lo decida es un problema, no una comodidad.
`origen_mapa_zona_id` queda guardado como dato informativo, **sin clave foránea dura**:
borrar la zona del Buscador no debe tocar el territorio.

### 2. La página `/asesor/farming`

Renglón nuevo **«Farming»** en el grupo **Propiedades** de `lib/nav/menu.ts`, entre «Mis
Propiedades» y «Buscador IA». Ícono: `Sprout` (existe en `lucide-react`, verificado; falta
confirmar contra `menu.test.ts` que ningún ícono se repita dentro del rol).

**Solapa 1 · Mis zonas.** Las zonas de farming del asesor: nombre, km², cuántos pedazos
tiene, direcciones relevadas, avisos a la venta hoy, y con quién la comparte. El desplegable
de compartir trae los asesores activos de la agencia. Cinco botones por zona: **redibujar**,
**sumar un pedazo**, **compartir**, **borrar** y el mapa para verla. Y arriba, **dibujar una
zona nueva**.

**Solapa 2 · Relevamiento.** El tablero de 6 columnas. Es la hoja 1 del Excel convertida en
tarjetas. Botón **«+ agregar dirección»** siempre visible (ver «La carga a pie», más abajo).

**Solapa 3 · A la venta en mi zona.** Los avisos de `mercado_avisos` que caen dentro de sus
polígonos, con cuatro atajos de captación arriba:

| Atajo | De dónde sale | Por qué importa |
|---|---|---|
| **Dueño directo** | `es_dueno_directo` (la tabla está particionada por esa columna) | un propietario vendiendo solo: el target número uno |
| **Se cayó del portal** | `estado = 'caido'` + `dias_en_mercado` | lo bajó sin venderlo: está disponible |
| **Lleva mucho publicado** | `dias_publicado` | el colega no lo mueve; el contrato se vence |
| **Bajó el precio** | `variacion_precio_pct` | ya aceptó que el precio estaba mal |

De cada aviso salen dos botones: **«crear tarjeta de relevamiento»** (lo manda a la solapa 2
ya cargado con lo que el aviso traiga) y **«descartar»** (no vuelve a aparecer).

**Acá no se tapa al colega.** En la ficha pública del ACM la descripción se recorta porque
delata a la inmobiliaria que publica (55% traen matrícula, 42% el nombre del publicador). En
esta solapa **no**: es la pantalla interna del asesor, no viaja a ningún cliente, y saber
quién publica es justamente el dato que necesita. Las fotos sí pasan por `urlFotoRed`, que
es el proxy que el CSP de la app exige.

### 3. La pantalla del director

`/director/farming`, el mismo renglón «Farming» del grupo Propiedades pero apuntando a su
ruta — el menú de `lib/nav/menu.ts` ya está hecho para eso: un renglón con una entrada por
rol. Una sola pantalla, chica: el mapa de la agencia con todas las zonas y de quién es cada
una, los indicadores por asesor, y el botón **liberar**.

**No hay aprobación de zonas** — Leonardo eligió «primero que la dibuja, la gana». Esta
pantalla existe para ver el reparto y destrabarlo.

**Liberar no borra nada.** La zona queda en estado `liberada`, con fecha, motivo y quién lo
hizo; sus direcciones, propietarios e historial se conservan intactos. Lo único que cambia
es que esas cuadras vuelven a estar disponibles para que otro las dibuje. Sin esta válvula,
un asesor pausado o desvinculado (`estado` + `tokens_invalidos_desde`, que ya existen)
bloquearía su territorio para siempre.

## La carga a pie: direcciones y propietarios que no están publicados

Pedido textual de Leonardo, 11-sep: *«lo que hay de publicado en mercado_avisos puede que no
sean todos, así que si el asesor camina y encuentra una propiedad que no estaba en el mapa,
pueda agregarla sin problemas con los datos necesarios»*.

Esto no es un caso de borde: **es el caso principal.** El PDF es un método de caminata, y la
mayoría de lo que se releva no está publicado en ningún portal. `mercado_avisos` es una
ayuda, no la fuente.

Por eso:

- **La tarjeta se crea desde cero, sin ningún aviso detrás.** El formulario de «+ agregar
  dirección» pide lo mismo que la hoja 1 del Excel y nada más: tramo, calle, altura, tipo,
  pisos, unidades por piso, encargado, fecha de relevamiento, próxima acción, observaciones.
  Lo único obligatorio es la calle y el tipo: el asesor está parado en la vereda con el
  teléfono en la mano, no completando una planilla en la oficina.
- **`origen` distingue de dónde salió cada tarjeta** (`caminata` o `aviso`), así los
  indicadores pueden después responder cuánto aportó cada camino.
- **Una dirección puede estar a la venta sin estar publicada.** Un cartel de dueño en el
  balcón, o un cartel de otra inmobiliaria: eso se registra en la tarjeta (`a_la_venta`,
  `cartel`, `inmobiliaria_cartel`, `precio_pedido`), sin depender de que exista un aviso.
- **Los propietarios son filas propias, no una columna.** Un edificio de 32 unidades puede
  tener muchos propietarios conocidos, cada uno con su piso, su unidad y su teléfono. La
  hoja 2 del Excel ya trabaja así (una fila por visita, con piso y propietario). Meterlos en
  una columna de texto sería perder el dato que después hace falta para el pipeline.

## Editar el trazo: qué cambia en vivo y qué no se pierde nunca

Planteado por Leonardo el 11-sep: *«¿puede editar ese tramo? ¿por si le faltó una manzana? ¿o
si se pasó una cuadra? … y cada una de estas acciones guardadas, ¿afecta en vivo el filtro de
la lista de avisos?»*.

### Una zona puede tener varios pedazos

El lápiz dibuja a mano alzada y **no tiene tiradores para mover esquinas** — el plugin que
hace eso es pago y por eso el lápiz se escribió a mano. Así que editar son dos operaciones,
no una:

- **Redibujar** → el trazo nuevo reemplaza al anterior. Para «me pasé una cuadra» o «me
  equivoqué de lado».
- **Sumar un pedazo** → se dibuja un trazo más y se suma. Para «me faltó esta manzana», sin
  tener que redibujar diez cuadras de contorno.

Por eso `geojson` guarda un `Polygon` **o** un `MultiPolygon`. No es una complicación
gratuita: el mapa **ya trabaja así** — `lib/mapa/filtro-poligono.ts` dice textual que varios
trazos *se suman*, y Turf maneja `MultiPolygon` en `intersect`, `area` y `booleanValid` sin
nada especial.

Consecuencias, todas obligatorias:

- El tope de 5 km² se mide sobre **la suma de los pedazos**.
- **Cada edición vuelve a pasar por el control de choque**, igual que la creación. Sumar una
  manzana que ya es de otro asesor se rechaza con el mismo 409 y el mismo recorte rayado.
- En ese control, la zona **se excluye a sí misma** — si no, redibujarla chocaría siempre
  contra su propia versión anterior.
- Los pedazos de una misma zona sí se pueden tocar entre ellos: si se solapan, se unen.

### La lista de avisos es en vivo porque no está guardada

**No existe ninguna tabla con «los avisos de la zona de Leo».** La solapa 3 agarra el
polígono y le pregunta a `mercado_avisos` qué cae adentro, en ese momento. No hay nada que
recalcular, nada que sincronizar y nada que se pueda desfasar.

| Qué hace el asesor | Qué pasa con la lista |
|---|---|
| Borra la zona | la solapa queda vacía: sin polígono no hay avisos |
| Suma una manzana | aparecen los avisos de esa manzana |
| Saca una cuadra | desaparecen los de esa cuadra |

**En vivo significa «al guardar el cambio y recargar la solapa»**, no que la pantalla se
mueva sola mientras dibuja. Decirlo importa: prometer tiempo real y entregar una recarga es
la clase de cosa que hace desconfiar de todo lo demás.

Las marcas de `farming_avisos_marca` no estorban: un aviso descartado que queda fuera del
trazo simplemente no aparece más, y si la zona vuelve a crecer sobre él, sigue descartado.

### Lo trabajado no se borra por mover un trazo

Acá hay dos objetos que se parecen y no son lo mismo:

- **El aviso** de la solapa 3 no es del asesor, es del mercado. Entra y sale según el
  polígono, sin drama.
- **La tarjeta** del tablero es trabajo del asesor. Esa **nunca** se borra por editar la zona.

Al guardar un trazo que deja direcciones afuera, PRISMA las separa en dos grupos:

| La tarjeta… | Qué pasa |
|---|---|
| está **vacía**: etapa `relevado`, sin encargado, sin propietarios y sin ningún contacto | se saca sola. Es la que se creó de un clic desde un aviso y nunca se tocó: no hay trabajo que perder |
| tiene **cualquier dato cargado** —aunque siga en `relevado`— | **se queda en el tablero**, con `fuera_de_zona = true` y un cartel visible: *«esta dirección quedó fuera de tu zona»*. Se sigue trabajando hasta captarla |

La distinción es a propósito y no es la literal de «no avanzó de columna»: caminar un
edificio, contar 8 pisos × 4 unidades y anotar que el encargado se llama Roberto **es
trabajo**, y todo eso vive en la columna «Relevado».

El aviso que se muestra al guardar dice las dos cosas — cuántas se sacaron, cuántas se
quedan marcadas — y **una tercera que el asesor tiene que saber**: esas cuadras quedan
libres para que otro asesor las dibuje. Es lo que está soltando, y se le dice antes de que
pase, no después.

### Borrar una zona

- **Sin ninguna tarjeta cargada** → se borra de verdad, sin preguntar. Es el caso «me
  equivoqué, dibujo otra».
- **Con tarjetas** → no se borra: pasa a `archivada`. Las cuadras se liberan igual, y las
  tarjetas con su historial quedan accesibles. **Nunca se pierde trabajo por apretar un
  botón**, y ningún borrado de datos del asesor ocurre en silencio.

## El modelo de datos: 6 tablas nuevas

Todas con `agency_id` para la separación por agencia, todas con RLS, ninguna toca nada
existente.

### `farming_zonas` — el territorio

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `agency_id` | uuid not null | |
| `owner_user_id` | uuid not null | quien la dibujó; el único que puede borrarla o compartirla |
| `nombre` | text not null | |
| `geojson` | jsonb not null | `Polygon` **o `MultiPolygon`**: una zona puede tener varios pedazos |
| `area_km2` | numeric(10,4) | `@turf/area` sobre **la suma de los pedazos**, recalculada en cada edición |
| `origen_mapa_zona_id` | uuid null | **sin FK**: informativo |
| `estado` | text not null | `activa` \| `liberada` (el director) \| `archivada` (la borró su dueño pero tenía tarjetas) |
| `liberada_en` / `liberada_por` / `motivo_liberacion` | | sirven igual para el archivado |
| `trazo_editado_en` | timestamptz | última vez que cambió la forma; el cartel de «fuera de zona» lo usa para explicar desde cuándo |
| `created_at` / `updated_at` | | |

Índices: `(agency_id, estado)`, `(owner_user_id)`.

### `farming_zonas_compartidas` — con quién la comparte

`zona_id`, `user_id`, `agregado_por`, `created_at`. PK `(zona_id, user_id)`.

### `farming_direcciones` — las tarjetas del tablero (hoja 1 del Excel)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `zona_id` | uuid not null | |
| `agency_id` | uuid not null | denormalizado para la RLS |
| `tramo` | text | la «cuadra / tramo» de la hoja 1 |
| `calle` | text not null | |
| `altura` | text | texto y no número: existe el «s/n» |
| `tipo` | text not null | `edificio` \| `casa` \| `ph` \| `local` \| `oficina` \| `lote` \| `otro` |
| `pisos` / `unidades_por_piso` | smallint | |
| `unidades_manual` | smallint | para lo que no es edificio (una casa es 1) |
| `unidades_totales` | smallint generated stored | `pisos × unid./piso`, o `unidades_manual` si no hay pisos. **Regla de las slides: no se carga a mano** |
| `encargado_nombre` / `encargado_turno` / `encargado_notas` | text | **el nombre, no un sí/no** |
| `lat` / `lng` | double precision | para el pin y para verificar que cae dentro de la zona |
| `etapa` | text not null | las 6 + `descartada` |
| `orden` | int | posición dentro de la columna |
| `proxima_accion` / `proxima_accion_en` | text / date | |
| `relevada_en` | date | |
| `a_la_venta` | boolean not null default false | **aunque no esté publicada** |
| `cartel` | text null | `dueno` \| `inmobiliaria` \| `sin_cartel` |
| `inmobiliaria_cartel` | text | |
| `precio_pedido` / `moneda` | numeric / text | |
| `aviso_id` / `aviso_es_dueno_directo` | bigint / boolean | **las dos**: la PK de `mercado_avisos` es compuesta por la partición. **Sin FK dura** |
| `origen` | text not null | `caminata` \| `aviso` |
| `fuera_de_zona` | boolean not null default false | quedó afuera al editar el trazo. La tarjeta se sigue trabajando; el tablero muestra el cartel |
| `fuera_de_zona_desde` | timestamptz null | cuándo quedó afuera |
| `observaciones` | text | la columna ancha de la hoja 1 |
| `creada_por` / `created_at` / `updated_at` | | |

Índices: `(zona_id, etapa, orden)`, `(agency_id)`, y un **único de expresión** sobre
`(zona_id, farming_direccion_normalizada(calle, altura))`, para que dos asesores que
comparten zona no carguen dos veces «Av. Ejemplo 1200» y «av ejemplo 1200».

**Ojo acá, que esto ya costó caro una vez.** La forma cómoda sería una columna generada con
`lower(unaccent(...))`, y **Postgres no la acepta**: `unaccent()` depende de un diccionario
que se puede cambiar, así que no está declarada inmutable. Es exactamente el problema que
documenta `20260811100000_mapa_indice_barrio.sql`. Se resuelve igual que ahí: una función
`farming_direccion_normalizada(text, text)` declarada `IMMUTABLE`, que le pasa el
diccionario explícito (`public.unaccent('public.unaccent'::regdictionary, …)`) y calificado
con el esquema —sin calificarlo falla recién al ejecutarse, no al crearse—. La función
existente `barrio_normalizado()` **no se toca ni se reusa**: su nombre dice barrio.

Y la regla que viene con eso: la consulta que busca una dirección repetida tiene que escribir
la expresión **exactamente igual** que el índice. Si difiere en un paréntesis, Postgres no lo
reconoce y el índice no entra.

### `farming_propietarios` — las personas de cada dirección

| Columna | Nota |
|---|---|
| `id`, `direccion_id` (cascade), `agency_id` | |
| `piso` / `unidad` | texto: «3», «PB», «3° B» |
| `nombre` | not null |
| `vinculo` | `propietario` \| `inquilino` \| `encargado` \| `familiar` \| `otro` |
| `telefono` | normalizado con `normalizePhoneE164` (`lib/whatsapp/phone`), que ya existe |
| `email`, `notas` | |
| `tracking_log_id` | uuid null: si ya se pasó al pipeline de Tracking |
| `creado_por`, `created_at`, `updated_at` | |

### `farming_contactos` — el historial firmado (hoja 2 del Excel)

`id`, `direccion_id`, `propietario_id` (null), `agency_id`, `user_id` (quién lo hizo),
`fecha` (default hoy), `tipo` (`carta_1`…`carta_7`, `carta_otra`, `visita_encargado`,
`llamada`, `whatsapp`, `email`, `tasacion`, `entrevista`, `otro`), `cartas_entregadas`,
`etapa_desde`, `etapa_hasta`, `nota`, `created_at`.

Esta tabla **se llena sola** como efecto de mover tarjetas: el asesor nunca carga una
planilla. Y es lo que hace que compartir zona funcione sin discusiones — cada movimiento
queda con nombre y hora, así la tarjeta puede decir «Mariela la movió acá, ayer 16:40».

### `farming_avisos_marca` — para no repetir trabajo

`zona_id`, `aviso_id`, `aviso_es_dueno_directo`, `user_id`, `estado`
(`descartado` \| `convertido`), `direccion_id` (null), `created_at`. PK
`(zona_id, aviso_id)`. **Sin FK hacia `mercado_avisos`**: el id se guarda como referencia
suelta, para que un cambio del crawler no rompa nada.

### RLS

- `farming_zonas`: **leer** las de mi agencia (el contorno y de quién es — sin eso, dibujar
  a ciegas choca una y otra vez); **escribir** solo las propias; **liberar** solo el director.
- `farming_direcciones`, `farming_propietarios`, `farming_contactos`,
  `farming_avisos_marca`: leer y escribir si soy el dueño de la zona **o** estoy en
  `farming_zonas_compartidas`. El director lee todo lo de su agencia; no edita tarjetas.

Dos cosas que ya costaron caro y acá no se repiten:

1. **Los endpoints usan `createAdminClient`, que se saltea la RLS.** El `.eq()` explícito por
   usuario/zona **no es opcional** en ninguna consulta — es la misma nota que ya tiene
   `app/api/mapa/zonas/route.ts`.
2. **Una política escrita a mano escapa a toda revisión.** Se audita **contra producción**
   con un script que intenta el ataque: un asesor ajeno leyendo y escribiendo las tarjetas
   de otro. No está hecho hasta que el ataque falla.

## La exclusividad: cómo se detecta el choque

El cálculo corre **en el servidor con Turf**, no en la base. PostGIS está instalado
(`mercado_avisos.geom` es `geography(point,4326)`), así que se podría hacer en SQL; se hace
en Node porque **esta cuenta corre una vez, cuando alguien guarda una zona**, no en cada
búsqueda: ahí se puede probar con tests sobre polígonos reales sin tocar producción, y el
mensaje («pisa 18% de «Belgrano C», de Juan Pérez») se arma donde se muestra.
`@turf/turf@7.4.0` ya es dependencia; `intersect`, `area` y `booleanValid` están en
`node_modules`, verificado.

Corre igual al crear y **al editar** (redibujar o sumar un pedazo): una edición que pisa a
otro asesor se rechaza exactamente como una creación. Al guardar una zona:

1. **Validar el polígono.** Mínimo 4 puntos (ya es la regla del lápiz), máximo 5.000
   vértices (un trazo a mano trae ~300), y **`booleanValid`**: un trazo a mano alzada puede
   cruzarse consigo mismo si el asesor da la vuelta de más, y con un polígono en forma de 8
   el cálculo de solapamiento devuelve cualquier cosa. Si está cruzado, se pide redibujar —
   nunca se guarda un territorio con forma inválida.
2. **Traer las zonas `activa` de la agencia**, menos la propia si es una edición.
3. **`intersect` contra cada una.** Dos zonas que comparten una calle se tocan sin pisarse:
   por eso el rechazo pide una superposición real — **más de 100 m² o más del 1% de la zona
   más chica**, lo que sea mayor. Un `intersect` de área cero o que devuelve una línea no es
   un choque.
4. **Si hay choque: HTTP 409** con la lista de zonas que pisa, el nombre del dueño, el
   porcentaje y **el recorte en GeoJSON** para dibujarlo rayado. El trazo del asesor **no se
   borra**.

## La consulta de avisos de la zona

Función nueva `farming_avisos_en_zona(p_geojson, p_limit, p_cursor)` que lee
`mercado_avisos` directo:

```sql
where geom is not null
  and ST_Intersects(geom, ST_GeomFromGeoJSON(p_geojson)::geography)
  and calidad = 'ok'
  and operacion = 'venta'
  and (estado = 'activo' or (estado = 'caido' and caido_en > now() - interval '180 days'))
```

Tres cosas de esto no son negociables:

- **El caído entra a propósito.** Para buscar una propiedad es ruido; para captar es la
  mejor señal que hay. Por eso esta función **no** reusa la vista `roomix_properties`, que
  expone solo activos.
- **Se mide con `EXPLAIN ANALYZE` contra producción, con caché frío, y el número va en la
  bitácora.** Si no usa `mercado_avisos_geom_idx`, no está terminada. El antecedente es
  claro: la misma consulta escrita de otra forma pasó de 12 ms a 4.225 ms y 2.488 MB.
- **Tope y paginado.** Una zona grande puede tener miles de avisos. 500 por página, ordenado
  por señal de captación (dueño directo primero, después caídos, después días publicados).

## El enganche con Tracking Performance

Ya existe un pipeline maduro en `components/tracking/pipeline/` (5 archivos sobre
`@dnd-kit`) con etapas Prospección → Prelisting → Prebuying → Captación → Reserva → Cierre.
**Sus tarjetas son personas con teléfono** (`lib/tracking/pipeline.ts`), las de Farming son
direcciones. Son objetos distintos: Farming tiene su propio tablero, no se mezclan.

Se tocan en un solo punto: cuando en una dirección aparece un propietario con teléfono, esa
persona **es** una tarjeta de Tracking del lado vendedor. Entonces:

- En la fila del propietario aparece **«→ pasarlo a mi pipeline»**. Lo aprieta y se crea la
  actividad de prospección reusando la acción que ya existe
  (`actions/tracking/savePerformanceLog.ts`), con el nombre y el teléfono ya cargados.
- El `id` del log vuelve a `farming_propietarios.tracking_log_id`, y las dos tarjetas se
  muestran cruzadas («vino de farming: «Belgrano R» · Av. Ejemplo 1200»).
- **Nunca automático.** El que dijo «dejá la carta, gracias» no es una prospección, y el
  Tracking del equipo no se infla sin que nadie lo haya decidido.

Mismo botón al llegar a **Captada**, que en Tracking es la etapa `captacion`.

## Los 9 indicadores, sin cargar nada aparte

| Indicador del punto 8 del PDF | De dónde sale |
|---|---|
| Cuadras relevadas | `tramo` distintos con al menos una dirección |
| Edificios / propiedades relevados | filas de `farming_direcciones` |
| Unidades potenciales | suma de `unidades_totales` |
| Cartas / contactos realizados | filas de `farming_contactos` |
| Encargados / referentes contactados | direcciones con encargado y al menos una visita |
| Respuestas recibidas | tarjetas que pasaron por «Respondió» |
| Tasaciones solicitadas | contactos de tipo `tasacion` |
| Entrevistas con propietarios | contactos de tipo `entrevista` |
| Captaciones obtenidas | tarjetas en «Captada» |

El tablero **es** el reporte. No hay una pantalla de carga de indicadores.

## Las 6 columnas

`relevado` → `presentado` → `en_secuencia` → `respondio` → `tasacion` → `captada`, más
`descartada` al costado, plegada.

Al soltar una tarjeta en otra columna se abre el diálogo —mismo molde que el
`PipelineStageDialog` que ya existe—: qué hiciste, cuál es el próximo paso y cuándo. **Sin
la fecha no se guarda el movimiento.** Es la regla 4 del punto 9 del PDF.

La próxima acción y su fecha van como **línea visible en la tarjeta, nunca en un globito de
ayuda**: en el celular los globitos no se abren, y es justo el dato que hay que ver de un
vistazo.

## Lo que deliberadamente NO va

- **Cartas generadas por IA.** El PDF define 7 contactos con tema propio y da ganas de
  automatizarlos, pero es otro módulo y Marketing IA ya escribe. Acá solo se registra que la
  carta se entregó.
- **Recorrido optimizado de la cuadra** y notificaciones push.
- **El «informe de mercado de la zona»** del contacto 5: ya existe, es el ACM y el Pulso de
  Mercado.
- **Farming para el director como usuario que releva.** Es una herramienta de asesor.

## Riesgos y trampas conocidas

| Riesgo | Qué se hace |
|---|---|
| La consulta de avisos no engancha el índice geográfico | `EXPLAIN ANALYZE` contra producción con caché frío, antes de dar la solapa por hecha |
| Un trazo a mano alzada cruzado consigo mismo rompe el cálculo de choque | `booleanValid` antes de guardar; se pide redibujar |
| Dos zonas que comparten una calle se marcan como choque | umbral de superposición real (100 m² o 1%) |
| La RLS escrita a mano deja pasar a un asesor ajeno | script de ataque contra producción; no está hecho hasta que el ataque falla |
| 6 columnas en un teléfono | se mide en el navegador con emulación de celular, no de la captura |
| `mercado_avisos` tiene PK compuesta por la partición | la tarjeta guarda `aviso_id` **y** `aviso_es_dueno_directo` |
| La red solo tiene CABA y Don Torcuato cargados | la zona de prueba se dibuja ahí; en La Plata daría verde sin probar nada |
| **Editar el trazo borra trabajo del asesor** | prueba que achica una zona sobre una tarjeta con contactos cargados y exige que siga en el tablero; se la ve fallar antes de implementar la regla |
| Redibujar una zona choca contra su propia versión anterior | el control de choque excluye la zona que se está editando; prueba propia |

## Cómo se verifica

- **En el navegador, escritorio y celular emulado, en los dos temas** (claro y oscuro). Un
  tablero de 6 columnas en un teléfono es donde esto se rompe.
- **El solapamiento se prueba con el bug puesto:** primero la prueba que dibuja dos zonas que
  se pisan y exige que la segunda sea rechazada; se la ve fallar sin la validación, y recién
  después se implementa.
- **Los campos de texto se prueban tecleando**, no con `fill()`.
- **Con la cuenta de Leonardo (PRISMAIA - VAKDOR)**, nunca escribiendo sobre los datos de
  Central. Para probar el compartir hacen falta dos asesores en esa agencia: si no hay un
  segundo, se avisa antes de crear nada.
- **Las migraciones se aplican por Management API** con `SUPABASE_API_KEY_MANAGEMENT`, y un
  `create index concurrently` va en un envío aparte (no puede correr dentro de una
  transacción).

## En qué orden se construye

| Etapa | Qué queda funcionando | Por qué en ese orden |
|---|---|---|
| **1. El territorio** | dibujar desde Farming y desde el Buscador, **redibujar y sumar pedazos**, la validación de choque en las dos, contornos ajenos en el mapa, compartir, borrar/archivar, liberar | sin esto las otras dos solapas no tienen de dónde agarrarse |
| **2. A la venta en mi zona** | el listado con los 4 atajos de captación, medido | da valor el primer día, sin que el asesor cargue nada |
| **3. El tablero y la caminata** | «+ agregar dirección», propietarios, 6 columnas, diálogo obligatorio, historial firmado, los 9 indicadores, el botón a Tracking | es la más grande y se apoya en las dos anteriores |

Cada etapa: rama nueva desde `main`, prueba real en el navegador, OK de Leonardo, y recién
ahí commit y merge.

## Tres topes que se implementan así, salvo que Leonardo diga otra cosa

No bloquean nada: van con estos valores y se cambian con una línea si al verlos en pantalla
no cierran.

1. **Máximo 3 zonas de farming activas por asesor.** El PDF, punto 9: «territorio: trabajar
   una zona concreta, no dispersarse». Las liberadas no cuentan.
2. **Máximo 5 km² por zona**, sumando todos sus pedazos. Sin tope, el primero que dibuja
   puede reclamar medio barrio y la exclusividad se vuelve un candado en vez de un reparto.
3. **El director no dibuja ni asigna zonas.** Ve, mide y libera. Asignar no fue pedido y
   agrega una pantalla entera.
