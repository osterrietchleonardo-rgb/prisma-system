# Selección de propiedades → ficha para el cliente · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asesor marque varias propiedades desde el Buscador IA o desde el mapa y genere **un** link con la marca de su inmobiliaria para mandarle al cliente.

**Architecture:** Un contexto de React guarda la selección mientras el asesor navega las dos solapas. Al confirmar, un endpoint congela un *snapshot* de cada propiedad en una tabla nueva (`shared_selections`) y devuelve un token; una página pública lee ese snapshot con la service key. La lógica de "una propiedad → pedazo de snapshot" se extrae de la ficha de una sola propiedad, que hoy la tiene pegada adentro del endpoint, para que las dos fichas no se desincronicen.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (`@supabase/ssr`), Tailwind, vitest, sonner (toasts), Radix (`components/ui/checkbox.tsx`, `textarea.tsx`).

**Spec:** `docs/superpowers/specs/2026-09-07-seleccion-propiedades-ficha-design.md`

## Global Constraints

- **Rama:** `feat/seleccion-propiedades-ficha`, sacada de `main`. **Nunca `git add -A`**: cada commit nombra sus archivos.
- **Tope de propiedades por ficha:** **12** (`TOPE_SELECCION`). Mismo número que el ACM (`app/asesor/acm/components/comparables-result.tsx:430`).
- **Tope de fotos por propiedad:** **16**. Mismo número que el ACM (`app/api/acm/ficha/route.ts:38`).
- **Textos de pantalla en español rioplatense, sin tecnicismos.** El que lee es un asesor inmobiliario o su cliente. Nunca "error 503", "token", "snapshot" ni "endpoint" en pantalla.
- **La ficha que ve el cliente NO lleva ningún dato de la inmobiliaria que publica** una propiedad de la red: ni nombre, ni logo, ni teléfono, ni link al aviso original. Ni el % de coincidencia, ni el badge de origen. Regla de `LOGICA-PRISMA.md` §10.8.
- **Tests:** `npm test` corre `vitest run && node --test "lib/mapa/**/*.test.ts"`. Vitest levanta `lib/**/*.test.ts` y `app/api/**/*.test.ts`, y **excluye** `lib/mapa/**` (esos son de `node:test`). Los tests de endpoint usan cliente de base falso: no tocan red ni Supabase.
- **Las migraciones del repo NO se aplican solas.** El DDL va por la Management API de Supabase con `SUPABASE_API_KEY_MANAGEMENT`, y **eso necesita el OK explícito de Leonardo** (leer es libre; escribir, no).
- **Área tocable mínima en celular: 44px**, aunque el dibujo sea más chico.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `lib/ficha/token.ts` | Generar el token público base62. Hoy está duplicado en dos endpoints. |
| `lib/ficha/snapshot.ts` | Convertir "una propiedad de tal fuente" en el pedazo de snapshot, y la marca de la agencia. Extraído de `app/api/ficha/share/route.ts`. |
| `lib/ficha/snapshot.test.ts` | Tests de lo anterior. |
| `lib/seleccion/estado.ts` | La lógica pura de la selección: agregar, sacar, anotar, el tope. Sin React. |
| `lib/seleccion/estado.test.ts` | Tests de lo anterior. |
| `supabase/migrations/20260907120000_shared_selections.sql` | La tabla y el contador de vistas. |
| `app/api/seleccion/route.ts` | `POST`: arma el snapshot de las elegidas y devuelve el token. |
| `app/api/seleccion/route.test.ts` | Tests del endpoint con base falsa. |
| `components/seleccion/seleccion-contexto.tsx` | El provider y el hook `useSeleccion()`. |
| `components/seleccion/marca-seleccion.tsx` | Las dos formas de marcar: el check de listado y el botón del detalle. |
| `components/seleccion/barra-seleccion.tsx` | La barra flotante con el contador. |
| `components/seleccion/repaso-seleccion.tsx` | El repaso con las notas y el botón de crear. |
| `app/seleccion/[token]/page.tsx` | La página pública que ve el cliente. |
| `app/seleccion/[token]/GaleriaPropiedad.tsx` | La galería que se desliza con el dedo. |

**Se modifican:**

| Archivo | Qué cambia |
|---|---|
| `app/api/ficha/share/route.ts` | Pasa a usar `lib/ficha/snapshot.ts` y `lib/ficha/token.ts`. Sin cambio de conducta. |
| `components/shared/consultor-results.tsx` | Check en `UnifiedPropertyCard`, botón en `UnifiedPropertyDetail`. |
| `components/mapa/mapa-resultados.tsx` | Check en cada fila; la fila deja de ser un `<button>`. |
| `app/asesor/consultor-ia/page.tsx` | Monta el provider, la barra y el repaso. |
| `app/director/consultor/page.tsx` | Lo mismo. |

---

### Task 1: Extraer la lógica de snapshot de la ficha de una propiedad

**Por qué primero:** todo lo demás la usa, y hacerlo sin agregar conducta nueva deja un refactor verificable por separado. Si algo se rompe acá, se rompe la ficha que YA está en producción, y conviene saberlo antes de construir arriba.

**Files:**
- Create: `lib/ficha/token.ts`
- Create: `lib/ficha/snapshot.ts`
- Create: `lib/ficha/snapshot.test.ts`
- Modify: `app/api/ficha/share/route.ts`

**Interfaces:**
- Consumes: `normalizarImagenes`, `urlsFotoRed` de `@/lib/acm/fotos-url` (ya existen).
- Produces:
  ```ts
  // lib/ficha/token.ts
  export function generarToken(): string

  // lib/ficha/snapshot.ts
  export type FuentePropiedad = "own" | "agency" | "roomix"

  export interface PropiedadFicha {
    title: string | null
    description: string
    price: number
    currency: string
    property_type: string
    status: string
    bedrooms: number
    bathrooms: number
    total_area: number
    address: string
    city: string
    images: string[]
    amenities: string[]
    source: FuentePropiedad
    public_url?: string | null
  }

  export interface MarcaAgencia {
    colors: string[]
    font: string
    logo_url: string | null
  }

  export type ResultadoPropiedad =
    | { ok: true; propiedad: PropiedadFicha }
    | { ok: false; estado: 404 | 503; motivo: string }

  export function marcaDeLaAgencia(config: unknown): MarcaAgencia

  export async function propiedadParaFicha(
    supabase: ClienteFicha,
    source: string,
    id: string,
    agencyId: string,
  ): Promise<ResultadoPropiedad>
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/ficha/snapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { marcaDeLaAgencia, propiedadParaFicha } from "./snapshot"

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTRA_AGENCIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/**
 * Cliente de base falso. Reproduce SOLO la cadena que usa propiedadParaFicha:
 *   from(tabla).select(cols).eq(col, val)[.eq(col, val)].maybeSingle()
 */
function clienteFalso(filas: Record<string, Array<Record<string, unknown>>>, romper?: string) {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {}
      const api = {
        select: () => api,
        eq: (col: string, val: unknown) => { filtros[col] = val; return api },
        maybeSingle: async () => {
          if (romper === tabla) return { data: null, error: { message: "roto a propósito" } }
          const encontrada = (filas[tabla] ?? []).find((f) =>
            Object.entries(filtros).every(([k, v]) => f[k] === v))
          return { data: encontrada ?? null, error: null }
        },
      }
      return api
    },
  }
}

const AVISO_RED = {
  slug: "depto-palermo-1",
  title: "Depto 3 amb en Palermo",
  description: "Luminoso",
  price: 185000,
  currency: "USD",
  property_type: "Departamento",
  operation: "sale",
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  area_m2: 78,
  address: "Gorriti 5000",
  neighborhood: "Palermo",
  city: "CABA",
  images: ["https://cdn.roomix.example/a.webp"],
  amenities: ["balcón"],
  // Datos del colega que NO pueden viajar a la ficha del cliente:
  roomix_agency_name: "Inmobiliaria Colega",
  roomix_agency_logo: "https://colega.example/logo.png",
  phone: "1122334455",
  whatsapp: "1122334455",
  canonical_url: "https://roomix.ai/aviso/1",
  source_listing_url: "https://portal.example/aviso/1",
}

describe("propiedadParaFicha · red de colaboración", () => {
  it("mapea el aviso de la red al formato de la ficha", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [AVISO_RED] }) as any,
      "roomix", "roomix_depto-palermo-1", AGENCIA)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.title).toBe("Depto 3 amb en Palermo")
    expect(r.propiedad.status).toBe("Venta")
    expect(r.propiedad.total_area).toBe(78)
    expect(r.propiedad.city).toBe("Palermo")
    expect(r.propiedad.source).toBe("roomix")
  })

  it("NO deja pasar ningún dato de la inmobiliaria que publica", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [AVISO_RED] }) as any,
      "roomix", "roomix_depto-palermo-1", AGENCIA)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    const texto = JSON.stringify(r.propiedad)
    expect(texto).not.toContain("Inmobiliaria Colega")
    expect(texto).not.toContain("colega.example")
    expect(texto).not.toContain("1122334455")
    expect(texto).not.toContain("roomix.ai")
    expect(texto).not.toContain("portal.example")
  })

  it("si la consulta falla devuelve 503, no 'no existe'", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [AVISO_RED] }, "roomix_properties") as any,
      "roomix", "roomix_depto-palermo-1", AGENCIA)

    expect(r).toEqual({ ok: false, estado: 503, motivo: expect.stringContaining("unos segundos") })
  })

  it("si el aviso ya no está, lo dice como baja de la publicación", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [] }) as any,
      "roomix", "roomix_no-existe", AGENCIA)

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.estado).toBe(404)
    expect(r.motivo).toContain("ya no está publicada")
  })
})

describe("propiedadParaFicha · cartera", () => {
  const PROPIA = {
    id: "11111111-1111-4111-8111-111111111111",
    agency_id: AGENCIA,
    title: "Casa en Vicente López",
    description: "Con jardín",
    price: 320000,
    currency: "USD",
    property_type: "Casa",
    status: "Venta",
    bedrooms: 3,
    bathrooms: 2,
    total_area: 210,
    covered_area: 160,
    address: "Av. Maipú 3000",
    city: "Vicente López",
    images: ["https://tokko.example/1.jpg"],
    tokko_data: { tags: [{ name: "parrilla" }, { name: "pileta" }], public_url: "https://x.example/p" },
  }

  it("saca los amenities de tokko_data.tags", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ properties: [PROPIA] }) as any,
      "own", PROPIA.id, AGENCIA)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.amenities).toEqual(["parrilla", "pileta"])
    expect(r.propiedad.public_url).toBe("https://x.example/p")
  })

  it("una propiedad de OTRA agencia no se encuentra", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ properties: [PROPIA] }) as any,
      "own", PROPIA.id, OTRA_AGENCIA)

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.estado).toBe(404)
    expect(r.motivo).toContain("no pertenece a tu agencia")
  })
})

describe("marcaDeLaAgencia", () => {
  it("se queda solo con los colores que son texto", () => {
    expect(marcaDeLaAgencia({ brand_colors: ["#0a1f33", 42, "", null, "#c8a061"] }).colors)
      .toEqual(["#0a1f33", "#c8a061"])
  })

  it("sin configuración devuelve los valores por defecto", () => {
    expect(marcaDeLaAgencia(null)).toEqual({ colors: [], font: "sans", logo_url: null })
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/ficha/snapshot.test.ts`
Expected: FAIL con `Failed to resolve import "./snapshot"`.

