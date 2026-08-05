# Mapa de propiedades en el Buscador IA — Diseño

**Fecha:** 2026-08-04
**Rama:** `feat/mapa-buscador-ia` (worktree `C:\Users\LENOVO\Desktop\CODE\prisma-wt-mapa`, salida de `main` @ `672dc7b`)
**Estado:** diseño aprobado por Leonardo. Pendiente: plan de implementación.

---

## 1. Qué se construye

Una solapa **Mapa** dentro del Buscador IA (hoy es solo chat) donde el director y los asesores
ven las propiedades ubicadas geográficamente, acotan la búsqueda dibujando zonas a mano alzada,
guardan esas zonas para reusarlas, y abren la ficha completa con carrusel de fotos al clickear
un punto.

Se construye en **3 etapas**, cada una probada y mergeada por separado:

| Etapa | Qué entrega |
|---|---|
| **1 — Puntos** | Mapa con las propiedades, filtros, lápiz para acotar, zonas guardadas, ficha con fotos |
| **2 — Colores** | Capa de color por manzana (hexágono) con el precio promedio de oferta |
| **3 — Captación** | Vista para mostrarle a un propietario cuánto vale su zona frente a las de al lado |

**Este documento especifica la Etapa 1 en detalle.** Las etapas 2 y 3 se describen a nivel
de intención y tendrán su propio spec.

## 2. Decisiones tomadas (y por qué)

| Decisión | Elegido | Motivo |
|---|---|---|
| Quién lo usa | Director y asesores, detrás del login | Uso interno. Un mapa público para compradores es otro proyecto (privacidad de direcciones, costo de mapas, captura de leads) |
| Relación con el chat | **Separados** en la Etapa 1 | El chat funciona hoy; no se abre. Riesgo cero de romperlo. Conectarlos queda para después |
| Librería de mapa | **Leaflet** (+ `react-leaflet`) | Gratis, la más usada, compatible con React 18 sin malabares, y el lápiz ya viene resuelto por un plugin maduro. Se verificó que aguanta las 3 etapas |
| Dibujo del mapa (tiles) | **MapTiler**, plan gratis | 5.000 cargas/mes. Se mide el consumo real el primer mes. Salida si queda corto: auto-hospedado (~US$14/mes fijos) en el servidor de EasyPanel que ya existe |
| Índice espacial | **GiST nativo de Postgres** sobre `point(lng,lat)` | No requiere PostGIS. Se descartó PostGIS: agrega una pieza pesada sin aportar nada al volumen actual |
| Varios trazos | **Se suman** (unión) | "Al cliente le gustan Belgrano y Núñez, mostrame las dos". Es lo que hace ZonaProp |
| Zonas guardadas | **Privadas de cada usuario** | Ni el director ve las de un asesor. Se guardan de a una, con nombre y descripción |
| Etiqueta de la red externa | **"Colaboración"** | Nunca "Roomix". Es la convención que ya usa el chat (`consultor-results.tsx:63` → "Red de Colaboración") |

### Descartado explícitamente

- **PostGIS.** Disponible pero no instalado. Con el volumen actual no aporta. No queda ninguna
  puerta cerrada: si el volumen se multiplica, se instala después.
- **Mapbox.** Su licencia obliga a usar su librería; cambiar de proveedor después implicaría
  reescribir el mapa.
- **Tiles públicos de OpenStreetMap.** Su política advierte que pueden cortar el acceso sin
  aviso a servicios comerciales, y no dan garantía de servicio.
- **Que el mapa hable con el chat** (en la Etapa 1). Implicaría abrir código que hoy funciona.

## 3. Estado real de los datos (verificado el 2026-08-03 contra la base de producción)

