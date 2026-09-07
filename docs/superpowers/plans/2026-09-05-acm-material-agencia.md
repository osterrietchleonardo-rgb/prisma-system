# Material de la agencia en el ACM — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada agencia cargue su material institucional desde una solapa **Configuración** en el módulo de ACM, y que ese material aparezca en cuatro lugares fijos de la ficha que recibe el propietario.

**Architecture:** El material vive como texto en `agencies.marketing_ai_config.acm_material`, junto a una lista de archivos guardados en un bucket privado. La IA nunca escribe directo: propone y el director acepta por sección. Al generar un ACM, las cuatro secciones se copian al snapshot congelado; la ficha las dibuja con la marca de la agencia, que sigue viniendo de Marketing IA.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres + Storage), Gemini (`@google/generative-ai`), `pdf-parse-fork`, `mammoth`, vitest, shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-09-05-acm-material-agencia-design.md`

## Global Constraints

- **Rama nueva desde `main`.** Nunca `git add -A`: se agregan archivos por nombre.
- **Si la agencia no cargó nada, la ficha del ACM sale EXACTAMENTE como sale hoy.** Es la regla que no se rompe.
- Las cuatro claves de sección son fijas y se llaman: `quienes_somos`, `como_comercializamos`, `como_preparar`, `roles_venta`.
- Topes de caracteres: `quienes_somos` 1200 · `como_comercializamos` 1800 · `como_preparar` 1500 · `roles_venta` 500.
- Tope de archivo: 50 MB (`50 * 1024 * 1024`). Arrancó en 25 copiado de Contratos y no alcanzaba: el carpetón de Central pesa 25,45 MB.
- Bucket privado `acm-material`, ruta `<agencyId>/<uuid>.<ext>`.
- Solo el rol `director` puede escribir configuración. La solapa se le esconde al asesor, y además **todos** los endpoints nuevos devuelven 403: la solapa oculta es comodidad, el 403 es la defensa.
- **Nunca reemplazar `marketing_ai_config` entero.** El material se guarda con merge en el servidor sobre la clave `acm_material`; pisarlo borraría los colores, el logo y el aviso legal de la agencia.
- La marca (colores, logo, aviso legal) se sigue editando **solo** en Marketing IA. En el ACM se muestra, no se toca.
- La IA deja una sección **vacía** antes que inventar contenido.
- La IA responde siempre en **español rioplatense**.
- `archivos` NUNCA viaja al snapshot de la ficha.
- Tests con `vitest`. Correr con `npx vitest run <ruta>`.
- Los textos de la interfaz van en español, sin tecnicismos (`estilo-guias-funcionales`).

---

### Task 1: Tipos, topes y normalización del material

Base de todo lo demás: qué es una sección, cuánto mide, y cómo se limpia lo que viene de la base.

**Files:**
- Create: `lib/acm/material.ts`
- Test: `lib/acm/material.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type ClaveSeccion = "quienes_somos" | "como_comercializamos" | "como_preparar" | "roles_venta"`
  - `interface AcmMaterialArchivo { id: string; nombre: string; path: string; subido_el: string }`
  - `type AcmSecciones = Record<ClaveSeccion, string>`
  - `interface AcmMaterial { archivos: AcmMaterialArchivo[]; secciones: AcmSecciones }`
  - `const SECCIONES: readonly SeccionMeta[]` con `{ clave, titulo, tope, ayuda, donde }`
  - `function normalizarMaterial(raw: unknown): AcmMaterial`
  - `function seccionesParaFicha(raw: unknown): AcmSecciones | null`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/acm/material.test.ts
import { describe, it, expect } from "vitest";
import { SECCIONES, normalizarMaterial, seccionesParaFicha, TOPES } from "./material";

describe("SECCIONES", () => {
  it("son cuatro, en el orden en que se muestran en la configuración", () => {
    expect(SECCIONES.map((s) => s.clave)).toEqual([
      "quienes_somos", "como_comercializamos", "como_preparar", "roles_venta",
    ]);
  });

  it("cada una dice qué subir y dónde sale, para guiar al director", () => {
    for (const s of SECCIONES) {
      expect(s.ayuda.length).toBeGreaterThan(20);
      expect(s.donde.length).toBeGreaterThan(5);
    }
  });
});

describe("normalizarMaterial", () => {
  it("de una agencia sin nada configurado devuelve la forma vacía", () => {
    expect(normalizarMaterial(undefined)).toEqual({
      archivos: [],
      secciones: { quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" },
    });
  });

  it("recorta cada sección a su tope", () => {
    const largo = "a".repeat(5000);
    const m = normalizarMaterial({ secciones: { quienes_somos: largo, roles_venta: largo } });
    expect(m.secciones.quienes_somos).toHaveLength(TOPES.quienes_somos);
    expect(m.secciones.roles_venta).toHaveLength(TOPES.roles_venta);
  });

  it("ignora claves de sección inventadas", () => {
    const m = normalizarMaterial({ secciones: { quienes_somos: "Hola", inventada: "no va" } });
    expect(m.secciones).not.toHaveProperty("inventada");
    expect(m.secciones.quienes_somos).toBe("Hola");
  });

  it("descarta archivos a los que les falta un dato", () => {
    const m = normalizarMaterial({
      archivos: [
        { id: "1", nombre: "ok.pdf", path: "ag/1.pdf", subido_el: "2026-09-05T10:00:00Z" },
        { id: "2", nombre: "sin path" },
        "basura",
      ],
    });
    expect(m.archivos).toHaveLength(1);
    expect(m.archivos[0].nombre).toBe("ok.pdf");
  });

  it("no explota con basura", () => {
    expect(normalizarMaterial("texto suelto").archivos).toEqual([]);
    expect(normalizarMaterial(null).secciones.quienes_somos).toBe("");
  });
});

describe("seccionesParaFicha", () => {
  it("devuelve null si no hay NINGUNA sección con texto: la ficha sale como siempre", () => {
    expect(seccionesParaFicha(undefined)).toBeNull();
    expect(seccionesParaFicha({ secciones: { quienes_somos: "   " } })).toBeNull();
  });

  it("devuelve las secciones cuando hay al menos una con texto", () => {
    const s = seccionesParaFicha({ secciones: { quienes_somos: "Somos Central." } });
    expect(s?.quienes_somos).toBe("Somos Central.");
    expect(s?.como_preparar).toBe("");
  });

  it("nunca deja pasar la lista de archivos a la ficha", () => {
    const s = seccionesParaFicha({
      archivos: [{ id: "1", nombre: "interno.pdf", path: "ag/1.pdf", subido_el: "2026-09-05T10:00:00Z" }],
      secciones: { quienes_somos: "Somos Central." },
    });
    expect(s).not.toHaveProperty("archivos");
    expect(JSON.stringify(s)).not.toContain("interno.pdf");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/acm/material.test.ts`
Expected: FAIL — `Failed to resolve import "./material"`

- [ ] **Step 3: Escribir la implementación mínima**

