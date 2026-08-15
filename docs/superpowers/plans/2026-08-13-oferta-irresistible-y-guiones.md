# Oferta irresistible + guiones de video — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asesor cargue su forma real de trabajar una vez, obtenga sus 2 ofertas irresistibles (fórmula de Hormozi) y que todos sus anuncios —y sobre todo sus guiones de video para hablar a cámara— salgan con esa oferta, sus números reales y la estructura narrativa que elija.

**Arquitectura:** Una tabla nueva `advisor_operations` (una fila por usuario, RLS por `auth.uid()`), cuatro módulos puros en `lib/marketing-ia/` (campos, niveles, estructuras, contexto de prompt) que se testean solos, un endpoint que genera las 2 ofertas, y la inyección de un bloque de prompt en los dos endpoints de generación que ya existen. La UI es una pestaña nueva dentro de Marketing IA más ajustes en Crear Anuncio y en el Historial.

**Tech stack:** Next.js (App Router) · TypeScript · Supabase (Postgres + RLS) · Gemini vía `lib/gemini` (`prismaIA`) · react-hook-form + zod · shadcn/ui · Tailwind · vitest.

**Especificación:** `docs/superpowers/specs/2026-08-13-oferta-irresistible-y-guiones-design.md`

---

## Global Constraints

- **Nada se saca y nada se rompe.** Regla dura de Leonardo. Todo lo que hoy funciona tiene que seguir funcionando igual: el copy de tipo *post* sigue generando imagen, los borradores viejos del historial se siguen viendo, y el asesor que no cargó su forma de trabajar genera anuncios exactamente como hoy.
- **Rama:** `feat/oferta-irresistible-y-guiones` (ya creada, salió de `main`). No mergear ni pushear sin OK explícito de Leonardo.
- **Commits:** convención del repo, en español y sin acentos en el título (`feat(marketing): ...`, `fix(marketing): ...`). Todo commit termina con el trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Idioma de la UI:** español rioplatense (voseo), pensado para gente no técnica. Nada de jerga de marketing sin explicar.
- **Tests:** vitest ya barre `lib/**/*.test.ts` (ver `vitest.config.ts`). Correr un archivo suelto: `npx vitest run lib/marketing-ia/<archivo>.test.ts`. La suite completa es `npm test` (vitest + `node --test` para `lib/mapa`).
- **Migraciones:** el archivo en `supabase/migrations/` **no se aplica solo**. Se aplica con `node scratch/apply-sql.mjs <ruta.sql>` (Management API, usa `SUPABASE_PROJECT_REF` y `SUPABASE_API_KEY_MANAGEMENT` del `.env`).
- **Modelo de IA:** `prismaIA` de `@/lib/gemini`, y el costo se registra siempre con `tokensFromUsage` + `calculateCost({ model: "gemini-3.5-flash", ... })` + `updateAiTransactionCost`, igual que los endpoints que ya existen.
- **Créditos:** toda generación con IA consume crédito con `consumeAiCredits("marketing_ia", 1, "<descripción>")`, **después** de validar la entrada (nunca cobrar por un 400).
- **No inventar datos:** ningún prompt puede permitir cifras, plazos, testimonios o garantías que no vengan del formulario del asesor.
- **Nunca probar con la cuenta de un asesor real de Central.** Se usa la cuenta de director de Leonardo (credenciales en `.env`).

---

## Estructura de archivos

**Nuevos**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260813120000_advisor_operations.sql` | Tabla `advisor_operations` + RLS |
| `lib/marketing-ia/campos-operacion.ts` | Las preguntas del formulario (nombre, etiqueta, placeholder). Única fuente: la usan la UI **y** el prompt |
| `lib/marketing-ia/campos-operacion.test.ts` | Sanidad del catálogo de campos |
| `lib/marketing-ia/niveles.ts` | Mapa de nivel de consciencia (hoy duplicado en dos endpoints) |
| `lib/marketing-ia/niveles.test.ts` | Tests del mapa |
| `lib/marketing-ia/estructuras.ts` | Catálogo de las 6 estructuras + sugerencia + render para el prompt |
| `lib/marketing-ia/estructuras.test.ts` | Tests del catálogo y la sugerencia |
| `lib/marketing-ia/operacion-context.ts` | Bloque de prompt: oferta + datos duros + reglas |
| `lib/marketing-ia/operacion-context.test.ts` | Tests del bloque de prompt |
| `app/api/marketing-ia/generar-oferta/route.ts` | Genera/regenera las 2 ofertas |
| `components/marketing-ia/forma-trabajo-form.tsx` | Formulario (perfil + captación + venta) |
| `components/marketing-ia/ofertas-irresistibles.tsx` | Panel de las 2 ofertas: generar, editar, regenerar |

**Modificados**

| Archivo | Cambio |
|---|---|
| `types/marketing-ia.ts` | Tipos nuevos + `CopyContent` con bloques |
| `app/asesor/marketing-ia/page.tsx` | Pestaña "Mi Forma de Trabajar" |
| `app/director/marketing-ia/page.tsx` | Pestaña "Mi Forma de Trabajar" |
| `app/api/marketing-ia/generate-batch/route.ts` | Oferta + datos duros + estructura + nivel real del IPC |
| `app/api/marketing-ia/generate-copy/route.ts` | Oferta + datos duros + estructura + usa `niveles.ts` |
| `components/marketing-ia/copy-generator-flow.tsx` | Selector de estructura; video sin imágenes |
| `components/marketing-ia/marketing-history.tsx` | Render de bloques; 2 botones de copiar; video sin marco de imagen |

---

### Task 1: Tabla, tipos y catálogo de preguntas

**Files:**
- Create: `supabase/migrations/20260813120000_advisor_operations.sql`
- Create: `lib/marketing-ia/campos-operacion.ts`
- Test: `lib/marketing-ia/campos-operacion.test.ts`
- Modify: `types/marketing-ia.ts` (agregar al final, sin tocar lo existente salvo `CopyContent`)

**Interfaces:**
- Consumes: nada.
- Produces: tipos `PerfilOperacion`, `CaptacionOperacion`, `VentaOperacion`, `AdvisorOperation`, `BloqueGuion`, `EstructuraId`; constantes `CAMPOS_PERFIL`, `CAMPOS_CAPTACION`, `CAMPOS_VENTA` (`CampoOperacion[]`) y `operacionCompleta(op)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/marketing-ia/campos-operacion.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  CAMPOS_PERFIL,
  CAMPOS_CAPTACION,
  CAMPOS_VENTA,
  operacionCompleta,
} from "./campos-operacion"

