# ACM · buscar comparables solo dentro de las zonas dibujadas en el mapa

**Fecha:** 7-sep-2026
**Estado:** diseño aprobado, pendiente de plan de implementación
**Rama:** `feat/acm-comparables-por-zona`

## El pedido

> "Que antes de apretar el botón de 'Buscar comparables' en el ACM se pueda elegir de los
> tramos/zonas que se crearon (para el asesor/director en cuestión) en el mapa del Buscador IA,
> para que el buscar comparables se limite a esas propiedades que están dentro de esos tramos
> elegidos. Me imagino un desplegable donde el asesor/director pueda elegir de sus tramos ya
> creados y luego el mismo sistema por detrás encuentra las propiedades actuales en las tablas
> y las presenta normalmente como hoy en día, pero solo las que están dentro del límite."
> — Leonardo, 7-sep-2026

Nada de dibujar zonas nuevas dentro del ACM: solo elegir de las que ya existen.

## Cómo funciona hoy

El ACM acota por **barrio**, no por geografía.

`app/api/acm/comparables/route.ts` llama en paralelo a dos funciones SQL, y a las dos les manda
`p_barrio` (el barrio del sujeto) y `p_zona_min`:

| `p_zona_min` | Cuándo | Qué entra |
|---|---|---|
| `70` | por defecto (estricto) | mismo barrio + sub-barrios |
| `50` | con "incluir linderos" tildado | además, los barrios limítrofes |

El mapa de vecindad vive en `acm_barrio_relacion`. Si el barrio del sujeto no resuelve contra
esa tabla, las dos funciones caen a un gate por patrones de texto (`p_loc_patterns`).

Las dos funciones, verificadas contra producción el 7-sep con `pg_get_functiondef`:

- `acm_match_properties(...)` — la cartera propia (tabla `properties`).
- `acm_match_roomix(...)` — la red de colaboración (tabla `mercado_avisos`; el nombre "roomix"
  quedó del reemplazo de `roomix_properties`).

## La pieza que ya existe y hay que traer

El Buscador IA **ya** recorta por el dibujo, y lo hace **en SQL**, no en el navegador. Las
funciones `buscar_roomix` y `match_properties_ia` reciben un parámetro `p_poligono text` y
filtran con `point(lng,lat) <@ p_poligono::polygon`
(`supabase/migrations/20260826060000_buscador_zona_dibujada.sql:119-121` y `:225-227`).

El convertidor de GeoJSON a literal de Postgres ya está escrito y probado:
`lib/mapa/poligono-sql.ts` (`poligonoParaSql`), con su tope de 5.000 vértices, su validación de
rango y su decisión de devolver `null` en vez de tirar error.

Las zonas viven en `mapa_zonas` y se leen por `GET /api/mapa/zonas`, que ya filtra por
`user_id`.

Esto no se inventa: se lleva al ACM un mecanismo en producción desde el 26-ago-2026.

## Lo que se midió antes de decidir (producción, 7-sep-2026)

**Cobertura de coordenadas** — el riesgo obvio era perder propiedades sin ubicación:

| Tabla | Total | Con `lat` |
|---|---|---|
| `properties` | 676 | **675 (99,9 %)** |
| `mercado_avisos` (todas `estado='activo'`) | 62.761 | **62.703** |

**El índice geográfico de la red** es `mercado_avisos_punto_idx`:
`gist(point(lng, lat)) WHERE estado = 'activo' AND calidad = 'ok'`. Esa condición es
**exactamente** la que ya usa `acm_match_roomix` en sus dos ramas, así que el índice aplica sin
tocar nada más.

**Velocidad, sobre las 3 zonas reales guardadas hoy:**

| Zona | Vértices | Avisos adentro | Tibio | Frío |
|---|---|---|---|---|
| BUSQUEDA MAXI (del cliente) | 295 | 1.305 | 9 ms | 643 ms |
| test | 67 | 2.892 | 11 ms | 200 ms |
| zona prueba | 72 | 5.829 | 31 ms | 4.333 ms |

Todas resuelven por *Bitmap Heap Scan* sobre el índice.

**Varias zonas a la vez** (la decisión de producto, ver abajo). Dos formas de escribir lo mismo,
medidas sobre las 3 zonas juntas:

| Forma | Plan | Tiempo |
|---|---|---|
| `point(lng,lat) <@ any(array[...]::polygon[])` | Bitmap Heap Scan | **30 ms** |
| `exists (select 1 from unnest(array[...]) p where point(lng,lat) <@ p)` | sin índice | 184 ms |

**La forma con `any(...)` no es una preferencia de estilo: es la única que engancha el índice.**
Escrito de la otra manera, Postgres lee la tabla entera. Es la misma trampa que ya documenta el
comentario de `lib/mapa/poligono-sql.ts`.

