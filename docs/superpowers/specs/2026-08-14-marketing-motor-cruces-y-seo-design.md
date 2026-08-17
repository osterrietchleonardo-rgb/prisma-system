# Motor de contenido: cruces, clusters y SEO — DISEÑO

> Rama: `feat/marketing-motor-cruces-y-seo` (desde `main` @ `8e530a4`).
> Módulo: `/admin-vakdor/marketing` (app, Vercel) + `Prisma - MK/marketing-worker` (worker local/EasyPanel).
> Antecedente directo: `2026-08-10-marketing-voz-humana-design.md` y `docs/interno/marketing-handoff.md`.

## 1. Problema

El motor de voz resolvió que todas las piezas salieran con el mismo molde. Pero quedó un techo
más profundo que no se ve hasta que se publica seguido:

1. **Las 30 escenas son todas del mismo tipo: dolor operativo.** No hay material de "lo que se
   intentó y no funcionó" ni de "cómo se ve cuando está resuelto".
2. **TOFU, MOFU y BOFU tiran de la misma bolsa.** Una pieza BOFU necesita mostrar el después y
   tiene que improvisarlo, porque en el banco no existe.
3. **Casi todas las escenas son de ventas y leads.** Alquileres y administración, tasación y
   captación, equipo, dirección y pauta quedan casi sin materia prima.
4. **No hay eje temático.** Nada dice de qué territorio habla una pieza, así que no se puede
   saber de qué viene hablando Vakdor ni conectar los artículos entre sí.
5. **Search Console entra al panel pero no al motor.** `metricas.ts` trae las queries reales con
   su posición; `app/api/admin-vakdor/marketing/generar/route.ts` solo lee los insights de Buffer.
   Las ideas de blog se generan a ciegas de lo que la gente ya busca.
6. **Los artículos no enlazan a nada.** El prompt no pide enlaces internos.
7. **El banco no crece solo.** Agregar una estructura o un tipo de comentario exige tocar código
   (ver §4), lo que convierte "ampliar el banco" en una tarea de desarrollo en vez de un `INSERT`.

El objetivo es que los cruces entre ejes den material para publicar al ritmo que decida Leonardo,
y que ampliar el banco sea SQL, no código.

## 2. Qué NO se toca

Lista dura. Sirve para que "sin romper nada" sea verificable.

- **Los 8 eventos de GA4 y el embudo** (`lib/admin-vakdor/marketing/metricas.ts:380-390`). Los
  eventos están cableados en el sitio, en Meta CAPI y en el panel, con respaldos históricos para
  que 30 y 90 días no den cero. Renombrarlos vacía las series. No se tocan.
- **`fetchGscQueries`** (`metricas.ts:477`): la consulta que ya alimenta el panel queda igual. Lo
  nuevo va por una función aparte.
- **El publicador y `blog_posts` de vakdor-app**: cero `UPDATE` sobre artículos ya publicados.
  Solo se siguen creando piezas nuevas.
- **El canon de voz, las 8 estructuras y las 30 escenas actuales**: se les agregan etiquetas; no
  se les cambia el texto.
- **La lista de muletillas y la protección de la fórmula "X no es Y"** (`voz.ts:36-45`), que es la
  del post de mayor rendimiento histórico.
- **El flujo del tablero** (estados, drag, publicar, cron): sin cambios.

## 3. El modelo de ejes

Seis ejes se cruzan para armar cada pieza:

| Eje | Qué define | Estado |
|---|---|---|
| `cluster` | El territorio del que habla | **nuevo** — 8, sirve blog y LinkedIn |
| `proposito` | Para qué se escribe | **nuevo** — 5 |
| `estructura` | Cómo se narra | existe (8) + `framework_pasos` |
| `escena` | La materia prima | existe (30) → 90, con `area` y `momento` |
| `funnel` | A quién y en qué etapa | existe |
| `comentario` | El primer comentario | existe (5) |

### Regla de oro: una sola fuente de forma

