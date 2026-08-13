# Plan de implementación — Mapa en el Buscador IA (Etapa 1: Puntos)

**Spec:** `docs/superpowers/specs/2026-08-04-mapa-buscador-ia-design.md`
**Rama:** `feat/mapa-buscador-ia` (worktree `C:\Users\LENOVO\Desktop\CODE\prisma-wt-mapa`, desde `main` @ `672dc7b`)
**Fecha:** 2026-08-04

---

## Objetivo

Agregar una solapa **Mapa** al Buscador IA (hoy solo chat) donde director y asesores ven las
propiedades ubicadas geográficamente, las acotan dibujando zonas a mano alzada, guardan esas zonas
para reusarlas, y abren la ficha completa con carrusel de fotos al clickear un punto.

**Terminado significa:**
- La solapa Mapa anda en `/director/consultor` y en `/asesor/consultor-ia`.
- El chat sigue funcionando idéntico (no se abre su código).
- La cantidad de puntos del mapa coincide exacto con la del panel de resultados.
- El lápiz recorta y los trazos se suman; se guardan con nombre y descripción, privados por usuario.
- El índice espacial está creado y **medido antes/después** (número registrado en este documento).

## Arquitectura

```
Usuario mueve el mapa (debounce 400 ms)
   ↓
GET /api/mapa/propiedades?bbox=S,W,N,E&operacion=...&fuentes=...
   ↓  requireTenant() → { userId, agencyId, role }
   ↓  consultarMapa() en lib/mapa/consulta.ts   ← extraído aparte para poder verificarlo con script
   ↓  properties (agency_id = X, is_active)  +  roomix_properties (is_active)
   ↓  cartera propia PRIMERO, tope duro 1.000 totales
   ↓
{ propiedades: UnifiedProperty[], total_estimado, truncado }
   ↓
Puntos + clustering (react-leaflet-cluster)  +  panel de resultados (UnifiedPropertyCard)
   ↓
Lápiz (Geoman) → recorte EN EL NAVEGADOR con Turf → cero consultas nuevas
```

**Regla de aislamiento:** todo lo del mapa vive en archivos nuevos (`lib/mapa/`,
`components/mapa/`, `app/api/mapa/`). Los únicos archivos existentes que se tocan son 3, con
cambios mínimos y aditivos. Si el mapa falla, el chat sigue andando porque no comparten código.

## Stack

| Paquete | Versión exacta | Por qué esa |
|---|---|---|
| `leaflet` | `1.9.4` | — |
| `react-leaflet` | `4.2.1` | v5 exige React 19; este proyecto está en React 18.3.1 |
| `react-leaflet-cluster` | `2.1.0` | la última (4.1.3) exige React 19 + react-leaflet 5 |
| `leaflet.markercluster` | `1.5.3` | dependencia del anterior |
| `@geoman-io/leaflet-geoman-free` | `2.20.0` | el lápiz (peer: `leaflet ^1.2.0` ✓) |
| `@turf/turf` | `7.4.0` | punto-en-polígono |
| `@types/leaflet` | `1.9.22` | dev |
| `@types/leaflet.markercluster` | `1.5.6` | dev |

**Instalar con versiones fijas** (`npm i leaflet@1.9.4 ...`), nunca `@latest`.

## Restricciones globales

- **No abrir** `app/api/ai/consultor/route.ts` ni `components/shared/consultor-results.tsx`.
  El segundo se importa y se reusa tal cual.
- **No usar `git add -A`.** Este worktree comparte carpeta padre con otras terminales: se comitea
  archivo por archivo.
- **No mergear a `main` sin OK explícito de Leonardo.**
- **Migraciones por Management API** (`SUPABASE_API_KEY_MANAGEMENT` del `.env`) — las del repo no
  se aplican solas.
- **Nunca escribir "Roomix" en la interfaz.** La etiqueta visible es **"Colaboración"**.
  (`source: 'roomix'` sí se mantiene: es el valor interno que ya usa el chat.)
- **No hay framework de test en el repo** (`package.json` solo tiene `dev`/`build`/`start`/`lint`).
  La lógica pura se prueba con **`node --test`** (Node v24.12.0 corre TypeScript nativo — verificado).
  Lo demás se verifica con scripts contra la base, `npm run lint`, `npm run build` y navegador.