## Decisiones de producto (tomadas con Leonardo, 7-sep)

1. **Varias zonas a la vez.** Casillas, no un desplegable de una sola. Las tildadas **se suman**
   (unión), igual que los trazos del mapa del Buscador. Viable y barato: 30 ms medidos.
2. **El dibujo reemplaza al barrio, no se suma.** Es el mismo criterio que ya tomó el Buscador
   ("el barrio guardado no se toma: el dibujo lo reemplaza"). Sumarlos daría cero comparables
   apenas la zona cruce dos barrios.
3. **Aplica a las dos fuentes**, cartera y red. Esconder una sin avisar es el problema que ya
   costó caro antes.
4. **Zona = 100 para todos los de adentro**, con peso 20 — igual que hoy puntúa un comparable
   del mismo barrio. Así los % de un ACM con zona siguen siendo comparables con los ACM ya
   hechos.
5. **Zona vacía o pobre: avisar y ofrecer el botón.** Se muestra lo que hay con el número real,
   y al lado un botón "Buscar sin la zona" que rehace la búsqueda por barrio. El sistema nunca
   amplía solo ni en silencio.

## El diseño

### 1. Base de datos — dos funciones

Parámetro nuevo en las dos, al final de la lista para no romper las llamadas por posición:

```
p_poligonos text[] DEFAULT NULL
```

Cada elemento es un literal `((lng,lat),(lng,lat),...)` producido por `poligonoParaSql`.

Se agrega una variable de control:

```sql
v_geo boolean := (p_poligonos is not null and array_length(p_poligonos, 1) > 0);
```

**Cuando `v_geo` es verdadero:**

- `v_usar_zonas` se fuerza a `false` (no se consulta `acm_barrio_relacion`) y **no** se aplica el
  gate por `p_loc_patterns`. El dibujo es el único límite geográfico.
- Se agrega al `where`, escrito exactamente así:

  ```sql
  and r.lat is not null and r.lng is not null
  and point(r.lng, r.lat) <@ any(p_poligonos::polygon[])
  ```

- El puntaje de zona pasa a `w_zona = 20`, `s_zona = 1`, `sc_zona = 100`.

**Cuando `v_geo` es falso, no cambia nada.** El camino de barrio queda igual, byte por byte, y
un ACM sin zona elegida devuelve exactamente lo mismo que hoy.

**Detalle que hay que respetar (verificado en la definición de producción, no en el repo):** en
la rama sin barrio resuelto de `acm_match_roomix`, hoy `w_zona = 0` (línea 282 de
`pg_get_functiondef`) pero `sc_zona` se **muestra** 100 (línea 371). Es decir: la zona se ve al
100 % y pesa cero. Para el camino del dibujo hay que forzar el peso 20 explícitamente; si se
reusa esa rama tal cual, el % sale distinto de lo decidido en el punto 4.

`acm_match_roomix` tiene dos ramas de ~190 líneas cada una (`v_usar_zonas` sí/no). El camino del
dibujo **reusa la rama "sin zonas"** —la que va directo a `mercado_avisos`— agregándole la
condición geográfica y el peso de zona. No se agrega una tercera rama.

Las dos funciones se aplican por Management API con `SUPABASE_API_KEY_MANAGEMENT`, en
transacción, con la definición actual guardada como rollback en `supabase/rollback/`. Las
migraciones del repo no se aplican solas.

### 2. API — `app/api/acm/comparables/route.ts`

- Acepta `zona_ids: string[]` en el body. **Nunca un polígono crudo del navegador.**
- Los resuelve contra `mapa_zonas` filtrando por `user_id` además de por id — mismo criterio que
  `/api/mapa/zonas` y que el Buscador. Una zona que no es tuya, no existe.
- Convierte cada `geojson` con `poligonoParaSql()`. Tope: **10 zonas por búsqueda** (el tope de
  vértices por zona ya lo pone `poligonoParaSql` en 5.000).
- Si un dibujo no convierte, se ignora **ese** y se informa en `meta.zonas_invalidas`. Si no
  queda ninguno válido, **no se busca sin filtro en silencio**: se devuelve el aviso y la
  búsqueda no se hace.
- Pasa `p_poligonos` a las dos RPC.
- Guarda `zonas: [{ id, nombre }]` **dentro de `sujeto`**, igual que ya viaja `incluir_linderos`,
  para que el snapshot de `acm_searches.sujeto` deje reabrir la búsqueda desde "Mis ACM" sabiendo
  con qué zonas se hizo. Se guarda el nombre, no el dibujo: los resultados ya vienen
  fotografiados en `resultados`.