El propósito **nunca** le dice al prompt cómo escribir. Solo restringe qué estructuras pueden
sortearse. La instrucción de forma sigue saliendo de un único lugar, `bloqueVoz` en
`content.mjs:62`.

Esto es deliberado: el comentario de `content.mjs:79-81` documenta el bug de inyectar dos
instrucciones de forma en el mismo prompt. Este diseño no lo reintroduce.

### Los 5 propósitos y sus estructuras compatibles

| Propósito | Clave | Estructuras habilitadas |
|---|---|---|
| Opinión fuerte | `convencer` | `mito_realidad`, `concesion_vuelta`, `contraste` |
| Educativo | `ensenar` | `framework_pasos` *(nueva)*, `autopsia` |
| Experiencia | `mostrar_detras` | `confesion`, `escena_campo` |
| Dato / investigación | `probar_con_dato` | `numero_duele`, `autopsia` |
| Reflexión | `reflexionar` | `carta_director`, `confesion` |

Cada propósito tiene dos estructuras como mínimo, para que la rotación (que evita repetir la
estructura de las piezas recientes) nunca se quede sin salida.

Se agrega **una sola** estructura nueva, `framework_pasos` ("El método en pasos"), porque es el
único de los cinco propósitos que ninguna estructura actual cubre.

### Los 8 clusters

| Clave | Página pilar | Keyword pilar | Fractura |
|---|---|---|---|
| `operaciones_inmobiliarias` | `/operaciones-inmobiliarias/` | operaciones inmobiliarias | territorio madre |
| `leads_inmobiliarios` | `/leads-inmobiliarios/` | leads inmobiliarios | Hemorragia |
| `whatsapp_inmobiliarias` | `/whatsapp-para-inmobiliarias/` | WhatsApp para inmobiliarias | Hemorragia |
| `equipo_y_asesores` | `/performance-asesores/` | performance asesores inmobiliaria | Anarquía |
| `automatizacion_inmobiliaria` | `/automatizacion-inmobiliaria/` | automatización inmobiliaria | Anarquía |
| `ia_para_inmobiliarias` | `/ia-para-inmobiliarias/` | IA para inmobiliarias | Anarquía |
| `kpis_y_gobernanza` | `/kpis-inmobiliarios/` | KPIs inmobiliarios | Ceguera |
| `escalar_inmobiliaria` | `/escalar-inmobiliaria/` | escalar inmobiliaria | Ceguera |

Cada cluster cuelga de una de las 3 fracturas del eje de marca. **Tokko Broker queda afuera a
propósito**: es la keyword de otro producto y atrae usuarios de Tokko buscando soporte, no
directores con capacidad de inversión. Queda como candidato futuro.

**Sembrar la taxonomía no es escribir las páginas pilar.** `url_pilar` se guarda desde el día uno
como destino previsto; las páginas se escriben cuando Leonardo decida. Una taxonomía sin páginas
no cuesta tráfico ni riesgo: solo sirve para clasificar y para enlazar cuando existan.

### Áreas y momentos de las escenas

- **Áreas (6):** `captacion_tasacion`, `ventas`, `alquileres_administracion`, `equipo`,
  `direccion`, `pauta_marketing`.
- **Momentos (3):** `dolor`, `intento_fallido`, `resuelto`.

El momento se corresponde con la etapa del embudo: TOFU → `dolor`, MOFU → `intento_fallido`,
BOFU → `resuelto`.

### Cómo se eligen las escenas

De las 2 escenas de cada pieza:

1. La **primera** sale del momento que corresponde a la etapa del embudo.
2. La **segunda** es libre (excluyendo la ya elegida).

Esto da contraste narrativo (por ejemplo, dolor → resuelto en una pieza BOFU) en vez de dos
escenas del mismo tono. Si no hay escenas del momento pedido, las dos salen libres: **el filtro
nunca bloquea la generación**, igual que `elegirRecursos` hoy recicla cuando la exclusión vacía el
pool (`recursos.mjs:14-21`).