- Cada tarea termina con su verificación **corrida y con salida pegada**, no asumida.

---

## Tarea 1 — Dependencias

- [ ] 1.1 Instalar en el worktree:

```bash
cd "C:/Users/LENOVO/Desktop/CODE/prisma-wt-mapa"
npm i leaflet@1.9.4 react-leaflet@4.2.1 react-leaflet-cluster@2.1.0 \
      leaflet.markercluster@1.5.3 @geoman-io/leaflet-geoman-free@2.20.0 @turf/turf@7.4.0
npm i -D @types/leaflet@1.9.22 @types/leaflet.markercluster@1.5.6
```

- [ ] 1.2 **Verificar que no rompió nada antes de escribir una línea de código:**

```bash
npm run build
```

**Esperado:** build exitoso, sin warnings de peer dependencies de React.
Si aparece `ERESOLVE` o un warning de React 19 → parar y reportar; alguna versión no es la correcta.

- [ ] 1.3 Comitear solo `package.json` y `package-lock.json`:

```bash
git add package.json package-lock.json
git commit -m "chore(mapa): dependencias de leaflet compatibles con react 18"
```

---

## Tarea 2 — Base de datos: coordenadas en la cartera + índices espaciales

Todo aditivo. Nada se modifica ni se borra.

- [ ] 2.1 **Medir ANTES** (el número que hay que mejorar). Con el helper de Management API:

```sql
EXPLAIN ANALYZE
SELECT count(*) FROM roomix_properties
WHERE is_active AND lat BETWEEN -34.60 AND -34.56 AND lng BETWEEN -58.44 AND -58.40;
```

**MEDIDO el 2026-08-05.** La tabla creció desde el spec: **156.803 filas / 70.809 activas**
(el 3-ago eran 141.010 / 47.187).

> **Antes del índice:** `267 ms` en caliente, `1.189 ms` en la segunda corrida, `1.687 ms` en frío
> — plan: `Parallel Seq Scan`, 48.291 filas descartadas por worker.
>
> El crecimiento se pagó caro: +50% de filas activas hizo que la consulta pasara de 261 ms a
> 1.687 ms (×6,5), no de 261 a 390 como proyectaba el spec.

- [ ] 2.2 Agregar las columnas a `properties` y rellenarlas desde `tokko_data`:

```sql
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lng double precision;

UPDATE properties SET
  lat = NULLIF(tokko_data->>'geo_lat','')::double precision,
  lng = NULLIF(tokko_data->>'geo_long','')::double precision
WHERE tokko_data->>'geo_lat' ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND tokko_data->>'geo_long' ~ '^-?[0-9]+(\.[0-9]+)?$';
```

- [ ] 2.3 Verificar el relleno — **tienen que dar 631 (el 100% de la cartera):**

```sql
SELECT count(*) AS total,
       count(lat) AS con_lat,
       count(*) FILTER (WHERE lat IS NOT NULL AND lat BETWEEN -56 AND -21) AS lat_plausible_ar
FROM properties;
```

**Esperado:** `total = 631`, `con_lat = 631`, `lat_plausible_ar = 631`.
Si `con_lat < total` → listar los `tokko_id` que quedaron sin coordenada y reportarlo antes de seguir.

- [ ] 2.4 Crear los índices. **Probar primero con `CONCURRENTLY`**; si la Management API responde
      `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`, repetir sin él (el spec
      lo contempla: con 141.010 filas el bloqueo dura un instante).

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_geo
  ON roomix_properties USING gist (point(lng, lat)) WHERE is_active;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_geo
  ON properties USING gist (point(lng, lat)) WHERE is_active;
```

- [ ] 2.5 **Medir DESPUÉS** — la misma consulta de 2.1, pero escrita de forma que el índice GiST
      pueda usarse (el operador es `<@ box`, no `BETWEEN`):

```sql
EXPLAIN ANALYZE
SELECT count(*) FROM roomix_properties
WHERE is_active AND point(lng, lat) <@ box '((-58.44,-34.60),(-58.40,-34.56))';
```

> **Después del índice:** `___ ms` — plan: `___`

**Criterio:** el plan tiene que decir `Index Scan` / `Bitmap Index Scan` usando `idx_roomix_geo`.
Si sigue diciendo `Seq Scan`, el índice no sirve para esta consulta → **parar y avisar a Leonardo
antes de seguir**; el diseño depende de esto (spec §6).

- [ ] 2.6 Crear la tabla de zonas guardadas, privadas por usuario:

```sql
CREATE TABLE IF NOT EXISTS mapa_zonas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  geojson jsonb NOT NULL,
  filtros jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mapa_zonas_user ON mapa_zonas (user_id, created_at DESC);

