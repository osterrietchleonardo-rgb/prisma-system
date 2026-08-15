# Motor de contenido: cruces, clusters y SEO — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el motor de contenido cruce seis ejes (cluster, propósito, estructura, escena, embudo, comentario) para no agotarse, que ampliar el banco sea SQL en vez de código, y que Search Console entre a decidir sobre qué se escribe.

**Architecture:** Todo lo nuevo es aditivo. Tres migraciones cargan el esquema y el contenido del banco; el código deja de validar contra listas cerradas y pasa a leer de la base; el worker suma un filtro de selección (propósito → estructuras compatibles, embudo → momento de la escena) antes del sorteo por rotación que ya existe; el panel muestra los ejes nuevos y un bloque de oportunidades SEO. Ninguna ruta nueva puede tirar abajo la generación: todas fallan suave al comportamiento actual.

**Tech Stack:** Next.js 14 (App Router) + Supabase (Postgres) del lado app; Node ESM del lado worker. Tests: Vitest en la app, `node:test` en el worker.

## Global Constraints

- **Diseño de referencia:** `docs/superpowers/specs/2026-08-14-marketing-motor-cruces-y-seo-design.md`. Ante cualquier duda, manda el spec.
- **Worktree:** `.claude/worktrees/marketing-motor-cruces-y-seo`, rama `feat/marketing-motor-cruces-y-seo` desde `main` @ `8e530a4`. Todos los `git` de este plan corren ahí.
- **El worker NO está en git.** Vive en `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\marketing-worker` y esa carpeta no es un repo. Sus cambios **no se commitean**: en cada tarea que lo toque, copiar el archivo modificado a `docs/interno/worker-snapshots/` dentro del worktree y commitear esa copia, para que quede rastro revisable.
- **Espejo obligatorio:** `voz.ts` (app) y `voz.mjs` (worker) tienen que mantener las mismas claves y los mismos textos de fallback. Lo mismo `similitud.ts` / `similitud.mjs`. Si se toca uno, se toca el otro en la misma tarea.
- **Tests de la app:** `npx vitest run <ruta>` para un archivo. La suite completa es `npm test`, que corre **dos runners**: `vitest run && node --test "lib/mapa/**/*.test.ts"`. No reemplazar uno por el otro.
- **Tests del worker:** `node --test <archivo>.test.mjs`, parado en la carpeta del worker.
- **Migraciones:** las del repo **no se aplican solas**. Se aplican por Management API de Supabase con `SUPABASE_API_KEY_MANAGEMENT` (prefijo `sbp_`) del `.env` de PRISMA-SYSTEM, contra el endpoint `/database/query`.
- **Modelo Claude:** `claude-sonnet-5`, sin `temperature`/`top_p`/`top_k`, `max_tokens` al techo de 8000. El thinking adaptativo come del mismo presupuesto que el texto visible.
- **Prohibido tocar:** los 8 eventos GA4 y el embudo (`lib/admin-vakdor/marketing/metricas.ts:380-390`), `fetchGscQueries`, el publicador y `blog_posts` de vakdor-app, el texto del canon y de las 30 escenas actuales, la lista de `MULETILLAS` y la protección de la fórmula "X no es Y" (`voz.ts:36-45`).
- **Sin datos inventados:** ninguna escena, ejemplo o texto de banco puede contener cifras, clientes, casos con nombre ni resultados atribuidos.

---

## Estructura de archivos

**Se crean (app, dentro del worktree):**
- `supabase/migrations/20260814120000_marketing_cruces_esquema.sql` — solo DDL.
- `supabase/migrations/20260814121000_marketing_cruces_banco.sql` — propósitos, estructura nueva, compatibilidades, 8 clusters.
- `supabase/migrations/20260814122000_marketing_cruces_escenas.sql` — etiquetado de las 30 + 60 escenas nuevas.
- `lib/admin-vakdor/marketing/gsc-oportunidades.ts` — filtrado puro de oportunidades SEO, sin red (testeable).
- `lib/admin-vakdor/marketing/gsc-oportunidades.test.ts`
- `docs/interno/worker-snapshots/` — copias de los archivos del worker que se toquen.

**Se modifican (app):**
- `lib/admin-vakdor/marketing/voz.ts` — `momentoDeEtapa`, `estructurasCompatibles`, `instruccionComentario` con texto de base.
- `lib/admin-vakdor/marketing/voz.test.ts` — casos nuevos.
- `lib/admin-vakdor/marketing/types.ts` — tipos de los ejes nuevos.
- `lib/admin-vakdor/marketing/metricas.ts` — `fetchGscOportunidades` + payload.
- `lib/admin-vakdor/marketing/store.ts` — persistir/leer los campos nuevos.
- `app/api/admin-vakdor/marketing/generar/route.ts` — clusters, propósitos, keyword, GSC.
- `components/admin-vakdor/marketing-client.tsx` — badges, selectores, filtro.
- `components/admin-vakdor/marketing-metrics-section.tsx` — bloque de oportunidades SEO.

**Se modifican (worker, sin git):**
- `voz.mjs` — espejo de `voz.ts`.
- `recursos.mjs` — selección por propósito y momento.
- `revision.test.mjs` — casos nuevos de selección.
- `content.mjs` — bloque de propósito, enlaces internos, keyword objetivo.
- `watch.mjs` — pasa el contexto y persiste la receta ampliada.
- `revision.mjs` — criterio extra solo para blog.

---

### Task 1: Esquema de base

**Files:**
- Create: `supabase/migrations/20260814120000_marketing_cruces_esquema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `marketing_clusters(clave, titulo, descripcion, keyword_pilar, url_pilar, fractura, areas, activo, created_at)`; columnas `marketing_ideas.cluster`, `.proposito`, `.keyword_objetivo`; columnas `marketing_recursos.area`, `.momento`, `.propositos`; el check de `marketing_recursos.tipo` acepta `'proposito'`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Motor de contenido: ejes de cruce (cluster, proposito) + escenas con area y momento.
-- Todo aditivo: columnas nuevas nullable y create table if not exists. El unico cambio
-- sobre algo existente es el check de `tipo`, que solo AMPLIA el conjunto permitido.

-- 1. Clusters: territorio unico para blog y LinkedIn.
create table if not exists marketing_clusters (
  clave         text primary key,
  titulo        text not null,
  descripcion   text not null,
  keyword_pilar text not null,
  url_pilar     text not null,
  fractura      text,
  areas         text[] not null default '{}',
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table marketing_clusters enable row level security;
-- Sin politicas: solo service_role, mismo criterio que marketing_ideas.

-- 2. Ejes nuevos en las ideas.
alter table marketing_ideas add column if not exists cluster          text;
alter table marketing_ideas add column if not exists proposito        text;
alter table marketing_ideas add column if not exists keyword_objetivo text;

-- 3. Ejes nuevos en el banco de recursos.
--    area/momento solo se llenan en tipo='escena'; propositos solo en tipo='estructura'.
alter table marketing_recursos add column if not exists area       text;
alter table marketing_recursos add column if not exists momento    text;
alter table marketing_recursos add column if not exists propositos text[] not null default '{}';

-- 4. El banco admite un tipo mas.
alter table marketing_recursos drop constraint if exists marketing_recursos_tipo_check;
alter table marketing_recursos add constraint marketing_recursos_tipo_check
  check (tipo in ('canon','estructura','escena','comentario','proposito'));

-- 5. Indice para el filtrado de escenas por momento y area.
create index if not exists marketing_recursos_escena_idx
  on marketing_recursos (tipo, momento, area) where activo;
```

- [ ] **Step 2: Aplicar la migración por Management API**

Leer `SUPABASE_API_KEY_MANAGEMENT` y el ref del proyecto del `.env` de PRISMA-SYSTEM y hacer `POST` a `/v1/projects/<ref>/database/query` con el SQL como `{"query": "..."}`.

