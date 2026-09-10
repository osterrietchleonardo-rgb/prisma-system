# Documentos para clientes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el director arme plantillas de documentos con un editor tipo Word, header y footer como imágenes y variables del asesor, y que cada asesor las comparta con sus clientes como link con la marca de la agencia y PDF.

**Architecture:** Dos tablas nuevas (`documentos_plantillas` y `shared_documentos`, la segunda calcada de `shared_selections`). El cuerpo se guarda como estructura de Tiptap (nunca HTML) y se renderiza en el servidor con una lista fija de extensiones. Al compartir se congela un snapshot con la plantilla, el asesor, la agencia y la marca. La página pública `/documento/[token]` sigue el esqueleto de la ficha del ACM. Todo vive en pantallas que ya existen: Asesores → Plantillas (director) y Biblioteca (asesor).

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + Storage), Tiptap 3.31.3 (`@tiptap/react`, `starter-kit`, `extension-mention`, `extension-text-align`, `extension-underline`, `suggestion`, `html`), `sharp` (ya instalado), vitest, shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-09-09-documentos-para-clientes-design.md`

## Global Constraints

- **Rama nueva desde `origin/main`, en worktree propio.** Nunca `git add -A`: se agregan archivos por nombre.
- **No se toca el menú** (`lib/nav/menu.ts`) ni su test. No se toca la lógica de `lib/asesor-docs`, `app/api/asesor-docs` ni `components/asesor-docs/*` salvo el título y el montaje en sub-solapas.
- Header y footer son **por plantilla** y **opcionales**: sin imagen, no hay franja.
- Imagen: PNG o JPG, **ancho mínimo 1600 px medido con `sharp`**, tope **2 MB** (`2 * 1024 * 1024`).
- Las cinco variables son **fijas**: `nombre`, `email`, `celular`, `categoria`, `agencia`. Si falta el dato, se omite la mención y su etiqueta corta; nunca queda un hueco.
- El cuerpo se guarda como JSON de Tiptap. **Nunca se guarda ni se renderiza HTML del cliente.** El HTML se genera en el servidor con `lib/documentos/tiptap.ts` y ninguna otra lista de extensiones.
- Solo el rol `director` escribe plantillas (403 en todos los endpoints de escritura). Compartir lo pueden ambos roles.
- Borrar una plantilla: solo si `shared_documentos` no tiene ningún link de ella; si tiene, se desactiva.
- Las migraciones del repo **no se aplican solas**: se aplican con `node scratch/apply-sql.mjs` por la Management API, con OK de Leonardo.
- Textos de interfaz en español rioplatense, sin tecnicismos.
- Tests con `vitest`: `npx vitest run <ruta>`.

---

### Task 1: Migración y el modelo de la plantilla

**Files:**
- Create: `supabase/migrations/20260909120000_documentos_para_clientes.sql`
- Create: `lib/documentos/plantilla.ts`
- Test: `lib/documentos/plantilla.test.ts`

**Interfaces:**
- Produces:
  - `type PosicionBloque = "header" | "footer" | "ambos" | "ninguno"`
  - `type DocTiptap = { type: "doc"; content?: unknown[] }`
  - `interface BloqueAsesor { texto: DocTiptap; posicion: PosicionBloque }`
  - `interface Plantilla { id: string; nombre: string; cuerpo: DocTiptap; header_path: string | null; footer_path: string | null; bloque_asesor: BloqueAsesor; version: number; activa: boolean; updated_at: string }`
  - `const DOC_VACIO: DocTiptap`
  - `const MAX_NOMBRE = 120`
  - `function normalizarPlantilla(raw: unknown): Plantilla`
  - `function docVacio(doc: unknown): boolean`

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260909120000_documentos_para_clientes.sql
-- ─────────────────────────────────────────────────────────────
-- Documentos para clientes: el director arma una plantilla una vez (cuerpo en el editor,
-- header y footer como imágenes, un bloque con los datos del asesor) y cada asesor la
-- comparte con sus clientes como link público con PDF, con SUS datos.
--
-- Dos tablas nuevas. Nada existente se modifica. Idempotente.
--
-- Cómo se deshace:
--   DROP FUNCTION IF EXISTS public.increment_shared_documento_view(text);
--   DROP TABLE IF EXISTS public.shared_documentos;
--   DROP TABLE IF EXISTS public.documentos_plantillas;
-- ─────────────────────────────────────────────────────────────

-- ── 1. La plantilla ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_plantillas (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    nombre         text NOT NULL,
    cuerpo         jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    header_path    text,
    footer_path    text,
    bloque_asesor  jsonb NOT NULL DEFAULT '{"texto":{"type":"doc","content":[]},"posicion":"ninguno"}'::jsonb,
    version        integer NOT NULL DEFAULT 1,
    activa         boolean NOT NULL DEFAULT false,
    created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documentos_plantillas_agency_idx
    ON public.documentos_plantillas (agency_id);

ALTER TABLE public.documentos_plantillas ENABLE ROW LEVEL SECURITY;

-- El director de la agencia hace todo con las suyas.
DROP POLICY IF EXISTS "Directores gestionan sus plantillas de documentos" ON public.documentos_plantillas;
CREATE POLICY "Directores gestionan sus plantillas de documentos"
  ON public.documentos_plantillas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = documentos_plantillas.agency_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = documentos_plantillas.agency_id
  ));

-- El asesor de la agencia solo lee las activas: son las que puede compartir.
DROP POLICY IF EXISTS "Asesores leen las plantillas activas de su agencia" ON public.documentos_plantillas;
CREATE POLICY "Asesores leen las plantillas activas de su agencia"
  ON public.documentos_plantillas FOR SELECT
  USING (activa = true AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.agency_id = documentos_plantillas.agency_id
  ));

-- ── 2. El documento compartido (copia congelada) ─────────────
-- Mismo molde que shared_selections: token + snapshot, RLS encendida SIN políticas, solo la
-- lee el servidor con service-role.
CREATE TABLE IF NOT EXISTS public.shared_documentos (
    token        text PRIMARY KEY,
    snapshot     jsonb NOT NULL,   -- { plantilla, agent, agency, brand, created_at }
    plantilla_id uuid REFERENCES public.documentos_plantillas(id) ON DELETE SET NULL,
    created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    agency_id    uuid,
    view_count   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_documentos_created_by_idx  ON public.shared_documentos (created_by);
CREATE INDEX IF NOT EXISTS shared_documentos_agency_id_idx   ON public.shared_documentos (agency_id);
CREATE INDEX IF NOT EXISTS shared_documentos_plantilla_idx   ON public.shared_documentos (plantilla_id);

ALTER TABLE public.shared_documentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.increment_shared_documento_view(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_documentos SET view_count = view_count + 1 WHERE token = p_token;
$$;

COMMENT ON TABLE public.documentos_plantillas
  IS 'Plantillas de documentos para clientes: cuerpo Tiptap, header/footer como imágenes, bloque del asesor con variables.';
COMMENT ON TABLE public.shared_documentos
  IS 'Un documento ya compartido. Copia congelada: no cambia aunque cambie la plantilla, el asesor o la marca.';
```

- [ ] **Step 2: Escribir el test que falla**

```typescript
// lib/documentos/plantilla.test.ts
import { describe, it, expect } from "vitest";
import { normalizarPlantilla, docVacio, DOC_VACIO, MAX_NOMBRE } from "./plantilla";

describe("normalizarPlantilla", () => {
  it("de nada devuelve una plantilla vacía, inactiva, sin header ni footer, con el bloque en 'ninguno'", () => {
    const p = normalizarPlantilla(undefined);
    expect(p.nombre).toBe("");
    expect(p.cuerpo).toEqual(DOC_VACIO);
    expect(p.header_path).toBeNull();
    expect(p.footer_path).toBeNull();
    expect(p.bloque_asesor).toEqual({ texto: DOC_VACIO, posicion: "ninguno" });
    expect(p.version).toBe(1);
    expect(p.activa).toBe(false);
  });

  it("recorta el nombre al tope y lo limpia", () => {
    const p = normalizarPlantilla({ nombre: "  " + "a".repeat(500) + "  " });
    expect(p.nombre).toHaveLength(MAX_NOMBRE);
  });

  it("una posición inventada cae en 'ninguno'", () => {
    const p = normalizarPlantilla({ bloque_asesor: { texto: DOC_VACIO, posicion: "arriba" } });
    expect(p.bloque_asesor.posicion).toBe("ninguno");
  });

  it("un cuerpo que no es un doc de Tiptap cae en el doc vacío", () => {
    expect(normalizarPlantilla({ cuerpo: "<b>hola</b>" }).cuerpo).toEqual(DOC_VACIO);
    expect(normalizarPlantilla({ cuerpo: { type: "html" } }).cuerpo).toEqual(DOC_VACIO);
  });

  it("conserva un doc válido tal cual", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] };
    expect(normalizarPlantilla({ cuerpo: doc }).cuerpo).toEqual(doc);
  });

  it("version nunca baja de 1 y activa es booleano estricto", () => {
    expect(normalizarPlantilla({ version: 0 }).version).toBe(1);
    expect(normalizarPlantilla({ version: "7" }).version).toBe(1);
    expect(normalizarPlantilla({ activa: "true" }).activa).toBe(false);
    expect(normalizarPlantilla({ activa: true }).activa).toBe(true);
  });
});

describe("docVacio", () => {
  it("un doc sin contenido o con un párrafo vacío está vacío", () => {
    expect(docVacio(DOC_VACIO)).toBe(true);
    expect(docVacio({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(docVacio({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }] })).toBe(true);
  });

  it("con texto o con una mención no está vacío", () => {
    expect(docVacio({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] })).toBe(false);
    expect(docVacio({ type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "nombre" } }] }] })).toBe(false);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run lib/documentos/plantilla.test.ts`
Expected: FAIL — `Failed to load url ./plantilla`

- [ ] **Step 4: Implementar**

```typescript
// lib/documentos/plantilla.ts
// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · la forma de una plantilla y cómo se limpia lo que llega.
// El cuerpo y el bloque del asesor son documentos de Tiptap (JSON), nunca HTML: el HTML lo
// genera el servidor con una lista fija de extensiones (ver ./tiptap.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type PosicionBloque = "header" | "footer" | "ambos" | "ninguno";
export const POSICIONES: readonly PosicionBloque[] = ["header", "footer", "ambos", "ninguno"];

export type DocTiptap = { type: "doc"; content?: unknown[] };
export const DOC_VACIO: DocTiptap = { type: "doc", content: [] };

export interface BloqueAsesor {
  texto: DocTiptap;
  posicion: PosicionBloque;
}

export interface Plantilla {
  id: string;
  nombre: string;
  cuerpo: DocTiptap;
  header_path: string | null;
  footer_path: string | null;
  bloque_asesor: BloqueAsesor;
  version: number;
  activa: boolean;
  updated_at: string;
}

export const MAX_NOMBRE = 120;

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Un doc de Tiptap válido es `{ type: "doc" }` con un `content` que, si está, es un array. */
export function esDoc(v: unknown): v is DocTiptap {
  return esObjeto(v) && v.type === "doc" && (v.content === undefined || Array.isArray(v.content));
}

const doc = (v: unknown): DocTiptap => (esDoc(v) ? v : DOC_VACIO);