El área sesga el orden del pool según el cluster de la pieza (las afines primero), pero tampoco
bloquea: si no alcanzan, entran las demás.

### Cuánto material da

5 propósitos × ~2,2 estructuras compatibles × 8 clusters × 3 etapas ≈ **265 moldes distintos**, y
cada molde saca su par de escenas de un pool filtrado de ~90. No es infinito, pero el techo deja
de ser "30 escenas de dolor", y se mueve con un `INSERT`.

## 4. Que el banco crezca sin tocar código

Es condición para todo lo anterior. Hoy hay dos anclas en código:

1. **`CLAVES_ESTRUCTURA`** (`lib/admin-vakdor/marketing/voz.ts:16`) es una lista cerrada.
   `generar/route.ts:83` valida contra ella, así que una estructura insertada en la base **se
   descarta en silencio** y la idea queda con `estructura: null`.
2. **`instruccionComentario`** (`voz.ts:76-88`) tiene el texto de los 5 comentarios hardcodeado
   por clave. Es el pendiente ya anotado en `marketing-handoff.md:87`.

Cambios:

- La validación de estructuras pasa a hacerse contra **las claves activas de la base**. El array
  queda solo como tipo de TypeScript para las 8 conocidas, no como validador.
- El texto de los comentarios se mueve a la columna `detalle` de `marketing_recursos`. El texto
  actual queda como fallback si la fila no existe o viene vacía, con el mismo criterio de falla
  suave que `canonDeVoz` (`recursos.mjs:57-65`).

Después de esto, escenas, estructuras, comentarios, propósitos y clusters se agregan con SQL y
entran en la corrida siguiente del worker.

**Espejo:** `voz.ts` (app) y `voz.mjs` (worker) son espejo, igual que `similitud.ts` / `similitud.mjs`
(avisado en `similitud.mjs:2`). Se cambian juntos.

## 5. Modelo de datos

Migración `supabase/migrations/20260814120000_marketing_cruces_y_seo.sql`. Todo aditivo: columnas
nuevas nullable y `create table if not exists`. Ninguna columna existente cambia de tipo ni se
borra, así que el código actual sigue funcionando con la migración aplicada y sin desplegar.

```sql
-- 1. Clusters: territorio único para blog y LinkedIn.
create table if not exists marketing_clusters (
  clave         text primary key,
  titulo        text not null,
  descripcion   text not null,
  keyword_pilar text not null,
  url_pilar     text not null,
  fractura      text,
  areas         text[] not null default '{}',  -- áreas de escena afines
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table marketing_clusters enable row level security;
-- Sin políticas: solo service_role, mismo criterio que marketing_ideas.

-- 2. Ejes nuevos en las ideas.
alter table marketing_ideas add column if not exists cluster          text;
alter table marketing_ideas add column if not exists proposito        text;
alter table marketing_ideas add column if not exists keyword_objetivo text;

-- 3. Ejes nuevos en el banco de recursos.
alter table marketing_recursos add column if not exists area       text;
alter table marketing_recursos add column if not exists momento    text;
alter table marketing_recursos add column if not exists propositos text[] not null default '{}';

-- 4. El banco admite un tipo más: 'proposito'.
alter table marketing_recursos drop constraint if exists marketing_recursos_tipo_check;
alter table marketing_recursos add constraint marketing_recursos_tipo_check
  check (tipo in ('canon','estructura','escena','comentario','proposito'));

create index if not exists marketing_recursos_escena_idx
  on marketing_recursos (tipo, momento, area) where activo;
```

`area` y `momento` solo se llenan en filas `tipo='escena'`; `propositos` solo en
`tipo='estructura'`. Quedan nullable/vacías en el resto, sin `check` que lo fuerce: el filtrado
vive en el código y ya tolera nulos.

La `receta` de cada pieza (jsonb en `marketing_ideas`) suma dos campos: `proposito` y `cluster`,
para poder auditar después con qué cruce salió cada pieza.

## 6. Contenido a cargar

