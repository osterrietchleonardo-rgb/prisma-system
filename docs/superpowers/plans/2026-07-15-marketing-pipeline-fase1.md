# Módulo Marketing — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la página `/admin-vakdor/marketing` con un tablero kanban de ideas de contenido (6 columnas), alta manual, mover estados, reformular con IA y un "generar ideas" provisional — la base sobre la que las Fases 2–4 suman el motor automático, calendario y publicación.

**Architecture:** Página server-rendered que lee de Supabase (`marketing_ideas`) vía service role; tablero en un client component; todas las mutaciones pasan por Route Handlers protegidos con `requireAdminVakdor`; la IA usa `@anthropic-ai/sdk` (ya instalado) con un paquete de marca destilado de `vakdor-copywriter`.

**Tech Stack:** Next.js App Router (14), TypeScript, Supabase (`@supabase/supabase-js` service role), `@anthropic-ai/sdk` ^0.80.0, inline styles (paleta oscura admin).

## Global Constraints

- **No hay framework de tests en este repo** (scripts: `dev`, `build`, `lint`). La verificación de cada tarea es: `npm run lint` + `npm run build` (chequeo de TypeScript) + prueba manual con `npm run dev`. NO agregar vitest/jest (fuera de alcance). Claude corre `npm run dev` y entrega el link listo (no se lo pide a Leo).
- **Auth admin:** toda ruta bajo `app/api/admin-vakdor/**` usa `requireAdminVakdor(request)` + `isNextResponse(auth)` de `@/lib/admin-vakdor/guard`. Nunca dejar una ruta admin sin ese guard.
- **DB:** acceso solo vía `getAdminDb()` (`@/lib/admin-vakdor/logger`, service role). La tabla tiene RLS activado SIN políticas públicas.
- **Estilo UI:** inline styles, tema oscuro (fondo `#070B14`, tarjetas `rgba(255,255,255,0.025)`, acento índigo `#6366f1` y cobre `#c2783c`), consistente con `components/admin-vakdor/sidebar.tsx` y `finanzas-client.tsx`.
- **Modelo Claude:** confirmar id exacto y uso del SDK invocando la skill `claude-api` (paso explícito en Task 6). Default previsto: `claude-sonnet-5` para reformular/generar.
- **Regla de trabajo (memoria del proyecto):** todo se prueba en local; merge a `main` SOLO con OK explícito de Leo; commitear solo lo propio (nunca `git add -A`).
- **Nombres de estado (verbatim):** `idea` · `en_proceso` · `en_revision` · `aprobada` · `publicada` · `rechazada`.
- **Nombres de fuente (verbatim):** `linkedin` · `instagram` · `blog`.
- **Nombres de formato (verbatim):** `post_texto` · `carrusel` · `imagen` · `encuesta` · `articulo_linkedin` · `reel` · `lead_magnet` · `articulo_blog`.

---

### Task 1: Migración — tabla `marketing_ideas` + índices + RLS + bucket Storage

**Files:**
- Create: `supabase/migrations/20260715120000_create_marketing_ideas.sql`

**Interfaces:**
- Produces: tabla `marketing_ideas` con las columnas del spec; bucket privado `marketing-assets`.

- [ ] **Step 1: Escribir la migración SQL**

Create `supabase/migrations/20260715120000_create_marketing_ideas.sql`:

```sql
-- Módulo Marketing — pipeline de ideas de contenido (Agente IA de Marketing).
-- Tabla de back-office admin: RLS activado SIN políticas públicas (acceso solo service role).

create table if not exists public.marketing_ideas (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'idea'
    check (estado in ('idea','en_proceso','en_revision','aprobada','publicada','rechazada')),
  fuente text not null
    check (fuente in ('linkedin','instagram','blog')),
  formato text not null
    check (formato in ('post_texto','carrusel','imagen','encuesta','articulo_linkedin','reel','lead_magnet','articulo_blog')),
  titulo text not null,
  angulo text,
  estructura text,
  gancho text,
  contenido text,
  primer_comentario text,
  hashtags text[] default '{}',
  motivo text,
  comentario text,
  brief jsonb default '{}'::jsonb,
  blog jsonb default '{}'::jsonb,
  assets jsonb default '[]'::jsonb,
  programada_para timestamptz,
  publicado_en jsonb,
  origen text not null default 'manual'
    check (origen in ('motor','manual')),
  historial jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_ideas_estado on public.marketing_ideas(estado);
create index if not exists idx_marketing_ideas_fuente on public.marketing_ideas(fuente);
create index if not exists idx_marketing_ideas_created on public.marketing_ideas(created_at desc);

-- updated_at automático (reutiliza patrón existente si la función ya existe).
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_marketing_ideas_updated_at on public.marketing_ideas;
create trigger trg_marketing_ideas_updated_at
  before update on public.marketing_ideas
  for each row execute function public.set_updated_at();

-- RLS: activado, sin políticas (el service role las saltea; nadie más entra).
alter table public.marketing_ideas enable row level security;

-- Bucket privado para assets (PDF de lead magnet, PNG de carrusel).
insert into storage.buckets (id, name, public)
values ('marketing-assets', 'marketing-assets', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar la migración**

Aplicar el contenido del archivo vía la tool `mcp__supabase__apply_migration` (name: `create_marketing_ideas`, query: el SQL de arriba). Es aditivo (crea tabla/bucket nuevos): no toca nada existente.

- [ ] **Step 3: Verificar que la tabla existe**

Usar `mcp__supabase__list_tables` (schema `public`) y confirmar que aparece `marketing_ideas` con las columnas esperadas. Confirmar el bucket con `mcp__supabase__list_storage_buckets` (debe listar `marketing-assets`, `public=false`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260715120000_create_marketing_ideas.sql
git commit -m "feat(marketing): migracion tabla marketing_ideas + bucket Storage"
```