export function normalizarPlantilla(raw: unknown): Plantilla {
  const r = esObjeto(raw) ? raw : {};
  const bloque = esObjeto(r.bloque_asesor) ? r.bloque_asesor : {};
  const posicion = POSICIONES.includes(bloque.posicion as PosicionBloque)
    ? (bloque.posicion as PosicionBloque)
    : "ninguno";

  return {
    id: typeof r.id === "string" ? r.id : "",
    nombre: typeof r.nombre === "string" ? r.nombre.trim().slice(0, MAX_NOMBRE) : "",
    cuerpo: doc(r.cuerpo),
    header_path: typeof r.header_path === "string" && r.header_path ? r.header_path : null,
    footer_path: typeof r.footer_path === "string" && r.footer_path ? r.footer_path : null,
    bloque_asesor: { texto: doc(bloque.texto), posicion },
    version: typeof r.version === "number" && r.version >= 1 ? Math.floor(r.version) : 1,
    activa: r.activa === true,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

/** Recorre el doc: hay algo si aparece texto no vacío o una mención. */
export function docVacio(d: unknown): boolean {
  const hayAlgo = (n: unknown): boolean => {
    if (!esObjeto(n)) return false;
    if (n.type === "mention") return true;
    if (n.type === "text" && typeof n.text === "string" && n.text.trim()) return true;
    return Array.isArray(n.content) && n.content.some(hayAlgo);
  };
  return !hayAlgo(d);
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run lib/documentos/plantilla.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260909120000_documentos_para_clientes.sql lib/documentos/plantilla.ts lib/documentos/plantilla.test.ts
git commit -m "feat(documentos): migracion y modelo de las plantillas para clientes"
```

---

### Task 2: Las variables del asesor y cómo se aplican

**Files:**
- Create: `lib/documentos/variables.ts`
- Create: `lib/ficha/etiqueta-categoria.ts`
- Modify: `app/ficha-acm/[token]/page.tsx:126-135` (usar el helper en vez del ternario inline)
- Test: `lib/documentos/variables.test.ts`, `lib/ficha/etiqueta-categoria.test.ts`

**Interfaces:**
- Consumes: Task 1 — `DocTiptap`.
- Produces:
  - `function etiquetaDeCategoria(clasificacion: string | null | undefined, role: string | null | undefined): string` (en `lib/ficha/etiqueta-categoria.ts`)
  - `const VARIABLES: readonly { id: VariableId; label: string; descripcion: string }[]`
  - `type VariableId = "nombre" | "email" | "celular" | "categoria" | "agencia"`
  - `interface DatosParaVariables { full_name?: string | null; email?: string | null; phone?: string | null; clasificacion?: string | null; role?: string | null; agencia?: string | null }`
  - `function valoresDeVariables(d: DatosParaVariables): Record<VariableId, string>` — vacío = falta
  - `function variablesQueFaltan(d: DatosParaVariables): VariableId[]`
  - `function aplicarVariables(doc: DocTiptap, valores: Record<VariableId, string>): DocTiptap`

- [ ] **Step 1: Test de la etiqueta**

```typescript
// lib/ficha/etiqueta-categoria.test.ts
import { describe, it, expect } from "vitest";
import { etiquetaDeCategoria } from "./etiqueta-categoria";

describe("etiquetaDeCategoria", () => {
  it("el director es Director/a, tenga o no clasificación", () => {
    expect(etiquetaDeCategoria("client_director", "director")).toBe("Director/a");
    expect(etiquetaDeCategoria(null, "director")).toBe("Director/a");
  });
  it("la clasificación del asesor sale legible", () => {
    expect(etiquetaDeCategoria("client_director", "asesor")).toBe("Client Director");
    expect(etiquetaDeCategoria("client_support", "asesor")).toBe("Client Support");
  });
  it("sin clasificación, Asesor/a", () => {
    expect(etiquetaDeCategoria(null, "asesor")).toBe("Asesor/a");
    expect(etiquetaDeCategoria("otra_cosa", "asesor")).toBe("Asesor/a");
  });
});
```

- [ ] **Step 2: Test de las variables**

```typescript
// lib/documentos/variables.test.ts
import { describe, it, expect } from "vitest";
import { VARIABLES, valoresDeVariables, variablesQueFaltan, aplicarVariables } from "./variables";

const p = (...c: unknown[]) => ({ type: "paragraph", content: c });
const t = (text: string) => ({ type: "text", text });
const m = (id: string) => ({ type: "mention", attrs: { id, label: `@${id}` } });
const docDe = (...parrafos: unknown[]) => ({ type: "doc" as const, content: parrafos });

const central = {
  full_name: "Ana Pérez", email: "ana@central.com", phone: "5491123456789",
  clasificacion: "client_director", role: "asesor", agencia: "Central Real Estate",
};

describe("VARIABLES", () => {
  it("son cinco, fijas, y cada una explica qué es", () => {
    expect(VARIABLES.map((v) => v.id)).toEqual(["nombre", "email", "celular", "categoria", "agencia"]);
    for (const v of VARIABLES) expect(v.descripcion.length).toBeGreaterThan(10);
  });
});

describe("valoresDeVariables", () => {
  it("saca cada valor de donde corresponde, y el celular formateado", () => {
    const v = valoresDeVariables(central);
    expect(v.nombre).toBe("Ana Pérez");
    expect(v.email).toBe("ana@central.com");
    expect(v.celular).toBe("+54 9 11 2345-6789");
    expect(v.categoria).toBe("Client Director");
    expect(v.agencia).toBe("Central Real Estate");
  });

  it("lo que falta queda vacío, no 'undefined' ni 'null'", () => {
    const v = valoresDeVariables({ full_name: "Ana", role: "asesor" });
    expect(v.email).toBe("");
    expect(v.celular).toBe("");
    expect(v.agencia).toBe("");
  });

  it("un teléfono que no se puede formatear se muestra crudo antes que vacío", () => {
    expect(valoresDeVariables({ phone: "1234", role: "asesor" }).celular).toBe("1234");
  });
});

describe("variablesQueFaltan", () => {
  it("lista lo que el asesor no tiene cargado", () => {
    expect(variablesQueFaltan({ full_name: "Ana", role: "asesor", agencia: "X" })).toEqual(["email", "celular"]);
  });
  it("la categoría nunca falta: sin clasificación es 'Asesor/a'", () => {
    expect(variablesQueFaltan(central)).toEqual([]);
  });
});

describe("aplicarVariables", () => {
  const valores = valoresDeVariables(central);

  it("reemplaza cada mención por su valor como texto plano", () => {
    const out = aplicarVariables(docDe(p(t("Hola, soy "), m("nombre"), t(" de "), m("agencia"))), valores);
    expect(out).toEqual(docDe(p(t("Hola, soy "), t("Ana Pérez"), t(" de "), t("Central Real Estate"))));
  });

  it("conserva las marcas (negrita) del texto de alrededor", () => {
    const negrita = { type: "mention", attrs: { id: "nombre" }, marks: [{ type: "bold" }] };
    const out = aplicarVariables(docDe(p(negrita)), valores);
    expect(out).toEqual(docDe(p({ type: "text", text: "Ana Pérez", marks: [{ type: "bold" }] })));
  });

  it("si falta el dato, saca la mención Y la etiqueta corta que la precede: 'Cel: @celular' desaparece entero", () => {
    const sinCel = { ...valores, celular: "" };
    const out = aplicarVariables(docDe(p(m("email"), t(" | Cel: "), m("celular"))), sinCel);
    expect(out).toEqual(docDe(p(t("ana@central.com"))));
  });

  it("si falta el dato en medio de una frase larga, saca solo la mención y deja la frase", () => {
    const sinAg = { ...valores, agencia: "" };
    const out = aplicarVariables(docDe(p(t("Trabajo desde hace veinte años en "), m("agencia"))), sinAg);
    expect(out).toEqual(docDe(p(t("Trabajo desde hace veinte años en "))));
  });

  it("una mención con id desconocido se saca sin romper", () => {
    const out = aplicarVariables(docDe(p(t("x "), m("cuit"))), valores);
    expect(out).toEqual(docDe(p(t("x "))));
  });

  it("no toca nodos que no son menciones (títulos, listas) ni el doc original", () => {
    const original = docDe({ type: "heading", attrs: { level: 2 }, content: [t("Título")] }, p(m("nombre")));
    const copia = JSON.parse(JSON.stringify(original));
    const out = aplicarVariables(original, valores);
    expect(original).toEqual(copia);
    expect(out.content?.[0]).toEqual({ type: "heading", attrs: { level: 2 }, content: [t("Título")] });
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run lib/documentos/variables.test.ts lib/ficha/etiqueta-categoria.test.ts`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 4: Implementar la etiqueta y aplicarla en la ficha del ACM**

```typescript
// lib/ficha/etiqueta-categoria.ts
// La clasificación secundaria que el director le pone al asesor en "Asesores", legible para
// el cliente. Vivía inline en app/ficha-acm/[token]/page.tsx; ahora la usan la ficha del ACM
// y los documentos para clientes, y si cada una tuviera su copia se desincronizarían.
export function etiquetaDeCategoria(
  clasificacion: string | null | undefined,
  role: string | null | undefined,
): string {
  if (role === "director") return "Director/a";
  if (clasificacion === "client_director") return "Client Director";
  if (clasificacion === "client_support") return "Client Support";
  return "Asesor/a";
}
```

En `app/ficha-acm/[token]/page.tsx`, reemplazar el bloque de `roleLabel` (líneas 126-135) por:

```typescript
  const roleLabel = etiquetaDeCategoria(agent?.clasificacion, agent?.role);
```

y agregar el import junto a los otros: `import { etiquetaDeCategoria } from "@/lib/ficha/etiqueta-categoria";`

- [ ] **Step 5: Implementar las variables**

```typescript
// lib/documentos/variables.ts
// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · las variables que el director puede poner con @, de dónde sale
// cada una, y cómo se reemplazan en el doc de Tiptap al compartir.
//
// Son CINCO y son fijas. Si un día hace falta otra (matrícula, CUIT), se agrega acá con su
// fuente; no se inventan desde la pantalla.
// ─────────────────────────────────────────────────────────────────────────────
import { formatPhoneInternational } from "@/lib/whatsapp/phone";
import { etiquetaDeCategoria } from "@/lib/ficha/etiqueta-categoria";
import type { DocTiptap } from "./plantilla";

export type VariableId = "nombre" | "email" | "celular" | "categoria" | "agencia";

export const VARIABLES: readonly { id: VariableId; label: string; descripcion: string }[] = [
  { id: "nombre",    label: "@nombre",    descripcion: "Nombre y apellido del asesor, como está en su perfil." },
  { id: "email",     label: "@email",     descripcion: "El email con el que entra a PRISMA." },
  { id: "celular",   label: "@celular",   descripcion: "Su celular, con el formato +54 9 11 …" },
  { id: "categoria", label: "@categoria", descripcion: "Client Director / Client Support, o Asesor/a si no tiene." },
  { id: "agencia",   label: "@agencia",   descripcion: "El nombre de la inmobiliaria." },
];

const IDS = new Set<string>(VARIABLES.map((v) => v.id));

export interface DatosParaVariables {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  clasificacion?: string | null;
  role?: string | null;
  agencia?: string | null;
}

const limpio = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function valoresDeVariables(d: DatosParaVariables): Record<VariableId, string> {
  const crudo = limpio(d.phone);
  return {
    nombre: limpio(d.full_name),
    email: limpio(d.email),
    // Formateado como en la ficha del ACM. Si no se puede, crudo: un número raro es mejor que
    // un asesor que aparece sin teléfono.
    celular: crudo ? (formatPhoneInternational(crudo) ?? crudo) : "",
    categoria: etiquetaDeCategoria(d.clasificacion, d.role),
    agencia: limpio(d.agencia),
  };
}

export function variablesQueFaltan(d: DatosParaVariables): VariableId[] {
  const v = valoresDeVariables(d);
  return VARIABLES.map((x) => x.id).filter((id) => !v[id]);
}

type Nodo = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: unknown[]; content?: Nodo[] };

/**
 * Cuando una mención no tiene dato, además de sacarla se saca la "etiqueta corta" que la
 * precede: en `@email | Cel: @celular` sin celular, tiene que irse " | Cel: " entero.
 * Se considera etiqueta corta un nodo de texto de hasta ETIQUETA_MAX caracteres que está
 * pegado antes de la mención. Un texto más largo es una frase, y esa se deja.
 */
const ETIQUETA_MAX = 12;

function aplicarEnLinea(nodos: Nodo[], valores: Record<VariableId, string>): Nodo[] {
  const out: Nodo[] = [];
  for (const n of nodos) {
    if (n.type !== "mention") {
      out.push(n.content ? { ...n, content: aplicarEnLinea(n.content, valores) } : n);
      continue;
    }
    const id = String(n.attrs?.id ?? "");
    const valor = IDS.has(id) ? valores[id as VariableId] : "";
    if (valor) {
      out.push({ type: "text", text: valor, ...(n.marks ? { marks: n.marks } : {}) });
      continue;
    }
    // Falta el dato: se descarta la mención y, si lo que quedó antes es una etiqueta corta, también.
    const previo = out[out.length - 1];
    if (previo && previo.type === "text" && typeof previo.text === "string" && previo.text.length <= ETIQUETA_MAX) {
      out.pop();
    }
  }
  return out;
}

export function aplicarVariables(doc: DocTiptap, valores: Record<VariableId, string>): DocTiptap {
  const copia = JSON.parse(JSON.stringify(doc)) as DocTiptap & { content?: Nodo[] };
  return { ...copia, content: copia.content ? aplicarEnLinea(copia.content, valores) : [] };
}
```

- [ ] **Step 6: Correr y ver que pasan**

Run: `npx vitest run lib/documentos/variables.test.ts lib/ficha/etiqueta-categoria.test.ts && npx tsc --noEmit`
Expected: PASS — 14 tests; tipos limpios.

- [ ] **Step 7: Commit**

```bash
git add lib/documentos/variables.ts lib/documentos/variables.test.ts lib/ficha/etiqueta-categoria.ts lib/ficha/etiqueta-categoria.test.ts "app/ficha-acm/[token]/page.tsx"
git commit -m "feat(documentos): las cinco variables del asesor y como se aplican sin dejar huecos"
```

---

### Task 3: Tiptap en el servidor — la lista fija de extensiones y el HTML

**Files:**
- Create: `lib/documentos/tiptap.ts`
- Test: `lib/documentos/tiptap.test.ts`

**Interfaces:**
- Consumes: Task 1 — `DocTiptap`.
- Produces:
  - `function extensionesDocumento(): Extensions` — la lista única, compartida por editor y servidor
  - `function generarHtml(doc: DocTiptap): string`

- [ ] **Step 1: Instalar Tiptap**

Run: `npm install @tiptap/react@3.31.3 @tiptap/starter-kit@3.31.3 @tiptap/extension-mention@3.31.3 @tiptap/extension-text-align@3.31.3 @tiptap/suggestion@3.31.3 @tiptap/html@3.31.3 @tiptap/core@3.31.3 @tiptap/pm@3.31.3`
Expected: sin errores; `package.json` y `package-lock.json` cambian.

Nota: en Tiptap 3 el StarterKit **ya incluye** `underline` y `link` (verificarlo en `node_modules/@tiptap/starter-kit/dist/index.d.ts` después de instalar). Por eso no se instala `extension-underline` aparte: agregarlo duplicaría la extensión y Tiptap tira error.

- [ ] **Step 2: Test que falla**

```typescript
// lib/documentos/tiptap.test.ts
import { describe, it, expect } from "vitest";
import { generarHtml } from "./tiptap";

const doc = (...content: unknown[]) => ({ type: "doc" as const, content });

describe("generarHtml", () => {
  it("dibuja párrafos, negrita, cursiva, subrayado, títulos, listas y alineación", () => {
    const html = generarHtml(doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Quiénes somos" }] },
      { type: "paragraph", attrs: { textAlign: "center" }, content: [
        { type: "text", text: "Somos ", marks: [{ type: "bold" }] },
        { type: "text", text: "Central", marks: [{ type: "italic" }, { type: "underline" }] },
      ] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "uno" }] }] }] },
    ));
    expect(html).toContain("<h2>Quiénes somos</h2>");
    expect(html).toContain("<strong>Somos </strong>");
    expect(html).toContain("<u>");
    expect(html).toContain("<em>");
    expect(html).toContain('text-align: center');
    expect(html).toContain("<ul>");
  });

  it("una mención se dibuja como su etiqueta, para la vista previa sin datos", () => {
    const html = generarHtml(doc({ type: "paragraph", content: [{ type: "mention", attrs: { id: "nombre", label: "@nombre" } }] }));
    expect(html).toContain("@nombre");
  });

  it("escapa el texto: no hay forma de meter HTML desde el contenido", () => {
    const html = generarHtml(doc({ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un nodo que no está en la lista no se dibuja", () => {
    // Un "image" o un "iframe" colado en el JSON no tiene extensión: Tiptap lo rechaza.
    expect(() => generarHtml(doc({ type: "image", attrs: { src: "http://x/y.png" } }))).toThrow();
    expect(() => generarHtml(doc({ type: "iframe", attrs: { src: "http://x" } }))).toThrow();
  });

  it("un atributo de link no existe: no hay extensión de links", () => {
    expect(() => generarHtml(doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }))).toThrow();
  });

  it("el doc vacío da cadena vacía o un párrafo vacío, nunca rompe", () => {
    expect(() => generarHtml({ type: "doc", content: [] })).not.toThrow();
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run lib/documentos/tiptap.test.ts`
Expected: FAIL — `Failed to load url ./tiptap`

- [ ] **Step 4: Implementar**

```typescript
// lib/documentos/tiptap.ts
// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · LA lista de extensiones de Tiptap. La usan el editor (en el
// navegador) y generarHtml (en el servidor). Es una sola a propósito: lo que el director
// puede escribir es exactamente lo que se puede dibujar, y nada más. Un nodo que no esté acá
// (imagen, iframe, link) hace que Tiptap tire error en vez de dibujarlo, y eso es la defensa
// contra meter código en un documento público: no hace falta sanitizar HTML porque nunca
// se acepta HTML.
// ─────────────────────────────────────────────────────────────────────────────
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import TextAlign from "@tiptap/extension-text-align";
import { generateHTML } from "@tiptap/html";
import type { DocTiptap } from "./plantilla";

export function extensionesDocumento(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      // Sin links, sin código, sin citas, sin líneas: no hacen falta y cada uno es una puerta.
      link: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      // underline queda: viene en el StarterKit de Tiptap 3.
    }),
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
    Mention.configure({
      HTMLAttributes: { class: "variable" },
      // En el HTML la mención se ve como su etiqueta (@nombre). Al compartir, aplicarVariables
      // ya la reemplazó por texto, así que acá solo llega en la vista previa sin datos.
      renderText: ({ node }) => String(node.attrs.label ?? `@${node.attrs.id}`),
      renderHTML: ({ node }) => ["span", { class: "variable" }, String(node.attrs.label ?? `@${node.attrs.id}`)],
    }),
  ];
}

export function generarHtml(doc: DocTiptap): string {
  return generateHTML(doc as Record<string, unknown>, extensionesDocumento());
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run lib/documentos/tiptap.test.ts`
Expected: PASS — 6 tests. Si `generateHTML` no tira error con un nodo desconocido en esta versión, cambiar el test de "no se dibuja" a comprobar que el HTML **no contenga** `<img` ni `<iframe` ni `javascript:`, y anotar por qué.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/documentos/tiptap.ts lib/documentos/tiptap.test.ts
git commit -m "feat(documentos): Tiptap con una lista fija de extensiones y HTML generado en el servidor"
```

---

### Task 4: Validar la imagen del header o footer

**Files:**
- Create: `lib/documentos/imagen.ts`
- Test: `lib/documentos/imagen.test.ts`

**Interfaces:**
- Produces:
  - `const MAX_IMAGEN = 2 * 1024 * 1024`
  - `const ANCHO_MINIMO = 1600`
  - `const GUIA_IMAGEN: string` — el texto que ve el director
  - `async function validarImagen(buffer: Buffer, mime: string): Promise<{ ok: true; ext: "png" | "jpg"; ancho: number; alto: number } | { ok: false; motivo: string }>`

- [ ] **Step 1: Test que falla (las imágenes se fabrican con sharp, no hay fixtures)**

```typescript
// lib/documentos/imagen.test.ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { validarImagen, MAX_IMAGEN, ANCHO_MINIMO, GUIA_IMAGEN } from "./imagen";

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).png().toBuffer();
const jpg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).jpeg().toBuffer();

describe("validarImagen", () => {
  it("acepta un PNG apaisado de 1600 de ancho y dice sus medidas", async () => {
    const r = await validarImagen(await png(1600, 300), "image/png");
    expect(r).toEqual({ ok: true, ext: "png", ancho: 1600, alto: 300 });
  });

  it("acepta JPG", async () => {
    const r = await validarImagen(await jpg(2000, 400), "image/jpeg");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ext).toBe("jpg");
  });

  it("rechaza menos de 1600 de ancho, midiendo el archivo (no el nombre ni el mime)", async () => {
    const r = await validarImagen(await png(800, 200), "image/png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain(String(ANCHO_MINIMO));
  });

  it("rechaza un formato que no es PNG ni JPG", async () => {
    const webp = await sharp({ create: { width: 1600, height: 200, channels: 3, background: "#fff" } }).webp().toBuffer();
    const r = await validarImagen(webp, "image/webp");
    expect(r.ok).toBe(false);
  });

  it("rechaza más de 2 MB antes de mirar nada más", async () => {
    const r = await validarImagen(Buffer.alloc(MAX_IMAGEN + 1), "image/png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("2 MB");
  });

  it("un archivo que no es una imagen no explota: dice que no se pudo leer", async () => {
    const r = await validarImagen(Buffer.from("esto no es una imagen"), "image/png");
    expect(r.ok).toBe(false);
  });

  it("la guía le dice al director el ancho, el peso y que NO dibuje los datos del asesor", () => {
    expect(GUIA_IMAGEN).toContain("1600");
    expect(GUIA_IMAGEN).toContain("2 MB");
    expect(GUIA_IMAGEN.toLowerCase()).toContain("datos del asesor");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/documentos/imagen.test.ts`
Expected: FAIL — `Failed to load url ./imagen`

- [ ] **Step 3: Implementar**

```typescript
// lib/documentos/imagen.ts
// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · qué imagen sirve de header o footer, y la guía al director.
// Las medidas se leen del archivo con sharp, nunca del nombre ni del tipo declarado: el
// navegador dice "image/png" de lo que sea que tenga esa extensión.
// ─────────────────────────────────────────────────────────────────────────────
import sharp from "sharp";

export const MAX_IMAGEN = 2 * 1024 * 1024;
export const ANCHO_MINIMO = 1600;

export const GUIA_IMAGEN =
  "Cómo tiene que ser la imagen: una franja apaisada de ancho completo, PNG o JPG, de al menos " +
  `${ANCHO_MINIMO} px de ancho y hasta 2 MB. Los logos, el teléfono, la web y la dirección de la ` +
  "inmobiliaria van adentro de la imagen, como vos los diseñes. Lo que NO tiene que tener: los datos " +
  "del asesor. Nombre, categoría, mail y celular los pone PRISMA por cada persona, con lo que escribas " +
  "en «Bloque del asesor». Si los dibujás en la imagen, salen fijos con los datos de uno solo.";

type Resultado =
  | { ok: true; ext: "png" | "jpg"; ancho: number; alto: number }
  | { ok: false; motivo: string };

export async function validarImagen(buffer: Buffer, mime: string): Promise<Resultado> {
  if (buffer.length > MAX_IMAGEN) {
    return { ok: false, motivo: "La imagen pasa los 2 MB. Exportala un poco más liviana." };
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return { ok: false, motivo: "No se pudo leer el archivo como imagen. Tiene que ser PNG o JPG." };
  }

  const ext = meta.format === "png" ? "png" : meta.format === "jpeg" ? "jpg" : null;
  if (!ext) {
    return { ok: false, motivo: `Tiene que ser PNG o JPG (este es ${meta.format ?? mime || "otro formato"}).` };
  }

  const ancho = meta.width ?? 0;
  const alto = meta.height ?? 0;
  if (ancho < ANCHO_MINIMO) {
    return {
      ok: false,
      motivo: `La imagen tiene ${ancho} px de ancho y necesita al menos ${ANCHO_MINIMO}: en la hoja saldría borrosa.`,
    };
  }

  return { ok: true, ext, ancho, alto };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/documentos/imagen.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/documentos/imagen.ts lib/documentos/imagen.test.ts
git commit -m "feat(documentos): validar la imagen del header o footer midiendo el archivo"
```

---

### Task 5: Endpoints de plantillas (solo director)

**Files:**
- Create: `app/api/documentos-plantillas/route.ts` (GET lista, POST crea)
- Create: `app/api/documentos-plantillas/[id]/route.ts` (GET, PUT, DELETE)
- Create: `app/api/documentos-plantillas/[id]/imagen/route.ts` (POST header|footer, DELETE)
- Test: `app/api/documentos-plantillas/route.test.ts`, `app/api/documentos-plantillas/[id]/route.test.ts`

**Interfaces:**
- Consumes: Task 1 (`normalizarPlantilla`, `docVacio`, `Plantilla`), Task 4 (`validarImagen`).
- Produces:
  - `GET /api/documentos-plantillas` → `{ plantillas: Plantilla[] }` (director: todas las suyas)
  - `POST /api/documentos-plantillas` body `{ nombre }` → `{ plantilla: Plantilla }` (crea inactiva)
  - `GET /api/documentos-plantillas/[id]` → `{ plantilla, header_url, footer_url, compartidos: number }`
  - `PUT /api/documentos-plantillas/[id]` body `{ nombre, cuerpo, bloque_asesor, activa }` → `{ plantilla }` (sube `version`)
  - `DELETE /api/documentos-plantillas/[id]` → `{ borrada: true }` o `{ borrada: false, desactivada: true }`
  - `POST /api/documentos-plantillas/[id]/imagen` FormData `file`, `cual: "header" | "footer"` → `{ path, url }`
  - `DELETE /api/documentos-plantillas/[id]/imagen` body `{ cual }` → `{ ok: true }`
  - helper `urlPublica(path: string | null): string | null` en `lib/documentos/storage.ts` (bucket `marketing-images`)

- [ ] **Step 1: El helper de storage (sin test propio: dos líneas que envuelven al cliente)**

```typescript
// lib/documentos/storage.ts
// Las imágenes de header/footer van al bucket PÚBLICO marketing-images, que ya sirve las de
// marca. Ruta: <agencyId>/documentos/<plantillaId>/<header|footer>-<uuid>.<ext>
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET_IMAGENES = "marketing-images";

export function rutaDeImagen(agencyId: string, plantillaId: string, cual: "header" | "footer", ext: string) {
  return `${agencyId}/documentos/${plantillaId}/${cual}-${crypto.randomUUID()}.${ext}`;
}

export function urlPublica(path: string | null): string | null {
  if (!path) return null;
  return createAdminClient().storage.from(BUCKET_IMAGENES).getPublicUrl(path).data.publicUrl;
}
```

- [ ] **Step 2: Test de los endpoints (conducta: qué se escribió, no el mensaje)**

```typescript
// app/api/documentos-plantillas/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null };
const base = { filas: [] as Record<string, unknown>[], insertadas: [] as Record<string, unknown>[] };

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }));

const cliente = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        order: async () => ({ data: base.filas.filter((f) => f.agency_id === AGENCIA), error: null }),
      }),
    }),
    insert: (fila: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          const nueva = { id: "p-1", version: 1, activa: false, ...fila };
          base.insertadas.push(nueva);
          return { data: nueva, error: null };
        },
      }),
    }),
  }),
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente() }));

const { GET, POST } = await import("./route");

const crear = (nombre: unknown) =>
  POST(new Request("http://x/api/documentos-plantillas", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }),
  }));

beforeEach(() => { sesion.role = "director"; base.filas = []; base.insertadas = []; });

describe("solo el director", () => {
  it("un asesor no puede crear y NO se escribe nada", async () => {
    sesion.role = "asesor";
    expect((await crear("Presentación")).status).toBe(403);
    expect(base.insertadas).toEqual([]);
  });
});

describe("crear", () => {
  it("nace inactiva, con la agencia de la sesión, y el nombre limpio", async () => {
    const res = await crear("  Presentación de la inmobiliaria  ");
    expect(res.status).toBe(200);
    expect(base.insertadas[0]).toMatchObject({ agency_id: AGENCIA, nombre: "Presentación de la inmobiliaria", activa: false, created_by: "u1" });
  });
  it("sin nombre no crea", async () => {
    expect((await crear("   ")).status).toBe(400);
    expect(base.insertadas).toEqual([]);
  });
});

describe("listar", () => {
  it("devuelve las de la agencia normalizadas", async () => {
    base.filas = [{ id: "p-1", agency_id: AGENCIA, nombre: "X", version: 3, activa: true, cuerpo: { type: "doc", content: [] } }];
    const { plantillas } = await (await GET()).json();
    expect(plantillas).toHaveLength(1);
    expect(plantillas[0]).toMatchObject({ id: "p-1", nombre: "X", version: 3, activa: true });
  });
});
```

```typescript
// app/api/documentos-plantillas/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null };
const base = {
  plantilla: null as Record<string, unknown> | null,
  compartidos: 0,
  updates: [] as Record<string, unknown>[],
  deletes: 0,
};

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }));
vi.mock("@/lib/documentos/storage", () => ({ urlPublica: (p: string | null) => (p ? `https://cdn/${p}` : null) }));

// Un cliente falso que imita SOLO el encadenado que usa el endpoint:
//   .select().eq("id").eq("agency_id").maybeSingle()   → la plantilla, si es de esa agencia
//   .select(_, {count, head}).eq("plantilla_id")        → cuántas veces se compartió
//   .update(datos).eq().eq().select().single()
//   .delete().eq().eq()
const cliente = () => ({
  from: (tabla: string) => ({
    select: () => ({
      eq: (_col: string, _val: unknown) => {
        if (tabla === "shared_documentos") return Promise.resolve({ count: base.compartidos, error: null });
        return {
          eq: (_col2: string, agencia: unknown) => ({
            maybeSingle: async () => ({
              data: base.plantilla && base.plantilla.agency_id === agencia ? base.plantilla : null,
              error: null,
            }),
          }),
        };
      },
    }),
    update: (datos: Record<string, unknown>) => ({
      eq: () => ({ eq: () => ({ select: () => ({ single: async () => { base.updates.push(datos); return { data: { ...base.plantilla, ...datos }, error: null }; } }) }) }),
    }),
    delete: () => ({ eq: () => ({ eq: async () => { base.deletes++; return { error: null }; } }) }),
  }),
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => cliente() }));

const { GET, PUT, DELETE } = await import("./route");
const params = { params: { id: "p-1" } };
const req = (method: string, body?: unknown) =>
  new Request("http://x/api/documentos-plantillas/p-1", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] };