- [ ] **Step 3: Escribir `lib/ficha/token.ts`**

```ts
// Token corto y legible (base62, ~12 chars, ~71 bits). No es secreto: identifica una
// ficha pública. Estaba duplicado en app/api/ficha/share y app/api/acm/ficha.
import crypto from "crypto"

const ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

export function generarToken(): string {
  const bytes = crypto.randomBytes(12)
  let t = ""
  for (const b of Array.from(bytes)) t += ALFABETO[b % 62]
  return t
}
```

- [ ] **Step 4: Escribir `lib/ficha/snapshot.ts`**

Es un traslado, no una reescritura: el cuerpo sale de `app/api/ficha/share/route.ts` tal cual, con los comentarios que ya tiene.

```ts
// Convierte "una propiedad de tal fuente" en el pedazo de snapshot que guardan las fichas
// públicas. Vivía pegado adentro de app/api/ficha/share/route.ts; lo usan la ficha de UNA
// propiedad y la de una SELECCIÓN, y si cada una tuviera su copia se desincronizarían.
import { normalizarImagenes, urlsFotoRed } from "@/lib/acm/fotos-url"

export type FuentePropiedad = "own" | "agency" | "roomix"

export interface PropiedadFicha {
  title: string | null
  description: string
  price: number
  currency: string
  property_type: string
  status: string
  bedrooms: number
  bathrooms: number
  total_area: number
  address: string
  city: string
  images: string[]
  amenities: string[]
  source: FuentePropiedad
  public_url?: string | null
}

export interface MarcaAgencia {
  colors: string[]
  font: string
  logo_url: string | null
}

export type ResultadoPropiedad =
  | { ok: true; propiedad: PropiedadFicha }
  | { ok: false; estado: 404 | 503; motivo: string }

/** Lo mínimo del cliente de Supabase que esta función usa (así el test puede falsearlo). */
export interface ClienteFicha {
  from(tabla: string): {
    select(cols: string): {
      eq(col: string, val: unknown): any
    }
  }
}

const MAX_IMAGENES = 16

export function marcaDeLaAgencia(config: unknown): MarcaAgencia {
  const mk = (config as any) || {}
  return {
    colors: Array.isArray(mk.brand_colors)
      ? mk.brand_colors.filter((c: any) => typeof c === "string" && c)
      : [],
    font: typeof mk.brand_font === "string" ? mk.brand_font : "sans",
    logo_url: mk.logo_url || null,
  }
}

function fotos(images: unknown): string[] {
  return urlsFotoRed(Array.from(new Set(normalizarImagenes(images))).slice(0, MAX_IMAGENES))
}

export async function propiedadParaFicha(
  supabase: ClienteFicha,
  source: string,
  id: string,
  agencyId: string,
): Promise<ResultadoPropiedad> {
  if (source === "roomix") {
    const slug = String(id).replace(/^roomix_/, "")
    // Sólo las columnas que se usan: traer "*" arrastraba el embedding de 768 dimensiones
    // de cada fila escaneada y hacía mucho más pesada la consulta.
    const { data: rp, error } = await supabase
      .from("roomix_properties")
      .select("title, description, price, currency, property_type, operation, bedrooms, rooms, bathrooms, area_m2, address, neighborhood, city, images, amenities")
      .eq("slug", slug)
      .maybeSingle()

    // Un error de consulta (timeout, permisos, red) NO es que la propiedad no exista:
    // decirlo como "no se encontró" mandaba al asesor a buscar un problema que no era.
    if (error) {
      console.error("Ficha — falló la consulta a roomix_properties:", { slug, error })
      return { ok: false, estado: 503, motivo: "No pudimos traer la propiedad en este momento. Probá de nuevo en unos segundos." }
    }
    if (!rp) {
      return { ok: false, estado: 404, motivo: "Esta propiedad ya no está publicada por la inmobiliaria que la ofrecía." }
    }

    return {
      ok: true,
      propiedad: {
        title: rp.title,
        description: rp.description || "",
        price: rp.price ? Number(rp.price) : 0,
        currency: rp.currency || "USD",
        property_type: rp.property_type || "",
        status: rp.operation === "rent" ? "Alquiler" : "Venta",
        bedrooms: rp.bedrooms || rp.rooms || 0,
        bathrooms: rp.bathrooms || 0,
        total_area: rp.area_m2 ? Number(rp.area_m2) : 0,
        address: rp.address || rp.neighborhood || "",
        city: rp.neighborhood || rp.city || "",
        // El `.webp` que publica roomix da 404 en su propio CDN el 12% de las veces.
        images: fotos(rp.images),
        amenities: Array.isArray(rp.amenities) ? rp.amenities : [],
        source: "roomix",
        // Esta ficha es la que el asesor le manda a SU cliente, así que no lleva NINGÚN
        // rastro de la inmobiliaria que publica: ni nombre, ni logo, ni teléfono, ni los
        // links al aviso original. Cualquiera de esos datos manda al cliente directo al
        // colega. Todo eso vive en la tarjeta del Buscador IA, que es de uso interno.
      },
    }
  }

  const { data: p, error } = await supabase
    .from("properties")
    .select("id, title, description, price, currency, property_type, status, bedrooms, bathrooms, total_area, covered_area, address, city, images, tokko_data, agency_id")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (error) {
    console.error("Ficha — falló la consulta a properties:", { id, error })
    return { ok: false, estado: 503, motivo: "No pudimos traer la propiedad en este momento. Probá de nuevo en unos segundos." }
  }
  if (!p) {
    return { ok: false, estado: 404, motivo: "No se encontró la propiedad o no pertenece a tu agencia." }
  }

  const tags = (p.tokko_data as any)?.tags
  return {
    ok: true,
    propiedad: {
      title: p.title,
      description: p.description || "",
      price: p.price ? Number(p.price) : 0,
      currency: p.currency || "USD",
      property_type: p.property_type || "",
      status: p.status || "",
      bedrooms: p.bedrooms || 0,
      bathrooms: p.bathrooms || 0,
      total_area: Number(p.total_area || p.covered_area || 0),
      address: p.address || "",
      city: p.city || "",
      images: fotos(p.images),
      amenities: Array.isArray(tags)
        ? tags.map((t: any) => t?.name).filter((n: any): n is string => typeof n === "string" && !!n).slice(0, 30)
        : [],
      source: source === "agency" ? "agency" : "own",
      public_url: (p.tokko_data as any)?.public_url || null,
    },
  }
}
```

> **Ojo con un cambio silencioso:** el endpoint viejo pasaba `images` de la cartera propia
> tal cual (`Array.isArray(p.images) ? p.images : []`) y acá pasan por `fotos()`, que
> normaliza, deduplica y corta en 16. Es a propósito —la ficha de varias no puede cargar 30
> fotos por propiedad en el celular del cliente— y para la cartera propia `urlsFotoRed` no
> toca las URLs (solo reescribe las de la red). Verificar en el Step 8 que una ficha de una
> propiedad de cartera sigue mostrando sus fotos.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/ficha/snapshot.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Cambiar `app/api/ficha/share/route.ts` para que use lo extraído**

Borrar de ese archivo `genToken()` y los dos bloques de armado de propiedad, y dejar:

```ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { generarToken } from "@/lib/ficha/token";
import { marcaDeLaAgencia, propiedadParaFicha } from "@/lib/ficha/snapshot";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { source, id } = await req.json();
    if (!source || !id) {
      return NextResponse.json({ error: "Faltan datos de la propiedad." }, { status: 400 });
    }
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, avatar_url, role")
      .eq("id", userId)
      .single();

    const { data: agency } = await supabase
      .from("agencies")
      .select("id, name, marketing_ai_config")
      .eq("id", agencyId)
      .single();

    const resultado = await propiedadParaFicha(supabase as any, source, String(id), agencyId);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.motivo }, { status: resultado.estado });
    }

    const snapshot = {
      property: resultado.propiedad,
      agent: {
        full_name: profile?.full_name || "",
        email: profile?.email || "",
        phone: profile?.phone || "",
        avatar_url: profile?.avatar_url || null,
        role: profile?.role || "asesor",
      },
      agency: { id: agency?.id || agencyId, name: agency?.name || "" },
      brand: marcaDeLaAgencia(agency?.marketing_ai_config),
    };

    const token = generarToken();
    const admin = createAdminClient();
    const { error: insErr } = await admin.from("shared_properties").insert({
      token,
      property_source: resultado.propiedad.source,
      property_id: String(id),
      snapshot,
      created_by: userId,
      agency_id: agencyId,
    });
    if (insErr) throw insErr;

    return NextResponse.json({ token, path: `/ficha/${token}` });
  } catch (error: any) {
    console.error("Share ficha error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 7: Verificar que compila y que no se rompió nada**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `lib/ficha/` ni en `app/api/ficha/`.

Run: `npm test`
Expected: PASS, con 8 tests más que antes.

- [ ] **Step 8: Probar a mano que la ficha vieja sigue igual**

Levantar con `npm run dev`, entrar como director de PRISMAIA - VAKDOR, abrir el Buscador IA, buscar cualquier cosa, abrir el detalle de **una de cartera propia** y tocar "Compartir ficha". Verificar que la ficha abre con sus fotos, su precio y la tarjeta de contacto. Repetir con **una de la red**.

- [ ] **Step 9: Commit**

```bash
git add lib/ficha/token.ts lib/ficha/snapshot.ts lib/ficha/snapshot.test.ts app/api/ficha/share/route.ts
git commit -m "refactor(ficha): la lógica de snapshot sale del endpoint a lib/ficha

La ficha de varias propiedades necesita lo mismo que la de una. Si cada una
tuviera su copia, alguien arregla un campo en una y la otra sigue mal.

Queda con tests, incluido el que sostiene la regla que no se puede romper: que
en la ficha del cliente NO viaje ningún dato de la inmobiliaria que publica."
```

---

### Task 2: La tabla `shared_selections`

**Files:**
- Create: `supabase/migrations/20260907120000_shared_selections.sql`

**Interfaces:**
- Consumes: nada.
- Produces: la tabla `public.shared_selections` y la función `public.increment_shared_selection_view(p_token text)`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Selección de propiedades: el asesor/director marca varias en el Buscador IA o en el mapa
-- y genera UN link público con la marca de su agencia, su tarjeta de contacto y una nota
-- opcional por propiedad más una nota final opcional del grupo. Guardamos un SNAPSHOT (foto
-- de los datos al momento de crear) para que el link sobreviva aunque la publicación
-- original cambie o se dé de baja. Mismo molde que shared_properties y shared_acm_reports.
--
-- Lectura pública: SOLO vía service-role (admin client) desde el server component de
-- /seleccion/[token]. Por eso activamos RLS sin políticas para anon/auth: queda bloqueada
-- para el cliente y el server la lee con la service key (que ignora RLS). La inserción
-- también es server-side (API con sesión).

CREATE TABLE IF NOT EXISTS public.shared_selections (
  token       text PRIMARY KEY,
  snapshot    jsonb NOT NULL,          -- { properties[], nota_final, agent, agency, brand, created_at }
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  agency_id   uuid,
  view_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_selections_created_by_idx ON public.shared_selections (created_by);
CREATE INDEX IF NOT EXISTS shared_selections_agency_id_idx  ON public.shared_selections (agency_id);

ALTER TABLE public.shared_selections ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie (anon/authenticated) accede directo. Solo service-role (server).

CREATE OR REPLACE FUNCTION public.increment_shared_selection_view(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_selections SET view_count = view_count + 1 WHERE token = p_token;
$$;
```

- [ ] **Step 2: Pedirle el OK a Leonardo antes de aplicarla**

**No aplicar sin su OK explícito.** Decirle: qué crea (una tabla nueva y una función), que no toca ninguna tabla existente, que no migra ni borra datos, y que si sale mal se deshace con `DROP TABLE public.shared_selections` (no hay dependencias).

- [ ] **Step 3: Aplicar la migración por la Management API**

Las migraciones del repo no se aplican solas. Con `SUPABASE_API_KEY_MANAGEMENT` y el ref del proyecto en el `.env`:

```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const ref=(env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1].split(".")[0];
const sql=fs.readFileSync("supabase/migrations/20260907120000_shared_selections.sql","utf8");
fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${env.SUPABASE_API_KEY_MANAGEMENT}`},body:JSON.stringify({query:sql})})
 .then(r=>r.text()).then(t=>console.log(t));
'
```

- [ ] **Step 4: Verificar contra producción que quedó como se quería**

Correr por la misma vía esta consulta y leer el resultado:

```sql
select c.relname,
       c.relrowsecurity                          as rls_prendida,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename='shared_selections') as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname='shared_selections';
```

Expected: una fila, `rls_prendida = true`, `politicas = 0`. **Si `politicas` no es 0, parar:** alguien le puso una política y la tabla dejaría de ser privada.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260907120000_shared_selections.sql
git commit -m "feat(seleccion): tabla shared_selections (RLS prendida, sin políticas)

Mismo molde que shared_properties y shared_acm_reports: la lee solo el server con
la service key. Aplicada y verificada contra producción: rls_prendida=true,
politicas=0."
```

---

### Task 3: El endpoint que crea la selección

**Files:**
- Create: `app/api/seleccion/route.ts`
- Create: `app/api/seleccion/route.test.ts`

**Interfaces:**
- Consumes: `generarToken()` y `propiedadParaFicha()`, `marcaDeLaAgencia()` de la Task 1; la tabla de la Task 2.
- Produces:
  ```ts
  // POST /api/seleccion
  // body: { propiedades: Array<{ source: string; id: string; nota?: string }>; nota_final?: string }
  // 200:  { token: string; path: string; omitidas: Array<{ id: string; motivo: string }> }
  // 400:  { error } — lista vacía, o más de 12
  // 404:  { error } — ninguna de las elegidas se pudo traer
  // 503:  { error } — falló una consulta (no es lo mismo que "no existe")
  ```

**Regla de negocio que este endpoint decide (y que no está en la spec):** una propiedad que devuelve **404** se omite y la ficha se genera con el resto; una que devuelve **503 corta todo**. Un 404 es un hecho del mundo (la dieron de baja); un 503 es un problema nuestro, y generar una ficha a la que le falta una propiedad por un hipo de la base es peor que pedirle al asesor que reintente.

- [ ] **Step 1: Escribir el test que falla**

Crear `app/api/seleccion/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { AsyncLocalStorage } from "node:async_hooks"

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const DIRECTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const PROPIA_1 = "11111111-1111-4111-8111-111111111111"
const PROPIA_2 = "22222222-2222-4222-8222-222222222222"

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => ({ agencyId: AGENCIA, userId: DIRECTOR, role: "director" }),
}))

type Base = {
  propiedades: Array<Record<string, unknown>>
  insertadas: Array<Record<string, unknown>>
  romper: boolean
}
let base: Base
const baseDelPedido = new AsyncLocalStorage<Base>()

const clienteFalso = (b: Base) => ({
  from(tabla: string) {
    const filtros: Record<string, unknown> = {}
    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => { filtros[col] = val; return api },
      single: async () => {
        if (tabla === "profiles") return { data: { full_name: "Leo", email: "l@v.com", phone: "5491100", avatar_url: null, role: "director" }, error: null }
        if (tabla === "agencies") return { data: { id: AGENCIA, name: "VAKDOR", marketing_ai_config: { brand_colors: ["#0a1f33"], logo_url: "https://x/l.png" } }, error: null }
        return { data: null, error: null }
      },
      maybeSingle: async () => {
        if (b.romper) return { data: null, error: { message: "roto a propósito" } }
        const fila = b.propiedades.find((f) => Object.entries(filtros).every(([k, v]) => f[k] === v))
        return { data: fila ?? null, error: null }
      },
    }
    return api
  },
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clienteFalso(baseDelPedido.getStore() ?? base),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (fila: Record<string, unknown>) => {
        (baseDelPedido.getStore() ?? base).insertadas.push(fila)
        return { error: null }
      },
    }),
  }),
}))

const fila = (id: string, titulo: string) => ({
  id, agency_id: AGENCIA, title: titulo, description: "", price: 100000, currency: "USD",
  property_type: "Departamento", status: "Venta", bedrooms: 2, bathrooms: 1,
  total_area: 60, covered_area: 55, address: "Calle 1", city: "CABA", images: [], tokko_data: {},
})

beforeEach(() => {
  base = { propiedades: [fila(PROPIA_1, "Uno"), fila(PROPIA_2, "Dos")], insertadas: [], romper: false }
})

const pedir = async (cuerpo: unknown) => {
  const miBase = base
  const { POST } = await import("./route")
  const res = await baseDelPedido.run(miBase, () =>
    POST(new Request("http://localhost/api/seleccion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    })))
  return { status: res.status, cuerpo: (await res.json()) as Record<string, any> }
}

describe("POST /api/seleccion", () => {
  it("guarda las dos propiedades con sus notas y devuelve el link", async () => {
    const r = await pedir({
      propiedades: [
        { source: "own", id: PROPIA_1, nota: "la más luminosa" },
        { source: "own", id: PROPIA_2 },
      ],
      nota_final: "Cualquiera de las dos entra en tu presupuesto",
    })

    expect(r.status).toBe(200)
    expect(r.cuerpo.path).toBe(`/seleccion/${r.cuerpo.token}`)
    expect(r.cuerpo.omitidas).toEqual([])

    expect(base.insertadas).toHaveLength(1)
    const snap = base.insertadas[0].snapshot as any
    expect(snap.properties).toHaveLength(2)
    expect(snap.properties[0].nota).toBe("la más luminosa")
    expect(snap.properties[1].nota).toBe("")
    expect(snap.nota_final).toBe("Cualquiera de las dos entra en tu presupuesto")
    expect(snap.agency.name).toBe("VAKDOR")
    expect(snap.brand.colors).toEqual(["#0a1f33"])
  })

  it("una que ya no está se omite y la ficha se genera con el resto", async () => {
    const r = await pedir({
      propiedades: [{ source: "own", id: PROPIA_1 }, { source: "own", id: "99999999-9999-4999-8999-999999999999" }],
    })

    expect(r.status).toBe(200)
    expect(r.cuerpo.omitidas).toHaveLength(1)
    expect((base.insertadas[0].snapshot as any).properties).toHaveLength(1)
  })

  it("si NINGUNA se pudo traer, no guarda nada", async () => {
    const r = await pedir({ propiedades: [{ source: "own", id: "99999999-9999-4999-8999-999999999999" }] })

    expect(r.status).toBe(404)
    expect(base.insertadas).toHaveLength(0)
  })

  it("si la consulta falla corta todo con 503 y no guarda a medias", async () => {
    base.romper = true
    const r = await pedir({ propiedades: [{ source: "own", id: PROPIA_1 }, { source: "own", id: PROPIA_2 }] })

    expect(r.status).toBe(503)
    expect(base.insertadas).toHaveLength(0)
  })

  it("no acepta más de 12", async () => {
    const trece = Array.from({ length: 13 }, () => ({ source: "own", id: PROPIA_1 }))
    const r = await pedir({ propiedades: trece })

    expect(r.status).toBe(400)
    expect(base.insertadas).toHaveLength(0)
  })

  it("no acepta una selección vacía", async () => {
    const r = await pedir({ propiedades: [] })

    expect(r.status).toBe(400)
    expect(base.insertadas).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run app/api/seleccion/route.test.ts`
