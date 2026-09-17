# Prefactibilidad — diseño

Fecha: 2026-09-12
Estado: diseño aprobado en chat por partes (pantalla, datos, cálculo, ficha). Falta la
revisión del spec y el plan.
Rama: `feat/prefactibilidad` (worktree `PRISMA-SYSTEM-prefactibilidad`, desde `origin/main`
en `1b4d2a5`).

## El problema

Un asesor que quiere captar un terreno o una casa vieja en CABA tiene que poder decirle al
dueño, en la primera charla, **cuánto se puede construir ahí y cuánto vale su tierra**. Hoy
eso lo resuelve un arquitecto en días, o herramientas de terceros: bairescodeai.app (beta,
sin precio publicado), FactibilIA (ARS 19.900 a 99.900 por mes para bajar el PDF), TodoProps
(gratis, sin registro). Ninguna vive dentro del flujo de la inmobiliaria ni usa los
comparables reales de la agencia.

El dato oficial es público, gratis y sin clave: el GCBA publica el Código Urbanístico
**parcela por parcela** y el catastro responde en vivo. Verificado el 11-sep-2026 con dos
direcciones que no están en ninguna base nuestra (Zuviría 3939 y Av. Cabildo 2040): los
números coinciden con los de TodoProps.

**Sirve al único cliente**: la cartera de Central es CABA (544 propiedades con coordenadas).
Es una función nueva para sostener el abono.

## Decisiones tomadas en el chat

| Pregunta | Decisión |
|---|---|
| ¿Para quién es el resultado? | **Captar terrenos: ficha para el dueño del lote**, con link público e impresión, como el ACM. |
| ¿Hasta dónde con la plata? | **Edificabilidad + valor de la tierra** con comparables de `mercado_avisos`. Sin plusvalía ni residual en la v1. |
| ¿Qué tan fino el cálculo? | **Huella real en manzana típica; rango conservador con aviso en el resto.** Validar contra Ciudad 3D con 20 parcelas antes de mostrar nada. |
| Datos | **Cargar lo liviano, pedir lo pesado en vivo** (opción B): CSV del Código y puertas en Supabase; contorno del lote al catastro con caché. |
| Roles | Director y asesor lo ven igual, en el grupo Propiedades del menú, debajo de ACM. |
| IA | **Ninguna.** Cálculo determinista, no gasta créditos. |
| Alcance geográfico | **Solo CABA.** Fuera de CABA la pantalla lo dice. |
| Leyenda | Obligatoria en pantalla y en la ficha: estudio orientativo, no reemplaza al profesional matriculado ni al certificado urbanístico oficial. |

## Qué se construye

Una entrada nueva en el menú, **"Prefactibilidad"**, en el grupo Propiedades, para
`/director/prefactibilidad` y `/asesor/prefactibilidad`. Se agrega en `lib/nav/menu.ts`
(el test `menu.test.ts` fija nombres y direcciones).

La pantalla tiene dos mitades, como la solapa Mapa del Buscador:

- **Izquierda, el mapa** (Leaflet, el que ya usamos). Arriba, un buscador de direcciones que
  autocompleta con el callejero oficial del GCBA. Al elegir una, el mapa vuela ahí, pone el
  pin y **pinta el contorno del lote** en cobre. Sobre el contorno se dibuja la huella
  edificable calculada, con otro trazo. Si la dirección no es de CABA, el mapa no se mueve y
  aparece "Por ahora solo Ciudad de Buenos Aires".