beforeEach(() => {
  sesion.role = "director";
  base.plantilla = { id: "p-1", agency_id: AGENCIA, nombre: "X", version: 2, activa: false, cuerpo: DOC, header_path: null, footer_path: null, bloque_asesor: { texto: DOC, posicion: "footer" } };
  base.compartidos = 0; base.updates = []; base.deletes = 0;
});

describe("aislamiento", () => {
  it("una plantilla de otra agencia es 404, no se filtra que existe", async () => {
    base.plantilla!.agency_id = OTRA;
    expect((await GET(req("GET"), params)).status).toBe(404);
  });
  it("un asesor no edita ni borra", async () => {
    sesion.role = "asesor";
    expect((await PUT(req("PUT", { nombre: "Y" }), params)).status).toBe(403);
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
    expect(base.updates).toEqual([]);
    expect(base.deletes).toBe(0);
  });
});

describe("editar", () => {
  it("guarda nombre, cuerpo, bloque y activa, y sube la versión en 1", async () => {
    const res = await PUT(req("PUT", { nombre: "Nueva", cuerpo: DOC, bloque_asesor: { texto: DOC, posicion: "ambos" }, activa: true }), params);
    expect(res.status).toBe(200);
    expect(base.updates[0]).toMatchObject({ nombre: "Nueva", activa: true, version: 3 });
    expect((base.updates[0].bloque_asesor as { posicion: string }).posicion).toBe("ambos");
  });
  it("no se puede activar con el cuerpo vacío", async () => {
    const res = await PUT(req("PUT", { nombre: "Nueva", cuerpo: { type: "doc", content: [] }, activa: true }), params);
    expect(res.status).toBe(400);
    expect(base.updates).toEqual([]);
  });
  it("un cuerpo que es HTML no entra: cae en el doc vacío y, si se quería activar, se rechaza", async () => {
    const res = await PUT(req("PUT", { nombre: "N", cuerpo: "<img onerror=alert(1)>", activa: true }), params);
    expect(res.status).toBe(400);
  });
});