Expected: respuesta 200/201 sin error.

- [ ] **Step 3: Verificar contra la base real**

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'marketing_ideas'
   and column_name in ('cluster','proposito','keyword_objetivo')
 order by column_name;

select count(*) as clusters from marketing_clusters;

select pg_get_constraintdef(oid) as check_tipo
  from pg_constraint where conname = 'marketing_recursos_tipo_check';
```

Expected: 3 columnas nullable en `marketing_ideas`; `clusters = 0`; el check incluye `'proposito'`.

- [ ] **Step 4: Verificar que el código actual sigue andando sin desplegar**

Run: `npx vitest run lib/admin-vakdor/marketing/`
Expected: PASS. Es la prueba de que la migración es aditiva y no rompe lo que ya corre en producción.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814120000_marketing_cruces_esquema.sql
git commit -m "feat(marketing): esquema de clusters, propositos y escenas con area/momento"
```

---

### Task 2: Contenido del banco — propósitos, estructura nueva y clusters

**Files:**
- Create: `supabase/migrations/20260814121000_marketing_cruces_banco.sql`

**Interfaces:**
- Consumes: el esquema de la Task 1.
- Produces: 5 filas `tipo='proposito'` con claves `convencer`, `ensenar`, `mostrar_detras`, `probar_con_dato`, `reflexionar`; 1 fila `tipo='estructura'` clave `framework_pasos`; la columna `propositos` cargada en las 9 estructuras; 8 filas en `marketing_clusters`.

- [ ] **Step 1: Escribir la migración**

Los `detalle` de los propósitos describen **la intención y el tipo de evidencia**, nunca la forma narrativa (eso es de la estructura). Usar `$$...$$` para los textos largos, igual que la migración `20260810120000_marketing_voz.sql`.

```sql
-- 5 propositos: el PARA QUE de la pieza. No dictan la forma (eso es de la estructura),
-- solo la intencion y el tipo de evidencia que corresponde usar.
insert into marketing_recursos (tipo, clave, titulo, detalle) values
('proposito','convencer','Opinion fuerte',
$$Buscas mover una creencia. Afirmas algo que una parte del rubro discutiria y lo sostenes con razonamiento, no con datos. Terminas dejando al lector con una posicion tomada, no con una lista. Evidencia: logica del negocio y consecuencias.$$),
('proposito','ensenar','Educativo',
$$Buscas que el lector se lleve algo aplicable hoy. Explicas un mecanismo o un metodo en partes ordenadas, cada una con su por que. No es una lista de tips: es un camino que se puede recorrer. Evidencia: el mecanismo explicado paso a paso.$$),
('proposito','mostrar_detras','Experiencia',
$$Buscas confianza mostrando el detras de escena: una decision, un error, algo que estas construyendo o que cambiaste de opinion. Hablas en primera persona del trabajo real. Evidencia: lo que viste o hiciste, sin cifras inventadas.$$),
('proposito','probar_con_dato','Dato o investigacion',
$$Buscas anclar un argumento en algo medible. Traes un numero del negocio y lo interpretas: que significa, por que duele, que decision cambia. Si no hay un numero real disponible, NO inventes uno: cambia el angulo a una observacion cualitativa. Evidencia: el numero y su contexto.$$),
('proposito','reflexionar','Reflexion',
$$Buscas pensar en voz alta sobre el negocio, la tecnologia o el oficio. Menos cierre, mas pregunta honesta. Es la pieza que muestra criterio en vez de tecnica. Evidencia: la observacion propia y sus implicancias.$$)
on conflict (tipo, coalesce(clave, titulo)) do nothing;

-- Estructura nueva: la unica que ningun proposito actual cubria (el educativo).
insert into marketing_recursos (tipo, clave, titulo, detalle) values
('estructura','framework_pasos','El metodo en pasos',
$$Abris con la situacion que hace falta resolver, contada como escena. Despues nombras el metodo en 3 a 5 pasos, cada uno con su titulo corto y una explicacion de dos o tres lineas que diga QUE se hace y POR QUE ese orden y no otro. Los pasos tienen que poder ejecutarse sin vos. Cerras diciendo que cambia cuando el metodo esta andando. No es una lista de tips sueltos: es un camino, y el orden importa.$$)
on conflict (tipo, coalesce(clave, titulo)) do nothing;

-- Compatibilidad proposito -> estructura. Cada proposito queda con 2 estructuras como
-- minimo, para que la rotacion (que evita repetir la estructura reciente) nunca se trabe.
update marketing_recursos set propositos = '{convencer}'                 where tipo='estructura' and clave='mito_realidad';
update marketing_recursos set propositos = '{convencer}'                 where tipo='estructura' and clave='concesion_vuelta';
update marketing_recursos set propositos = '{convencer}'                 where tipo='estructura' and clave='contraste';
update marketing_recursos set propositos = '{ensenar}'                   where tipo='estructura' and clave='framework_pasos';
update marketing_recursos set propositos = '{ensenar,probar_con_dato}'   where tipo='estructura' and clave='autopsia';
update marketing_recursos set propositos = '{mostrar_detras,reflexionar}' where tipo='estructura' and clave='confesion';
update marketing_recursos set propositos = '{mostrar_detras}'            where tipo='estructura' and clave='escena_campo';
update marketing_recursos set propositos = '{probar_con_dato}'           where tipo='estructura' and clave='numero_duele';
update marketing_recursos set propositos = '{reflexionar}'               where tipo='estructura' and clave='carta_director';

-- 8 clusters. Cada uno cuelga de una de las 3 fracturas del eje de marca.
-- url_pilar es el destino previsto; las paginas pilar se escriben cuando Leonardo decida.
insert into marketing_clusters (clave, titulo, descripcion, keyword_pilar, url_pilar, fractura, areas) values
('operaciones_inmobiliarias','Operaciones inmobiliarias',
 'Como funciona por dentro una inmobiliaria y donde se rompe la operacion.',
 'operaciones inmobiliarias','/operaciones-inmobiliarias/','madre',
 '{direccion,equipo,ventas,alquileres_administracion}'),
('leads_inmobiliarios','Leads inmobiliarios',
 'Donde se pierden las consultas entre que entran y que se convierten en visita.',
 'leads inmobiliarios','/leads-inmobiliarios/','hemorragia',
 '{ventas,pauta_marketing}'),
('whatsapp_inmobiliarias','WhatsApp para inmobiliarias',
 'El canal donde hoy pasa la conversacion con el cliente y como no perder el control.',
 'WhatsApp para inmobiliarias','/whatsapp-para-inmobiliarias/','hemorragia',
 '{ventas,equipo}'),
('equipo_y_asesores','Performance de asesores',
 'Como se mide, se estandariza y se sostiene el rendimiento de un equipo comercial.',
 'performance asesores inmobiliaria','/performance-asesores/','anarquia',
 '{equipo,ventas}'),
('automatizacion_inmobiliaria','Automatizacion inmobiliaria',
 'Que tareas del dia a dia pueden dejar de depender de que alguien se acuerde.',
 'automatizacion inmobiliaria','/automatizacion-inmobiliaria/','anarquia',
 '{alquileres_administracion,equipo,ventas}'),
('ia_para_inmobiliarias','IA para inmobiliarias',
 'Donde tiene sentido usar IA en una inmobiliaria y donde no.',
 'IA para inmobiliarias','/ia-para-inmobiliarias/','anarquia',
 '{ventas,direccion}'),
('kpis_y_gobernanza','KPIs inmobiliarios',
 'Que mira un director para dirigir con datos en vez de con comentarios de pasillo.',
 'KPIs inmobiliarios','/kpis-inmobiliarios/','ceguera',
 '{direccion,equipo}'),
('escalar_inmobiliaria','Escalar una inmobiliaria',
 'Como crecer en volumen sin que la estructura crezca en la misma proporcion.',
 'escalar inmobiliaria','/escalar-inmobiliaria/','ceguera',
 '{direccion,captacion_tasacion,pauta_marketing}')
on conflict (clave) do nothing;
```