Expected: FAIL con `Failed to resolve import "./route"`.

- [ ] **Step 3: Escribir `app/api/seleccion/route.ts`**

```ts
// Crea la ficha de una SELECCIÓN: varias propiedades elegidas por el asesor en el Buscador
// IA o en el mapa, con la marca de su agencia, su tarjeta de contacto, una nota opcional
// por propiedad y una nota final opcional del grupo. Mismo molde que
// app/api/ficha/share/route.ts, del que reusa lib/ficha/snapshot.ts.
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { generarToken } from "@/lib/ficha/token"
import { marcaDeLaAgencia, propiedadParaFicha } from "@/lib/ficha/snapshot"
import { TOPE_SELECCION } from "@/lib/seleccion/estado"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_NOTA = 400
const MAX_NOTA_FINAL = 1000

const recortar = (v: unknown, tope: number) =>
  typeof v === "string" ? v.trim().slice(0, tope) : ""

export async function POST(req: Request) {
  try {
    const cuerpo = await req.json()
    const elegidas = Array.isArray(cuerpo?.propiedades) ? cuerpo.propiedades : []

    if (elegidas.length === 0) {
      return NextResponse.json({ error: "No elegiste ninguna propiedad." }, { status: 400 })
    }
    if (elegidas.length > TOPE_SELECCION) {
      return NextResponse.json(
        { error: `Podés mandar hasta ${TOPE_SELECCION} propiedades en una misma ficha.` },
        { status: 400 },
      )
    }

    const { userId, agencyId } = await requireTenant()
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, avatar_url, role")
      .eq("id", userId)
      .single()

    const { data: agency } = await supabase
      .from("agencies")
      .select("id, name, marketing_ai_config")
      .eq("id", agencyId)
      .single()

    const properties: any[] = []
    const omitidas: Array<{ id: string; motivo: string }> = []

    for (const elegida of elegidas) {
      const id = String(elegida?.id ?? "")
      const resultado = await propiedadParaFicha(supabase as any, String(elegida?.source ?? ""), id, agencyId)

      // Un 503 es un problema NUESTRO, no un hecho del mundo: cortamos todo antes de
      // guardar nada. Generar una ficha a la que le falta una propiedad por un hipo de la
      // base es peor que pedirle al asesor que reintente.
      if (!resultado.ok && resultado.estado === 503) {
        return NextResponse.json({ error: resultado.motivo }, { status: 503 })
      }
      if (!resultado.ok) {
        omitidas.push({ id, motivo: resultado.motivo })
        continue
      }
      properties.push({ ...resultado.propiedad, nota: recortar(elegida?.nota, MAX_NOTA) })
    }

    if (properties.length === 0) {
      return NextResponse.json(
        { error: "Ninguna de las propiedades que elegiste sigue publicada. Probá con otras." },
        { status: 404 },
      )
    }

    const snapshot = {
      properties,
      nota_final: recortar(cuerpo?.nota_final, MAX_NOTA_FINAL),
      agent: {
        full_name: profile?.full_name || "",
        email: profile?.email || "",
        phone: profile?.phone || "",
        avatar_url: profile?.avatar_url || null,
        role: profile?.role || "asesor",
      },
      agency: { id: agency?.id || agencyId, name: agency?.name || "" },
      brand: marcaDeLaAgencia(agency?.marketing_ai_config),
      created_at: new Date().toISOString(),
    }

    const token = generarToken()
    const admin = createAdminClient()
    const { error: insErr } = await admin.from("shared_selections").insert({
      token,
      snapshot,
      created_by: userId,
      agency_id: agencyId,
    })
    if (insErr) throw insErr

    return NextResponse.json({ token, path: `/seleccion/${token}`, omitidas })
  } catch (error: any) {
    console.error("Crear selección error:", error)
    return NextResponse.json({ error: "No pudimos armar la ficha. Probá de nuevo." }, { status: 500 })
  }
}
```

> **Dependencia de orden:** este archivo importa `TOPE_SELECCION` de `lib/seleccion/estado.ts`,
> que se escribe en la Task 5. Para no bloquear, crear ahora ese archivo con **solo** esa
> constante (`export const TOPE_SELECCION = 12`) y completarlo en la Task 5.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run app/api/seleccion/route.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/seleccion/route.ts app/api/seleccion/route.test.ts lib/seleccion/estado.ts
git commit -m "feat(seleccion): endpoint que congela la selección y devuelve el link

Una propiedad dada de baja (404) se omite y la ficha se genera con el resto; una
consulta que falla (503) corta todo antes de guardar nada. Con tests de los seis
caminos, incluido que un 503 no deje una ficha guardada a medias."
```

---

### Task 4: La página pública que ve el cliente

**Files:**
- Create: `app/seleccion/[token]/page.tsx`
- Create: `app/seleccion/[token]/GaleriaPropiedad.tsx`

**Interfaces:**
- Consumes: la tabla de la Task 2 y el snapshot que escribe la Task 3.
- Produces: la ruta pública `/seleccion/<token>`.

**Es pública por el middleware:** vive fuera de `(public)`, de `/asesor` y de `/director`, igual que `/ficha/[token]` y `/ficha-acm/[token]`.

- [ ] **Step 1: Escribir la galería**

`app/seleccion/[token]/GaleriaPropiedad.tsx`:

```tsx
"use client";

import { useState } from "react";

// Galería de una propiedad. En el celular se desliza con el dedo (scroll horizontal con
// snap, sin librería); en la compu se agregan las flechas, que en touch no sirven porque
// no hay hover.
export default function GaleriaPropiedad({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) return null;

  const ir = (d: number) => setIdx((i) => (i + d + images.length) % images.length);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[idx]} alt={alt} className="aspect-[4/3] w-full object-cover" />

      {images.length > 1 && (
        <>
          <button
            onClick={() => ir(-1)}
            aria-label="Foto anterior"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white"
          >
            ‹
          </button>
          <button
            onClick={() => ir(1)}
            aria-label="Foto siguiente"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escribir la página**

`app/seleccion/[token]/page.tsx`:

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Playfair_Display, Inter } from "next/font/google";
import type { Metadata } from "next";
import GaleriaPropiedad from "./GaleriaPropiedad";

export const dynamic = "force-dynamic";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

// Paleta default "autoridad / lujo" si la agencia no configuró marca. Igual que /ficha.
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

async function getSeleccion(token: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("shared_selections").select("snapshot").eq("token", token).single();
  return data?.snapshot as any | undefined;
}

// Texto legible (blanco/negro) según luminancia del color de fondo. Mismo criterio que /ficha.
function readableOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0c0c0c" : "#ffffff";
}

const fmtPrice = (price: number, currency: string) =>
  price > 0 ? `${currency === "ARS" ? "$" : "USD"} ${new Intl.NumberFormat("es-AR").format(price)}` : "Consultar";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await getSeleccion(params.token);
  if (!snap) return { title: "Selección no disponible" };
  const cuantas = snap.properties?.length || 0;
  const title = `${cuantas} ${cuantas === 1 ? "propiedad seleccionada" : "propiedades seleccionadas"}`;
  return {
    title: `${title} | ${snap.agency?.name || "PRISMA"}`,
    description: `Una selección preparada por ${snap.agent?.full_name || "tu asesor"}.`,
    openGraph: { title, images: snap.properties?.[0]?.images?.[0] ? [snap.properties[0].images[0]] : [] },
  };
}