| Dato | Valor medido |
|---|---|
| Propiedades de colaboración, totales | 141.010 filas |
| Propiedades de colaboración, activas | 47.187 |
| Activas con coordenadas | **47.187 (100%)** |
| Activas con imágenes | **47.187 (100%)** |
| Sin coordenadas | 978 (todas inactivas) |
| Cartera propia (`properties`) | 631 (463 activas) |
| Cartera con coordenadas | **631 (100%)**, dentro de `tokko_data.geo_lat` / `geo_long` |
| Cartera con imágenes | 629 de 631 |
| Hexágonos H3 ya precalculados | `h3_res6` (47.128) y `h3_res8` (47.113), solo en colaboración |

**Leonardo sigue cargando propiedades: el objetivo es llegar a ~180.000.** El diseño contempla
ese crecimiento (ver §6).

### Calidad de los datos — límites conocidos

- **Precios de oferta, no de cierre.** Para valor de cierre real ya existe el módulo Pulso de Mercado.
- **La operación es casi toda venta:** 47.071 en venta contra 84 en alquiler. El filtro de
  operación arranca en **Venta**; en alquiler el mapa va a estar prácticamente vacío.
- **Puntos apilados.** 29.998 coordenadas distintas para 47.187 activas; 4.589 propiedades caen en
  puntos con 10 o más, y el peor caso son **98 avisos en la misma coordenada exacta**. Son
  edificios con muchas unidades, o avisos que el portal ubica en la esquina. El mapa debe
  resolverlo (ver §5.4), no ignorarlo.
- **El promedio por manzana lo dicta la colaboración**, no la cartera propia: 47.187 contra 463.
  Es lo deseado (se quiere el precio *de mercado*), pero las propias deben distinguirse a simple vista.

## 4. Arquitectura

### 4.1 Flujo de datos

```
Usuario mueve/zoomea el mapa
        ↓  (se espera a que suelte — debounce)
GET /api/mapa/propiedades?bbox=...&filtros=...
        ↓
Une cartera propia + red de colaboración del lado del servidor
Tope duro: 1.000 puntos por respuesta, TOTALES (no por fuente).
La cartera propia se sirve primero: nunca queda afuera del tope por culpa de la colaboración.
        ↓
Devuelve UnifiedProperty[]  ← misma forma que ya usa el chat
        ↓
Se pintan los puntos (agrupados si hay muchos) + se llena el panel lateral
        ↓
Usuario dibuja con el lápiz
        ↓
Se recorta EN EL NAVEGADOR (Turf.js) — cero consultas nuevas a la base
```

**El mapa nunca pide todas las propiedades.** Pide solo las del rectángulo visible, con tope de
1.000. Pasado ese tope no manda puntos: manda los globitos con las cantidades y un cartel
"acercate para ver las propiedades una por una".

**El lápiz filtra en el navegador.** Las propiedades ya están cargadas; recortarlas por el
polígono es cuestión de milisegundos. Solo se vuelve a consultar la base al mover el mapa.

### 4.2 Piezas nuevas (archivos nuevos — no pueden romper nada existente)

| Pieza | Responsabilidad |
|---|---|
| `app/api/mapa/propiedades/route.ts` | Recibe rectángulo + filtros. Une las dos fuentes. Aplica el tope. Devuelve `UnifiedProperty[]` |
| `app/api/mapa/zonas/route.ts` | CRUD de zonas guardadas del usuario logueado |
| `components/mapa/mapa-propiedades.tsx` | El mapa en sí: tiles, puntos, agrupación, eventos |
| `components/mapa/mapa-filtros.tsx` | Barra de filtros superior |
| `components/mapa/mapa-lapiz.tsx` | Dibujo a mano alzada + recorte con Turf + gestión de trazos |
| `components/mapa/mapa-zonas-panel.tsx` | Panel lateral de zonas guardadas |
| `components/mapa/mapa-resultados.tsx` | Panel derecho — reusa `UnifiedPropertyCard` |
| `lib/mapa/tipos.ts` | Tipos compartidos (rectángulo, filtros, zona) |