- [ ] **Step 2: Aplicar por Management API**

Mismo procedimiento que la Task 1.

- [ ] **Step 3: Verificar la carga y la cobertura**

```sql
select clave, propositos from marketing_recursos where tipo='estructura' order by clave;

-- Ningun proposito puede quedar con menos de 2 estructuras.
select p.clave as proposito, count(e.id) as estructuras
  from marketing_recursos p
  left join marketing_recursos e
    on e.tipo='estructura' and e.activo and p.clave = any(e.propositos)
 where p.tipo='proposito'
 group by p.clave order by estructuras;

select count(*) as clusters from marketing_clusters where activo;
```

Expected: 9 estructuras, todas con `propositos` no vacío; ningún propósito con menos de 2; `clusters = 8`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814121000_marketing_cruces_banco.sql
git commit -m "feat(marketing): 5 propositos, estructura framework_pasos y 8 clusters"
```

---

### Task 3: Escenas — etiquetar las 30 y cargar 60 nuevas

**Files:**
- Create: `supabase/migrations/20260814122000_marketing_cruces_escenas.sql`

**Interfaces:**
- Consumes: el esquema de la Task 1.
- Produces: 90 filas `tipo='escena'`, todas con `area` y `momento`; ninguna celda `area × momento` con menos de 4.

**Matriz de cobertura (18 celdas, 90 escenas):**

| Área | dolor (existentes + nuevas) | intento_fallido | resuelto |
|---|---|---|---|
| `ventas` | 12 (10 + 2) | 4 | 4 |
| `equipo` | 10 (8 + 2) | 4 | 4 |
| `direccion` | 6 (4 + 2) | 4 | 4 |
| `alquileres_administracion` | 5 (3 + 2) | 4 | 4 |
| `captacion_tasacion` | 5 (3 + 2) | 4 | 4 |
| `pauta_marketing` | 4 (2 + 2) | 4 | 4 |

Aritmética: dolor 42 (30 existentes + 12 nuevas) + `intento_fallido` 24 + `resuelto` 24 = **90**, de las cuales **60 son nuevas** (12 de dolor + 48 de los dos momentos que hoy están vacíos). Ninguna celda queda por debajo de 4.

- [ ] **Step 1: Etiquetar las 30 escenas existentes**

Todas son `momento='dolor'`. Se asigna `area` por título exacto, sin tocar `titulo` ni `detalle`.

```sql
update marketing_recursos set momento='dolor', area='ventas' where tipo='escena' and titulo in (
  'Menú automático a una consulta concreta','El lead del sábado a la noche','El mismo lead llamado dos veces',
  'El lead frío que era el mejor','La competencia contesta en dos minutos','El presupuesto que nunca se pregunta',
  'El "mandame info" que muere','El teléfono mal cargado','La búsqueda que nadie cruzó','El horario que no existe');

update marketing_recursos set momento='dolor', area='equipo' where tipo='escena' and titulo in (
  'La cartera se va en el celular','El Excel paralelo','El WhatsApp personal del asesor',
  'Dos asesores hacen el 70%','El asesor nuevo sin proceso','El seguimiento que depende de la memoria',
  'El CRM cargado a medias','Los 47 chats sin leer');

update marketing_recursos set momento='dolor', area='direccion' where tipo='escena' and titulo in (
  'El pasillo como sistema de reporte','La reunión de los lunes','El informe armado a mano',
  'La operación que se cayó en silencio');

update marketing_recursos set momento='dolor', area='alquileres_administracion' where tipo='escena' and titulo in (
  'Las expensas que nadie confirma','La propiedad reservada que sigue publicada','El "te confirmo y te aviso"');

update marketing_recursos set momento='dolor', area='captacion_tasacion' where tipo='escena' and titulo in (
  'La tasación por corazonada','El propietario que llama a preguntar','La visita que nadie confirmó');

update marketing_recursos set momento='dolor', area='pauta_marketing' where tipo='escena' and titulo in (
  'La campaña que entra y se desborda','El cliente que ya contó todo');

-- Red de seguridad: ninguna escena puede quedar sin etiquetar.
update marketing_recursos set momento='dolor', area='ventas'
 where tipo='escena' and (area is null or momento is null);
```

- [ ] **Step 2: Verificar que no quedó ninguna sin etiquetar**

```sql
select count(*) as sin_etiquetar from marketing_recursos
 where tipo='escena' and (area is null or momento is null);
select area, count(*) from marketing_recursos where tipo='escena' group by area order by area;
```

Expected: `sin_etiquetar = 0`; 6 áreas, sumando 30.

- [ ] **Step 3: Escribir las 60 escenas nuevas**

Reglas de redacción (del canon, `marketing_recursos` fila `tipo='canon'`): situación concreta y reconocible; al menos un detalle específico (una hora, un día, un plazo, un tipo de propiedad); español rioplatense; **prohibido** inventar cifras, clientes, casos con nombre o resultados atribuidos. `intento_fallido` describe algo que la agencia probó y no funcionó; `resuelto` describe cómo se ve el mismo problema una vez sistematizado, **sin nombrar PRISMA** (el producto lo agrega el prompt según la etapa del embudo).

Formato de cada fila:

```sql
insert into marketing_recursos (tipo, titulo, detalle, area, momento) values
('escena','<título corto>','<1-2 frases con un detalle específico>','<area>','<momento>');
```

Títulos a escribir (60):

*ventas · intento_fallido (4):* "La plantilla de respuesta que nadie usa" · "El recordatorio en el calendario personal" · "El grupo de WhatsApp del equipo comercial" · "El bot que contestaba cualquier cosa"
*ventas · resuelto (4):* "La consulta del domingo ya contestada" · "El lead llega calificado a la primera llamada" · "El historial completo antes de atender" · "La visita se confirma sola"
*equipo · intento_fallido (4):* "El manual de procesos en PDF" · "La capacitación de una tarde" · "El CRM nuevo que duró dos meses" · "El premio al que más llama"
*equipo · resuelto (4):* "El asesor nuevo produce en la primera semana" · "La cartera queda cuando el asesor se va" · "Todos contestan igual sin guion memorizado" · "El seguimiento no depende de quién esté"
*direccion · intento_fallido (4):* "El tablero que nadie abre" · "El reporte semanal por mail" · "La consultora que dejó un diagnóstico" · "Contratar a alguien para que ordene"
*direccion · resuelto (4):* "El lunes el reporte ya está" · "Se ve dónde se cae cada operación" · "La reunión dura veinte minutos" · "Se decide sobre el dato, no sobre el recuerdo"
*alquileres_administracion · dolor (2):* "La renovación que se venció sin avisar" · "El garante que nadie terminó de validar"
*alquileres_administracion · intento_fallido (4):* "La planilla compartida de vencimientos" · "El mail masivo a los inquilinos" · "El teléfono de administración que suena ocupado" · "El WhatsApp de administración sin dueño"
*alquileres_administracion · resuelto (4):* "El vencimiento avisa antes" · "El inquilino se autogestiona el comprobante" · "Las expensas salen confirmadas" · "Administración deja de ser un cuello"
*captacion_tasacion · dolor (2):* "La captación que se firmó sin exclusividad" · "El informe de tasación que nunca se entregó"
*captacion_tasacion · intento_fallido (4):* "El comparativo armado a ojo" · "La carpeta de captación en Canva" · "El propietario pide otra tasación" · "El precio se baja tarde"
*captacion_tasacion · resuelto (4):* "La tasación sale con comparables reales" · "El propietario ve el movimiento solo" · "La captación entra con precio defendible" · "El informe se manda el mismo día"
*pauta_marketing · dolor (2):* "El costo por consulta que nadie calcula" · "La campaña que trae curiosos"
*pauta_marketing · intento_fallido (4):* "La agencia de marketing que trae volumen" · "Duplicar el presupuesto de pauta" · "El formulario con diez campos" · "Publicar en más portales"
*pauta_marketing · resuelto (4):* "Se sabe qué campaña trajo la operación" · "El costo por visita, no por clic" · "La pauta se corta con dato" · "Entra menos y cierra más"
*ventas · dolor (2):* "La contraoferta que se pierde en el chat" · "La reserva que se cae el viernes"
*equipo · dolor (2):* "El asesor que se lleva el mejor cliente" · "La discusión por quién cargó el lead"
*direccion · dolor (2):* "El número de cierre que cada uno calcula distinto" · "El mes que se cerró sin saber por qué"

**Control:** 6 áreas × 2 escenas de dolor = 12, más 6 áreas × 4 de `intento_fallido` = 24, más 6 áreas × 4 de `resuelto` = 24. Total **60**. Si al escribirlas la cuenta no da 60, algo está mal.

- [ ] **Step 4: Aplicar por Management API y verificar la matriz completa**

```sql
select area, momento, count(*) from marketing_recursos
 where tipo='escena' and activo group by area, momento order by area, momento;