ALTER TABLE mapa_zonas ENABLE ROW LEVEL SECURITY;
CREATE POLICY mapa_zonas_propias ON mapa_zonas
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

- [ ] 2.7 Verificar que quedó todo:

```sql
SELECT tablename, indexname FROM pg_indexes
WHERE indexname IN ('idx_roomix_geo','idx_properties_geo','idx_mapa_zonas_user');
SELECT relrowsecurity FROM pg_class WHERE relname = 'mapa_zonas';
```

**Esperado:** 3 índices y `relrowsecurity = true`.

- [ ] 2.8 Guardar el SQL en `supabase/migrations/` con la convención que ya usa el repo (revisar
      cómo se nombran los archivos existentes ahí antes de crear el propio) y comitear ese archivo.

---

## Tarea 3 — `lib/tokko-sync.ts`: que el sync mantenga las coordenadas

Sin esto, las propiedades nuevas de Tokko entran sin `lat`/`lng` y desaparecen del mapa.

- [ ] 3.1 En el objeto que devuelve el mapper (alrededor de la línea 50, donde ya están
      `total_area`, `covered_area`, `images`), agregar dos campos:

```ts
lat: Number.isFinite(Number(p.geo_lat)) ? Number(p.geo_lat) : null,
lng: Number.isFinite(Number(p.geo_long)) ? Number(p.geo_long) : null,
```

Leer primero las líneas 40-80 para confirmar el nombre real de la variable de la propiedad de
Tokko (`p`) y respetar el estilo de las líneas de al lado.

- [ ] 3.2 Verificar:

```bash
npm run lint && npm run build
```

- [ ] 3.3 Comitear solo `lib/tokko-sync.ts`.

---

## Tarea 4 — Lógica pura del mapa (`lib/mapa/`) con tests reales

Todo lo que se puede probar sin navegador ni base va acá, y se prueba de verdad con `node --test`.

- [ ] 4.1 `lib/mapa/tipos.ts`:

```ts
import type { UnifiedProperty } from "@/components/shared/consultor-results";

/** Rectángulo visible del mapa. Orden sur, oeste, norte, este (igual que Leaflet). */
export interface BBox { sur: number; oeste: number; norte: number; este: number }

export type FuenteMapa = "own" | "agency" | "roomix";

export interface FiltrosMapa {
  operacion: "Venta" | "Alquiler";
  tipo?: string | null;
  precio_min?: number | null;
  precio_max?: number | null;
  moneda: "USD" | "ARS";
  ambientes_min?: number | null;
  fuentes: FuenteMapa[];
}

/** Propiedad del mapa: la misma forma que usa el chat + la ubicación. */
export type PropiedadMapa = UnifiedProperty & { lat: number | null; lng: number | null };

export interface RespuestaMapa {
  propiedades: PropiedadMapa[];
  truncado: boolean;      // había más de 1.000 en el rectángulo
  total_estimado: number;
}

export interface ZonaGuardada {
  id: string;
  nombre: string;
  descripcion: string | null;
  geojson: any;           // FeatureCollection de polígonos
  filtros: FiltrosMapa | null;
  created_at: string;
}

export const TOPE_PUNTOS = 1000;
```

- [ ] 4.2 `lib/mapa/bbox.ts` — serializar/parsear el rectángulo para la URL, con validación:

```ts
export function serializarBBox(b: BBox): string   // "-34.60,-58.44,-34.56,-58.40"
export function parsearBBox(s: string | null): BBox | null
```

Reglas: 4 números finitos; `lat` en [-90,90]; `lng` en [-180,180]; `sur < norte`.
Cualquier otra cosa → `null` (el endpoint responde 400, no revienta).

- [ ] 4.3 `lib/mapa/filtros.ts` — leer los filtros de la URL con valores por defecto seguros:

```ts
export function leerFiltros(sp: URLSearchParams): FiltrosMapa
```

Por defecto: `operacion: "Venta"`, `moneda: "USD"`, `fuentes: ["own","agency","roomix"]`.
Números basura (`precio_min=hola`) → `null`, nunca `NaN`. Fuentes desconocidas se descartan;
si quedan cero fuentes válidas, vuelve a las tres.

- [ ] 4.4 `lib/mapa/filtro-poligono.ts` — el recorte del lápiz, **unión de trazos**:

```ts
import { point, booleanPointInPolygon } from "@turf/turf";

/** Devuelve las propiedades que caen dentro de AL MENOS UNO de los trazos (unión, no intersección). */
export function filtrarPorTrazos<T extends { lat: number | null; lng: number | null }>(
  propiedades: T[],
  trazos: any[],   // polígonos GeoJSON
): T[]
```

Reglas explícitas:
- `trazos` vacío → devuelve **todas** (sin filtrar).
- Propiedad sin coordenadas → **queda afuera del mapa pero no se pierde**; el llamador la sigue
  mostrando en la lista marcada "sin ubicación" (spec §8).
- Un trazo inválido no debe tumbar el filtro: se envuelve en `try/catch` y se ignora ese trazo.

- [ ] 4.5 `lib/mapa/__tests__/mapa.test.ts` — tests con `node:test`. Casos mínimos:

| Función | Caso |
|---|---|
| `parsearBBox` | válido → objeto; `null`; `"a,b,c,d"`; 3 números; `sur > norte`; lat 200 |
| `serializarBBox` | ida y vuelta con `parsearBBox` devuelve lo mismo |
| `leerFiltros` | vacío → los 3 defaults; `precio_min=hola` → `null` (no `NaN`); `fuentes=xxx` → las tres |
| `filtrarPorTrazos` | sin trazos → todas |
| | 1 cuadrado → solo las de adentro |
| | punto justo sobre el borde (dejar asentado en el test qué decide Turf) |
| | **2 trazos separados → la unión** (una de cada uno, no cero) |
| | propiedad con `lat: null` → afuera, sin excepción |
| | trazo basura (`{}`) → se ignora, no tira |

Correr:

```bash
node --test lib/mapa/__tests__/mapa.test.ts
```

**Esperado:** todos en verde, y el conteo de tests coincide con los casos de la tabla.
**Escribir primero el test que falla, después la implementación.**

- [ ] 4.6 Comitear `lib/mapa/` completo.

---

## Tarea 5 — La consulta a la base, aislada y verificable

Separada del endpoint HTTP a propósito: así se puede verificar contra la base real con un script,
sin necesidad de sesión ni cookies.

- [ ] 5.1 `lib/mapa/consulta.ts`:

```ts
export async function consultarMapa(
  admin: SupabaseClient,
  params: { bbox: BBox; filtros: FiltrosMapa; agencyId: string; userId: string },
): Promise<RespuestaMapa>
```

Comportamiento:

1. **Cartera propia primero** (`properties`): `agency_id = agencyId`, `is_active`,
   `lat/lng` dentro del bbox, más los filtros. `source = 'own'` si
   `assigned_agent_id === userId`, si no `'agency'`. Se traen **todas** las que entren en el
   rectángulo (son 631 en total; nunca pueden quedar afuera por el tope).
2. **Colaboración** (`roomix_properties`): `is_active` + bbox + filtros,
   `limit = TOPE_PUNTOS - propias.length`.
3. `truncado = true` si la colaboración devolvió exactamente su límite.
4. Se respetan las casillas de `filtros.fuentes`: si "Colaboración" está destildada, la segunda
   consulta ni se corre.

Mapeo a `UnifiedProperty` — **copiar el del chat para que la tarjeta reusada funcione igual**
(`app/api/ai/consultor/route.ts:480-505`), con `similarity: 0` y sin `match_pct` (acá no hay
ranking semántico). Roomix: `id: \`roomix_${rp.slug}\``,
`status: rp.operation === 'rent' ? 'Alquiler' : 'Venta'`, `city: rp.neighborhood`,
`bedrooms: rp.bedrooms || rp.rooms || 0`, `total_area: rp.area_m2`.