describe("catálogo de campos de la forma de trabajar", () => {
  it("tiene las 6 preguntas de captación y las 5 de venta del documento de Hormozi", () => {
    // Captación: volumen + %ACM cuentan como 2 campos separados (la pregunta 1 se parte en dos)
    expect(CAMPOS_CAPTACION).toHaveLength(7)
    // Venta: rebaja + off-market cuentan como 2 campos separados (la pregunta 2 se parte en dos)
    expect(CAMPOS_VENTA).toHaveLength(6)
    expect(CAMPOS_PERFIL).toHaveLength(8)
  })

  it("no repite nombres de campo dentro de cada bloque", () => {
    for (const bloque of [CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA]) {
      const nombres = bloque.map((c) => c.name)
      expect(new Set(nombres).size).toBe(nombres.length)
    }
  })

  it("cada campo trae etiqueta y placeholder para que nadie vea un input mudo", () => {
    for (const campo of [...CAMPOS_PERFIL, ...CAMPOS_CAPTACION, ...CAMPOS_VENTA]) {
      expect(campo.label.length).toBeGreaterThan(5)
      expect(campo.placeholder.length).toBeGreaterThan(2)
    }
  })

  it("operacionCompleta exige captación y venta, pero nunca el perfil", () => {
    const lleno = (campos: { name: string }[]) =>
      Object.fromEntries(campos.map((c) => [c.name, "un valor real"]))

    expect(
      operacionCompleta({ perfil: {}, captacion: lleno(CAMPOS_CAPTACION), venta: lleno(CAMPOS_VENTA) })
    ).toBe(true)

    expect(
      operacionCompleta({ perfil: {}, captacion: lleno(CAMPOS_CAPTACION), venta: {} })
    ).toBe(false)

    const captacionCoja = { ...lleno(CAMPOS_CAPTACION), porcentaje_acm: " " }
    expect(
      operacionCompleta({ perfil: {}, captacion: captacionCoja, venta: lleno(CAMPOS_VENTA) })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/marketing-ia/campos-operacion.test.ts`
Expected: FAIL — `Failed to resolve import "./campos-operacion"`

- [ ] **Step 3: Agregar los tipos en `types/marketing-ia.ts`**

Agregar al final del archivo:

```ts
export type EstructuraId = 'variante_1' | 'variante_2' | 'aida' | 'pas' | 'bab' | 'storytelling'

// OJO: los tres van como `type` y no como `interface` a propósito. Una interface no tiene
// índice implícito, así que `Partial<PerfilOperacion>` NO es asignable a `Record<string, unknown>`
// y el recorrido genérico de campos de la Task 4 no compilaría. Con `type` sí lo es.
export type PerfilOperacion = {
  anios_experiencia: string;
  matricula: string;
  zona_dominio: string;
  especialidad: string;
  operaciones_cerradas: string;
  casos_reales: string;
  servicio_incluye: string;
  no_prometer: string;
}

export type CaptacionOperacion = {
  propiedades_vendidas_6m: string;
  porcentaje_acm: string;
  diferencial_confianza: string;
  compradores_activos: string;
  tiempo_entrega_acm: string;
  tiempo_primera_oferta: string;
  diferencial_esfuerzo: string;
}

export type VentaOperacion = {
  diferencial_confianza: string;
  rebaja_promedio: string;
  exclusivas_offmarket: string;
  tiempo_primera_seleccion: string;
  semanas_hasta_reserva: string;
  diferencial_esfuerzo: string;
}

export interface AdvisorOperation {
  id: string;
  user_id: string;
  perfil: Partial<PerfilOperacion>;
  captacion: Partial<CaptacionOperacion>;
  venta: Partial<VentaOperacion>;
  oferta_captacion: string | null;
  oferta_venta: string | null;
  oferta_captacion_editada: boolean;
  oferta_venta_editada: boolean;
  ofertas_generadas_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Un bloque de un guion de video ya generado (lo que el asesor lee a cámara). */
export interface BloqueGuion {
  id: string;
  titulo: string;
  texto: string;
  segundos: number;
  indicacion: string;
  por_que: string;
}
```

Y en la interface `CopyContent` que ya existe, hacer `cta` opcional y sumar los tres campos nuevos (los borradores viejos no los traen):

```ts
export interface CopyContent {
  hook: string;
  problema?: string;
  agitacion?: string;
  solucion?: string;
  desarrollo?: string;
  cta?: string;
  // Guiones nuevos con estructura elegible:
  estructura?: EstructuraId;
  duracion_estimada?: number;
  bloques?: BloqueGuion[];
}
```

- [ ] **Step 4: Escribir `lib/marketing-ia/campos-operacion.ts`**

```ts
import type { PerfilOperacion, CaptacionOperacion, VentaOperacion } from "@/types/marketing-ia"

export interface CampoOperacion {
  /** Clave dentro del jsonb. */
  name: string;
  /** La pregunta tal cual la lee el asesor. */
  label: string;
  /** Ejemplo dentro del input. */
  placeholder: string;
  /** Etiqueta corta para el prompt (sin signos de pregunta). */
  etiquetaPrompt: string;
  /** true = textarea, false = input de una línea. */
  multilinea: boolean;
}

export const CAMPOS_PERFIL: CampoOperacion[] = [
  { name: "anios_experiencia", label: "¿Cuántos años hace que trabajás en el rubro?", placeholder: "Ej: 8 años", etiquetaPrompt: "Años de experiencia", multilinea: false },
  { name: "matricula", label: "Matrícula o colegio (si corresponde)", placeholder: "Ej: CUCICBA 1234", etiquetaPrompt: "Matrícula", multilinea: false },
  { name: "zona_dominio", label: "¿En qué zona conocés cada cuadra?", placeholder: "Ej: Caballito, Flores y Almagro", etiquetaPrompt: "Zona que domina", multilinea: false },
  { name: "especialidad", label: "¿En qué te especializás?", placeholder: "Ej: departamentos usados de 2 y 3 ambientes", etiquetaPrompt: "Especialidad", multilinea: false },
  { name: "operaciones_cerradas", label: "¿Cuántas operaciones cerraste en tu carrera?", placeholder: "Ej: más de 300", etiquetaPrompt: "Operaciones cerradas en su carrera", multilinea: false },
  { name: "casos_reales", label: "Contá 2 o 3 casos reales: zona, qué pasó y con qué resultado", placeholder: "Ej: Un PH en Flores que estaba publicado hacía 11 meses; lo republicamos con fotos nuevas y precio corregido, y se vendió en 34 días al 96% del pedido.", etiquetaPrompt: "Casos reales (prueba social)", multilinea: true },
  { name: "servicio_incluye", label: "¿Qué incluye tu servicio?", placeholder: "Ej: fotos y video profesionales, ACM escrito, publicación en 6 portales, visitas acompañadas, negociación y acompañamiento hasta la escritura.", etiquetaPrompt: "Qué incluye el servicio", multilinea: true },
  { name: "no_prometer", label: "¿Qué NO se puede prometer nunca en tus anuncios?", placeholder: "Ej: no prometer un plazo exacto de venta ni un precio garantizado.", etiquetaPrompt: "PROHIBIDO PROMETER", multilinea: true },
]

export const CAMPOS_CAPTACION: CampoOperacion[] = [
  { name: "propiedades_vendidas_6m", label: "En los últimos 6 meses, ¿cuántas propiedades vendiste?", placeholder: "Ej: 14", etiquetaPrompt: "Propiedades vendidas en los últimos 6 meses", multilinea: false },
  { name: "porcentaje_acm", label: "¿A qué porcentaje promedio del valor de tu ACM se terminaron cerrando?", placeholder: "Ej: 96% del valor del ACM", etiquetaPrompt: "Porcentaje promedio del ACM al que cierra", multilinea: false },
  { name: "diferencial_confianza", label: "¿Qué herramienta o proceso exclusivo usás para que el propietario confíe en tu tasación y tu estrategia?", placeholder: "Ej: le entrego un ACM escrito con los comparables reales de su zona y le muestro las fotos de cada uno.", etiquetaPrompt: "Diferencial de confianza (tasación y estrategia)", multilinea: true },
  { name: "compradores_activos", label: "¿Cuántos compradores activos tenés hoy buscando en tu base de datos?", placeholder: "Ej: 240 compradores activos", etiquetaPrompt: "Compradores activos en su base", multilinea: false },
  { name: "tiempo_entrega_acm", label: "Desde que visitás la propiedad, ¿en cuánto tiempo entregás el ACM completo y el plan de acción?", placeholder: "Ej: 48 horas", etiquetaPrompt: "Tiempo de entrega del ACM y el plan", multilinea: false },
  { name: "tiempo_primera_oferta", label: "Desde que la propiedad sale al mercado, ¿cuánto tardás en conseguir la primera reserva u oferta formal?", placeholder: "Ej: 21 días promedio", etiquetaPrompt: "Tiempo promedio hasta la primera oferta formal", multilinea: false },
  { name: "diferencial_esfuerzo", label: "¿Qué tareas, fricciones o costos te bancás vos al 100% para que el dueño no tenga que mover un dedo hasta la firma?", placeholder: "Ej: pago las fotos y el video, hago los trámites de planos y deudas, coordino y acompaño todas las visitas.", etiquetaPrompt: "Qué se banca el asesor para que el dueño no haga nada", multilinea: true },
]

export const CAMPOS_VENTA: CampoOperacion[] = [
  { name: "diferencial_confianza", label: "¿Qué hacés distinto para garantizarle al comprador que hace un negocio seguro y al precio correcto?", placeholder: "Ej: le muestro el ACM de la zona antes de que oferte, para que sepa si está pagando de más.", etiquetaPrompt: "Diferencial de confianza para el comprador", multilinea: true },
  { name: "rebaja_promedio", label: "¿Qué porcentaje de rebaja promedio conseguís negociar sobre el precio de lista?", placeholder: "Ej: 7% promedio", etiquetaPrompt: "Rebaja promedio negociada sobre el precio de lista", multilinea: false },
  { name: "exclusivas_offmarket", label: "¿Cuántas de tus propiedades son exclusivas u off-market?", placeholder: "Ej: 18 exclusivas, 5 off-market", etiquetaPrompt: "Propiedades exclusivas y off-market", multilinea: false },
  { name: "tiempo_primera_seleccion", label: "Después de conocer lo que busca, ¿cuánto tardás en mandarle la primera selección de propiedades elegidas a mano?", placeholder: "Ej: 24 horas", etiquetaPrompt: "Tiempo hasta la primera selección curada", multilinea: false },
  { name: "semanas_hasta_reserva", label: "¿En cuántas semanas promedio tu comprador encuentra y reserva su propiedad?", placeholder: "Ej: 6 semanas", etiquetaPrompt: "Semanas promedio hasta la reserva", multilinea: false },
  { name: "diferencial_esfuerzo", label: "¿Qué dolores de cabeza burocráticos o logísticos le sacás de encima al comprador?", placeholder: "Ej: consigo los planos, verifico deudas y expensas, y coordino escribano y tasación.", etiquetaPrompt: "Trámites que le saca de encima al comprador", multilinea: true },
]

interface OperacionParcial {
  perfil: Record<string, unknown>;
  captacion: Record<string, unknown>;
  venta: Record<string, unknown>;
}

const bloqueCompleto = (valores: Record<string, unknown>, campos: CampoOperacion[]) =>
  campos.every((c) => typeof valores?.[c.name] === "string" && (valores[c.name] as string).trim().length >= 2)

/** Se pueden generar las ofertas cuando Captación y Venta están completos. El perfil nunca bloquea. */
export function operacionCompleta(op: OperacionParcial): boolean {
  return bloqueCompleto(op.captacion, CAMPOS_CAPTACION) && bloqueCompleto(op.venta, CAMPOS_VENTA)
}

/** Tipos derivados: si alguien agrega un campo al catálogo, TypeScript pide sumarlo a la interface. */
export type ClavePerfil = keyof PerfilOperacion
export type ClaveCaptacion = keyof CaptacionOperacion
export type ClaveVenta = keyof VentaOperacion
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/marketing-ia/campos-operacion.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Escribir la migración**

Crear `supabase/migrations/20260813120000_advisor_operations.sql`:

```sql
-- Forma de trabajar del asesor (formulario de oferta irresistible, fórmula de Hormozi).
-- Una fila por usuario. Alimenta los prompts de Marketing IA.
CREATE TABLE IF NOT EXISTS public.advisor_operations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  captacion                JSONB NOT NULL DEFAULT '{}'::jsonb,
  venta                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  oferta_captacion         TEXT,
  oferta_venta             TEXT,
  oferta_captacion_editada BOOLEAN NOT NULL DEFAULT false,
  oferta_venta_editada     BOOLEAN NOT NULL DEFAULT false,
  ofertas_generadas_at     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.advisor_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own operation" ON public.advisor_operations;
CREATE POLICY "Users manage own operation" ON public.advisor_operations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 7: Aplicar la migración y verificar que la tabla existe**

Run: `node scratch/apply-sql.mjs supabase/migrations/20260813120000_advisor_operations.sql`
Expected: `HTTP 201` (o 200)

Verificar con un `.sql` temporal en `scratch/` y el mismo script:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'advisor_operations' ORDER BY ordinal_position;
```

Expected: aparecen las 12 columnas.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260813120000_advisor_operations.sql lib/marketing-ia/campos-operacion.ts lib/marketing-ia/campos-operacion.test.ts types/marketing-ia.ts
git commit -m "feat(marketing): tabla advisor_operations y catalogo de preguntas de la forma de trabajar" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Nivel de consciencia en un solo lugar

Hoy el mapa de niveles está escrito a mano en `generate-copy/route.ts:185-191` y `generate-batch` directamente lo ignora (siempre asume nivel 1, `generate-batch/route.ts:26`). Se extrae a un módulo.

**Files:**
- Create: `lib/marketing-ia/niveles.ts`
- Test: `lib/marketing-ia/niveles.test.ts`

**Interfaces:**
- Consumes: `ConsciousnessLevel` de `@/types/marketing-ia`.
- Produces: `NIVEL_DESCRIPCION: Record<ConsciousnessLevel, string>`, `nivelDesdeIpc(flowData: unknown): ConsciousnessLevel`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/marketing-ia/niveles.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { nivelDesdeIpc, NIVEL_DESCRIPCION } from "./niveles"

describe("nivel de consciencia del IPC", () => {
  it("traduce las 5 etiquetas que guarda el formulario de IPC", () => {
    expect(nivelDesdeIpc({ nivel_conciencia: "Inconsciente" })).toBe(0)
    expect(nivelDesdeIpc({ nivel_conciencia: "Consciente del Problema" })).toBe(1)
    expect(nivelDesdeIpc({ nivel_conciencia: "Consciente de la Solución" })).toBe(2)
    expect(nivelDesdeIpc({ nivel_conciencia: "Consciente del Producto" })).toBe(3)
    expect(nivelDesdeIpc({ nivel_conciencia: "Muy Consciente" })).toBe(4)
  })

  it("cae en 1 cuando el perfil no lo trae o trae cualquier cosa", () => {
    expect(nivelDesdeIpc({})).toBe(1)
    expect(nivelDesdeIpc(null)).toBe(1)
    expect(nivelDesdeIpc({ nivel_conciencia: "cualquier cosa" })).toBe(1)
  })

  it("tolera espacios de más", () => {
    expect(nivelDesdeIpc({ nivel_conciencia: "  Muy Consciente " })).toBe(4)
  })

  it("tiene una descripción para cada uno de los 5 niveles", () => {
    for (const nivel of [0, 1, 2, 3, 4] as const) {
      expect(NIVEL_DESCRIPCION[nivel].length).toBeGreaterThan(20)
    }
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/marketing-ia/niveles.test.ts`
Expected: FAIL — no existe `./niveles`

- [ ] **Step 3: Escribir `lib/marketing-ia/niveles.ts`**

```ts
import type { ConsciousnessLevel } from "@/types/marketing-ia"

/** Etiquetas tal cual las guarda el formulario de IPC en flow_data.nivel_conciencia. */
const ETIQUETA_A_NIVEL: Record<string, ConsciousnessLevel> = {
  "Inconsciente": 0,
  "Consciente del Problema": 1,
  "Consciente de la Solución": 2,
  "Consciente del Producto": 3,
  "Muy Consciente": 4,
}

export const NIVEL_DESCRIPCION: Record<ConsciousnessLevel, string> = {
  0: "El público no sabe que tiene el problema. Creá el problema en su mente antes de hablar de la solución.",
  1: "Siente que algo no funciona pero no identifica la causa. Ayudalo a ponerle nombre al dolor.",
  2: "Sabe que hay soluciones pero no nos conoce. Posicioná nuestra solución como la correcta.",
  3: "Nos conoce pero tiene dudas. Trabajá objeciones y usá prueba social.",
  4: "Está casi listo. Sé directo. Oferta clara. CTA fuerte.",
}

/** Nivel de consciencia del IPC. Si el perfil no lo trae, asume 1 (el default histórico del módulo). */
export function nivelDesdeIpc(flowData: unknown): ConsciousnessLevel {
  const etiqueta = (flowData as { nivel_conciencia?: unknown } | null)?.nivel_conciencia
  if (typeof etiqueta !== "string") return 1
  return ETIQUETA_A_NIVEL[etiqueta.trim()] ?? 1
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/marketing-ia/niveles.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/marketing-ia/niveles.ts lib/marketing-ia/niveles.test.ts
git commit -m "feat(marketing): modulo unico para el nivel de consciencia del IPC" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Catálogo de estructuras de guion

**Files:**
- Create: `lib/marketing-ia/estructuras.ts`
- Test: `lib/marketing-ia/estructuras.test.ts`

**Interfaces:**
- Consumes: `EstructuraId`, `ConsciousnessLevel` de `@/types/marketing-ia`.
- Produces: `ESTRUCTURAS: Record<EstructuraId, EstructuraGuion>`, `ESTRUCTURAS_LISTA: EstructuraGuion[]`, `sugerirEstructura(nivel)`, `resolverEstructura(pedida, nivel)`, `esquemaJsonGuion(estructura)`, `guiaBloquesParaPrompt(estructura)`. Tipos `BloqueEstructura` y `EstructuraGuion`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/marketing-ia/estructuras.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  ESTRUCTURAS,
  ESTRUCTURAS_LISTA,
  sugerirEstructura,
  resolverEstructura,
  esquemaJsonGuion,
  guiaBloquesParaPrompt,
} from "./estructuras"

describe("catálogo de estructuras", () => {
  it("tiene las 6 estructuras pedidas", () => {
    expect(ESTRUCTURAS_LISTA.map((e) => e.id).sort()).toEqual(
      ["aida", "bab", "pas", "storytelling", "variante_1", "variante_2"]
    )
  })

  it("todas cierran con un bloque de CTA (un anuncio sin llamada a la acción no convierte)", () => {
    for (const e of ESTRUCTURAS_LISTA) {
      expect(e.bloques.at(-1)!.id).toBe("cta")
    }
  })

  it("todas tienen al menos 3 bloques, con título y guía", () => {
    for (const e of ESTRUCTURAS_LISTA) {
      expect(e.bloques.length).toBeGreaterThanOrEqual(3)
      for (const b of e.bloques) {
        expect(b.titulo.length).toBeGreaterThan(2)
        expect(b.guia.length).toBeGreaterThan(15)
      }
    }
  })

  it("la variante 1 y la variante 2 arrancan con la oferta", () => {
    expect(ESTRUCTURAS.variante_1.bloques.map((b) => b.id))
      .toEqual(["oferta", "problema", "solucion", "prueba_social", "cta"])
    expect(ESTRUCTURAS.variante_2.bloques.map((b) => b.id))
      .toEqual(["oferta", "prueba_social", "problema", "solucion", "cta"])
  })
})

describe("sugerirEstructura", () => {
  it("es determinista para los 5 niveles de consciencia", () => {
    expect(sugerirEstructura(0)).toBe("pas")
    expect(sugerirEstructura(1)).toBe("bab")
    expect(sugerirEstructura(2)).toBe("aida")
    expect(sugerirEstructura(3)).toBe("variante_2")
    expect(sugerirEstructura(4)).toBe("variante_1")
  })

  it("nunca sugiere storytelling (necesita un caso real cargado, va solo a mano)", () => {
    for (const nivel of [0, 1, 2, 3, 4] as const) {
      expect(sugerirEstructura(nivel)).not.toBe("storytelling")
    }
  })
})

describe("resolverEstructura", () => {
  it("respeta la que eligió el asesor", () => {
    expect(resolverEstructura("storytelling", 0)).toBe("storytelling")
  })

  it("sugiere cuando viene 'sugerida', vacío o basura", () => {
    expect(resolverEstructura("sugerida", 4)).toBe("variante_1")
    expect(resolverEstructura(undefined, 4)).toBe("variante_1")
    expect(resolverEstructura("no_existe" as never, 0)).toBe("pas")
  })
})

describe("render para el prompt", () => {
  it("el esquema JSON nombra cada bloque de la estructura", () => {
    const esquema = esquemaJsonGuion(ESTRUCTURAS.pas)
    for (const b of ESTRUCTURAS.pas.bloques) {
      expect(esquema).toContain(`"id": "${b.id}"`)
      expect(esquema).toContain(`"titulo": "${b.titulo}"`)
    }
    expect(esquema).toContain("segundos")
    expect(esquema).toContain("por_que")
  })

  it("la guía de bloques va numerada y en orden", () => {
    const guia = guiaBloquesParaPrompt(ESTRUCTURAS.aida)
    expect(guia.indexOf("1.")).toBeLessThan(guia.indexOf("2."))
    expect(guia).toContain(ESTRUCTURAS.aida.bloques[0].guia)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/marketing-ia/estructuras.test.ts`
Expected: FAIL — no existe `./estructuras`

- [ ] **Step 3: Escribir `lib/marketing-ia/estructuras.ts`**

```ts
import type { ConsciousnessLevel, EstructuraId } from "@/types/marketing-ia"

export interface BloqueEstructura {
  id: string;
  titulo: string;
  /** Qué tiene que lograr este bloque. Va literal al prompt. */
  guia: string;
}

export interface EstructuraGuion {
  id: EstructuraId;
  label: string;
  descripcion: string;
  /** Ayuda para el asesor en el selector. */
  cuando_usarla: string;
  bloques: BloqueEstructura[];
}

const CTA: BloqueEstructura = {
  id: "cta",
  titulo: "CTA",
  guia: "Cerrá con una sola acción concreta y fácil (escribir, mandar la dirección, pedir la tasación). Una sola, no tres.",
}

export const ESTRUCTURAS: Record<EstructuraId, EstructuraGuion> = {
  variante_1: {
    id: "variante_1",
    label: "Variante 1 — La oferta primero",
    descripcion: "Oferta · Problema · Solución · Prueba social · CTA",
    cuando_usarla: "Cuando el que mira ya sabe lo que necesita: abrís con lo que le ofrecés y filtrás rápido.",
    bloques: [
      { id: "oferta", titulo: "Oferta", guia: "Abrí con la oferta irresistible del asesor, dicha en una frase concreta y creíble. Sin vueltas ni presentación." },
      { id: "problema", titulo: "Problema", guia: "Nombrá el problema real que hoy tiene esa persona, con las palabras que usaría ella." },
      { id: "solucion", titulo: "Solución", guia: "Explicá cómo trabaja el asesor para resolverlo, apoyándote en sus datos duros reales." },
      { id: "prueba_social", titulo: "Prueba social", guia: "Traé un caso real o un número verificado del asesor que demuestre que ya lo hizo antes." },
      CTA,
    ],
  },
  variante_2: {
    id: "variante_2",
    label: "Variante 2 — Oferta y prueba social",
    descripcion: "Oferta · Prueba social · Problema · Solución · CTA",
    cuando_usarla: "Cuando la gente ya te conoce pero duda: la prueba arriba mata la desconfianza antes de que aparezca.",
    bloques: [
      { id: "oferta", titulo: "Oferta", guia: "Abrí con la oferta irresistible del asesor en una frase concreta y creíble." },
      { id: "prueba_social", titulo: "Prueba social", guia: "Respaldá esa oferta enseguida con un caso real o un número verificado del asesor." },
      { id: "problema", titulo: "Problema", guia: "Recién ahora nombrá el problema que sufre hoy esa persona." },
      { id: "solucion", titulo: "Solución", guia: "Mostrá el proceso del asesor que lo resuelve, con sus tiempos y sus datos reales." },
      CTA,
    ],
  },
  aida: {
    id: "aida",
    label: "AIDA — Atención, Interés, Deseo, Acción",
    descripcion: "Atención · Interés · Deseo · Acción",
    cuando_usarla: "El clásico para público que sabe que hay soluciones pero todavía no eligió con quién.",
    bloques: [
      { id: "atencion", titulo: "Atención", guia: "Frená el scroll con una afirmación concreta y verificable, nunca con una pregunta genérica." },
      { id: "interes", titulo: "Interés", guia: "Contá algo que esa persona no sabía y que le cambia la forma de ver su situación." },
      { id: "deseo", titulo: "Deseo", guia: "Pintá el resultado concreto que puede conseguir, usando la oferta y los números reales del asesor." },
      { ...CTA, titulo: "Acción (CTA)" },
    ],
  },
  pas: {
    id: "pas",
    label: "PAS — Problema, Agitación, Solución",
    descripcion: "Problema · Agitación · Solución · CTA",
    cuando_usarla: "Cuando la persona todavía no se dio cuenta del problema: hay que mostrárselo primero.",
    bloques: [
      { id: "problema", titulo: "Problema", guia: "Poné el dedo en la llaga con una situación que esa persona reconozca al toque." },
      { id: "agitacion", titulo: "Agitación", guia: "Mostrá qué le cuesta seguir así (plata, tiempo, oportunidades) sin dramatizar ni mentir." },
      { id: "solucion", titulo: "Solución", guia: "Presentá la oferta del asesor como la salida, sostenida en sus datos duros reales." },
      CTA,
    ],
  },
  bab: {
    id: "bab",
    label: "Antes – Después – Puente",
    descripcion: "Antes · Después · Puente · CTA",
    cuando_usarla: "Cuando ya siente el dolor y lo que necesita es ver que del otro lado hay algo mejor.",
    bloques: [
      { id: "antes", titulo: "Antes", guia: "Describí la situación de hoy, concreta y sin adornos." },
      { id: "despues", titulo: "Después", guia: "Describí cómo se vive el día después de resolverlo, con un resultado medible." },
      { id: "puente", titulo: "Puente", guia: "El puente entre las dos escenas es la oferta y el proceso real del asesor." },
      CTA,
    ],
  },
  storytelling: {
    id: "storytelling",
    label: "Caso real / Storytelling",
    descripcion: "Situación · Conflicto · Qué hicimos · Resultado · CTA",
    cuando_usarla: "Cuando tenés un caso real cargado: es el formato que más confianza genera a cámara.",
    bloques: [
      { id: "situacion", titulo: "Situación", guia: "Presentá el caso real del asesor: quién era, qué propiedad, en qué zona." },
      { id: "conflicto", titulo: "Conflicto", guia: "Contá qué estaba saliendo mal y qué había intentado antes sin éxito." },
      { id: "que_hicimos", titulo: "Qué hicimos", guia: "Contá el proceso concreto que aplicó el asesor, paso por paso, en criollo." },
      { id: "resultado", titulo: "Resultado", guia: "Cerrá el caso con el resultado real y medible. Nunca inventes el número." },
      CTA,
    ],
  },
}

export const ESTRUCTURAS_LISTA: EstructuraGuion[] = Object.values(ESTRUCTURAS)

/**
 * Estructura sugerida según el nivel de consciencia del IPC.
 * storytelling queda afuera a propósito: depende de que el asesor haya cargado un caso real.
 */
export function sugerirEstructura(nivel: ConsciousnessLevel): EstructuraId {
  const porNivel: Record<ConsciousnessLevel, EstructuraId> = {
    0: "pas",          // no sabe que tiene el problema: hay que crearlo
    1: "bab",          // ya siente el dolor: mostrarle el después
    2: "aida",         // sabe que hay soluciones: posicionar la nuestra
    3: "variante_2",   // nos conoce y duda: oferta + prueba social arriba
    4: "variante_1",   // está listo: oferta directa y CTA
  }
  return porNivel[nivel]
}

export function resolverEstructura(
  pedida: EstructuraId | "sugerida" | undefined | null,
  nivel: ConsciousnessLevel
): EstructuraId {
  if (pedida && pedida !== "sugerida" && pedida in ESTRUCTURAS) return pedida as EstructuraId
  return sugerirEstructura(nivel)
}

/** Lista numerada de los bloques, para explicarle la estructura al modelo. */
export function guiaBloquesParaPrompt(estructura: EstructuraGuion): string {
  return estructura.bloques
    .map((b, i) => `${i + 1}. ${b.titulo} — ${b.guia}`)
    .join("\n")
}

/** Esqueleto exacto del JSON que tiene que devolver el modelo para esta estructura. */
export function esquemaJsonGuion(estructura: EstructuraGuion): string {
  const bloques = estructura.bloques
    .map(
      (b) => `      {
        "id": "${b.id}",
        "titulo": "${b.titulo}",
        "texto": "lo que el asesor dice a camara en este bloque",
        "segundos": 8,
        "indicacion": "como decirlo: tono, ritmo, gesto",
        "por_que": "por que este bloque va aca (para que el asesor aprenda la formula)"
      }`
    )
    .join(",\n")
  return `{
    "hook": "la frase de los primeros 3 segundos",
    "bloques": [
${bloques}
    ]
  }`
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/marketing-ia/estructuras.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/marketing-ia/estructuras.ts lib/marketing-ia/estructuras.test.ts
git commit -m "feat(marketing): catalogo de las 6 estructuras de guion con sugerencia por nivel" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Bloque de prompt con la oferta y los datos duros

**Files:**
- Create: `lib/marketing-ia/operacion-context.ts`
- Test: `lib/marketing-ia/operacion-context.test.ts`

**Interfaces:**
- Consumes: `CAMPOS_PERFIL`, `CAMPOS_CAPTACION`, `CAMPOS_VENTA` de `./campos-operacion`; tipo `AdvisorOperation`.
- Produces: `buildOperacionDirective(op: AdvisorOperation | null | undefined, tipoIpc: 'captar' | 'vender'): string`.

Espejo de `lib/marketing-ia/property-context.ts`, que ya hace lo mismo con la propiedad de Tokko.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/marketing-ia/operacion-context.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildOperacionDirective } from "./operacion-context"
import type { AdvisorOperation } from "@/types/marketing-ia"

const base: AdvisorOperation = {
  id: "op-1",
  user_id: "user-1",
  perfil: {
    anios_experiencia: "8 años",
    casos_reales: "Un PH en Flores parado 11 meses, vendido en 34 dias",
    no_prometer: "Nunca prometer un plazo exacto de venta",
    matricula: "",
    zona_dominio: "",
    especialidad: "",
    operaciones_cerradas: "",
    servicio_incluye: "",
  },
  captacion: {
    propiedades_vendidas_6m: "14",
    porcentaje_acm: "96% del ACM",
    diferencial_confianza: "ACM escrito con comparables reales",
    compradores_activos: "240 compradores",
    tiempo_entrega_acm: "48 horas",
    tiempo_primera_oferta: "21 dias",
    diferencial_esfuerzo: "Pago las fotos y hago los tramites",
  },
  venta: {
    diferencial_confianza: "Le muestro el ACM antes de ofertar",
    rebaja_promedio: "7% promedio",
    exclusivas_offmarket: "18 exclusivas",
    tiempo_primera_seleccion: "24 horas",
    semanas_hasta_reserva: "6 semanas",
    diferencial_esfuerzo: "Consigo planos y verifico deudas",
  },
  oferta_captacion: "Te entrego el ACM en 48 horas y no pagas nada hasta la firma.",
  oferta_venta: "Te mando la primera seleccion en 24 horas y negocio yo la rebaja.",
  oferta_captacion_editada: false,
  oferta_venta_editada: false,
  ofertas_generadas_at: "2026-08-13T10:00:00Z",
  created_at: "2026-08-13T10:00:00Z",
  updated_at: "2026-08-13T10:00:00Z",
}

describe("buildOperacionDirective", () => {
  it("devuelve vacío cuando el asesor no cargó nada (el prompt queda como hoy)", () => {
    expect(buildOperacionDirective(null, "captar")).toBe("")
    expect(buildOperacionDirective(undefined, "vender")).toBe("")
  })

  it("devuelve vacío cuando la fila existe pero está toda vacía", () => {
    const vacia = {
      ...base,
      perfil: {}, captacion: {}, venta: {},
      oferta_captacion: null, oferta_venta: null,
    }
    expect(buildOperacionDirective(vacia, "captar")).toBe("")
  })

  it("con IPC de captar inyecta la oferta de captación y NO la de venta", () => {
    const out = buildOperacionDirective(base, "captar")
    expect(out).toContain("Te entrego el ACM en 48 horas")
    expect(out).not.toContain("Te mando la primera seleccion")
  })

  it("con IPC de vender inyecta la oferta de venta y NO la de captación", () => {
    const out = buildOperacionDirective(base, "vender")
    expect(out).toContain("Te mando la primera seleccion")
    expect(out).not.toContain("Te entrego el ACM en 48 horas")
  })

  it("trae los datos duros del bloque que corresponde, y no los del otro", () => {
    const out = buildOperacionDirective(base, "captar")
    expect(out).toContain("96% del ACM")
    expect(out).toContain("240 compradores")
    expect(out).not.toContain("7% promedio")
  })

  it("suma el perfil profesional y omite los campos vacíos", () => {
    const out = buildOperacionDirective(base, "captar")
    expect(out).toContain("8 años")
    expect(out).toContain("Un PH en Flores")
    expect(out).not.toContain("Matrícula")   // está vacía: no se lista
    expect(out).not.toContain("undefined")
  })

  it("siempre incluye la regla anti-invento y lo que está prohibido prometer", () => {
    for (const tipo of ["captar", "vender"] as const) {
      const out = buildOperacionDirective(base, tipo)
      expect(out).toContain("PROHIBIDO")
      expect(out).toContain("Nunca prometer un plazo exacto de venta")
    }
  })

  it("funciona con el formulario cargado aunque todavía no haya ofertas generadas", () => {
    const sinOfertas = { ...base, oferta_captacion: null, oferta_venta: null }
    const out = buildOperacionDirective(sinOfertas, "captar")
    expect(out).toContain("96% del ACM")
    expect(out).toContain("PROHIBIDO")
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/marketing-ia/operacion-context.test.ts`
Expected: FAIL — no existe `./operacion-context`

- [ ] **Step 3: Escribir `lib/marketing-ia/operacion-context.ts`**

```ts
import type { AdvisorOperation } from "@/types/marketing-ia"
import { CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA, type CampoOperacion } from "./campos-operacion"

const listar = (valores: Record<string, unknown>, campos: CampoOperacion[]): string[] =>
  campos
    .filter((c) => typeof valores?.[c.name] === "string" && (valores[c.name] as string).trim().length > 0)
    .map((c) => `- ${c.etiquetaPrompt}: ${(valores[c.name] as string).trim()}`)

/**
 * Bloque de prompt con la forma real de trabajar del asesor.
 * Devuelve "" si no hay nada cargado: así el prompt queda idéntico al de siempre.
 */
export function buildOperacionDirective(
  op: AdvisorOperation | null | undefined,
  tipoIpc: "captar" | "vender"
): string {
  if (!op) return ""

  const esCaptacion = tipoIpc === "captar"
  const oferta = (esCaptacion ? op.oferta_captacion : op.oferta_venta)?.trim() || ""
  const datos = [
    ...listar(esCaptacion ? op.captacion ?? {} : op.venta ?? {}, esCaptacion ? CAMPOS_CAPTACION : CAMPOS_VENTA),
    ...listar(op.perfil ?? {}, CAMPOS_PERFIL.filter((c) => c.name !== "no_prometer")),
  ]

  if (!oferta && datos.length === 0) return ""

  const noPrometer = op.perfil?.no_prometer?.trim()

  return `
FORMA REAL DE TRABAJAR DEL ASESOR (es lo que lo diferencia de cualquier otra inmobiliaria):
${oferta ? `\nOFERTA IRRESISTIBLE (columna vertebral del mensaje, tiene que estar sí o sí):\n${oferta}\n` : ""}
${datos.length ? `DATOS DUROS VERIFICADOS (la única fuente de números y pruebas):\n${datos.join("\n")}\n` : ""}
REGLAS SOBRE ESTOS DATOS:
- PROHIBIDO inventar cifras, plazos, porcentajes, testimonios, premios o garantías. Si un número no está en la lista de arriba, no existe y no se menciona.
- PROHIBIDO redondear o "mejorar" los números provistos.
- Usá los datos que hagan más fuerte el mensaje; no hace falta meterlos todos.${noPrometer ? `\n- PROHIBIDO prometer, insinuar o dar a entender lo siguiente: ${noPrometer}` : ""}`
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/marketing-ia/operacion-context.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Correr toda la suite para confirmar que nada se rompió**

Run: `npm test`
Expected: PASS (los tests que ya existían siguen pasando)

- [ ] **Step 6: Commit**

```bash
git add lib/marketing-ia/operacion-context.ts lib/marketing-ia/operacion-context.test.ts
git commit -m "feat(marketing): bloque de prompt con la oferta y los datos duros del asesor" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Endpoint que genera las 2 ofertas

**Files:**
- Create: `app/api/marketing-ia/generar-oferta/route.ts`

**Interfaces:**
- Consumes: `operacionCompleta`, `CAMPOS_*` de `@/lib/marketing-ia/campos-operacion`; `requireTenant`, `consumeAiCredits`, `updateAiTransactionCost`; `prismaIA`.
- Produces: `POST /api/marketing-ia/generar-oferta` con body `{ objetivo?: 'ambas' | 'captacion' | 'venta' }` → `200 { oferta_captacion, oferta_venta, ofertas_generadas_at }` · `400 { error }` si falta completar el formulario · `404` si no hay fila.

Este endpoint no tiene test automático (toca red, créditos y base): se verifica en la Task 10, en el navegador.

- [ ] **Step 1: Escribir el endpoint**

Crear `app/api/marketing-ia/generar-oferta/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";
import {
  CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA, operacionCompleta, type CampoOperacion,
} from "@/lib/marketing-ia/campos-operacion";

export const dynamic = "force-dynamic";

const bloqueDatos = (valores: Record<string, unknown>, campos: CampoOperacion[]): string =>
  campos
    .filter((c) => typeof valores?.[c.name] === "string" && (valores[c.name] as string).trim().length > 0)
    .map((c) => `- ${c.etiquetaPrompt}: ${(valores[c.name] as string).trim()}`)
    .join("\n");

const buildOfertaPrompt = (
  op: { perfil: Record<string, unknown>; captacion: Record<string, unknown>; venta: Record<string, unknown> },
  directive: string
): string => {
  const noPrometer = typeof op.perfil?.no_prometer === "string" ? op.perfil.no_prometer.trim() : "";
  return `Sos un experto en copywriting inmobiliario de alto nivel, especialista en la Fórmula de Valor de Alex Hormozi:
Valor = (Resultado Soñado x Probabilidad de Éxito) / (Retraso Temporal x Esfuerzo y Sacrificio).

Tu tarea es analizar los datos operativos REALES de un asesor inmobiliario argentino y escribir exactamente DOS ofertas irresistibles:
1) CAPTACIÓN, para dueños que quieren vender su propiedad.
2) VENTA, para personas que quieren comprar.

PERFIL PROFESIONAL DEL ASESOR:
${bloqueDatos(op.perfil, CAMPOS_PERFIL.filter((c) => c.name !== "no_prometer")) || "- (no cargado)"}

DATOS DE CAPTACIÓN:
${bloqueDatos(op.captacion, CAMPOS_CAPTACION)}

DATOS DE VENTA:
${bloqueDatos(op.venta, CAMPOS_VENTA)}
${directive ? `\nDIRECTIVA CREATIVA DE LA AGENCIA (obligatorio respetarla): ${directive}` : ""}

REGLAS:
1. Cada oferta es un párrafo conciso, directo y de alto impacto (4 a 6 frases).
2. Incluí explícitamente los números y diferenciales de arriba: son los que elevan la Probabilidad de Éxito.
3. Redactá de forma que quede claro que el Esfuerzo y el Sacrificio los carga el ASESOR, no el cliente.
4. Bajá el Retraso Temporal: nombrá los tiempos concretos que el asesor declaró.
5. PROHIBIDO inventar cifras, plazos, testimonios, premios o garantías que no estén en los datos de arriba.${noPrometer ? `\n6. PROHIBIDO prometer, insinuar o dar a entender lo siguiente: ${noPrometer}` : ""}
7. Español rioplatense (voseo), profesional y sin marketinerías vacías. Nada de "tu hogar soñado".
8. No escribas títulos, saludos ni explicaciones: solo los dos textos.

Respondé ÚNICAMENTE en JSON válido con esta forma exacta:
{"oferta_captacion":"...","oferta_venta":"..."}`;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const objetivo: "ambas" | "captacion" | "venta" = body?.objetivo ?? "ambas";
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    const { data: op } = await supabase
      .from("advisor_operations")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!op) {
      return NextResponse.json(
        { error: "Todavía no cargaste tu forma de trabajar. Completá el formulario y guardalo." },
        { status: 404 }
      );
    }

    if (!operacionCompleta({ perfil: op.perfil ?? {}, captacion: op.captacion ?? {}, venta: op.venta ?? {} })) {
      return NextResponse.json(
        { error: "Completá los pasos de Captación y Venta antes de generar tus ofertas." },
        { status: 400 }
      );
    }

    // Directiva creativa de la agencia (la define el director en Configuración IA)
    let creativeDirective = "";
    if (agencyId) {
      const { data: agency } = await supabase
        .from("agencies").select("marketing_ai_config").eq("id", agencyId).single();
      creativeDirective = agency?.marketing_ai_config?.creative_directive ?? "";
    }

    // Recién acá se cobra: nunca cobrar por una validación fallida.
    const txId = await consumeAiCredits("marketing_ia", 1, "Generar ofertas irresistibles");

    const prompt = buildOfertaPrompt(
      { perfil: op.perfil ?? {}, captacion: op.captacion ?? {}, venta: op.venta ?? {} },
      creativeDirective
    );

    const result = await prismaIA.generateContent(prompt);
    const rawResponse = result.response.text();

    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens, outputTokens } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({ model: "gemini-3.5-flash", inputTokens, outputTokens });
      updateAiTransactionCost(txId, inputTokens, outputTokens, totalCostUSD);
    }

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    const clean = jsonMatch ? jsonMatch[0] : rawResponse.replace(/```json|```/g, "").trim();

    let ofertas: { oferta_captacion?: string; oferta_venta?: string };
    try {
      ofertas = JSON.parse(clean);
    } catch {
      console.error("[generar-oferta] JSON inválido:", clean);
      return NextResponse.json({ error: "La IA devolvió un formato inesperado. Probá de nuevo." }, { status: 500 });
    }

    const patch: Record<string, unknown> = { ofertas_generadas_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (objetivo !== "venta" && ofertas.oferta_captacion) {
      patch.oferta_captacion = ofertas.oferta_captacion;
      patch.oferta_captacion_editada = false;
    }
    if (objetivo !== "captacion" && ofertas.oferta_venta) {
      patch.oferta_venta = ofertas.oferta_venta;
      patch.oferta_venta_editada = false;
    }

    const { data: actualizado, error: updateError } = await supabase
      .from("advisor_operations")
      .update(patch)
      .eq("user_id", userId)
      .select("oferta_captacion, oferta_venta, ofertas_generadas_at, oferta_captacion_editada, oferta_venta_editada")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(actualizado);
  } catch (error: any) {
    console.error("Generar Oferta Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `app/api/marketing-ia/generar-oferta/route.ts` (si el proyecto ya tenía errores previos, no deben sumarse los de este archivo).

- [ ] **Step 3: Commit**

```bash
git add app/api/marketing-ia/generar-oferta/route.ts
git commit -m "feat(marketing): endpoint que genera las dos ofertas irresistibles" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Inyección en los dos generadores de copy

**Files:**
- Modify: `app/api/marketing-ia/generate-batch/route.ts`
- Modify: `app/api/marketing-ia/generate-copy/route.ts`

**Interfaces:**
- Consumes: `buildOperacionDirective`, `nivelDesdeIpc`, `NIVEL_DESCRIPCION`, `ESTRUCTURAS`, `resolverEstructura`, `esquemaJsonGuion`, `guiaBloquesParaPrompt`.
- Produces: los dos endpoints aceptan `estructura?: EstructuraId | 'sugerida'` en el body; para `copy_type: 'video'` devuelven `content` con `{ estructura, hook, duracion_estimada, bloques[] }`.

- [ ] **Step 1: `generate-batch` — imports y lecturas**

En `app/api/marketing-ia/generate-batch/route.ts`, agregar a los imports:

```ts
import { buildOperacionDirective } from "@/lib/marketing-ia/operacion-context";
import { nivelDesdeIpc, NIVEL_DESCRIPCION } from "@/lib/marketing-ia/niveles";
import { ESTRUCTURAS, resolverEstructura, esquemaJsonGuion, guiaBloquesParaPrompt } from "@/lib/marketing-ia/estructuras";
import type { AdvisorOperation, EstructuraId } from "@/types/marketing-ia";
```

Ampliar el payload:

```ts
interface GenerateBatchPayload {
  ipc_id: string;
  copy_type: CopyType;
  consciousness_level?: ConsciousnessLevel;
  extra_context?: string;
  propiedad_tokko_id?: number | null;
  estructura?: EstructuraId | "sugerida";
}
```

Dentro de `POST`, después de leer la agencia, sumar la lectura de la operación:

```ts
    const { data: operacion } = await supabase
      .from("advisor_operations")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
```

- [ ] **Step 2: `generate-batch` — usar el nivel real del IPC y la estructura**

Reemplazar el armado del prompt (hoy `const prompt = buildBatchCopyPrompt(ipc as any as IpcProfile, payload, propertyData, creativeDirective);`) por:

```ts
    const nivel = payload.consciousness_level ?? nivelDesdeIpc(ipc.flow_data);
    const estructuraId = resolverEstructura(payload.estructura, nivel);
    const operacionDirective = buildOperacionDirective(
      operacion as AdvisorOperation | null,
      ipc.tipo_ipc === "vender" ? "vender" : "captar"
    );

    const prompt = buildBatchCopyPrompt(
      ipc as any as IpcProfile,
      { ...payload, consciousness_level: nivel },
      propertyData,
      creativeDirective,
      operacionDirective,
      estructuraId
    );
```

- [ ] **Step 3: `generate-batch` — firma y cuerpo del prompt**

Cambiar la firma de `buildBatchCopyPrompt` a:

```ts
const buildBatchCopyPrompt = (
  ipc: IpcProfile,
  config: GenerateBatchPayload,
  property?: TokkoProperty | null,
  directive?: string,
  operacion?: string,
  estructuraId: EstructuraId = "pas"
): string => {
```

Reemplazar la línea que arma `nivelDesc` (el objeto literal `{0: "...", ...}[config.consciousness_level ?? 1]`) por:

```ts
  const nivelDesc = NIVEL_DESCRIPCION[config.consciousness_level ?? 1];
```

En la plantilla `base`, insertar el bloque de la operación justo después de `${ipcCtx}`:

```ts
${operacion ?? ""}
```

- [ ] **Step 4: `generate-batch` — salida por bloques cuando es video**

Reemplazar el `if (config.copy_type === 'video') { ... }` final por:

```ts
  if (config.copy_type === 'video') {
    const estructura = ESTRUCTURAS[estructuraId];
    return `${base}

ESTRUCTURA OBLIGATORIA DEL GUION — "${estructura.label}".
Las 3 variantes usan ESTA estructura, en este orden exacto de bloques:
${guiaBloquesParaPrompt(estructura)}

ESTO ES UN GUION PARA HABLAR A CÁMARA, no un texto para leer en pantalla:
- "texto" es lo que el asesor dice en voz alta, en criollo, listo para leer de corrido. Sin acotaciones adentro del texto.
- "segundos" es cuánto dura ese bloque dicho a ritmo normal (el guion completo tiene que dar entre 30 y 60 segundos).
- "indicacion" es cómo decirlo (tono, ritmo, gesto), en menos de 12 palabras.
- "por_que" explica al asesor por qué ese bloque va en ese lugar de la fórmula, en una frase.

Estructura exacta del ARRAY JSON (3 objetos, un angle distinto cada uno: "pas", "transformacion", "datos"):
[
  {
    "angle": "pas",
    "content": ${esquemaJsonGuion(estructura)}
  }
]
Devolvé los 3 objetos completos, no solo el ejemplo.`;
  } else {
```

(el `else` con el JSON de post queda **exactamente como está hoy**).

- [ ] **Step 5: `generate-batch` — sellar estructura y duración del lado del servidor**

Después de `const generatedBatch = JSON.parse(cleanResponse);` y su chequeo de array, antes del `return NextResponse.json(generatedBatch)`, agregar:

```ts
      // La estructura y la duración las pone el servidor: el modelo no suma bien y no tiene por qué elegir.
      if (payload.copy_type === "video") {
        for (const item of generatedBatch) {
          if (!item?.content) continue;
          item.content.estructura = estructuraId;
          const bloques = Array.isArray(item.content.bloques) ? item.content.bloques : [];
          item.content.duracion_estimada = bloques.reduce(
            (total: number, b: any) => total + (Number(b?.segundos) || 0), 0
          );
        }
      }
```

- [ ] **Step 6: `generate-copy` — los mismos cambios**

Este endpoint genera **una** pieza (no tres). Sigue vivo y hay que dejarlo coherente con el otro.

En `app/api/marketing-ia/generate-copy/route.ts`:

**6.1** Agregar los mismos imports de la Step 1 y sumar `estructura` a lo que se lee del body:

```ts
    const { ipc_id, copy_type, angle: reqAngle, consciousness_level: reqLevel, extra_context,
            propiedad_tokko_id: reqPropertyId, estructura: reqEstructura } = await req.json();
```

**6.2** Borrar el `levelMap` local (`route.ts:185-191`) y calcular el nivel con el módulo:

```ts
    const finalLevel = (reqLevel !== undefined ? reqLevel : nivelDesdeIpc(fd)) as ConsciousnessLevel;
```

Dentro de `buildCopyPrompt`, borrar el objeto literal de `nivelDesc` y usar:

```ts
  const nivelDesc = NIVEL_DESCRIPCION[config.consciousness_level];
```

**6.3** Leer la operación (igual que en la Step 1) y resolver la estructura:

```ts
    const { data: operacion } = await supabase
      .from("advisor_operations").select("*").eq("user_id", userId).maybeSingle();

    const estructuraId = resolverEstructura(reqEstructura, finalLevel);
    const operacionDirective = buildOperacionDirective(
      operacion as AdvisorOperation | null,
      ipc.tipo_ipc === "vender" ? "vender" : "captar"
    );
```

**6.4** Cambiar la firma de `buildCopyPrompt` y pasarle las dos cosas nuevas:

```ts
const buildCopyPrompt = (
  ipc: IpcProfile,
  config: CopyConfig,
  property?: TokkoProperty | null,
  directive?: string,
  operacion?: string,
  estructuraId: EstructuraId = "pas"
): string => {
```

```ts
    const prompt = buildCopyPrompt(
      ipc as any as IpcProfile,
      { copy_type, angle: finalAngle, consciousness_level: finalLevel, extra_context },
      propertyData, creativeDirective, operacionDirective, estructuraId
    );
```

Y dentro de la plantilla `base`, insertar `${operacion ?? ""}` justo después de `${ipcCtx}`.

**6.5** Reemplazar la rama de video del final por el formato con bloques:

```ts
  if (config.copy_type === 'video') {
    const estructura = ESTRUCTURAS[estructuraId];
    return `${base}

ESTRUCTURA OBLIGATORIA DEL GUION — "${estructura.label}", en este orden exacto de bloques:
${guiaBloquesParaPrompt(estructura)}

ESTO ES UN GUION PARA HABLAR A CÁMARA, no un texto para leer en pantalla:
- "texto" es lo que el asesor dice en voz alta, en criollo, listo para leer de corrido. Sin acotaciones adentro del texto.
- "segundos" es cuánto dura ese bloque dicho a ritmo normal (el guion completo tiene que dar entre 30 y 60 segundos).
- "indicacion" es cómo decirlo (tono, ritmo, gesto), en menos de 12 palabras.
- "por_que" explica al asesor por qué ese bloque va en ese lugar de la fórmula, en una frase.

Estructura exacta del JSON:
${esquemaJsonGuion(estructura)}`;
  } else {
```

(el `else` del post queda **exactamente como está hoy**).

**6.6** Antes del `return NextResponse.json(copyContent)`, sellar estructura y duración del lado del servidor:

```ts
      if (copy_type === "video") {
        copyContent.estructura = estructuraId;
        const bloques = Array.isArray(copyContent.bloques) ? copyContent.bloques : [];
        copyContent.duracion_estimada = bloques.reduce(
          (total: number, b: any) => total + (Number(b?.segundos) || 0), 0
        );
      }
```

- [ ] **Step 7: Verificar que compila y que la suite sigue verde**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores nuevos; todos los tests pasan.

- [ ] **Step 8: Commit**

```bash
git add app/api/marketing-ia/generate-batch/route.ts app/api/marketing-ia/generate-copy/route.ts
git commit -m "feat(marketing): los anuncios usan la oferta del asesor y la estructura de guion elegida" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Pestaña "Mi Forma de Trabajar"

**Files:**
- Create: `components/marketing-ia/forma-trabajo-form.tsx`
- Create: `components/marketing-ia/ofertas-irresistibles.tsx`
- Modify: `app/asesor/marketing-ia/page.tsx`
- Modify: `app/director/marketing-ia/page.tsx`

**Interfaces:**
- Consumes: `CAMPOS_PERFIL/CAPTACION/VENTA`, `operacionCompleta`; `POST /api/marketing-ia/generar-oferta`; tabla `advisor_operations` vía cliente de Supabase.
- Produces: componentes `<FormaTrabajoForm />` y `<OfertasIrresistibles operacion={...} onActualizar={...} />`.

- [ ] **Step 1: Escribir `components/marketing-ia/forma-trabajo-form.tsx`**

Formulario controlado, guardado por `upsert` con RLS (mismo patrón que `ipc-form.tsx`), 4 pasos con `MarketingIAStepper`.

```tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { MarketingIAStepper } from "./marketing-ia-stepper"
import { OfertasIrresistibles } from "./ofertas-irresistibles"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Loader2, Save, ArrowLeft, ArrowRight, Briefcase, AlertTriangle } from "lucide-react"
import {
  CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA, operacionCompleta, type CampoOperacion,
} from "@/lib/marketing-ia/campos-operacion"
import type { AdvisorOperation } from "@/types/marketing-ia"

const PASOS = ["Mi perfil", "Captación", "Venta", "Mis 2 ofertas"]

type Bloque = Record<string, string>

export function FormaTrabajoForm() {
  const [paso, setPaso] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [operacion, setOperacion] = useState<AdvisorOperation | null>(null)
  const [perfil, setPerfil] = useState<Bloque>({})
  const [captacion, setCaptacion] = useState<Bloque>({})
  const [venta, setVenta] = useState<Bloque>({})

  const supabase = createClient()

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from("advisor_operations").select("*").maybeSingle()
      if (data) {
        setOperacion(data as AdvisorOperation)
        setPerfil((data.perfil ?? {}) as Bloque)
        setCaptacion((data.captacion ?? {}) as Bloque)
        setVenta((data.venta ?? {}) as Bloque)
      }
      setCargando(false)
    }
    cargar()
  }, [])

  const guardar = async () => {
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Sesión vencida, volvé a entrar")

      const { data, error } = await supabase
        .from("advisor_operations")
        .upsert(
          { user_id: user.id, perfil, captacion, venta, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .select()
        .single()

      if (error) throw error
      setOperacion(data as AdvisorOperation)
      toast.success("Guardado")
    } catch (e: any) {
      toast.error("No se pudo guardar: " + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const campo = (c: CampoOperacion, valores: Bloque, setValores: (b: Bloque) => void) => (
    <div key={c.name} className="space-y-2">
      <Label className="text-sm font-bold leading-snug">{c.label}</Label>
      {c.multilinea ? (
        <Textarea
          value={valores[c.name] ?? ""}
          onChange={(e) => setValores({ ...valores, [c.name]: e.target.value })}
          placeholder={c.placeholder}
          className="min-h-[110px] resize-none bg-accent/5"
        />
      ) : (
        <Input
          value={valores[c.name] ?? ""}
          onChange={(e) => setValores({ ...valores, [c.name]: e.target.value })}
          placeholder={c.placeholder}
          className="h-12 bg-accent/5"
        />
      )}
    </div>
  )

  const avisoNumeros = (
    <div className="flex gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-sm text-muted-foreground">
        Estos números van a salir publicados en tus anuncios. <strong className="text-foreground">Cargá los reales.</strong>
      </p>
    </div>
  )

  if (cargando) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <MarketingIAStepper steps={PASOS} currentStep={paso} />

      <Card className="border-accent/10 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-accent" />
            {PASOS[paso]}
          </CardTitle>
          <CardDescription>
            {paso === 0 && "Quién sos y qué te respalda. Es opcional, pero es lo que le da autoridad y pruebas a tus anuncios."}
            {paso === 1 && "Cómo trabajás cuando captás una propiedad. Con esto se arma tu oferta para los dueños."}
            {paso === 2 && "Cómo trabajás cuando ayudás a alguien a comprar. Con esto se arma tu oferta para los compradores."}
            {paso === 3 && "Tus 2 ofertas irresistibles: las podés editar a mano y regenerar cuando cambien tus números."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {paso === 0 && CAMPOS_PERFIL.map((c) => campo(c, perfil, setPerfil))}
          {paso === 1 && <>{avisoNumeros}{CAMPOS_CAPTACION.map((c) => campo(c, captacion, setCaptacion))}</>}
          {paso === 2 && <>{avisoNumeros}{CAMPOS_VENTA.map((c) => campo(c, venta, setVenta))}</>}
          {paso === 3 && (
            <OfertasIrresistibles
              operacion={operacion}
              completo={operacionCompleta({ perfil, captacion, venta })}
              onActualizar={(parcial) => setOperacion((prev) => (prev ? { ...prev, ...parcial } : prev))}
            />
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row justify-between gap-3 bg-accent/5 pt-6">
          <Button variant="outline" disabled={paso === 0} onClick={() => setPaso(paso - 1)} className="w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
          </Button>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button variant="outline" onClick={guardar} disabled={guardando} className="flex-1 sm:flex-none">
              {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
            <Button
              className="flex-1 sm:flex-none bg-accent"
              disabled={paso === PASOS.length - 1}
              onClick={async () => { await guardar(); setPaso(paso + 1) }}
            >
              Siguiente <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
```

> Antes de escribirlo, abrir `components/marketing-ia/marketing-ia-stepper.tsx` y usar los nombres de props reales de ese componente. Si difieren de `steps`/`currentStep`, adaptar la llamada (no cambiar el stepper: lo usa el formulario de IPC).

- [ ] **Step 2: Escribir `components/marketing-ia/ofertas-irresistibles.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Loader2, Sparkles, Save, RefreshCw, Home, Tag } from "lucide-react"
import type { AdvisorOperation } from "@/types/marketing-ia"

interface Props {
  operacion: AdvisorOperation | null;
  completo: boolean;
  onActualizar: (parcial: Partial<AdvisorOperation>) => void;
}

export function OfertasIrresistibles({ operacion, completo, onActualizar }: Props) {
  const [captacion, setCaptacion] = useState(operacion?.oferta_captacion ?? "")
  const [venta, setVenta] = useState(operacion?.oferta_venta ?? "")
  const [generando, setGenerando] = useState<"ambas" | "captacion" | "venta" | null>(null)
  const [guardando, setGuardando] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    setCaptacion(operacion?.oferta_captacion ?? "")
    setVenta(operacion?.oferta_venta ?? "")
  }, [operacion?.oferta_captacion, operacion?.oferta_venta])

  const generar = async (objetivo: "ambas" | "captacion" | "venta") => {
    const editada = objetivo === "captacion" ? operacion?.oferta_captacion_editada
      : objetivo === "venta" ? operacion?.oferta_venta_editada
      : operacion?.oferta_captacion_editada || operacion?.oferta_venta_editada
    if (editada && !confirm("Editaste esta oferta a mano. Si la regenerás, se pierde tu versión. ¿Seguimos?")) return

    setGenerando(objetivo)
    try {
      const res = await fetch("/api/marketing-ia/generar-oferta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudieron generar las ofertas")
      onActualizar(data)
      window.dispatchEvent(new CustomEvent("prisma-refresh-credits"))
      toast.success("Listo. Revisá que cada número sea tuyo antes de usarlas.")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGenerando(null)
    }
  }

  const guardarEdicion = async () => {
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Sesión vencida, volvé a entrar")
      const patch = {
        oferta_captacion: captacion,
        oferta_venta: venta,
        oferta_captacion_editada: captacion !== (operacion?.oferta_captacion ?? "") || operacion?.oferta_captacion_editada,
        oferta_venta_editada: venta !== (operacion?.oferta_venta ?? "") || operacion?.oferta_venta_editada,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from("advisor_operations").update(patch).eq("user_id", user.id).select().single()
      if (error) throw error
      onActualizar(data as AdvisorOperation)
      toast.success("Ofertas guardadas")
    } catch (e: any) {
      toast.error("No se pudo guardar: " + e.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!completo) {
    return (
      <div className="p-8 text-center bg-muted/20 rounded-2xl border border-dashed">
        <p className="font-bold">Faltan datos</p>
        <p className="text-sm text-muted-foreground mt-2">
          Completá Captación y Venta (todos los campos) y guardá, para poder generar tus ofertas.
        </p>
      </div>
    )
  }

  const cuadro = (
    titulo: string,
    icono: React.ReactNode,
    valor: string,
    setValor: (v: string) => void,
    objetivo: "captacion" | "venta",
    editada?: boolean
  ) => (
    <Card className="border-accent/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">{icono}{titulo}</CardTitle>
        <div className="flex items-center gap-2">
          {editada && <Badge variant="outline" className="text-[10px]">editada a mano</Badge>}
          <Button variant="ghost" size="sm" onClick={() => generar(objetivo)} disabled={generando !== null}>
            {generando === objetivo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Todavía no la generaste."
          className="min-h-[160px] resize-none"
        />
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {operacion?.ofertas_generadas_at
            ? `Generadas el ${new Date(operacion.ofertas_generadas_at).toLocaleDateString("es-AR")}`
            : "Todavía no generaste tus ofertas."}
        </p>
        <Button onClick={() => generar("ambas")} disabled={generando !== null} className="bg-accent">
          {generando === "ambas" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Generar mis 2 ofertas <span className="ml-2 text-[10px] opacity-70">(1 crédito)</span>
        </Button>
      </div>

      {cuadro("Oferta de Captación (dueños)", <Home className="w-4 h-4 text-accent" />, captacion, setCaptacion, "captacion", operacion?.oferta_captacion_editada)}
      {cuadro("Oferta de Venta (compradores)", <Tag className="w-4 h-4 text-accent" />, venta, setVenta, "venta", operacion?.oferta_venta_editada)}

      <Button variant="outline" onClick={guardarEdicion} disabled={guardando} className="w-full">
        {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Guardar mis cambios
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Sumar la pestaña en las dos páginas**

En `app/asesor/marketing-ia/page.tsx`: importar `Briefcase` de lucide y `FormaTrabajoForm`, cambiar `grid-cols-4` por `grid-cols-5` en la `TabsList`, y agregar después del trigger `ipcs`:

```tsx
          <TabsTrigger value="forma-trabajo" className="text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <Briefcase className="w-4 h-4 mr-2" /> Mi Forma de Trabajar
          </TabsTrigger>
```

y el contenido:

```tsx
        <TabsContent value="forma-trabajo" className="mt-8">
          <FormaTrabajoForm />
        </TabsContent>
```

En `app/director/marketing-ia/page.tsx`: lo mismo, cambiando `md:grid-cols-5` por `md:grid-cols-6`.

- [ ] **Step 4: Probarlo en el navegador**

Run: `npm run dev`

Entrar con la cuenta de director del `.env`, ir a Marketing IA → Mi Forma de Trabajar, y verificar:
- se puede guardar el formulario a medias, salir de la pestaña y volver con los datos puestos;
- con Captación y Venta incompletos, el paso 4 muestra el cartel de "Faltan datos";
- completos, "Generar mis 2 ofertas" devuelve las dos y descuenta 1 crédito;
- editar una oferta a mano + "Guardar mis cambios" persiste, y regenerarla pide confirmación.

- [ ] **Step 5: Commit**

```bash
git add components/marketing-ia/forma-trabajo-form.tsx components/marketing-ia/ofertas-irresistibles.tsx app/asesor/marketing-ia/page.tsx app/director/marketing-ia/page.tsx
git commit -m "feat(marketing): pestana Mi Forma de Trabajar con las dos ofertas irresistibles" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Crear Anuncio — estructura y video sin imágenes

**Files:**
- Modify: `components/marketing-ia/copy-generator-flow.tsx`

**Interfaces:**
- Consumes: `ESTRUCTURAS_LISTA` de `@/lib/marketing-ia/estructuras`; endpoint `generate-batch` con `estructura`.
- Produces: nada para otras tasks.

- [ ] **Step 1: Estado y selector de estructura**

Agregar imports (`ESTRUCTURAS_LISTA`, tipo `EstructuraId`) y estado:

```tsx
  const [estructura, setEstructura] = useState<EstructuraId | 'sugerida'>('sugerida')
```

Debajo del bloque "2. Tipo de Copy", agregar (solo para video):

```tsx
            {copyType === 'video' && (
              <div className="space-y-3">
                <Label className="text-sm font-bold">3. Estructura del guión</Label>
                <Select value={estructura} onValueChange={(v: string) => setEstructura(v as EstructuraId | 'sugerida')}>
                  <SelectTrigger className="bg-accent/5 h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sugerida">Sugerida (la elegimos por vos según tu cliente ideal)</SelectItem>
                    {ESTRUCTURAS_LISTA.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {estructura === 'sugerida'
                    ? "Elegimos la estructura que mejor le calza al nivel de consciencia de tu cliente ideal."
                    : ESTRUCTURAS_LISTA.find((e) => e.id === estructura)?.cuando_usarla}
                </p>
              </div>
            )}
```

- [ ] **Step 2: Mandar la estructura y no generar imágenes cuando es video**

En `handleGenerateBatch`, sumar `estructura` al body:

```tsx
        body: JSON.stringify({
          ipc_id: selectedIpcId,
          copy_type: copyType,
          extra_context: extraContext,
          estructura,
        })
```

Y envolver todo el bloque de generación de imágenes (el `for (const draft of insertedDrafts) { ... }`) en:

```tsx
      if (copyType === 'post') {
        setProgressText("Se está generando la imagen...")
        for (const draft of insertedDrafts) {
          // ...tal cual está hoy...
        }
      }
```

Ajustar los textos de progreso: cuando `copyType === 'video'`, `setProgressText("Escribiendo tus 3 guiones...")` y el toast final `"¡3 guiones listos!"`.

- [ ] **Step 3: Esconder formato y estilo de imagen cuando es video**

Envolver la columna derecha (los bloques "Formato de Imagen" y "Estilo de Visual") en `{copyType === 'post' && ( ... )}`, y renumerar las etiquetas visibles para que no queden saltos: video → 1 Perfil, 2 Tipo de Copy, 3 Estructura, 4 Contexto extra; post → 1 Perfil, 2 Tipo de Copy, 3 Contexto extra, 4 Formato, 5 Estilo.

Cambiar el texto del botón:

```tsx
          {copyType === 'video' ? 'Generar 3 guiones para cámara' : 'Generar 3 Variantes Automáticamente'}
```

Y el subtítulo de la card: para video, "Generamos 3 guiones listos para hablar a cámara, con la estructura elegida y tu oferta adentro. Sin imágenes."

- [ ] **Step 4: Aviso cuando no cargó su forma de trabajar**

Al montar, consultar si existe la fila y mostrar el aviso arriba del formulario:

```tsx
  const [tieneOperacion, setTieneOperacion] = useState(true)

  useEffect(() => {
    supabase.from('advisor_operations').select('oferta_captacion, oferta_venta').maybeSingle()
      .then(({ data }) => setTieneOperacion(Boolean(data?.oferta_captacion || data?.oferta_venta)))
  }, [])
```

```tsx
        {!tieneOperacion && (
          <div className="flex gap-3 p-4 rounded-xl bg-accent/5 border border-accent/20">
            <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Tus anuncios van a salir genéricos hasta que completes <strong className="text-foreground">Mi Forma de Trabajar</strong>. Ahí cargás tus números reales y armás tu oferta irresistible.
            </p>
          </div>
        )}
```

- [ ] **Step 5: Probar en el navegador**

Run: `npm run dev`

- Con *Video*: aparece el selector de estructura, desaparecen Formato y Estilo, y al generar **no** se crean imágenes.
- Con *Post*: todo igual que antes, con imagen.

- [ ] **Step 6: Commit**

```bash
git add components/marketing-ia/copy-generator-flow.tsx
git commit -m "feat(marketing): selector de estructura y guiones de video sin imagenes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Historial — mostrar los guiones como guiones

**Files:**
- Modify: `components/marketing-ia/marketing-history.tsx`

**Interfaces:**
- Consumes: `content.bloques` de los borradores nuevos.
- Produces: nada para otras tasks.

- [ ] **Step 1: Copiado en dos sabores**

Reemplazar `handleCopyText` (`marketing-history.tsx:234-245`) por dos funciones, dejando intacto el camino viejo:

```tsx
  const copiarTeleprompter = (content: any) => {
    if (!content) { toast.error("Nada que copiar"); return }
    let txt = ""
    if (Array.isArray(content.bloques) && content.bloques.length > 0) {
      txt = content.bloques.map((b: any) => renderText(b.texto)).join("\n\n")
    } else {
      if (content.hook) txt += renderText(content.hook) + "\n\n"
      if (content.problema) txt += renderText(content.problema) + "\n"
      if (content.agitacion) txt += renderText(content.agitacion) + "\n"
      if (content.solucion) txt += renderText(content.solucion) + "\n\n"
      if (content.desarrollo) txt += renderText(content.desarrollo) + "\n\n"
      if (content.cta) txt += renderText(content.cta)
    }
    navigator.clipboard.writeText(txt).then(() => toast.success("Guión copiado, listo para leer"))
  }

  const copiarCompleto = (content: any) => {
    if (!Array.isArray(content?.bloques)) return copiarTeleprompter(content)
    const txt = content.bloques
      .map((b: any, i: number) =>
        `${i + 1}. ${renderText(b.titulo)} (${b.segundos ?? "?"}s)\n${renderText(b.texto)}\n` +
        `→ Cómo decirlo: ${renderText(b.indicacion)}\n→ Por qué va acá: ${renderText(b.por_que)}`
      )
      .join("\n\n")
    navigator.clipboard.writeText(txt).then(() => toast.success("Guión completo copiado"))
  }
```

Y en la barra de acciones del detalle, reemplazar el botón único "Copiar Todo" por dos, mostrando "Copiar completo" solo cuando hay bloques.

- [ ] **Step 2: Render de los bloques**

En el detalle (`marketing-history.tsx:441-475`), envolver lo que existe hoy en un tercer camino que va **primero**:

```tsx
                          {Array.isArray(selectedGroup.variants[activeVariantIndex].content?.bloques) ? (
                            <>
                              <div className="flex flex-wrap gap-2 pb-2 border-b border-accent/10">
                                <Badge variant="outline" className="text-[10px]">
                                  {renderText(selectedGroup.variants[activeVariantIndex].content.estructura).split('_').join(' ')}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  ángulo: {renderText(selectedGroup.variants[activeVariantIndex].angle)}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  ~{selectedGroup.variants[activeVariantIndex].content.duracion_estimada ?? "?"} seg
                                </Badge>
                              </div>
                              {selectedGroup.variants[activeVariantIndex].content.bloques.map((b: any, i: number) => (
                                <div key={b.id ?? i} className="space-y-1 pb-3 border-b border-muted/50 last:border-0">
                                  <label className="text-[10px] font-bold text-accent uppercase">
                                    {renderText(b.titulo)} · {b.segundos ?? "?"}s
                                  </label>
                                  {isEditingMode ? (
                                    <textarea
                                      value={renderText(editContent?.bloques?.[i]?.texto)}
                                      onChange={(e) => {
                                        const bloques = [...(editContent?.bloques ?? [])]
                                        bloques[i] = { ...bloques[i], texto: e.target.value }
                                        setEditContent({ ...editContent, bloques })
                                      }}
                                      className="w-full bg-background border rounded-lg p-2 text-sm min-h-[70px]"
                                    />
                                  ) : (
                                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">{renderText(b.texto)}</p>
                                  )}
                                  <p className="text-[11px] text-muted-foreground italic">Cómo decirlo: {renderText(b.indicacion)}</p>
                                  <p className="text-[11px] text-muted-foreground">Por qué va acá: {renderText(b.por_que)}</p>
                                </div>
                              ))}
                            </>
                          ) : selectedGroup.variants[activeVariantIndex].copy_type === 'video' ? (
                            /* ...el map de ['hook','problema','agitacion','solucion','cta'] tal cual está hoy... */
                          ) : (
                            /* ...el map de ['hook','desarrollo','cta'] tal cual está hoy... */
                          )}
```

- [ ] **Step 3: Que los guiones no muestren marco de imagen roto**

En la tarjeta de la grilla y en el detalle, cuando `primaryAd.copy_type === 'video'` y no hay `public_url`, mostrar el hook sobre un fondo con acento y el ícono `FileText` en vez del placeholder de imagen faltante. En el detalle, cuando es guion sin imagen, la columna del texto ocupa el ancho completo (`md:col-span-2`).

- [ ] **Step 4: Probar en el navegador**

Run: `npm run dev`

- Un guion nuevo se ve con sus bloques, segundos, cómo decirlo y por qué.
- **Un anuncio viejo (generado antes de este cambio) se sigue viendo exactamente igual que siempre.**
- Editar el texto de un bloque, guardar, reabrir: el cambio quedó.
- Los dos botones de copiar pegan lo que corresponde.

- [ ] **Step 5: Commit**

```bash
git add components/marketing-ia/marketing-history.tsx
git commit -m "feat(marketing): el historial muestra los guiones por bloques sin romper los anuncios viejos" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Verificación completa y documentación

**Files:**
- Modify: `docs/interno/TECNICO-PRISMA.md`, `docs/interno/LOGICA-PRISMA.md`, `PROGRESO.md`
- Modify: la guía funcional de asesor/director en `docs/compartible/estandarizada/`

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: sin errores nuevos

- [ ] **Step 2: Prueba real en escritorio**

Run: `npm run dev`

Con la cuenta de **director de Leonardo** (nunca la de un asesor real de Central):

1. Cargar la forma de trabajar completa; guardar a medias primero y verificar que persiste.
2. Generar las 2 ofertas. **Verificar que cada número que aparece esté cargado en el formulario** y que no haya cifras, premios ni testimonios inventados.
3. Editar una oferta a mano, guardar, regenerar la otra: la editada no se pisó; regenerar la editada pide confirmación.
4. Generar guiones de video contra un IPC de `captar` y otro de `vender`, probando las 6 estructuras y "Sugerida": el orden de los bloques coincide con el catálogo, no se generó ninguna imagen, y la oferta correcta (la del tipo de IPC) está adentro.
5. Generar un post: sigue saliendo con imagen, como siempre.
6. Historial: guion nuevo con bloques, anuncio viejo intacto, los dos botones de copiar.
7. Con un usuario sin forma de trabajar cargada: generar un anuncio y confirmar que sale como salía antes.
8. Revisar en Finanzas que quedó registrado el costo de las generaciones nuevas.

- [ ] **Step 3: Prueba real en celular**

Con emulación de dispositivo en el navegador (no achicando la ventana): recorrer los 4 pasos del formulario, generar las ofertas y abrir un guion del historial. Verificar que no haya scroll horizontal y que los textos largos no se corten.

- [ ] **Step 4: Actualizar los 4 documentos**

- `docs/interno/TECNICO-PRISMA.md`: tabla `advisor_operations`, endpoint `generar-oferta`, los 4 módulos de `lib/marketing-ia/`, y el nuevo formato de `copy_drafts.content` con bloques.
- `docs/interno/LOGICA-PRISMA.md`: de dónde sale la oferta y cómo entra en cada anuncio; la tabla de qué estructura sugiere cada nivel de consciencia.
- `PROGRESO.md`: entrada con fecha 13-ago-2026.
- Guía funcional del asesor/director: paso a paso de "Mi Forma de Trabajar" y de cómo usar un guion frente a cámara, en lenguaje no técnico (sin nombres de tablas ni endpoints).

- [ ] **Step 5: Commit**

```bash
git add docs PROGRESO.md
git commit -m "docs(marketing): documenta la oferta irresistible y los guiones de video" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Avisarle a Leonardo**

Dejar el `npm run dev` levantado y pasarle el link para que lo pruebe él en escritorio y celular. **No mergear a `main` ni pushear sin su OK explícito.**