describe("borrar", () => {
  it("si nunca se compartió, se borra", async () => {
    const { borrada } = await (await DELETE(req("DELETE"), params)).json();
    expect(borrada).toBe(true);
    expect(base.deletes).toBe(1);
  });
  it("si ya tiene links, NO se borra: se desactiva, y el cliente con el link no ve un 404", async () => {
    base.compartidos = 3;
    const { borrada, desactivada } = await (await DELETE(req("DELETE"), params)).json();
    expect(borrada).toBe(false);
    expect(desactivada).toBe(true);
    expect(base.deletes).toBe(0);
    expect(base.updates[0]).toMatchObject({ activa: false });
  });
});

describe("leer", () => {
  it("trae la plantilla con las urls públicas de las imágenes y cuántas veces se compartió", async () => {
    base.plantilla!.header_path = `${AGENCIA}/documentos/p-1/header-x.png`;
    base.compartidos = 5;
    const { plantilla, header_url, footer_url, compartidos } = await (await GET(req("GET"), params)).json();
    expect(plantilla.id).toBe("p-1");
    expect(header_url).toBe(`https://cdn/${AGENCIA}/documentos/p-1/header-x.png`);
    expect(footer_url).toBeNull();
    expect(compartidos).toBe(5);
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run app/api/documentos-plantillas`
Expected: FAIL — rutas no encontradas.

- [ ] **Step 4: Implementar los tres endpoints**

```typescript
// app/api/documentos-plantillas/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { normalizarPlantilla, MAX_NOMBRE } from "@/lib/documentos/plantilla";

export const dynamic = "force-dynamic";

const COLUMNAS = "id, nombre, cuerpo, header_path, footer_path, bloque_asesor, version, activa, updated_at";

export async function GET() {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documentos_plantillas").select(COLUMNAS).eq("agency_id", agencyId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ plantillas: (data ?? []).map(normalizarPlantilla) });
  } catch (e: unknown) {
    console.error("documentos-plantillas GET:", e);
    return NextResponse.json({ error: "No se pudieron cargar las plantillas." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agencyId, userId, role } = await requireTenant();
    if (role !== "director") {
      return NextResponse.json({ error: "Solo el director crea plantillas." }, { status: 403 });
    }
    const body = (await req.json()) as { nombre?: unknown };
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, MAX_NOMBRE) : "";
    if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la plantilla." }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documentos_plantillas")
      .insert({ agency_id: agencyId, nombre, activa: false, created_by: userId })
      .select(COLUMNAS).single();
    if (error) throw error;
    return NextResponse.json({ plantilla: normalizarPlantilla(data) });
  } catch (e: unknown) {
    console.error("documentos-plantillas POST:", e);
    return NextResponse.json({ error: "No se pudo crear la plantilla." }, { status: 500 });
  }
}
```

```typescript
// app/api/documentos-plantillas/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { normalizarPlantilla, docVacio, esDoc, POSICIONES, MAX_NOMBRE, DOC_VACIO, type PosicionBloque } from "@/lib/documentos/plantilla";
import { urlPublica } from "@/lib/documentos/storage";

export const dynamic = "force-dynamic";

const COLUMNAS = "id, agency_id, nombre, cuerpo, header_path, footer_path, bloque_asesor, version, activa, updated_at";
type Ctx = { params: { id: string } };

/** La plantilla, solo si es de la agencia de la sesión. Otra agencia = null, igual que inexistente. */
async function propia(id: string, agencyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("documentos_plantillas").select(COLUMNAS).eq("id", id).eq("agency_id", agencyId).maybeSingle();
  return data;
}

async function vecesCompartida(id: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin.from("shared_documentos").select("token", { count: "exact", head: true }).eq("plantilla_id", id);
  return count ?? 0;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { agencyId } = await requireTenant();
    const fila = await propia(params.id, agencyId);
    if (!fila) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });
    const plantilla = normalizarPlantilla(fila);
    return NextResponse.json({
      plantilla,
      header_url: urlPublica(plantilla.header_path),
      footer_url: urlPublica(plantilla.footer_path),
      compartidos: await vecesCompartida(params.id),
    });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id] GET:", e);
    return NextResponse.json({ error: "No se pudo cargar la plantilla." }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director edita plantillas." }, { status: 403 });
    const actual = await propia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const body = (await req.json()) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, MAX_NOMBRE) : "";
    if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la plantilla." }, { status: 400 });

    const cuerpo = esDoc(body.cuerpo) ? body.cuerpo : DOC_VACIO;
    const bloqueIn = (body.bloque_asesor && typeof body.bloque_asesor === "object" ? body.bloque_asesor : {}) as Record<string, unknown>;
    const bloque_asesor = {
      texto: esDoc(bloqueIn.texto) ? bloqueIn.texto : DOC_VACIO,
      posicion: POSICIONES.includes(bloqueIn.posicion as PosicionBloque) ? bloqueIn.posicion : "ninguno",
    };
    const activa = body.activa === true;
    if (activa && docVacio(cuerpo)) {
      return NextResponse.json({ error: "Para activarla, la plantilla tiene que tener algo escrito en el cuerpo." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documentos_plantillas")
      .update({ nombre, cuerpo, bloque_asesor, activa, version: Number(actual.version ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq("id", params.id).eq("agency_id", agencyId)
      .select(COLUMNAS).single();
    if (error) throw error;
    return NextResponse.json({ plantilla: normalizarPlantilla(data) });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id] PUT:", e);
    return NextResponse.json({ error: "No se pudo guardar la plantilla." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director borra plantillas." }, { status: 403 });
    const actual = await propia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const supabase = await createClient();
    // Si ya se compartió, un cliente tiene un link. Borrarla lo dejaría en un 404: se desactiva.
    if ((await vecesCompartida(params.id)) > 0) {
      const { error } = await supabase.from("documentos_plantillas")
        .update({ activa: false, updated_at: new Date().toISOString() })
        .eq("id", params.id).eq("agency_id", agencyId).select(COLUMNAS).single();
      if (error) throw error;
      return NextResponse.json({ borrada: false, desactivada: true });
    }
    const { error } = await supabase.from("documentos_plantillas").delete().eq("id", params.id).eq("agency_id", agencyId);
    if (error) throw error;
    return NextResponse.json({ borrada: true });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id] DELETE:", e);
    return NextResponse.json({ error: "No se pudo borrar la plantilla." }, { status: 500 });
  }
}
```

```typescript
// app/api/documentos-plantillas/[id]/imagen/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { validarImagen } from "@/lib/documentos/imagen";
import { BUCKET_IMAGENES, rutaDeImagen, urlPublica } from "@/lib/documentos/storage";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };
const CUALES = ["header", "footer"] as const;
type Cual = (typeof CUALES)[number];

async function plantillaPropia(id: string, agencyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("documentos_plantillas").select("id, header_path, footer_path").eq("id", id).eq("agency_id", agencyId).maybeSingle();
  return data;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director carga imágenes." }, { status: 403 });
    const actual = await plantillaPropia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const cual = String(form.get("cual") ?? "") as Cual;
    if (!file) return NextResponse.json({ error: "No llegó ningún archivo." }, { status: 400 });
    if (!CUALES.includes(cual)) return NextResponse.json({ error: "Decime si es header o footer." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const v = await validarImagen(buffer, file.type);
    if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 });

    const admin = createAdminClient();
    const path = rutaDeImagen(agencyId, params.id, cual, v.ext);
    const { error: upErr } = await admin.storage.from(BUCKET_IMAGENES).upload(path, buffer, { contentType: file.type, upsert: true });
    if (upErr) throw upErr;

    // La anterior se borra: no hay motivo para acumular franjas viejas en el bucket.
    const anterior = cual === "header" ? actual.header_path : actual.footer_path;
    if (anterior) await admin.storage.from(BUCKET_IMAGENES).remove([anterior]);

    const supabase = await createClient();
    const { error } = await supabase.from("documentos_plantillas")
      .update({ [`${cual}_path`]: path, updated_at: new Date().toISOString() })
      .eq("id", params.id).eq("agency_id", agencyId);
    if (error) throw error;

    return NextResponse.json({ path, url: urlPublica(path), ancho: v.ancho, alto: v.alto });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id]/imagen POST:", e);
    return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director quita imágenes." }, { status: 403 });
    const actual = await plantillaPropia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const { cual } = (await req.json()) as { cual?: Cual };
    if (!cual || !CUALES.includes(cual)) return NextResponse.json({ error: "Decime si es header o footer." }, { status: 400 });

    const path = cual === "header" ? actual.header_path : actual.footer_path;
    if (path) await createAdminClient().storage.from(BUCKET_IMAGENES).remove([path]);

    const supabase = await createClient();
    const { error } = await supabase.from("documentos_plantillas")
      .update({ [`${cual}_path`]: null, updated_at: new Date().toISOString() })
      .eq("id", params.id).eq("agency_id", agencyId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id]/imagen DELETE:", e);
    return NextResponse.json({ error: "No se pudo quitar la imagen." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Correr y compilar**

Run: `npx vitest run app/api/documentos-plantillas && npx tsc --noEmit`
Expected: PASS — 11 tests; tipos limpios. Si el cliente falso del test de `[id]` no encaja con el encadenado real, **ajustar el falso, nunca el endpoint**.

- [ ] **Step 6: Meter el bug y ver rojo (los tres chequeos de seguridad)**

Cambiar `if (role !== "director")` por `if (false)` en el PUT; correr; **tienen que fallar** "un asesor no edita ni borra". Restaurar. Cambiar `.eq("agency_id", agencyId)` de `propia()` por nada; correr; **tiene que fallar** "una plantilla de otra agencia es 404". Restaurar. Cambiar `(await vecesCompartida(params.id)) > 0` por `false`; **tiene que fallar** "si ya tiene links, NO se borra". Restaurar.

- [ ] **Step 7: Commit**

```bash
git add lib/documentos/storage.ts app/api/documentos-plantillas/route.ts app/api/documentos-plantillas/route.test.ts "app/api/documentos-plantillas/[id]/route.ts" "app/api/documentos-plantillas/[id]/route.test.ts" "app/api/documentos-plantillas/[id]/imagen/route.ts"
git commit -m "feat(documentos): endpoints de plantillas, solo director, y borrar solo si nunca se compartio"
```

---

### Task 6: Compartir — las activas, el snapshot congelado y mis links

**Files:**
- Create: `lib/documentos/snapshot.ts`
- Create: `app/api/documentos/activas/route.ts`
- Create: `app/api/documentos/compartir/route.ts`
- Create: `app/api/documentos/mis-links/route.ts`
- Test: `lib/documentos/snapshot.test.ts`, `app/api/documentos/compartir/route.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Plantilla`, `normalizarPlantilla`), Task 2 (`valoresDeVariables`, `aplicarVariables`, `variablesQueFaltan`), `marcaDeLaAgencia` (lib/ficha/snapshot.ts), `generarToken` (lib/ficha/token.ts), `urlPublica` (Task 5).
- Produces:
  - `interface SnapshotDocumento { plantilla: { id; nombre; version; cuerpo: DocTiptap; header_url: string|null; footer_url: string|null; bloque_asesor: { texto: DocTiptap; posicion } }; agent: { full_name; email; phone; clasificacion; role; avatar_url }; agency: { id; name }; brand: MarcaAgencia; created_at: string }`
  - `function armarSnapshot(args: { plantilla: Plantilla; header_url; footer_url; agent; agency; brand }): SnapshotDocumento` — **ya con las variables aplicadas**
  - `GET /api/documentos/activas` → `{ plantillas: {id, nombre, version, tiene_header, tiene_footer}[], faltan: VariableId[] }`
  - `POST /api/documentos/compartir` body `{ plantilla_id }` → `{ token, path: "/documento/<token>" }`
  - `GET /api/documentos/mis-links` → `{ links: { token, path, nombre, version, created_at, view_count }[] }`

- [ ] **Step 1: Test del snapshot**

```typescript
// lib/documentos/snapshot.test.ts
import { describe, it, expect } from "vitest";
import { armarSnapshot } from "./snapshot";
import { normalizarPlantilla } from "./plantilla";

const m = (id: string) => ({ type: "mention", attrs: { id, label: `@${id}` } });
const t = (text: string) => ({ type: "text", text });
const doc = (...c: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content: c }] });

const plantilla = normalizarPlantilla({
  id: "p-1", nombre: "Presentación", version: 4,
  cuerpo: doc(t("Hola, soy "), m("nombre")),
  bloque_asesor: { texto: doc(m("nombre"), t(" | Cel: "), m("celular")), posicion: "footer" },
});
const agent = { full_name: "Ana Pérez", email: "a@x.com", phone: "5491123456789", clasificacion: "client_support", role: "asesor", avatar_url: null };
const agency = { id: "ag", name: "Central" };
const brand = { colors: ["#111"], font: "sans", logo_url: null };

describe("armarSnapshot", () => {
  it("congela plantilla, asesor, agencia y marca, con las variables YA aplicadas", () => {
    const s = armarSnapshot({ plantilla, header_url: "https://cdn/h.png", footer_url: null, agent, agency, brand });
    expect(s.plantilla).toMatchObject({ id: "p-1", nombre: "Presentación", version: 4, header_url: "https://cdn/h.png", footer_url: null });
    expect(JSON.stringify(s.plantilla.cuerpo)).toContain("Hola, soy Ana Pérez");
    expect(JSON.stringify(s.plantilla.cuerpo)).not.toContain("mention");
    expect(JSON.stringify(s.plantilla.bloque_asesor.texto)).toContain("+54 9 11 2345-6789");
    expect(s.agent.full_name).toBe("Ana Pérez");
    expect(s.brand).toEqual(brand);
    expect(typeof s.created_at).toBe("string");
  });

  it("usa el nombre de la agencia para @agencia", () => {
    const p = normalizarPlantilla({ id: "p", nombre: "n", version: 1, cuerpo: doc(m("agencia")) });
    const s = armarSnapshot({ plantilla: p, header_url: null, footer_url: null, agent, agency, brand });
    expect(JSON.stringify(s.plantilla.cuerpo)).toContain("Central");
  });
});
```

- [ ] **Step 2: Test del endpoint de compartir**

```typescript
// app/api/documentos/compartir/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sesion = { agencyId: AGENCIA, userId: "u1", role: "asesor" as string | null };
const base = {
  plantilla: null as Record<string, unknown> | null,
  insertadas: [] as Record<string, unknown>[],
};
const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola " }, { type: "mention", attrs: { id: "nombre" } }] }] };

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }));
vi.mock("@/lib/ficha/token", () => ({ generarToken: () => "tok123" }));
vi.mock("@/lib/documentos/storage", () => ({ urlPublica: (p: string | null) => (p ? `https://cdn/${p}` : null) }));

const cliente = () => ({
  from: (tabla: string) => ({
    select: () => ({
      eq: (_c: string, v: unknown) => ({
        eq: () => ({ maybeSingle: async () => ({ data: base.plantilla?.agency_id === AGENCIA && base.plantilla?.activa ? base.plantilla : null }) }),
        single: async () => tabla === "profiles"
          ? { data: { full_name: "Ana", email: "a@x", phone: "5491123456789", clasificacion: null, role: "asesor", avatar_url: null } }
          : { data: { id: AGENCIA, name: "Central", marketing_ai_config: { brand_colors: ["#123"] } } },
        maybeSingle: async () => ({ data: base.plantilla?.agency_id === AGENCIA && base.plantilla?.activa ? base.plantilla : null }),
      }),
    }),
    insert: async (fila: Record<string, unknown>) => { base.insertadas.push(fila); return { error: null }; },
  }),
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => cliente() }));

const { POST } = await import("./route");
const compartir = (plantilla_id: string) =>
  POST(new Request("http://x/api/documentos/compartir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plantilla_id }) }));

beforeEach(() => {
  sesion.role = "asesor";
  base.plantilla = { id: "p-1", agency_id: AGENCIA, nombre: "Presentación", version: 2, activa: true, cuerpo: DOC, header_path: "h.png", footer_path: null, bloque_asesor: { texto: DOC, posicion: "footer" } };
  base.insertadas = [];
});

describe("compartir", () => {
  it("el asesor puede, y el snapshot lleva SUS datos con las variables aplicadas", async () => {
    const res = await compartir("p-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "tok123", path: "/documento/tok123" });
    const fila = base.insertadas[0];
    expect(fila).toMatchObject({ token: "tok123", plantilla_id: "p-1", created_by: "u1", agency_id: AGENCIA });
    const snap = fila.snapshot as { plantilla: { cuerpo: unknown; header_url: string; version: number }; agent: { full_name: string } };
    expect(JSON.stringify(snap.plantilla.cuerpo)).toContain("Hola Ana");
    expect(snap.plantilla.header_url).toBe("https://cdn/h.png");
    expect(snap.plantilla.version).toBe(2);
    expect(snap.agent.full_name).toBe("Ana");
  });

  it("una plantilla inactiva no se comparte", async () => {
    base.plantilla!.activa = false;
    expect((await compartir("p-1")).status).toBe(404);
    expect(base.insertadas).toEqual([]);
  });

  it("una plantilla de otra agencia no se comparte", async () => {
    base.plantilla!.agency_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect((await compartir("p-1")).status).toBe(404);
    expect(base.insertadas).toEqual([]);
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run lib/documentos/snapshot.test.ts app/api/documentos`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 4: Implementar**

```typescript
// lib/documentos/snapshot.ts
// La copia congelada de un documento compartido. Lleva las variables YA reemplazadas: si
// mañana cambia el teléfono del asesor, el link que ya mandó no cambia.
import type { MarcaAgencia } from "@/lib/ficha/snapshot";
import type { Plantilla, DocTiptap, PosicionBloque } from "./plantilla";
import { valoresDeVariables, aplicarVariables } from "./variables";

export interface AgenteSnapshot {
  full_name: string; email: string; phone: string;
  clasificacion: string | null; role: string; avatar_url: string | null;
}

export interface SnapshotDocumento {
  plantilla: {
    id: string; nombre: string; version: number;
    cuerpo: DocTiptap;
    header_url: string | null; footer_url: string | null;
    bloque_asesor: { texto: DocTiptap; posicion: PosicionBloque };
  };
  agent: AgenteSnapshot;
  agency: { id: string; name: string };
  brand: MarcaAgencia;
  created_at: string;
}

export function armarSnapshot(args: {
  plantilla: Plantilla; header_url: string | null; footer_url: string | null;
  agent: AgenteSnapshot; agency: { id: string; name: string }; brand: MarcaAgencia;
}): SnapshotDocumento {
  const { plantilla, agent, agency } = args;
  const valores = valoresDeVariables({ ...agent, agencia: agency.name });
  return {
    plantilla: {
      id: plantilla.id, nombre: plantilla.nombre, version: plantilla.version,
      cuerpo: aplicarVariables(plantilla.cuerpo, valores),
      header_url: args.header_url, footer_url: args.footer_url,
      bloque_asesor: { texto: aplicarVariables(plantilla.bloque_asesor.texto, valores), posicion: plantilla.bloque_asesor.posicion },
    },
    agent, agency, brand: args.brand,
    created_at: new Date().toISOString(),
  };
}
```

```typescript
// app/api/documentos/activas/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { variablesQueFaltan } from "@/lib/documentos/variables";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { agencyId, userId } = await requireTenant();
    const supabase = await createClient();
    const [{ data: plantillas, error }, { data: perfil }, { data: agencia }] = await Promise.all([
      supabase.from("documentos_plantillas").select("id, nombre, version, header_path, footer_path")
        .eq("agency_id", agencyId).eq("activa", true).order("nombre"),
      supabase.from("profiles").select("full_name, email, phone, clasificacion, role").eq("id", userId).single(),
      supabase.from("agencies").select("name").eq("id", agencyId).single(),
    ]);
    if (error) throw error;
    return NextResponse.json({
      plantillas: (plantillas ?? []).map((p) => ({
        id: p.id, nombre: p.nombre, version: p.version,
        tiene_header: !!p.header_path, tiene_footer: !!p.footer_path,
      })),
      faltan: variablesQueFaltan({ ...(perfil ?? {}), agencia: agencia?.name }),
    });
  } catch (e: unknown) {
    console.error("documentos/activas GET:", e);
    return NextResponse.json({ error: "No se pudieron cargar los documentos." }, { status: 500 });
  }
}
```

```typescript
// app/api/documentos/compartir/route.ts
// Arma la copia congelada con los datos de QUIEN comparte y devuelve el link. Lo pueden usar
// el asesor y el director.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { generarToken } from "@/lib/ficha/token";
import { marcaDeLaAgencia } from "@/lib/ficha/snapshot";
import { normalizarPlantilla } from "@/lib/documentos/plantilla";
import { armarSnapshot } from "@/lib/documentos/snapshot";
import { urlPublica } from "@/lib/documentos/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { agencyId, userId } = await requireTenant();
    const { plantilla_id } = (await req.json()) as { plantilla_id?: string };
    if (!plantilla_id) return NextResponse.json({ error: "Falta la plantilla." }, { status: 400 });

    const supabase = await createClient();
    const { data: fila } = await supabase
      .from("documentos_plantillas")
      .select("id, agency_id, nombre, cuerpo, header_path, footer_path, bloque_asesor, version, activa, updated_at")
      .eq("id", plantilla_id).eq("agency_id", agencyId).maybeSingle();
    // Inactiva o ajena: para quien comparte, no existe.
    if (!fila || !fila.activa) return NextResponse.json({ error: "Ese documento no está disponible." }, { status: 404 });

    const [{ data: perfil }, { data: agencia }] = await Promise.all([
      supabase.from("profiles").select("full_name, email, phone, clasificacion, role, avatar_url").eq("id", userId).single(),
      supabase.from("agencies").select("id, name, marketing_ai_config").eq("id", agencyId).single(),
    ]);

    const plantilla = normalizarPlantilla(fila);
    const snapshot = armarSnapshot({
      plantilla,
      header_url: urlPublica(plantilla.header_path),
      footer_url: urlPublica(plantilla.footer_path),
      agent: {
        full_name: perfil?.full_name || "", email: perfil?.email || "", phone: perfil?.phone || "",
        clasificacion: perfil?.clasificacion ?? null, role: perfil?.role || "asesor", avatar_url: perfil?.avatar_url ?? null,
      },
      agency: { id: agencia?.id || agencyId, name: agencia?.name || "" },
      brand: marcaDeLaAgencia(agencia?.marketing_ai_config),
    });

    const token = generarToken();
    const { error } = await createAdminClient().from("shared_documentos").insert({
      token, snapshot, plantilla_id, created_by: userId, agency_id: agencyId,
    });
    if (error) throw error;

    return NextResponse.json({ token, path: `/documento/${token}` });
  } catch (e: unknown) {
    console.error("documentos/compartir POST:", e);
    return NextResponse.json({ error: "No se pudo armar el documento. Probá de nuevo." }, { status: 500 });
  }
}
```

```typescript
// app/api/documentos/mis-links/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId, agencyId } = await requireTenant();
    // shared_documentos no tiene políticas: se lee con admin y se filtra acá por quien pide.
    const { data, error } = await createAdminClient()
      .from("shared_documentos").select("token, snapshot, created_at, view_count")
      .eq("created_by", userId).eq("agency_id", agencyId)
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json({
      links: (data ?? []).map((f) => {
        const p = (f.snapshot as { plantilla?: { nombre?: string; version?: number } })?.plantilla ?? {};
        return { token: f.token, path: `/documento/${f.token}`, nombre: p.nombre ?? "", version: p.version ?? 0, created_at: f.created_at, view_count: f.view_count };
      }),
    });
  } catch (e: unknown) {
    console.error("documentos/mis-links GET:", e);
    return NextResponse.json({ error: "No se pudieron cargar tus links." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Correr, compilar, y meter el bug**

Run: `npx vitest run lib/documentos/snapshot.test.ts app/api/documentos && npx tsc --noEmit`
Expected: PASS — 5 tests. Luego: quitar `|| !fila.activa` del compartir → tiene que fallar "una plantilla inactiva no se comparte". Restaurar.

- [ ] **Step 6: Commit**

```bash
git add lib/documentos/snapshot.ts lib/documentos/snapshot.test.ts app/api/documentos/activas/route.ts app/api/documentos/compartir/route.ts app/api/documentos/compartir/route.test.ts app/api/documentos/mis-links/route.ts
git commit -m "feat(documentos): compartir congela plantilla, asesor, agencia y marca con las variables aplicadas"
```

---

### Task 7: El documento público `/documento/[token]` y su render compartido

**Files:**
- Create: `components/documentos/RenderDocumento.tsx` (server-safe: recibe el snapshot y dibuja; lo usan la página pública y la vista previa)
- Create: `app/documento/[token]/page.tsx`
- Create: `app/documento/[token]/documento.css` (import en la página)

**Interfaces:**
- Consumes: Task 6 (`SnapshotDocumento`), Task 3 (`generarHtml`), `PrintButton` (`app/ficha-acm/[token]/PrintButton.tsx`, props `{ accent, onAccent, fileName }`), `readableOn` (se copia de la ficha de selección: 6 líneas).
- Produces: `function RenderDocumento({ snap, modo }: { snap: SnapshotDocumento; modo: "pantalla" | "impresion" })` — devuelve el `<article class="documento">`.

- [ ] **Step 1: El render**

```tsx
// components/documentos/RenderDocumento.tsx
// Dibuja un documento a partir de su snapshot. Lo usan la página pública (con los datos
// congelados) y la vista previa del director (con un asesor real y la plantilla sin guardar).
// No es "use client": no tiene estado. El HTML sale de generarHtml, con la lista fija de
// extensiones, y por eso se puede poner con dangerouslySetInnerHTML sin sanitizar.
import { generarHtml } from "@/lib/documentos/tiptap";
import type { SnapshotDocumento } from "@/lib/documentos/snapshot";

export function RenderDocumento({ snap }: { snap: SnapshotDocumento }) {
  const { plantilla } = snap;
  const bloque = plantilla.bloque_asesor;
  const bloqueHtml = generarHtml(bloque.texto);
  const arriba = bloque.posicion === "header" || bloque.posicion === "ambos";
  const abajo = bloque.posicion === "footer" || bloque.posicion === "ambos";

  return (
    <article className="documento">
      {(plantilla.header_url || arriba) && (
        <header className="documento-header">
          {plantilla.header_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plantilla.header_url} alt="" className="documento-franja" />
          )}
          {arriba && bloqueHtml && <div className="documento-bloque" dangerouslySetInnerHTML={{ __html: bloqueHtml }} />}
        </header>
      )}

      <main className="documento-cuerpo" dangerouslySetInnerHTML={{ __html: generarHtml(plantilla.cuerpo) }} />

      {(plantilla.footer_url || abajo) && (
        <footer className="documento-footer">
          {abajo && bloqueHtml && <div className="documento-bloque" dangerouslySetInnerHTML={{ __html: bloqueHtml }} />}
          {plantilla.footer_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plantilla.footer_url} alt="" className="documento-franja" />
          )}
        </footer>
      )}
    </article>
  );
}
```

- [ ] **Step 2: El CSS (pantalla continua; en impresión header y footer se repiten por hoja)**

```css
/* app/documento/[token]/documento.css */
.documento-root { background: #e9e6df; min-height: 100vh; padding: 24px 12px 90px; font-family: var(--font-body); color: #1c1c1c; }
.documento { background: #fff; max-width: 794px; margin: 0 auto; box-shadow: 0 8px 30px rgba(0,0,0,.12); }
.documento-franja { display: block; width: 100%; height: auto; }
.documento-bloque { padding: 10px 40px; font-size: 14px; line-height: 1.5; }
.documento-bloque p { margin: 0; }
.documento-cuerpo { padding: 28px 48px 36px; font-size: 15px; line-height: 1.7; }
.documento-cuerpo h2 { font-family: var(--font-display); font-size: 24px; margin: 22px 0 10px; }
.documento-cuerpo h3 { font-family: var(--font-display); font-size: 18px; margin: 18px 0 8px; }
.documento-cuerpo p { margin: 0 0 12px; }
.documento-cuerpo ul, .documento-cuerpo ol { margin: 0 0 12px 22px; }
.documento-cuerpo .variable, .documento-bloque .variable { background: #fff3d6; border-radius: 3px; padding: 0 2px; }

@media (max-width: 640px) {
  .documento-bloque { padding: 8px 16px; font-size: 13px; }
  .documento-cuerpo { padding: 18px 16px 24px; font-size: 15px; }
}

/* Impresión: A4 sin márgenes; header y footer fijos que se repiten en cada hoja, y el cuerpo
   con relleno arriba y abajo para no quedar debajo. Las alturas las fija el navegador según
   la imagen; el relleno se calcula en la página con el alto medido de cada franja. */
@media print {
  @page { size: A4; margin: 0; }
  body > *:not(.documento-root) { display: none !important; }
  .documento-root { background: #fff; padding: 0; }
  .documento { max-width: none; box-shadow: none; }
  .documento-header { position: fixed; top: 0; left: 0; right: 0; background: #fff; }
  .documento-footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
  .documento-cuerpo { padding-top: var(--alto-header, 0px); padding-bottom: var(--alto-footer, 0px); }
  .documento-bloque .variable, .documento-cuerpo .variable { background: none; }
  .no-print { display: none !important; }
}
```

- [ ] **Step 3: La página pública**

```tsx
// app/documento/[token]/page.tsx
// El documento que el asesor le mandó a su cliente. Público por el middleware, igual que
// /ficha-acm/[token] y /seleccion/[token]. Se lee con service-role: shared_documentos no
// tiene políticas.
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Playfair_Display, Inter } from "next/font/google";
import type { Metadata } from "next";
import PrintButton from "@/app/ficha-acm/[token]/PrintButton";
import { RenderDocumento } from "@/components/documentos/RenderDocumento";
import type { SnapshotDocumento } from "@/lib/documentos/snapshot";
import AltoDeFranjas from "./AltoDeFranjas";
import "./documento.css";

export const dynamic = "force-dynamic";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

function readableOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0c0c0c" : "#ffffff";
}

async function getDocumento(token: string): Promise<SnapshotDocumento | undefined> {
  const { data } = await createAdminClient().from("shared_documentos").select("snapshot").eq("token", token).single();
  return data?.snapshot as SnapshotDocumento | undefined;
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await getDocumento(params.token);
  if (!snap) return { title: "Documento no disponible" };
  return { title: `${snap.plantilla.nombre} | ${snap.agency?.name || "PRISMA"}` };
}

export default async function DocumentoPage({ params }: { params: { token: string } }) {
  const snap = await getDocumento(params.token);
  if (!snap) notFound();

  try { await createAdminClient().rpc("increment_shared_documento_view", { p_token: params.token }); } catch { /* best-effort */ }

  const colors = snap.brand?.colors?.length ? snap.brand.colors : DEFAULT_COLORS;
  const accent = colors[1] || colors[0] || DEFAULT_COLORS[1];
  const nombreArchivo = `${snap.plantilla.nombre} - ${snap.agency?.name || "PRISMA"}`.replace(/[\\/:*?"<>|]+/g, " ");

  return (
    <div className={`${playfair.variable} ${inter.variable} documento-root`}>
      <AltoDeFranjas />
      <PrintButton accent={accent} onAccent={readableOn(accent)} fileName={nombreArchivo} />
      <RenderDocumento snap={snap} />
    </div>
  );
}
```

```tsx
// app/documento/[token]/AltoDeFranjas.tsx
// Mide el alto real del header y del footer y lo deja en variables CSS, para que al imprimir
// el cuerpo tenga el relleno justo y no quede debajo de las franjas fijas.
"use client";
import { useEffect } from "react";

export default function AltoDeFranjas() {
  useEffect(() => {
    const medir = () => {
      const h = document.querySelector<HTMLElement>(".documento-header");
      const f = document.querySelector<HTMLElement>(".documento-footer");
      const root = document.querySelector<HTMLElement>(".documento-root");
      if (!root) return;
      root.style.setProperty("--alto-header", `${h?.offsetHeight ?? 0}px`);
      root.style.setProperty("--alto-footer", `${f?.offsetHeight ?? 0}px`);
    };
    medir();
    window.addEventListener("beforeprint", medir);
    window.addEventListener("resize", medir);
    document.querySelectorAll("img").forEach((img) => img.addEventListener("load", medir));
    return () => { window.removeEventListener("beforeprint", medir); window.removeEventListener("resize", medir); };
  }, []);
  return null;
}
```

- [ ] **Step 4: Confirmar que la ruta es pública en el middleware**

Run: `grep -n "ficha-acm\|/seleccion" middleware.ts`
Expected: aparecen las rutas públicas. Agregar `/documento` **de la misma forma** que está `/seleccion` (misma línea o mismo arreglo). Si no hay lista y son públicas por no estar bajo `/asesor` ni `/director`, no hay nada que hacer — anotarlo en el commit.

- [ ] **Step 5: Compilar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add components/documentos/RenderDocumento.tsx "app/documento/[token]/page.tsx" "app/documento/[token]/documento.css" "app/documento/[token]/AltoDeFranjas.tsx" middleware.ts
git commit -m "feat(documentos): la pagina publica del documento, con header y footer repetidos en cada hoja al imprimir"
```

---

### Task 8: El editor Tiptap con variables

**Files:**
- Create: `components/documentos/EditorDocumento.tsx`
- Create: `components/documentos/MenuVariables.tsx`

**Interfaces:**
- Consumes: Task 3 (`extensionesDocumento`), Task 2 (`VARIABLES`).
- Produces: `function EditorDocumento({ value, onChange, compacto }: { value: DocTiptap; onChange: (doc: DocTiptap) => void; compacto?: boolean })`

- [ ] **Step 1: El menú de variables (lo que aparece al tipear @)**

```tsx
// components/documentos/MenuVariables.tsx
"use client";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { VARIABLES } from "@/lib/documentos/variables";

export type ItemVariable = { id: string; label: string; descripcion: string };
type Props = { items: ItemVariable[]; command: (item: { id: string; label: string }) => void };

export const MenuVariables = forwardRef<{ onKeyDown: (p: { event: KeyboardEvent }) => boolean }, Props>(
  function MenuVariables({ items, command }, ref) {
    const [sel, setSel] = useState(0);
    useEffect(() => setSel(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") { setSel((s) => (s + items.length - 1) % items.length); return true; }
        if (event.key === "ArrowDown") { setSel((s) => (s + 1) % items.length); return true; }
        if (event.key === "Enter") { const it = items[sel]; if (it) command({ id: it.id, label: it.label }); return true; }
        return false;
      },
    }));

    if (!items.length) return <div className="rounded-lg border bg-card p-2 text-xs text-muted-foreground shadow">No hay variables con ese nombre.</div>;
    return (
      <div className="rounded-lg border bg-card shadow-lg overflow-hidden min-w-[260px]">
        {items.map((it, i) => (
          <button
            key={it.id} type="button"
            onClick={() => command({ id: it.id, label: it.label })}
            className={`w-full text-left px-3 py-2 text-sm ${i === sel ? "bg-accent/15" : "hover:bg-muted/60"}`}
          >
            <span className="font-semibold text-accent">{it.label}</span>
            <span className="block text-[11px] text-muted-foreground">{it.descripcion}</span>
          </button>
        ))}
      </div>
    );
  },
);

export const itemsDeVariables = (query: string): ItemVariable[] =>
  VARIABLES.filter((v) => v.id.startsWith(query.toLowerCase())).map((v) => ({ id: v.id, label: v.label, descripcion: v.descripcion }));
```

- [ ] **Step 2: El editor**

```tsx
// components/documentos/EditorDocumento.tsx
"use client";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import tippy, { type Instance as Tippy } from "tippy.js";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Heading2, Heading3, AtSign } from "lucide-react";
import { extensionesDocumento } from "@/lib/documentos/tiptap";
import type { DocTiptap } from "@/lib/documentos/plantilla";
import { MenuVariables, itemsDeVariables } from "./MenuVariables";

/** Las mismas extensiones que el servidor, y además la sugerencia de variables al tipear @. */
function extensionesConSugerencia() {
  return extensionesDocumento().map((ext) =>
    ext.name === "mention"
      ? Mention.configure({
          HTMLAttributes: { class: "variable" },
          renderText: ({ node }) => String(node.attrs.label ?? `@${node.attrs.id}`),
          suggestion: {
            char: "@",
            items: ({ query }) => itemsDeVariables(query),
            render: () => {
              let comp: ReactRenderer<{ onKeyDown: (p: { event: KeyboardEvent }) => boolean }>;
              let pop: Tippy[];
              return {
                onStart: (props) => {
                  comp = new ReactRenderer(MenuVariables, { props, editor: props.editor });
                  pop = tippy("body", { getReferenceClientRect: props.clientRect as () => DOMRect, appendTo: () => document.body, content: comp.element, showOnCreate: true, interactive: true, trigger: "manual", placement: "bottom-start" });
                },
                onUpdate: (props) => { comp.updateProps(props); pop[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect }); },
                onKeyDown: (props) => { if (props.event.key === "Escape") { pop[0].hide(); return true; } return comp.ref?.onKeyDown(props) ?? false; },
                onExit: () => { pop[0].destroy(); comp.destroy(); },
              };
            },
          },
        })
      : ext,
  );
}

export function EditorDocumento({ value, onChange, compacto = false }: { value: DocTiptap; onChange: (doc: DocTiptap) => void; compacto?: boolean }) {
  const editor = useEditor({
    extensions: extensionesConSugerencia(),
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocTiptap),
    editorProps: { attributes: { class: `prose prose-sm max-w-none focus:outline-none ${compacto ? "min-h-[64px]" : "min-h-[320px]"} px-3 py-2` } },
  });
  if (!editor) return null;

  const B = ({ on, activo, title, children }: { on: () => void; activo?: boolean; title: string; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); on(); }}
      className={`h-8 w-8 inline-flex items-center justify-center rounded ${activo ? "bg-accent/20 text-accent" : "hover:bg-muted"}`}>
      {children}
    </button>
  );

  return (
    <div className="rounded-lg border border-accent/15 bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-accent/10 px-2 py-1">
        <B title="Negrita" activo={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></B>
        <B title="Cursiva" activo={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></B>
        <B title="Subrayado" activo={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></B>
        {!compacto && (<>
          <span className="mx-1 h-5 w-px bg-accent/15" />
          <B title="Título" activo={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></B>
          <B title="Subtítulo" activo={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></B>
          <B title="Lista" activo={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></B>
          <B title="Lista numerada" activo={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></B>
          <span className="mx-1 h-5 w-px bg-accent/15" />
          <B title="Izquierda" activo={editor.isActive({ textAlign: "left" })} on={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></B>
          <B title="Centro" activo={editor.isActive({ textAlign: "center" })} on={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></B>
          <B title="Derecha" activo={editor.isActive({ textAlign: "right" })} on={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></B>
        </>)}
        <span className="mx-1 h-5 w-px bg-accent/15" />
        <B title="Insertar variable (o escribí @)" on={() => editor.chain().focus().insertContent("@").run()}><AtSign className="h-4 w-4" /></B>
        <span className="ml-auto text-[11px] text-muted-foreground pr-1">Escribí <b>@</b> para poner el nombre, el mail o el celular del asesor</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

Run: `npm install tippy.js@6.3.7` (lo usa la sugerencia de Tiptap; si ya está instalado, saltear).

- [ ] **Step 3: Compilar**

Run: `npx tsc --noEmit`
Expected: sin errores. Si `ReactRenderer` o `suggestion` tipan distinto en 3.31.3, ajustar los tipos **sin cambiar el comportamiento**: el menú aparece al tipear `@`, filtra por lo que se escribe, y Enter inserta la mención.

- [ ] **Step 4: Commit**

```bash
git add components/documentos/EditorDocumento.tsx components/documentos/MenuVariables.tsx package.json package-lock.json
git commit -m "feat(documentos): editor Tiptap con formato basico y variables al escribir @"
```

---

### Task 9: La pantalla del director — armar la plantilla, con guía y vista previa

**Files:**
- Create: `components/documentos/PlantillaForm.tsx`
- Create: `components/documentos/PlantillasClientes.tsx`
- Create: `components/asesor-docs/PlantillasSolapas.tsx`
- Modify: `app/director/asesores/page.tsx:787` (`<PlantillasTab />` → `<PlantillasSolapas />`)
- Modify: `components/asesor-docs/PlantillasTab.tsx:323` (título → "Contratos desde Word")
- Create: `app/api/documentos/vista-previa/route.ts` (POST: la plantilla sin guardar + un asesor real → snapshot para RenderDocumento)

**Interfaces:**
- Consumes: Tasks 5, 6, 7, 8.
- Produces: `POST /api/documentos/vista-previa` body `{ plantilla: Plantilla-parcial, header_url, footer_url }` → `{ snapshot: SnapshotDocumento, asesor: string }` (director; usa el primer asesor activo de la agencia, o el propio director si no hay).

- [ ] **Step 1: Endpoint de vista previa**

```typescript
// app/api/documentos/vista-previa/route.ts
// Arma el snapshot de una plantilla SIN GUARDARLA, con un asesor real de la agencia, para que
// el director vea cómo queda antes de guardar. No escribe nada.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { marcaDeLaAgencia } from "@/lib/ficha/snapshot";
import { normalizarPlantilla } from "@/lib/documentos/plantilla";
import { armarSnapshot } from "@/lib/documentos/snapshot";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { agencyId, userId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director." }, { status: 403 });
    const body = (await req.json()) as { plantilla?: unknown; header_url?: string | null; footer_url?: string | null };

    const supabase = await createClient();
    const [{ data: asesor }, { data: yo }, { data: agencia }] = await Promise.all([
      supabase.from("profiles").select("full_name, email, phone, clasificacion, role, avatar_url")
        .eq("agency_id", agencyId).eq("role", "asesor").eq("estado", "activo").order("full_name").limit(1).maybeSingle(),
      supabase.from("profiles").select("full_name, email, phone, clasificacion, role, avatar_url").eq("id", userId).single(),
      supabase.from("agencies").select("id, name, marketing_ai_config").eq("id", agencyId).single(),
    ]);
    const modelo = asesor ?? yo;
    const snapshot = armarSnapshot({
      plantilla: normalizarPlantilla(body.plantilla),
      header_url: body.header_url ?? null, footer_url: body.footer_url ?? null,
      agent: {
        full_name: modelo?.full_name || "", email: modelo?.email || "", phone: modelo?.phone || "",
        clasificacion: modelo?.clasificacion ?? null, role: modelo?.role || "asesor", avatar_url: modelo?.avatar_url ?? null,
      },
      agency: { id: agencia?.id || agencyId, name: agencia?.name || "" },
      brand: marcaDeLaAgencia(agencia?.marketing_ai_config),
    });
    return NextResponse.json({ snapshot, asesor: modelo?.full_name || "" });
  } catch (e: unknown) {
    console.error("documentos/vista-previa POST:", e);
    return NextResponse.json({ error: "No se pudo armar la vista previa." }, { status: 500 });
  }
}
```

- [ ] **Step 2: El formulario de la plantilla**

```tsx
// components/documentos/PlantillaForm.tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Trash2, Upload } from "lucide-react";
import { EditorDocumento } from "./EditorDocumento";
import { RenderDocumento } from "./RenderDocumento";
import { normalizarPlantilla, POSICIONES, type Plantilla, type PosicionBloque } from "@/lib/documentos/plantilla";
import { GUIA_IMAGEN } from "@/lib/documentos/imagen";
import type { SnapshotDocumento } from "@/lib/documentos/snapshot";

const NOMBRE_POSICION: Record<PosicionBloque, string> = {
  header: "Debajo del header", footer: "Arriba del footer", ambos: "En los dos", ninguno: "No lo pongas",
};

export function PlantillaForm({ id, onVolver }: { id: string; onVolver: () => void }) {
  const [p, setP] = useState<Plantilla | null>(null);
  const [urls, setUrls] = useState<{ header: string | null; footer: string | null }>({ header: null, footer: null });
  const [compartidos, setCompartidos] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<"header" | "footer" | null>(null);
  const [previa, setPrevia] = useState<{ snapshot: SnapshotDocumento; asesor: string } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/documentos-plantillas/${id}`);
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "No se pudo cargar"); return; }
      setP(normalizarPlantilla(d.plantilla));
      setUrls({ header: d.header_url, footer: d.footer_url });
      setCompartidos(d.compartidos ?? 0);
    })();
  }, [id]);

  // Vista previa con un asesor real, al ritmo de lo que escribe (con una pausa para no pegarle al servidor por tecla).
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(async () => {
      const r = await fetch("/api/documentos/vista-previa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantilla: p, header_url: urls.header, footer_url: urls.footer }),
      });
      if (r.ok) setPrevia(await r.json());
    }, 600);
    return () => clearTimeout(t);
  }, [p, urls]);

  const guardar = async () => {
    if (!p) return;
    setGuardando(true);
    try {
      const r = await fetch(`/api/documentos-plantillas/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: p.nombre, cuerpo: p.cuerpo, bloque_asesor: p.bloque_asesor, activa: p.activa }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo guardar");
      setP(normalizarPlantilla(d.plantilla));
      toast.success(p.activa ? "Guardada y activa: tus asesores ya la pueden compartir." : "Guardada como borrador.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setGuardando(false); }
  };

  // Si se rechaza, el nombre del archivo queda a la vista junto al motivo, para corregir sin
  // empezar de cero. Solo se limpia cuando subió bien.
  const [rechazo, setRechazo] = useState<{ cual: "header" | "footer"; archivo: string; motivo: string } | null>(null);
  const subir = async (cual: "header" | "footer", input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setSubiendo(cual);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("cual", cual);
      const r = await fetch(`/api/documentos-plantillas/${id}/imagen`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setRechazo({ cual, archivo: file.name, motivo: d.error || "No se pudo subir" }); return; }
      setRechazo(null);
      input.value = "";
      setUrls((u) => ({ ...u, [cual]: d.url }));
      setP((x) => (x ? { ...x, [`${cual}_path`]: d.path } : x));
      toast.success(`${cual === "header" ? "Header" : "Footer"} cargado (${d.ancho}×${d.alto} px)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir"); }
    finally { setSubiendo(null); }
  };

  const quitar = async (cual: "header" | "footer") => {
    const r = await fetch(`/api/documentos-plantillas/${id}/imagen`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cual }) });
    if (r.ok) { setUrls((u) => ({ ...u, [cual]: null })); setP((x) => (x ? { ...x, [`${cual}_path`]: null } : x)); }
  };

  if (!p) return <div className="py-12 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-accent" /></div>;

  const Franja = ({ cual }: { cual: "header" | "footer" }) => (
    <div className="rounded-lg border border-accent/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{cual === "header" ? "Header (arriba)" : "Footer (abajo)"} <span className="font-normal text-muted-foreground">· opcional</span></h4>
        {urls[cual] && <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => quitar(cual)}><Trash2 className="h-3 w-3 mr-1" />Quitar</Button>}
      </div>
      {urls[cual] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls[cual]!} alt="" className="w-full rounded border" />
      ) : (
        <p className="text-xs text-muted-foreground">Sin imagen: el documento sale sin esta franja, y no pasa nada.</p>
      )}
      <label className="inline-flex items-center gap-2 text-xs text-accent cursor-pointer">
        {subiendo === cual ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {urls[cual] ? "Reemplazar imagen" : "Subir imagen"}
        <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={!!subiendo} onChange={(e) => subir(cual, e.target)} />
      </label>
      {rechazo?.cual === cual && (
        <p className="text-xs text-destructive"><b>{rechazo.archivo}</b>: {rechazo.motivo}</p>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Button variant="ghost" size="sm" onClick={onVolver}>← Volver a la lista</Button>

        <div>
          <label className="text-sm font-semibold">Nombre</label>
          <Input value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} placeholder="Presentación de la inmobiliaria" />
        </div>

        <div className="rounded-lg bg-muted/40 border border-accent/10 p-3 text-xs leading-relaxed">{GUIA_IMAGEN}</div>
        <Franja cual="header" />

        <div>
          <label className="text-sm font-semibold">Cuerpo</label>
          <EditorDocumento value={p.cuerpo} onChange={(cuerpo) => setP({ ...p, cuerpo })} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Bloque del asesor</label>
          <p className="text-xs text-muted-foreground">Lo que sale con los datos de cada persona. Ejemplo: <code>@nombre | @categoria</code> y abajo <code>@email | Cel: @celular</code>. Si a alguien le falta un dato, esa parte se omite sola.</p>
          <EditorDocumento compacto value={p.bloque_asesor.texto} onChange={(texto) => setP({ ...p, bloque_asesor: { ...p.bloque_asesor, texto } })} />
          <div className="flex flex-wrap gap-2">
            {POSICIONES.map((pos) => (
              <button key={pos} type="button" onClick={() => setP({ ...p, bloque_asesor: { ...p.bloque_asesor, posicion: pos } })}
                className={`rounded-full px-3 py-1 text-xs border ${p.bloque_asesor.posicion === pos ? "bg-accent text-accent-foreground border-accent" : "border-accent/20 hover:bg-muted"}`}>
                {NOMBRE_POSICION[pos]}
              </button>
            ))}
          </div>
        </div>

        <Franja cual="footer" />

        <div className="flex items-center justify-between rounded-lg border border-accent/10 p-3">
          <div>
            <div className="text-sm font-semibold">Activa</div>
            <div className="text-xs text-muted-foreground">Solo las activas aparecen para compartir. {compartidos > 0 && `Ya se compartió ${compartidos} ${compartidos === 1 ? "vez" : "veces"}.`}</div>
          </div>
          <Switch checked={p.activa} onCheckedChange={(activa) => setP({ ...p, activa })} />
        </div>

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar</Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Así lo va a ver el cliente{previa?.asesor ? ` · con los datos de ${previa.asesor}` : ""}</div>
        <div className="rounded-lg border border-accent/10 bg-[#e9e6df] p-3 overflow-auto max-h-[80vh]">
          {previa ? <div className="documento-root !p-0 !min-h-0 !bg-transparent"><RenderDocumento snap={previa.snapshot} /></div> : <p className="text-xs text-muted-foreground">Escribí algo para ver la vista previa.</p>}
        </div>
      </div>
    </div>
  );
}
```

Importar el CSS del documento donde se monte este formulario: en `PlantillasClientes.tsx` agregar `import "@/app/documento/[token]/documento.css";`.

- [ ] **Step 3: La lista, con "Crear nueva plantilla" y "Compartir"**

```tsx
// components/documentos/PlantillasClientes.tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Loader2, FileText, Share2, Pencil, Trash2 } from "lucide-react";
import { PlantillaForm } from "./PlantillaForm";
import type { Plantilla } from "@/lib/documentos/plantilla";
import "@/app/documento/[token]/documento.css";

