# Etapa B — Los documentos de cada asesor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los documentos de cada asesor vivan adentro de PRISMA — el director los sube y los baja desde la tarjeta del asesor, y el asesor ve los suyos y nada más.

**Architecture:** Dos secciones separadas porque son necesidades distintas: *plantillas personalizadas* (solo `.docx`, una por tipo de documento) y *documentos de información* (`.docx` o `.pdf`, archivos sueltos). Las reglas de qué archivo entra y dónde se guarda viven en un módulo puro con tests; la subida sigue el patrón que ya usa Documentos Oficiales (archivo a Storage, después la fila, y si la fila falla se borra el archivo). El permiso se resuelve con RLS en la base, no escondiendo botones.

**Tech Stack:** Next.js App Router, Supabase (Storage + RLS + Management API para el DDL), vitest, shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-08-24-asesores-celular-y-documentos-design.md` — secciones 6, 8.4 a 8.7, y 9.1.

## Global Constraints

- **Rama y worktree:** `PRISMA-SYSTEM-asesores-docs`, rama `feat/asesores-documentos`, salida de `main` @ 47e6230 (que ya trae la Etapa A). Nunca `git add -A`.
- **El DDL contra producción necesita el OK explícito de Leonardo** antes de ejecutarse. Las migraciones del repo NO se aplican solas.
- **Nunca correr `npm run build` con el servidor de desarrollo levantado.** Los dos escriben en `.next` y el de producción le pisa los archivos al otro, dejándolo roto. Si hay que compilar, primero se baja el servidor.
- **El asesor no escribe nada.** Ve sus documentos y los descarga. No sube, no borra, no renombra. Y ve **solo los suyos**: se garantiza con RLS, no con la interfaz.
- **La URL de descarga se arma en un solo lugar** (`lib/asesor-docs/url.ts`). El bucket es público por decisión de Leonardo (spec §9.1); pasarlo a privado tiene que ser cambiar una función, no rediseñar.
- **`.doc` (Word 97) se rechaza en la sección de plantillas** con un mensaje que explica por qué y cómo convertirlo. En la sección de información entra sin problema.
- **Si falla el insert después de subir el archivo, se borra el archivo.** No pueden quedar archivos huérfanos en Storage.
- **Se prueba con PRISMAIA - VAKDOR.** Central no se toca. Nunca con la cuenta de un asesor real: cuenta descartable o la de director.
- **Tests:** vitest, y solo corre lo que está en `lib/**/*.test.ts`. Comando: `npm test`.

## Lo que esta etapa NO hace

- **No detecta plantillas ni versiona nada.** Eso es la Etapa C. Acá los documentos se suben a mano, uno por uno.
- **No genera documentos.** Lo que se descarga es exactamente lo que se subió.
- No toca `components/documentos/OfficialDocsSection.tsx` — sirve de referencia, no se modifica.

---

## Decisiones de diseño dentro del spec

Tres cosas que el spec no fija y que resuelve este plan:

**1. La tabla de tipos nace mínima.** `advisor_doc_templates` se crea con lo justo (nombre, estado, agencia). La Etapa C le va a sumar `version_actual` y la tabla de versiones. `advisor_documents` lleva `template_id` obligatorio desde ya, y `version_id`, `form_data`, `estado` y `observacion` quedan nulables para que C los llene sin tener que rehacer la tabla.

**2. El tipo de documento se crea al subir.** No hay pantalla de gestión de tipos en esta etapa: al subir un `.docx` en la sección de plantillas, el director elige un tipo existente de su inmobiliaria o escribe uno nuevo ahí mismo. La pantalla de "Plantillas" que pide el spec §7 es de la Etapa C.

**3. El panel del asesor pasa a tener solapas.** Hoy es una sola columna con scroll: datos de contacto, rendimiento y cartera. Se parte en **Resumen** y **Documentos**. Además de ser lo que pide el spec, evita que el panel siga creciendo — que es exactamente lo que causó el corte de contenido que hubo que arreglar en `main` (commit `11b4238`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260826120000_documentos_por_asesor.sql` | **Crear.** Las tres tablas, sus índices y sus políticas |
| `lib/asesor-docs/reglas.ts` | **Crear.** Qué archivo entra en cada sección, cómo se arma la ruta, cómo se muestra el nombre |
| `lib/asesor-docs/reglas.test.ts` | **Crear.** Los tests de lo anterior |
| `lib/asesor-docs/url.ts` | **Crear.** La URL de descarga, en un solo lugar |
| `components/asesor-docs/DocumentosDelAsesor.tsx` | **Crear.** Las dos secciones. `readOnly` para la vista del asesor |
| `app/director/asesores/page.tsx` | **Modificar.** El panel pasa a tener solapas y suma Documentos |
| `app/asesor/documentos/page.tsx` | **Modificar.** Tercera solapa, "Mis documentos", en solo lectura |