- **Derecha, la ficha del lote**, tres bloques que se van llenando:
  1. **El lote**: sección-manzana-parcela, superficie, frente, fondo, si es PH, qué hay
     construido hoy (pisos y unidades según catastro), barrio y comuna.
  2. **Qué se puede construir**: la unidad de edificabilidad con su nombre en criollo
     ("Altura media: planta baja y 5 pisos, más 2 retirados"), altura máxima, plano límite,
     m² por planta, m² construibles y m² vendibles. En **modo rango** (ver abajo) muestra el
     rango y el aviso "requiere estudio profesional" **arriba** del bloque, no al pie.
  3. **Cuánto vale la tierra**: rango de valor del lote a partir de terrenos comparables de
     la red, con la lista de comparables y su distancia, como en el ACM. Con menos de 5
     comparables: "sin comparables suficientes", nunca un número.

Debajo, dos botones: **"Guardar"** (queda en "Mis prefactibilidades": lista con fecha,
dirección y modo) y **"Compartir ficha"** (link público imprimible). La leyenda va fija al
pie en pantalla y en el link.

En el celular las mitades se apilan: buscador fijo arriba, mapa, ficha.

**No entra en la v1:** clic en un lote cualquiera del mapa (v2, requiere cargar los
polígonos), plusvalía (Ley 6.062), edición manual de parámetros, balcones, retiros
obligatorios de frente, completamiento de tejido, servidumbres, compensaciones.

## Las fuentes, verificadas el 11-sep-2026

Todas del GCBA, licencia CC-BY-2.5-AR, sin clave ni cuota. Las URLs se guardan en un
archivo de configuración con la fecha de la publicación, y la ficha muestra esa fecha.

| Fuente | Qué da | Cómo | Estado |
|---|---|---|---|
| USIG normalizar `servicios.usig.buenosaires.gob.ar/normalizar/?direccion=…&geocodificar=true` | Dirección normalizada, código de calle, coordenadas WGS84 | En vivo, por ruta nuestra | OK, instantáneo |
| Catastro epok `epok.buenosaires.gob.ar/catastro/parcela/?smp=…` | superficie, frente, fondo, PH, pisos, unidades, puertas | En vivo, con caché | OK, 0,3 s. Por `x,y` devuelve vacío: **no sirve para punto→parcela** |
| Catastro epok `catastro/geometria/?smp=…&srid=4326` | Polígono del lote | En vivo, con caché | OK |
| Catastro epok `catastro/geometria/?sm=SSS-MMM&srid=4326` | Polígono de la manzana | En vivo, con caché | OK |
| Dataset **Código Urbanístico** (CSV 53 MB, 318.128 filas, publicado 24-jun-2026, contenido al 31-dic-2024) | Por parcela: `uni_edif_1..4` (alturas), `plano_l`, `tipo_mza`, `catalogado`, `dist_1_grp/esp` (AE, U, APH, RUA, UP…), `dist_cpu_1`, `fot_*`, `barrio`, `comuna`, `alicuota`, `inc_uva_21` | Carga por script | Coincide con TodoProps en la parcela de prueba |
| Dataset **Parcelas** → recurso **Frentes parcelas** (CSV 49 MB, 2021) | Por frente: calle, números de puerta (`num_dom`, separados por punto), `smp`, `parc_esq`, `ochava` | Carga por script | Resolvió Cabildo 2040 → 039-097-008b |
| Dataset **Manzanas catastrales** (GeoJSON, 7-jul-2026) | Polígonos de manzana | Carga por script (liviano) o en vivo | Existe; alternativa al epok por `sm` |
| Dataset **Superficie edificable en planta** (1.005.308 filas, mayo 2021) | Cuerpo principal / retiro 1 / retiro 2 / basamento con alturas por parcela | **No se carga.** Solo para validar el cálculo | A la parcela Zuviría 3939 no la tiene; alturas de la versión 2018 del Código |
| Dataset Parcelas (GeoJSON 438 MB) | Polígonos de las 318 k parcelas | **v2** (clic en el mapa) | Existe |