### 4.3 Código existente que se toca (3 archivos, cambios mínimos)

| Archivo | Cambio |
|---|---|
| `lib/tokko-sync.ts` (~línea 50) | 2 líneas: guardar también `lat` y `lng` |
| `app/director/consultor/page.tsx` | Envolver lo existente en solapas Chat \| Mapa |
| `app/asesor/consultor-ia/page.tsx` | Ídem |

### 4.4 Código existente que NO se toca

- `components/shared/consultor-results.tsx` — se reusa tal cual. Ya trae la tarjeta con carrusel
  de fotos (`UnifiedPropertyCard`), el modal de detalle (`UnifiedPropertyDetail`) y el botón
  "Compartir ficha".
- `app/api/ai/consultor/route.ts` — el cerebro del chat no se abre.

**Consecuencia buscada:** si el mapa saliera catastróficamente mal, lo peor que puede pasar es
que la solapa "Mapa" no ande. El chat sigue funcionando porque no comparte código con el mapa.

## 5. La pantalla (Etapa 1)

```
┌──────────────────────────────────────────────────────────────────┐
│  [Venta ▾] [Tipo ▾] [US$ min–max] [Amb ▾]  ☑Mías ☑Agencia ☑Colaboración │
├───────────────┬──────────────────────────────────┬───────────────┤
│  MIS ZONAS    │                                  │  RESULTADOS   │
│               │                                  │               │
│ 📍 Belgrano   │           [ EL MAPA ]            │  ┌─────────┐  │
│    familias   │                                  │  │ 🖼 foto  │  │
│               │         ✏️ ← botón lápiz          │  │ US$185k │  │
│ 📍 Corredor   │                                  │  └─────────┘  │
│    Cabildo    │    "247 propiedades a la vista"  │  ┌─────────┐  │
│               │                                  │  │   ...   │  │
│ + Guardar     │                                  │  └─────────┘  │
└───────────────┴──────────────────────────────────┴───────────────┘
```

### 5.1 Filtros

Operación (arranca en **Venta**), tipo de propiedad, rango de precio con moneda, ambientes, y
tres casillas de fuente: **Mías · Agencia · Colaboración**, las tres tildadas por defecto.

### 5.2 Los puntos

Mismo código de colores que ya usan las tarjetas del chat (`consultor-results.tsx`):

| Fuente | Color | Significado |
|---|---|---|
| `own` | Dorado | Asignadas al usuario logueado |
| `agency` | Gris | Resto de la cartera de la agencia |
| `roomix` | Azul | Red de colaboración (etiquetada **"Colaboración"** en la interfaz) |

Cuando hay muchos juntos se agrupan en un globito con el número; al acercarse se abren.

### 5.3 El lápiz

Se aprieta el botón, se dibuja a mano alzada, se suelta → quedan solo las de adentro y el mapa
se acomoda a esa zona. Se puede dibujar otro trazo y **se suman**. Cada trazo tiene su "×" para
borrarlo y su botón para guardarlo con nombre y descripción.

### 5.4 Click en un punto