- `meta` suma `zonas_usadas: string[]` (los nombres) para el chip de la pantalla.

### 3. Tipos — `lib/tasacion/types.ts`

`Sujeto` suma un campo opcional, documentado como ya lo está `incluir_linderos`:

```ts
/** Zonas del mapa con las que se acotó la búsqueda. Vacío o ausente = búsqueda por barrio. */
zonas?: { id: string; nombre: string }[];
```

### 4. Pantalla — `subject-input.tsx` y `acm-module.tsx`

Arriba del botón "Buscar comparables", un bloque nuevo:

- Título: **"Buscar solo dentro de mis zonas del mapa"**, con una línea que explica qué hace.
- Casillas con las zonas del usuario, de `GET /api/mapa/zonas` (que ya devuelve solo las suyas).
- **Sin zonas guardadas:** una línea que dice dónde se crean (la solapa Mapa del Buscador IA).
  No bloquea nada; el ACM sigue funcionando como hoy.
- **Con al menos una tildada:** el switch "incluir barrios linderos" se apaga y se deshabilita,
  con la razón escrita al lado ("el dibujo reemplaza al barrio").
- El barrio del sujeto **sigue siendo obligatorio** (`isValido` no cambia): va en la ficha del
  cliente y en la fila "Zona" del checklist. Pero deja de filtrar, y eso se aclara en pantalla.

`acm-module.tsx` guarda el estado `zonasElegidas` y lo manda en el body, y lo limpia en
`handleReset()` junto con el resto.

### 5. Resultados — `comparables-result.tsx`

- Chip arriba: **"Dentro de: zona A + zona B"**.
- Cuando el total es bajo, el cartel con el número real —"Dentro de las zonas que elegiste hay 4
  comparables"— y al lado el botón **"Buscar sin la zona"**, que destilda todo y vuelve a
  buscar.
- Una línea al pie cuando hubo zona: las propiedades sin coordenadas quedan afuera de una
  búsqueda por zona. No se esconde.

## Consecuencias, dichas antes de construir

- **Las zonas son privadas por persona.** `mapa_zonas` filtra por `user_id`: ni el director ve
  las de un asesor. Si Víctor dibuja una zona, sus asesores no la ven, y al revés. Esa regla no
  se toca acá. Que el director pueda compartirle zonas al equipo es **otro pedido y otro
  diseño**.
- **Una propiedad sin coordenadas queda afuera** cuando hay zona elegida: 1 de 676 en cartera,
  58 de 62.761 en la red. Se avisa en pantalla.
- **La primera búsqueda del día puede tardar:** 4,3 s en frío contra 31 ms tibio, medido. Es la
  misma exposición que ya tiene el Buscador. `acm_match_roomix` tiene `statement_timeout` de
  25 s, así que no se corta.
- **El borde del polígono:** Postgres incluye el borde y turf lo excluye por un pelo. En un trazo
  hecho a dedo la diferencia es menor que el grosor de la línea (medido antes: 3 de 100 quedaron
  "afuera" a 3 y 10 metros; las de adentro de verdad arrancan a 22 m).
- **Las búsquedas viejas de "Mis ACM" no cambian.** Sin `zonas` en el snapshot, se reabren igual
  que siempre.

## Cómo se prueba

**Prueba de regresión que tiene que fallar sin el arreglo.** Un ACM sobre un sujeto de Belgrano
con la zona "test" tildada: hoy trae comparables de fuera del dibujo; con el arreglo, ninguno de
los devueltos cae afuera. La prueba se escribe primero y se la ve fallar con el código de hoy
antes de tocar el SQL.

**En SQL, contra producción,** antes y después: la misma búsqueda con y sin `p_poligonos`, y la
aserción de que todo id devuelto con zona cumple `point(lng,lat) <@ polígono`.

**Sin zona elegida, el resultado tiene que ser idéntico al de hoy.** Se compara la lista de ids y
los `match_pct` de una búsqueda real antes y después del cambio de las funciones.

**En el navegador,** con la cuenta propia (PRISMAIA - VAKDOR, que tiene dos zonas guardadas:
"test" y "zona prueba"), en escritorio y en celular con emulación. Nunca con la cuenta del
cliente ni como asesor.

Los tests de `lib/mapa` corren con `node --test`, no con vitest (`vitest.config.ts` excluye
`lib/mapa/**`), y los imports llevan extensión `.ts`.

## Fuera de alcance

- Dibujar zonas nuevas desde el ACM.
- Compartir zonas entre el director y los asesores.
- Que la ficha pública del ACM muestre el dibujo.
- Tocar el gate de barrio para el caso sin zona elegida.