```typescript
// lib/acm/material.ts
// ─────────────────────────────────────────────────────────────────────────────
// ACM · Material institucional que carga cada agencia y que se imprime dentro de
// la ficha que recibe el propietario. Vive en agencies.marketing_ai_config.acm_material.
// Las cuatro secciones son FIJAS: si la IA pudiera inventar secciones, cada
// propietario recibiría una ficha con una forma distinta.
// ─────────────────────────────────────────────────────────────────────────────

export type ClaveSeccion =
  | "quienes_somos" | "como_comercializamos" | "como_preparar" | "roles_venta";

export interface SeccionMeta {
  clave: ClaveSeccion;
  titulo: string;
  tope: number;
  /** Qué archivo de su carpeta tiene que buscar el director. Sin esto la función queda vacía. */
  ayuda: string;
  /** Dónde va a salir en la ficha, para que entienda qué está armando. */
  donde: string;
}

export const SECCIONES: readonly SeccionMeta[] = [
  {
    clave: "quienes_somos",
    titulo: "Quiénes somos",
    tope: 1200,
    ayuda: "Qué subir: la carpeta de presentación, el «quiénes somos» de tu web, o el brochure que le das al cliente en la primera reunión.",
    donde: "Sale en la hoja 2, antes del precio.",
  },
  {
    clave: "como_comercializamos",
    titulo: "Cómo comercializamos su propiedad",
    tope: 1800,
    ayuda: "Qué subir: tu plan de marketing — en qué portales publicás, cómo trabajás con otras inmobiliarias, cada cuánto le informás al propietario.",
    donde: "Sale al final, después de las conclusiones.",
  },
  {
    clave: "como_preparar",
    titulo: "Cómo preparar su propiedad",
    tope: 1500,
    ayuda: "Qué subir: la guía de cómo preparar la casa para las muestras — orden, luz, limpieza, qué hacer el día de la visita.",
    donde: "Sale en la última hoja.",
  },
  {
    clave: "roles_venta",
    titulo: "El rol de cada uno en la venta",
    tope: 500,
    ayuda: "Qué subir: el cuadro de quién define qué — quién pone el precio de oferta, quién el estado de la propiedad, quién el plan de marketing y quién termina definiendo el precio final.",
    donde: "Sale al lado del gráfico del precio.",
  },
] as const;

export const TOPES = Object.fromEntries(
  SECCIONES.map((s) => [s.clave, s.tope]),
) as Record<ClaveSeccion, number>;

export interface AcmMaterialArchivo {
  id: string;
  nombre: string;
  /** Ruta dentro del bucket privado `acm-material`. No es una URL: nadie lo muestra. */
  path: string;
  subido_el: string;
}

export type AcmSecciones = Record<ClaveSeccion, string>;

export interface AcmMaterial {
  archivos: AcmMaterialArchivo[];
  secciones: AcmSecciones;
}

const esTexto = (v: unknown): v is string => typeof v === "string";

function seccionesVacias(): AcmSecciones {
  return { quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" };
}

/** Limpia lo que venga de la base o de la IA: recorta al tope y descarta lo que no reconoce. */
export function normalizarMaterial(raw: unknown): AcmMaterial {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const secciones = seccionesVacias();
  const crudas = (obj.secciones && typeof obj.secciones === "object" ? obj.secciones : {}) as Record<string, unknown>;
  for (const s of SECCIONES) {
    const v = crudas[s.clave];
    if (esTexto(v)) secciones[s.clave] = v.trim().slice(0, s.tope);
  }

  const archivos: AcmMaterialArchivo[] = Array.isArray(obj.archivos)
    ? obj.archivos.flatMap((a) => {
        if (!a || typeof a !== "object") return [];
        const { id, nombre, path, subido_el } = a as Record<string, unknown>;
        if (!esTexto(id) || !esTexto(nombre) || !esTexto(path) || !esTexto(subido_el)) return [];
        return [{ id, nombre, path, subido_el }];
      })
    : [];

  return { archivos, secciones };
}

/**
 * Lo único que viaja al snapshot de la ficha. La lista de archivos NO va: el propietario no
 * tiene por qué recibir los nombres de los archivos internos de la agencia.
 * Devuelve null si no hay ni una sección con texto — así la ficha sale igual que siempre.
 */
export function seccionesParaFicha(raw: unknown): AcmSecciones | null {
  const { secciones } = normalizarMaterial(raw);
  const hayAlgo = SECCIONES.some((s) => secciones[s.clave].trim().length > 0);
  return hayAlgo ? secciones : null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/acm/material.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/acm/material.ts lib/acm/material.test.ts
git commit -m "feat(acm): tipos y normalizacion del material institucional de la agencia"
```

---

### Task 2: Extraer el texto de un PDF o Word

Una función sola, sin red ni base: recibe el archivo en memoria y devuelve texto.

**Files:**
- Create: `lib/acm/material-extraer.ts`
- Test: `lib/acm/material-extraer.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `const MAX_ARCHIVO = 26214400`
  - `const EXTENSIONES_OK = ["pdf", "docx"] as const`
  - `function extensionDe(nombre: string): "pdf" | "docx" | null`
  - `async function extraerTexto(buffer: Buffer, ext: "pdf" | "docx"): Promise<string>`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/acm/material-extraer.test.ts
import { describe, it, expect } from "vitest";
import { extensionDe, MAX_ARCHIVO } from "./material-extraer";

describe("extensionDe", () => {
  it("reconoce pdf y docx sin importar mayúsculas", () => {
    expect(extensionDe("Our Company 2025.PDF")).toBe("pdf");
    expect(extensionDe("bienvenida.docx")).toBe("docx");
  });

  it("rechaza lo que no sabe leer", () => {
    expect(extensionDe("presentacion.pptx")).toBeNull();
    expect(extensionDe("foto.jpg")).toBeNull();
    expect(extensionDe("sin-extension")).toBeNull();
  });

  it("no se confunde con puntos en el nombre", () => {
    expect(extensionDe("Central v2.1 - final.pdf")).toBe("pdf");
  });
});

describe("MAX_ARCHIVO", () => {
  it("es 50 MB", () => {
    expect(MAX_ARCHIVO).toBe(50 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/acm/material-extraer.test.ts`
Expected: FAIL — `Failed to resolve import "./material-extraer"`

- [ ] **Step 3: Escribir la implementación**

```typescript
// lib/acm/material-extraer.ts
// ─────────────────────────────────────────────────────────────────────────────
// ACM · Saca el texto de los archivos que sube la agencia. Mismo camino que usa
// Contratos (app/api/contratos/convert-template/route.ts): pdf-parse-fork para PDF,
// mammoth para Word. Del archivo se copia SOLO el texto: los gráficos, las fotos y
// los logos no pasan a la ficha.
// ─────────────────────────────────────────────────────────────────────────────

/** 50 MB. Un carpetón institucional es todo imágenes; 25 MB no alcanzaba. */
export const MAX_ARCHIVO = 50 * 1024 * 1024;

export const EXTENSIONES_OK = ["pdf", "docx"] as const;
export type ExtensionOk = (typeof EXTENSIONES_OK)[number];

export function extensionDe(nombre: string): ExtensionOk | null {
  const punto = nombre.lastIndexOf(".");
  if (punto < 0) return null;
  const ext = nombre.slice(punto + 1).toLowerCase();
  return (EXTENSIONES_OK as readonly string[]).includes(ext) ? (ext as ExtensionOk) : null;
}

export async function extraerTexto(buffer: Buffer, ext: ExtensionOk): Promise<string> {
  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  // pdf-parse-fork es CommonJS: import dinámico, igual que en Contratos.
  const pdfParse = (await import("pdf-parse-fork")).default;
  const { text } = await pdfParse(buffer);
  return text;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/acm/material-extraer.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/acm/material-extraer.ts lib/acm/material-extraer.test.ts
git commit -m "feat(acm): extraer texto de los PDF y Word que sube la agencia"
```

---

### Task 3: El prompt y el parseo de lo que devuelve la IA

Acá viven las dos reglas duras: no inventar y responder en español. El parseo es lo que impide que una respuesta rara ensucie la configuración.

**Files:**
- Create: `lib/acm/material-ia.ts`
- Test: `lib/acm/material-ia.test.ts`