export default async function SeleccionPage({ params }: { params: { token: string } }) {
  const snap = await getSeleccion(params.token);
  if (!snap) notFound();

  // Contador de vistas (best-effort, no bloquea el render).
  try {
    const admin = createAdminClient();
    await admin.rpc("increment_shared_selection_view", { p_token: params.token });
  } catch { /* noop */ }

  const { properties = [], nota_final, agent, agency, brand } = snap;
  const colors: string[] = brand?.colors?.length ? brand.colors : DEFAULT_COLORS;
  const primary = colors[0] || DEFAULT_COLORS[0];
  const accent = colors[1] || colors[0] || DEFAULT_COLORS[1];
  const onPrimary = readableOn(primary);
  const onAccent = readableOn(accent);

  const phoneDigits = (agent?.phone || "").replace(/[^\d]/g, "");
  const waLink = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hola ${agent?.full_name || ""}, vi la selección que me mandaste y quería consultarte.`)}`
    : null;
  const initials = (agent?.full_name || "A").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = agent?.role === "director" ? "Director/a" : "Asesor/a Inmobiliario/a";

  return (
    <div
      className={`${playfair.variable} ${inter.variable} min-h-screen`}
      style={{ background: "#fbfaf7", color: "#161616", fontFamily: "var(--font-body)" }}
    >
      {/* Barra superior: marca de la agencia */}
      <div className="w-full" style={{ backgroundColor: primary, color: onPrimary }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {brand?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={agency?.name || ""} className="h-9 w-auto object-contain" />
            ) : null}
            <span className="truncate font-semibold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
              {agency?.name || "Inmobiliaria"}
            </span>
          </div>
          <span className="shrink-0 text-xs uppercase tracking-widest opacity-80">Selección</span>
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 md:px-5 md:py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl leading-tight md:text-4xl" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
            Seleccionamos esto para vos
          </h1>
          <p className="text-neutral-500">
            {properties.length} {properties.length === 1 ? "propiedad elegida" : "propiedades elegidas"} por {agent?.full_name || "tu asesor"}.
          </p>
        </header>

        {properties.map((p: any, i: number) => (
          <article key={i} className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
            <GaleriaPropiedad images={p.images || []} alt={p.title || "Propiedad"} />

            <div className="flex flex-col gap-4 p-5 md:p-6">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
                    style={{ backgroundColor: accent, color: onAccent }}
                  >
                    {p.status || "Propiedad"}
                  </span>
                  {p.city && <span className="text-sm text-neutral-500">{p.city}</span>}
                </div>
                <h2 className="text-2xl leading-snug" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
                  {p.title || "Propiedad"}
                </h2>
                {p.address && <p className="text-neutral-500">{p.address}</p>}
                <div className="mt-1 text-2xl font-bold" style={{ color: primary, fontFamily: "var(--font-display)" }}>
                  {fmtPrice(p.price, p.currency)}
                </div>
              </div>

              {/* La nota del asesor. Si no escribió nada, este bloque NO existe. */}
              {p.nota ? (
                <div
                  className="rounded-2xl border-l-4 bg-neutral-50 p-4"
                  style={{ borderColor: accent }}
                >
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                    Por qué te la mando
                  </p>
                  <p className="whitespace-pre-line leading-relaxed text-neutral-700">{p.nota}</p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: p.bedrooms === 1 ? "Dormitorio" : "Dormitorios", value: p.bedrooms || "—" },
                  { label: "Baños", value: p.bathrooms || "—" },
                  { label: "Superficie", value: p.total_area ? `${p.total_area} m²` : "—" },
                  { label: "Tipo", value: p.property_type || "—" },
                ].map((s, k) => (
                  <div key={k} className="rounded-xl border border-neutral-200 p-3 text-center">
                    <div className="text-lg font-bold" style={{ color: primary }}>{s.value}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-neutral-500">{s.label}</div>
                  </div>
                ))}
              </div>

              {p.description ? (
                <p className="whitespace-pre-line leading-relaxed text-neutral-700">{p.description}</p>
              ) : null}

              {p.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.amenities.slice(0, 20).map((a: string, k: number) => (
                    <span key={k} className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-600">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}

        {/* La nota final del grupo. Si no escribió nada, este bloque NO existe. */}
        {nota_final ? (
          <section className="rounded-3xl p-6" style={{ backgroundColor: primary, color: onPrimary }}>
            <p className="whitespace-pre-line text-lg leading-relaxed">{nota_final}</p>
          </section>
        ) : null}

        {/* Tarjeta del asesor */}
        <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-lg">
          <div className="h-2 w-full" style={{ backgroundColor: primary }} />
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-4">
              {agent?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.avatar_url} alt={agent.full_name} className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
                  style={{ backgroundColor: primary, color: onPrimary, fontFamily: "var(--font-display)" }}
                >
                  {initials}
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-widest text-neutral-400">{roleLabel}</div>
                <div className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  {agent?.full_name || "Tu asesor"}
                </div>
                <div className="text-sm text-neutral-500">{agency?.name || ""}</div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold shadow-md"
                  style={{ backgroundColor: "#25D366", color: "#fff" }}
                >
                  WhatsApp
                </a>
              )}
              {agent?.email && (
                <a
                  href={`mailto:${agent.email}?subject=${encodeURIComponent("Consulta por las propiedades que me mandaste")}`}
                  className="inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold"
                  style={{ backgroundColor: primary, color: onPrimary }}
                >
                  Email
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <div className="w-full border-t border-neutral-200 py-4 text-center text-xs text-neutral-400">
        Selección generada con PRISMA · {agency?.name || ""}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Probar la página con datos reales**

Levantar `npm run dev`. Con la sesión de director abierta, crear una selección a mano desde la consola del navegador (todavía no hay botones):

```js
await (await fetch('/api/seleccion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    propiedades: [{ source: 'own', id: '<UUID de una propiedad de la agencia>', nota: 'la más luminosa' }],
    nota_final: 'Las dos entran en tu presupuesto.',
  }),
})).json()
```

Abrir el `path` que devuelve. Verificar: la marca arriba, la galería, la nota destacada, la nota final, la tarjeta del asesor. Y repetir **sin** notas para confirmar que no queda ningún recuadro ni espacio vacío.

- [ ] **Step 5: Commit**

```bash
git add "app/seleccion/[token]/page.tsx" "app/seleccion/[token]/GaleriaPropiedad.tsx"
git commit -m "feat(seleccion): la página pública que ve el cliente

Pensada para el celular y responsive a la compu. Sin PDF ni versión para
imprimir. Las dos notas son opcionales: si están vacías el bloque no existe.
Ni el % de coincidencia, ni el origen, ni un solo dato de la inmobiliaria que
publica."
```

---

### Task 5: La lógica pura de la selección

**Files:**
- Create/Modify: `lib/seleccion/estado.ts` (creado con la constante en la Task 3)
- Create: `lib/seleccion/estado.test.ts`

**Interfaces:**
- Consumes: `FuentePropiedad` de `@/lib/ficha/snapshot`.
- Produces:
  ```ts
  export const TOPE_SELECCION = 12
  export interface ItemSeleccion {
    id: string
    source: FuentePropiedad
    titulo: string
    precio: number
    moneda: string
    foto: string | null
    nota: string
  }
  export type Candidata = Omit<ItemSeleccion, "nota">
  export function alternar(items: ItemSeleccion[], c: Candidata): { items: ItemSeleccion[]; error?: string }
  export function sacar(items: ItemSeleccion[], id: string): ItemSeleccion[]
  export function anotar(items: ItemSeleccion[], id: string, nota: string): ItemSeleccion[]
  export function estaElegida(items: ItemSeleccion[], id: string): boolean
  ```

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest"
import { alternar, anotar, estaElegida, sacar, TOPE_SELECCION, type Candidata, type ItemSeleccion } from "./estado"

const candidata = (id: string): Candidata => ({
  id, source: "own", titulo: `Propiedad ${id}`, precio: 100000, moneda: "USD", foto: null,
})

const conN = (n: number): ItemSeleccion[] =>
  Array.from({ length: n }, (_, i) => ({ ...candidata(`p${i}`), nota: "" }))

describe("alternar", () => {
  it("agrega una que no estaba, al final", () => {
    const r = alternar(conN(2), candidata("nueva"))
    expect(r.error).toBeUndefined()
    expect(r.items.map((i) => i.id)).toEqual(["p0", "p1", "nueva"])
    expect(r.items[2].nota).toBe("")
  })

  it("saca una que ya estaba", () => {
    const r = alternar(conN(3), candidata("p1"))
    expect(r.items.map((i) => i.id)).toEqual(["p0", "p2"])
  })

  it("en el tope no agrega y avisa", () => {
    const llena = conN(TOPE_SELECCION)
    const r = alternar(llena, candidata("una-mas"))
    expect(r.items).toHaveLength(TOPE_SELECCION)
    expect(r.error).toContain(String(TOPE_SELECCION))
  })

  it("en el tope SÍ deja sacar una de las que ya están", () => {
    const llena = conN(TOPE_SELECCION)
    const r = alternar(llena, candidata("p0"))
    expect(r.error).toBeUndefined()
    expect(r.items).toHaveLength(TOPE_SELECCION - 1)
  })

  it("sacar y volver a agregar la manda al final y le borra la nota", () => {
    const conNota = anotar(conN(3), "p0", "la más luminosa")
    const sinElla = alternar(conNota, candidata("p0")).items
    const devuelta = alternar(sinElla, candidata("p0")).items
    expect(devuelta.map((i) => i.id)).toEqual(["p1", "p2", "p0"])
    expect(devuelta[2].nota).toBe("")
  })
})

describe("sacar / anotar / estaElegida", () => {
  it("sacar quita solo esa", () => {
    expect(sacar(conN(3), "p1").map((i) => i.id)).toEqual(["p0", "p2"])
  })

  it("anotar escribe la nota sin mover el orden", () => {
    const r = anotar(conN(3), "p1", "acepta permuta")
    expect(r.map((i) => i.id)).toEqual(["p0", "p1", "p2"])
    expect(r[1].nota).toBe("acepta permuta")
  })

  it("estaElegida contesta por id", () => {
    expect(estaElegida(conN(2), "p1")).toBe(true)
    expect(estaElegida(conN(2), "nop")).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/seleccion/estado.test.ts`
Expected: FAIL con `alternar is not a function` (el archivo hoy solo tiene la constante).

- [ ] **Step 3: Completar `lib/seleccion/estado.ts`**

```ts
// La lógica de la selección, sin React: qué entra, qué sale, el tope y las notas.
// Vive separada del contexto para poder probarla con vitest sin montar nada.
import type { FuentePropiedad } from "@/lib/ficha/snapshot"

/** Mismo tope que la ficha del ACM: 12 hojas ya son muchas para mandar por WhatsApp. */
export const TOPE_SELECCION = 12

export interface ItemSeleccion {
  id: string
  source: FuentePropiedad
  /** Lo mínimo para dibujar el repaso sin volver a pedir nada a la base. */
  titulo: string
  precio: number
  moneda: string
  foto: string | null
  nota: string
}

export type Candidata = Omit<ItemSeleccion, "nota">

export function estaElegida(items: ItemSeleccion[], id: string): boolean {
  return items.some((i) => i.id === id)
}

export function sacar(items: ItemSeleccion[], id: string): ItemSeleccion[] {
  return items.filter((i) => i.id !== id)
}

export function anotar(items: ItemSeleccion[], id: string, nota: string): ItemSeleccion[] {
  return items.map((i) => (i.id === id ? { ...i, nota } : i))
}

/**
 * Agrega o saca. Sacar SIEMPRE se puede, aunque esté en el tope: si no, con 12 marcadas
 * el asesor no podría cambiar una por otra sin vaciar todo.
 */
export function alternar(items: ItemSeleccion[], c: Candidata): { items: ItemSeleccion[]; error?: string } {
  if (estaElegida(items, c.id)) return { items: sacar(items, c.id) }
  if (items.length >= TOPE_SELECCION) {
    return { items, error: `Podés elegir hasta ${TOPE_SELECCION} propiedades para una misma ficha.` }
  }
  return { items: [...items, { ...c, nota: "" }] }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/seleccion/estado.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/seleccion/estado.ts lib/seleccion/estado.test.ts
git commit -m "feat(seleccion): la lógica pura (agregar, sacar, anotar, tope de 12)

Sacar siempre se puede aunque esté en el tope: con 12 marcadas, si no, el asesor
no podría cambiar una por otra sin vaciar todo."
```

---

### Task 6: El contexto y su montaje en las dos páginas

**Files:**
- Create: `components/seleccion/seleccion-contexto.tsx`
- Modify: `app/asesor/consultor-ia/page.tsx`
- Modify: `app/director/consultor/page.tsx`

**Interfaces:**
- Consumes: todo `lib/seleccion/estado.ts`.
- Produces:
  ```tsx
  export function SeleccionProvider({ children }: { children: React.ReactNode }): JSX.Element
  export interface ValorSeleccion {
    items: ItemSeleccion[]
    elegida: (id: string) => boolean
    alternar: (c: Candidata) => void
    sacar: (id: string) => void
    anotar: (id: string, nota: string) => void
    vaciar: () => void
  }
  export function useSeleccion(): ValorSeleccion | null   // null cuando NO hay provider arriba
  ```

**El `null` es la parte importante:** `UnifiedPropertyDetail` es compartido y mañana puede usarlo otra pantalla. Si no hay provider, el check y el botón no se dibujan en vez de romper.

- [ ] **Step 1: Escribir el contexto**

```tsx
"use client"

// La selección de propiedades que el asesor está armando para un cliente.
//
// Se monta UNA sola vez por página, ARRIBA de la barra de solapas del Buscador, y por eso
// la selección cruza las solapas "Buscador" y "Mapa" (que son la misma página: ver
// app/asesor/consultor-ia/page.tsx). Al salir de la página el provider se desmonta y la
// selección se vacía sola, que es lo que se quiere: es de un solo uso.
//
// useSeleccion() devuelve null si no hay provider arriba. No es un descuido: los
// componentes que lo consumen (UnifiedPropertyCard, UnifiedPropertyDetail) son compartidos,
// y en una pantalla sin provider el check simplemente no se dibuja.
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  alternar as alternarPuro,
  anotar as anotarPuro,
  estaElegida,
  sacar as sacarPuro,
  type Candidata,
  type ItemSeleccion,
} from "@/lib/seleccion/estado"

export interface ValorSeleccion {
  items: ItemSeleccion[]
  elegida: (id: string) => boolean
  alternar: (c: Candidata) => void
  sacar: (id: string) => void
  anotar: (id: string, nota: string) => void
  vaciar: () => void
}

const Ctx = createContext<ValorSeleccion | null>(null)

export function SeleccionProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ItemSeleccion[]>([])

  const alternar = useCallback((c: Candidata) => {
    setItems((previos) => {
      const r = alternarPuro(previos, c)
      if (r.error) toast.error(r.error)
      return r.items
    })
  }, [])

  const sacar = useCallback((id: string) => setItems((p) => sacarPuro(p, id)), [])
  const anotar = useCallback((id: string, nota: string) => setItems((p) => anotarPuro(p, id, nota)), [])
  const vaciar = useCallback(() => setItems([]), [])

  const valor = useMemo<ValorSeleccion>(
    () => ({ items, elegida: (id) => estaElegida(items, id), alternar, sacar, anotar, vaciar }),
    [items, alternar, sacar, anotar, vaciar],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSeleccion(): ValorSeleccion | null {
  return useContext(Ctx)
}
```

- [ ] **Step 2: Montarlo en la página del asesor**

En `app/asesor/consultor-ia/page.tsx`, agregar el import:

```tsx
import { SeleccionProvider } from "@/components/seleccion/seleccion-contexto"
```

y envolver **todo** el `return` del componente, por fuera del `<div className="flex flex-col h-full overflow-hidden bg-background">` que contiene la barra de solapas (línea ~283). Queda:

```tsx
  return (
    <SeleccionProvider>
      <div className="flex flex-col h-full overflow-hidden bg-background">
        {/* … barra de solapas y el resto, sin tocar … */}
      </div>
    </SeleccionProvider>
  )
```

- [ ] **Step 3: Montarlo igual en la página del director**

Lo mismo en `app/director/consultor/page.tsx` (la barra de solapas está alrededor de la línea ~312; buscar el `return (` del componente principal y envolverlo).

- [ ] **Step 4: Verificar que compila y que nada cambió en pantalla**

Run: `npx tsc --noEmit`
Expected: sin errores.

Levantar `npm run dev`, abrir el Buscador como director y como asesor, cambiar entre las dos solapas. Todavía no hay nada visible nuevo: lo que se verifica es que **no se rompió nada**.

- [ ] **Step 5: Commit**

```bash
git add components/seleccion/seleccion-contexto.tsx app/asesor/consultor-ia/page.tsx app/director/consultor/page.tsx
git commit -m "feat(seleccion): el contexto, montado arriba de la barra de solapas

Va por encima del switch Buscador/Mapa: por eso lo marcado en el chat sigue
marcado en el mapa. useSeleccion() devuelve null sin provider, así que los
componentes compartidos no heredan la función en otras pantallas."
```

---

### Task 7: Marcar desde el Buscador (tarjeta y detalle)

**Files:**
- Create: `components/seleccion/marca-seleccion.tsx`
- Modify: `components/shared/consultor-results.tsx`

**Interfaces:**
- Consumes: `useSeleccion()` de la Task 6; `UnifiedProperty` de `consultor-results.tsx`.
- Produces:
  ```tsx
  export function candidataDePropiedad(p: {
    id: string; source: "own" | "agency" | "roomix"; title: string | null;
    price: number; currency: string; images?: string[]
  }): Candidata

  export function CheckSeleccion({ candidata }: { candidata: Candidata }): JSX.Element | null
  export function BotonSeleccion({ candidata }: { candidata: Candidata }): JSX.Element | null
  ```

- [ ] **Step 1: Escribir las dos formas de marcar**

```tsx
"use client"

// Las dos formas de marcar una propiedad: el check de los listados y el botón del detalle.
// Las dos leen del mismo contexto, así que lo marcado en un lado se ve marcado en el otro.
//
// Si no hay provider arriba, las dos devuelven null: los componentes que las usan son
// compartidos y no toda pantalla arma selecciones.
import { Check } from "lucide-react"
import { useSeleccion } from "./seleccion-contexto"
import type { Candidata } from "@/lib/seleccion/estado"

export function candidataDePropiedad(p: {
  id: string
  source: "own" | "agency" | "roomix"
  title: string | null
  price: number
  currency: string
  images?: string[]
}): Candidata {
  return {
    id: p.id,
    source: p.source,
    titulo: p.title || "Propiedad",
    precio: p.price || 0,
    moneda: p.currency || "USD",
    foto: p.images?.[0] || null,
  }
}

/**
 * El check de los listados.
 *
 * El área tocable mide 44px aunque el dibujo mida 24: en el celular, un blanco de 24px
 * se falla más de lo que se acierta. Y frena la propagación porque el contenedor de la
 * fila abre el detalle al clickearlo.
 */
export function CheckSeleccion({ candidata }: { candidata: Candidata }) {
  const seleccion = useSeleccion()
  if (!seleccion) return null

  const elegida = seleccion.elegida(candidata.id)

  return (
    <button
      type="button"
      aria-label={elegida ? "Sacar de la selección" : "Agregar a la selección"}
      aria-pressed={elegida}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        seleccion.alternar(candidata)
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${
          elegida
            ? "border-accent bg-accent text-accent-foreground"
            : "border-zinc-300 bg-white/80 dark:border-zinc-600 dark:bg-zinc-800/80"
        }`}
      >
        {elegida && <Check className="h-4 w-4" strokeWidth={3} />}
      </span>
    </button>
  )
}

/** El botón del detalle abierto. */
export function BotonSeleccion({ candidata }: { candidata: Candidata }) {
  const seleccion = useSeleccion()
  if (!seleccion) return null

  const elegida = seleccion.elegida(candidata.id)

  return (
    <button
      type="button"
      onClick={() => seleccion.alternar(candidata)}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${
        elegida
          ? "border border-accent/40 bg-accent/10 text-accent"
          : "bg-accent text-accent-foreground hover:bg-accent/90"
      }`}
    >
      <Check className="h-4 w-4" strokeWidth={3} />
      {elegida ? "Sacar de la selección" : "Agregar a la selección"}
    </button>
  )
}
```

- [ ] **Step 2: Poner el check en la tarjeta del Buscador**

En `components/shared/consultor-results.tsx`, agregar los imports:

```tsx
import { BotonSeleccion, CheckSeleccion, candidataDePropiedad } from "@/components/seleccion/marca-seleccion"
```

Dentro de `UnifiedPropertyCard` (línea 82), el contenedor exterior ya es
`<div … className="… relative cursor-pointer …" onClick={() => setShowDetail(true)}>`. Agregar
como **primer hijo**, arriba del badge:

```tsx
        {/* Check de selección. z-30 para quedar por encima del badge (z-20). */}
        <div className="absolute right-1 top-6 z-30">
          <CheckSeleccion candidata={candidataDePropiedad(property)} />
        </div>
```

- [ ] **Step 3: Poner el botón en el detalle**

Dentro de `UnifiedPropertyDetail` (línea 253), en la fila de acciones donde hoy vive
"Compartir ficha" (el pie del modal), agregar **antes** de ese botón:

```tsx
            <BotonSeleccion candidata={candidataDePropiedad(property)} />
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Probarlo en el navegador**

Levantar `npm run dev`, entrar como director, Buscador IA, buscar algo que traiga de las tres secciones. Verificar:
1. El check aparece en las tarjetas de **las tres** secciones.
2. Tocar el check marca y **no** abre el detalle.
3. Tocar la tarjeta (fuera del check) **sí** abre el detalle.
4. Con la propiedad ya marcada, el detalle dice "Sacar de la selección".
5. En celular emulado (390px), el check se toca al primer intento.

- [ ] **Step 6: Commit**

```bash
git add components/seleccion/marca-seleccion.tsx components/shared/consultor-results.tsx
git commit -m "feat(seleccion): marcar desde la tarjeta y desde el detalle del Buscador

El check tiene 44px de área tocable aunque el dibujo mida 24, y frena la
propagación: marcar no abre el detalle. El mismo botón del detalle sirve para el
mapa, que usa este mismo componente."
```

---

### Task 8: Marcar desde los listados del mapa

**Files:**
- Modify: `components/mapa/mapa-resultados.tsx`

**Interfaces:**
- Consumes: `CheckSeleccion`, `candidataDePropiedad` de la Task 7.
- Produces: nada nuevo. **Cubre los tres listados del mapa de una sola vez**, porque el panel de la derecha (`mapa-tab.tsx:481`) y los dos popups (`mapa-lista-modal.tsx:107`) usan este mismo componente.

- [ ] **Step 1: Convertir la fila de `<button>` a `<div>` con dos zonas**

En `components/mapa/mapa-resultados.tsx`, el `<button>` de la línea 101 pasa a ser un `<div>` con un `<button>` adentro para la zona que abre el detalle, y el check al lado. `onMouseEnter` queda en el contenedor para que enfocar el pin siga andando.

```tsx
          return (
            <div
              key={p.id}
              onMouseEnter={() => ubicada && onEnfocar?.(p)}
              className="flex w-full items-center gap-1 rounded-xl border border-zinc-200 bg-white/60 p-2 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-600"
            >
              <CheckSeleccion candidata={candidataDePropiedad(p)} />

              <button
                onClick={() => onAbrir(p.id)}
                className="flex min-w-0 flex-1 gap-3 text-left"
              >
                <img
                  src={p.images[0] || SIN_FOTO}
                  alt={p.title || "Propiedad"}
                  className="h-16 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_FUENTE[p.source]}`} />
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                      {ETIQUETA_FUENTE[p.source]}
                    </span>
                    {!ubicada && <MapPinOff className="h-3 w-3 text-amber-500" />}
                  </div>
                  <p className="truncate text-sm font-semibold">{precio(p)}</p>
                  <p className="truncate text-xs text-zinc-500">{p.address || p.city || "Sin dirección"}</p>
                  <p className="truncate text-[11px] text-zinc-400">
                    {/* `ambientes`, no `bedrooms`: hasta el 2026-08-14 esta linea decia
                        "3 amb." mostrando los DORMITORIOS, y en la cartera de Central los
                        dos numeros difieren en el 84% de las propiedades. */}
                    {[tipoEnCastellano(p.property_type), p.ambientes ? `${p.ambientes} amb.` : null, p.total_area ? `${p.total_area} m²` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </button>
            </div>
          )
```

Y agregar arriba del archivo:

```tsx
import { CheckSeleccion, candidataDePropiedad } from "@/components/seleccion/marca-seleccion"
```

- [ ] **Step 2: Correr los tests del mapa**

Run: `npm test`
Expected: PASS. Los tests del mapa (`node --test`) prueban lógica de `lib/mapa`, no el dibujo, así que no deberían moverse. **Si alguno se pone en rojo, parar y entender por qué antes de seguir.**

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Probarlo en el navegador, en los tres listados**

Levantar `npm run dev`, entrar al Buscador, solapa "Mapa". Verificar el check y que **no** abra el detalle, en:
1. El panel de la derecha.
2. El popup de un pin que tiene varias propiedades.
3. El popup de un globito (cúmulo).

Y en un pin con **una sola** propiedad: que vaya derecho al detalle y que ahí esté el botón.

- [ ] **Step 5: Commit**

```bash
git add components/mapa/mapa-resultados.tsx
git commit -m "feat(seleccion): marcar desde los tres listados del mapa

Los tres —panel derecho, popup del pin y popup del globito— dibujan sus filas
con MapaResultados, así que un solo cambio los cubre. La fila deja de ser un
<button> entero: un check adentro de un botón es HTML inválido y el navegador se
come uno de los dos clicks."
```

---

### Task 9: La barra flotante

**Files:**
- Create: `components/seleccion/barra-seleccion.tsx`
- Modify: `app/asesor/consultor-ia/page.tsx`
- Modify: `app/director/consultor/page.tsx`

**Interfaces:**
- Consumes: `useSeleccion()`.
- Produces: `export function BarraSeleccion({ onContinuar }: { onContinuar: () => void }): JSX.Element | null`

- [ ] **Step 1: Escribir la barra**

```tsx
"use client"

// La barra que aparece abajo cuando hay algo elegido.
//
// VA POR PORTAL A <body>, y no es prolijidad: adentro del contenedor del mapa las capas de
// Leaflet valen de 400 a 700, así que un `fixed` con z-index normal queda tapado por los
// pines y las calles. Mismo motivo por el que la ficha del mapa usa portal
// (components/mapa/mapa-ficha.tsx) y por el que lo hace el ACM.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { FileText, X } from "lucide-react"
import { useSeleccion } from "./seleccion-contexto"

export function BarraSeleccion({ onContinuar }: { onContinuar: () => void }) {
  const seleccion = useSeleccion()
  // El portal necesita el DOM: en el servidor no hay <body> al que colgarse.
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  if (!seleccion || !montado || seleccion.items.length === 0) return null

  const cuantas = seleccion.items.length

  const cancelar = () => {
    // Perder ocho propiedades marcadas por un toque de más es caro: de 3 para arriba se
    // pregunta. Con una o dos, volver a marcarlas cuesta menos que leer el cartel.
    if (cuantas >= 3 && !window.confirm(`¿Seguro que querés vaciar las ${cuantas} propiedades elegidas?`)) return
    seleccion.vaciar()
  }

  return createPortal(
    <div className="fixed bottom-5 left-1/2 z-[1200] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-accent/30 bg-card px-4 py-3 shadow-2xl shadow-black/30">
      <span className="whitespace-nowrap text-sm font-semibold">
        {cuantas} {cuantas === 1 ? "elegida" : "elegidas"}
      </span>
      <button
        onClick={cancelar}
        className="flex h-11 items-center gap-1 rounded-xl px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" /> Cancelar
      </button>
      <button
        onClick={onContinuar}
        className="flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
      >
        <FileText className="h-4 w-4" /> Continuar
      </button>
    </div>,
    document.body,
  )
}
```

> **El `z-[1200]`** sale de la ficha del mapa, que usa `z-[1100]`: la barra tiene que quedar
> por encima de todo lo del mapa, pero el repaso de la Task 10 va por encima de la barra.

- [ ] **Step 2: Montarla en las dos páginas**

En `app/asesor/consultor-ia/page.tsx` y `app/director/consultor/page.tsx`, agregar el estado del repaso y la barra adentro del `<SeleccionProvider>`, como último hijo:

```tsx
import { useState } from "react"   // ya está importado en las dos
import { BarraSeleccion } from "@/components/seleccion/barra-seleccion"
```

```tsx
  const [repasando, setRepasando] = useState(false)
```

```tsx
    <SeleccionProvider>
      <div className="flex flex-col h-full overflow-hidden bg-background">
        {/* … lo de siempre … */}
      </div>
      <BarraSeleccion onContinuar={() => setRepasando(true)} />
    </SeleccionProvider>
```

- [ ] **Step 3: Probarla en el navegador**

Marcar una en el chat: aparece "1 elegida". Marcar dos más: "3 elegidas". Tocar "Cancelar": pregunta y vacía. Pasar a la solapa "Mapa" con dos marcadas: **la barra sigue ahí y sigue contando 2**. Marcar una en el mapa: 3. Volver a "Buscador": siguen las 3.

En celular emulado (390px): que la barra no tape el último resultado del listado. Si lo tapa, agregarle al contenedor de la lista `pb-24` cuando hay selección.

- [ ] **Step 4: Commit**

```bash
git add components/seleccion/barra-seleccion.tsx app/asesor/consultor-ia/page.tsx app/director/consultor/page.tsx
git commit -m "feat(seleccion): barra flotante con el contador

Por portal a <body>: adentro del mapa las capas de Leaflet valen 400-700 y le
ganan a cualquier z-index. Cancelar pregunta de 3 para arriba."
```

---

### Task 10: El repaso con las notas y el botón de crear

**Files:**
- Create: `components/seleccion/repaso-seleccion.tsx`
- Modify: `app/asesor/consultor-ia/page.tsx`
- Modify: `app/director/consultor/page.tsx`

**Interfaces:**
- Consumes: `useSeleccion()`; `POST /api/seleccion` de la Task 3.
- Produces: `export function RepasoSeleccion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }): JSX.Element | null`

- [ ] **Step 1: Escribir el repaso**

```tsx
"use client"

// El repaso antes de generar la ficha: las elegidas en el orden en que se marcaron, con una
// nota opcional cada una, la nota final opcional del grupo, y el botón de crear.
//
// Portal a <body> por lo mismo que la barra: esto se abre también desde la solapa del mapa.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { useSeleccion } from "./seleccion-contexto"

const MAX_NOTA = 400
const MAX_NOTA_FINAL = 1000

export function RepasoSeleccion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const seleccion = useSeleccion()
  const [montado, setMontado] = useState(false)
  const [notaFinal, setNotaFinal] = useState("")
  const [creando, setCreando] = useState(false)
  useEffect(() => setMontado(true), [])

  if (!seleccion || !montado || !abierto || seleccion.items.length === 0) return null

  const crear = async () => {
    if (creando) return
    setCreando(true)
    try {
      const res = await fetch("/api/seleccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propiedades: seleccion.items.map((i) => ({ source: i.source, id: i.id, nota: i.nota })),
          nota_final: notaFinal,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No pudimos armar la ficha.")

      const url = `${window.location.origin}${data.path}`
      try { await navigator.clipboard.writeText(url) } catch { /* sin clipboard */ }
      window.open(data.path, "_blank", "noopener")

      if (data.omitidas?.length > 0) {
        // Nunca se descarta una propiedad en silencio.
        toast.warning(
          `La ficha está lista, pero ${data.omitidas.length === 1
            ? "una propiedad no entró porque ya no está publicada"
            : `${data.omitidas.length} propiedades no entraron porque ya no están publicadas`}.`,
        )
      } else {
        toast.success("Ficha lista y link copiado. Ya podés pegarlo en WhatsApp.")
      }

      seleccion.vaciar()
      setNotaFinal("")
      onCerrar()
    } catch (e: any) {
      toast.error(e.message || "No pudimos armar la ficha.")
    } finally {
      setCreando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Repasá antes de mandar</h2>
            <p className="text-sm text-muted-foreground">
              Podés escribirle a tu cliente por qué elegiste cada una. Si no escribís nada, no se muestra.
            </p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            {seleccion.items.map((item, i) => (
              <div key={item.id} className="flex gap-3 rounded-xl border p-3">
                <span className="mt-1 text-xs font-bold text-muted-foreground">{i + 1}</span>
                {item.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.foto} alt={item.titulo} className="h-16 w-20 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-16 w-20 shrink-0 rounded-lg bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.precio > 0
                          ? `${item.moneda === "ARS" ? "$" : "USD"} ${item.precio.toLocaleString("es-AR")}`
                          : "Consultar"}
                      </p>
                    </div>
                    <button
                      onClick={() => seleccion.sacar(item.id)}
                      className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Sacar
                    </button>
                  </div>
                  <textarea
                    value={item.nota}
                    onChange={(e) => seleccion.anotar(item.id, e.target.value.slice(0, MAX_NOTA))}
                    placeholder="Nota para tu cliente (opcional). Ej: es la más luminosa de las tres."
                    rows={2}
                    className="mt-2 w-full resize-none rounded-lg border bg-background p-2 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <label className="text-sm font-semibold">Nota final (opcional)</label>
            <textarea
              value={notaFinal}
              onChange={(e) => setNotaFinal(e.target.value.slice(0, MAX_NOTA_FINAL))}
              placeholder="Va al final de todo. Ej: cualquiera de las tres entra en tu presupuesto; decime cuál querés visitar."
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border bg-background p-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-5">
          <span className="text-sm text-muted-foreground">
            {seleccion.items.length} {seleccion.items.length === 1 ? "propiedad" : "propiedades"}
          </span>
          <button
            onClick={crear}
            disabled={creando}
            className="flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
          >
            {creando && <Loader2 className="h-4 w-4 animate-spin" />}
            {creando ? "Armando…" : "Crear la ficha"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Montarlo en las dos páginas**

Al lado de `<BarraSeleccion>`, en los dos archivos:

```tsx
import { RepasoSeleccion } from "@/components/seleccion/repaso-seleccion"
```

```tsx
      <BarraSeleccion onContinuar={() => setRepasando(true)} />
      <RepasoSeleccion abierto={repasando} onCerrar={() => setRepasando(false)} />
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Probarlo de punta a punta**

Marcar tres, "Continuar", escribir una nota en la primera, dejar las otras dos vacías, escribir la nota final, "Crear la ficha". Verificar: se abre la ficha en pestaña nueva, el link quedó copiado, la selección quedó vacía y el repaso cerrado. En la ficha: la nota de la primera se ve, las otras dos no tienen recuadro, la nota final está al final.

- [ ] **Step 5: Commit**

```bash
git add components/seleccion/repaso-seleccion.tsx app/asesor/consultor-ia/page.tsx app/director/consultor/page.tsx
git commit -m "feat(seleccion): el repaso con las notas y la creación de la ficha

Las dos notas son opcionales. Si una propiedad no entró porque la dieron de
baja, se avisa: nunca se descarta en silencio."
```

---

### Task 11: Verificación completa en el navegador

**Files:** ninguno. Es la prueba de verdad, con la cuenta de Leonardo (PRISMAIA - VAKDOR), **nunca con la de Central** y **nunca entrando como un asesor**.

- [ ] **Step 1: Levantar la app y pasarle el link a Leonardo**

Run: `npm run dev`

- [ ] **Step 2: Correr los 12 casos de la spec, en escritorio y en celular emulado**

1. Una sola elegida.
2. Doce elegidas, y el aviso al intentar la trece.
3. Sin ninguna nota → la ficha no muestra ningún recuadro ni espacio vacío.
4. Con las dos notas cargadas.
5. Mezcla de las tres fuentes: propia, agencia y red.
6. Una de la red dada de baja → se genera con el resto y avisa.
7. En el mapa, los cuatro caminos de marcado: check en el panel derecho, check en el popup del pin con varias, check en el popup del globito, botón en el detalle de un pin con una sola. Que los cuatro sumen a la misma selección.
8. En el Buscador, los dos caminos: check en la tarjeta y botón en el detalle. De las tres secciones, y de dos búsquedas distintas del mismo chat.
9. Que marcar con el check **no** abra el detalle, y que tocar la fila **sí**.
10. Que lo marcado en un lado se vea marcado en el otro: marcar en el listado, abrir el detalle, y que el botón ya diga "Sacar de la selección".
11. En el celular: que la barra flotante no tape el último resultado de la lista.
12. Que la selección cruce las solapas: dos en el chat, una en el mapa, volver al chat, siguen las tres. Y que salir de la página la deje vacía.

Para el caso 6, dar de baja a mano un aviso de prueba de la red **no se puede** (la tabla es de producción). En su lugar: crear la selección con un id inventado (`roomix_no-existe-xxx`) desde la consola del navegador y verificar que la ficha se genera con el resto y avisa.

- [ ] **Step 3: Correr todo el test suite una última vez**

Run: `npm test`
Expected: PASS, con los 22 tests nuevos.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run build`
Expected: build OK — que la página pública nueva no rompa el build de producción.

- [ ] **Step 4: El OK de Leonardo y recién ahí el merge**

Mostrarle lo que anduvo y lo que no. **No mergear a `main` sin su OK explícito.** Con el OK, el flujo clásico: `git checkout main`, `git merge --no-ff feat/seleccion-propiedades-ficha`, y el push lo hace él.

- [ ] **Step 5: Anotar el día en la bitácora**

Agregar la entrada en `docs/interno/bitacora-sesiones.md`: qué se construyó, las decisiones (incluida la premisa falsa del mapa como pantalla aparte y cómo se corrigió), y lo que quedó pendiente.