---

## Task 1: Las reglas de los archivos, puras y con tests

Todo lo que sea "este archivo entra / este no" y "dónde se guarda" vive acá, y lo consumen la pantalla del director y la del asesor. Es lo único de la etapa que se puede testear automáticamente.

**Files:**
- Create: `lib/asesor-docs/reglas.ts`
- Test: `lib/asesor-docs/reglas.test.ts`

**Interfaces:**
- Produces:
  - `type Seccion = "plantilla" | "info"`
  - `type ArchivoRechazado = { ok: false; error: string }`
  - `type ArchivoAceptado = { ok: true; extension: string }`
  - `validarArchivo(nombre: string, tamanoBytes: number, seccion: Seccion): ArchivoAceptado | ArchivoRechazado`
  - `rutaDeArchivo(agencyId: string, advisorId: string, seccion: Seccion, id: string, extension: string): string`
  - `nombreVisible(nombreArchivo: string): string`
  - `MAX_BYTES: number`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/asesor-docs/reglas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validarArchivo,
  rutaDeArchivo,
  nombreVisible,
  MAX_BYTES,
} from "./reglas";

const UN_MB = 1024 * 1024;

describe("validarArchivo — sección plantillas (solo .docx)", () => {
  it("acepta un .docx", () => {
    expect(validarArchivo("Contrato.docx", UN_MB, "plantilla")).toEqual({ ok: true, extension: "docx" });
  });

  it("acepta sin importar mayúsculas en la extensión", () => {
    expect(validarArchivo("Contrato.DOCX", UN_MB, "plantilla")).toEqual({ ok: true, extension: "docx" });
  });

  it("rechaza un .doc viejo, y explica por qué", () => {
    const r = validarArchivo("Contrato.doc", UN_MB, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // El mensaje tiene que decirle qué hacer, no solo que no se puede.
      expect(r.error).toContain(".doc");
      expect(r.error.toLowerCase()).toContain("guardar como");
    }
  });

  it("rechaza un PDF en la sección de plantillas", () => {
    const r = validarArchivo("Contrato.pdf", UN_MB, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("word");
  });

  it("rechaza un archivo sin extensión", () => {
    expect(validarArchivo("Contrato", UN_MB, "plantilla").ok).toBe(false);
  });
});

describe("validarArchivo — sección información (.docx o .pdf)", () => {
  it("acepta un .docx", () => {
    expect(validarArchivo("Manual.docx", UN_MB, "info")).toEqual({ ok: true, extension: "docx" });
  });

  it("acepta un .pdf", () => {
    expect(validarArchivo("Manual.pdf", UN_MB, "info")).toEqual({ ok: true, extension: "pdf" });
  });

  it("acepta un .doc viejo, porque acá no se rellena nada", () => {
    expect(validarArchivo("Manual.doc", UN_MB, "info")).toEqual({ ok: true, extension: "doc" });
  });

  it("rechaza una imagen", () => {
    const r = validarArchivo("foto.jpg", UN_MB, "info");
    expect(r.ok).toBe(false);
  });
});

describe("validarArchivo — tamaño", () => {
  it("rechaza un archivo que pasa el tope, en las dos secciones", () => {
    const grande = MAX_BYTES + 1;
    for (const seccion of ["plantilla", "info"] as const) {
      const r = validarArchivo("Contrato.docx", grande, seccion);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.toLowerCase()).toContain("pesa");
    }
  });

  it("acepta un archivo justo en el tope", () => {
    expect(validarArchivo("Contrato.docx", MAX_BYTES, "plantilla").ok).toBe(true);
  });

  it("rechaza un archivo vacío", () => {
    const r = validarArchivo("Contrato.docx", 0, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("vacío");
  });
});

describe("rutaDeArchivo", () => {
  it("separa por agencia, asesor y sección", () => {
    expect(rutaDeArchivo("AG", "AS", "plantilla", "ID1", "docx")).toBe("asesores/AG/AS/plantillas/ID1.docx");
    expect(rutaDeArchivo("AG", "AS", "info", "ID2", "pdf")).toBe("asesores/AG/AS/info/ID2.pdf");
  });

  it("no usa el nombre del archivo original en la ruta", () => {
    // El nombre lo pone el usuario: puede traer acentos, espacios, barras o
    // repetirse. La ruta se arma con el id, que es único y siempre seguro.
    const ruta = rutaDeArchivo("AG", "AS", "info", "ID3", "pdf");
    expect(ruta).not.toContain(" ");
    expect(ruta.split("/").length).toBe(5);
  });
});

describe("nombreVisible", () => {
  it("saca la extensión", () => {
    expect(nombreVisible("Contrato de Asesor.docx")).toBe("Contrato de Asesor");
  });

  it("deja el nombre tal cual si no tiene extensión", () => {
    expect(nombreVisible("Contrato")).toBe("Contrato");
  });

  it("solo saca la última extensión", () => {
    expect(nombreVisible("acuerdo.v2.docx")).toBe("acuerdo.v2");
  });

  it("recorta espacios", () => {
    expect(nombreVisible("  Manual.pdf  ")).toBe("Manual");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx vitest run lib/asesor-docs/reglas.test.ts
```

Esperado: FALLA con `Failed to resolve import "./reglas"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/asesor-docs/reglas.ts`:

```ts
/**
 * Las reglas de los documentos de un asesor, en funciones puras.
 *
 * Viven acá y no adentro de la pantalla porque las usan los dos lados —el panel
 * del director y la vista del asesor— y porque son exactamente el tipo de regla
 * que se escribe distinto en cada lugar si se deja suelta.
 */

export type Seccion = "plantilla" | "info"

export type ArchivoAceptado = { ok: true; extension: string }
export type ArchivoRechazado = { ok: false; error: string }

/** 25 MB, el mismo tope que ya usa el módulo de contratos. */
export const MAX_BYTES = 25 * 1024 * 1024

/**
 * Qué entra en cada sección.
 *
 * En "plantilla" solo `.docx`: son los documentos que la Etapa C va a rellenar
 * solos, y para eso hay que poder abrir el archivo por dentro. El `.doc` viejo
 * es un formato binario cerrado y no sirve.
 *
 * En "info" entra `.doc` también, porque ahí no se rellena nada: se sube y se baja.
 */
const EXTENSIONES: Record<Seccion, string[]> = {
  plantilla: ["docx"],
  info: ["docx", "doc", "pdf"],
}

function extensionDe(nombre: string): string | null {
  const limpio = nombre.trim()
  const i = limpio.lastIndexOf(".")
  if (i <= 0 || i === limpio.length - 1) return null
  return limpio.slice(i + 1).toLowerCase()
}

function formatearMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0)
}

export function validarArchivo(
  nombre: string,
  tamanoBytes: number,
  seccion: Seccion
): ArchivoAceptado | ArchivoRechazado {
  if (tamanoBytes <= 0) {
    return { ok: false, error: "El archivo está vacío" }
  }
  if (tamanoBytes > MAX_BYTES) {
    return {
      ok: false,
      error: `El archivo pesa más de ${formatearMB(MAX_BYTES)} MB, que es el máximo`,
    }
  }

  const ext = extensionDe(nombre)
  if (!ext) {
    return { ok: false, error: "El archivo no tiene extensión, así que no se puede saber qué es" }
  }

  if (EXTENSIONES[seccion].includes(ext)) {
    return { ok: true, extension: ext }
  }

  // El .doc en plantillas es el caso frecuente y merece decir qué hacer.
  if (seccion === "plantilla" && ext === "doc") {
    return {
      ok: false,
      error:
        "Los archivos .doc son de una versión vieja de Word y no se pueden completar solos. " +
        "Abrilo en Word y usá Guardar como → Documento de Word (.docx).",
    }
  }

  if (seccion === "plantilla") {
    return { ok: false, error: "En esta sección solo entran documentos de Word (.docx)" }
  }
  return { ok: false, error: "Acá solo entran documentos de Word (.docx, .doc) o PDF" }
}

/**
 * Dónde vive el archivo dentro del bucket.
 *
 * La ruta se arma con el id de la fila, NUNCA con el nombre que puso el usuario:
 * ese nombre puede traer acentos, espacios, barras, o repetirse entre asesores.
 * El nombre lindo se guarda aparte, en la base, para mostrarlo y para la descarga.
 */
export function rutaDeArchivo(
  agencyId: string,
  advisorId: string,
  seccion: Seccion,
  id: string,
  extension: string
): string {
  const carpeta = seccion === "plantilla" ? "plantillas" : "info"
  return `asesores/${agencyId}/${advisorId}/${carpeta}/${id}.${extension}`
}

/** El nombre del archivo sin la extensión, para mostrar en pantalla. */
export function nombreVisible(nombreArchivo: string): string {
  const limpio = nombreArchivo.trim()
  const i = limpio.lastIndexOf(".")
  return i > 0 ? limpio.slice(0, i) : limpio
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx vitest run lib/asesor-docs/reglas.test.ts
```

Esperado: PASA, 18 tests en verde.

- [ ] **Step 5: Correr la suite completa**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm test
```

Esperado: todo verde. La suite base son 323 tests vitest en 30 archivos más 88 de node; con los nuevos, más.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add lib/asesor-docs/reglas.ts lib/asesor-docs/reglas.test.ts
git commit -m "feat(asesor-docs): qué archivo entra y dónde se guarda, en un solo lugar

El .doc se rechaza en plantillas porque la Etapa C va a tener que abrir esos
archivos por dentro para rellenarlos, y el formato viejo de Word no lo permite.
En la sección de información entra igual: ahí no se rellena nada.

La ruta se arma con el id de la fila y no con el nombre que puso el usuario:
ese nombre puede traer acentos, espacios o repetirse entre asesores.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: La migración — tres tablas y sus permisos

**Files:**
- Create: `supabase/migrations/20260826120000_documentos_por_asesor.sql`

**Interfaces:**
- Produces: las tablas `advisor_doc_templates`, `advisor_documents` y `advisor_info_documents`, con RLS.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260826120000_documentos_por_asesor.sql`:

```sql
-- ─────────────────────────────────────────────────────────────
-- Los documentos de cada asesor viven adentro de PRISMA.
--
-- Dos cosas distintas, dos tablas:
--  · advisor_documents      → las plantillas personalizadas (.docx), una por tipo.
--  · advisor_info_documents → archivos sueltos de información (.docx/.doc/.pdf).
--
-- advisor_doc_templates es el "tipo de documento" (ej: "Contrato de Asesor").
-- Nace mínima a propósito: la Etapa C le va a sumar el versionado encima
-- (version_actual + una tabla de versiones) sin tener que rehacerla.
--
-- Todo aditivo: no toca ninguna tabla ni política existente.
-- ─────────────────────────────────────────────────────────────

-- 1) El tipo de documento
CREATE TABLE IF NOT EXISTS public.advisor_doc_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    nombre      text NOT NULL,
    -- 'borrador' hasta que la Etapa C detecte su plantilla y la active.
    estado      text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa')),
    created_by  uuid REFERENCES public.profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Dos tipos con el mismo nombre en la misma inmobiliaria no tienen sentido y
-- harían imposible saber cuál es cuál en el desplegable.
CREATE UNIQUE INDEX IF NOT EXISTS advisor_doc_templates_agency_nombre_idx
    ON public.advisor_doc_templates (agency_id, lower(nombre));

-- 2) El documento de cada asesor (sección "plantillas personalizadas")
CREATE TABLE IF NOT EXISTS public.advisor_documents (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id              uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    advisor_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    template_id            uuid NOT NULL REFERENCES public.advisor_doc_templates(id) ON DELETE CASCADE,
    nombre_archivo         text NOT NULL,          -- como lo subió el director, para mostrar y descargar
    archivo_original_path  text NOT NULL,          -- ruta dentro del bucket
    size_bytes             bigint,
    -- Los cuatro de abajo son de la Etapa C. Nulables a propósito: en la B el
    -- documento se sube a mano y todavía no hay plantilla ni datos extraídos.
    version_id             uuid,
    form_data              jsonb,
    estado                 text CHECK (estado IS NULL OR estado IN ('ok', 'revisar', 'pendiente')),
    observacion            text,
    created_by             uuid REFERENCES public.profiles(id),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Un asesor tiene UN documento por tipo. Si se sube otro, reemplaza al anterior.
CREATE UNIQUE INDEX IF NOT EXISTS advisor_documents_advisor_template_idx
    ON public.advisor_documents (advisor_id, template_id);

CREATE INDEX IF NOT EXISTS advisor_documents_agency_idx  ON public.advisor_documents (agency_id);
CREATE INDEX IF NOT EXISTS advisor_documents_advisor_idx ON public.advisor_documents (advisor_id);

-- 3) Los archivos sueltos (sección "documentos de información")
CREATE TABLE IF NOT EXISTS public.advisor_info_documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    advisor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nombre      text NOT NULL,
    file_path   text NOT NULL,
    mime        text,
    size_bytes  bigint,
    created_by  uuid REFERENCES public.profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisor_info_documents_advisor_idx
    ON public.advisor_info_documents (advisor_id);
CREATE INDEX IF NOT EXISTS advisor_info_documents_agency_idx
    ON public.advisor_info_documents (agency_id);

-- ─────────────────────────────────────────────────────────────
-- Permisos.
--
-- El director hace todo dentro de SU inmobiliaria. El asesor solo LEE lo suyo:
-- ninguna escritura, y ni siquiera puede ver la lista de tipos de documento.
-- Se resuelve acá y no escondiendo botones, porque un botón escondido sigue
-- siendo una fila que se puede pedir por la API.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.advisor_doc_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_info_documents ENABLE ROW LEVEL SECURITY;

-- Tipos de documento: solo el director de la agencia.
DROP POLICY IF EXISTS "Directores gestionan tipos de documento" ON public.advisor_doc_templates;
CREATE POLICY "Directores gestionan tipos de documento"
  ON public.advisor_doc_templates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_doc_templates.agency_id
  ));