Abre `UnifiedPropertyCard` (la tarjeta que ya existe, con carrusel de fotos y "Ver ficha
completa"). **Si en esa coordenada exacta hay varias propiedades, abre la lista de todas** — no
una sola. Es el caso de los edificios (hasta 98 en un mismo punto).

### 5.5 Duplicados — un pin por ubicación, no por aviso

**Nada se borra ni se modifica en la base. El agrupado es solo al dibujar.**

Medido el 2026-08-05 sobre las 70.809 activas de colaboración:

| Caso | Cuántos | Qué es |
|---|---|---|
| Misma coordenada + precio + m² + tipo, **varias inmobiliarias** | 572 grupos | La **misma propiedad** publicada por 2 o más inmobiliarias. Verificado: una casa en Barrancas de San Benito publicada por LAMS y por Pernice, misma superficie y precio, una dice "4 ambientes" y la otra "6" |
| Ídem, **una sola inmobiliaria** | 5.153 grupos | En general **NO son duplicados**: son unidades distintas del mismo edificio. Verificado: 3 departamentos de Fuschetto en Convención 1400, mismo precio y m², **pisos 1, 2 y 3** |
| Propiedad de la cartera **también en colaboración** | 151 | Verificado: tu "2 ambientes a estrenar en Núñez" (Deheza 2300, US$186.000) aparece también publicada por RE/MAX TITANIUM al mismo precio |

**La regla:** el mapa dibuja **un pin por coordenada**, no uno por aviso. Al clickearlo se abre la
**lista** de todo lo que hay en esa ubicación, cada uno con su inmobiliaria a la vista.

- Los avisos de **inmobiliarias distintas** que parecen la misma propiedad se muestran juntos en
  esa lista, marcados como tal — no se esconde ninguno. El asesor decide.
- Los de **una misma inmobiliaria** se listan por separado: son unidades distintas del edificio.
  Agruparlos borraría propiedades reales del mapa (el caso Fuschetto).
- Si en esa coordenada hay una propiedad **de la cartera**, el pin es **dorado** (la propia manda)
  y su ficha avisa que también está publicada en la red de colaboración.

> **Por qué no se deduplica más agresivamente:** el campo `floor` (el que distinguiría unidades
> de un mismo edificio) solo está cargado en el 45% de los avisos. Con esa cobertura, cualquier
> regla automática que "limpie" duplicados termina escondiendo propiedades reales. Se prefiere
> mostrar de más y avisar, antes que ocultar sin que el asesor se entere.

### 5.6 Panel de resultados

Muestra siempre las mismas propiedades visibles en el mapa, ordenadas por precio. Es la lista
que el asesor le muestra al cliente.

## 6. Rendimiento — el punto crítico

### Medición real (2026-08-03, 141.010 filas, sin índice)

| Consulta | Tiempo medido | Proyectado a 180.000 |
|---|---|---|
| Puntos del rectángulo visible | **261 ms** | ~333 ms |
| Precio promedio de todas las manzanas (Etapa 2) | **305 ms** | ~390 ms |

El plan de ejecución confirma `Seq Scan`: hoy la base **recorre las 141.010 filas una por una**
para responder "¿qué hay en Palermo?", porque no existe ningún índice sobre la ubicación. Y esos
261 ms se pagan **en cada movimiento del mapa**.

> Una medición anterior dio 42 ms, pero era engañosa: el `LIMIT` cortaba la consulta apenas
> juntaba resultados, sin recorrer el resto de la tabla. El número honesto es 261 ms.

### Las dos correcciones que esto impone

1. **El índice espacial es obligatorio, no opcional.** GiST nativo sobre `point(lng,lat)`,
   parcial (`WHERE is_active`), en `roomix_properties` y en `properties`. Solo agrega; no toca
   ningún dato; se borra con un comando si no rinde. Con él, el tiempo pasa a depender de
   **cuántas propiedades hay en el rectángulo visible**, no de cuántas hay en total — que es lo
   que hace que cargar hasta 180.000 deje de importar.

2. **La capa de colores (Etapa 2) se precalcula, no se calcula en vivo.** Los precios promedio
   por manzana no cambian minuto a minuto. Se recalculan con el mismo cron que ya sincroniza las
   propiedades y se guardan masticados. El mapa lee el resultado.

**Verificación pendiente (acordada con Leonardo):** medir la misma consulta antes y después de
crear el índice, durante la implementación. El número tiene que quedar registrado — no se da por
buena la mejora sin medirla.

## 7. Cambios en la base de datos (todos aditivos)

```sql
-- 1. Coordenadas propias en la cartera (hoy solo viven dentro de tokko_data)
ALTER TABLE properties ADD COLUMN lat double precision;
ALTER TABLE properties ADD COLUMN lng double precision;
-- Relleno inicial desde tokko_data (las 631 lo tienen). De ahí en más lo mantiene lib/tokko-sync.ts

-- 2. Índice espacial nativo (sin PostGIS), en ambas tablas
CREATE INDEX CONCURRENTLY idx_roomix_geo ON roomix_properties
  USING gist (point(lng, lat)) WHERE is_active;
CREATE INDEX CONCURRENTLY idx_properties_geo ON properties
  USING gist (point(lng, lat)) WHERE is_active;

-- 3. Zonas guardadas — privadas de cada usuario
CREATE TABLE mapa_zonas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  geojson jsonb NOT NULL,   -- el trazo dibujado
  filtros jsonb,            -- los filtros que estaban puestos al guardar
  created_at timestamptz DEFAULT now()
);
-- RLS activado: cada usuario ve y modifica únicamente sus propias zonas.
```

Nada se modifica ni se borra. Las migraciones se aplican por Management API (ver memoria del
proyecto: las migraciones del repo no se aplican solas).

> **Nota sobre `CONCURRENTLY`:** no puede ejecutarse dentro de una transacción. Si el endpoint
> `/database/query` de la Management API envuelve la consulta en una, el índice se crea sin
> `CONCURRENTLY`. Con el volumen actual (141.010 y 631 filas) el bloqueo dura un instante y es
> aceptable. Verificar cuál de las dos formas aplica al momento de correr la migración.

## 8. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Propiedad sin coordenadas | No se dibuja, pero **sí aparece en la lista** con la marca "sin ubicación". Nunca desaparece en silencio |
| Proveedor de tiles caído o cuota agotada | Fondo gris, pero **puntos, lápiz y lista siguen funcionando**, con cartel de aviso |
| Más de 1.000 en el rectángulo | Cartel "acercate para ver las propiedades una por una" + globitos con las cantidades |
| Trazo cruzado o inválido | Se corrige automáticamente; si no se puede, avisa y no filtra |
| El trazo no encierra ninguna propiedad | "Ninguna propiedad en esta zona" + botón para borrar el trazo |
| Falla el guardado de una zona | Avisa por toast (`sonner`, ya en uso) y **el trazo NO se borra de la pantalla** |

## 9. Verificación antes de mergear

1. Levantar `npm run dev` y **pasarle a Leonardo el link funcionando en local** (no pedirle a él
   que lo levante).
2. Medir la consulta del rectángulo **antes y después** del índice; registrar ambos números.
3. Comprobar que la cantidad de puntos del mapa coincide exactamente con la del panel de resultados.
4. Dibujar el lápiz sobre una zona conocida y **contrastar contra la base** que las que quedan
   adentro son exactamente las que deberían.
5. Verificar que el chat sigue andando igual (misma sesión, mismos resultados).
6. Mergear **solo con el OK explícito de Leonardo**.
7. Actualizar los 4 documentos: `LOGICA-PRISMA`, `TECNICO-PRISMA`, `FUNCIONAL-ASESOR-PRISMA`,
   `FUNCIONAL-DIRECTOR-PRISMA`.

## 10. Etapas 2 y 3 (fuera de alcance de este spec)

- **Etapa 2 — Colores por manzana.** Capa de hexágonos H3 coloreados por precio promedio de
  oferta (o USD/m²) sobre el mapa de la Etapa 1. Los hexágonos ya están precalculados en la red
  de colaboración; falta calcularlos para la cartera propia. Se precalcula por cron (§6).
  Medición real en Palermo: hexágonos de 2.689 a 3.961 USD/m² dentro del mismo barrio — hay
  señal suficiente para que los colores muestren algo.
- **Etapa 3 — Captación.** Vista para mostrarle a un propietario el valor de su manzana contra
  las de al lado. Se construye encima de las dos anteriores.

Cada una tendrá su propio spec y su propia rama.