---

### Task 2: Tipos y capa de datos (`types.ts` + `store.ts`)

**Files:**
- Create: `lib/admin-vakdor/marketing/types.ts`
- Create: `lib/admin-vakdor/marketing/store.ts`

**Interfaces:**
- Consumes: `getAdminDb()` de `@/lib/admin-vakdor/logger`.
- Produces:
  - Tipos: `EstadoIdea`, `FuenteIdea`, `FormatoIdea`, `MarketingIdea`, `ESTADOS`, `NuevaIdeaInput`.
  - Funciones store: `listarIdeas(): Promise<MarketingIdea[]>`, `crearIdeaManual(input: NuevaIdeaInput): Promise<MarketingIdea>`, `moverEstado(id: string, estado: EstadoIdea): Promise<void>`, `actualizarContenido(id: string, patch: { contenido?: string; primer_comentario?: string; comentario?: string; evento: HistorialEvento }): Promise<void>`, `insertarIdeasMotor(ideas: NuevaIdeaInput[]): Promise<number>`, `firmarAsset(path: string): Promise<string | null>`, `resumenParaMemoria(): Promise<{ titulo: string; angulo: string | null }[]>`.

- [ ] **Step 1: Escribir los tipos**

Create `lib/admin-vakdor/marketing/types.ts`:

```typescript
export type EstadoIdea =
  | "idea" | "en_proceso" | "en_revision" | "aprobada" | "publicada" | "rechazada"

export type FuenteIdea = "linkedin" | "instagram" | "blog"

export type FormatoIdea =
  | "post_texto" | "carrusel" | "imagen" | "encuesta"
  | "articulo_linkedin" | "reel" | "lead_magnet" | "articulo_blog"

/** Columnas del tablero, en orden. `rechazada` va al costado (terminal). */
export const ESTADOS: { key: EstadoIdea; label: string }[] = [
  { key: "idea", label: "Idea" },
  { key: "en_proceso", label: "En proceso" },
  { key: "en_revision", label: "En revisión" },
  { key: "aprobada", label: "Aprobada" },
  { key: "publicada", label: "Publicada" },
  { key: "rechazada", label: "Rechazada" },
]

export interface HistorialEvento {
  fecha: string
  tipo: string
  detalle?: string
}

export interface AssetRef {
  tipo: "pdf" | "png"
  path: string
  orden?: number
}

export interface MarketingIdea {
  id: string
  estado: EstadoIdea
  fuente: FuenteIdea
  formato: FormatoIdea
  titulo: string
  angulo: string | null
  estructura: string | null
  gancho: string | null
  contenido: string | null
  primer_comentario: string | null
  hashtags: string[]
  motivo: string | null
  comentario: string | null
  brief: Record<string, unknown>
  blog: Record<string, unknown>
  assets: AssetRef[]
  programada_para: string | null
  publicado_en: Record<string, unknown> | null
  origen: "motor" | "manual"
  historial: HistorialEvento[]
  created_at: string
  updated_at: string
}

export interface NuevaIdeaInput {
  titulo: string
  fuente: FuenteIdea
  formato: FormatoIdea
  angulo?: string | null
  estructura?: string | null
  gancho?: string | null
  contenido?: string | null
  primer_comentario?: string | null
  hashtags?: string[]
  motivo?: string | null
  brief?: Record<string, unknown>
  origen?: "motor" | "manual"
}
```

- [ ] **Step 2: Escribir la capa de datos**

Create `lib/admin-vakdor/marketing/store.ts`:

```typescript
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import type {
  MarketingIdea, EstadoIdea, NuevaIdeaInput, HistorialEvento,
} from "./types"

const COLS =
  "id, estado, fuente, formato, titulo, angulo, estructura, gancho, contenido, " +
  "primer_comentario, hashtags, motivo, comentario, brief, blog, assets, " +
  "programada_para, publicado_en, origen, historial, created_at, updated_at"

export async function listarIdeas(): Promise<MarketingIdea[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(`listarIdeas: ${error.message}`)
  return (data ?? []) as MarketingIdea[]
}

export async function crearIdeaManual(input: NuevaIdeaInput): Promise<MarketingIdea> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .insert({
      titulo: input.titulo,
      fuente: input.fuente,
      formato: input.formato,
      angulo: input.angulo ?? null,
      estructura: input.estructura ?? null,
      gancho: input.gancho ?? null,
      contenido: input.contenido ?? null,
      primer_comentario: input.primer_comentario ?? null,
      hashtags: input.hashtags ?? [],
      motivo: input.motivo ?? null,
      brief: input.brief ?? {},
      origen: input.origen ?? "manual",
      estado: "idea",
      historial: [{ fecha: new Date().toISOString(), tipo: "creada", detalle: input.origen ?? "manual" }],
    })
    .select(COLS)
    .single()
  if (error) throw new Error(`crearIdeaManual: ${error.message}`)
  return data as MarketingIdea
}

export async function insertarIdeasMotor(ideas: NuevaIdeaInput[]): Promise<number> {
  if (ideas.length === 0) return 0
  const db = getAdminDb()
  const rows = ideas.map((i) => ({
    titulo: i.titulo,
    fuente: i.fuente,
    formato: i.formato,
    angulo: i.angulo ?? null,
    estructura: i.estructura ?? null,
    gancho: i.gancho ?? null,
    contenido: i.contenido ?? null,
    primer_comentario: i.primer_comentario ?? null,
    hashtags: i.hashtags ?? [],
    motivo: i.motivo ?? null,
    brief: i.brief ?? {},
    origen: "motor" as const,
    estado: "idea" as const,
    historial: [{ fecha: new Date().toISOString(), tipo: "creada", detalle: "motor" }],
  }))
  const { error, count } = await db
    .from("marketing_ideas")
    .insert(rows, { count: "exact" })
  if (error) throw new Error(`insertarIdeasMotor: ${error.message}`)
  return count ?? rows.length
}

async function leerIdea(id: string): Promise<MarketingIdea> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas").select(COLS).eq("id", id).single()
  if (error) throw new Error(`leerIdea: ${error.message}`)
  return data as MarketingIdea
}

export async function moverEstado(id: string, estado: EstadoIdea): Promise<void> {
  const db = getAdminDb()
  const actual = await leerIdea(id)
  const evento: HistorialEvento = {
    fecha: new Date().toISOString(), tipo: "movida", detalle: `${actual.estado} → ${estado}`,
  }
  const { error } = await db
    .from("marketing_ideas")
    .update({ estado, historial: [...(actual.historial ?? []), evento] })
    .eq("id", id)
  if (error) throw new Error(`moverEstado: ${error.message}`)
}

export async function actualizarContenido(
  id: string,
  patch: { contenido?: string; primer_comentario?: string; comentario?: string; evento: HistorialEvento },
): Promise<void> {
  const db = getAdminDb()
  const actual = await leerIdea(id)
  const update: Record<string, unknown> = {
    historial: [...(actual.historial ?? []), patch.evento],
  }
  if (patch.contenido !== undefined) update.contenido = patch.contenido
  if (patch.primer_comentario !== undefined) update.primer_comentario = patch.primer_comentario
  if (patch.comentario !== undefined) update.comentario = patch.comentario
  const { error } = await db.from("marketing_ideas").update(update).eq("id", id)
  if (error) throw new Error(`actualizarContenido: ${error.message}`)
}

/** Títulos + ángulos recientes, para que el motor NO repita (memoria anti-repetición). */
export async function resumenParaMemoria(): Promise<{ titulo: string; angulo: string | null }[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .select("titulo, angulo")
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) throw new Error(`resumenParaMemoria: ${error.message}`)
  return (data ?? []) as { titulo: string; angulo: string | null }[]
}

/** URL firmada temporal para ver/descargar un asset del bucket privado. */
export async function firmarAsset(path: string): Promise<string | null> {
  const db = getAdminDb()
  const { data, error } = await db.storage
    .from("marketing-assets")
    .createSignedUrl(path, 60 * 30) // 30 min
  if (error) return null
  return data?.signedUrl ?? null
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npm run lint`
Expected: sin errores en `lib/admin-vakdor/marketing/*`.

- [ ] **Step 4: Commit**

```bash
git add lib/admin-vakdor/marketing/types.ts lib/admin-vakdor/marketing/store.ts
git commit -m "feat(marketing): tipos y capa de datos (store) de marketing_ideas"
```

---

### Task 3: Página + tablero kanban (render de solo lectura)

**Files:**
- Create: `app/admin-vakdor/marketing/page.tsx`
- Create: `components/admin-vakdor/marketing-client.tsx`
- Modify: `components/admin-vakdor/sidebar.tsx` (agregar item de nav)

**Interfaces:**
- Consumes: `listarIdeas()` (Task 2), tipos `MarketingIdea`, `ESTADOS`.
- Produces: componente `MarketingClient` (default export) que recibe `{ ideas: MarketingIdea[] }`.

- [ ] **Step 1: Página server**

Create `app/admin-vakdor/marketing/page.tsx`:

```tsx
import { listarIdeas } from "@/lib/admin-vakdor/marketing/store"
import MarketingClient from "@/components/admin-vakdor/marketing-client"

export const metadata = {
  title: "Marketing · Panel Admin",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminMarketingPage() {
  const ideas = await listarIdeas()
  return <MarketingClient ideas={ideas} />
}
```

- [ ] **Step 2: Client — tablero de solo lectura**

Create `components/admin-vakdor/marketing-client.tsx`:

```tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ESTADOS, type MarketingIdea, type EstadoIdea } from "@/lib/admin-vakdor/marketing/types"

const ACCENT = "#c2783c"

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 999,
      background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
      whiteSpace: "nowrap",
    }}>{children}</span>
  )
}

function Card({ idea }: { idea: MarketingIdea }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: 12, marginBottom: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>
        {idea.titulo}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Chip>{idea.fuente}</Chip>
        <Chip>{idea.formato}</Chip>
        {idea.angulo ? <Chip>{idea.angulo}</Chip> : null}
      </div>
      {idea.motivo ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
          {idea.motivo}
        </div>
      ) : null}
    </div>
  )
}

export default function MarketingClient({ ideas }: { ideas: MarketingIdea[] }) {
  const router = useRouter()
  const [items] = useState<MarketingIdea[]>(ideas)

  const porEstado = (e: EstadoIdea) => items.filter((i) => i.estado === e)

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Marketing</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
            Pipeline de contenido del Agente IA de Marketing
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
        {ESTADOS.map((col) => {
          const cards = porEstado(col.key)
          const esRechazada = col.key === "rechazada"
          return (
            <div key={col.key} style={{
              minWidth: 260, width: 260, flexShrink: 0,
              background: esRechazada ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.015)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 12,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: esRechazada ? "#fca5a5" : ACCENT, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {col.label}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{cards.length}</span>
              </div>
              {cards.map((idea) => <Card key={idea.id} idea={idea} />)}
              {cards.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "16px 0" }}>—</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Agregar item al sidebar**

Modify `components/admin-vakdor/sidebar.tsx` — en el array `NAV`, después del item de Finanzas, agregar:

```tsx
  { href: "/admin-vakdor/marketing", icon: "📣", label: "Marketing" },
```

- [ ] **Step 4: Verificar en el navegador**

Run: `npm run dev` (Claude lo levanta y entrega el link).
Verificar: navegar a `/admin-vakdor/marketing` (con sesión admin) → se ve el título, el subtítulo y las 6 columnas (vacías o con las ideas que haya). El item "Marketing" aparece en el sidebar y queda activo.
Correr también: `npm run lint` y `npm run build` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin-vakdor/marketing/page.tsx components/admin-vakdor/marketing-client.tsx components/admin-vakdor/sidebar.tsx
git commit -m "feat(marketing): pagina + tablero kanban (solo lectura) + nav"
```

---

### Task 4: Mover estado (Route Handler + drag/botones)

**Files:**
- Create: `app/api/admin-vakdor/marketing/[id]/estado/route.ts`
- Modify: `components/admin-vakdor/marketing-client.tsx`

**Interfaces:**
- Consumes: `moverEstado()` (Task 2), `requireAdminVakdor`, `isNextResponse`.
- Produces: `PATCH /api/admin-vakdor/marketing/:id/estado` con body `{ estado: EstadoIdea }` → `{ ok: true }`.

- [ ] **Step 1: Route handler**