Columnas confirmadas en `roomix_properties`: `slug, title, description, operation, price, currency,
property_type, rooms, bedrooms, bathrooms, area_m2, address, neighborhood, city, lat, lng,
amenities, images, roomix_agency_name, roomix_agency_logo, roomix_agency_source_url, canonical_url,
is_active`.

- [ ] 5.2 Verificación contra la base real. Script en el scratchpad que arma un cliente admin y
      llama a `consultarMapa` con un rectángulo de Palermo
      (`sur -34.60, oeste -58.44, norte -34.56, este -58.40`), operación Venta, las 3 fuentes:

**Esperado:**
- Devuelve entre 1 y 1.000 propiedades.
- **Ninguna** con `lat`/`lng` fuera del rectángulo pedido (chequearlo en el script, no a ojo).
- Todas traen `id`, `price`, `images`, `source`.
- El conteo total coincide con el `count(*)` directo por SQL del mismo rectángulo y filtros
  (o es exactamente 1.000 con `truncado: true`).

Pegar la salida real. Si algún número no cierra, se arregla acá — no en la interfaz.

- [ ] 5.3 Comitear `lib/mapa/consulta.ts`.

---

## Tarea 6 — Endpoints

- [ ] 6.1 `app/api/mapa/propiedades/route.ts` — copiar el patrón exacto de
      `app/api/acm/searches/route.ts` (`requireTenant()` + `createAdminClient()` + `try/catch` con
      401 en `"Unauthorized"`):

```ts
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant();
    const url = new URL(req.url);
    const bbox = parsearBBox(url.searchParams.get("bbox"));
    if (!bbox) return NextResponse.json({ error: "bbox inválido" }, { status: 400 });
    const filtros = leerFiltros(url.searchParams);
    const admin = createAdminClient();
    return NextResponse.json(await consultarMapa(admin, { bbox, filtros, agencyId, userId }));
  } catch (e: any) {
    console.error("Mapa propiedades error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
```

**Ojo:** `createAdminClient()` se saltea RLS. El aislamiento por agencia lo da el `.eq("agency_id",
agencyId)` explícito dentro de `consultarMapa` — igual que en el resto de la app.

- [ ] 6.2 `app/api/mapa/zonas/route.ts` — `GET` (las del usuario), `POST` (crear con
      `nombre`+`descripcion`+`geojson`+`filtros`), `DELETE` (por `id`, siempre con
      `.eq("user_id", userId)` además del `id`, para que nadie borre la de otro).

      `nombre` obligatorio, recortado a 80 caracteres; `descripcion` opcional, a 300.
      **Zonas privadas: nunca filtrar por `agency_id` sin el `user_id`** — ni el director ve las de
      un asesor (spec §2).

- [ ] 6.3 Verificar:

```bash
npm run lint && npm run build
```

**Esperado:** compila y las rutas `/api/mapa/propiedades` y `/api/mapa/zonas` aparecen en la
salida del build como rutas dinámicas.

- [ ] 6.4 Verificar el 401: `curl` sin cookie a `/api/mapa/propiedades?bbox=...` con el dev server
      levantado → **tiene que responder 401**, no datos.

- [ ] 6.5 Comitear `app/api/mapa/`.

---

## Tarea 7 — El mapa (componentes)

Leaflet necesita `window`: **todo se carga con `dynamic(..., { ssr: false })`** o el build se cae.

- [ ] 7.1 Conseguir la clave de MapTiler. **Depende de Leonardo** — cuenta gratis en
      maptiler.com → clave → `.env` local como `NEXT_PUBLIC_MAPTILER_KEY=...`, y después en Vercel
      (recordar: sin redeploy no aplica).
      **Mientras no esté, el mapa se desarrolla igual**: si la variable falta, se dibuja el fondo
      gris con el cartel de aviso y **los puntos, el lápiz y la lista funcionan igual** (spec §8).
      Esa degradación hay que probarla a propósito, no solo escribirla.

- [ ] 7.2 `components/mapa/mapa-propiedades.tsx` — el contenedor cliente:
  - `MapContainer` centrado en CABA (`-34.60, -58.44`), zoom 13.
  - `TileLayer` de MapTiler con la atribución obligatoria de OpenStreetMap/MapTiler.
  - `import "leaflet/dist/leaflet.css"` (y el CSS de markercluster).
  - Evento `moveend` con **debounce de 400 ms** → refetch. Cancelar el pedido anterior con
    `AbortController` para que no llegue desordenado.
  - Estado: propiedades cargadas, cargando, error, trazos.