export const PARA_QUE_SIRVE_CLIENTES =
  "Documentos que armás una vez y cada asesor comparte con sus clientes con sus propios datos: la presentación de la " +
  "inmobiliaria, las condiciones de la exclusiva, la guía para preparar la casa. Salen con tu marca, con link y con PDF. " +
  "Si mejorás una plantilla, lo que se comparta de ahí en adelante sale con la versión nueva; nadie tiene que hacer nada.";

export function PlantillasClientes() {
  const [lista, setLista] = useState<Plantilla[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const cargar = async () => {
    const r = await fetch("/api/documentos-plantillas");
    const d = await r.json();
    setLista(r.ok ? d.plantillas : []);
  };
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    if (!nuevoNombre.trim()) { toast.error("Ponele un nombre."); return; }
    setCreando(true);
    try {
      const r = await fetch("/api/documentos-plantillas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nuevoNombre }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNuevoNombre(""); await cargar(); setEditando(d.plantilla.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear"); }
    finally { setCreando(false); }
  };

  const compartir = async (id: string) => {
    const r = await fetch("/api/documentos/compartir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plantilla_id: id }) });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "No se pudo compartir"); return; }
    const url = `${window.location.origin}${d.path}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Link copiado. Abriéndolo…");
    window.open(url, "_blank");
  };

  const borrar = async (p: Plantilla) => {
    if (!confirm(`¿Borrar "${p.nombre}"?`)) return;
    const r = await fetch(`/api/documentos-plantillas/${p.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "No se pudo borrar"); return; }
    toast.success(d.borrada ? "Borrada." : "Ya se había compartido, así que quedó desactivada: los links que mandaron tus asesores siguen abiertos.");
    cargar();
  };

  if (editando) return <PlantillaForm id={editando} onVolver={() => { setEditando(null); cargar(); }} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">{PARA_QUE_SIRVE_CLIENTES}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre de la plantilla nueva" className="max-w-xs" onKeyDown={(e) => e.key === "Enter" && crear()} />
        <Button onClick={crear} disabled={creando}>{creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Crear nueva plantilla</Button>
      </div>
      {lista === null ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay plantillas. Creá la primera con el botón de arriba.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-accent/10 bg-card/40 px-4 py-3">
              <FileText className="h-4 w-4 text-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{p.nombre}</div>
                <div className="text-xs text-muted-foreground">v{p.version} · {p.activa ? "activa" : "borrador"}{p.header_path ? " · header" : ""}{p.footer_path ? " · footer" : ""}</div>
              </div>
              {p.activa && <Button size="sm" variant="secondary" onClick={() => compartir(p.id)}><Share2 className="h-3 w-3 mr-1" />Compartir</Button>}
              <Button size="sm" variant="ghost" onClick={() => setEditando(p.id)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => borrar(p)}><Trash2 className="h-3 w-3" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Las dos sub-solapas, y el renombre del módulo viejo**

```tsx
// components/asesor-docs/PlantillasSolapas.tsx
// Asesores → Plantillas tiene dos cosas distintas adentro. La primera es la que pidió Leonardo
// desde el principio; la segunda es el módulo de contratos Word que se construyó antes,
// renombrado para que se entienda qué es.
"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlantillasClientes } from "@/components/documentos/PlantillasClientes";
import { PlantillasTab } from "./PlantillasTab";

export function PlantillasSolapas() {
  return (
    <Tabs defaultValue="clientes" className="flex h-full min-h-0 flex-col">
      <TabsList className="self-start mb-3">
        <TabsTrigger value="clientes">Documentos para clientes</TabsTrigger>
        <TabsTrigger value="word">Contratos desde Word</TabsTrigger>
      </TabsList>
      <TabsContent value="clientes" className="flex-1 min-h-0 overflow-y-auto pr-1 data-[state=inactive]:hidden"><PlantillasClientes /></TabsContent>
      <TabsContent value="word" className="flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden"><PlantillasTab /></TabsContent>
    </Tabs>
  );
}
```

En `app/director/asesores/page.tsx`: cambiar el import de `PlantillasTab` por `import { PlantillasSolapas } from "@/components/asesor-docs/PlantillasSolapas"` y la línea 787 por `<PlantillasSolapas />`.

En `components/asesor-docs/PlantillasTab.tsx:323`: `Plantillas de documentos` → `Contratos desde Word`. Nada más.

- [ ] **Step 5: Compilar y correr los tests del módulo viejo (no tienen que cambiar)**

Run: `npx tsc --noEmit && npx vitest run lib/asesor-docs app/api/asesor-docs`
Expected: sin errores; los tests de asesor-docs siguen en verde. Si alguno mira el título "Plantillas de documentos", **actualizar ese test al título nuevo** y anotarlo en el commit.

- [ ] **Step 6: Commit**

```bash
git add components/documentos/PlantillaForm.tsx components/documentos/PlantillasClientes.tsx components/asesor-docs/PlantillasSolapas.tsx components/asesor-docs/PlantillasTab.tsx app/director/asesores/page.tsx app/api/documentos/vista-previa/route.ts
git commit -m "feat(documentos): la pantalla del director en Asesores > Plantillas, con guia y vista previa; el modulo Word pasa a segunda solapa"
```

---

### Task 10: La solapa "Para compartir" del asesor

**Files:**
- Create: `components/documentos/ParaCompartir.tsx`
- Modify: `app/asesor/documentos/page.tsx:278-288` (cuarta solapa)

**Interfaces:**
- Consumes: Task 6 (`/api/documentos/activas`, `/compartir`, `/mis-links`), Task 2 (`VARIABLES`).

- [ ] **Step 1: El componente**

```tsx
// components/documentos/ParaCompartir.tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Share2, Loader2, ExternalLink, Copy, AlertTriangle } from "lucide-react";
import { VARIABLES, type VariableId } from "@/lib/documentos/variables";

type Activa = { id: string; nombre: string; version: number; tiene_header: boolean; tiene_footer: boolean };
type Link = { token: string; path: string; nombre: string; version: number; created_at: string; view_count: number };

export function ParaCompartir() {
  const [activas, setActivas] = useState<Activa[] | null>(null);
  const [faltan, setFaltan] = useState<VariableId[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [compartiendo, setCompartiendo] = useState<string | null>(null);

  const cargar = async () => {
    const [a, l] = await Promise.all([fetch("/api/documentos/activas"), fetch("/api/documentos/mis-links")]);
    const da = await a.json(); const dl = await l.json();
    setActivas(a.ok ? da.plantillas : []); setFaltan(a.ok ? da.faltan : []); setLinks(l.ok ? dl.links : []);
  };
  useEffect(() => { cargar(); }, []);

  const compartir = async (id: string) => {
    setCompartiendo(id);
    try {
      const r = await fetch("/api/documentos/compartir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plantilla_id: id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const url = `${window.location.origin}${d.path}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Link copiado. Ya lo podés mandar.");
      await cargar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo compartir"); }
    finally { setCompartiendo(null); }
  };

  const copiar = async (path: string) => { await navigator.clipboard.writeText(`${window.location.origin}${path}`); toast.success("Copiado."); };
  const etiqueta = (id: VariableId) => VARIABLES.find((v) => v.id === id)?.label ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Para compartir</h2>
        <p className="text-muted-foreground text-sm">Documentos de la inmobiliaria que le podés mandar a un cliente. Salen con tu nombre y tus datos de contacto, con la marca de la agencia y con PDF.</p>
      </div>

      {faltan.filter((f) => f !== "agencia").length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>Te falta cargar {faltan.filter((f) => f !== "agencia").map(etiqueta).join(", ")}. Se completa en <b>Configuración</b>; mientras tanto, esa parte no sale en tus documentos.</div>
        </div>
      )}

      {activas === null ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : activas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tu director todavía no cargó ningún documento para compartir.</p>
      ) : (
        <ul className="space-y-2">
          {activas.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-accent/10 bg-card/40 px-4 py-3">
              <div className="min-w-0 flex-1"><div className="font-semibold truncate">{p.nombre}</div><div className="text-xs text-muted-foreground">versión {p.version}</div></div>
              <Button size="sm" onClick={() => compartir(p.id)} disabled={compartiendo === p.id}>
                {compartiendo === p.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Share2 className="h-3 w-3 mr-1" />}Compartir
              </Button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Los que ya generaste</h3>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.token} className="flex items-center gap-3 rounded-lg border border-accent/10 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1 truncate">{l.nombre} <span className="text-xs text-muted-foreground">v{l.version} · {new Date(l.created_at).toLocaleDateString("es-AR")} · {l.view_count} {l.view_count === 1 ? "vista" : "vistas"}</span></div>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => copiar(l.path)}><Copy className="h-3 w-3" /></Button>
                <a href={l.path} target="_blank" rel="noopener noreferrer" className="text-accent"><ExternalLink className="h-3 w-3" /></a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: La cuarta solapa en la Biblioteca**

En `app/asesor/documentos/page.tsx`: ampliar el tipo del estado a `"biblioteca" | "oficiales" | "mis-documentos" | "compartir"`, agregar después del `TabsTrigger` de "Mis Documentos":

```tsx
          <TabsTrigger value="compartir" className="rounded-lg px-4 h-9 text-sm data-[state=active]:bg-card data-[state=active]:text-accent gap-2">
            <Share2 className="h-4 w-4" /> Para compartir
          </TabsTrigger>
```

y su contenido, junto a los otros `TabsContent`:

```tsx
        <TabsContent value="compartir" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
          <ParaCompartir />
        </TabsContent>
```

con los imports `import { Share2 } from "lucide-react"` (sumarlo al import existente de lucide) y `import { ParaCompartir } from "@/components/documentos/ParaCompartir"`.

- [ ] **Step 3: Compilar y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add components/documentos/ParaCompartir.tsx app/asesor/documentos/page.tsx
git commit -m "feat(documentos): la solapa Para compartir en la Biblioteca del asesor"
```

---

### Task 11: Aplicar la migración en producción — con OK de Leonardo

**Files:** ninguno nuevo.

- [ ] **Step 1: Pedir el OK**

Mostrarle a Leonardo qué crea la migración (dos tablas nuevas, una función; nada existente se toca; cómo se deshace) y esperar su OK explícito.

- [ ] **Step 2: Aplicar**

Run: `node scratch/apply-sql.mjs supabase/migrations/20260909120000_documentos_para_clientes.sql`
Expected: el body HTTP dice éxito. (Gotcha anotado: en Windows el script puede terminar con exit 127 por un assert de libuv **después** de imprimir el body; se juzga por el body, no por el exit code.)

- [ ] **Step 3: Verificar releyendo producción**

Con un script de solo lectura, comprobar que existen `documentos_plantillas` y `shared_documentos` (select con `head: true`) y que `increment_shared_documento_view` responde. Verificar además que las políticas RLS están (`pg_policies`) — la memoria advierte que las políticas hechas a mano escapan a toda revisión: acá se miran contra producción.

---

### Task 12: Probarlo de verdad en el navegador

Con **PRISMAIA - VAKDOR**. Nunca con Central.

- [ ] **Step 1:** `npm run dev` en el worktree, en un puerto propio (verificar con una ruta que solo exista en esta rama, ej. `/api/documentos/activas` → distinto de 404).
- [ ] **Step 2 — La regla del no-toque:** Asesores → Plantillas abre en "Documentos para clientes"; la segunda solapa "Contratos desde Word" muestra exactamente lo de siempre.
- [ ] **Step 3 — Crear y armar:** "Crear nueva plantilla" → "Presentación". Escribir el cuerpo **tecleando** (`pressSequentially`), poner `@nombre` con el menú. Subir `Downloads/ejemplo header - central.jpeg` y `ejemplo footer - central.jpeg` (si el footer trae el bloque del asesor dibujado, recortarlo antes con sharp para la prueba: es lo que la guía le pide al director). Bloque del asesor: `**@nombre** | @categoria` / `@email | Cel: @celular`, posición "Arriba del footer". Ver la vista previa con un asesor real. Guardar como activa.
- [ ] **Step 4 — Imagen rechazada:** subir una de 800 px → mensaje con "1600" y el archivo sigue elegido.
- [ ] **Step 5 — Compartir como asesor:** con una cuenta descartable de asesor (nunca una real), Biblioteca → Para compartir → Compartir. Abrir el link **sin sesión**, escritorio y celular emulado. El footer con los datos de ESE asesor tiene que verse como el dibujo de Víctor.
- [ ] **Step 6 — PDF y paginación:** con un cuerpo de tres hojas, "Descargar PDF": header y footer en cada hoja, el texto no queda debajo de ninguno. Medir, no mirar: comparar `--alto-header` con el `padding-top` real del cuerpo.
- [ ] **Step 7 — Congelado:** editar la plantilla (cambiar una palabra), guardar, abrir el link viejo: no cambió. Compartir de nuevo: cambió. Los dos links con su versión en "Los que ya generaste".
- [ ] **Step 8 — Permisos:** con la cuenta de asesor, `PUT /api/documentos-plantillas/<id>` → 403; no ve "Crear nueva plantilla".
- [ ] **Step 9 — Sin franjas:** una plantilla sin header ni footer sale limpia, sin espacios vacíos.
- [ ] **Step 10 — Dato faltante:** en la cuenta descartable, vaciar el celular en Configuración, compartir: el footer sale sin "Cel:" suelto y la solapa avisa qué falta.
- [ ] **Step 11 — Borrar:** borrar la plantilla que ya se compartió → queda desactivada, el link sigue abierto. Borrar una nunca compartida → se va.
- [ ] **Step 12:** mostrarle a Leonardo y esperar su OK antes de mergear.

---

## Verificación final

- [ ] `npx vitest run` en verde (baseline + los nuevos)
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run build` sin errores (con el dev server **apagado**)
- [ ] Los pasos 2, 5, 6, 7 y 10 de la Task 12 verificados en el navegador
- [ ] Bitácora, TÉCNICO y FUNCIONAL (director y asesor) actualizados **antes** del merge
- [ ] OK explícito de Leonardo