Create `app/api/admin-vakdor/marketing/[id]/estado/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { moverEstado } from "@/lib/admin-vakdor/marketing/store"
import type { EstadoIdea } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

const VALID: EstadoIdea[] = ["idea","en_proceso","en_revision","aprobada","publicada","rechazada"]

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const estado = body?.estado as EstadoIdea | undefined
  if (!estado || !VALID.includes(estado)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400 })
  }
  try {
    await moverEstado(params.id, estado)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Wire mover en el client (botones + drag)**

Modify `components/admin-vakdor/marketing-client.tsx`:

1. Reemplazar `const [items] = useState(...)` por `const [items, setItems] = useState<MarketingIdea[]>(ideas)` y agregar estado de drag: `const [dragId, setDragId] = useState<string | null>(null)`.

2. Agregar la función de mover (dentro del componente `MarketingClient`):

```tsx
  async function mover(id: string, estado: EstadoIdea) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, estado } : i)))
    const res = await fetch(`/api/admin-vakdor/marketing/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) { router.refresh() } // revertir con la verdad del server si falló
  }
```

3. Cambiar `Card` para recibir `onMover` y `estadoActual`, y renderizar botones ◀ ▶ según el orden de `ESTADOS`. Reemplazar el componente `Card` por:

```tsx
function Card({ idea, onMover }: { idea: MarketingIdea; onMover: (id: string, e: EstadoIdea) => void }) {
  const orden = ESTADOS.map((e) => e.key)
  const i = orden.indexOf(idea.estado)
  const prev = i > 0 ? orden[i - 1] : null
  const next = i < orden.length - 1 ? orden[i + 1] : null
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", idea.id)}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10, padding: 12, marginBottom: 10, cursor: "grab",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>
        {idea.titulo}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Chip>{idea.fuente}</Chip>
        <Chip>{idea.formato}</Chip>
        {idea.angulo ? <Chip>{idea.angulo}</Chip> : null}
      </div>
      {idea.motivo ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginBottom: 8 }}>
          {idea.motivo}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button disabled={!prev} onClick={() => prev && onMover(idea.id, prev)}
          style={{ fontSize: 14, background: "none", border: "none", color: prev ? "#a5b4fc" : "rgba(255,255,255,0.15)", cursor: prev ? "pointer" : "default" }}>◀</button>
        <button disabled={!next} onClick={() => next && onMover(idea.id, next)}
          style={{ fontSize: 14, background: "none", border: "none", color: next ? "#a5b4fc" : "rgba(255,255,255,0.15)", cursor: next ? "pointer" : "default" }}>▶</button>
      </div>
    </div>
  )
}
```

4. En la columna, aceptar el drop. Envolver el contenido de cada columna con handlers:

```tsx
            <div key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("text/plain")
                if (id) mover(id, col.key)
              }}
              style={{ /* ...mismos estilos... */ }}>
```

5. Pasar `onMover={mover}` a cada `<Card>`.

- [ ] **Step 3: Verificar en el navegador**

Run: `npm run dev`.
Verificar: mover una tarjeta con ▶ la pasa a la siguiente columna; recargar la página (F5) y el cambio persiste. Arrastrar una tarjeta a otra columna también funciona y persiste.
Run: `npm run lint` && `npm run build` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin-vakdor/marketing/[id]/estado/route.ts components/admin-vakdor/marketing-client.tsx
git commit -m "feat(marketing): mover ideas de estado (drag + botones) con persistencia"
```

---

### Task 5: Alta manual de idea (Route Handler + formulario)

**Files:**
- Create: `app/api/admin-vakdor/marketing/route.ts`
- Modify: `components/admin-vakdor/marketing-client.tsx`

**Interfaces:**
- Consumes: `crearIdeaManual()` (Task 2), `requireAdminVakdor`.
- Produces: `POST /api/admin-vakdor/marketing` body `{ titulo, fuente, formato, angulo?, motivo? }` → `{ idea: MarketingIdea }`.

- [ ] **Step 1: Route handler**

Create `app/api/admin-vakdor/marketing/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { crearIdeaManual } from "@/lib/admin-vakdor/marketing/store"
import type { FuenteIdea, FormatoIdea } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

const FUENTES: FuenteIdea[] = ["linkedin", "instagram", "blog"]
const FORMATOS: FormatoIdea[] = ["post_texto","carrusel","imagen","encuesta","articulo_linkedin","reel","lead_magnet","articulo_blog"]

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const titulo = (body?.titulo as string | undefined)?.trim()
  const fuente = body?.fuente as FuenteIdea | undefined
  const formato = body?.formato as FormatoIdea | undefined
  if (!titulo || !fuente || !FUENTES.includes(fuente) || !formato || !FORMATOS.includes(formato)) {
    return NextResponse.json({ error: "faltan campos válidos (titulo, fuente, formato)" }, { status: 400 })
  }
  try {
    const idea = await crearIdeaManual({
      titulo, fuente, formato,
      angulo: (body?.angulo as string | undefined)?.trim() || null,
      motivo: (body?.motivo as string | undefined)?.trim() || null,
      origen: "manual",
    })
    return NextResponse.json({ idea })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Botón + modal de alta en el client**

Modify `components/admin-vakdor/marketing-client.tsx`:

1. Agregar estado: `const [nueva, setNueva] = useState(false)`.

2. En el header, junto al título, agregar el botón:

```tsx
        <button onClick={() => setNueva(true)}
          style={{ padding: "9px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + Nueva idea
        </button>
```

3. Agregar el modal (al final del JSX, antes de cerrar el div raíz). Usa un `<form>` no controlado con `FormData`:

```tsx
      {nueva ? (
        <div onClick={() => setNueva(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <form onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget as HTMLFormElement)
              const res = await fetch("/api/admin-vakdor/marketing", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  titulo: fd.get("titulo"), fuente: fd.get("fuente"),
                  formato: fd.get("formato"), angulo: fd.get("angulo"), motivo: fd.get("motivo"),
                }),
              })
              if (res.ok) { const { idea } = await res.json(); setItems((p) => [idea, ...p]); setNueva(false) }
            }}
            style={{ background: "#0d1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: 420, display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 16, color: "#fff", margin: 0 }}>Nueva idea</h2>
            <input name="titulo" required placeholder="Título de la idea" style={inputStyle} />
            <select name="fuente" defaultValue="linkedin" style={inputStyle}>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="blog">Blog</option>
            </select>
            <select name="formato" defaultValue="post_texto" style={inputStyle}>
              <option value="post_texto">Post de texto</option>
              <option value="carrusel">Carrusel</option>
              <option value="imagen">Imagen</option>
              <option value="encuesta">Encuesta</option>
              <option value="articulo_linkedin">Artículo LinkedIn</option>
              <option value="reel">Reel</option>
              <option value="lead_magnet">Lead magnet</option>
              <option value="articulo_blog">Artículo blog</option>
            </select>
            <input name="angulo" placeholder="Ángulo (opcional)" style={inputStyle} />
            <input name="motivo" placeholder="Motivo / por qué (opcional)" style={inputStyle} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setNueva(false)} style={{ padding: "8px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Cancelar</button>
              <button type="submit" style={{ padding: "8px 14px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Crear</button>
            </div>
          </form>
        </div>
      ) : null}
```

4. Agregar la constante de estilo compartida (arriba, junto a `ACCENT`):

```tsx
const inputStyle: React.CSSProperties = {
  padding: "9px 12px", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  color: "#fff", fontSize: 13, outline: "none",
}
```

- [ ] **Step 3: Verificar**

Run: `npm run dev`. Tocar "+ Nueva idea", completar título/fuente/formato, Crear → aparece en la columna "Idea" sin recargar; recargar y sigue ahí.
Run: `npm run lint` && `npm run build` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin-vakdor/marketing/route.ts components/admin-vakdor/marketing-client.tsx
git commit -m "feat(marketing): alta manual de idea (modal + endpoint)"
```

---

### Task 6: Cliente Claude + paquete de marca destilado

**Files:**
- Create: `lib/admin-vakdor/marketing/brand-prompt.ts`
- Create: `lib/admin-vakdor/marketing/claude.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk` (ya instalado), `process.env.ANTHROPIC_API_KEY`.
- Produces:
  - `BRAND_SYSTEM: string` (paquete de marca destilado).
  - `generarTexto(system: string, user: string): Promise<string>` — una llamada simple a Claude que devuelve texto.

- [ ] **Step 1: Confirmar modelo/SDK con la skill claude-api**

Invocar la skill `claude-api` (Skill tool) para confirmar: id de modelo vigente (default previsto `claude-sonnet-5`), forma de `client.messages.create`, y manejo de la key. Ajustar el código del Step 3 a lo que indique la skill si difiere.

- [ ] **Step 2: Paquete de marca destilado**

Create `lib/admin-vakdor/marketing/brand-prompt.ts`:

```typescript
/**
 * Paquete de marca DESTILADO para tareas interactivas de la app (reformular /
 * generar provisional). NO reemplaza la skill vakdor-copywriter — es el mínimo
 * de marca para el motor liviano. Mantener alineado a
 * .claude/skills/vakdor-copywriter/SKILL.md.
 */
export const BRAND_SYSTEM = `
Sos el copywriter estratégico de Vakdor. Vendés PRISMA: el Sistema Operativo
centralizado para agencias inmobiliarias (integra Tokko Broker + WhatsApp + IA).
Target principal (LinkedIn): IPC2 = director/dueño de inmobiliaria con +30 asesores,
+300 propiedades y capacidad de inversión.

EJE CLAVE (el norte de toda pieza — aterrizá SIEMPRE en el Resultado):
- Vehículo: integración tecnológica total (Vakdor = partner, no proveedor).
- Mecanismo: sistematizar conocimiento y procesos (Método P-R-I-S-M-A).
- Resultado: eliminar la dependencia operativa → control total y trazabilidad.
Al director NO le interesa el software; le interesa recuperar el control.

3 FRACTURAS a agitar: Hemorragia de oportunidades · Anarquía comercial (falta de
sistematización) · Ceguera de gobernanza (liderar a ciegas).

REGLAS DE FORMATO (inquebrantables):
- Segunda persona ("vos", "tu agencia", "tenés"). Nunca hablar del rubro en 3ª persona.
- Párrafos de 2-3 líneas, con línea en blanco entre ellos. Cero emojis.
- Viñetas con "•", nunca guiones largos. Sin links en el cuerpo (van al primer comentario).
- LinkedIn = ultracualificación (hook con calificador de escala, posición fuerte, CTA que no ruega).
- Tono base: consultivo + analítico, con dosis de provocador para filtrar.
`.trim()
```

- [ ] **Step 3: Cliente Claude**

Create `lib/admin-vakdor/marketing/claude.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-sonnet-5" // confirmar con la skill claude-api

export async function generarTexto(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
  })
  const parts = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
  return parts.join("\n").trim()
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run lint` && `npm run build` → sin errores de tipos en `marketing/claude.ts` ni `brand-prompt.ts`.

- [ ] **Step 5: Confirmar env**

Verificar que `ANTHROPIC_API_KEY` esté en el `.env` local (para probar) y avisar a Leo que debe existir en Vercel. Si no está en local, pedírsela antes de probar Tasks 7–8.

- [ ] **Step 6: Commit**

```bash
git add lib/admin-vakdor/marketing/brand-prompt.ts lib/admin-vakdor/marketing/claude.ts
git commit -m "feat(marketing): cliente Claude + paquete de marca destilado"
```

---

### Task 7: Reformular contenido (Route Handler + UI en "En revisión")

**Files:**
- Create: `app/api/admin-vakdor/marketing/[id]/reformular/route.ts`
- Modify: `components/admin-vakdor/marketing-client.tsx`

**Interfaces:**
- Consumes: `generarTexto()` + `BRAND_SYSTEM` (Task 6), `actualizarContenido()` (Task 2), `requireAdminVakdor`.
- Produces: `POST /api/admin-vakdor/marketing/:id/reformular` body `{ comentario: string }` → `{ contenido: string }`.

- [ ] **Step 1: Route handler**

Create `app/api/admin-vakdor/marketing/[id]/reformular/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { actualizarContenido } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const comentario = (body?.comentario as string | undefined)?.trim()
  if (!comentario) return NextResponse.json({ error: "falta comentario" }, { status: 400 })

  const db = getAdminDb()
  const { data: idea, error } = await db
    .from("marketing_ideas")
    .select("titulo, fuente, formato, contenido")
    .eq("id", params.id).single()
  if (error || !idea) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  const user = [
    `Pieza: ${idea.fuente} · ${idea.formato}. Título: ${idea.titulo}.`,
    idea.contenido ? `Borrador actual:\n${idea.contenido}` : `Todavía no hay borrador; escribí uno.`,
    `Instrucción del director para reformular: ${comentario}`,
    `Devolvé SOLO el nuevo texto de la pieza, listo para publicar. Sin explicaciones.`,
  ].join("\n\n")

  try {
    const contenido = await generarTexto(BRAND_SYSTEM, user)
    await actualizarContenido(params.id, {
      contenido, comentario,
      evento: { fecha: new Date().toISOString(), tipo: "reformulada", detalle: comentario.slice(0, 120) },
    })
    return NextResponse.json({ contenido })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: UI de reformular en tarjetas "En revisión"**

Modify `components/admin-vakdor/marketing-client.tsx` — extender `Card` para que, cuando `idea.estado === "en_revision"`, muestre el contenido y un input de comentario + botón Reformular. Agregar dentro de `Card`, antes de los botones ◀▶:

```tsx
      {idea.estado === "en_revision" ? <Reformular idea={idea} /> : null}
```

Y agregar el subcomponente `Reformular` (en el mismo archivo):

```tsx
function Reformular({ idea }: { idea: MarketingIdea }) {
  const [comentario, setComentario] = useState("")
  const [contenido, setContenido] = useState(idea.contenido ?? "")
  const [cargando, setCargando] = useState(false)
  return (
    <div style={{ marginBottom: 8 }}>
      {contenido ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto", marginBottom: 6, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
          {contenido}
        </div>
      ) : null}
      <textarea value={comentario} onChange={(e) => setComentario(e.target.value)}
        placeholder="Comentario para reformular…" rows={2}
        style={{ width: "100%", fontSize: 11, padding: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", resize: "vertical" }} />
      <button disabled={cargando || !comentario.trim()}
        onClick={async () => {
          setCargando(true)
          const res = await fetch(`/api/admin-vakdor/marketing/${idea.id}/reformular`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comentario }),
          })
          if (res.ok) { const d = await res.json(); setContenido(d.contenido); setComentario("") }
          setCargando(false)
        }}
        style={{ marginTop: 6, width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 600, background: cargando ? "rgba(194,120,60,0.4)" : ACCENT, border: "none", borderRadius: 6, color: "#fff", cursor: cargando ? "default" : "pointer" }}>
        {cargando ? "Reformulando…" : "Reformular"}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verificar en el navegador**

Run: `npm run dev`. Mover una idea a "En revisión", escribir un comentario ("hacelo más directo"), tocar Reformular → en unos segundos aparece el texto nuevo. Recargar: el contenido persiste (quedó guardado).
Run: `npm run lint` && `npm run build` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin-vakdor/marketing/[id]/reformular/route.ts components/admin-vakdor/marketing-client.tsx
git commit -m "feat(marketing): reformular contenido con Claude en columna En revision"
```

---

### Task 8: "Generar ideas ahora" provisional (Route Handler + botón)

**Files:**
- Create: `app/api/admin-vakdor/marketing/generar/route.ts`
- Modify: `components/admin-vakdor/marketing-client.tsx`

**Interfaces:**
- Consumes: `generarTexto()` + `BRAND_SYSTEM` (Task 6), `resumenParaMemoria()` + `insertarIdeasMotor()` (Task 2), `requireAdminVakdor`.
- Produces: `POST /api/admin-vakdor/marketing/generar` → `{ creadas: number }`.

- [ ] **Step 1: Route handler**

Create `app/api/admin-vakdor/marketing/generar/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { resumenParaMemoria, insertarIdeasMotor } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"
import type { NuevaIdeaInput, FuenteIdea, FormatoIdea } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

const FUENTES: FuenteIdea[] = ["linkedin", "instagram", "blog"]
const FORMATOS: FormatoIdea[] = ["post_texto","carrusel","imagen","encuesta","articulo_linkedin","reel","lead_magnet","articulo_blog"]

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const previas = await resumenParaMemoria()
  const evitar = previas.map((p) => `- ${p.titulo}${p.angulo ? ` (${p.angulo})` : ""}`).join("\n") || "(ninguna todavía)"

  const user = [
    `Generá 5 ideas de contenido para Vakdor (mezcla LinkedIn y blog).`,
    `NO repitas estos ángulos/títulos ya usados:\n${evitar}`,
    `Devolvé SOLO un array JSON válido, sin texto extra, con objetos:`,
    `{"titulo": string, "fuente": "linkedin"|"blog", "formato": "post_texto"|"carrusel"|"articulo_blog", "angulo": string, "gancho": string, "motivo": string}`,
  ].join("\n\n")

  let raw: string
  try {
    raw = await generarTexto(BRAND_SYSTEM, user)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Extraer el array JSON de la respuesta (tolerante a fences ```json).
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return NextResponse.json({ error: "respuesta IA sin JSON", raw }, { status: 502 })
  let parsed: unknown
  try { parsed = JSON.parse(match[0]) } catch { return NextResponse.json({ error: "JSON inválido", raw }, { status: 502 }) }
  if (!Array.isArray(parsed)) return NextResponse.json({ error: "no es array", raw }, { status: 502 })

  const ideas: NuevaIdeaInput[] = []
  for (const it of parsed as Record<string, unknown>[]) {
    const titulo = typeof it.titulo === "string" ? it.titulo.trim() : ""
    const fuente = it.fuente as FuenteIdea
    const formato = it.formato as FormatoIdea
    if (!titulo || !FUENTES.includes(fuente) || !FORMATOS.includes(formato)) continue
    ideas.push({
      titulo, fuente, formato,
      angulo: typeof it.angulo === "string" ? it.angulo : null,
      gancho: typeof it.gancho === "string" ? it.gancho : null,
      motivo: typeof it.motivo === "string" ? it.motivo : null,
      origen: "motor",
    })
  }
  try {
    const creadas = await insertarIdeasMotor(ideas)
    return NextResponse.json({ creadas })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Botón "Generar ideas ahora"**

Modify `components/admin-vakdor/marketing-client.tsx` — en el header, junto a "+ Nueva idea", agregar:

```tsx
        <button onClick={async () => {
            const res = await fetch("/api/admin-vakdor/marketing/generar", { method: "POST" })
            if (res.ok) router.refresh()
            else alert("No se pudieron generar ideas ahora")
          }}
          style={{ padding: "9px 16px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "#a5b4fc", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          ✦ Generar ideas ahora
        </button>
```

(Envolver ambos botones del header en un `<div style={{ display: "flex", gap: 10 }}>`.)

- [ ] **Step 3: Verificar**

Run: `npm run dev`. Tocar "✦ Generar ideas ahora" → tras unos segundos aparecen ~5 tarjetas nuevas en "Idea" (via `router.refresh()`), con ángulos distintos de los previos.
Run: `npm run lint` && `npm run build` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin-vakdor/marketing/generar/route.ts components/admin-vakdor/marketing-client.tsx
git commit -m "feat(marketing): generar ideas provisional con Claude (anti-repeticion)"
```

---

### Task 9: Ver/Descargar asset (URL firmada)

**Files:**
- Create: `app/api/admin-vakdor/marketing/[id]/asset/route.ts`
- Modify: `components/admin-vakdor/marketing-client.tsx`

**Interfaces:**
- Consumes: `firmarAsset()` (Task 2), `getAdminDb()`, `requireAdminVakdor`.
- Produces: `GET /api/admin-vakdor/marketing/:id/asset?path=<path>` → `{ url: string }` (redirige o devuelve la URL firmada).

- [ ] **Step 1: Route handler**

Create `app/api/admin-vakdor/marketing/[id]/asset/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { firmarAsset } from "@/lib/admin-vakdor/marketing/store"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const path = new URL(request.url).searchParams.get("path")
  if (!path) return NextResponse.json({ error: "falta path" }, { status: 400 })

  // Verificar que el asset pertenece a esta idea (el path arranca con ideas/<id>/).
  if (!path.startsWith(`ideas/${params.id}/`)) {
    return NextResponse.json({ error: "path no pertenece a la idea" }, { status: 403 })
  }
  // Confirmar que la idea existe.
  const db = getAdminDb()
  const { data, error } = await db.from("marketing_ideas").select("id").eq("id", params.id).single()
  if (error || !data) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  const url = await firmarAsset(path)
  if (!url) return NextResponse.json({ error: "no se pudo firmar" }, { status: 500 })
  return NextResponse.json({ url })
}
```

- [ ] **Step 2: Botón Ver/Descargar en la tarjeta**

Modify `components/admin-vakdor/marketing-client.tsx` — dentro de `Card`, tras los chips, si hay assets:

```tsx
      {idea.assets && idea.assets.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {idea.assets.map((a, idx) => (
            <button key={idx}
              onClick={async () => {
                const res = await fetch(`/api/admin-vakdor/marketing/${idea.id}/asset?path=${encodeURIComponent(a.path)}`)
                if (res.ok) { const { url } = await res.json(); window.open(url, "_blank") }
              }}
              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", cursor: "pointer" }}>
              ⬇ {a.tipo.toUpperCase()}{idea.assets.length > 1 ? ` ${idx + 1}` : ""}
            </button>
          ))}
        </div>
      ) : null}
