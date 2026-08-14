# ACM · Hoja "La propiedad y su entorno" con datos abiertos del gobierno

**Fecha:** 13-ago-2026 · **Rama:** nueva, desde `main` actualizado

## De dónde sale esto

Leonardo pidió que al apretar el botón que crea la ficha pública se haga **un análisis completo de la
propiedad, la zona y el barrio**, contado como storytelling, alimentado por endpoints de datos abiertos
del gobierno. Trajo una guía técnica con endpoints y parámetros.

**Esa guía se verificó endpoint por endpoint antes de diseñar nada.** Casi la mitad de las URLs que
traía no existen, y dos de sus supuestos centrales son falsos. Lo que sigue está armado sobre lo que
respondió de verdad, no sobre la guía. El detalle de la verificación está en "Anexo · Qué se verificó".

Además, durante el diseño Leonardo sumó tres cosas:

1. Que la **descripción de la propiedad** (la que hoy genera la IA a partir de las fotos y hoy vive en
   la portada) se **mude** a esta hoja nueva, para que la portada quede limpia.
2. Que la hoja incluya **un mapa con los marcadores** de los puntos de interés.
3. Que el formato y la estructura sean **profesionales**, con **copy de storytelling**.

---

## Lo que ve el cliente

Una hoja A4 nueva, insertada **entre la portada y la primera hoja de comparable**. Título:
**"La propiedad y su entorno"**.

```
┌──────────────────────────────────────────────────────────┐
│ BELGRANO · COMUNA 13          8,1 km² · 26 espacios verdes│ ← banner, color de la agencia
├───────────────────────────────┬──────────────────────────┤
│                               │  ┌────────────────────┐  │
│ LA PROPIEDAD                  │  │                    │  │
│                               │  │   🚇   ● ARCOS     │  │
│ Departamento de 78 m² en piso │  │        2800        │  │
│ alto, con vista despejada al  │  │  🎓   🌳     🏥    │  │
│ frente y muy buena entrada de │  │                    │  │
│ luz natural durante todo el   │  └────────────────────┘  │
│ día. Cocina integrada al      │                          │
│ living, pisos de madera en    │  🚇  Juramento (Línea D) │
│ buen estado.                  │      550 m · 7 min       │
│                               │  🌳  Barrancas de Belgr. │
│ EL BARRIO                     │      400 m · 5 min       │
│                               │  🎓  12 escuelas en 1 km │
│ Belgrano es uno de los        │      8 estatales         │
│ barrios más consolidados de   │  🏥  Hospital Pirovano   │
│ la Comuna 13. A cuatro        │      1,2 km              │
│ cuadras de la propiedad se    │  💊  8 farmacias en 500m │
│ abren las Barrancas, el       │  🚌  15 · 29 · 42 · 60   │
│ pulmón verde histórico del    │      68 · 152            │
│ barrio, y la estación         │  🚓  Comisaría 13-B      │
│ Juramento de la línea D...    │      700 m               │
│                               │  🚲  3 Ecobici en 600 m  │
├───────────────────────────────┴──────────────────────────┤
│ [logo]                        ANÁLISIS COMPARATIVO DE MERC.│
└──────────────────────────────────────────────────────────┘
```

**La hoja no nombra ninguna fuente de datos** (decisión de Leonardo). Sin "datos abiertos GCBA", sin
"OpenStreetMap", sin nombres de organismos. El pie es el mismo pie de marca que ya tienen todas las
hojas de la ficha. La única excepción es el crédito del mapa: ver "El mapa".

**La división es la regla de oro de esta hoja:**

- **Columna derecha (datos duros).** Calculada. Nombres, distancias y conteos salen de la base o de
  OpenStreetMap. **La IA no los escribe ni los toca.**
- **Columna izquierda (relato).** La escribe la IA, pero **solo puede narrar los datos de la derecha**.

### Sobre el copy de storytelling

El relato del barrio no es una enumeración con conectores. Sigue una estructura fija de tres
movimientos, que es lo que hace que suene a persona y no a formulario:

1. **Ubicar** — qué tipo de barrio es y en qué comuna está.
2. **Caminar** — traducir las distancias a la experiencia de vivir ahí ("a cuatro cuadras se abren las
   Barrancas", no "espacio verde a 400 metros").
3. **Cerrar** — qué tipo de vida habilita ese conjunto.

Las distancias se dicen **en cuadras o en minutos caminando**, no en metros pelados: una cuadra de CABA
son ~100 m y a 4,5 km/h se caminan ~75 m por minuto. Los números exactos en metros quedan en la
columna derecha, donde corresponde.

**Prohibiciones duras del prompt** (van literales, no como sugerencia):

- No nombrar nada que no esté en la lista de datos (nada de shoppings, colegios famosos, avenidas).
- No adjetivar el valor de la propiedad ni sugerir que es buena inversión.
- No inventar historia, ni fundación, ni "tradicionalmente".
- Si un dato falta, no mencionarlo. Nunca escribir "no hay datos de X".

---

## Lo que ve el asesor

El botón **"Crear ficha"** hoy ya abre un paso de revisión donde el asesor lee y edita las
conclusiones antes de confirmar (`app/api/acm/ficha/route.ts:63` — el modo `preview`). La hoja del
entorno **entra en ese mismo paso**, no suma un paso nuevo:

```
┌─ Revisá antes de crear la ficha ────────────────────┐
│                                                     │
│ ☑ Incluir la hoja "La propiedad y su entorno"      │
│                                                     │
│   Belgrano · Comuna 13                              │
│   ┌─ el texto es editable ──────────────────────┐   │
│   │ Belgrano es uno de los barrios más          │   │
│   │ consolidados de la Comuna 13. A cuatro      │   │
│   │ cuadras de la propiedad se abren las        │   │
│   │ Barrancas...                                │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   Datos usados (no editables):                      │
│   🚇 Juramento (D) 550 m  ·  🌳 Barrancas 400 m     │
│   🎓 12 escuelas  ·  🏥 Pirovano 1,2 km  ·  💊 8    │
│                                                     │
│ ── Conclusiones del estudio ──  (como hoy)          │
│ ...                                                 │
│                    [ Confirmar y crear la ficha ]   │
└─────────────────────────────────────────────────────┘
```

Los datos duros se muestran **de solo lectura**: el asesor tiene que poder ver sobre qué escribió la IA
para juzgar el texto. Sin eso, revisar el texto es revisar al aire.

Si destilda la casilla, la hoja no se genera y la ficha sale como hoy.

---

## Cómo funciona por dentro

### El problema que define la arquitectura

Los datasets del gobierno son archivos completos (las escuelas de toda la ciudad, todas las farmacias,
todas las farmacias, todas las paradas de colectivo). Bajarlos y parsearlos cada vez que alguien crea una
ficha es inviable: la ficha tardaría más de un minuto y se caería contra el timeout.

**Se cargan una sola vez a la base**, con un script que se corre a mano y se puede volver a correr
cuando el gobierno actualice los datos. En el momento de crear la ficha, la consulta es SQL local.

Esto es posible porque **PostGIS 3.3.7 ya está habilitado** en la base (verificado). Eso resuelve por
sí solo las dos operaciones caras: en qué barrio cae un punto, y qué hay a menos de X metros.

### Las dos tablas nuevas

**`zona_barrios`** — los 48 barrios de CABA con su polígono.

| columna | tipo | para qué |
|---|---|---|
| `nombre` | text | "Belgrano" |
| `comuna` | int | 13 |
| `area_km2` | numeric | dato de contexto del banner |
| `geom` | `geometry(MultiPolygon, 4326)` | decir en qué barrio cae la propiedad |

**`zona_pois`** — todos los puntos de interés de CABA en una sola tabla.

| columna | tipo | para qué |
|---|---|---|
| `categoria` | text | `subte` · `escuela` · `hospital` · `farmacia` · `comisaria` · `espacio_verde` · `ecobici` · `parada_colectivo` · `ciclovia` |
| `nombre` | text | "Juramento" |
| `subtipo` | text | la línea del subte, la gestión de la escuela |
| `direccion` | text | opcional |
| `barrio`, `comuna` | text/int | control de calidad de la carga |
| `extra` | jsonb | lo propio de cada categoría (líneas que paran, superficie del parque) |
| `geom` | `geometry(Point, 4326)` | el punto — centroide en los casos que no son puntos |
| `geom_forma` | `geometry(Geometry, 4326)` nullable | la forma real cuando no es un punto: el polígono del parque, el trazado de la ciclovía. `NULL` en el resto |
| `fuente`, `actualizado_at` | text/timestamptz | trazabilidad |

Índices: `GIST(geom)` en las dos tablas, `GIST(geom_forma)` en `zona_pois`, y `(categoria)`.

`geom_forma` es lo que hace honesta la distancia de parques y ciclovías: el centro de las Barrancas
está mucho más lejos que su borde, y a nadie le importa el centro. Cuando existe, la distancia se mide
contra `geom_forma`; cuando es `NULL`, contra `geom`. El centroide se guarda igual porque es lo que se
dibuja en el mapa.

**RLS:** las dos tablas son **datos públicos del gobierno, no de ninguna agencia**. Van con RLS
activado y una política de solo lectura para cualquier usuario autenticado. La escritura queda para el
service role (el script de carga). Nada de tenant: no hay dato de cliente acá.

### El script de carga — `scripts/cargar-zona-pois.mjs`

Se corre a mano. Baja, normaliza y hace upsert por categoría. **Se puede correr una categoría sola**
(`node scripts/cargar-zona-pois.mjs subte`) para no rehacer todo cuando cambia un solo dataset.

Ningún archivo pasa de **~2 MB**: la carga completa es cuestión de segundos.

Fuentes exactas, todas verificadas con HTTP 200:

| Categoría | URL |
|---|---|
| barrios | `cdn.buenosaires.gob.ar/datosabiertos/datasets/innovacion-transformacion-digital/barrios/barrios.csv` |
| subte | `.../sbase/subte-estaciones/estaciones_de_subte.csv` |
| escuela | `.../ministerio-de-educacion/establecimientos-educativos/establecimientos_educativos.geojson` |
| hospital | `.../salud/hospitales/hospitales.csv` |
| farmacia | `.../ministerio-de-salud/farmacias/farmacias.geojson` |
| comisaria | `.../ministerio-de-justicia-y-seguridad/comisarias-policia-ciudad/comisarias_policia.csv` |
| espacio_verde | `.../secretaria-de-desarrollo-urbano/espacios-verdes/espacio_verde_publico.csv` |
| ciclovia | `.../transporte-y-obras-publicas/ciclovias/ciclovias.csv` |
| ecobici | `apitransporte.buenosaires.gob.ar/ecobici/gbfs/stationInformation` + `CLIENT_ID`/`CLIENT_SECRET` del `.env` |
| parada_colectivo | `.../transporte-y-obras-publicas/colectivos-paradas/paradas-de-colectivo.csv` (791 KB) |

**Las URLs no se hardcodean a ciegas.** El script las resuelve por el catálogo CKAN
(`data.buenosaires.gob.ar/api/3/action/package_show?id=<dataset>`), que es lo que hace que sobrevivan a
que el gobierno mueva un archivo de carpeta — exactamente lo que ya pasó con farmacias, espacios verdes
y comisarías respecto de la guía original.

**Tres trampas conocidas de la carga:**

1. **Las escuelas vienen en EPSG:9498**, no en lat/lon (verificado: el GeoJSON declara
   `urn:ogc:def:crs:EPSG::9498` y las coordenadas son `POINT (26519.67 74333.08)`). Se reproyectan con
   `ST_Transform` **en la base**, no en JavaScript: PostGIS ya tiene la definición del sistema y no hay
   que meter `proj4` ni acertarle a los parámetros a mano.
2. **Los espacios verdes son polígonos, no puntos.** Se guarda el centroide (`ST_Centroid`) como `geom`
   y la superficie real en `extra`. La distancia al centro de un parque grande subestima lo cerca que
   está el borde, así que para esta categoría se calcula contra el **polígono**, no contra el centroide
   — se guardan los dos.
3. **Las ciclovías son líneas.** Misma lógica: la distancia se mide al trazado, no a un punto.
4. **Las paradas de colectivo traen la coma como separador decimal** (`"-58,3709946"`, verificado).
   Parseadas sin reemplazar la coma, todas las paradas de CABA aterrizan en el Golfo de Guinea. Las
   líneas vienen repartidas en seis columnas (`L1`…`L6`, con su sentido): se juntan en `extra`
   descartando vacíos.

**Control de calidad obligatorio al cargar:** cada POI trae del propio dataset el barrio que declara
(columna `bar`/`barrio`). Después de cargar, se cruza contra `zona_barrios` con PostGIS y **se reporta
el porcentaje de POIs cuyo punto NO cae en el barrio que ellos mismos declaran**. Si ese número se
dispara en escuelas, la reproyección está mal y la carga no se da por buena. Es el único chequeo que
detecta una reproyección silenciosamente torcida.

### La función SQL — `zona_resumen(lat, lon)`

Una sola llamada devuelve todo lo que necesita la hoja.

**Primero, el contexto del barrio** (lo que va en el banner de arriba): nombre y comuna por
point-in-polygon contra `zona_barrios`, superficie en km², y **cuántos espacios verdes públicos tiene
el barrio entero** — este último contando los `zona_pois` de categoría `espacio_verde` que caen dentro
del polígono del barrio, no por radio.

**Después, los alrededores de la propiedad**: el POI más cercano de cada categoría y los conteos por
radio. Radios por categoría:

| Categoría | Radio | Qué devuelve |
|---|---|---|
| subte | 1.500 m | el más cercano, con línea |
| espacio_verde | 1.200 m | el más cercano, con nombre y superficie |
| escuela | 1.000 m | conteo total + cuántas estatales |
| hospital | 3.000 m | el más cercano |
| farmacia | 500 m | conteo |
| comisaria | 1.500 m | la más cercana |
| ecobici | 600 m | conteo |
| parada_colectivo | 300 m | las líneas distintas que paran |
| ciclovia | 400 m | la más cercana |

Un solo `SELECT` con `LATERAL` por categoría: es la forma de que sea una consulta y no nueve.

### Fuera de CABA

`zona_resumen` devuelve vacío si el punto no cae en ningún barrio. Ahí entra el respaldo:
**Overpass / OpenStreetMap**, en vivo, con las mismas categorías traducidas a tags de OSM
(`railway=station`, `amenity=school|pharmacy|hospital|police`, `leisure=park`, `highway=bus_stop`).

Verificado sobre Olivos: devuelve farmacias reales con nombre, horario y teléfono. **Se consulta por
GET, no por POST** (por POST devolvió HTML de error).

Reglas del respaldo, porque es un servidor comunitario y no nuestro:

- Timeout de 20 segundos. Si no contesta, **la hoja no se genera y la ficha sale igual**. Nunca se
  bloquea la creación de la ficha por esto.
- Si Overpass devuelve menos de 3 categorías con dato, la hoja no se genera: media hoja vacía es peor
  que ninguna hoja.
- La hoja **no dice que los datos vinieron de otro lado**. Se ve idéntica a la de CABA. Que la fuente
  cambie es un detalle interno; queda registrado en el snapshot para poder auditarlo, pero el cliente
  no lo ve.

### El mapa

Un endpoint propio, **`GET /api/acm/mapa-zona`**, arma un PNG: baja las 6–9 tiles de OpenStreetMap que
cubren el recuadro, las pega, y dibuja encima el marcador de la propiedad y los de los POIs.

**Por qué imagen fija y no mapa interactivo:** la ficha se imprime a PDF desde el navegador
(`PrintButton`). Un mapa interactivo sale en blanco o a medio cargar en el PDF. Un `<img>` ya cargado
sale siempre.

**Por qué OpenStreetMap y no MapTiler:** la `NEXT_PUBLIC_MAPTILER_KEY` del `.env` está **restringida
por dominio** y devuelve `403 Key usage restricted` desde el servidor (verificado). La app ya tiene un
respaldo a OSM en `components/mapa/mapa-lienzo.tsx`; esto usa la misma fuente.

El PNG se guarda en Supabase Storage con nombre derivado de coordenada+zoom, así que dos fichas de la
misma cuadra reusan la imagen. La URL guardada va al snapshot.

**Respetar la política de uso de OSM:** `User-Agent` identificando a PRISMA, y el caché es lo que
evita el uso abusivo (un puñado de tiles por ficha, no por vista).

**La única fuente que sí se nombra, y por qué.** El dibujo del mapa lleva `© OpenStreetMap` en letra
chica en una esquina, dentro de la imagen. No es una cita de fuente: es la condición de la licencia
bajo la que se puede usar ese mapa, igual que el `©Google` que aparece en cualquier mapa de Google.
Sin eso no se puede usar el mapa legalmente. Ocupa ~8 px de alto y en el A4 impreso no se lee salvo que
alguien lo busque. **Ninguna otra fuente aparece en ningún lado de la ficha.**

### Dónde vive el resultado

Un campo nuevo y **opcional** en el snapshot (`lib/acm/ficha.ts`):

```ts
export interface FichaZona {
  barrio: string;
  comuna: number | null;
  area_km2: number | null;
  fuente: "gcba" | "osm";   // interno, para auditar. NO se muestra en la hoja
  relato: string;              // el texto de la IA, ya revisado por el asesor
  pois: FichaZonaPoi[];        // los datos duros, calculados
  mapa_url: string | null;
}
// en AcmFichaSnapshot:
zona?: FichaZona | null;
```

**Opcional a propósito:** las fichas ya creadas no tienen el campo y tienen que seguir abriendo igual.
Mismo criterio que `zona_score` cuando se agregó en agosto.

### Archivos

| Archivo | Qué |
|---|---|
| `supabase/migrations/<ts>_zona_pois.sql` | nuevo · las dos tablas, índices, RLS y `zona_resumen()` |
| `scripts/cargar-zona-pois.mjs` | nuevo · carga los datasets, con control de calidad |
| `lib/acm/zona.ts` | nuevo · geocodificar con Georef, llamar a `zona_resumen`, respaldo Overpass, armar `FichaZona` |
| `lib/acm/zona-relato.ts` | nuevo · el prompt y la llamada a Gemini |
| `lib/acm/zona-relato.test.ts` | nuevo · tests del armado del prompt y del parseo |
| `app/api/acm/mapa-zona/route.ts` | nuevo · el PNG de tiles + marcadores |
| `app/api/acm/ficha/route.ts` | editar · calcular la zona en `preview`, guardarla al confirmar |
| `app/ficha-acm/[token]/page.tsx` | editar · la hoja nueva; sacar la descripción de la portada |
| `app/asesor/acm/components/step4-resultado.tsx` | editar · la casilla y el texto editable en la revisión |
| `lib/acm/ficha.ts` | editar · los tipos `FichaZona` / `FichaZonaPoi` |

`lib/acm/zona.ts` se mantiene separado de `ficha.ts` a propósito: `ficha.ts` ya tiene 310 líneas y una
responsabilidad clara (calcular la comparación de precios). El entorno es otra cosa y con otra fuente.

---

## Qué puede salir mal

| Riesgo | Qué se hace |
|---|---|
| La IA inventa un lugar que no está en los datos | Prompt con prohibiciones literales + el asesor revisa antes de crear |
| Georef no encuentra la dirección | Cae al barrio que escribió el asesor (match por nombre contra `zona_barrios`); si tampoco, sin hoja |
| Reproyección de escuelas torcida | El control de calidad de la carga la detecta antes de que llegue a producción |
| Overpass caído o lento (GBA) | Timeout de 20 s, sin hoja, la ficha sale igual |
| El gobierno mueve un archivo de carpeta | El script resuelve por catálogo CKAN, no por URL fija |
| El texto no entra en el A4 | Tope de caracteres en el relato + `line-clamp`, mismo criterio que `.cover-desc` |
| Datos viejos en la base | `actualizado_at` por POI; la hoja no muestra fecha de dataset al cliente, pero se puede auditar |

**Costo:** ~US$0,003 por ficha (un párrafo de `gemini-3.5-flash`, el mismo modelo que ya usa el ACM
para analizar fotos). Todos los datos son gratis y ninguno pesa más de ~2 MB.

---

## Lo que NO entra

- **Nada en tiempo real.** Ni "el subte llega en 3 minutos" ni "hay 12 bicis disponibles". La ficha es
  un PDF que el cliente abre tres días después: un dato en vivo queda viejo y hace quedar mal al
  documento. Solo se usa la ubicación fija de las estaciones.
- **Nada de delitos ni seguridad estadística.** El dataset existe, pero poner tasas de delito en un
  documento firmado por la inmobiliaria es un riesgo comercial y legal que nadie pidió.
- **No se edita la hoja de una ficha ya creada.** El snapshot es inmutable a propósito: el link que
  tiene el cliente no puede cambiar bajo sus pies.
- **No se toca el `match_pct` ni el cálculo de comparables.** Esta hoja es narrativa; el análisis de
  precios sigue siendo el de hoy, intacto.

---

## Anexo · Qué se verificó (13-ago-2026)

Todo lo de abajo se probó con peticiones reales antes de escribir esta especificación.

**Lo que la guía original decía y era falso:**

| Afirmación de la guía | Realidad medida |
|---|---|
| Georef devuelve el barrio en `localidad.nombre` | Para CABA devuelve `departamento: "Comuna 13"`. **No hay barrio.** Por eso hace falta el polígono |
| Escuelas en `/datasets/ministerio-de-educacion/...` | **404**. La ruta correcta lleva `/datosabiertos/` |
| Farmacias en `/datasets/salud/farmacias/` | **404**. Es `/ministerio-de-salud/farmacias/` |
| Comisarías en `/datasets/seguridad/comisarias/` | **404**. El dataset es `comisarias-policia-ciudad` |
| Colectivos: hay que bajar el GTFS y cruzar 4 archivos | Innecesario. Existe `paradas-de-colectivo.csv`, **791 KB**, con lat/lon, barrio y hasta 6 líneas por parada. El GTFS pesa 209 MB y no hace falta |
| Espacios verdes en `/espacio-publico/espacios-verdes/` | **404**. Es `/secretaria-de-desarrollo-urbano/espacios-verdes/` |
| "las credenciales de API Transporte que ya tienes" | No estaban documentadas. **Se encontraron**: `CLIENT_ID`/`CLIENT_SECRET` del `.env` son de API Transporte y funcionan |
| El CSV de escuelas no tiene coordenadas | Sí las tiene, pero **en EPSG:9498**, no en lat/lon |

**Lo que sí funciona (HTTP 200 y contenido correcto):** Georef, barrios.csv (con polígonos WGS84),
escuelas GeoJSON, hospitales.csv (WKT lat/lon), farmacias, comisarías (lat/lon + barrio), espacios
verdes (MULTIPOLYGON), subte (lat/lon + línea), Ecobici vía API Transporte con las credenciales del
`.env`, ciclovías, catálogo CKAN, y Overpass sobre Olivos.

**Contexto medido en la base:** de los 53 ACM ya hechos, **48 son de CABA** (Belgrano 24, Palermo 8,
Saavedra 4, y sueltos Núñez, Recoleta, Retiro, San Telmo, Flores, Monserrat) y **5 son de GBA**
(Olivos ×2, Monte Grande, Belén de Escobar, Don Torcuato). Eso es lo que justifica que CABA sea el
camino principal y OSM el respaldo, y no al revés.

**PostGIS:** `3.3.7`, ya instalado.