select count(*) as total from marketing_recursos where tipo='escena' and activo;

select count(*) as celdas_flacas from (
  select area, momento, count(*) c from marketing_recursos
   where tipo='escena' and activo group by area, momento
) t where c < 4;
```

Expected: 18 filas en la matriz; `total = 90`; `celdas_flacas = 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814122000_marketing_cruces_escenas.sql
git commit -m "feat(marketing): 90 escenas con area y momento (30 etiquetadas + 60 nuevas)"
```

---

### Task 4: Desacoplar el banco del código

**Files:**
- Modify: `lib/admin-vakdor/marketing/voz.ts`
- Modify: `lib/admin-vakdor/marketing/voz.test.ts`
- Modify (worker, sin git): `voz.mjs`, `similitud.test.mjs`

**Interfaces:**
- Consumes: nada de tareas anteriores (es lógica pura).
- Produces:
  - `export type ClaveProposito = "convencer" | "ensenar" | "mostrar_detras" | "probar_con_dato" | "reflexionar"`
  - `export type Momento = "dolor" | "intento_fallido" | "resuelto"`
  - `export function momentoDeEtapa(etapa: EtapaEmbudo): Momento`
  - `export function estructurasCompatibles<T extends { propositos?: string[] }>(estructuras: T[], proposito: string | null): T[]`
  - `export function instruccionComentario(clave: ClaveComentario, etapa: EtapaEmbudo, detalle?: string | null): string`
  - `export function claveValida(claves: string[], candidata: unknown): string | null`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `lib/admin-vakdor/marketing/voz.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  momentoDeEtapa, estructurasCompatibles, instruccionComentario, claveValida,
} from "./voz"

describe("momentoDeEtapa", () => {
  it("ata cada etapa del embudo a su momento", () => {
    expect(momentoDeEtapa("tofu")).toBe("dolor")
    expect(momentoDeEtapa("mofu")).toBe("intento_fallido")
    expect(momentoDeEtapa("bofu")).toBe("resuelto")
  })
})

describe("estructurasCompatibles", () => {
  const banco = [
    { clave: "mito_realidad", propositos: ["convencer"] },
    { clave: "framework_pasos", propositos: ["ensenar"] },
    { clave: "autopsia", propositos: ["ensenar", "probar_con_dato"] },
  ]

  it("filtra a las que declaran el proposito", () => {
    expect(estructurasCompatibles(banco, "ensenar").map((e) => e.clave))
      .toEqual(["framework_pasos", "autopsia"])
  })

  it("sin proposito devuelve todas", () => {
    expect(estructurasCompatibles(banco, null)).toHaveLength(3)
  })

  it("si ninguna declara ese proposito devuelve todas, no vacio", () => {
    // Nunca bloquear la generacion: es preferible una estructura menos afin que ninguna.
    expect(estructurasCompatibles(banco, "reflexionar")).toHaveLength(3)
  })

  it("tolera estructuras sin la columna propositos", () => {
    expect(estructurasCompatibles([{ clave: "vieja" }], "ensenar")).toHaveLength(1)
  })
})

describe("instruccionComentario", () => {
  it("usa el detalle de la base cuando viene", () => {
    const txt = instruccionComentario("dato_crudo", "tofu", "Texto nuevo desde la base.")
    expect(txt).toContain("Texto nuevo desde la base.")
    expect(txt).toContain("Sin links.")
  })

  it("cae al texto hardcodeado si el detalle viene vacio", () => {
    const txt = instruccionComentario("dato_crudo", "tofu", "   ")
    expect(txt).toContain("Un número real del negocio")
  })

  it("en bofu agrega el link y en las otras etapas no", () => {
    expect(instruccionComentario("matiz", "bofu", null)).toContain("https://vakdor.com/demostracion")
    expect(instruccionComentario("matiz", "mofu", null)).toContain("Sin links.")
  })
})