La API del portal de datos rechaza clientes sin `User-Agent` de navegador ("Request
Rejected"). Los certificados de `usig.buenosaires.gob.ar` fallan la verificación en algunos
clientes: por eso todo pasa por rutas del servidor y no por el navegador.

## Los datos (tablas nuevas)

Primero lo que **no se toca**: `properties`, leads, clientes, ACM, `mercado_avisos`,
`mapa_*`. Todo lo nuevo son tablas aparte que se pueden borrar sin que la app se entere.

1. **`gcba_parcelas_cur`** — el CSV del Código, solo las columnas que usamos: `smp` (clave,
   normalizado en minúsculas como viene), `seccion`, `manzana`, `parcela`, `uni_edif_1..4`,
   `plano_l`, `tipo_mza`, `catalogado`, `dist_1_grp`, `dist_1_esp`, `dist_2_grp`,
   `dist_2_esp`, `dist_cpu_1`, `fot_em_1`, `barrio`, `comuna`, `alicuota`, `inc_uva_21`,
   `fuente_fecha` (2024-12-31) y `publicado` (2026-06-24). Solo lectura para la app.
2. **`gcba_puertas`** — una fila por puerta: `calle` (como viene en frentes), `altura`,
   `smp`, `es_esquina`, `tiene_ochava`. Se abre `num_dom` ("3939.3943.3945.3947") en filas.
   Índice por (`calle`, `altura`). La resolución dirección→parcela normaliza el nombre de
   calle con el que devuelve USIG (`nombre_calle`, p. ej. "CABILDO AV.") contra el de frentes
   ("AV. CABILDO"): se guarda una columna `calle_normalizada` sin puntos, sin tildes, con las
   partículas ("AV", "AVDA", "GRAL", "DR") ordenadas al final. Si la normalización no
   encuentra la puerta, se prueba por `codigo_calle` de USIG contra las puertas del catastro
   epok cuando ya hay parcela candidata en la misma cuadra.
3. **`gcba_parcela_cache`** — lo que devuelve epok la primera vez: `smp`, `geom`
   (geometry, 4326), `manzana_geom`, `catastro` (jsonb: superficie, frente, fondo, PH,
   pisos, unidades, puertas), `consultado_en`. La segunda consulta no toca al GCBA.
4. **`prefactibilidades`** — una fila por informe: `id`, `agency_id`, `user_id`,
   `direccion`, `smp`, `modo` (`exacto` | `rango`), `resultado` (jsonb congelado: entrada,
   constantes usadas con su artículo, huella, plantas, totales, comparables, fecha de datos),
   `token` (para compartir; nulo hasta que se comparte), `creado_en`. RLS por agencia igual
   que `shared_acm_reports`: el asesor ve las suyas, el director las de su agencia, la
   página pública lee **solo por token** desde el servidor, sin listar.

**Carga.** `scripts/gcba/cargar-cur.mjs` y `scripts/gcba/cargar-puertas.mjs`: bajan el CSV,
validan (cantidad de filas esperada ±1 %, columnas exactas, y la parcela `056-068-040b`
con `uni_edif_1=17.2`, `plano_l=24.2`, `dist_cpu_1="R2b II"`, `fot_em_1=1.2`,
`alicuota=0.1`, `inc_uva_21=50`), y suben en tandas con el rol de servicio. Se corren en
local primero; **a producción solo con el OK de Leonardo**. Se vuelven a correr a mano
cuando el GCBA publique otra versión; `publicado` cambia y la ficha lo muestra.

**Rutas del servidor** (todas exigen sesión; nadie usa PRISMA como proxy del GCBA):

- `GET /api/prefactibilidad/direcciones?q=` → autocompletar (USIG, `maxOptions=5`).
- `GET /api/prefactibilidad/parcela?calle=&altura=` → resuelve puerta→smp, trae o cachea
  epok, calcula y devuelve la ficha completa.
- `POST /api/prefactibilidad` → guarda. `POST /api/prefactibilidad/[id]/compartir` → token.
- `GET /prefactibilidad/[token]` → página pública (lee por token en el servidor).

**Cuando algo falla, qué ve la persona:**

- GCBA no responde: "El catastro de la Ciudad no está respondiendo, probá en unos minutos".
- La puerta no existe en el catastro: "No encontramos ese número. Probá con otro número de
  la misma cuadra". Es el caso de la obra nueva sin numerar.
- La parcela existe pero no tiene datos de Código (146 marcadas "Sin dato"): lo dice así.
- Fuera de CABA: "Por ahora solo Ciudad de Buenos Aires".

Nunca un cartel rojo genérico.

## El cálculo

Todo en `lib/prefactibilidad/` como funciones puras sobre GeoJSON con Turf, cada una con
su test. **Ninguna constante va a mano en el código**: viven en
`lib/prefactibilidad/codigo.ts` con el artículo del Código del que salen (Ley 6.099, texto
consolidado por Ley 6.776, BOCBA 7026 del 26-dic-2024; PDF "Cuerpo principal" del dataset,
páginas 137 a 182). Las geometrías se proyectan a metros (Turf trabaja en grados; las
distancias se calculan con `turf.distance` / proyección local) antes de medir.

**Paso 1: la manzana.** Polígono de la manzana (epok por `sm`, o el dataset). Se simplifica
(`turf.simplify`, tolerancia 1 m) y se mide si es **típica** según art. 6.4.2.1: cuatro
lados, semisuma de lados opuestos ≥ 62 m, superficie ≥ 4.000 m². Si no, el Código dice que
la línea la fija el organismo caso por caso → **modo rango**. La bandera `tipo_mza` del CSV
es el segundo control: si discrepa con la medición, también rango.

**Paso 2: la línea de frente interno (L.F.I.), art. 6.4.2.** Paralela a cada línea oficial,
a distancia **d = ¼ de la distancia entre los puntos medios de las líneas oficiales
opuestas**. Se construye el espacio libre de manzana (polígono interior) y la huella
edificable es **lote ∩ (manzana − espacio libre)**. Si la L.F.I. no alcanza al lote (lote
más corto que la banda), rige art. 6.4.2.4: distancia mínima no edificable desde el fondo de
**4 m** en USAB 0/1/2, **6 m** en USAM y USAA, **8 m** en CM y CA.

**Paso 3: la altura (art. 6.2, con la reforma 2024).**

| Unidad | `uni_edif_1` | Altura / plano límite | Pisos | Retirados (art. 6.3) | Basamento hasta L.I.B. |
|---|---|---|---|---|---|
| Corredor Alto (CA) | 38 | 38 m, PB mín. 3 m | PB + 12 | 2 | Sí, hasta 6 m de altura |
| Corredor Medio (CM) | 31.2 | 31,2 m, PB mín. 3 m | PB + 10 | 2 | Sí, hasta 6 m |
| Altura Alta (USAA) | 22.8 | 22,8 m, PB mín. 3 m | PB + 7 | 2 | No |
| Altura Media (USAM) | 17.2 | 17,2 m, PB mín. 3 m | PB + 5 | 2 | No |
| Altura Baja 2 (USAB2) | 14.6 | plano límite 14,6 m, PB mín. 2,6 m | PB + 4 | 0 | No |
| Altura Baja 1 (USAB1) | 12 | plano límite 12 m, PB mín. 2,6 m | PB + 3 | 0 | No |
| Altura Baja 0 (USAB0) | 9 | plano límite 9 m, PB mín. 2,6 m | PB + 2 | 0 | No |

Los pisos se derivan de la altura con planta baja mínima y entrepisos de ~2,85 m (USAM: 3 +
5 × 2,84 = 17,2). Son los que usa el mercado y los que muestra TodoProps ("5 niveles" para
USAM). Los dos niveles retirados (art. 6.3, para CA, CM, USAA y USAM): el primero a **2 m**
de la línea oficial, altura máx. 3 m; el segundo a **4 m** de la línea oficial **y de la
L.F.I.**, sin pasar el plano límite = altura máxima + **7 m** (USAM: 24,2 m, coincide con
`plano_l` del CSV). Se calculan **recortando la huella** (`turf.buffer` negativo desde los
lados correspondientes), no con un porcentaje. En USAB 0/1/2 la altura máxima es el plano
límite: sin retirados.

En **CA y CM** el basamento (art. 6.2.1, 6.2.2, 6.4.3.3) puede ocupar hasta la **línea
interna de basamento (L.I.B.)**, a **⅓** de la distancia entre puntos medios, con altura hasta
6 m: se suma a planta baja y primer piso la franja entre L.F.I. y L.I.B. dentro del lote.

**Paso 4: totales.** m² por planta = área de la huella (y de cada recorte para los
retirados). m² construibles = suma de plantas. **m² vendibles = construibles × 0,80**,
constante visible y editable en `codigo.ts` (mercado: 78 a 85 %; se toma abajo). Balcones no
se cuentan. Unidades y cocheras estimadas: no en v1.

**Paso 5: la tierra.** Terrenos en venta de `mercado_avisos` (`tipo = 'Terrenos'`,
operación venta, con precio y superficie) a menos de **800 m** del centroide del lote,
excluyendo los apartados por el mismo criterio del ACM. Mediana y rango intercuartil de
USD/m² de lote × superficie del lote → **rango de valor** y USD/m² de tierra. Con menos de
**5** comparables: "sin comparables suficientes".

**Modo rango** (en lugar de número exacto, con aviso arriba) cuando se cumple cualquiera:

- Esquina u ochava (`es_esquina`, `tiene_ochava` de frentes; o el lote toca dos líneas
  oficiales de la manzana).
- Manzana atípica (Paso 1).
- Dos alturas distintas en la parcela (`uni_edif_2 ≠ 0`; p. ej. Cabildo 2040: 38 y 31,2).
- `dist_1_grp` en AE, U, APH, RUA, UP, "Espacio Publico", "Area de Renovacion", EE, UF;
  `catalogado ≠ 0`; `uni_edif_1 = 0`; o "Sin dato".
- Frente a dos calles (art. 6.4.7): el lote toca dos líneas oficiales no adyacentes.

El rango se arma con el **piso** = banda edificable mínima de 16 m desde la línea oficial
(la garantiza el art. 6.4.3, casos especiales de L.I.B.) × pisos de la unidad, y el **techo** = huella completa hasta la
L.F.I. × pisos. Si la parcela ya tiene un edificio consolidado en PH, se calcula igual y la
ficha aclara que hoy hay un edificio.

Volumen de casos, medido sobre el CSV: `uni_edif_1 = 0` en 37.253 parcelas (12 %); AE
51.217 (16 %); catalogados 9.881; alícuotas 0,10 / 0,18 / 0,27 / 0,35 (la plusvalía queda
para v2, pero el dato ya está cargado).

## La ficha pública

Mismo mecanismo que el ACM: "Compartir ficha" congela `resultado` y genera el `token`. La
página `/prefactibilidad/[token]` abre sin login con el material institucional de la
agencia (logo, colores, datos del asesor) que ya se configura para el ACM. Orden:

1. Dirección, barrio y **el plano del lote** con la huella edificable encima. No es una
   captura del mapa: es un **SVG generado desde la geometría** (lote, L.F.I., huella, norte
   y escala), así imprime siempre igual y sale nítido en el PDF con el botón de imprimir que
   ya existe.
2. "Qué se puede construir", con los pisos en criollo y la tabla de plantas.
3. "Cuánto vale la tierra", con los comparables usados.
4. Al pie: fecha del dato del GCBA y la leyenda: **"Estudio orientativo elaborado con datos
   públicos del Gobierno de la Ciudad de Buenos Aires. No reemplaza el informe de un
   profesional matriculado ni el certificado urbanístico oficial."**

En modo rango el aviso "requiere estudio profesional" va **arriba**, antes del plano.

## Qué se congela y qué no

Se congela todo lo que entró al cálculo y todo lo que salió: geometrías, constantes usadas
con su artículo, comparables con precio y distancia, fecha del dato. Si el GCBA publica un
Código nuevo o cambian los avisos, los links ya enviados **no cambian**. Una prefactibilidad
guardada muestra "recalcular" si `publicado` de `gcba_parcelas_cur` es posterior a su
`creado_en`.

## Qué NO se toca

- El ACM, el Buscador, el mapa de precios, `mapa_manzanas` (que sigue con OSM: es para
  precios, no para la L.F.I.).
- Las tablas de propiedades, leads y clientes.
- El menú, salvo la entrada nueva (y su test).
- Ningún rol de servicio en rutas nuevas; solo en la carga inicial.

## Cómo se prueba

**Antes de tocar la pantalla** (el orden es parte del diseño):

1. Unitarias en `lib/prefactibilidad/*.test.ts`: manzana sintética de 100 × 100 m → L.F.I. a
   25 m; lote de 8,66 × 30 → huella 8,66 × 25 = 216,5 m²; USAM → 6 plantas completas +
   retirado 1 (huella − 2 m desde L.O.) + retirado 2 (− 4 m desde L.O. y − 4 m desde L.F.I.);
   manzana de 50 × 50 → atípica; lote que toca dos L.O. → esquina → rango; `uni_edif_2 ≠ 0`
   → rango; lote de 20 m de fondo en USAM con L.F.I. a 27,5 → art. 6.4.2.4, retiro 6 m.
2. Casos fijos que fallan si el cálculo cambia: **056-068-040b** (Zuviría 3939, USAM,
   R2b II, lote 2.171 m², frente 34,64, fondo 62,67; TodoProps da 1.134 m² por planta y
   5 niveles) y **039-097-008b** (Cabildo 2040, CA 38 / 31,2 → rango).
3. **20 parcelas reales** de distintas unidades, elegidas del CSV y comparadas contra
   Ciudad 3D / TodoProps: tolerancia **5 % en m² por planta** en modo exacto. La lista, los
   valores y el resultado quedan en `docs/superpowers/specs/evidencia/prefactibilidad/`.
   **Si alguna falla, no se habilita el menú.**
4. Regresión (regla de la casa): cada bug encontrado en la validación se vuelve a meter y
   se ve fallar antes de arreglarlo.

**Después**, en el navegador, escritorio y celular (emulación), con PRISMAIA - VAKDOR:

- Escribir tecla por tecla en el buscador; elegir; ver pin y contorno; leer la ficha.
- Dirección fuera de CABA, puerta inexistente, GCBA caído (simulado): los tres mensajes.
- Guardar, ver en "Mis prefactibilidades", compartir, abrir el link sin sesión, imprimir a
  PDF y medir que el SVG salga entero en una hoja.
- Contraste en los dos temas para todo lo nuevo (medir, no mirar).
- RLS: un asesor no ve las de otro; el link con token inválido da 404 sin filtrar nada.

## Cómo se construye, en orden

1. Rama `feat/prefactibilidad` desde `origin/main` en su propio worktree (hecho).
2. `lib/prefactibilidad/` con tests y la validación de 20 parcelas.
3. Scripts de carga; correr en local; **a producción con OK**.
4. Rutas del servidor, pantalla, "Mis prefactibilidades".
5. Ficha pública y SVG.
6. Pruebas en navegador, OK de Leonardo, commit, docs (bitácora + guía funcional sin
   tecnicismos), merge a main por el flujo clásico.

## Adenda 17-sep-2026: la envolvente oficial pasa a ser la fuente

Al preparar el plan se encontró que Ciudad 3D publica sus capas como **teselas vectoriales
públicas** (sin clave, gzip, zooms 12 a 19) en `vectortiles.usig.buenosaires.gob.ar/cur3d/`:

| Capa | URL (`{z}/{x}/{y}.pbf`) | Qué trae por feature |
|---|---|---|
| Superficie edificable | `cur3d/volumen_edif/` | Por parcela: `smp`, `tipo` (cuerpo principal / retiro 1 / retiro 2 / basamento), `edificabil` (CA, CM, USAA, USAM, USAB2, USAB1, USAB0), `altura_inicial`, `altura_final`; polígono |
| Línea de frente interno | `cur3d/lfi/` | Por manzana (`sm`): polígono del espacio libre |
| Línea interna de basamento | `cur3d/lib/` | Por manzana: línea |
| Banda mínima edificable | `cur3d/banda_minima/` | Por manzana: polígono |
| Manzanas | `cur3d/manzana/` | `sm`, `tipo` (TIPICA / ATIPICA) |
| Línea oficial | `cur3d/linea_oficial/` | Por parcela: línea de frente sobre la calle |

Verificado el 17-sep con Roosevelt 4554 (053-050-006): la envolvente oficial da **261 m² de
cuerpo principal** (TodoProps: 263), retiro 1 244 m², retiro 2 192 m², alturas 17,2 / 20,2 /
24,2 (las de la reforma 2024). La regla del cuarto sobre la manzana daba 242 m²: la línea de
frente interno oficial es un polígono de 20 vértices con las extensiones del espacio libre del
art. 6.4.2.3, no un rectángulo. También hay envolvente oficial para la manzana **atípica** de
Zuviría 3939 y para Cabildo 2040 (dos unidades, CM y CA, cada una con su polígono y sus
alturas).

**Decisión:** el cálculo lee la **envolvente oficial** de las teselas y mide sus polígonos
recortados al lote. La regla del cuarto (Paso 2 original) queda como **control de
consistencia y respaldo** si una parcela no tiene envolvente en la capa. Consecuencias:

- El **modo exacto** cubre también esquinas y manzanas atípicas cuando hay envolvente oficial.
  Los avisos (esquina, atípica, área especial, catalogado, dos alturas) se muestran igual, como
  advertencias, con la leyenda de estudio profesional. El **modo rango** queda solo para
  parcelas sin envolvente oficial.
- El servidor pide 1 a 4 teselas de zoom 17 que cubren el lote, une los pedazos de un mismo
  polígono partido entre teselas y los recorta al contorno del lote. Se guardan en la caché
  de la parcela junto con el contorno.
- La validación de 20 parcelas compara **nuestra medición de la envolvente oficial** contra
  TodoProps (m² por planta, ±5 %), y la regla del cuarto contra la capa oficial en manzanas
  típicas (informativo).
- Dependencias nuevas: `@mapbox/vector-tile` 3.0.0 y `pbf` 5.1.2 (ESM; `import { PbfReader }
  from "pbf"`). Las teselas vienen gzip aunque el servidor no lo declare: hay que
  descomprimir si empiezan con `1f 8b`.

## Riesgos

- **Dato del GCBA al 31-dic-2024.** Una modificación nueva del Código no se refleja hasta
  recargar. La ficha muestra la fecha; la bitácora anota cuándo mirar el portal.
- **epok sin contrato de servicio.** Ciudad 3D corre sobre él, así que está mantenido; la
  caché amortigua caídas después de la primera consulta.
- **Nombres de calle**: USIG y frentes los escriben distinto ("CABILDO AV." vs "AV.
  CABILDO"). La normalización tiene tests con los 20 casos y un contador de fallos en logs.
- **El número parecido al de TodoProps** en manzanas típicas y **rango donde ellos dan
  número** en las demás: es a propósito y hay que decirlo así al presentarlo.
- **Responsabilidad**: la leyenda no es opcional ni chica. Un dueño que vende por un número
  nuestro y después el arquitecto da otro es el peor escenario; por eso 0,80 y balcones
  afuera.