- [ ] 7.3 Puntos con `react-leaflet-cluster`. Colores tomados de los que ya usa el chat
      (`consultor-results.tsx`): `own` dorado, `agency` gris, `roomix` azul.
      **Etiqueta visible de `roomix`: "Colaboración".**

- [ ] 7.4 **Un pin por ubicación, no por aviso** (spec §5.5). Agrupar por `lat,lng` redondeado a
      6 decimales. Al clickear, abrir la **lista** de todo lo que hay en ese punto, cada uno con
      su inmobiliaria a la vista. Nunca una sola tarjeta cuando hay varias.
      - Si en el punto hay una propiedad de la cartera → el pin va **dorado** (la propia manda) y
        su ficha avisa "también publicada en la red de colaboración por X".
      - Los avisos de **inmobiliarias distintas** con mismo precio + m² + tipo se muestran juntos
        y marcados como probable misma propiedad. **No se esconde ninguno.**
      - Los de **una misma inmobiliaria** van por separado: son unidades distintas del edificio
        (caso verificado: 3 deptos de Fuschetto, pisos 1/2/3, mismo precio y m²).
      - **Nada se borra ni se modifica en la base.** El agrupado es solo al dibujar.

      Esta lógica va en `lib/mapa/agrupar.ts` **con sus tests** (Tarea 4), no suelta en el
      componente: es la parte donde más fácil se esconden propiedades reales sin querer.

- [ ] 7.5 `components/mapa/mapa-filtros.tsx` — operación (arranca en **Venta**), tipo, precio
      min/max + moneda, ambientes, y las 3 casillas de fuente tildadas por defecto.
      Usar `components/ui/select.tsx` y los primitivos que ya existen.

- [ ] 7.6 `components/mapa/mapa-resultados.tsx` — panel derecho con `ScrollArea`, ordenado por
      precio, reusando **`UnifiedPropertyCard` importado tal cual** de
      `@/components/shared/consultor-results` (trae el carrusel de fotos y el modal de detalle).
      Las que no tienen coordenadas se listan igual, marcadas "sin ubicación".

- [ ] 7.7 Contador y tope. Debajo del mapa, el cartel **"N propiedades a la vista"** con el mismo
      número que muestra el panel de resultados (sale de un único estado, no de dos conteos
      distintos). Si la respuesta viene con `truncado: true`, además el cartel
      **"acercate para ver las propiedades una por una"** (spec §8): quedan los globitos con las
      cantidades, no se dibujan puntos sueltos.

- [ ] 7.8 Verificar en el navegador, con `npm run dev` levantado **por mí** (no se lo pido a
      Leonardo):
  - Carga el mapa y se ven puntos.
  - Mover el mapa dispara **una sola** consulta (mirar la pestaña Red), no una por cada píxel.
  - **El número del cartel ("N propiedades a la vista") coincide exacto con la cantidad de
    tarjetas del panel.**
  - Consola del navegador **sin errores**.
  - Sacar `NEXT_PUBLIC_MAPTILER_KEY` del `.env` → fondo gris, puntos y lista siguen andando.

- [ ] 7.9 Comitear `components/mapa/`.

---

## Tarea 8 — El lápiz

- [ ] 8.1 `components/mapa/mapa-lapiz.tsx`: botón que activa el modo dibujo de Geoman
      (`map.pm.enableDraw('Polygon', { freehand: true })` — confirmar la opción exacta contra la
      documentación de la versión 2.20.0 antes de escribirla, no de memoria).

- [ ] 8.2 Al soltar (`pm:create`): agregar el trazo a la lista, recortar con
      `filtrarPorTrazos` (Tarea 4) y encuadrar el mapa a la zona.

- [ ] 8.3 Varios trazos: se **suman**. Cada uno con su "×" para borrarlo y su botón para guardarlo.

- [ ] 8.4 Guardar: diálogo con nombre + descripción → `POST /api/mapa/zonas`.
      Si falla: toast de error con `sonner` (ya en uso) y **el trazo NO se borra de la pantalla**.

