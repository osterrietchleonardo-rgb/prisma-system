# Marketing: voz humana, autoridad y sin repetición — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el generador de contenido del módulo Marketing escriba con voz humana, posición propia y storytelling, sin repetir lo ya publicado, y con el CTA correcto según la etapa del embudo.

**Architecture:** Se cambia el modelo a Claude Sonnet 5 en los dos motores (app y worker), se reemplaza la plantilla única por un canon de voz + 8 estructuras narrativas en rotación determinista, se agrega un banco de escenas del rubro en Supabase como materia prima, se le da al modelo el texto completo de las últimas 15 piezas como memoria anti-repetición, y se agrega un paso de revisión contra rúbrica. Toda la lógica pura (rotación, similitud, rúbrica) se aísla en módulos testeables; la I/O queda en envoltorios finos.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres) · `@anthropic-ai/sdk` (ya instalado en ambos proyectos) · vitest (app) · `node --test` (worker, Node 24) · Buffer GraphQL API.

**Spec:** `docs/superpowers/specs/2026-08-10-marketing-voz-humana-design.md`

## Global Constraints

- Rama de trabajo: `feat/marketing-voz-humana` (worktree `prisma-wt-marketing-voz`). Merge a `main` **solo con OK explícito de Leonardo**.
- Nunca `git add -A`. Commitear solo los archivos nombrados en cada tarea.
- Modelo: **`claude-sonnet-5`** exacto. Sin sufijo de fecha.
- `thinking: { type: "adaptive" }` explícito. **Prohibido** `budget_tokens`, `temperature`, `top_p`, `top_k` — devuelven 400 en Sonnet 5.
- `max_tokens` ≤ 8000 en todas las llamadas (por encima de ~16000 haría falta streaming).
- Al leer la respuesta hay que **filtrar los bloques por `type === "text"`**: Sonnet 5 devuelve también bloques `thinking`. Leer `content[0].text` a ciegas rompe.
- Reglas de formato del contenido generado, inquebrantables: segunda persona (vos/tenés), párrafos de 2-3 líneas, **cero emojis**, viñetas con `•`, **sin links en el cuerpo** (van al primer comentario).
- La fórmula **"X no es Y" NO se prohíbe nunca** — es la del post de mayor rendimiento histórico. No agregarla a la lista de muletillas bajo ninguna circunstancia.
- Las migraciones del repo **no se aplican solas**: se aplican por Management API con `SUPABASE_API_KEY_MANAGEMENT` del `.env`.
- Los archivos en `scratch/` están gitignoreados: los scripts de un solo uso van ahí y no se commitean.
- Dos proyectos separados en disco:
  - App: `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\prisma-wt-marketing-voz`
  - Worker: `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\marketing-worker` (repo aparte; los cambios del worker **no** entran en los commits de la app)

---

## File Structure

**App (`prisma-wt-marketing-voz`)**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260810120000_marketing_voz.sql` | Tabla `marketing_recursos` + semilla + columna `marketing_ideas.receta` |
| `lib/admin-vakdor/marketing/voz.ts` | Canon de voz, estructuras, tipos de comentario, muletillas, rúbrica, CTA por etapa. Sin I/O. |
| `lib/admin-vakdor/marketing/similitud.ts` | Normalización, trigramas y coeficiente de Dice. Sin I/O. |
| `lib/admin-vakdor/marketing/recursos.ts` | Selección determinista (pura) + lectura/marcado contra Supabase |
| `lib/admin-vakdor/marketing/claude.ts` | Cliente Anthropic: armado de params (puro) + llamada |
| `lib/admin-vakdor/marketing/brand-prompt.ts` | Paquete de marca destilado + CTA por etapa |
| `lib/admin-vakdor/marketing/store.ts` | `textosRecientes()`, `formatearMemoria()`, `guardarReceta()` |
| `lib/admin-vakdor/marketing/types.ts` | `Receta`, `Recurso`, `ClaveEstructura`, `ClaveComentario` |
| `app/api/admin-vakdor/marketing/generar/route.ts` | Generación de ideas con insights v2 |
| `app/api/admin-vakdor/marketing/[id]/reformular/route.ts` | Reformular con canon + rúbrica |

**Worker (`Prisma - MK/marketing-worker`)**

| Archivo | Responsabilidad |
|---|---|
| `voz.mjs` | Espejo del canon con fallback (mismo contenido que `voz.ts`) |
| `similitud.mjs` | Espejo de `similitud.ts` |
| `recursos.mjs` | Rotación contra la tabla |
| `revision.mjs` | Prompt de rúbrica, parseo del veredicto, chequeo de solapamiento |
| `content.mjs` | Los tres prompts de desarrollo (post, carrusel, lead magnet) |
| `insights.mjs` | Análisis diario v2 (clasificación + patrones) |
| `watch.mjs` | Orquestador: cliente Anthropic, receta, guardado |

> **Sobre la duplicación app/worker:** `voz` y `similitud` existen dos veces a propósito. Son repos separados que no pueden importarse entre sí, y publicar un paquete compartido es desproporcionado para ~80 líneas. La fuente de verdad del *contenido* (canon, estructuras, escenas) es la tabla `marketing_recursos`; el código duplicado es solo el fallback mínimo y la matemática de similitud, y ambos llevan la misma batería de tests.

---

## Task 1: Migración y semilla del banco de recursos

**Files:**
- Create: `supabase/migrations/20260810120000_marketing_voz.sql`
- Create (no se commitea): `scratch/aplicar-migracion-voz.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `marketing_recursos(id uuid, tipo text, clave text, titulo text, detalle text, tags text[], activo bool, usos int, ultimo_uso timestamptz, created_at timestamptz)` y columna `marketing_ideas.receta jsonb`. Claves de estructura: `confesion`, `concesion_vuelta`, `escena_campo`, `contraste`, `autopsia`, `mito_realidad`, `carta_director`, `numero_duele`. Claves de comentario: `dato_crudo`, `opinion_filosa`, `matiz`, `micro_caso`, `pregunta_binaria`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260810120000_marketing_voz.sql`:

```sql
-- Banco de recursos de voz para el motor de contenido de Marketing.
create table if not exists marketing_recursos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('canon','estructura','escena','comentario')),
  clave        text,
  titulo       text not null,
  detalle      text not null,
  tags         text[] not null default '{}',
  activo       boolean not null default true,
  usos         integer not null default 0,
  ultimo_uso   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists marketing_recursos_tipo_activo_idx
  on marketing_recursos (tipo, activo);

alter table marketing_recursos enable row level security;
-- Sin políticas públicas: solo service_role (mismo criterio que marketing_ideas).

alter table marketing_ideas add column if not exists receta jsonb;
```

- [ ] **Step 2: Agregar la semilla del canon y las 8 estructuras**

Agregar al final del mismo archivo:

```sql
insert into marketing_recursos (tipo, clave, titulo, detalle) values
('canon','v1','Canon de voz de Vakdor',
$$Escribís como alguien que está adentro del rubro inmobiliario, no como un consultor que lo mira de afuera.

1. ESCENA PRIMERO. Abrí con una situación concreta y reconocible, nunca con una tesis abstracta. Mal: "La falta de sistematización erosiona la rentabilidad". Bien: "Te escribe por un tres ambientes y le mandás un menú genérico".
2. TOMÁ POSICIÓN. Afirmá algo que alguien podría discutir. Si nadie puede estar en desacuerdo con lo que escribiste, no dijiste nada.
3. GIRO DE CONCESIÓN. Concedele la razón al lector y ahí dala vuelta. "Y tienen razón. El software no te enseña a vender. Lo que hace es que el pibe nuevo de enfrente te robe tres ventas."
4. VIVENCIA DE CAMPO SIN INVENTAR DATOS. Podés escribir "hablo con directores que me dicen...", "lo veo todas las semanas". NUNCA inventes cifras, clientes, casos con nombre ni resultados atribuidos.
5. DETALLE ESPECÍFICO. Al menos dos anclas concretas por pieza: una hora, un día de la semana, un plazo, un tipo de propiedad, una cantidad. "Un sábado a la noche", "en dos minutos", "hace seis meses", "un tres ambientes".
6. CERRÁ EN LA CONSECUENCIA, no en un pedido. Que la última línea deje al lector con el costo de no hacer nada, no con un favor pedido.

Español rioplatense natural y hablado: "el pibe nuevo", "cortar la venta en seco", "te lo confirmo y te aviso". Sin solemnidad y sin jerga de consultora.$$);

insert into marketing_recursos (tipo, clave, titulo, detalle) values
('estructura','confesion','Confesión',
 'Contás un error o una creencia propia que resultó equivocada, y qué la corrigió. Arranca reconociendo algo que hacías mal. La autoridad viene de admitir, no de saber.'),
('estructura','concesion_vuelta','Concesión y vuelta',
 'Tomás la objeción más fuerte del lector, le decís que tiene razón, y mostrás que por eso mismo el problema real es otro. El giro tiene que llegar en el tercio inicial.'),
('estructura','escena_campo','Escena de campo',
 'Narrás una situación observada como si el lector estuviera ahí: qué pasó, en qué orden, qué se dijo. Recién al final nombrás lo que la escena demuestra.'),
('estructura','contraste','Contraste de dos perfiles',
 'Enfrentás dos personas o dos formas de trabajar (el de treinta años vs. el que empezó hace seis meses). No hay bueno y malo: cada uno gana en un terreno distinto.'),
('estructura','autopsia','Autopsia de un caso',
 'Desarmás paso por paso algo que salió mal, en orden cronológico, marcando en qué momento exacto se perdió. Terminás en el punto donde todavía se podía evitar.'),
('estructura','mito_realidad','Mito contra realidad',
 'Enunciás lo que se repite en el rubro y lo confrontás con lo que pasa cuando mirás los números. Un solo mito por pieza, desarrollado a fondo.'),
('estructura','carta_director','Carta al director',
 'Le hablás directo a una persona concreta, en segunda persona, como si le estuvieras escribiendo solo a él. Íntimo y directo, sin audiencia de por medio.'),
('estructura','numero_duele','El número que duele',
 'Arrancás con un número del negocio y desplegás todo lo que ese número implica hacia atrás. El número tiene que ser verificable o presentado como estimación honesta.');
```

- [ ] **Step 3: Agregar la semilla de los 5 tipos de primer comentario**

```sql
insert into marketing_recursos (tipo, clave, titulo, detalle) values
('comentario','dato_crudo','Dato crudo con contexto',
 'Un número real con el contexto que lo hace doler. Nada de pedir nada. Dos o tres líneas.'),
('comentario','opinion_filosa','Opinión más filosa que el post',
 'Una postura más dura que la del post, que el post no se animó a decir. Controversia acotada al negocio, nunca agravio a personas.'),
('comentario','matiz','El matiz que nadie dice',
 'La excepción honesta: "esto no aplica si...". Es el que más autoridad da, porque demuestra que conocés los bordes del problema.'),
('comentario','micro_caso','Micro-caso en tres líneas',
 'La escena contada en tres líneas, sin moraleja ni cierre. Que el lector saque la conclusión.'),
('comentario','pregunta_binaria','Pregunta binaria concreta',
 'Una pregunta de dos opciones específicas del negocio. Prohibido "¿y vos qué opinás?" y cualquier variante genérica.');