Se carga por migración, no a mano, para que quede versionado y reproducible.

- **5 propósitos** (`tipo='proposito'`): clave, título y en `detalle` la instrucción de intención
  que se inyecta al prompt (qué busca lograr la pieza y qué tipo de evidencia usa). No describe
  la forma narrativa: eso es de la estructura.
- **1 estructura nueva** (`framework_pasos`), con el mismo formato de `detalle` que las 8 actuales.
- **`propositos`** cargado en las 8 estructuras existentes según la tabla de §3.
- **8 clusters** con su keyword, url pilar, fractura y áreas afines.
- **30 escenas actuales**: se les asigna `area` y `momento='dolor'` con `UPDATE` por título.
- **60 escenas nuevas**, repartidas así: 48 cubren las 12 celdas de `intento_fallido` y `resuelto`
  (6 áreas × 2 momentos × 4 escenas), que hoy están vacías; las 12 restantes engrosan las celdas
  de `dolor` más flacas (alquileres y administración, pauta, captación). Resultado: 90 escenas y
  ninguna celda `area × momento` con menos de 4.
  Escritas con el mismo criterio del canon: situación concreta, con un detalle específico (hora,
  día, tipo de propiedad, plazo), sin cifras ni casos inventados.

## 7. Cambios en el motor de ideas (app)

`app/api/admin-vakdor/marketing/generar/route.ts`:

- Lee clusters activos, propósitos activos y **oportunidades de Search Console**.
- El prompt pide, además de lo actual: `cluster`, `proposito` y `keyword_objetivo`. Le pide
  balancear clusters y propósitos, igual que hoy balancea el embudo.
- Validación: `cluster` contra las claves activas de `marketing_clusters`; `proposito` y
  `estructura` contra las claves activas del banco. Lo que no valida queda `null`, como hoy.
- Falla suave en todo lo nuevo, con el patrón que ya usa para los recursos
  (`generar/route.ts:39-43`): si GSC o los clusters fallan, se generan ideas igual, peores pero
  sin ruta caída.

## 8. Search Console

Función nueva en `metricas.ts`, separada de `fetchGscQueries`:

```
fetchGscOportunidades(periodo)
  dimensions: ["query", "page"]   rowLimit: 200
  filtra: 4 <= position <= 20  y  impressions >= 5
  devuelve: top 15 por impresiones, con query, url, posición e impresiones
  falla suave: [] + estado "error"
```

Se consume desde dos lugares:

1. **El motor de ideas**, para elegir sobre qué escribir.
2. **El panel**, en un bloque nuevo "Oportunidades SEO · posición 4-20" dentro de la sección de
   métricas. Solo lista; no dispara ninguna acción sobre contenido publicado.

El umbral de 5 impresiones evita que ruido de una sola impresión mande el calendario editorial.

## 9. Cambios en el worker

`Prisma - MK/marketing-worker/`:

- **`recursos.mjs`** — `recetaParaIdea` pasa a recibir un objeto de contexto
  (`{ claveEstructura, proposito, funnel, cluster }`) en vez de solo la clave de estructura.
  Aplica el filtrado de §3. Devuelve también el propósito elegido, para persistirlo en la receta.
  Si la idea trae una estructura incompatible con su propósito, **manda el propósito** y se deja
  registro en consola: el prompt tiene que llevar una sola forma coherente.
- **`content.mjs`** — `bloqueVoz` suma el bloque de propósito (la intención, no la forma).
  Para artículos de blog, `desarrollar()` recibe además:
  - `ctx.enlaces`: artículos ya publicados (título + URL, de `publicado_en`), para pedir 2-3
    enlaces internos contextuales en el Markdown.
  - `ctx.pilar`: keyword y URL pilar del cluster, para enlazar al pilar cuando exista.
  - `idea.keyword_objetivo`, para que `title`, `meta_description` y el H1 la respeten en vez de
    inventar la keyword después de escribir.