**Interfaces:**
- Consumes: de Task 1 — `SECCIONES`, `TOPES`, `AcmSecciones`, `ClaveSeccion`, `normalizarMaterial`.
- Produces:
  - `function promptReparto(textos: string[]): string`
  - `function promptAcomodar(clave: ClaveSeccion, texto: string): string`
  - `function parsearReparto(respuesta: string): AcmSecciones`
  - `function parsearAcomodado(respuesta: string, clave: ClaveSeccion): string`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/acm/material-ia.test.ts
import { describe, it, expect } from "vitest";
import { promptReparto, promptAcomodar, parsearReparto, parsearAcomodado } from "./material-ia";
import { TOPES } from "./material";

describe("promptReparto", () => {
  it("le prohíbe inventar y le exige dejar vacío lo que no encuentra", () => {
    const p = promptReparto(["texto del carpetón"]);
    expect(p.toLowerCase()).toContain("vacía");
    expect(p.toLowerCase()).toContain("no inventes");
  });

  it("pide español rioplatense, porque hay material en inglés", () => {
    expect(promptReparto(["Our Company"]).toLowerCase()).toContain("rioplatense");
  });

  it("nombra las cuatro secciones y sus topes", () => {
    const p = promptReparto(["x"]);
    for (const clave of ["quienes_somos", "como_comercializamos", "como_preparar", "roles_venta"]) {
      expect(p).toContain(clave);
    }
    expect(p).toContain(String(TOPES.quienes_somos));
  });

  it("mete el texto de todos los archivos, separados", () => {
    const p = promptReparto(["uno", "dos"]);
    expect(p).toContain("uno");
    expect(p).toContain("dos");
  });
});

describe("promptAcomodar", () => {
  it("le prohíbe agregar datos que el director no escribió", () => {
    const p = promptAcomodar("quienes_somos", "Somos Central, 13 años.");
    expect(p.toLowerCase()).toContain("no agregues");
    expect(p).toContain("Somos Central, 13 años.");
  });
});