```

- [ ] **Step 4: Agregar la semilla de las 30 escenas del rubro**

```sql
insert into marketing_recursos (tipo, titulo, detalle) values
('escena','Menú automático a una consulta concreta','Preguntan por un tres ambientes en una zona puntual y el bot contesta con un menú de opciones genérico.'),
('escena','El lead del sábado a la noche','Entra una consulta de portal un sábado 22:40 y se contesta el lunes a las 10:15.'),
('escena','La cartera se va en el celular','Un asesor renuncia y con él se van los chats, los teléfonos y el historial de cada cliente.'),
('escena','El Excel paralelo','Cada asesor lleva su propia planilla porque el CRM "le queda incómodo", y nadie ve lo mismo.'),
('escena','El pasillo como sistema de reporte','El director se entera de que se cayó una operación por un comentario al pasar, no por el sistema.'),
('escena','El "te confirmo y te aviso"','Se le promete al cliente confirmar un dato y nadie vuelve nunca a ese chat.'),
('escena','La reunión de los lunes','Dos horas para que cada asesor cuente de memoria cómo viene, sin un solo dato duro sobre la mesa.'),
('escena','El mismo lead llamado dos veces','Dos asesores llaman al mismo cliente el mismo día porque entró por dos portales distintos.'),
('escena','La propiedad reservada que sigue publicada','Se reservó hace tres semanas y sigue online recibiendo consultas que alguien tiene que contestar.'),
('escena','Las expensas que nadie confirma','El cliente pregunta las expensas y la respuesta tarda dos días, o llega y está mal.'),
('escena','La visita que nadie confirmó','Se agenda una visita, nadie la confirma, el asesor viaja cuarenta minutos y el cliente no aparece.'),
('escena','El WhatsApp personal del asesor','Toda la relación con el cliente vive en un número de teléfono que la agencia no controla.'),
('escena','El lead frío que era el mejor','Un contacto de hace cuatro meses compra con otra agencia porque nadie le hizo seguimiento.'),
('escena','El informe armado a mano','Alguien pasa el viernes entero copiando números a una planilla para la reunión del lunes.'),
('escena','Dos asesores hacen el 70%','La mayoría de las operaciones las cierran dos personas y nadie sabe qué hacen distinto del resto.'),
('escena','La tasación por corazonada','Se define el precio con "yo conozco la zona" y la propiedad queda ocho meses publicada.'),
('escena','El propietario que llama a preguntar','El dueño llama para saber si hubo movimiento y nadie tiene la respuesta a mano.'),
('escena','El horario que no existe','Las consultas llegan de noche y los fines de semana; la agencia atiende de nueve a seis.'),
('escena','Los 47 chats sin leer','Lunes a la mañana: la bandeja tiene cuarenta y siete conversaciones sin abrir del fin de semana.'),
('escena','La búsqueda que nadie cruzó','Entra un comprador con el presupuesto exacto de una propiedad de la cartera y nadie los cruza.'),
('escena','El seguimiento que depende de la memoria','El recontacto ocurre solamente si el asesor se acuerda ese día.'),
('escena','El CRM cargado a medias','Los campos que de verdad importan están vacíos, porque cargarlos lleva tiempo y nadie los mira.'),
('escena','La competencia contesta en dos minutos','La inmobiliaria de enfrente responde al toque y se lleva la visita del sábado.'),
('escena','El presupuesto que nunca se pregunta','Se muestran cinco propiedades antes de saber cuánto puede pagar el cliente.'),
('escena','El "mandame info" que muere','Se manda la ficha en PDF y la conversación termina ahí, sin una sola pregunta de vuelta.'),
('escena','El asesor nuevo sin proceso','Entra alguien, aprende mirando, y a los tres meses hace las cosas distinto que todos los demás.'),
('escena','La operación que se cayó en silencio','Nadie registró por qué se perdió, así que el mes que viene se pierde igual por lo mismo.'),
('escena','El teléfono mal cargado','Un dígito de más al anotar y el lead queda inalcanzable para siempre.'),
('escena','La campaña que entra y se desborda','Se invierte en pauta, entran sesenta consultas y se contestan veintidós.'),
('escena','El cliente que ya contó todo','Repite su búsqueda por tercera vez porque cada vez lo atiende una persona distinta.');
```

- [ ] **Step 5: Escribir el script que aplica la migración**

Crear `scratch/aplicar-migracion-voz.mjs` (no se commitea):

```js
// Aplica la migración por Management API. Las migraciones del repo no se aplican solas.
import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
const val = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1] || "").trim().replace(/^["']|["']$/g, "");

const token = val("SUPABASE_API_KEY_MANAGEMENT");
const ref = val("NEXT_PUBLIC_SUPABASE_URL").replace("https://", "").split(".")[0];
const sql = fs.readFileSync("supabase/migrations/20260810120000_marketing_voz.sql", "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
if (!res.ok) { console.error("FALLÓ:", res.status, body.slice(0, 500)); process.exit(1); }
console.log("OK — migración aplicada.");
```

- [ ] **Step 6: Aplicar la migración**

```bash
node scratch/aplicar-migracion-voz.mjs
```

Esperado: `OK — migración aplicada.`

- [ ] **Step 7: Verificar la semilla con una consulta**

Crear `scratch/verificar-recursos.mjs`:

```js
import fs from "node:fs";
const env = fs.readFileSync(".env", "utf8");
const val = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1] || "").trim().replace(/^["']|["']$/g, "");
const token = val("SUPABASE_API_KEY_MANAGEMENT");
const ref = val("NEXT_PUBLIC_SUPABASE_URL").replace("https://", "").split(".")[0];

const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return r.json();
};
console.log(await q("select tipo, count(*)::int as n from marketing_recursos group by tipo order by tipo"));
console.log(await q("select column_name from information_schema.columns where table_name='marketing_ideas' and column_name='receta'"));
```

Correr:

```bash
node scratch/verificar-recursos.mjs
```

Esperado exactamente: `canon: 1`, `comentario: 5`, `escena: 30`, `estructura: 8`, y la columna `receta` presente.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260810120000_marketing_voz.sql
git commit -m "feat(marketing): tabla marketing_recursos + semilla de voz y columna receta"
```

---

## Task 2: Módulo de voz (app)

**Files:**
- Create: `lib/admin-vakdor/marketing/voz.ts`
- Test: `lib/admin-vakdor/marketing/voz.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export type EtapaEmbudo = "tofu" | "mofu" | "bofu"
  export type ClaveEstructura = "confesion" | "concesion_vuelta" | "escena_campo" | "contraste" | "autopsia" | "mito_realidad" | "carta_director" | "numero_duele"
  export type ClaveComentario = "dato_crudo" | "opinion_filosa" | "matiz" | "micro_caso" | "pregunta_binaria"
  export const CANON_FALLBACK: string
  export const CLAVES_ESTRUCTURA: readonly ClaveEstructura[]
  export const CLAVES_COMENTARIO: readonly ClaveComentario[]
  export const MULETILLAS: readonly string[]
  export function detectarMuletillas(texto: string): string[]
  export function instruccionCta(etapa: EtapaEmbudo): string
  export function instruccionComentario(clave: ClaveComentario, etapa: EtapaEmbudo): string
  export const RUBRICA: readonly string[]
  export function promptRevision(texto: string, etapa: EtapaEmbudo, hooksPrevios: string[]): string
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/admin-vakdor/marketing/voz.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  CLAVES_ESTRUCTURA, CLAVES_COMENTARIO, MULETILLAS,
  detectarMuletillas, instruccionCta, instruccionComentario, promptRevision, RUBRICA,
} from "./voz"

describe("catálogos", () => {
  it("tiene 8 estructuras y 5 tipos de comentario, sin repetidos", () => {
    expect(CLAVES_ESTRUCTURA).toHaveLength(8)
    expect(new Set(CLAVES_ESTRUCTURA).size).toBe(8)
    expect(CLAVES_COMENTARIO).toHaveLength(5)
    expect(new Set(CLAVES_COMENTARIO).size).toBe(5)
  })
})

describe("muletillas", () => {
  it("detecta una muletilla sin importar mayúsculas ni tildes", () => {
    expect(detectarMuletillas("Hoy mas que nunca hay que actuar")).toContain("hoy más que nunca")
  })

  it("no marca un texto limpio", () => {
    expect(detectarMuletillas("Te escribe por un tres ambientes y le mandás un menú.")).toEqual([])
  })

  // Es la fórmula del post de mayor rendimiento histórico. Nunca se prohíbe.
  it("NO prohíbe la fórmula 'X no es Y'", () => {
    expect(detectarMuletillas("Automatizar no es poner un bot.")).toEqual([])
    expect(MULETILLAS.some((m) => /no es/.test(m))).toBe(false)
  })
})

describe("CTA por etapa", () => {
  it("TOFU no nombra el producto ni manda a la demostración", () => {
    const t = instruccionCta("tofu")
    expect(t).not.toMatch(/vakdor\.com\/demostracion/)
    expect(t).toMatch(/no nombres el producto/i)
  })

  it("MOFU explica el mecanismo y tampoco lleva link", () => {
    expect(instruccionCta("mofu")).not.toMatch(/vakdor\.com\/demostracion/)
    expect(instruccionCta("mofu")).toMatch(/P-R-I-S-M-A/)
  })

  it("BOFU manda al video y aclara que el link va en el primer comentario", () => {
    const t = instruccionCta("bofu")
    expect(t).toMatch(/vakdor\.com\/demostracion/)
    expect(t).toMatch(/primer comentario/i)
    expect(t).toMatch(/nunca en el cuerpo/i)
  })
})

describe("primer comentario", () => {
  it("en TOFU y MOFU prohíbe el link", () => {
    expect(instruccionComentario("matiz", "tofu")).toMatch(/sin links/i)
    expect(instruccionComentario("dato_crudo", "mofu")).toMatch(/sin links/i)
  })

  it("en BOFU pide el link al final", () => {
    expect(instruccionComentario("micro_caso", "bofu")).toMatch(/vakdor\.com\/demostracion/)
  })

  it("la pregunta binaria prohíbe explícitamente el '¿y vos qué opinás?'", () => {
    expect(instruccionComentario("pregunta_binaria", "tofu")).toMatch(/qué opinás/i)
  })
})

describe("rúbrica", () => {
  it("tiene los 7 criterios y el prompt incluye el texto y los hooks previos", () => {
    expect(RUBRICA).toHaveLength(7)
    const p = promptRevision("TEXTO DE LA PIEZA", "bofu", ["hook viejo uno"])
    expect(p).toContain("TEXTO DE LA PIEZA")
    expect(p).toContain("hook viejo uno")
    expect(p).toMatch(/"aprobado"/)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/admin-vakdor/marketing/voz.test.ts
```

Esperado: FAIL — `Failed to resolve import "./voz"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/admin-vakdor/marketing/voz.ts`:

```ts
/**
 * Canon de voz del motor de contenido. La fuente de verdad del CONTENIDO
 * (canon, estructuras, escenas) es la tabla `marketing_recursos`; acá vive
 * el fallback mínimo y toda la lógica pura que no depende de la base.
 */

export type EtapaEmbudo = "tofu" | "mofu" | "bofu"

export type ClaveEstructura =
  | "confesion" | "concesion_vuelta" | "escena_campo" | "contraste"
  | "autopsia" | "mito_realidad" | "carta_director" | "numero_duele"

export type ClaveComentario =
  | "dato_crudo" | "opinion_filosa" | "matiz" | "micro_caso" | "pregunta_binaria"

export const CLAVES_ESTRUCTURA: readonly ClaveEstructura[] = [
  "confesion", "concesion_vuelta", "escena_campo", "contraste",
  "autopsia", "mito_realidad", "carta_director", "numero_duele",
] as const

export const CLAVES_COMENTARIO: readonly ClaveComentario[] = [
  "dato_crudo", "opinion_filosa", "matiz", "micro_caso", "pregunta_binaria",
] as const

/** Se usa solo si la tabla marketing_recursos está vacía o no responde. */
export const CANON_FALLBACK = `Escribís como alguien que está adentro del rubro inmobiliario.
1. Abrí con una escena concreta, nunca con una tesis abstracta.
2. Tomá posición: afirmá algo que alguien podría discutir.
3. Concedele la razón al lector y ahí dala vuelta.
4. Podés hablar desde el campo ("hablo con directores que me dicen..."), pero NUNCA inventes cifras ni casos con nombre.
5. Meté al menos dos detalles específicos: una hora, un día, un plazo, un tipo de propiedad.
6. Cerrá en la consecuencia, no en un pedido.
Español rioplatense natural. Segunda persona. Cero emojis. Viñetas con •.`

/**
 * Muletillas de IA. OJO: la fórmula "X no es Y" NO está y no debe agregarse
 * nunca — es la del post de mayor rendimiento histórico de Vakdor
 * ("Automatizar no es poner un bot", 3.280 impresiones).
 */
export const MULETILLAS: readonly string[] = [
  "en un mundo donde", "hoy más que nunca", "la realidad es que",
  "el secreto está en", "imaginá por un momento",
  "y acá está la clave", "spoiler", "déjame decirte", "aprovechar al máximo",
  "revolucionar", "potenciar", "sinergia", "qué opinás",
] as const

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function detectarMuletillas(texto: string): string[] {
  const plano = normalizar(texto)
  return MULETILLAS.filter((m) => plano.includes(normalizar(m)))
}

export function instruccionCta(etapa: EtapaEmbudo): string {
  switch (etapa) {
    case "tofu":
      return `CIERRE (TOFU · descubrimiento): el objetivo es que tome conciencia del problema.
No nombres el producto ni la empresa. No pidas reunión, no mandes a ningún lado.
Cerrá en la consecuencia de no hacer nada, o en una pregunta que lo deje pensando.
Sin links, ni en el cuerpo ni en el comentario.`
    case "mofu":
      return `CIERRE (MOFU · nutrición): el objetivo es que entienda el MECANISMO.
Explicá cómo se resuelve y por qué ese enfoque: sistematizar el conocimiento y los procesos (Método P-R-I-S-M-A).
Podés nombrar PRISMA como el camino, sin cierre agresivo y sin pedir reunión.
Sin links, ni en el cuerpo ni en el comentario.`
    case "bofu":
      return `CIERRE (BOFU · decisión): el objetivo es que vea la demostración.
Cerrá contando QUÉ va a ver en el video y QUÉ duda le resuelve, con una línea del estilo "lo mostré entero en el video de la demostración".
El link https://vakdor.com/demostracion va SOLO en el primer comentario, nunca en el cuerpo del post (LinkedIn baja el alcance de los posts con link externo).
Urgencia sin ruego: no supliques la visita.`
  }
}

export function instruccionComentario(clave: ClaveComentario, etapa: EtapaEmbudo): string {
  const cuerpos: Record<ClaveComentario, string> = {
    dato_crudo: "Un número real del negocio con el contexto que lo hace doler. No pidas nada. Dos o tres líneas.",
    opinion_filosa: "Una postura más dura que la del post, que el post no se animó a decir. Controversia sobre el negocio, nunca agravio a personas.",
    matiz: 'La excepción honesta: "esto no aplica si...". Demostrá que conocés los bordes del problema.',
    micro_caso: "La escena contada en tres líneas, sin moraleja ni cierre. Que el lector saque la conclusión.",
    pregunta_binaria: 'Una pregunta de dos opciones concretas del negocio. PROHIBIDO "¿y vos qué opinás?" y cualquier variante genérica.',
  }
  const link = etapa === "bofu"
    ? "Al final, en una línea aparte, el link: https://vakdor.com/demostracion"
    : "Sin links."
  return `PRIMER COMENTARIO (tipo: ${clave}). ${cuerpos[clave]} ${link}`
}

export const RUBRICA: readonly string[] = [
  "La primera línea es una escena o situación concreta, no una tesis abstracta.",
  "Hay una posición: se afirma algo que alguien podría discutir.",
  "Hay un giro (concesión y vuelta, o expectativa rota).",
  "Hay al menos dos detalles específicos (una hora, un día, un número, un tipo de propiedad, un plazo).",
  "No repite la apertura ni el argumento central de las piezas anteriores.",
  "El CTA corresponde a la etapa del embudo y el link está donde corresponde.",
  "No usa muletillas de IA.",
] as const

export function promptRevision(texto: string, etapa: EtapaEmbudo, hooksPrevios: string[]): string {
  return [
    `Sos el editor. Evaluá esta pieza (etapa del embudo: ${etapa.toUpperCase()}) contra la rúbrica.`,
    `RÚBRICA:\n${RUBRICA.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
    hooksPrevios.length ? `APERTURAS YA USADAS (no puede parecerse a ninguna):\n${hooksPrevios.map((h) => `- ${h}`).join("\n")}` : "",
    `PIEZA:\n"""\n${texto}\n"""`,
    `Devolvé SOLO JSON: {"aprobado": true|false, "fallos": ["<nro de criterio>: <qué falla y en qué línea>"]}`,
    `Sé estricto con el criterio 1: si la primera línea es una generalidad, no aprueba.`,
  ].filter(Boolean).join("\n\n")
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run lib/admin-vakdor/marketing/voz.test.ts
```

Esperado: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-vakdor/marketing/voz.ts lib/admin-vakdor/marketing/voz.test.ts
git commit -m "feat(marketing): canon de voz, CTA por etapa y rubrica de revision"
```

---

## Task 3: Detección de repetición por similitud

**Files:**
- Create: `lib/admin-vakdor/marketing/similitud.ts`
- Test: `lib/admin-vakdor/marketing/similitud.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export function normalizar(texto: string): string
  export function trigramas(texto: string): Set<string>
  export function similitud(a: string, b: string): number  // coeficiente de Dice, 0..1
  export function hookRepetido(hook: string, previos: string[], umbral?: number):
    { repetido: boolean; contra: string | null; valor: number }
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/admin-vakdor/marketing/similitud.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { normalizar, similitud, hookRepetido } from "./similitud"

describe("normalizar", () => {
  it("baja a minúsculas, saca tildes y puntuación", () => {
    expect(normalizar("¿Tenés QUÉ, dónde?")).toBe("tenes que donde")
  })
})

describe("similitud", () => {
  it("un texto contra sí mismo da 1", () => {
    const t = "el lead entro un sabado a la noche y nadie contesto"
    expect(similitud(t, t)).toBe(1)
  })

  it("dos textos sin relación dan menos de 0,2", () => {
    const a = "tu equipo te interrumpe quince veces al dia por cosas que ya estan resueltas"
    const b = "la tasacion por corazonada deja la propiedad ocho meses publicada"
    expect(similitud(a, b)).toBeLessThan(0.2)
  })

  it("dos aperturas casi iguales (con tildes y mayúsculas distintas) superan 0,45", () => {
    const a = "El lead entró un sábado a la noche y nadie contestó hasta el lunes"
    const b = "el lead entro un sabado a la noche y NADIE contesto hasta el lunes"
    expect(similitud(a, b)).toBeGreaterThan(0.45)
  })

  it("es simétrica", () => {
    const a = "dos asesores llamaron al mismo cliente el mismo dia"
    const b = "dos asesores llamaron al mismo cliente ese dia por dos portales"
    expect(similitud(a, b)).toBeCloseTo(similitud(b, a), 10)
  })

  it("un texto vacío da 0 y no rompe", () => {
    expect(similitud("", "hola que tal como va")).toBe(0)
  })
})

describe("hookRepetido", () => {
  it("marca el repetido y dice contra cuál", () => {
    const previos = ["Tu equipo te interrumpe quince veces al dia", "El lead entro un sabado a la noche"]
    const r = hookRepetido("El lead entró un sábado a la noche", previos)
    expect(r.repetido).toBe(true)
    expect(r.contra).toBe("El lead entro un sabado a la noche")
  })

  it("no marca uno nuevo", () => {
    const previos = ["Tu equipo te interrumpe quince veces al dia"]
    expect(hookRepetido("La tasacion por corazonada te deja ocho meses publicado", previos).repetido).toBe(false)
  })

  it("sin previos nunca marca repetición", () => {
    expect(hookRepetido("cualquier cosa", []).repetido).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/admin-vakdor/marketing/similitud.test.ts
```

Esperado: FAIL — `Failed to resolve import "./similitud"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/admin-vakdor/marketing/similitud.ts`:

```ts
/**
 * Detección de aperturas repetidas por coeficiente de Dice sobre trigramas
 * de palabras. Sin costo de API: es la primera barrera contra el "ya dijiste esto".
 */

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function trigramas(texto: string): Set<string> {
  const palabras = normalizar(texto).split(" ").filter(Boolean)
  const out = new Set<string>()
  if (palabras.length < 3) {
    if (palabras.length) out.add(palabras.join(" "))
    return out
  }
  for (let i = 0; i <= palabras.length - 3; i++) out.add(palabras.slice(i, i + 3).join(" "))
  return out
}

/** Coeficiente de Dice: 2·|A∩B| / (|A|+|B|). 0 = nada en común, 1 = idénticos. */
export function similitud(a: string, b: string): number {
  const A = trigramas(a)
  const B = trigramas(b)
  if (A.size === 0 || B.size === 0) return 0
  let comunes = 0
  for (const t of A) if (B.has(t)) comunes++
  return (2 * comunes) / (A.size + B.size)
}

export function hookRepetido(
  hook: string,
  previos: string[],
  umbral = 0.45,
): { repetido: boolean; contra: string | null; valor: number } {
  let mejor = { contra: null as string | null, valor: 0 }
  for (const p of previos) {
    const v = similitud(hook, p)
    if (v > mejor.valor) mejor = { contra: p, valor: v }
  }
  return { repetido: mejor.valor >= umbral, contra: mejor.valor >= umbral ? mejor.contra : null, valor: mejor.valor }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run lib/admin-vakdor/marketing/similitud.test.ts
```

Esperado: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-vakdor/marketing/similitud.ts lib/admin-vakdor/marketing/similitud.test.ts
git commit -m "feat(marketing): deteccion de aperturas repetidas por coeficiente de Dice"
```

---

## Task 4: Rotación determinista del banco de recursos

**Files:**
- Create: `lib/admin-vakdor/marketing/recursos.ts`
- Test: `lib/admin-vakdor/marketing/recursos.test.ts`
- Modify: `lib/admin-vakdor/marketing/types.ts` (agregar tipos al final)

**Interfaces:**
- Consumes: `ClaveEstructura`, `ClaveComentario` de `./voz` (Task 2).
- Produces:
  ```ts
  export type TipoRecurso = "canon" | "estructura" | "escena" | "comentario"
  export interface Recurso {
    id: string; tipo: TipoRecurso; clave: string | null
    titulo: string; detalle: string; usos: number; ultimo_uso: string | null
  }
  export function elegirRecursos(candidatos: Recurso[], cantidad: number, excluirIds: string[]): Recurso[]
  export async function traerRecursos(tipo: TipoRecurso): Promise<Recurso[]>
  export async function marcarUsados(ids: string[]): Promise<void>
  export async function canonDeVoz(): Promise<string>
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/admin-vakdor/marketing/recursos.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { elegirRecursos, type Recurso } from "./recursos"

const r = (id: string, usos: number, ultimo_uso: string | null): Recurso => ({
  id, tipo: "escena", clave: null, titulo: `t-${id}`, detalle: `d-${id}`, usos, ultimo_uso,
})

describe("elegirRecursos", () => {
  it("prioriza el menos usado", () => {
    const out = elegirRecursos([r("a", 5, null), r("b", 1, null), r("c", 3, null)], 1, [])
    expect(out.map((x) => x.id)).toEqual(["b"])
  })

  it("a igual cantidad de usos, prioriza el que hace más tiempo no se usa (nulls primero)", () => {
    const out = elegirRecursos(
      [r("a", 2, "2026-08-09T00:00:00Z"), r("b", 2, null), r("c", 2, "2026-01-01T00:00:00Z")], 3, [])
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"])
  })

  it("excluye los ids pedidos", () => {
    const out = elegirRecursos([r("a", 0, null), r("b", 1, null)], 2, ["a"])
    expect(out.map((x) => x.id)).toEqual(["b"])
  })

  it("si al excluir no queda ninguno, recicla el menos usado en vez de devolver vacío", () => {
    const out = elegirRecursos([r("a", 7, null), r("b", 2, null)], 1, ["a", "b"])
    expect(out.map((x) => x.id)).toEqual(["b"])
  })

  it("devuelve como mucho la cantidad pedida", () => {
    expect(elegirRecursos([r("a", 0, null), r("b", 0, null), r("c", 0, null)], 2, [])).toHaveLength(2)
  })

  it("con la lista vacía devuelve vacío y no rompe", () => {
    expect(elegirRecursos([], 2, [])).toEqual([])
  })

  it("es determinista: dos llamadas iguales dan el mismo resultado", () => {
    const lista = [r("a", 1, null), r("b", 1, "2026-05-01T00:00:00Z"), r("c", 0, null)]
    expect(elegirRecursos(lista, 2, []).map((x) => x.id)).toEqual(elegirRecursos(lista, 2, []).map((x) => x.id))
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/admin-vakdor/marketing/recursos.test.ts
```

Esperado: FAIL — `Failed to resolve import "./recursos"`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/admin-vakdor/marketing/recursos.ts`:

```ts
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { CANON_FALLBACK } from "./voz"

export type TipoRecurso = "canon" | "estructura" | "escena" | "comentario"

export interface Recurso {
  id: string
  tipo: TipoRecurso
  clave: string | null
  titulo: string
  detalle: string
  usos: number
  ultimo_uso: string | null
}

/** Orden determinista: menos usados primero; a igual uso, el que hace más tiempo no se usa. */
function ordenar(a: Recurso, b: Recurso): number {
  if (a.usos !== b.usos) return a.usos - b.usos
  const ta = a.ultimo_uso ? Date.parse(a.ultimo_uso) : 0
  const tb = b.ultimo_uso ? Date.parse(b.ultimo_uso) : 0
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

/**
 * Elige `cantidad` recursos evitando los de `excluirIds`. Si al excluir no queda
 * ninguno, recicla los menos usados: nunca bloquea la generación de una pieza.
 */
export function elegirRecursos(candidatos: Recurso[], cantidad: number, excluirIds: string[]): Recurso[] {
  if (candidatos.length === 0) return []
  const excluir = new Set(excluirIds)
  const frescos = candidatos.filter((c) => !excluir.has(c.id))
  const pool = frescos.length > 0 ? frescos : candidatos
  return [...pool].sort(ordenar).slice(0, cantidad)
}

export async function traerRecursos(tipo: TipoRecurso): Promise<Recurso[]> {
  const { data, error } = await getAdminDb()
    .from("marketing_recursos")
    .select("id, tipo, clave, titulo, detalle, usos, ultimo_uso")
    .eq("tipo", tipo)
    .eq("activo", true)
  if (error) throw new Error(`traerRecursos(${tipo}): ${error.message}`)
  return (data ?? []) as Recurso[]
}

export async function marcarUsados(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = getAdminDb()
  const { data } = await db.from("marketing_recursos").select("id, usos").in("id", ids)
  const ahora = new Date().toISOString()
  for (const fila of (data ?? []) as { id: string; usos: number }[]) {
    await db.from("marketing_recursos").update({ usos: fila.usos + 1, ultimo_uso: ahora }).eq("id", fila.id)
  }
}

/** El canon vive en la base para poder editarlo sin deploy. Falla suave al fallback. */
export async function canonDeVoz(): Promise<string> {
  try {
    const filas = await traerRecursos("canon")
    return filas[0]?.detalle?.trim() || CANON_FALLBACK
  } catch {
    return CANON_FALLBACK
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run lib/admin-vakdor/marketing/recursos.test.ts
```

Esperado: PASS, 7 tests.

- [ ] **Step 5: Agregar los tipos compartidos**

Agregar al final de `lib/admin-vakdor/marketing/types.ts`:

```ts
import type { ClaveEstructura, ClaveComentario } from "./voz"

/** Qué receta produjo una pieza: sirve para rotar, para no repetir y para auditar después. */
export interface Receta {
  estructura: ClaveEstructura | null
  escenas: string[]
  comentario_tipo: ClaveComentario | null
  modelo: string
  revision: { aprobado: boolean; reintentos: number; fallos?: string[] }
}
```

- [ ] **Step 6: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/admin-vakdor/marketing/recursos.ts lib/admin-vakdor/marketing/recursos.test.ts lib/admin-vakdor/marketing/types.ts
git commit -m "feat(marketing): rotacion determinista del banco de recursos"
```

---

## Task 5: Memoria de las piezas ya escritas

**Files:**
- Modify: `lib/admin-vakdor/marketing/store.ts` (agregar funciones al final; `resumenParaMemoria` queda como está)
- Test: `lib/admin-vakdor/marketing/memoria.test.ts`

**Interfaces:**
- Consumes: `Receta` de `./types` (Task 4).
- Produces:
  ```ts
  export interface PiezaReciente { hook: string; entrada: string; estructura: string | null; escenas: string[] }
  export function resumirPieza(contenido: string, receta: Receta | null): PiezaReciente
  export function formatearMemoria(piezas: PiezaReciente[]): string
  export async function textosRecientes(limite?: number): Promise<PiezaReciente[]>
  export async function guardarReceta(id: string, receta: Receta): Promise<void>
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/admin-vakdor/marketing/memoria.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { resumirPieza, formatearMemoria } from "./store"
import type { Receta } from "./types"

const receta: Receta = {
  estructura: "contraste", escenas: ["id-1"], comentario_tipo: "matiz",
  modelo: "claude-sonnet-5", revision: { aprobado: true, reintentos: 0 },
}

describe("resumirPieza", () => {
  it("toma la primera línea NO vacía como hook, completa", () => {
    const p = resumirPieza("\n\nEl lead entró un sábado a la noche.\n\nY nadie contestó.", receta)
    expect(p.hook).toBe("El lead entró un sábado a la noche.")
  })

  it("recorta la entrada a 400 caracteres", () => {
    const p = resumirPieza("Hook.\n" + "x".repeat(900), receta)
    expect(p.entrada.length).toBeLessThanOrEqual(400)
  })

  it("toma estructura y escenas de la receta", () => {
    const p = resumirPieza("Hook.\ncuerpo", receta)
    expect(p.estructura).toBe("contraste")
    expect(p.escenas).toEqual(["id-1"])
  })

  it("sin receta no rompe", () => {
    const p = resumirPieza("Hook.\ncuerpo", null)
    expect(p.estructura).toBeNull()
    expect(p.escenas).toEqual([])
  })

  it("con contenido vacío devuelve hook vacío", () => {
    expect(resumirPieza("", null).hook).toBe("")
  })
})

describe("formatearMemoria", () => {
  it("lista los hooks y nombra la prohibición de repetir", () => {
    const texto = formatearMemoria([resumirPieza("El lead del sábado.\ncuerpo largo", receta)])
    expect(texto).toContain("El lead del sábado.")
    expect(texto).toMatch(/no repitas/i)
    expect(texto).toContain("contraste")
  })

  it("sin piezas devuelve string vacío (no se inyecta nada al prompt)", () => {
    expect(formatearMemoria([])).toBe("")
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/admin-vakdor/marketing/memoria.test.ts
```

Esperado: FAIL — `resumirPieza is not a function` (o error de export inexistente).

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `lib/admin-vakdor/marketing/store.ts`:

```ts
import type { Receta } from "./types"

export interface PiezaReciente {
  hook: string
  entrada: string
  estructura: string | null
  escenas: string[]
}

/** Resume una pieza escrita para usarla como memoria anti-repetición. */
export function resumirPieza(contenido: string, receta: Receta | null): PiezaReciente {
  const texto = (contenido ?? "").trim()
  const hook = texto.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? ""
  return {
    hook,
    entrada: texto.slice(0, 400),
    estructura: receta?.estructura ?? null,
    escenas: receta?.escenas ?? [],
  }
}

/** Bloque de memoria que se inyecta al prompt. "" si no hay nada que recordar. */
export function formatearMemoria(piezas: PiezaReciente[]): string {
  if (piezas.length === 0) return ""
  const items = piezas.map((p, i) => {
    const marca = p.estructura ? ` [estructura: ${p.estructura}]` : ""
    return `${i + 1}.${marca}\n   APERTURA: ${p.hook}\n   ENTRADA: ${p.entrada}`
  })
  return [
    "PIEZAS QUE YA ESCRIBISTE. No repitas la apertura, el argumento central, la escena ni la estructura de ninguna de éstas:",
    ...items,
  ].join("\n\n")
}

/** Últimas piezas con contenido, para alimentar la memoria. */
export async function textosRecientes(limite = 15): Promise<PiezaReciente[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .select("contenido, receta")
    .not("contenido", "is", null)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) throw new Error(`textosRecientes: ${error.message}`)
  return ((data ?? []) as { contenido: string | null; receta: Receta | null }[])
    .filter((f) => (f.contenido ?? "").trim().length > 0)
    .map((f) => resumirPieza(f.contenido as string, f.receta))
}

export async function guardarReceta(id: string, receta: Receta): Promise<void> {
  const { error } = await getAdminDb().from("marketing_ideas").update({ receta }).eq("id", id)
  if (error) throw new Error(`guardarReceta: ${error.message}`)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run lib/admin-vakdor/marketing/memoria.test.ts
```

Esperado: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-vakdor/marketing/store.ts lib/admin-vakdor/marketing/memoria.test.ts
git commit -m "feat(marketing): memoria con el texto completo de las ultimas piezas"
```

---

## Task 6: Cliente Claude Sonnet 5 en la app

**Files:**
- Modify: `lib/admin-vakdor/marketing/claude.ts` (reescritura completa)
- Modify: `lib/admin-vakdor/marketing/brand-prompt.ts:25` (regla de CTA)
- Test: `lib/admin-vakdor/marketing/claude.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces:
  ```ts
  export const MODELO = "claude-sonnet-5"
  export interface OpcionesLlamada { maxTokens?: number; effort?: "low" | "medium" | "high"; cachearSystem?: boolean }
  export function construirParams(system: string, user: string, opts?: OpcionesLlamada): Record<string, unknown>
  export function extraerTexto(content: unknown[]): string
  export async function generarTexto(system: string, user: string, opts?: OpcionesLlamada): Promise<string>
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/admin-vakdor/marketing/claude.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { construirParams, extraerTexto, MODELO } from "./claude"

describe("construirParams", () => {
  it("usa Sonnet 5 con thinking adaptativo", () => {
    const p = construirParams("SYS", "USER") as any
    expect(p.model).toBe("claude-sonnet-5")
    expect(MODELO).toBe("claude-sonnet-5")
    expect(p.thinking).toEqual({ type: "adaptive" })
  })

  it("NO manda parámetros que devuelven 400 en Sonnet 5", () => {
    const p = construirParams("SYS", "USER") as any
    expect(p.temperature).toBeUndefined()
    expect(p.top_p).toBeUndefined()
    expect(p.top_k).toBeUndefined()
    expect(p.budget_tokens).toBeUndefined()
    expect(p.thinking.budget_tokens).toBeUndefined()
  })

  it("nunca pide más de 8000 tokens de salida", () => {
    expect((construirParams("S", "U", { maxTokens: 99000 }) as any).max_tokens).toBe(8000)
    expect((construirParams("S", "U") as any).max_tokens).toBe(4000)
  })

  it("cachea el system cuando se pide (bloque grande de skills)", () => {
    const p = construirParams("SYS", "USER", { cachearSystem: true }) as any
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" })
    expect(p.system[0].text).toBe("SYS")
  })

  it("sin cacheo el system no lleva cache_control", () => {
    const p = construirParams("SYS", "USER") as any
    expect(p.system[0].cache_control).toBeUndefined()
  })

  it("pasa el effort dentro de output_config", () => {
    const p = construirParams("S", "U", { effort: "low" }) as any
    expect(p.output_config).toEqual({ effort: "low" })
  })

  it("omite output_config si no se pide effort", () => {
    expect((construirParams("S", "U") as any).output_config).toBeUndefined()
  })
})

describe("extraerTexto", () => {
  it("ignora los bloques thinking y concatena solo el texto", () => {
    const content = [
      { type: "thinking", thinking: "razonamiento interno" },
      { type: "text", text: "Hola" },
      { type: "text", text: " mundo" },
    ]
    expect(extraerTexto(content)).toBe("Hola mundo")
  })

  it("si solo hay thinking devuelve string vacío en vez de romper", () => {
    expect(extraerTexto([{ type: "thinking", thinking: "x" }])).toBe("")
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/admin-vakdor/marketing/claude.test.ts
```

Esperado: FAIL — `construirParams is not exported by ./claude`.

- [ ] **Step 3: Reescribir el cliente**

Reemplazar el contenido completo de `lib/admin-vakdor/marketing/claude.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk"

export const MODELO = "claude-sonnet-5"

const MAX_TOKENS_TECHO = 8000

export interface OpcionesLlamada {
  maxTokens?: number
  /** "low" para tareas mecánicas (clasificar). Se omite para redacción: el default es el bueno. */
  effort?: "low" | "medium" | "high"
  /** true para bloques de system grandes y estables (skills): los cachea y se leen al 10%. */
  cachearSystem?: boolean
}

/**
 * Arma el body de la llamada. Separado de la llamada para poder testearlo.
 * OJO: temperature/top_p/top_k y budget_tokens devuelven 400 en Sonnet 5.
 */
export function construirParams(system: string, user: string, opts: OpcionesLlamada = {}) {
  const bloqueSystem: Record<string, unknown> = { type: "text", text: system }
  if (opts.cachearSystem) bloqueSystem.cache_control = { type: "ephemeral" }

  const params: Record<string, unknown> = {
    model: MODELO,
    max_tokens: Math.min(opts.maxTokens ?? 4000, MAX_TOKENS_TECHO),
    thinking: { type: "adaptive" },
    system: [bloqueSystem],
    messages: [{ role: "user", content: user }],
  }
  if (opts.effort) params.output_config = { effort: opts.effort }
  return params
}

/** Sonnet 5 devuelve también bloques `thinking`: hay que quedarse solo con los de texto. */
export function extraerTexto(content: unknown[]): string {
  return (content as { type: string; text?: string }[])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim()
}

export async function generarTexto(system: string, user: string, opts: OpcionesLlamada = {}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.messages.create(construirParams(system, user, opts) as any)
  return extraerTexto(res.content as unknown[])
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run lib/admin-vakdor/marketing/claude.test.ts
```

Esperado: PASS, 9 tests.

- [ ] **Step 5: Actualizar la regla de CTA del paquete de marca**

En `lib/admin-vakdor/marketing/brand-prompt.ts`, reemplazar la línea:

```
- LinkedIn = ultracualificación (hook con calificador de escala, posición fuerte, CTA que no ruega).
```

por:

```
- LinkedIn = ultracualificación (hook con calificador de escala, posición fuerte, CTA que no ruega).
- El CTA depende de la etapa del embudo: TOFU no vende ni manda a ningún lado; MOFU explica el
  mecanismo; BOFU manda a ver el video de la demostración (el link va SOLO en el primer comentario).
  Nunca uses CTAs genéricos tipo "Comentá SISTEMA" ni pidas una llamada.
```

- [ ] **Step 6: Verificar que compila y que no quedó Gemini en el módulo**

```bash
npx tsc --noEmit
grep -rn "generative-ai\|gemini" lib/admin-vakdor/marketing/
```

Esperado: `tsc` sin errores y el `grep` sin resultados.

- [ ] **Step 7: Commit**

```bash
git add lib/admin-vakdor/marketing/claude.ts lib/admin-vakdor/marketing/claude.test.ts lib/admin-vakdor/marketing/brand-prompt.ts
git commit -m "feat(marketing): cliente Claude Sonnet 5 con caching y CTA por etapa"
```

---

## Task 7: Generar ideas e insights v2 en la app

**Files:**
- Modify: `app/api/admin-vakdor/marketing/generar/route.ts:30-37` (bloque `user`)
- Modify: `app/api/admin-vakdor/marketing/[id]/reformular/route.ts`

**Interfaces:**
- Consumes: `generarTexto` (Task 6), `canonDeVoz`, `traerRecursos` (Task 4), `textosRecientes`, `formatearMemoria` (Task 5), `instruccionCta`, `promptRevision`, `detectarMuletillas` (Task 2), `hookRepetido` (Task 3).
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Actualizar el prompt de generación de ideas**

En `app/api/admin-vakdor/marketing/generar/route.ts`, reemplazar el array `user` (líneas 30-37) por:

```ts
  const canon = await canonDeVoz()
  const estructuras = await traerRecursos("estructura")
  const escenas = await traerRecursos("escena")

  const user = [
    `Generá 5 ideas de contenido para Vakdor (mezcla LinkedIn y blog).`,
    `CANON DE VOZ (toda idea tiene que poder escribirse con esta voz):\n${canon}`,
    `ESTRUCTURAS NARRATIVAS DISPONIBLES (asigná una distinta a cada idea):\n${estructuras.map((e) => `- ${e.clave}: ${e.titulo}`).join("\n")}`,
    `ESCENAS DEL RUBRO (el gancho de cada idea tiene que apoyarse en una de éstas, no en una generalidad):\n${escenas.slice(0, 30).map((e) => `- ${e.titulo}: ${e.detalle}`).join("\n")}`,
    insights ? `DATOS REALES DE RENDIMIENTO (Buffer) — priorizá los patrones que más rinden y evitá los que menos; no inventes:\n${insights}` : "",
    `Balanceá el EMBUDO: asigná a cada idea una etapa "funnel": "tofu" (descubrimiento, dolor amplio, sin vender), "mofu" (nutrición, el mecanismo/método PRISMA), "bofu" (empujón a ver la demostración). Mezclá las 3 etapas.`,
    `NO repitas estos ángulos/títulos ya usados:\n${evitar}`,
    `El "gancho" de cada idea tiene que ser una escena concreta, NUNCA una tesis abstracta.`,
    `Devolvé SOLO un array JSON válido, sin texto extra, con objetos:`,
    `{"titulo": string, "fuente": "linkedin"|"blog", "formato": "post_texto"|"carrusel"|"articulo_blog", "funnel": "tofu"|"mofu"|"bofu", "estructura": string, "angulo": string, "gancho": string, "motivo": string}`,
  ].filter(Boolean).join("\n\n")
```

Agregar el import arriba del archivo:

```ts
import { canonDeVoz, traerRecursos } from "@/lib/admin-vakdor/marketing/recursos"
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Actualizar reformular con canon y rúbrica**

En `app/api/admin-vakdor/marketing/[id]/reformular/route.ts`, después de obtener el texto reformulado y antes de guardarlo, insertar el paso de revisión. Agregar los imports:

```ts
import { canonDeVoz } from "@/lib/admin-vakdor/marketing/recursos"
import { promptRevision, detectarMuletillas, type EtapaEmbudo } from "@/lib/admin-vakdor/marketing/voz"
import { textosRecientes } from "@/lib/admin-vakdor/marketing/store"
import { hookRepetido } from "@/lib/admin-vakdor/marketing/similitud"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
```

y el bloque de revisión:

```ts
/** Revisa contra rúbrica y reescribe UNA sola vez si no aprueba. */
async function revisarYCorregir(texto: string, etapa: EtapaEmbudo, systemBase: string): Promise<string> {
  const previas = await textosRecientes(15)
  const hooks = previas.map((p) => p.hook).filter(Boolean)
  const hookNuevo = texto.split("\n").map((l) => l.trim()).find((l) => l) ?? ""

  const fallos: string[] = []
  const rep = hookRepetido(hookNuevo, hooks)
  if (rep.repetido) fallos.push(`5: la apertura se parece demasiado a una ya publicada ("${rep.contra}")`)
  const muletillas = detectarMuletillas(texto)
  if (muletillas.length) fallos.push(`7: muletillas de IA detectadas: ${muletillas.join(", ")}`)

  const veredicto = await generarTexto(systemBase, promptRevision(texto, etapa, hooks), { maxTokens: 1000, effort: "low" })
  try {
    const parsed = JSON.parse(veredicto.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { aprobado?: boolean; fallos?: string[] }
    if (parsed.aprobado === false) fallos.push(...(parsed.fallos ?? []))
  } catch { /* falla suave: si el veredicto no parsea, se queda con los chequeos locales */ }

  if (fallos.length === 0) return texto

  return await generarTexto(
    systemBase,
    [
      `Reescribí esta pieza corrigiendo SOLO los fallos listados. Mantené el argumento y la extensión.`,
      `FALLOS:\n${fallos.map((f) => `- ${f}`).join("\n")}`,
      `PIEZA:\n"""\n${texto}\n"""`,
      `Devolvé SOLO la pieza corregida, sin explicaciones.`,
    ].join("\n\n"),
    { maxTokens: 4000 },
  )
}
```

Llamarlo sobre el texto reformulado antes de persistirlo, usando `idea.funnel ?? "mofu"` como etapa y el system que ya arma la ruta más `await canonDeVoz()`.

- [ ] **Step 4: Verificar que compila y que la suite entera pasa**

```bash
npx tsc --noEmit && npm test
```

Esperado: sin errores de tipos; todos los tests en verde.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin-vakdor/marketing/generar/route.ts "app/api/admin-vakdor/marketing/[id]/reformular/route.ts"
git commit -m "feat(marketing): ideas con canon y escenas, reformular con rubrica"
```

---

## Task 8: Módulos de voz y similitud en el worker

**Files:**
- Create: `marketing-worker/similitud.mjs`
- Create: `marketing-worker/voz.mjs`
- Create: `marketing-worker/similitud.test.mjs`

> Todo lo de esta tarea y las siguientes vive en `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\marketing-worker` — **repo aparte**, no entra en los commits de la app.

**Interfaces:**
- Consumes: nada.
- Produces:
  ```js
  // similitud.mjs
  export function normalizar(texto)
  export function similitud(a, b)          // 0..1
  export function hookRepetido(hook, previos, umbral = 0.45)  // { repetido, contra, valor }
  // voz.mjs
  export const CANON_FALLBACK               // string
  export const MULETILLAS                   // string[]
  export function detectarMuletillas(texto) // string[]
  export function instruccionCta(etapa)     // "tofu"|"mofu"|"bofu" -> string
  export function instruccionComentario(clave, etapa) // -> string
  export const RUBRICA                      // string[]
  export function promptRevision(texto, etapa, hooksPrevios) // -> string
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `marketing-worker/similitud.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizar, similitud, hookRepetido } from "./similitud.mjs";
import { detectarMuletillas, instruccionCta, MULETILLAS } from "./voz.mjs";

test("normalizar saca tildes, mayusculas y puntuacion", () => {
  assert.equal(normalizar("¿Tenés QUÉ, dónde?"), "tenes que donde");
});

test("un texto contra si mismo da 1", () => {
  const t = "el lead entro un sabado a la noche y nadie contesto";
  assert.equal(similitud(t, t), 1);
});

test("dos textos sin relacion dan menos de 0,2", () => {
  const a = "tu equipo te interrumpe quince veces al dia por cosas resueltas";
  const b = "la tasacion por corazonada deja la propiedad ocho meses publicada";
  assert.ok(similitud(a, b) < 0.2);
});

test("dos aperturas casi iguales superan 0,45", () => {
  const a = "El lead entró un sábado a la noche y nadie contestó hasta el lunes";
  const b = "el lead entro un sabado a la noche y NADIE contesto hasta el lunes";
  assert.ok(similitud(a, b) > 0.45);
});

test("hookRepetido marca el repetido y dice contra cual", () => {
  const previos = ["El lead entro un sabado a la noche"];
  const r = hookRepetido("El lead entró un sábado a la noche", previos);
  assert.equal(r.repetido, true);
  assert.equal(r.contra, previos[0]);
});

test("sin previos nunca marca repeticion", () => {
  assert.equal(hookRepetido("cualquier cosa", []).repetido, false);
});

test("detecta muletillas pero NO prohibe la formula 'X no es Y'", () => {
  assert.ok(detectarMuletillas("Hoy mas que nunca hay que actuar").length > 0);
  assert.deepEqual(detectarMuletillas("Automatizar no es poner un bot."), []);
  assert.ok(!MULETILLAS.some((m) => /no es/.test(m)));
});

test("el CTA de BOFU manda al video y aclara que el link va en el comentario", () => {
  const t = instruccionCta("bofu");
  assert.ok(t.includes("vakdor.com/demostracion"));
  assert.ok(/primer comentario/i.test(t));
  assert.ok(!instruccionCta("tofu").includes("vakdor.com/demostracion"));
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node --test marketing-worker/similitud.test.mjs
```

Esperado: FAIL — `Cannot find module './similitud.mjs'`.

- [ ] **Step 3: Escribir `similitud.mjs`**

```js
// Detección de aperturas repetidas por coeficiente de Dice sobre trigramas de palabras.
// Espejo de lib/admin-vakdor/marketing/similitud.ts: si cambia uno, cambian los dos.

export function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function trigramas(texto) {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  const out = new Set();
  if (palabras.length < 3) {
    if (palabras.length) out.add(palabras.join(" "));
    return out;
  }
  for (let i = 0; i <= palabras.length - 3; i++) out.add(palabras.slice(i, i + 3).join(" "));
  return out;
}

/** Coeficiente de Dice: 2·|A∩B| / (|A|+|B|). 0 = nada en común, 1 = idénticos. */
export function similitud(a, b) {
  const A = trigramas(a), B = trigramas(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  return (2 * comunes) / (A.size + B.size);
}

export function hookRepetido(hook, previos, umbral = 0.45) {
  let mejor = { contra: null, valor: 0 };
  for (const p of previos) {
    const v = similitud(hook, p);
    if (v > mejor.valor) mejor = { contra: p, valor: v };
  }
  return { repetido: mejor.valor >= umbral, contra: mejor.valor >= umbral ? mejor.contra : null, valor: mejor.valor };
}
```

- [ ] **Step 4: Escribir `voz.mjs`**

Copiar `lib/admin-vakdor/marketing/voz.ts` (Task 2) a `marketing-worker/voz.mjs` y hacer exactamente estas transformaciones mecánicas, sin tocar ni una palabra de los textos:

1. Borrar las líneas `export type EtapaEmbudo`, `export type ClaveEstructura` y `export type ClaveComentario`.
2. En `CLAVES_ESTRUCTURA` y `CLAVES_COMENTARIO`, borrar `: readonly ClaveEstructura[]` / `: readonly ClaveComentario[]` y el `as const` final.
3. En `MULETILLAS`, borrar `: readonly string[]` y el `as const`.
4. En `RUBRICA`, borrar `: readonly string[]` y el `as const`.
5. Borrar todas las anotaciones de tipo de parámetros y retornos: `(texto: string): string` → `(texto)`, `(etapa: EtapaEmbudo): string` → `(etapa)`, `(clave: ClaveComentario, etapa: EtapaEmbudo): string` → `(clave, etapa)`, `(texto: string, etapa: EtapaEmbudo, hooksPrevios: string[]): string` → `(texto, etapa, hooksPrevios)`.
6. En `instruccionComentario`, cambiar `const cuerpos: Record<ClaveComentario, string> = {` por `const cuerpos = {`.
7. Dejar `CANON_FALLBACK` y todos los textos de `instruccionCta`, `instruccionComentario`, `RUBRICA` y `promptRevision` **idénticos palabra por palabra**: son la misma voz que usa la app.

Los tests del Step 1 verifican que la transformación quedó bien.

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
node --test marketing-worker/similitud.test.mjs
```

Esperado: PASS, 8 tests.

> No corras `node --test` sin argumentos: levanta también `test-content.mjs` y `test-render.mjs`, que hacen llamadas reales y fallan sin contexto.

- [ ] **Step 6: Commit (repo del worker)**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/Prisma - MK"
git add marketing-worker/similitud.mjs marketing-worker/voz.mjs marketing-worker/similitud.test.mjs
git commit -m "feat(worker): modulos de voz y similitud"
```

---

## Task 9: Rotación y revisión en el worker

**Files:**
- Create: `marketing-worker/recursos.mjs`
- Create: `marketing-worker/revision.mjs`
- Create: `marketing-worker/revision.test.mjs`

**Interfaces:**
- Consumes: `similitud.mjs`, `voz.mjs` (Task 8).
- Produces:
  ```js
  // recursos.mjs
  export function elegirRecursos(candidatos, cantidad, excluirIds)
  export async function traerRecursos(db, tipo)
  export async function marcarUsados(db, ids)
  export async function canonDeVoz(db)
  export async function recetaParaIdea(db, previas)   // { canon, estructura, escenas, comentarioTipo }
  export function resumirPieza(contenido, receta)     // { hook, entrada, estructura, escenas }
  export function formatearMemoria(piezas)            // string ("" si no hay piezas)
  export async function textosRecientes(db, limite)   // PiezaReciente[]
  // revision.mjs
  export function chequeosLocales(texto, hooksPrevios)  // string[] de fallos
  export function parsearVeredicto(raw)                 // { aprobado, fallos }
  export async function revisar(llamar, texto, etapa, hooksPrevios) // { texto, aprobado, reintentos, fallos }
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `marketing-worker/revision.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirRecursos } from "./recursos.mjs";
import { chequeosLocales, parsearVeredicto, revisar } from "./revision.mjs";

const r = (id, usos, ultimo_uso) => ({ id, tipo: "escena", clave: null, titulo: `t-${id}`, detalle: `d-${id}`, usos, ultimo_uso });

test("elegirRecursos prioriza el menos usado", () => {
  assert.deepEqual(elegirRecursos([r("a", 5, null), r("b", 1, null)], 1, []).map((x) => x.id), ["b"]);
});

test("elegirRecursos recicla si al excluir no queda ninguno", () => {
  assert.deepEqual(elegirRecursos([r("a", 7, null), r("b", 2, null)], 1, ["a", "b"]).map((x) => x.id), ["b"]);
});

test("chequeosLocales marca la apertura repetida", () => {
  const fallos = chequeosLocales("El lead entró un sábado a la noche\ncuerpo", ["El lead entro un sabado a la noche"]);
  assert.ok(fallos.some((f) => f.startsWith("5:")));
});

test("chequeosLocales marca muletillas y no marca un texto limpio", () => {
  assert.ok(chequeosLocales("Hoy mas que nunca hay que mover", []).some((f) => f.startsWith("7:")));
  assert.deepEqual(chequeosLocales("Te escribe por un tres ambientes y le mandás un menú.", []), []);
});

test("parsearVeredicto lee el JSON aunque venga con texto alrededor", () => {
  assert.deepEqual(parsearVeredicto('bla {"aprobado": false, "fallos": ["1: abre con tesis"]} chau'),
    { aprobado: false, fallos: ["1: abre con tesis"] });
});

test("parsearVeredicto con basura aprueba (falla suave, no bloquea la pieza)", () => {
  assert.deepEqual(parsearVeredicto("no hay json aca"), { aprobado: true, fallos: [] });
});

test("revisar no reescribe si aprueba y no hay fallos locales", async () => {
  const llamar = async () => '{"aprobado": true, "fallos": []}';
  const out = await revisar(llamar, "Te escribe un sábado a la noche.\ncuerpo", "tofu", []);
  assert.equal(out.reintentos, 0);
  assert.equal(out.aprobado, true);
  assert.ok(out.texto.startsWith("Te escribe"));
});

test("revisar reescribe UNA sola vez cuando hay fallos", async () => {
  let n = 0;
  const llamar = async () => { n++; return n === 1 ? '{"aprobado": false, "fallos": ["1: abre con tesis"]}' : "PIEZA CORREGIDA"; };
  const out = await revisar(llamar, "La sistematizacion es clave.\ncuerpo", "mofu", []);
  assert.equal(out.reintentos, 1);
  assert.equal(out.texto, "PIEZA CORREGIDA");
  assert.equal(n, 2);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node --test marketing-worker/revision.test.mjs
```

Esperado: FAIL — `Cannot find module './recursos.mjs'`.

- [ ] **Step 3: Escribir `recursos.mjs`**

```js
// Banco de recursos + memoria de piezas, contra Supabase. El cliente `db` se
// recibe por parámetro (lo crea watch.mjs), no se importa.
import { CANON_FALLBACK } from "./voz.mjs";

/** Orden determinista: menos usados primero; a igual uso, el que hace más tiempo no se usa. */
function ordenar(a, b) {
  if (a.usos !== b.usos) return a.usos - b.usos;
  const ta = a.ultimo_uso ? Date.parse(a.ultimo_uso) : 0;
  const tb = b.ultimo_uso ? Date.parse(b.ultimo_uso) : 0;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

/** Si al excluir no queda ninguno, recicla los menos usados: nunca bloquea la generación. */
export function elegirRecursos(candidatos, cantidad, excluirIds) {
  if (!candidatos.length) return [];
  const excluir = new Set(excluirIds);
  const frescos = candidatos.filter((c) => !excluir.has(c.id));
  const pool = frescos.length ? frescos : candidatos;
  return [...pool].sort(ordenar).slice(0, cantidad);
}

export async function traerRecursos(db, tipo) {
  const { data, error } = await db
    .from("marketing_recursos")
    .select("id, tipo, clave, titulo, detalle, usos, ultimo_uso")
    .eq("tipo", tipo)
    .eq("activo", true);
  if (error) throw new Error(`traerRecursos(${tipo}): ${error.message}`);
  return data ?? [];
}

export async function marcarUsados(db, ids) {
  if (!ids.length) return;
  const { data } = await db.from("marketing_recursos").select("id, usos").in("id", ids);
  const ahora = new Date().toISOString();
  for (const fila of data ?? []) {
    await db.from("marketing_recursos").update({ usos: fila.usos + 1, ultimo_uso: ahora }).eq("id", fila.id);
  }
}

/** El canon vive en la base para poder editarlo sin deploy. Falla suave al fallback. */
export async function canonDeVoz(db) {
  try {
    const filas = await traerRecursos(db, "canon");
    return (filas[0]?.detalle || "").trim() || CANON_FALLBACK;
  } catch {
    return CANON_FALLBACK;
  }
}

/**
 * Arma la receta de una pieza: canon + estructura + 1-2 escenas + tipo de comentario.
 * `previas` son las piezas recientes, para no repetir estructura ni escena.
 */
export async function recetaParaIdea(db, previas) {
  const canon = await canonDeVoz(db);
  const [estructuras, escenas, comentarios] = await Promise.all([
    traerRecursos(db, "estructura"),
    traerRecursos(db, "escena"),
    traerRecursos(db, "comentario"),
  ]);

  const estructurasUsadas = previas.map((p) => p.estructura).filter(Boolean);
  const escenasUsadas = previas.flatMap((p) => p.escenas ?? []);

  const idsEstructurasUsadas = estructuras.filter((e) => estructurasUsadas.includes(e.clave)).map((e) => e.id);
  const estructura = elegirRecursos(estructuras, 1, idsEstructurasUsadas)[0] ?? null;
  const elegidas = elegirRecursos(escenas, 2, escenasUsadas);
  const comentario = elegirRecursos(comentarios, 1, [])[0] ?? null;

  await marcarUsados(db, [estructura?.id, comentario?.id, ...elegidas.map((e) => e.id)].filter(Boolean));

  return { canon, estructura, escenas: elegidas, comentarioTipo: comentario?.clave ?? "dato_crudo" };
}

// ---------- memoria de piezas ya escritas ----------

const primeraLinea = (texto) => (texto || "").split("\n").map((l) => l.trim()).find((l) => l) ?? "";

export function resumirPieza(contenido, receta) {
  const texto = (contenido || "").trim();
  return {
    hook: primeraLinea(texto),
    entrada: texto.slice(0, 400),
    estructura: receta?.estructura ?? null,
    escenas: receta?.escenas ?? [],
  };
}

/** Bloque de memoria que se inyecta al prompt. "" si no hay nada que recordar. */
export function formatearMemoria(piezas) {
  if (!piezas.length) return "";
  const items = piezas.map((p, i) => {
    const marca = p.estructura ? ` [estructura: ${p.estructura}]` : "";
    return `${i + 1}.${marca}\n   APERTURA: ${p.hook}\n   ENTRADA: ${p.entrada}`;
  });
  return [
    "PIEZAS QUE YA ESCRIBISTE. No repitas la apertura, el argumento central, la escena ni la estructura de ninguna de éstas:",
    ...items,
  ].join("\n\n");
}

export async function textosRecientes(db, limite = 15) {
  const { data, error } = await db
    .from("marketing_ideas")
    .select("contenido, receta")
    .not("contenido", "is", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`textosRecientes: ${error.message}`);
  return (data ?? [])
    .filter((f) => (f.contenido || "").trim().length > 0)
    .map((f) => resumirPieza(f.contenido, f.receta));
}
```

- [ ] **Step 4: Escribir `revision.mjs`**

```js
import { hookRepetido } from "./similitud.mjs";
import { detectarMuletillas, promptRevision } from "./voz.mjs";

const primeraLinea = (texto) => (texto || "").split("\n").map((l) => l.trim()).find((l) => l) ?? "";

/** Chequeos que no cuestan una llamada a la API. */
export function chequeosLocales(texto, hooksPrevios) {
  const fallos = [];
  const rep = hookRepetido(primeraLinea(texto), hooksPrevios);
  if (rep.repetido) fallos.push(`5: la apertura se parece demasiado a una ya publicada ("${rep.contra}")`);
  const muletillas = detectarMuletillas(texto);
  if (muletillas.length) fallos.push(`7: muletillas de IA detectadas: ${muletillas.join(", ")}`);
  return fallos;
}

/** Falla suave: si el veredicto no parsea, se aprueba y se sigue con los chequeos locales. */
export function parsearVeredicto(raw) {
  try {
    const m = (raw || "").match(/\{[\s\S]*\}/);
    if (!m) return { aprobado: true, fallos: [] };
    const p = JSON.parse(m[0]);
    return { aprobado: p.aprobado !== false, fallos: Array.isArray(p.fallos) ? p.fallos : [] };
  } catch {
    return { aprobado: true, fallos: [] };
  }
}

/**
 * `llamar(prompt)` hace la llamada al modelo. Máximo UNA reescritura:
 * la revisión señala fallos, no reescribe el texto entero en loop.
 */
export async function revisar(llamar, texto, etapa, hooksPrevios) {
  const fallos = [...chequeosLocales(texto, hooksPrevios)];
  const veredicto = parsearVeredicto(await llamar(promptRevision(texto, etapa, hooksPrevios)));
  if (!veredicto.aprobado) fallos.push(...veredicto.fallos);

  if (fallos.length === 0) return { texto, aprobado: true, reintentos: 0, fallos: [] };

  const corregido = await llamar([
    `Reescribí esta pieza corrigiendo SOLO los fallos listados. Mantené el argumento y la extensión.`,
    `FALLOS:\n${fallos.map((f) => `- ${f}`).join("\n")}`,
    `PIEZA:\n"""\n${texto}\n"""`,
    `Devolvé SOLO la pieza corregida, sin explicaciones.`,
  ].join("\n\n"));

  return { texto: (corregido || texto).trim(), aprobado: false, reintentos: 1, fallos };
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
node --test marketing-worker/revision.test.mjs
```

Esperado: PASS, 8 tests.

- [ ] **Step 6: Commit (repo del worker)**

```bash
git add marketing-worker/recursos.mjs marketing-worker/revision.mjs marketing-worker/revision.test.mjs
git commit -m "feat(worker): rotacion de recursos y revision contra rubrica"
```

---

## Task 10: Prompts y orquestación del worker

**Files:**
- Modify: `marketing-worker/content.mjs` (reemplazar `BRAND_SYSTEM`, `ESTRUCTURA_LINKEDIN`, `claude()`, `funnelInstruccion()` y las tres funciones `desarrollar*`)
- Modify: `marketing-worker/watch.mjs:40` (cliente) y los tres llamados a `desarrollar*`

**Interfaces:**
- Consumes: `voz.mjs`, `similitud.mjs` (Task 8), `recursos.mjs`, `revision.mjs` (Task 9).
- Produces:
  ```js
  // content.mjs
  export async function desarrollar(client, idea, ctx)          // ctx = { insights, memoria, receta, hooksPrevios }
  export async function desarrollarCarrusel(client, idea, ctx)
  export async function desarrollarMagnet(client, idea, ctx)
  export function llamador(client, system) // devuelve (prompt) => Promise<string>, para revisar()
  export const BRAND_SYSTEM                // ya existe hoy; mantenerlo exportado
  ```

- [ ] **Step 1: Cambiar el cliente a Anthropic Sonnet 5**

En `content.mjs`, borrar el import de `@google/generative-ai` y reemplazar la función `claude()` por:

```js
import Anthropic from "@anthropic-ai/sdk";

export const MODELO = "claude-sonnet-5";

/** OJO: Sonnet 5 devuelve bloques `thinking` además de `text`. */
function extraerTexto(content) {
  return content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("").trim();
}

async function llamar(client, system, user, { maxTokens = 4000, effort, cachearSystem = true } = {}) {
  const bloque = { type: "text", text: system };
  if (cachearSystem) bloque.cache_control = { type: "ephemeral" };
  const params = {
    model: MODELO,
    max_tokens: Math.min(maxTokens, 8000),
    thinking: { type: "adaptive" },
    system: [bloque],
    messages: [{ role: "user", content: user }],
  };
  if (effort) params.output_config = { effort };
  const res = await client.messages.create(params);
  return extraerTexto(res.content);
}

/** Cierre parcial para pasarle a revisar() de revision.mjs. */
export function llamador(client, system) {
  return (prompt) => llamar(client, system, prompt, { maxTokens: 4000 });
}
```

En `watch.mjs:40`, reemplazar:

```js
const anthropic = new GoogleGenerativeAI(E.GEMINI_API_KEY);
```

por:

```js
const anthropic = new Anthropic({ apiKey: E.ANTHROPIC_API_KEY });
```

y en la lista de variables obligatorias (`watch.mjs:36`) cambiar `"GEMINI_API_KEY"` por `"ANTHROPIC_API_KEY"`.

- [ ] **Step 2: Reemplazar la plantilla única por el canon y la estructura**

Borrar la constante `ESTRUCTURA_LINKEDIN` (`content.mjs:17-24`) y la función `funnelInstruccion` (`content.mjs:63-74`). En su lugar:

```js
import { instruccionCta, instruccionComentario } from "./voz.mjs";

/** Reemplaza a la plantilla única: la forma la da la estructura sorteada, no un molde fijo. */
function bloqueVoz(ctx, etapa) {
  const { canon, estructura, escenas, comentarioTipo } = ctx.receta;
  return [
    `CANON DE VOZ (inquebrantable):\n${canon}`,
    estructura ? `ESTRUCTURA DE ESTA PIEZA — ${estructura.titulo}:\n${estructura.detalle}\nEscribí SIGUIENDO esta forma. No uses el molde hook/fricción/quiebre/solución/prueba/CTA.` : "",
    escenas.length ? `ESCENAS DEL RUBRO PARA APOYARTE (usá al menos una, desarrollada con detalle propio):\n${escenas.map((e) => `- ${e.titulo}: ${e.detalle}`).join("\n")}` : "",
    instruccionCta(etapa),
    instruccionComentario(comentarioTipo, etapa),
    `EXTENSIÓN: 1500-2500 caracteres, líneas cortas con mucho aire.`,
  ].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 3: Actualizar las tres funciones de desarrollo**

Las tres pasan a recibir `ctx = { insights, memoria, receta, hooksPrevios }` en vez de `insights`. Borrar la función `leerMemoria` y su uso de `memoria.md`: la memoria ahora viene de la base.

`desarrollar` queda así (las otras dos siguen la misma forma, conservando su propio contrato JSON — slides en el carrusel, markdown en el magnet):

```js
export async function desarrollar(client, idea, ctx) {
  const esBlog = idea.fuente === "blog";
  const etapa = idea.funnel ?? "mofu";
  const user = [
    briefIdea(idea),
    bloqueVoz(ctx, etapa),
    ctx.memoria || "",
    bloqueInsights(ctx.insights),
    `Escribí el contenido COMPLETO. Segunda persona, párrafos de 2-3 líneas, cero emojis, viñetas con •, sin links en el cuerpo.`,
    esBlog
      ? `Para un artículo de blog generás DOS cosas: (1) el ARTÍCULO para la web y (2) su VERSIÓN LinkedIn.
- El ARTÍCULO (campo "contenido") es para la web (Markdown, estructura de blog).
- El post de LinkedIn (campo "linkedin_post") sigue la ESTRUCTURA DE ESTA PIEZA de arriba y LLEVA LA SUSTANCIA del artículo (su argumento central desarrollado, no un teaser vacío ni el markdown copiado). SIN links, SIN "leé el artículo" ni derivar a la web: es una pieza completa por sí misma.
Devolvé SOLO JSON: {"contenido":"<artículo en Markdown: ## H2, ### H3, intro que responde en 100 palabras, un H2 de respuesta directa (TL;DR), 3-6 H2, FAQ con H3=pregunta>","blog":{"title":"<=60 car keyword al inicio","slug":"kebab","meta_description":"<=155 car dolor+solución+CTA","seo_keywords":["principal","2-4 secundarias"],"read_time_minutes":<palabras/200>,"linkedin_post":"<el post siguiendo la ESTRUCTURA, 1500-2500 car, sin links>","linkedin_primer_comentario":"<seguí la instrucción de PRIMER COMENTARIO de arriba>","linkedin_hashtags":["#...", 3 a 5]}}`
      : `Devolvé SOLO JSON: {"contenido":"<el post de LinkedIn COMPLETO siguiendo la ESTRUCTURA DE ESTA PIEZA, 1500-2500 car, con saltos de línea>","primer_comentario":"<seguí la instrucción de PRIMER COMENTARIO de arriba>","hashtags":["#...", 3 a 5]}`,
    `Devolvé SOLO el JSON, sin texto extra ni fences.`,
  ].filter(Boolean).join("\n\n");
  return extraerJson(await llamar(client, BRAND_SYSTEM + "\n\n" + skillCopywriter(), user, { maxTokens: 4000 }));
}
```

En `desarrollarCarrusel`, además: cambiar `"cta":"Comentá SISTEMA"` por `"cta":"<cierre acorde a la etapa del embudo>"`, y borrar del prompt la línea que hoy dice que la descripción debe seguir la estructura hook → fricción → quiebre → solución → prueba → CTA (esa forma ahora la fija `bloqueVoz`).

- [ ] **Step 4: Encadenar la revisión en el worker**

En `watch.mjs`, después de cada `desarrollar*` y antes de guardar, correr la revisión y armar la receta:

```js
import { recetaParaIdea, textosRecientes, formatearMemoria } from "./recursos.mjs";
import { revisar } from "./revision.mjs";
import { llamador, BRAND_SYSTEM } from "./content.mjs";

// antes de desarrollar:
const previas = await textosRecientes(db, 15);
const receta = await recetaParaIdea(db, previas);
const hooksPrevios = previas.map((p) => p.hook).filter(Boolean);
const ctx = { insights, memoria: formatearMemoria(previas), receta, hooksPrevios };

// después de desarrollar:
const rev = await revisar(llamador(anthropic, BRAND_SYSTEM), d.contenido, idea.funnel ?? "mofu", hooksPrevios);
d.contenido = rev.texto;

// al guardar la idea, agregar:
receta: {
  estructura: receta.estructura?.clave ?? null,
  escenas: receta.escenas.map((e) => e.id),
  comentario_tipo: receta.comentarioTipo,
  modelo: "claude-sonnet-5",
  revision: { aprobado: rev.aprobado, reintentos: rev.reintentos, fallos: rev.fallos },
}
```

- [ ] **Step 5: Probar los prompts contra la API real**

Actualizar `marketing-worker/test-content.mjs` para pasar el `ctx` nuevo (una receta armada a mano con una estructura, dos escenas y un `comentarioTipo`), y correr:

```bash
node marketing-worker/test-content.mjs
```

Esperado: JSON válido en carrusel y lead magnet, con la forma esperada (slides, markdown con tabla y casillas) y sin excepciones.

- [ ] **Step 6: Verificar que no quedó Gemini en el worker**

```bash
grep -rn "GoogleGenerativeAI\|GEMINI_API_KEY\|gemini-" marketing-worker/*.mjs
```

Esperado: sin resultados.

- [ ] **Step 7: Commit (repo del worker)**

```bash
git add marketing-worker/content.mjs marketing-worker/watch.mjs marketing-worker/test-content.mjs
git commit -m "feat(worker): prompts con canon de voz, estructuras rotativas y revision"
```

---

## Task 11: Insights v2 — patrones en vez de ranking

**Files:**
- Modify: `marketing-worker/insights.mjs:35-50` (reemplazar `construirResumen`) y `insights.mjs:58-74` (`insightsDelDia`)
- Create: `marketing-worker/insights.test.mjs`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces:
  ```js
  export function agruparPorDimension(posts, clasificacion, dimension) // -> [{ valor, n, engPromedio }]
  export function construirResumen(posts, clasificacion)              // -> string
  export async function insightsDelDia(db, bufferKey, client)         // firma nueva: recibe el cliente Anthropic
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `marketing-worker/insights.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorDimension, construirResumen } from "./insights.mjs";

const posts = [
  { texto: "a", hook: "a", eng: 6, reacc: 10, coment: 3, impr: 900 },
  { texto: "b", hook: "b", eng: 5, reacc: 8, coment: 2, impr: 800 },
  { texto: "c", hook: "c", eng: 4, reacc: 6, coment: 1, impr: 700 },
  { texto: "d", hook: "d", eng: 1, reacc: 2, coment: 0, impr: 600 },
  { texto: "e", hook: "e", eng: 1, reacc: 1, coment: 0, impr: 500 },
  { texto: "f", hook: "f", eng: 1, reacc: 1, coment: 0, impr: 400 },
];
const clasificacion = [
  { apertura: "escena" }, { apertura: "escena" }, { apertura: "escena" },
  { apertura: "tesis" }, { apertura: "tesis" }, { apertura: "tesis" },
];

test("agrupa por dimension y promedia el engagement", () => {
  const g = agruparPorDimension(posts, clasificacion, "apertura");
  const escena = g.find((x) => x.valor === "escena");
  const tesis = g.find((x) => x.valor === "tesis");
  assert.equal(escena.n, 3);
  assert.equal(escena.engPromedio, 5);
  assert.equal(tesis.engPromedio, 1);
});

test("ordena de mayor a menor engagement promedio", () => {
  assert.equal(agruparPorDimension(posts, clasificacion, "apertura")[0].valor, "escena");
});

test("descarta los grupos con menos de 3 posts", () => {
  const g = agruparPorDimension(posts.slice(0, 4), [{ apertura: "escena" }, { apertura: "escena" }, { apertura: "escena" }, { apertura: "tesis" }], "apertura");
  assert.deepEqual(g.map((x) => x.valor), ["escena"]);
});

test("el resumen habla de patrones, no de un ranking de hooks", () => {
  const r = construirResumen(posts, clasificacion);
  assert.ok(/apertura/i.test(r));
  assert.ok(r.includes("escena"));
  assert.ok(!/QUE RINDE MAS/i.test(r));
});

test("sin datos suficientes devuelve string vacio", () => {
  assert.equal(construirResumen([], []), "");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node --test marketing-worker/insights.test.mjs
```

Esperado: FAIL — `agruparPorDimension is not exported`.

- [ ] **Step 3: Escribir la implementación**

Reemplazar `construirResumen` en `insights.mjs` por:

```js
const DIMENSIONES = ["apertura", "estructura", "tema", "cta"];
const MINIMO_POR_GRUPO = 3;

/** Promedia el engagement por valor de una dimensión, descartando grupos chicos. */
export function agruparPorDimension(posts, clasificacion, dimension) {
  const grupos = new Map();
  posts.forEach((p, i) => {
    const valor = clasificacion[i]?.[dimension];
    if (!valor) return;
    const g = grupos.get(valor) ?? { valor, n: 0, suma: 0 };
    g.n++; g.suma += p.eng;
    grupos.set(valor, g);
  });
  return [...grupos.values()]
    .filter((g) => g.n >= MINIMO_POR_GRUPO)
    .map((g) => ({ valor: g.valor, n: g.n, engPromedio: Math.round((g.suma / g.n) * 100) / 100 }))
    .sort((a, b) => b.engPromedio - a.engPromedio);
}

export function construirResumen(posts, clasificacion) {
  if (posts.length < 6 || clasificacion.length !== posts.length) return "";
  const lineas = [];
  for (const dim of DIMENSIONES) {
    const g = agruparPorDimension(posts, clasificacion, dim);
    if (g.length < 2) continue;
    const mejor = g[0], peor = g[g.length - 1];
    lineas.push(`- ${dim.toUpperCase()}: "${mejor.valor}" promedia ${mejor.engPromedio}% de engagement (${mejor.n} posts) vs "${peor.valor}" con ${peor.engPromedio}% (${peor.n} posts).`);
  }
  if (lineas.length === 0) return "";
  return [
    `PATRONES REALES DE TUS POSTS (LinkedIn vía Buffer, ${posts.length} posts con datos):`,
    ...lineas,
    `Escribí el contenido de HOY reforzando los patrones que más rinden y evitando los que menos. Son datos reales: no inventes otros.`,
  ].join("\n");
}
```

Y en `insightsDelDia`, entre traer los posts y construir el resumen, agregar la clasificación:

```js
const PROMPT_CLASIFICACION = (posts) => [
  `Clasificá cada uno de estos ${posts.length} posts de LinkedIn. No los evalúes, solo clasificalos.`,
  `Devolvé SOLO un array JSON de ${posts.length} objetos, en el mismo orden, con:`,
  `{"apertura":"escena"|"tesis"|"pregunta"|"dato"|"anecdota","estructura":"confesion"|"concesion_vuelta"|"escena_campo"|"contraste"|"autopsia"|"mito_realidad"|"carta_director"|"numero_duele"|"otra","tema":"<2-4 palabras>","cta":"ninguno"|"blando"|"comentario"|"link"|"reunion","tiene_giro":true|false}`,
  posts.map((p, i) => `${i + 1}. ${p.texto.slice(0, 600)}`).join("\n\n"),
].join("\n\n");

// dentro de insightsDelDia, después de traerPostsBuffer:
let clasificacion = [];
try {
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: [{ type: "text", text: "Clasificás contenido de LinkedIn. Devolvés solo JSON." }],
    messages: [{ role: "user", content: PROMPT_CLASIFICACION(posts) }],
  });
  const txt = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  clasificacion = JSON.parse(txt.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
} catch (e) {
  console.error("  · clasificacion (falla suave):", e.message);
}
const resumen = construirResumen(posts, clasificacion);
```

Guardar en `marketing_insights`: `{ fecha, resumen, data: { posts: posts.slice(0, 20), clasificacion }, generated_at }`.

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
node --test marketing-worker/insights.test.mjs
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Probar contra Buffer real**

La prueba en vivo se hace con el worker completo en Task 12 (Step 2): al arrancar, tiene que loguear `· insights del dia cacheados (N posts de Buffer)`. Después, verificar que el resumen guardado habla de patrones:

```sql
select fecha, left(resumen, 400) from marketing_insights order by fecha desc limit 1;
```

Esperado: líneas del tipo `- APERTURA: "escena" promedia X% ... vs "tesis" con Y%`. Si `resumen` quedó vacío, es que la clasificación falló (falla suave) — revisar el log `· clasificacion (falla suave)`.

- [ ] **Step 6: Commit (repo del worker)**

```bash
git add marketing-worker/insights.mjs marketing-worker/insights.test.mjs
git commit -m "feat(worker): insights por patrones en vez de ranking de hooks"
```

---

## Task 12: Prueba end-to-end y documentación

**Files:**
- Modify: `docs/interno/TECNICO-PRISMA.md`
- Modify: `docs/interno/marketing-handoff.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

- [ ] **Step 1: Correr la suite completa de la app**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Esperado: todo en verde.

- [ ] **Step 2: Levantar la app y generar tres piezas reales**

```bash
npm run dev
```

Entrar a `/admin-vakdor/marketing`, crear tres ideas (una TOFU, una MOFU, una BOFU) y moverlas a "En proceso" con el worker corriendo (`marketing-worker/iniciar-worker.bat`).

- [ ] **Step 3: Verificar las tres piezas contra la lista del spec**

Sobre las tres piezas generadas, confirmar una por una:

- [ ] Ninguna abre con una tesis abstracta: las tres abren con una escena.
- [ ] Las tres usan **estructuras distintas** (mirar `marketing_ideas.receta.estructura`).
- [ ] Las tres usan **escenas distintas** (mirar `receta.escenas`).
- [ ] El link `vakdor.com/demostracion` aparece **solo** en la pieza BOFU y **solo** en su primer comentario, nunca en el cuerpo.
- [ ] Los tres primeros comentarios son de **tipos distintos** y no todos piden algo.
- [ ] Ningún hook se parece a los últimos 15 publicados.
- [ ] Ninguna pieza tiene emojis ni links en el cuerpo.

Consulta para verificar las recetas:

```sql
select titulo, funnel, receta->>'estructura' as estructura,
       receta->>'comentario_tipo' as comentario, receta->'revision' as revision
from marketing_ideas order by created_at desc limit 3;
```

- [ ] **Step 4: Comparar contra el motor viejo**

Poner lado a lado una pieza vieja (de antes de esta rama) y la nueva de la misma etapa. Registrar en el handoff qué mejoró y qué no.

- [ ] **Step 5: Actualizar la documentación**

En `docs/interno/TECNICO-PRISMA.md`, en la sección del módulo Marketing: modelo (`claude-sonnet-5`), tabla `marketing_recursos` con sus 4 tipos, columna `receta`, el flujo canon → estructura → escenas → escritura → revisión, y el CTA por etapa.

En `docs/interno/marketing-handoff.md`: cómo ampliar el banco de escenas (un `insert` en `marketing_recursos`), qué significa cada campo de la receta, y que `ANTHROPIC_API_KEY` tiene que estar en local, EasyPanel y Vercel.

- [ ] **Step 6: Commit**

```bash
git add docs/interno/TECNICO-PRISMA.md docs/interno/marketing-handoff.md
git commit -m "docs(marketing): motor de voz, banco de recursos y receta por pieza"
```

- [ ] **Step 7: Verificar `ANTHROPIC_API_KEY` en producción antes de pedir el merge**

- [ ] Está en el `.env` local (ya verificado: presente).
- [ ] Está en las variables del servicio del worker en EasyPanel.
- [ ] Está en Vercel **y se hizo redeploy** (si no, no aplica).

Recién con los tres tildados, pedir el OK a Leonardo para mergear a `main`.