```

- [ ] **Step 3: Verificar con un asset de prueba**

Subir manualmente un PDF de prueba al bucket con la ruta `ideas/<id-de-una-idea>/prueba.pdf` (vía Supabase Storage MCP/dashboard), y agregar a esa idea el asset en la columna `assets` (`[{"tipo":"pdf","path":"ideas/<id>/prueba.pdf"}]`) con un UPDATE puntual. Recargar la página → aparece el botón "⬇ PDF"; al tocarlo se abre el PDF (URL firmada).
Run: `npm run lint` && `npm run build` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin-vakdor/marketing/[id]/asset/route.ts components/admin-vakdor/marketing-client.tsx
git commit -m "feat(marketing): ver/descargar assets por URL firmada"
```

---

## Cierre de Fase 1

Con las 9 tareas: página + tablero (6 columnas) + mover (drag/botones) + alta manual + reformular (Claude) + generar provisional (Claude, anti-repetición) + ver/descargar assets. Todo probado en local. **Merge a `main` solo con OK de Leo.**

Roadmap Fases 2–4: ver `docs/superpowers/specs/2026-07-15-marketing-pipeline-design.md` (secciones 3 y 7).

## Self-review notes (cobertura del spec)

- Modelo de datos (spec 4.1) → Task 1 + Task 2. ✔
- RLS sin políticas (4.2) → Task 1 (`enable row level security` sin policies). ✔
- Storage bucket privado + URL firmada (4.3) → Task 1 (bucket) + Task 2 (`firmarAsset`) + Task 9. ✔
- UI página + tablero 6 columnas + mover (4.4) → Tasks 3 y 4. ✔
- Alta manual (4.4) → Task 5. ✔
- Reformular Claude API en "En revisión" (4.5) → Task 7. ✔
- Generar provisional anti-repetición (4.6) → Task 8. ✔
- Paquete de marca destilado (4.7) → Task 6. ✔
- Archivos y env (4.8) → cubiertos; `ANTHROPIC_API_KEY` verificada en Task 6 Step 5. ✔
- Nota de convención vs spec: las mutaciones se hacen con **Route Handlers** (patrón `requireAdminVakdor`), no con server actions — el spec mencionaba `app/actions/marketing.ts`, pero el patrón consolidado de admin-vakdor son route handlers. Decisión registrada aquí.
```