describe("claveValida", () => {
  it("acepta una clave que existe en la base aunque el codigo no la conozca", () => {
    expect(claveValida(["confesion", "estructura_inventada_hoy"], "estructura_inventada_hoy"))
      .toBe("estructura_inventada_hoy")
  })

  it("rechaza lo que no esta y lo que no es string", () => {
    expect(claveValida(["confesion"], "no_existe")).toBeNull()
    expect(claveValida(["confesion"], 42)).toBeNull()
  })

  it("normaliza espacios y mayusculas", () => {
    expect(claveValida(["confesion"], "  CONFESION ")).toBe("confesion")
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npx vitest run lib/admin-vakdor/marketing/voz.test.ts`
Expected: FAIL — `momentoDeEtapa is not a function` (y las demás sin exportar).

- [ ] **Step 3: Implementar en `voz.ts`**

```ts
export type ClaveProposito =
  | "convencer" | "ensenar" | "mostrar_detras" | "probar_con_dato" | "reflexionar"

export type Momento = "dolor" | "intento_fallido" | "resuelto"

/**
 * Cada etapa del embudo tira de un momento distinto de la escena. Antes las tres
 * sorteaban de la misma bolsa de dolor y BOFU tenia que improvisar el "asi se ve resuelto".
 */
export function momentoDeEtapa(etapa: EtapaEmbudo): Momento {
  switch (etapa) {
    case "tofu": return "dolor"
    case "mofu": return "intento_fallido"
    case "bofu": return "resuelto"
  }
}

/**
 * El proposito NO dicta la forma: restringe que estructuras pueden sortearse.
 * Si el filtro deja el pool vacio devuelve todas: una estructura menos afin es mejor
 * que ninguna, y bloquear la generacion no es una opcion.
 */
export function estructurasCompatibles<T extends { propositos?: string[] }>(
  estructuras: T[],
  proposito: string | null,
): T[] {
  if (!proposito) return estructuras
  const afines = estructuras.filter((e) => (e.propositos ?? []).includes(proposito))
  return afines.length ? afines : estructuras
}

/** Valida una clave contra las que existen HOY en la base, no contra una lista cerrada en codigo. */
export function claveValida(claves: string[], candidata: unknown): string | null {
  if (typeof candidata !== "string") return null
  const limpia = candidata.trim().toLowerCase()
  return claves.includes(limpia) ? limpia : null
}
```

Y cambiar `instruccionComentario` para aceptar el texto de la base:

```ts
export function instruccionComentario(
  clave: ClaveComentario,
  etapa: EtapaEmbudo,
  detalle?: string | null,
): string {
  // Fallback: el texto que vivia hardcodeado. Se usa solo si la fila no trae `detalle`,
  // con el mismo criterio de falla suave que canonDeVoz.
  const cuerpos: Record<ClaveComentario, string> = {
    dato_crudo: "Un número real del negocio con el contexto que lo hace doler. No pidas nada. Dos o tres líneas.",
    opinion_filosa: "Una postura más dura que la del post, que el post no se animó a decir. Controversia sobre el negocio, nunca agravio a personas.",
    matiz: 'La excepción honesta: "esto no aplica si...". Demostrá que conocés los bordes del problema.',
    micro_caso: "La escena contada en tres líneas, sin moraleja ni cierre. Que el lector saque la conclusión.",
    pregunta_binaria: 'Una pregunta de dos opciones concretas del negocio. PROHIBIDO "¿y vos qué opinás?" y cualquier variante genérica.',
  }
  const cuerpo = (detalle ?? "").trim() || cuerpos[clave]
  const link = etapa === "bofu"
    ? "Al final, en una línea aparte, el link: https://vakdor.com/demostracion"
    : "Sin links."
  return `PRIMER COMENTARIO (tipo: ${clave}). ${cuerpo} ${link}`
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run lib/admin-vakdor/marketing/voz.test.ts`
Expected: PASS.

- [ ] **Step 5: Espejar en el worker**

Portar los mismos cambios a `voz.mjs` (sin tipos), y agregar a `similitud.test.mjs` los casos de `momentoDeEtapa`, `estructurasCompatibles` e `instruccionComentario` con `detalle`, en el estilo `node:test` que ya usa ese archivo.

Run: `node --test similitud.test.mjs` (parado en la carpeta del worker)
Expected: PASS.

- [ ] **Step 6: Commit (app + snapshot del worker)**

```bash
mkdir -p docs/interno/worker-snapshots
cp "../../../../Prisma - MK/marketing-worker/voz.mjs" docs/interno/worker-snapshots/voz.mjs
git add lib/admin-vakdor/marketing/voz.ts lib/admin-vakdor/marketing/voz.test.ts docs/interno/worker-snapshots/voz.mjs
git commit -m "feat(marketing): el banco deja de depender de listas cerradas en codigo"
```

---

### Task 5: Selección por propósito y momento

**Files:**
- Modify (worker, sin git): `recursos.mjs`, `revision.test.mjs`

**Interfaces:**
- Consumes: `momentoDeEtapa`, `estructurasCompatibles` de `voz.mjs` (Task 4).
- Produces:
  - `export function elegirEscenas(escenas, { momento, areas, excluirIds })` → array de 2 escenas.
  - `recetaParaIdea(db, previas, ctx)` donde `ctx = { estructura, proposito, funnel, cluster, areas }`; devuelve `{ canon, estructura, escenas, comentarioTipo, comentarioDetalle, proposito }`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `revision.test.mjs`:

```js
import { elegirEscenas } from "./recursos.mjs";

const escena = (id, area, momento, usos = 0) => ({ id, titulo: id, detalle: id, area, momento, usos, ultimo_uso: null });

const BANCO = [
  escena("d1", "ventas", "dolor"),
  escena("d2", "equipo", "dolor"),
  escena("f1", "ventas", "intento_fallido"),
  escena("r1", "ventas", "resuelto"),
  escena("r2", "equipo", "resuelto"),
];

test("la primera escena respeta el momento y la segunda es libre", () => {
  const [a, b] = elegirEscenas(BANCO, { momento: "resuelto", areas: [], excluirIds: [] });
  assert.equal(a.momento, "resuelto");
  assert.notEqual(b.id, a.id);
});

test("sin escenas del momento pedido no bloquea: devuelve dos igual", () => {
  const soloDolor = BANCO.filter((e) => e.momento === "dolor");
  const elegidas = elegirEscenas(soloDolor, { momento: "resuelto", areas: [], excluirIds: [] });
  assert.equal(elegidas.length, 2);
});

test("el area afin ordena primero pero no excluye", () => {
  const [a] = elegirEscenas(BANCO, { momento: "resuelto", areas: ["equipo"], excluirIds: [] });
  assert.equal(a.area, "equipo");
});

test("con banco de una sola escena devuelve una, sin repetirla", () => {
  const elegidas = elegirEscenas([escena("u1", "ventas", "dolor")], { momento: "dolor", areas: [], excluirIds: [] });
  assert.equal(elegidas.length, 1);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test revision.test.mjs`
Expected: FAIL — `elegirEscenas is not a function`.

- [ ] **Step 3: Implementar en `recursos.mjs`**

```js
import { momentoDeEtapa, estructurasCompatibles } from "./voz.mjs";

/**
 * Elige 2 escenas: la primera del momento que pide la etapa del embudo, la segunda libre.
 * Da contraste narrativo (dolor -> resuelto) en vez de dos escenas del mismo tono.
 * Ningun filtro bloquea: si no hay del momento pedido, las dos salen libres.
 */
export function elegirEscenas(escenas, { momento, areas = [], excluirIds = [] }) {
  if (!escenas.length) return [];
  const afin = (e) => areas.length && areas.includes(e.area);
  // Las del area del cluster primero, despues el resto; dentro de cada grupo, la rotacion de siempre.
  const porAfinidad = (lista) => [
    ...elegirRecursos(lista.filter(afin), lista.length, excluirIds),
    ...elegirRecursos(lista.filter((e) => !afin(e)), lista.length, excluirIds),
  ];

  const delMomento = porAfinidad(escenas.filter((e) => e.momento === momento));
  const primera = delMomento[0] ?? elegirRecursos(escenas, 1, excluirIds)[0] ?? null;
  if (!primera) return [];

  const resto = porAfinidad(escenas.filter((e) => e.id !== primera.id));
  const segunda = resto[0] ?? null;
  return segunda ? [primera, segunda] : [primera];
}
```

Y reescribir `recetaParaIdea` para recibir contexto:

```js
/**
 * `ctx.estructura` es la que la idea ya trae elegida. Manda SOLO si es compatible con el
 * proposito: el prompt tiene que llevar una sola forma coherente. Si no lo es, gana el
 * proposito y queda registro, porque un cruce incoherente se paga en un reintento.
 */
export async function recetaParaIdea(db, previas, ctx = {}) {
  const { estructura: claveEstructura = null, proposito = null, funnel = "mofu", areas = [] } = ctx;
  const canon = await canonDeVoz(db);
  const [estructuras, escenas, comentarios, propositos] = await Promise.all([
    traerRecursos(db, "estructura"),
    traerRecursos(db, "escena"),
    traerRecursos(db, "comentario"),
    traerRecursos(db, "proposito"),
  ]);

  // Si la idea no trae proposito, se sortea con la misma rotacion que todo lo demas.
  const propositoElegido = propositos.find((p) => p.clave === proposito)
    ?? elegirRecursos(propositos, 1, previas.map((p) => p.proposito).filter(Boolean))[0]
    ?? null;

  const candidatas = estructurasCompatibles(estructuras, propositoElegido?.clave ?? null);
  const usadas = estructuras.filter((e) => previas.map((p) => p.estructura).includes(e.clave)).map((e) => e.id);

  const pedida = String(claveEstructura ?? "").trim().toLowerCase();
  const deLaIdea = pedida ? candidatas.find((e) => String(e.clave ?? "").toLowerCase() === pedida) : null;
  if (pedida && !deLaIdea) {
    console.error(`recetaParaIdea: la estructura "${pedida}" no es compatible con el proposito "${propositoElegido?.clave}"; manda el proposito`);
  }
  const estructura = deLaIdea ?? elegirRecursos(candidatas, 1, usadas)[0] ?? null;

  const elegidas = elegirEscenas(escenas, {
    momento: momentoDeEtapa(funnel),
    areas,
    excluirIds: previas.flatMap((p) => p.escenas ?? []),
  });
  const comentario = elegirRecursos(comentarios, 1, [])[0] ?? null;

  await marcarUsados(db, [estructura?.id, comentario?.id, propositoElegido?.id, ...elegidas.map((e) => e.id)].filter(Boolean));

  return {
    canon,
    estructura,
    escenas: elegidas,
    comentarioTipo: comentario?.clave ?? "dato_crudo",
    comentarioDetalle: comentario?.detalle ?? null,
    proposito: propositoElegido,
  };
}
```

Actualizar también `resumirPieza` para que devuelva `proposito: clave(receta?.proposito)`, y `formatearMemoria` para que lo muestre junto a la estructura.

- [ ] **Step 4: Correr los tests**

Run: `node --test revision.test.mjs`
Expected: PASS, incluidos los tests preexistentes de `recetaParaIdea`.

- [ ] **Step 5: Commit (snapshot)**

```bash
cp "../../../../Prisma - MK/marketing-worker/recursos.mjs" docs/interno/worker-snapshots/recursos.mjs
git add docs/interno/worker-snapshots/recursos.mjs
git commit -m "feat(marketing): seleccion de escenas por momento del embudo y area del cluster"
```

---

### Task 6: Oportunidades de Search Console

**Files:**
- Create: `lib/admin-vakdor/marketing/gsc-oportunidades.ts`
- Create: `lib/admin-vakdor/marketing/gsc-oportunidades.test.ts`
- Modify: `lib/admin-vakdor/marketing/metricas.ts`

**Interfaces:**
- Consumes: `getGoogleAccessToken`, `fetchWithTimeout` (ya en `metricas.ts`).
- Produces:
  - `export interface GscOportunidad { query: string; url: string; clicks: number; impressions: number; position: number }`
  - `export function filtrarOportunidades(rows: unknown[], opts?: { minPos?: number; maxPos?: number; minImpresiones?: number; limite?: number }): GscOportunidad[]`
  - `export async function fetchGscOportunidades(periodo: "7d"|"30d"|"90d"): Promise<{ data: GscOportunidad[]; estado: "ok"|"error" }>`
  - `MarketingMetricsPayload` suma `gscOportunidades: GscOportunidad[]`.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest"
import { filtrarOportunidades } from "./gsc-oportunidades"

const fila = (query: string, url: string, position: number, impressions: number) => ({
  keys: [query, url], clicks: 0, impressions, position,
})

describe("filtrarOportunidades", () => {
  it("deja pasar solo posiciones 4 a 20 con impresiones suficientes", () => {
    const out = filtrarOportunidades([
      fila("ya rankea", "/a", 2.1, 500),   // muy arriba: no es oportunidad
      fila("la buena", "/b", 7.4, 340),
      fila("muy abajo", "/c", 34.0, 900),  // fuera de rango
      fila("ruido", "/d", 9.0, 1),         // pocas impresiones
    ])
    expect(out.map((o) => o.query)).toEqual(["la buena"])
  })

  it("incluye los bordes 4 y 20", () => {
    const out = filtrarOportunidades([fila("borde bajo", "/a", 4, 10), fila("borde alto", "/b", 20, 10)])
    expect(out).toHaveLength(2)
  })

  it("ordena por impresiones y corta en el limite", () => {
    const out = filtrarOportunidades(
      [fila("chica", "/a", 5, 10), fila("grande", "/b", 5, 900)], { limite: 1 })
    expect(out.map((o) => o.query)).toEqual(["grande"])
  })

  it("tolera filas rotas sin explotar", () => {
    expect(filtrarOportunidades([{}, { keys: [] }, null as unknown as object])).toEqual([])
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npx vitest run lib/admin-vakdor/marketing/gsc-oportunidades.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

```ts
/**
 * Oportunidades SEO: lo que ya aparece pero todavia no arriba. Se separa de fetchGscQueries
 * a proposito — esa alimenta el panel y no se toca. Esta pide la dimension `page` ademas de
 * `query`, que multiplica las filas y romperia la lectura de la otra.
 */
export interface GscOportunidad {
  query: string
  url: string
  clicks: number
  impressions: number
  position: number
}

/** Puro y sin red, para poder testear el criterio sin pegarle a Google. */
export function filtrarOportunidades(
  rows: unknown[],
  { minPos = 4, maxPos = 20, minImpresiones = 5, limite = 15 } = {},
): GscOportunidad[] {
  const out: GscOportunidad[] = []
  for (const r of rows ?? []) {
    const row = r as { keys?: unknown[]; clicks?: number; impressions?: number; position?: number }
    const query = typeof row?.keys?.[0] === "string" ? (row.keys[0] as string) : ""
    const url = typeof row?.keys?.[1] === "string" ? (row.keys[1] as string) : ""
    if (!query) continue
    const position = Number(row.position ?? 0)
    const impressions = Number(row.impressions ?? 0)
    // El piso de impresiones evita que una sola impresion suelta mande el calendario editorial.
    if (position < minPos || position > maxPos || impressions < minImpresiones) continue
    out.push({ query, url, clicks: Number(row.clicks ?? 0), impressions, position: Math.round(position * 10) / 10 })
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, limite)
}
```

En `metricas.ts`, agregar `fetchGscOportunidades` con `dimensions: ["query","page"]`, `rowLimit: 200`, el mismo `fetchWithTimeout` de 3.5s y falla suave a `{ data: [], estado: "error" }`. Sumar `gscOportunidades` al payload en `loadMarketingMetricsPayload` (dentro del `Promise.all` que ya existe).

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run lib/admin-vakdor/marketing/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-vakdor/marketing/gsc-oportunidades.ts lib/admin-vakdor/marketing/gsc-oportunidades.test.ts lib/admin-vakdor/marketing/metricas.ts
git commit -m "feat(marketing): oportunidades SEO de posicion 4-20 desde Search Console"
```

---

### Task 7: El motor de ideas usa clusters, propósitos y GSC

**Files:**
- Modify: `app/api/admin-vakdor/marketing/generar/route.ts`
- Modify: `lib/admin-vakdor/marketing/types.ts`
- Modify: `lib/admin-vakdor/marketing/store.ts`

**Interfaces:**
- Consumes: `filtrarOportunidades`/`fetchGscOportunidades` (Task 6), `claveValida` (Task 4), tablas de las Tasks 1-2.
- Produces: `NuevaIdeaInput` suma `cluster?: string | null`, `proposito?: string | null`, `keyword_objetivo?: string | null`; `MarketingIdea` suma los mismos tres campos; `insertarIdeasMotor` los persiste.

- [ ] **Step 1: Sumar los campos a los tipos y al store**

En `types.ts`, agregar los tres campos a `MarketingIdea` y a `NuevaIdeaInput`, y `proposito: string | null` + `cluster: string | null` a `Receta`. En `store.ts`, incluirlos en el `select` de `listarIdeas` y en el `insert` de `insertarIdeasMotor`.

- [ ] **Step 2: Escribir el test que falla**

`app/api/admin-vakdor/marketing/generar/validacion.test.ts` (extraer la validación a una función pura para poder testearla sin levantar la ruta):

```ts
import { describe, it, expect } from "vitest"
import { parsearIdeas } from "./validacion"

const CLAVES = { clusters: ["leads_inmobiliarios"], propositos: ["ensenar"], estructuras: ["framework_pasos"] }

describe("parsearIdeas", () => {
  it("acepta una idea completa y valida", () => {
    const [idea] = parsearIdeas([{
      titulo: "T", fuente: "blog", formato: "articulo_blog", funnel: "mofu",
      cluster: "leads_inmobiliarios", proposito: "ensenar", estructura: "framework_pasos",
      keyword_objetivo: "seguimiento leads inmobiliaria",
    }], CLAVES)
    expect(idea.cluster).toBe("leads_inmobiliarios")
    expect(idea.keyword_objetivo).toBe("seguimiento leads inmobiliaria")
  })

  it("deja en null lo que no valida, sin descartar la idea", () => {
    const [idea] = parsearIdeas([{
      titulo: "T", fuente: "blog", formato: "articulo_blog",
      cluster: "inventado", proposito: "inventado", estructura: "inventada",
    }], CLAVES)
    expect(idea.cluster).toBeNull()
    expect(idea.proposito).toBeNull()
    expect(idea.estructura).toBeNull()
  })

  it("descarta la idea si falta titulo, fuente o formato", () => {
    expect(parsearIdeas([{ titulo: "", fuente: "blog", formato: "articulo_blog" }], CLAVES)).toEqual([])
    expect(parsearIdeas([{ titulo: "T", fuente: "tiktok", formato: "articulo_blog" }], CLAVES)).toEqual([])
  })

  it("acepta una estructura que solo existe en la base", () => {
    // La prueba de que se dejo de validar contra la lista cerrada del codigo.
    const [idea] = parsearIdeas(
      [{ titulo: "T", fuente: "linkedin", formato: "post_texto", estructura: "estructura_nueva_de_hoy" }],
      { ...CLAVES, estructuras: ["estructura_nueva_de_hoy"] })
    expect(idea.estructura).toBe("estructura_nueva_de_hoy")
  })
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npx vitest run app/api/admin-vakdor/marketing/generar/validacion.test.ts`
Expected: FAIL — no existe `./validacion`.

- [ ] **Step 4: Implementar `validacion.ts` y usarla en la ruta**

`parsearIdeas(parsed, claves)` reemplaza el `for` que hoy vive inline en `route.ts:73-91`, usando `claveValida` para cluster, propósito y estructura. En `route.ts`:

- Traer clusters activos (`marketing_clusters`), propósitos activos y `fetchGscOportunidades("90d")`, cada uno en su propio `try/catch` con falla suave, igual que el bloque de recursos de `route.ts:39-43`.
- Sumar al prompt tres bloques nuevos (omitidos si vienen vacíos):
  - `TERRITORIOS DISPONIBLES` con clave, título y keyword pilar de cada cluster; instrucción de mezclar territorios.
  - `PROPOSITOS DISPONIBLES` con clave y título; instrucción de asignar uno distinto a cada idea.
  - `OPORTUNIDADES REALES DE BUSQUEDA (Search Console)` con query, posición e impresiones, más: *"Estas son búsquedas por las que el sitio YA aparece sin estar arriba. Priorizá ideas de blog que las respondan mejor. Poné la búsqueda en `keyword_objetivo`. No inventes búsquedas que no estén en esta lista."*
- Ampliar el JSON pedido con `cluster`, `proposito` y `keyword_objetivo`.

- [ ] **Step 5: Correr los tests**

Run: `npx vitest run app/api/admin-vakdor/marketing/ lib/admin-vakdor/marketing/`
Expected: PASS.

- [ ] **Step 6: Verificar que compila**

Run: `npx next build`
Expected: build OK, sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin-vakdor/marketing/generar/ lib/admin-vakdor/marketing/types.ts lib/admin-vakdor/marketing/store.ts
git commit -m "feat(marketing): el motor de ideas cruza cluster, proposito y busquedas reales"
```

---

### Task 8: El worker escribe con propósito, keyword y enlaces internos

**Files:**
- Modify (worker, sin git): `content.mjs`, `watch.mjs`, `recursos.mjs`

**Interfaces:**
- Consumes: `recetaParaIdea` con contexto (Task 5).
- Produces:
  - `ctx` suma `enlaces` (array `{titulo, url}`) y `pilar` (`{keyword, url}|null`); la receta persistida suma `proposito` y `cluster`.
  - En `recursos.mjs`: `export async function articulosPublicados(db, limite)` → `[{titulo, url}]` y `export async function traerCluster(db, clave)` → `{clave, keyword_pilar, url_pilar, areas}|null`.

- [ ] **Step 1: Bloque de propósito en `content.mjs`**

En `bloqueVoz`, insertar **antes** de la estructura y dejando claro que no compite con ella:

```js
proposito ? `PROPOSITO DE ESTA PIEZA — ${proposito.titulo}:\n${proposito.detalle}\nEsto define QUE buscas lograr y con que evidencia. La FORMA de escribirlo la da la ESTRUCTURA de abajo, no este bloque.` : "",
```

- [ ] **Step 2: Enlaces internos y keyword en el prompt de blog**

En `desarrollar()`, cuando `esBlog`, agregar al `user`:

```js
ctx.enlaces?.length ? `ARTICULOS YA PUBLICADOS (enlazá 2 o 3 de forma contextual, con markdown [texto](url), solo donde venga a cuento; nunca una lista de "leé también"):\n${ctx.enlaces.map((a) => `- ${a.titulo}: ${a.url}`).join("\n")}` : "",
ctx.pilar ? `PAGINA PILAR DE ESTE TERRITORIO: ${ctx.pilar.url} (keyword: ${ctx.pilar.keyword}). Enlazala una vez, con texto de ancla natural.` : "",
idea.keyword_objetivo ? `KEYWORD OBJETIVO: "${idea.keyword_objetivo}". Tiene que aparecer en el title, en el H1 y respondida dentro de las primeras 100 palabras. No la fuerces: si queda antinatural, reformulá la frase alrededor.` : "",
```

- [ ] **Step 3: Armar el contexto en `watch.mjs`**

Reemplazar la llamada de `watch.mjs:69` por la forma con contexto, y traer enlaces y pilar:

```js
const cluster = idea.cluster ? await traerCluster(db, idea.cluster) : null;
const receta = await recetaParaIdea(db, previas, {
  estructura: idea.estructura,
  proposito: idea.proposito,
  funnel: idea.funnel ?? "mofu",
  cluster: idea.cluster,
  areas: cluster?.areas ?? [],
});
const enlaces = idea.fuente === "blog" ? await articulosPublicados(db, 8) : [];
const ctx = {
  insights, memoria: formatearMemoria(previas), receta, hooksPrevios, enlaces,
  pilar: cluster ? { keyword: cluster.keyword_pilar, url: `https://www.vakdor.com${cluster.url_pilar}` } : null,
};
```

`articulosPublicados(db, limite)` (nueva, en `recursos.mjs`) lee `marketing_ideas` con `estado='publicada'` y `fuente='blog'`, y devuelve `{titulo, url}` sacando la url de `publicado_en->>'blogUrl'`, salteando las que no la tengan.

En `revisarYRegistrar`, sumar a `patch.receta`: `proposito: receta.proposito?.clave ?? null` y `cluster: idea.cluster ?? null`.

- [ ] **Step 4: Verificar el prompt sin gastar tokens**

Correr `node test-content.mjs`, que arma los prompts sin llamar a la API.
Expected: el prompt de una idea de blog con cluster incluye el bloque de propósito, los enlaces y la keyword; el de una idea sin cluster no incluye el bloque de pilar y no dice `undefined` en ningún lado.

- [ ] **Step 5: Correr los tests del worker**

Run: `node --test revision.test.mjs similitud.test.mjs insights.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit (snapshots)**

```bash
cp "../../../../Prisma - MK/marketing-worker/content.mjs" docs/interno/worker-snapshots/content.mjs
cp "../../../../Prisma - MK/marketing-worker/watch.mjs" docs/interno/worker-snapshots/watch.mjs
git add docs/interno/worker-snapshots/
git commit -m "feat(marketing): proposito, keyword objetivo y enlaces internos en el worker"
```

---

### Task 9: Criterio de revisión extra, solo para blog

**Files:**
- Modify (worker, sin git): `revision.mjs`, `revision.test.mjs`

**Interfaces:**
- Consumes: la rúbrica que ya existe.
- Produces: `revisar(llamar, texto, etapa, hooksPrevios, comentario, opciones)` donde `opciones = { keyword?: string | null }`.

- [ ] **Step 1: Escribir el test que falla**

```js
test("con keyword la rubrica suma el criterio de respuesta temprana", () => {
  const prompt = promptRevision("texto", "mofu", [], { keyword: "leads inmobiliarios" });
  assert.match(prompt, /leads inmobiliarios/);
  assert.match(prompt, /primeras 100 palabras/);
});

test("sin keyword la rubrica queda igual que hoy (7 criterios)", () => {
  const prompt = promptRevision("texto", "mofu", []);
  assert.doesNotMatch(prompt, /primeras 100 palabras/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test revision.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`promptRevision` acepta `{ keyword }` y, solo si viene, agrega el criterio 8: *"La keyword objetivo «X» aparece en el primer párrafo y la pregunta que implica queda respondida dentro de las primeras 100 palabras."* En `watch.mjs`, pasar la keyword **solo** cuando `idea.fuente === "blog"`; las piezas de LinkedIn siguen con los 7 criterios de siempre, para no subir los reintentos (que son llamadas pagas) en el formato que más se publica.

- [ ] **Step 4: Correr los tests**

Run: `node --test revision.test.mjs`
Expected: PASS, incluidos los tests preexistentes de la rúbrica.

- [ ] **Step 5: Commit (snapshot)**

```bash
cp "../../../../Prisma - MK/marketing-worker/revision.mjs" docs/interno/worker-snapshots/revision.mjs
git add docs/interno/worker-snapshots/revision.mjs
git commit -m "feat(marketing): criterio de keyword temprana en la revision de articulos"
```

---

### Task 10: Panel — badges, selectores, filtro y oportunidades SEO

**Files:**
- Modify: `components/admin-vakdor/marketing-client.tsx`
- Modify: `components/admin-vakdor/marketing-metrics-section.tsx`

**Interfaces:**
- Consumes: `MarketingIdea` con los campos nuevos (Task 7), `gscOportunidades` del payload (Task 6).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Badges de cluster y propósito**

Junto al badge de embudo que ya existe en la tarjeta y en el visor. **Tienen que tolerar `null`**: las ideas viejas no tienen cluster ni propósito y no pueden romper el tablero. Si el campo es `null`, no se renderiza el badge (no se muestra "sin cluster").

- [ ] **Step 2: Selectores en "Nueva idea"**

Dos `<select>` más, cluster y propósito, ambos con opción vacía por defecto. Las opciones salen de un endpoint nuevo `GET /api/admin-vakdor/marketing/ejes` que devuelve `{ clusters: [{clave,titulo}], propositos: [{clave,titulo}] }` leyendo de la base, para que agregar un cluster por SQL aparezca en el selector sin desplegar.

- [ ] **Step 3: Filtro por cluster en el calendario**

Junto a los de fuente, formato, ángulo y embudo que ya existen, con el mismo patrón.

- [ ] **Step 4: Bloque "Oportunidades SEO · posición 4-20"**

En `marketing-metrics-section.tsx`, tabla con query, URL, posición e impresiones, ordenada por impresiones. Si `gscOportunidades` viene vacío, mostrar el estado de la fuente igual que hacen hoy Clarity y Buffer, **nunca** una tabla vacía sin explicación. Copy del encabezado: *"Búsquedas por las que ya aparecés sin estar arriba. Conviene mejorar estas páginas antes de escribir una nueva."*

- [ ] **Step 5: Verificar que compila y que la suite pasa**

Run: `npx next build && npm test`
Expected: build OK; los dos runners en verde.

- [ ] **Step 6: Commit**

```bash
git add components/admin-vakdor/ app/api/admin-vakdor/marketing/ejes/
git commit -m "feat(marketing): badges de cluster y proposito, filtro y bloque de oportunidades SEO"
```

---

### Task 11: Verificación end-to-end y navegador

**Files:**
- Create: `docs/superpowers/sdd/2026-08-14-marketing-motor-cruces-y-seo/verificacion.md`

**Interfaces:**
- Consumes: todas las tareas anteriores.
- Produces: el informe de verificación.

- [ ] **Step 1: Preparar el entorno del worktree**

El worktree no tiene `.env` ni `node_modules`. Copiar el `.env` desde la carpeta principal e instalar dependencias antes de levantar nada.

- [ ] **Step 2: Insertar 3 ideas de prueba**

Una por etapa del embudo, con clusters y propósitos distintos entre sí, en estado `en_proceso`. Marcarlas con un prefijo reconocible en el título para poder borrarlas después.

- [ ] **Step 3: Correr el worker hasta procesarlas**

Run: `node watch.mjs` en la carpeta del worker, hasta que las 3 queden en `en_revision`.

- [ ] **Step 4: Verificar el resultado contra la base**

```sql
select titulo, funnel, cluster, proposito,
       receta->>'estructura' as estructura,
       receta->'escenas' as escenas,
       receta->'revision'->>'aprobado' as aprobado
  from marketing_ideas
 where titulo like 'PRUEBA CRUCES%' order by created_at;
```

Expected, y cada punto se chequea explícitamente:
- Las 3 tienen `cluster`, `proposito` y `estructura` no nulos.
- Las 3 estructuras son **distintas** y cada una es compatible con el propósito de su pieza.
- Las 6 escenas son **distintas** entre las 3 piezas.
- La primera escena de cada pieza tiene el `momento` que corresponde a su etapa (`tofu`→`dolor`, `mofu`→`intento_fallido`, `bofu`→`resuelto`).
- El link `vakdor.com/demostracion` aparece **solo** en el primer comentario de la pieza BOFU, y en **ningún** cuerpo de post.
- Ninguna pieza contiene cifras, clientes ni casos con nombre inventados.

- [ ] **Step 5: Verificar en el navegador**

Entrar con las credenciales del `.env`, en escritorio y en celular con emulación de dispositivo (no achicando la ventana):
- El tablero muestra ideas viejas (sin cluster) y nuevas conviviendo, sin romperse.
- Los badges de cluster y propósito se ven en la tarjeta y en el visor.
- "Nueva idea" ofrece los 8 clusters y los 5 propósitos.
- El calendario filtra por cluster.
- El bloque de oportunidades SEO muestra datos reales o el estado de la fuente.

- [ ] **Step 6: Limpiar las pruebas y escribir el informe**

Borrar las 3 ideas de prueba. Escribir el informe con el resultado punto por punto del Step 4 y las capturas del Step 5.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/sdd/2026-08-14-marketing-motor-cruces-y-seo/
git commit -m "docs(marketing): verificacion end-to-end del motor de cruces"
```

---

## Pendientes que quedan anotados

- **`ANTHROPIC_API_KEY` en Vercel y EasyPanel** sigue sin confirmar (`marketing-handoff.md:76-79`). Sin ella en Vercel, "Reformular" falla en producción. No lo bloquea este plan pero conviene resolverlo.
- **Actualizar `docs/interno/marketing-handoff.md`** con los ejes nuevos y con cómo se agrega un cluster o una escena por SQL, antes del merge a `main`.
- **Fuera de alcance por decisión**, no por olvido: reescribir artículos publicados, backlinks/Digital PR, estudios con datos propios de PRISMA, escribir las 8 páginas pilar, renombrar eventos GA4.