-- Plantillas personalizadas: el director gestiona las de su agencia.
DROP POLICY IF EXISTS "Directores gestionan documentos de sus asesores" ON public.advisor_documents;
CREATE POLICY "Directores gestionan documentos de sus asesores"
  ON public.advisor_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_documents.agency_id
  ));

-- ...y el asesor LEE los suyos. Solo SELECT, y solo donde advisor_id sea él.
DROP POLICY IF EXISTS "El asesor ve sus propios documentos" ON public.advisor_documents;
CREATE POLICY "El asesor ve sus propios documentos"
  ON public.advisor_documents FOR SELECT
  USING (advisor_id = auth.uid());

-- Documentos de información: mismo criterio.
DROP POLICY IF EXISTS "Directores gestionan la info de sus asesores" ON public.advisor_info_documents;
CREATE POLICY "Directores gestionan la info de sus asesores"
  ON public.advisor_info_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_info_documents.agency_id
  ));

DROP POLICY IF EXISTS "El asesor ve su propia info" ON public.advisor_info_documents;
CREATE POLICY "El asesor ve su propia info"
  ON public.advisor_info_documents FOR SELECT
  USING (advisor_id = auth.uid());
```

- [ ] **Step 2: PARAR y pedirle el OK a Leonardo**

Este paso escribe en producción. **No se ejecuta sin su OK explícito.** Mostrarle:

- **Qué cambia:** tres tablas nuevas, vacías, con sus índices y sus permisos.
- **Qué NO cambia:** ninguna tabla existente, ninguna fila, ninguna política de las que ya están.
- **Si sale mal:** `DROP TABLE public.advisor_info_documents, public.advisor_documents, public.advisor_doc_templates;` — no hay nada que dependa de ellas.

- [ ] **Step 3: Aplicar con la Management API**

Solo después del OK:

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^[\"']|[\"']\$/g,'')]}));
const sql=fs.readFileSync('supabase/migrations/20260826120000_documentos_por_asesor.sql','utf8');
fetch('https://api.supabase.com/v1/projects/'+env.SUPABASE_PROJECT_REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_API_KEY_MANAGEMENT,'Content-Type':'application/json'},body:JSON.stringify({query:sql})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d)));
"
```