- **`revision.mjs`** — un criterio extra **solo para artículos de blog**: la keyword objetivo se
  responde dentro de las primeras 100 palabras. No se agrega a las piezas de LinkedIn, para no
  subir los reintentos (que son llamadas pagas) en el formato que más se publica.
- **`watch.mjs`** — persiste `proposito` y `cluster` en la receta.

## 10. Cambios en el panel

`components/admin-vakdor/marketing-client.tsx` y `marketing-metrics-section.tsx`:

- Badge de **cluster** y de **propósito** en la tarjeta y en el visor, junto al badge de embudo
  que ya existe.
- Selectores de cluster y propósito en "Nueva idea".
- Filtro por cluster en el calendario, junto a los de fuente, formato y ángulo.
- Bloque **"Oportunidades SEO · posición 4-20"** en la sección de métricas.

Todo lo nuevo tolera `null`: las ideas viejas no tienen cluster ni propósito y tienen que seguir
mostrándose sin romper el tablero.

## 11. Manejo de errores

El criterio es el que ya rige el módulo: **degradar, no caer**.

| Falla | Qué pasa |
|---|---|
| GSC no responde | Se generan ideas sin keyword objetivo. El bloque del panel muestra el estado de error, como ya hace con Clarity y Buffer. |
| No hay clusters activos | Las ideas salen sin cluster; el worker no pide enlaces al pilar. |
| No hay escenas del momento pedido | Las 2 escenas salen libres. |
| Estructura incompatible con el propósito | Gana el propósito; queda registro en consola. |
| El banco de propósitos está vacío | El prompt va sin bloque de propósito: es exactamente el comportamiento actual. |

Ningún camino nuevo puede dejar una idea en `en_revision` sin contenido, que es el modo de falla
que ya se cerró con guardas en `content.mjs:124`, `:150` y `:184`.

## 12. Pruebas y verificación

**Unitarias** (Vitest, junto a los tests que ya existen):

- Compatibilidad propósito ↔ estructura: elige dentro del subconjunto; si el subconjunto queda
  vacío, cae a todas las activas.
- Selección de escenas: la primera respeta el momento de la etapa; la segunda es libre; sin
  escenas del momento pedido, no bloquea.
- Filtro de oportunidades GSC: entra 4-20 con impresiones suficientes, quedan afuera posición 3,
  posición 21 y las de 1 impresión.
- Validación de claves contra la base: una estructura nueva insertada en SQL es aceptada por el
  motor (es la prueba de que §4 quedó resuelto).
- Espejo `voz.ts` / `voz.mjs`: mismas claves y mismos textos de fallback.

**End-to-end**: 3 ideas de prueba (una por etapa del embudo, con clusters y propósitos distintos)
procesadas por el worker hasta `en_revision`, verificando que las 3 salgan con propósito,
cluster, estructura compatible y escenas del momento correcto, sin repetir entre sí.

**Navegador** (obligatorio antes de entregar): login real, escritorio y celular con emulación de
dispositivo. Tablero con ideas viejas (sin cluster) y nuevas conviviendo, calendario filtrando por
cluster, y el bloque de oportunidades SEO mostrando datos reales.

## 13. Fuera de alcance

Decidido explícitamente, no olvidado:

- **Reescribir artículos publicados** (§32 del documento de origen). Toca el publicador, el cron y
  una tabla del sitio público. Proyecto aparte con su propia verificación.
- **Backlinks y Digital PR** (§35-38). Es un CRM de prensa, no un pipeline de contenido. Con dos
  medios identificados, una planilla alcanza.
- **Estudios con datos propios de PRISMA** (§19-20). Es la mejor idea del documento de origen y la
  más delicada: son datos de clientes reales y hace falta autorización escrita antes que
  anonimización. Se haría con SQL y metodología escrita a mano, nunca generado por el worker.
- **Escribir las 8 páginas pilar.** La taxonomía se siembra ahora; las páginas se escriben cuando
  Leonardo lo decida.
- **Renombrar los eventos de GA4** (§55). Rompe las series históricas. Descartado.