- [ ] 8.5 `components/mapa/mapa-zonas-panel.tsx` — panel izquierdo: lista de mis zonas, click para
      aplicarla al mapa, botón para borrarla.

- [ ] 8.6 Casos del spec §8:
  - Trazo que no encierra nada → "Ninguna propiedad en esta zona" + botón para borrar el trazo.
  - Trazo cruzado/inválido → se corrige solo; si no se puede, avisa y no filtra.

- [ ] 8.7 **Verificación contra la base** (spec §9.4): dibujar sobre una zona conocida, anotar
      cuántas quedan adentro, y contrastar con un `count(*)` por SQL del mismo rectángulo.
      Los números tienen que cerrar. Pegar ambos.

- [ ] 8.8 Verificar que la zona guardada es privada: guardar una con el usuario de Leonardo y
      confirmar por SQL que `GET /api/mapa/zonas` de **otro** usuario no la devuelve.

- [ ] 8.9 Comitear.

---

## Tarea 9 — Solapas en las dos páginas

El cambio más delicado: acá se toca código que hoy funciona. **Envolver, no reescribir.**

- [ ] 9.1 `app/director/consultor/page.tsx`: envolver el contenido actual en
      `<Tabs defaultValue="chat">` con `<TabsTrigger value="chat">Chat</TabsTrigger>` y
      `<TabsTrigger value="mapa">Mapa</TabsTrigger>`. **El JSX del chat se mueve entero adentro de
      `<TabsContent value="chat">` sin editarle una línea.** El mapa entra en el otro
      `TabsContent`, con `dynamic(..., { ssr: false })`.

- [ ] 9.2 Ídem `app/asesor/consultor-ia/page.tsx`.

- [ ] 9.3 `git diff` de los dos archivos: **confirmar que los únicos cambios son los imports, el
      envoltorio de Tabs y la indentación.** Si aparece cualquier otro cambio en la lógica del
      chat, revertirlo.

- [ ] 9.4 **Verificar que el chat sigue igual** (spec §9.5): entrar a la solapa Chat, hacer una
      consulta real, confirmar que devuelve resultados como antes y que las tarjetas se ven igual.

- [ ] 9.5 Comitear los 2 archivos.

---

## Tarea 10 — Cierre

- [ ] 10.1 `npm run lint && npm run build && node --test lib/mapa/__tests__/mapa.test.ts` — los tres en verde.

- [ ] 10.2 Completar en este documento los números de la Tarea 2 (antes/después del índice).

- [ ] 10.3 Actualizar los 4 documentos: `LOGICA-PRISMA`, `TECNICO-PRISMA`,
      `FUNCIONAL-ASESOR-PRISMA`, `FUNCIONAL-DIRECTOR-PRISMA`.
      Los dos funcionales se escriben para gente no técnica: qué hace la solapa y cómo se usa,
      sin tecnicismos.

- [ ] 10.4 Levantar `npm run dev` y **pasarle a Leonardo el link andando en local.**

- [ ] 10.5 Anotar los pendientes que quedan para producción: `NEXT_PUBLIC_MAPTILER_KEY` en Vercel
      + redeploy, y medir el consumo real de tiles el primer mes contra las 5.000 cargas del plan
      gratis.

- [ ] 10.6 **Mergear a `main` solo con el OK explícito de Leonardo.**

---

## Cosas que van a doler (avisadas de antemano)

| Riesgo | Qué hacer cuando pase |
|---|---|
| El índice GiST no lo usa el planificador con `BETWEEN` | Por eso la consulta usa `point(lng,lat) <@ box`. Si igual no lo toma → parar en 2.5 y avisar |
| Leaflet revienta el build por `window is not defined` | `dynamic(..., { ssr: false })` en **todo** lo que importe Leaflet |
| El CSS de Leaflet rompe el diseño de la app | Importarlo solo dentro del componente del mapa, nunca en un layout |
| Los íconos de Leaflet salen rotos (bug clásico de bundler) | Definir íconos propios en vez de los del paquete |
| 98 puntos en la misma coordenada | Tarea 7.4 — lista, no tarjeta única |
| Alquiler sale vacío | Es real: 84 en alquiler contra 47.071 en venta. El filtro arranca en Venta |