Esperado: `[]`.

- [ ] **Step 4: Verificar contra producción**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^[\"']|[\"']\$/g,'')]}));
const q=(sql)=>fetch('https://api.supabase.com/v1/projects/'+env.SUPABASE_PROJECT_REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_API_KEY_MANAGEMENT,'Content-Type':'application/json'},body:JSON.stringify({query:sql})}).then(r=>r.json());
(async()=>{
  console.log('TABLAS:', JSON.stringify(await q(\"select table_name from information_schema.tables where table_schema='public' and table_name like 'advisor_%' order by 1\")));
  console.log('RLS   :', JSON.stringify(await q(\"select relname, relrowsecurity from pg_class where relname like 'advisor_%' and relkind='r'\")));
  console.log('POLIT :', JSON.stringify(await q(\"select tablename, policyname, cmd from pg_policies where tablename like 'advisor_%' order by 1,2\")));
})();
"
```

Esperado: las **tres** tablas, `relrowsecurity` en `true` en las tres, y **seis** políticas.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add supabase/migrations/20260826120000_documentos_por_asesor.sql
git commit -m "feat(db): las tres tablas de los documentos por asesor

Los campos de la Etapa C (version_id, form_data, estado, observacion) nacen
nulables a propósito: en esta etapa el documento se sube a mano y todavía no
hay plantilla ni datos extraídos. Así la C los llena sin rehacer la tabla.

El asesor solo tiene política de SELECT sobre sus propias filas. No puede
escribir ni ver la lista de tipos de documento, y eso se resuelve en la base:
un botón escondido sigue siendo una fila que se puede pedir por la API.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: La URL de descarga, en un solo lugar

**Files:**
- Create: `lib/asesor-docs/url.ts`

**Interfaces:**
- Produces: `urlDeDescarga(supabase: SupabaseClient, path: string): Promise<string | null>`

Es una función chiquita a propósito. El spec §9.1 la exige: el bucket es público por decisión de Leonardo, y pasarlo a privado tiene que ser cambiar **esta función** y nada más.

- [ ] **Step 1: Escribirla**

Crear `lib/asesor-docs/url.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = "documents"

/**
 * La URL para bajarse un documento de un asesor.
 *
 * ÚNICO lugar del sistema donde se arma. El bucket `documents` está en público
 * por decisión de Leonardo (spec §9.1), con el riesgo planteado y aceptado: el
 * link de Supabase no vence nunca, así que un asesor desvinculado sigue abriendo
 * su documento desde afuera si se guardó la dirección.
 *
 * Cuando se decida cerrarlo, el cambio es reemplazar getPublicUrl por
 * createSignedUrl ACÁ ADENTRO, y nada más. Por eso la función es async aunque
 * hoy no lo necesite: para que ese cambio no obligue a tocar a quien la llama.
 */
export async function urlDeDescarga(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  if (!path) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl ?? null
}
```

- [ ] **Step 2: Compilar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit
```

Esperado: cero errores.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add lib/asesor-docs/url.ts
git commit -m "feat(asesor-docs): la URL de descarga, en un solo lugar

Es async aunque hoy no lo necesite. El día que el bucket pase a privado, el
cambio tiene que ser reemplazar getPublicUrl por createSignedUrl acá adentro
y nada más — sin tocar a ninguno de los que la llaman.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: El componente de las dos secciones

El grueso de la etapa. Un solo componente que sirve para los dos lados: el director gestiona, el asesor mira.

**Files:**
- Create: `components/asesor-docs/DocumentosDelAsesor.tsx`

**Interfaces:**
- Consumes: `validarArchivo`, `rutaDeArchivo`, `nombreVisible`, `MAX_BYTES` de `lib/asesor-docs/reglas`; `urlDeDescarga` de `lib/asesor-docs/url`.
- Produces: `<DocumentosDelAsesor advisorId={string} agencyId={string} readOnly?: boolean />`

**Cómo se comporta:**

- Dos bloques con título: **"Plantillas personalizadas"** y **"Documentos de información"**.
- **Con `readOnly`** (el asesor): solo la lista y el botón de descargar. Ni subir, ni borrar, ni reemplazar.
- **Sin `readOnly`** (el director):
  - En plantillas: botón "Subir documento", que abre un diálogo con el selector de archivo y el **tipo de documento** — un desplegable con los tipos que ya existen en la inmobiliaria más la opción de escribir uno nuevo.
  - Si ese asesor **ya tiene** un documento de ese tipo, se avisa que lo va a reemplazar y se pide confirmación. Al confirmar, se borra el archivo viejo de Storage después de que el nuevo esté arriba.
  - En información: botón "Subir archivos", acepta varios de una.
  - Cada fila tiene descargar y borrar. Borrar pide confirmación y saca la fila **y** el archivo.
- **Estado vacío** en cada sección, con un texto que explique para qué sirve.
- Los errores de validación salen del módulo de reglas y se muestran tal cual: ya están escritos para que los entienda una persona.

- [ ] **Step 1: Escribir el componente**

Crear `components/asesor-docs/DocumentosDelAsesor.tsx`. Seguí el patrón de subida que ya usa `components/documentos/OfficialDocsSection.tsx` (líneas 244-300): primero el archivo a Storage, después la fila; **si la fila falla, se borra el archivo**. Usá el cliente de navegador (`@/lib/supabase`), que aplica las políticas de la Task 2.

```tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Upload, Download, Trash2, Loader2, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { validarArchivo, rutaDeArchivo, nombreVisible, type Seccion } from "@/lib/asesor-docs/reglas";
import { urlDeDescarga } from "@/lib/asesor-docs/url";

interface Props {
  advisorId: string;
  agencyId: string;
  /** true = vista del asesor: solo mirar y descargar. */
  readOnly?: boolean;
}

// El nombre del tipo viene en el mismo pedido: la lista tiene que mostrar
// "Contrato de Asesor", no un id. El asesor NO tiene política para leer
// advisor_doc_templates, pero un join anidado desde una fila que sí puede leer
// sí le llega — hay que confirmarlo al probar (paso 3 de la Task 6).
type Plantilla = {
  id: string;
  nombre_archivo: string;
  archivo_original_path: string;
  template_id: string;
  created_at: string;
  advisor_doc_templates: { nombre: string } | null;
};
type Tipo = { id: string; nombre: string };
type Info = { id: string; nombre: string; file_path: string; created_at: string };

export function DocumentosDelAsesor({ advisorId, agencyId, readOnly = false }: Props) {
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [infos, setInfos] = useState<Info[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [p, i] = await Promise.all([
        supabase.from("advisor_documents").select("id, nombre_archivo, archivo_original_path, template_id, created_at, advisor_doc_templates(nombre)").eq("advisor_id", advisorId).order("created_at", { ascending: false }),
        supabase.from("advisor_info_documents").select("id, nombre, file_path, created_at").eq("advisor_id", advisorId).order("created_at", { ascending: false }),
      ]);
      setPlantillas(p.data ?? []);
      setInfos(i.data ?? []);
      // La lista de tipos es solo del director: el asesor no tiene política para leerla.
      if (!readOnly) {
        const { data: t } = await supabase.from("advisor_doc_templates").select("id, nombre").eq("agency_id", agencyId).order("nombre");
        setTipos(t ?? []);
      }
    } finally {
      setCargando(false);
    }
  }, [supabase, advisorId, agencyId, readOnly]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargar = async (path: string, nombre: string) => {
    const url = await urlDeDescarga(supabase, path);
    if (!url) { toast.error("No se pudo armar el link de descarga"); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.rel = "noopener";
    a.click();
  };

  // ... resto: los dos bloques, el diálogo de subida y el de borrar.
}

export default DocumentosDelAsesor;
```

**El resto del componente lo escribe el implementador**, siguiendo lo descrito arriba en "Cómo se comporta" y el patrón de `OfficialDocsSection.tsx`.

*Por qué el código no está entero acá:* son ~400 líneas de interfaz que ya existen resueltas en `OfficialDocsSection.tsx` (subida con rollback, diálogos, estados vacíos, listas). Copiarlas especulativamente al plan las haría divergir del componente real, que es la referencia viva. Lo que sí está fijado son las siete condiciones de abajo, que son las que la revisión va a verificar una por una.

Requisitos que no se negocian:

1. **`readOnly` esconde toda escritura.** Ningún botón de subir, borrar ni reemplazar.
2. **La validación pasa por `validarArchivo`** antes de tocar Storage, y su mensaje se muestra tal cual.
3. **Rollback:** si el insert falla, se borra el archivo recién subido.
4. **Reemplazo:** subir una plantilla de un tipo que el asesor ya tiene pide confirmación y borra el archivo viejo **después** de que el nuevo esté arriba.
5. **La ruta sale de `rutaDeArchivo`**, nunca armada a mano.
6. Botones deshabilitados mientras se sube, para que no se dispare dos veces.
7. Estado vacío en las dos secciones.

- [ ] **Step 2: Compilar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit
```

Esperado: cero errores. (El componente todavía no se usa en ninguna pantalla; eso es la Task 5.)

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add components/asesor-docs/DocumentosDelAsesor.tsx
git commit -m "feat(asesor-docs): las dos secciones de documentos del asesor

Un solo componente para los dos lados: el director gestiona, el asesor mira.
La diferencia es una prop, pero el permiso de verdad está en la base.

Si el insert falla se borra el archivo recién subido: no pueden quedar archivos
huérfanos en Storage que nadie sepa de quién son.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: El panel del asesor pasa a tener solapas

**Files:**
- Modify: `app/director/asesores/page.tsx` (el cuerpo del `SheetContent`, a partir de la línea ~837)

**Interfaces:**
- Consumes: `<DocumentosDelAsesor>` (Task 4).

- [ ] **Step 1: Partir el cuerpo en dos solapas**

El cuerpo del panel es hoy un `<div className="space-y-6 mt-8 flex-1 min-h-0 overflow-y-auto pr-2">` con todo adentro. Pasa a ser un `<Tabs>` con dos solapas:

- **"Resumen"** — todo lo que hay hoy: datos de contacto, rendimiento, cartera y stock.
- **"Documentos"** — `<DocumentosDelAsesor advisorId={selectedAgent.id} agencyId={agencyId} />`

Importar `Tabs, TabsContent, TabsList, TabsTrigger` de `@/components/ui/tabs` (la página **todavía no los importa**) y el componente nuevo.

**Cuidado con el alto:** el panel ya tuvo un problema de contenido cortado, arreglado en `main` (commit `11b4238`). El contenedor es `flex flex-col` y el cuerpo `flex-1 min-h-0 overflow-y-auto`. Al meter las solapas, **el `TabsContent` es el que tiene que scrollear**, no el `Tabs` entero: si no, la barra de solapas se va con el scroll y el contenido vuelve a desbordar. Mirá cómo lo resuelve `app/asesor/documentos/page.tsx:273-283`, que ya tiene ese patrón andando.

- [ ] **Step 2: Compilar**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx tsc --noEmit
```

- [ ] **Step 3: Probar en el navegador, y MEDIR el alto**

Levantar el servidor (`npm run dev -- -p 3010`) y entrar como director de PRISMAIA - VAKDOR a `/director/asesores`. Abrir la tarjeta de un asesor:

1. Se ven las dos solapas y "Resumen" tiene lo de siempre.
2. En "Documentos" aparecen las dos secciones, vacías.
3. Subir un `.docx` en plantillas, eligiendo un tipo nuevo. Aparece en la lista.
4. Descargarlo: baja con el nombre correcto y abre bien en Word.
5. Subir otro `.docx` del mismo tipo: avisa que reemplaza, y al confirmar queda uno solo.
6. Subir un `.doc` en plantillas: lo rechaza y explica cómo convertirlo.
7. Subir un `.pdf` en información: entra.
8. Borrar uno: pide confirmación y desaparece.
9. **Confirmar que la barra de solapas queda fija** y que el contenido de abajo no se corta, en escritorio y en celular emulado.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add app/director/asesores/page.tsx
git commit -m "feat(asesores): el panel del asesor suma la solapa Documentos

Se parte en Resumen y Documentos. Además de ser lo que pide el diseño, evita
que el panel siga creciendo hacia abajo — que es justo lo que causó el corte
de contenido que hubo que arreglar en 11b4238.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: "Mis documentos" para el asesor

**Files:**
- Modify: `app/asesor/documentos/page.tsx` (la solapa de nivel superior, línea 57 y 273-283)

- [ ] **Step 1: Sumar la tercera solapa**

El estado de la línea 57 es `useState<"biblioteca" | "oficiales">("biblioteca")`. Pasa a incluir `"mis-documentos"`. Sumar el `TabsTrigger` correspondiente y un `TabsContent` con:

```tsx
<DocumentosDelAsesor advisorId={userId} agencyId={agencyId} readOnly />
```

El `userId` sale de `supabase.auth.getUser()`, igual que la página ya obtiene el `agency_id`.

- [ ] **Step 2: Compilar y probar con la cuenta descartable**

Entrar con la **cuenta descartable de asesor** (nunca la de un asesor real) y confirmar:

1. Aparece la tercera solapa y muestra los documentos que le cargó el director.
2. **No hay ningún botón de subir, borrar ni reemplazar.**
3. La descarga funciona.
4. Se ve bien en celular.

- [ ] **Step 3: Verificar el permiso de verdad, no la interfaz**

Que la interfaz no muestre botones no alcanza. Desde la consola del navegador, **con la sesión del asesor abierta**, intentar leer los documentos de otro asesor y escribir uno propio:

```js
const { createClient } = await import('/lib/supabase')
// Estos dos tienen que devolver 0 filas y un error de permisos, respectivamente.
```

Más simple y más confiable: pedirle al asesor logueado, desde la propia página, una consulta a `advisor_documents` sin filtrar por `advisor_id`. Tiene que devolver **solo las filas suyas** — es la política la que filtra, no el `.eq()`. Y un `insert` tiene que fallar.

Anotar el resultado textual de las dos pruebas en el informe.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add app/asesor/documentos/page.tsx
git commit -m "feat(asesor): la solapa Mis documentos, en solo lectura

El asesor ve lo suyo y nada más. Verificado contra la base, no contra la
interfaz: una consulta sin filtrar devuelve solo sus filas, y el insert falla.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: La prueba completa y la documentación

**Files:**
- Modify: `docs/interno/bitacora-sesiones.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md`

- [ ] **Step 1: La suite completa**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm test && npx tsc --noEmit && npm run lint 2>&1 | tail -20
```

El lint tiene 43 errores preexistentes en archivos ajenos. **Verificar que ninguno esté en los archivos de esta rama**, comparando contra `git diff --name-only main..HEAD`.

- [ ] **Step 2: Compilar de verdad — con el servidor BAJADO**

**Primero bajar el servidor de desarrollo**, después compilar. Si se compila con el servidor arriba, el build de producción le pisa los archivos y lo deja roto.

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm run build 2>&1 | tail -20
```

Un fallo acá es bloqueante.

- [ ] **Step 3: El recorrido completo**

Los 9 puntos de la Task 5 y los 4 de la Task 6, en escritorio y en celular emulado.

- [ ] **Step 4: La bitácora**

Entrada nueva arriba de todo en `docs/interno/bitacora-sesiones.md`, siguiendo el formato de las anteriores.

- [ ] **Step 5: Las dos guías**

- **Director:** que ahora puede subirle documentos a cada asesor desde su tarjeta, las dos secciones y para qué sirve cada una, que en plantillas solo entra Word `.docx` y por qué, y que subir uno del mismo tipo reemplaza al anterior.
- **Asesor:** que tiene una solapa nueva con sus documentos, que los puede descargar, y que si falta alguno o hay que cambiarlo se lo pide a la dirección.

Las dos **sin tecnicismos**.

- [ ] **Step 6: Commit y entregarle el link a Leonardo**

**No se mergea a `main` sin su OK después de probarlo él.**