describe("parsearReparto", () => {
  it("lee el JSON aunque venga envuelto en backticks", () => {
    const r = parsearReparto('```json\n{"quienes_somos":"Somos Central."}\n```');
    expect(r.quienes_somos).toBe("Somos Central.");
  });

  it("deja vacías las secciones que la IA no devolvió", () => {
    const r = parsearReparto('{"quienes_somos":"Hola"}');
    expect(r.como_preparar).toBe("");
    expect(r.roles_venta).toBe("");
  });

  it("descarta secciones inventadas por la IA", () => {
    const r = parsearReparto('{"quienes_somos":"Hola","nuestros_premios":"no va"}');
    expect(r).not.toHaveProperty("nuestros_premios");
  });

  it("recorta al tope aunque la IA se pase", () => {
    const r = parsearReparto(JSON.stringify({ roles_venta: "a".repeat(3000) }));
    expect(r.roles_venta).toHaveLength(TOPES.roles_venta);
  });

  it("con una respuesta que no es JSON devuelve las cuatro vacías en vez de romper", () => {
    const r = parsearReparto("Perdón, no pude procesar el archivo.");
    expect(r).toEqual({ quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" });
  });
});

describe("parsearAcomodado", () => {
  it("devuelve el texto recortado al tope de esa sección", () => {
    expect(parsearAcomodado('{"texto":"Listo."}', "quienes_somos")).toBe("Listo.");
    expect(parsearAcomodado(JSON.stringify({ texto: "a".repeat(999) }), "roles_venta")).toHaveLength(TOPES.roles_venta);
  });

  it("acepta también una respuesta en texto plano", () => {
    expect(parsearAcomodado("Somos Central.", "quienes_somos")).toBe("Somos Central.");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/acm/material-ia.test.ts`
Expected: FAIL — `Failed to resolve import "./material-ia"`

- [ ] **Step 3: Escribir la implementación**

```typescript
// lib/acm/material-ia.ts
// ─────────────────────────────────────────────────────────────────────────────
// ACM · Los prompts que reparten el material de la agencia en las cuatro secciones,
// y el parseo de lo que devuelve la IA. Las dos reglas duras viven acá:
//   1. Si no encuentra material para una sección, la deja VACÍA. Nunca inventa.
//   2. Siempre responde en español rioplatense (hay material en inglés).
// ─────────────────────────────────────────────────────────────────────────────

import { SECCIONES, TOPES, type AcmSecciones, type ClaveSeccion } from "./material";

function seccionesVacias(): AcmSecciones {
  return { quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" };
}

const CATALOGO = SECCIONES.map(
  (s) => `- "${s.clave}" — ${s.titulo}. ${s.ayuda} Máximo ${s.tope} caracteres.`,
).join("\n");

export function promptReparto(textos: string[]): string {
  const material = textos
    .map((t, i) => `─── ARCHIVO ${i + 1} ───\n${t}`)
    .join("\n\n");

  return `Sos el asistente de una inmobiliaria. Recibís el texto de los documentos institucionales que la agencia le entrega a sus propietarios. Tu tarea es repartir ESE contenido en cuatro secciones que van a imprimirse dentro del informe de valuación (ACM) que recibe el dueño de la propiedad.

Las cuatro secciones son fijas:
${CATALOGO}

REGLAS QUE NO SE NEGOCIAN:
1. NO INVENTES. Si el material no dice nada sobre una sección, devolvé esa sección VACÍA (""). Es preferible una sección vacía a una sección verosímil pero falsa: este documento lo lee un propietario que va a tomar una decisión de dinero.
2. Escribí SIEMPRE en español rioplatense (vos, no tú), aunque el material original esté en inglés.
3. No copies datos de contacto, direcciones, teléfonos ni nombres de personas: la ficha ya los pone por su cuenta.
4. Hablale al propietario de usted o de vos, con frases cortas. Nada de mayúsculas sostenidas ni signos de exclamación.
5. Respetá el máximo de caracteres de cada sección.

Devolvé ÚNICAMENTE un JSON con esta forma, sin texto alrededor y sin backticks:
{"quienes_somos":"...","como_comercializamos":"...","como_preparar":"...","roles_venta":"..."}

MATERIAL:
${material}`;
}

export function promptAcomodar(clave: ClaveSeccion, texto: string): string {
  const meta = SECCIONES.find((s) => s.clave === clave)!;

  return `Sos el asistente de una inmobiliaria. El director escribió a mano el texto de la sección "${meta.titulo}", que se imprime dentro del informe de valuación que recibe el propietario. Acomodalo para que se lea bien.

REGLAS QUE NO SE NEGOCIAN:
1. NO AGREGUES información que él no haya escrito. No sumes servicios, cifras, premios ni promesas. Solo ordenás y redactás lo que ya está.
2. Español rioplatense, frases cortas, tono profesional y cercano.
3. Nada de mayúsculas sostenidas ni signos de exclamación.
4. Máximo ${meta.tope} caracteres.

Devolvé ÚNICAMENTE un JSON, sin backticks: {"texto":"..."}

TEXTO DEL DIRECTOR:
${texto}`;
}

/** Saca los backticks y se queda con el objeto JSON, que es como suele venir la respuesta. */
function aObjeto(respuesta: string): Record<string, unknown> | null {
  const limpio = respuesta.replace(/```json|```/g, "").trim();
  const desde = limpio.indexOf("{");
  const hasta = limpio.lastIndexOf("}");
  if (desde < 0 || hasta <= desde) return null;
  try {
    const parsed = JSON.parse(limpio.slice(desde, hasta + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Una respuesta que no se entiende devuelve las cuatro secciones vacías, nunca una excepción:
 * el director ve que no salió nada y vuelve a intentar, en vez de una pantalla rota.
 */
export function parsearReparto(respuesta: string): AcmSecciones {
  const obj = aObjeto(respuesta);
  const out = seccionesVacias();
  if (!obj) return out;

  for (const s of SECCIONES) {
    const v = obj[s.clave];
    if (typeof v === "string") out[s.clave] = v.trim().slice(0, s.tope);
  }
  return out;
}

export function parsearAcomodado(respuesta: string, clave: ClaveSeccion): string {
  const obj = aObjeto(respuesta);
  const crudo = obj && typeof obj.texto === "string" ? obj.texto : respuesta;
  return crudo.replace(/```json|```/g, "").trim().slice(0, TOPES[clave]);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/acm/material-ia.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/acm/material-ia.ts lib/acm/material-ia.test.ts
git commit -m "feat(acm): prompts y parseo del reparto del material en las cuatro secciones"
```

---

### Task 4: El bucket privado y el endpoint de archivos

Subir y borrar. El bucket se crea una sola vez contra producción.

**Files:**
- Create: `app/api/marketing-ia/acm-material/archivo/route.ts`
- Create: `scripts/crear-bucket-acm-material.mjs`

**Interfaces:**
- Consumes: de Task 2 — `MAX_ARCHIVO`, `extensionDe`.
- Produces:
  - `POST /api/marketing-ia/acm-material/archivo` — body `FormData` con `file`. Responde `{ id, nombre, path, subido_el }` (un `AcmMaterialArchivo`).
  - `DELETE /api/marketing-ia/acm-material/archivo` — body JSON `{ path: string }`. Responde `{ ok: true }`.

- [ ] **Step 1: Crear el bucket privado en producción**

```javascript
// scripts/crear-bucket-acm-material.mjs
// Se corre UNA vez. El bucket es privado: los archivos institucionales solo los abre
// el servidor con el cliente admin, cuando el director toca "Volver a leer".
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase.storage.createBucket("acm-material", {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
});

if (error && !/already exists/i.test(error.message)) {
  console.error("No se pudo crear el bucket:", error.message);
  process.exit(1);
}
console.log(error ? "El bucket ya existía." : "Bucket acm-material creado.", data ?? "");
```

Run: `node scripts/crear-bucket-acm-material.mjs`
Expected: `Bucket acm-material creado.` (o `El bucket ya existía.` si se repite)

- [ ] **Step 2: Escribir el endpoint**

```typescript
// app/api/marketing-ia/acm-material/archivo/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { MAX_ARCHIVO, extensionDe } from "@/lib/acm/material-extraer";

export const dynamic = "force-dynamic";

const BUCKET = "acm-material";

/** El material de la agencia lo define el director. Un asesor no lo toca. */
async function soloDirector() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user?.id).single();
  return profile?.role === "director";
}

export async function POST(req: Request) {
  try {
    const { agencyId } = await requireTenant();
    if (!(await soloDirector())) {
      return NextResponse.json(
        { error: "Solo los directores pueden cargar el material del ACM." },
        { status: 403 },
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No llegó ningún archivo." }, { status: 400 });

    if (file.size > MAX_ARCHIVO) {
      return NextResponse.json({ error: "El archivo pasa los 50 MB." }, { status: 400 });
    }

    const ext = extensionDe(file.name);
    if (!ext) {
      return NextResponse.json({ error: "Solo se pueden subir PDF o Word (.docx)." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const path = `${agencyId}/${id}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });
    if (error) throw error;

    return NextResponse.json({
      id,
      nombre: file.name,
      path,
      subido_el: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material upload:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { agencyId } = await requireTenant();
    if (!(await soloDirector())) {
      return NextResponse.json(
        { error: "Solo los directores pueden borrar el material del ACM." },
        { status: 403 },
      );
    }

    const { path } = (await req.json()) as { path?: string };
    // Una agencia solo borra lo suyo: la ruta empieza con su propio id.
    if (!path || !path.startsWith(`${agencyId}/`)) {
      return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).remove([path]);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material delete:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en los archivos nuevos.

- [ ] **Step 4: Commit**

```bash
git add app/api/marketing-ia/acm-material/archivo/route.ts scripts/crear-bucket-acm-material.mjs
git commit -m "feat(acm): bucket privado y endpoint para subir y borrar el material de la agencia"
```

---

### Task 5: Los endpoints de IA — leer y acomodar

**Files:**
- Create: `app/api/marketing-ia/acm-material/leer/route.ts`
- Create: `app/api/marketing-ia/acm-material/acomodar/route.ts`

**Interfaces:**
- Consumes: Task 1 (`SECCIONES`, `ClaveSeccion`), Task 2 (`extensionDe`, `extraerTexto`), Task 3 (`promptReparto`, `promptAcomodar`, `parsearReparto`, `parsearAcomodado`).
- Produces:
  - `POST /api/marketing-ia/acm-material/leer` — body `{ paths: string[] }`. Responde `{ secciones: AcmSecciones }`.
  - `POST /api/marketing-ia/acm-material/acomodar` — body `{ clave: ClaveSeccion, texto: string }`. Responde `{ texto: string }`.

- [ ] **Step 1: Escribir el endpoint de lectura**

```typescript
// app/api/marketing-ia/acm-material/leer/route.ts
// Relee TODOS los archivos de la lista y propone las cuatro secciones. No guarda nada:
// la propuesta se le muestra al director al lado de lo que ya tenía, y él acepta por sección.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extensionDe, extraerTexto } from "@/lib/acm/material-extraer";
import { promptReparto, parsearReparto } from "@/lib/acm/material-ia";

export const dynamic = "force-dynamic";

const BUCKET = "acm-material";
const MODELO = "gemini-3.5-flash";
/** Tope por archivo: más que esto no aporta y encarece la llamada. */
const MAX_TEXTO = 30000;

async function soloDirector() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user?.id).single();
  return profile?.role === "director";
}

export async function POST(req: Request) {
  try {
    const { agencyId } = await requireTenant();
    if (!(await soloDirector())) {
      return NextResponse.json({ error: "Solo los directores pueden hacer esto." }, { status: 403 });
    }

    const { paths } = (await req.json()) as { paths?: string[] };
    const propios = (paths ?? []).filter((p) => typeof p === "string" && p.startsWith(`${agencyId}/`));
    if (propios.length === 0) {
      return NextResponse.json({ error: "No hay archivos para leer." }, { status: 400 });
    }

    const admin = createAdminClient();
    const textos: string[] = [];
    for (const path of propios) {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !data) {
        console.error("acm-material: no se pudo bajar", path, error?.message);
        continue;
      }
      const ext = extensionDe(path);
      if (!ext) continue;
      const buffer = Buffer.from(await data.arrayBuffer());
      const texto = await extraerTexto(buffer, ext);
      if (texto.trim().length > 0) textos.push(texto.slice(0, MAX_TEXTO));
    }

    if (textos.length === 0) {
      return NextResponse.json(
        { error: "No se pudo leer texto de esos archivos. Puede que sean imágenes escaneadas." },
        { status: 400 },
      );
    }

    const txId = await consumeAiCredits("acm_material", 1, `Leer material ACM (${textos.length} archivo/s)`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: MODELO });
    const result = await model.generateContent(promptReparto(textos));

    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens, outputTokens } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({ model: MODELO, inputTokens, outputTokens });
      updateAiTransactionCost(txId, inputTokens, outputTokens, totalCostUSD);
    }

    return NextResponse.json({ secciones: parsearReparto(result.response.text()) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material leer:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Escribir el endpoint de acomodar**

```typescript
// app/api/marketing-ia/acm-material/acomodar/route.ts
// Toma lo que el director escribió a mano en UNA sección y lo deja redactado para el ACM.
// No agrega información: solo ordena la que él puso.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SECCIONES, type ClaveSeccion } from "@/lib/acm/material";
import { promptAcomodar, parsearAcomodado } from "@/lib/acm/material-ia";

export const dynamic = "force-dynamic";

const MODELO = "gemini-3.5-flash";

async function soloDirector() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user?.id).single();
  return profile?.role === "director";
}

export async function POST(req: Request) {
  try {
    await requireTenant();
    if (!(await soloDirector())) {
      return NextResponse.json({ error: "Solo los directores pueden hacer esto." }, { status: 403 });
    }

    const { clave, texto } = (await req.json()) as { clave?: string; texto?: string };

    const meta = SECCIONES.find((s) => s.clave === clave);
    if (!meta) return NextResponse.json({ error: "Sección desconocida." }, { status: 400 });
    if (!texto || texto.trim().length < 20) {
      return NextResponse.json({ error: "Escribí un poco más antes de acomodarlo." }, { status: 400 });
    }

    const txId = await consumeAiCredits("acm_material", 1, `Acomodar sección ${meta.clave}`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: MODELO });
    const result = await model.generateContent(promptAcomodar(meta.clave as ClaveSeccion, texto.trim()));

    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens, outputTokens } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({ model: MODELO, inputTokens, outputTokens });
      updateAiTransactionCost(txId, inputTokens, outputTokens, totalCostUSD);
    }

    return NextResponse.json({
      texto: parsearAcomodado(result.response.text(), meta.clave as ClaveSeccion),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material acomodar:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en los archivos nuevos.

- [ ] **Step 4: Commit**

```bash
git add app/api/marketing-ia/acm-material/leer/route.ts app/api/marketing-ia/acm-material/acomodar/route.ts
git commit -m "feat(acm): endpoints de IA para repartir el material y acomodar una seccion"
```

---

### Task 6: Guardar el material sin pisar la marca de la agencia

**El error más caro de todo este cambio vive acá.** `POST /api/marketing-ia/settings`
reemplaza el jsonb completo: si desde el ACM se guarda mandando solo el material, la
agencia pierde sus colores, su logo y su aviso legal. Por eso el material tiene su
propio endpoint, que hace merge en el servidor.

**Files:**
- Create: `app/api/marketing-ia/acm-material/route.ts`

**Interfaces:**
- Consumes: Task 1 — `normalizarMaterial`, `AcmMaterial`.
- Produces:
  - `GET /api/marketing-ia/acm-material` → `{ material: AcmMaterial, marca: { colors: string[]; logo_url: string | null; legal_notice: string } }`
  - `PUT /api/marketing-ia/acm-material` — body `{ material: AcmMaterial }` → `{ ok: true }`

- [ ] **Step 1: Escribir el endpoint**

```typescript
// app/api/marketing-ia/acm-material/route.ts
// Lee y guarda SOLO la clave acm_material del jsonb de la agencia.
// El merge se hace acá, en el servidor: mandar el jsonb entero desde el navegador haría que
// dos pestañas abiertas se pisen, y que guardar material borre los colores y el logo.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { normalizarMaterial } from "@/lib/acm/material";

export const dynamic = "force-dynamic";

async function soloDirector() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user?.id).single();
  return profile?.role === "director";
}

/** Devuelve el material y, de yapa, la marca que la ficha ya usa (solo para mostrarla). */
export async function GET() {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("agencies").select("marketing_ai_config").eq("id", agencyId).single();
    if (error) throw error;

    const mk = (data?.marketing_ai_config ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      material: normalizarMaterial(mk.acm_material),
      marca: {
        colors: Array.isArray(mk.brand_colors)
          ? (mk.brand_colors as unknown[]).filter((c): c is string => typeof c === "string" && !!c)
          : [],
        logo_url: typeof mk.logo_url === "string" ? mk.logo_url : null,
        legal_notice: typeof mk.legal_notice === "string" ? mk.legal_notice : "",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material GET:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { agencyId } = await requireTenant();
    if (!(await soloDirector())) {
      return NextResponse.json(
        { error: "Solo los directores pueden configurar el material del ACM." },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { material?: unknown };
    const material = normalizarMaterial(body.material);

    const admin = createAdminClient();

    // Se relee el jsonb ACÁ y se le cambia una sola clave. Nunca se reemplaza entero.
    const { data: actual, error: readErr } = await admin
      .from("agencies").select("marketing_ai_config").eq("id", agencyId).single();
    if (readErr) throw readErr;

    const config = {
      ...((actual?.marketing_ai_config ?? {}) as Record<string, unknown>),
      acm_material: material,
    };

    const { error } = await admin
      .from("agencies").update({ marketing_ai_config: config }).eq("id", agencyId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material PUT:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/marketing-ia/acm-material/route.ts
git commit -m "feat(acm): endpoint del material que hace merge y no pisa la marca de la agencia"
```

---

### Task 7: La solapa "Configuración" en el módulo de ACM

Dos componentes: la tarjeta con el material (la grande) y la solapa que la envuelve
junto al resumen de marca. **Solo la ve el director.**

**Files:**
- Create: `app/asesor/acm/components/config-material.tsx`
- Create: `app/asesor/acm/components/configuracion-tab.tsx`
- Modify: `app/asesor/acm/components/acm-module.tsx` (prop `esDirector`, tipo de `tab`, lista de solapas, título de la tarjeta y render)
- Modify: `app/director/acm/page.tsx` (pasar `esDirector`)

**Interfaces:**
- Consumes: Task 1 (`SECCIONES`, `normalizarMaterial`, `AcmMaterial`, `AcmMaterialArchivo`, `ClaveSeccion`), Tasks 4, 5 y 6 (los endpoints).
- Produces:
  - `export function ConfigMaterial({ value, onChange }: { value: AcmMaterial; onChange: (v: AcmMaterial) => void })`
  - `export function ConfiguracionTab()`

- [ ] **Step 1: Escribir la tarjeta del material**

```tsx
// app/asesor/acm/components/config-material.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import {
  SECCIONES, normalizarMaterial,
  type AcmMaterial, type AcmMaterialArchivo, type ClaveSeccion,
} from "@/lib/acm/material";

type Propuestas = Partial<Record<ClaveSeccion, string>>;

export function ConfigMaterial({
  value, onChange,
}: { value: AcmMaterial; onChange: (v: AcmMaterial) => void }) {
  const material = normalizarMaterial(value);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [acomodando, setAcomodando] = useState<ClaveSeccion | null>(null);
  const [propuestas, setPropuestas] = useState<Propuestas>({});

  const setSeccion = (clave: ClaveSeccion, texto: string) =>
    onChange({ ...material, secciones: { ...material.secciones, [clave]: texto } });

  const subirUno = async (file: File): Promise<AcmMaterialArchivo> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/marketing-ia/acm-material/archivo", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `No se pudo subir ${file.name}`);
    return data as AcmMaterialArchivo;
  };

  const borrarDelBucket = async (path: string) => {
    try {
      await fetch("/api/marketing-ia/acm-material/archivo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      // Si el borrado falla, el archivo queda en el bucket pero sale de la lista.
      // Lo que importa es que deje de alimentar el ACM.
    }
  };

  const agregar = async (files: FileList | null) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const nuevos: AcmMaterialArchivo[] = [];
      for (const file of Array.from(files)) nuevos.push(await subirUno(file));
      onChange({ ...material, archivos: [...material.archivos, ...nuevos] });
      toast.success(nuevos.length === 1 ? "Archivo cargado" : `${nuevos.length} archivos cargados`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  };

  // Reemplazar = sube el nuevo y saca el viejo, en un solo gesto. El texto ya aceptado NO se
  // toca: para actualizarlo hay que tocar "Volver a leer" y aceptar sección por sección.
  const reemplazar = async (viejo: AcmMaterialArchivo, file: File | undefined) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const nuevo = await subirUno(file);
      await borrarDelBucket(viejo.path);
      onChange({
        ...material,
        archivos: material.archivos.map((x) => (x.id === viejo.id ? nuevo : x)),
      });
      toast.success("Archivo reemplazado. Tocá «Volver a leer» para actualizar los textos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reemplazar el archivo");
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async (a: AcmMaterialArchivo) => {
    await borrarDelBucket(a.path);
    onChange({ ...material, archivos: material.archivos.filter((x) => x.id !== a.id) });
    toast.success("Archivo quitado. El texto que ya aceptaste queda como está.");
  };

  const volverALeer = async () => {
    setLeyendo(true);
    try {
      const res = await fetch("/api/marketing-ia/acm-material/leer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: material.archivos.map((a) => a.path) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo leer el material");
      setPropuestas(data.secciones);
      toast.success("Listo. Mirá lo que propone abajo y elegí qué usar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el material");
    } finally {
      setLeyendo(false);
    }
  };

  const acomodar = async (clave: ClaveSeccion) => {
    setAcomodando(clave);
    try {
      const res = await fetch("/api/marketing-ia/acm-material/acomodar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, texto: material.secciones[clave] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo acomodar el texto");
      setPropuestas((p) => ({ ...p, [clave]: data.texto }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo acomodar el texto");
    } finally {
      setAcomodando(null);
    }
  };

  const usarPropuesta = (clave: ClaveSeccion) => {
    const texto = propuestas[clave];
    if (texto === undefined) return;
    setSeccion(clave, texto);
    setPropuestas(({ [clave]: _descartada, ...resto }) => resto);
  };

  const descartarPropuesta = (clave: ClaveSeccion) =>
    setPropuestas(({ [clave]: _descartada, ...resto }) => resto);

  return (
    <div className="space-y-8">
      {/* ── Los archivos ── */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Subí los PDF o Word que <strong>ya usás</strong> con tus propietarios — podés subir
          varios juntos. PRISMA lee el texto, lo reparte en las cuatro secciones de abajo, y vos
          lo corregís antes de guardar. Si preferís, escribilas a mano y no subas nada.
        </p>
        <p className="text-xs bg-muted/50 border border-accent/10 rounded-lg p-3">
          <strong>Se copia solo el texto.</strong> Los gráficos, las fotos y los logos de tus
          archivos no pasan: la ficha los dibuja con los colores y el logo de tu agencia.
        </p>

        {material.archivos.length > 0 && (
          <ul className="space-y-2">
            {material.archivos.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-accent shrink-0" />
                <span className="flex-1 truncate">{a.nombre}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(a.subido_el).toLocaleDateString("es-AR")}
                </span>
                <label className="text-xs text-accent hover:underline cursor-pointer shrink-0">
                  Reemplazar
                  <input
                    type="file" accept=".pdf,.docx" className="hidden" disabled={subiendo}
                    onChange={(e) => { reemplazar(a, e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
                <Button variant="ghost" size="sm" onClick={() => quitar(a)} className="text-destructive h-7">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file" accept=".pdf,.docx" multiple disabled={subiendo}
            onChange={(e) => { agregar(e.target.files); e.target.value = ""; }}
            className="text-xs max-w-xs"
          />
          {subiendo && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
          {material.archivos.length > 0 && (
            <Button onClick={volverALeer} disabled={leyendo} variant="secondary" size="sm">
              {leyendo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Volver a leer con IA
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">PDF o Word (.docx), hasta 50 MB cada uno.</p>
      </div>

      {/* ── Las cuatro secciones ── */}
      <div className="space-y-6">
        {SECCIONES.map((s) => {
          const actual = material.secciones[s.clave];
          const propuesta = propuestas[s.clave];
          return (
            <div key={s.clave} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="font-semibold text-sm">{s.titulo}</h4>
                <span className="text-[10px] text-muted-foreground shrink-0">{s.donde}</span>
              </div>
              <p className="text-xs text-muted-foreground italic">{s.ayuda}</p>

              <Textarea
                value={actual}
                maxLength={s.tope}
                rows={5}
                onChange={(e) => setSeccion(s.clave, e.target.value)}
                placeholder="Escribilo a mano, o subí un archivo arriba y dejá que PRISMA lo proponga."
              />
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="ghost" size="sm"
                  disabled={acomodando === s.clave || actual.trim().length < 20}
                  onClick={() => acomodar(s.clave)}
                  className="text-xs h-7"
                >
                  {acomodando === s.clave
                    ? <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    : <Wand2 className="w-3 h-3 mr-2" />}
                  Acomodar con IA
                </Button>
                <span className="text-[10px] text-muted-foreground">{actual.length}/{s.tope}</span>
              </div>

              {propuesta !== undefined && (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-accent">Lo que propone la IA</p>
                  <p className="text-sm whitespace-pre-wrap">
                    {propuesta || (
                      <span className="italic text-muted-foreground">
                        No encontró material para esta sección. Podés escribirla a mano.
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => usarPropuesta(s.clave)} disabled={!propuesta} className="h-7 text-xs">
                      Usar este
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => descartarPropuesta(s.clave)} className="h-7 text-xs">
                      Descartar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Escribir la solapa que la envuelve**

```tsx
// app/asesor/acm/components/configuracion-tab.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Palette, Save } from "lucide-react";
import { normalizarMaterial, type AcmMaterial } from "@/lib/acm/material";
import { ConfigMaterial } from "./config-material";

interface Marca {
  colors: string[];
  logo_url: string | null;
  legal_notice: string;
}

export function ConfiguracionTab() {
  const [material, setMaterial] = useState<AcmMaterial>(normalizarMaterial(undefined));
  const [marca, setMarca] = useState<Marca>({ colors: [], logo_url: null, legal_notice: "" });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/marketing-ia/acm-material");
        if (res.ok) {
          const data = await res.json();
          setMaterial(normalizarMaterial(data.material));
          setMarca(data.marca);
        }
      } catch (e) {
        console.error("No se pudo cargar la configuración del ACM", e);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/marketing-ia/acm-material", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      toast.success("Configuración guardada. Los próximos ACM ya salen con esto.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ── Lo que viene de Marketing IA: se muestra, no se edita ── */}
      <div className="rounded-xl border border-accent/10 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">La imagen de tu ficha</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Los colores, el logo y el aviso legal de la ficha del ACM salen de{" "}
          <strong>Marketing IA → Configuración</strong>. Acá se muestran para que sepas cómo se
          va a ver; para cambiarlos, entrá ahí.
        </p>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Colores:</span>
            {marca.colors.length > 0 ? (
              marca.colors.map((c) => (
                <span key={c} className="w-5 h-5 rounded border border-black/10" style={{ backgroundColor: c }} title={c} />
              ))
            ) : (
              <span className="text-xs italic text-muted-foreground">sin definir</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Logo:</span>
            {marca.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca.logo_url} alt="Logo de la agencia" className="h-6 object-contain" />
            ) : (
              <span className="text-xs italic text-muted-foreground">sin cargar</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Aviso legal:</span>
            <span className="text-xs">
              {marca.legal_notice
                ? "cargado"
                : <span className="italic text-muted-foreground">sin cargar</span>}
            </span>
          </div>
        </div>

        <Link href="/director/marketing-ia" className="inline-block text-xs text-accent hover:underline">
          Ir a Marketing IA → Configuración
        </Link>
      </div>

      {/* ── Lo que se configura acá ── */}
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm">
            Material para el ACM{" "}
            <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Lo que tu inmobiliaria le cuenta al propietario dentro del informe de valuación.
            Si no cargás nada, el ACM sale como siempre.
          </p>
        </div>

        <ConfigMaterial value={material} onChange={setMaterial} />
      </div>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Sumar la solapa al módulo de ACM**

En `app/asesor/acm/components/acm-module.tsx`, cinco cambios puntuales.

Junto a los otros imports:

```typescript
import { ConfiguracionTab } from "./configuracion-tab";
```

La firma del componente (línea ~54) pasa a recibir la prop. **El asesor no la pasa, así
que le llega `false` y la solapa no existe para él:**

```typescript
export function AcmModule({ esDirector = false }: { esDirector?: boolean }) {
```

El tipo del estado `tab` (línea 72):

```typescript
  const [tab, setTab] = useState<"nuevo" | "historial" | "configuracion">("nuevo");
```

La lista de solapas (línea ~197). El `.filter` es lo que la esconde:

```tsx
        {([
          ["nuevo", "Nuevo ACM"],
          ["historial", "Mis ACM"],
          ["configuracion", "Configuración"],
        ] as const)
          .filter(([key]) => key !== "configuracion" || esDirector)
          .map(([key, label]) => (
```

El título de la tarjeta (línea ~218):

```tsx
              {tab === "configuracion"
                ? "Configuración · Cómo sale la ficha para el propietario"
                : tab === "historial"
                  ? "Historial · Tus análisis guardados"
                  : view === "input"
                    ? "1 · Elegí la propiedad a analizar"
                    : "2 · Comparables encontrados"}
```

Y el render (línea ~228):

```tsx
          {tab === "configuracion" ? (
            <ConfiguracionTab />
          ) : tab === "historial" ? (
```

- [ ] **Step 4: Que la página del director active la solapa**

`app/director/acm/page.tsx` queda así:

```tsx
"use client";

// El ACM del director usa el mismo módulo que el asesor (misma lógica de comparables).
// La diferencia es la solapa Configuración: el material institucional lo define el director.
import { AcmModule } from "@/app/asesor/acm/components/acm-module";

export default function ACMDirectorPage() {
  return <AcmModule esDirector />;
}
```

`app/asesor/acm/page.tsx` **no se toca**: sin la prop, `esDirector` es `false`.

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/asesor/acm/components/config-material.tsx app/asesor/acm/components/configuracion-tab.tsx app/asesor/acm/components/acm-module.tsx app/director/acm/page.tsx
git commit -m "feat(acm): solapa Configuracion en el modulo de ACM, solo para el director"
```

---

### Task 8: Las secciones viajan al snapshot de la ficha

**Files:**
- Modify: `lib/acm/ficha.ts` (interfaz `AcmFichaSnapshot`)
- Modify: `app/api/acm/ficha/route.ts:239-284`
- Test: `lib/acm/material.test.ts` (agregar el bloque de abajo)

**Interfaces:**
- Consumes: Task 1 — `seccionesParaFicha`, `AcmSecciones`.
- Produces: `AcmFichaSnapshot.material?: AcmSecciones | null` — ausente en toda ficha anterior a este cambio.

- [ ] **Step 1: Escribir el test**

Agregar al final de `lib/acm/material.test.ts`:

```typescript
describe("lo que llega al snapshot de la ficha", () => {
  it("una agencia sin material no manda secciones: la ficha sale igual que siempre", () => {
    const config: Record<string, unknown> = { brand_colors: ["#123456"], logo_url: "x.png" };
    expect(seccionesParaFicha(config.acm_material)).toBeNull();
  });

  it("manda las secciones cuando la agencia cargó aunque sea una", () => {
    const config = { acm_material: { secciones: { como_preparar: "Ventilá la casa." } } };
    const s = seccionesParaFicha(config.acm_material);
    expect(s?.como_preparar).toBe("Ventilá la casa.");
    expect(s?.quienes_somos).toBe("");
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npx vitest run lib/acm/material.test.ts`
Expected: PASS. `seccionesParaFicha` ya existe desde Task 1; estos dos casos fijan el
contrato que consume el endpoint. Si pasan directo, seguir al paso 3.

- [ ] **Step 3: Agregar el campo al tipo del snapshot**

En `lib/acm/ficha.ts`, junto a los otros imports del archivo:

```typescript
import type { AcmSecciones } from "./material";
```

Y dentro de `interface AcmFichaSnapshot`, después de `brand: FichaBrand;`:

```typescript
  /**
   * Material institucional de la agencia (módulo ACM → Configuración). Ausente en toda ficha
   * anterior a sep-2026 y ausente también cuando la agencia no cargó nada: en ese caso la ficha
   * sale exactamente como salía antes. Nunca acceder sin verificar.
   */
  material?: AcmSecciones | null;
```

- [ ] **Step 4: Llenar el campo al armar el snapshot**

En `app/api/acm/ficha/route.ts`, agregar el import:

```typescript
import { seccionesParaFicha } from "@/lib/acm/material";
```

Justo después del bloque que arma `brand` (línea ~245):

```typescript
    // Material institucional que cargó la agencia. Null si no cargó nada: la ficha sale igual
    // que antes de que esta función existiera. La lista de archivos NO viaja: el propietario no
    // tiene por qué recibir los nombres de los archivos internos de la agencia.
    const material = seccionesParaFicha(mk.acm_material);
```

Y dentro del objeto `snapshot`, después de `brand,`:

```typescript
      material,
```

- [ ] **Step 5: Correr los tests y verificar que compila**

Run: `npx vitest run lib/acm/ && npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add lib/acm/ficha.ts lib/acm/material.test.ts app/api/acm/ficha/route.ts
git commit -m "feat(acm): el snapshot de la ficha lleva el material de la agencia"
```

---

### Task 9: Dibujar las cuatro secciones en la ficha

**Files:**
- Modify: `app/ficha-acm/[token]/page.tsx`

**Interfaces:**
- Consumes: Task 8 — `snap.material`.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Agregar el componente de hoja institucional**

Al final de `app/ficha-acm/[token]/page.tsx`, junto a los otros componentes de hoja:

```tsx
// ── Hoja de material institucional de la agencia ─────────────────────────────
// Una hoja por sección cargada. El texto lo escribió (o revisó) el director en el módulo
// ACM → Configuración. Los párrafos vienen separados por línea en blanco.
function MaterialSheet({
  titulo, texto, primary, accent, onPrimary, brand, agencyName,
}: {
  titulo: string; texto: string; primary: string; accent: string; onPrimary: string;
  brand: FichaBrand; agencyName: string;
}) {
  return (
    <section className="sheet">
      <div className="pulso" style={{ backgroundColor: primary, color: onPrimary }}>
        <div>
          <span className="pulso-eyebrow" style={{ color: accent }}>{agencyName.toUpperCase()}</span>
          <div className="pulso-barrio">{titulo}</div>
        </div>
      </div>
      <div className="sheet-body">
        <div className="material-body">
          {texto.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p.trim()}</p>
          ))}
        </div>
      </div>
      <SheetFooter brand={brand} agencyName={agencyName} primary={primary} />
    </section>
  );
}
```

- [ ] **Step 2: Agregar el CSS de esas hojas**

Dentro de la constante `CSS` del mismo archivo, junto a los estilos de las otras hojas:

```css
.material-body { max-width: 62ch; }
.material-body p { margin: 0 0 12px; line-height: 1.65; font-size: 14px; }
.material-body p:last-child { margin-bottom: 0; }
.roles-box { margin: 18px 0 0; padding: 14px 16px; border-radius: 10px; background: #f6f6f4; }
.roles-box h4 { margin: 0 0 8px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
.roles-box p { margin: 0 0 8px; line-height: 1.6; font-size: 13px; }
.roles-box p:last-child { margin-bottom: 0; }
```

- [ ] **Step 3: Montar "Quiénes somos" como hoja 2**

Justo después de la `</section>` de la PORTADA y antes del comentario
`{/* ══ LA PROPIEDAD Y SU ENTORNO ══ */}`:

```tsx
      {/* ══════════ QUIÉNES SOMOS (solo si la agencia lo cargó) ══════════ */}
      {snap.material?.quienes_somos ? (
        <MaterialSheet
          titulo="Quiénes somos"
          texto={snap.material.quienes_somos}
          primary={primary} accent={accent} onPrimary={onPrimary}
          brand={brand} agencyName={agencyName}
        />
      ) : null}
```

- [ ] **Step 4: Montar el bloque de roles al lado de la Pirámide**

En la hoja final, inmediatamente después de `<PiramidePrecios ... />`:

```tsx
          {snap.material?.roles_venta ? (
            <div className="roles-box">
              <h4 style={{ color: primary, fontFamily: "var(--font-display)" }}>El rol de cada uno en la venta</h4>
              {snap.material.roles_venta.split(/\n\s*\n/).map((p, i) => (
                <p key={i}>{p.trim()}</p>
              ))}
            </div>
          ) : null}
```

- [ ] **Step 5: Montar las dos hojas del final**

Después de la `</section>` de la PÁGINA FINAL (la que cierra matriz + conclusiones +
contacto), antes del cierre del `</div>` que envuelve todo:

```tsx
      {/* ══════════ CÓMO COMERCIALIZAMOS / CÓMO PREPARAR (solo si la agencia las cargó) ══════════ */}
      {snap.material?.como_comercializamos ? (
        <MaterialSheet
          titulo="Cómo comercializamos su propiedad"
          texto={snap.material.como_comercializamos}
          primary={primary} accent={accent} onPrimary={onPrimary}
          brand={brand} agencyName={agencyName}
        />
      ) : null}

      {snap.material?.como_preparar ? (
        <MaterialSheet
          titulo="Cómo preparar su propiedad"
          texto={snap.material.como_preparar}
          primary={primary} accent={accent} onPrimary={onPrimary}
          brand={brand} agencyName={agencyName}
        />
      ) : null}
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit && npx vitest run lib/acm/`
Expected: sin errores, tests en verde.

- [ ] **Step 7: Commit**

```bash
git add "app/ficha-acm/[token]/page.tsx"
git commit -m "feat(acm): la ficha imprime el material institucional de la agencia"
```

---

### Task 10: Probarlo de verdad en el navegador

Nada de esto está hecho hasta que se ve funcionando. Se prueba con
**PRISMAIA - VAKDOR**, nunca con Central.

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar la app**

Run: `npm run dev`
Entregarle a Leonardo el link del puerto que quedó libre.

- [ ] **Step 2: La prueba que más importa — que nada se rompió**

Entrar como director de PRISMAIA - VAKDOR **sin cargar nada de material**, generar un
ACM completo y abrir la ficha.
Expected: la ficha sale **idéntica** a como salía antes. Portada, entorno, comparables,
matriz, pirámide, conclusiones, contacto. Ninguna hoja nueva, ningún hueco.

- [ ] **Step 3: La segunda prueba más cara — que guardar no borra la marca**

Anotar los colores y el logo que tiene la agencia en Marketing IA → Configuración.
Ir a ACM → Configuración, escribir cualquier cosa en una sección, guardar. Volver a
Marketing IA → Configuración.
Expected: los colores, el logo y el aviso legal **siguen exactamente igual**. Si se
borraron, el merge del servidor falló y no se sigue hasta arreglarlo.

- [ ] **Step 4: Cargar los tres PDF de Central y repartir**

ACM → Configuración → Material para el ACM. Subir los tres archivos de
`C:\Users\LENOVO\Downloads`: `20 PASOS 2025 - central.pdf`,
`Nueva bienvenida Experiencia CentralRE Leading LPI.pdf`, `Our Company 2025 - Central.pdf`.
Tocar **Volver a leer con IA**.
Expected: las cuatro secciones traen una propuesta. Verificar que el texto está en
**español** (el material de "Our Company" está en inglés) y que ninguna sección afirma
algo que los PDF no dicen.

- [ ] **Step 5: Verificar que no inventa**

Quitar los tres archivos, subir **solo** `Our Company 2025 - Central.pdf` (que no habla
de cómo preparar la casa) y volver a leer.
Expected: `como_preparar` vuelve **vacía**, con el cartel "No encontró material para esta
sección". Si la rellenó, la regla del prompt falló y hay que corregirla antes de seguir.

- [ ] **Step 6: Verificar que un reemplazo no pisa lo corregido a mano**

Aceptar las cuatro propuestas, guardar. Editar a mano "Cómo comercializamos" y escribir
una frase reconocible ("Prueba de Leonardo, no borrar"). Guardar. Usar **Reemplazar** en
uno de los archivos, tocar **Volver a leer** y aceptar **solo** "Quiénes somos".
Expected: "Cómo comercializamos" sigue diciendo "Prueba de Leonardo, no borrar".

- [ ] **Step 7: Verificar que quitar un archivo no borra el texto**

Quitar de la lista el archivo que dio origen a "Quiénes somos" y guardar.
Expected: la sección "Quiénes somos" sigue con su texto. El texto aprobado vive por su
cuenta, independiente del archivo del que salió.

- [ ] **Step 8: Verificar "Acomodar con IA"**

Escribir a mano en "El rol de cada uno" un texto desprolijo y tocar **Acomodar con IA**.
Expected: lo devuelve ordenado, **sin agregar** servicios ni datos que no estaban. Tocar
*Descartar* y verificar que el texto original queda intacto.

- [ ] **Step 9: Ver la ficha con material cargado**

Generar un ACM nuevo y abrir la ficha.
Expected: "Quiénes somos" es la hoja 2, antes del precio. El bloque de roles aparece
debajo de la Pirámide. "Cómo comercializamos" y "Cómo preparar" salen al final. Todo con
los colores y el logo de la agencia.

- [ ] **Step 10: Verificar en el celular**

Con emulación de móvil en el navegador, recorrer la ficha entera y también la solapa de
configuración.
Expected: se lee cómodo, no hay scroll horizontal, y el texto de las hojas nuevas no se
desborda.

- [ ] **Step 11: Verificar que una ficha vieja no cambia**

Abrir el link del ACM generado en el Step 2 (sin material).
Expected: sigue sin las hojas nuevas, aunque ahora la agencia tenga material cargado. El
snapshot está congelado.

- [ ] **Step 12: Verificar el permiso**

Entrar con una cuenta de asesor (nunca la de un asesor real: cuenta descartable) y abrir
su módulo de ACM.
Expected: **no ve la solapa Configuración**. Y llamando al endpoint a mano
(`PUT /api/marketing-ia/acm-material`), recibe 403.

- [ ] **Step 13: Mostrarle el resultado a Leonardo y esperar su OK**

No se mergea nada sin su OK.

---

## Verificación final

- [ ] `npx vitest run` en verde
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run build` sin errores
- [ ] Los pasos 2, 3, 5, 6 y 11 de la Task 10 verificados **en el navegador**, no en teoría
- [ ] OK explícito de Leonardo antes del merge a `main`
