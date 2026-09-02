# Etapa C — Detectar la plantilla y cambiarle la versión

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el director cambie la versión de un documento una sola vez y el sistema rehaga el de cada asesor conservando sus datos, en vez de rehacer N archivos a mano.

**Architecture:** La plantilla no se adivina: se **mide** comparando varios documentos del mismo tipo entre sí — lo idéntico en todos es el texto fijo, lo que difiere es el dato personalizado. La IA solo le pone nombre a cada hueco; si falla, la detección igual funciona con nombres genéricos. Toda la mecánica del `.docx` vive en un módulo puro con tests, porque es la parte que puede romper en silencio. Y nada se publica sin verificarse: antes de dar una plantilla por buena, el sistema la rellena con los datos de cada asesor y compara contra su archivo original.

**Tech Stack:** Next.js App Router, Supabase, vitest, `docxtemplater` + `pizzip` (manipular el .docx), `diff` (alinear textos), `mammoth` (extraer texto), Gemini vía `consumeAiCredits`.

**Spec:** `docs/superpowers/specs/2026-08-24-asesores-celular-y-documentos-design.md` — sección **7** completa, **8.2**, **8.3** y **8.7**.

## Global Constraints

- **Rama y worktree:** `PRISMA-SYSTEM-asesores-docs`, rama `feat/asesores-plantillas-versionado`, salida de `main` @ 88c0286 (que ya trae las Etapas A y B). Nunca `git add -A`.
- **El DDL contra producción necesita el OK explícito de Leonardo.** Las migraciones del repo no se aplican solas.
- **Nunca correr `npm run build` con el servidor de desarrollo levantado.** Se pisan la carpeta `.next` y lo dejan roto. Bajar el servidor primero.
- **Nada se publica sin verificarse.** Si el documento regenerado de un asesor no da idéntico a su original, ese asesor queda en rojo y **la plantilla entera no se publica**.
- **Un documento nunca sale con un dato faltante.** Ver el hallazgo 3 de la sonda: si falta un valor, la librería escribe la palabra `undefined` en el documento. Hay que configurarlo y validar antes de generar.
- **Asesores pausados o desvinculados quedan fuera** de la detección y del versionado. Sus documentos no se tocan.
- **Se prueba con PRISMAIA - VAKDOR.** Central no se toca.
- **Tests:** vitest, solo `lib/**/*.test.ts`. Comando `npm test`. La base al empezar son 352 tests en 32 archivos más 88 de node.

## Contexto verificado con una sonda antes de escribir este plan

Se probó el mecanismo del `.docx` contra las librerías reales el 2026-08-26, con el caso difícil armado a propósito: un párrafo con un título en negrita y el nombre partido en tres pedazos, que es como Word guarda el texto.

**Resultados:**

| Pregunta | Respuesta |
|---|---|
| ¿El reemplazo directo sobre el XML encuentra un texto partido? | **No.** Solo agarra lo que Word dejó entero |
| ¿Se puede reemplazar tocando solo los pedazos que el texto atraviesa? | **Sí** |
| ¿Se conserva el formato del resto del párrafo? | **Sí** — la negrita del título sobrevivió |
| ¿El viaje de ida y vuelta da idéntico? | **Sí** |
| ¿`docxtemplater` sabe leer un hueco que Word partió? | **Sí.** Junta los pedazos solo |

**Tres correcciones al spec que salieron de la sonda y que este plan ya incorpora:**

1. **Los delimitadores hay que configurarlos.** `docxtemplater` usa `{` y `}` por defecto. Con la notación `{{ }}` del spec falla con *"Duplicate open tag"*. Va `delimiters: { start: "{{", end: "}}" }`.
2. **No se aplana el párrafo.** El primer intento juntaba todo el párrafo en un solo pedazo y **perdía la negrita**. Hay que tocar el mínimo: solo los pedazos que el texto buscado atraviesa.
3. **Un dato faltante escribe la palabra `undefined` en el documento.** No falla ni deja el hueco vacío: sale un contrato que dice *"tu CUIT es undefined"*. Hay que pasar un `nullGetter` y además validar antes de generar.

## Lo que esta etapa NO hace

- **No genera PDF.** Sigue siendo `.docx`, por la decisión de la Etapa A (el PDF idéntico al Word exige LibreOffice en un servidor).
- **No permite renombrar ni borrar un tipo de documento** más allá de lo que agregue la solapa nueva.
- No toca `components/documentos/OfficialDocsSection.tsx`.

---

## Punto de control a mitad de camino

Las tareas 1 a 6 entregan **la detección completa**: el director junta 3 documentos, el sistema saca la plantilla, él la revisa y confirma, y el sistema verifica que cada asesor se regenera idéntico. Eso ya es útil y ya es donde vive todo el riesgo.

Las tareas 7 y 8 son el versionado propiamente dicho, que es más mecánico una vez que la 6 funciona.

**Después de la tarea 6 se para y se le muestra a Leonardo**, aunque el bucle de subagentes no lo pida. Si la detección no le convence sobre documentos reales, el versionado se construiría sobre algo que no sirve.

---

## Por qué las tareas 1 a 3 traen el código entero y las 4 a 7 no

Las tres primeras son el **núcleo que puede fallar en silencio**: la mecánica del `.docx`, la comparación de textos y el esquema. Ahí el código va completo y con tests que fallan si alguien lo rompe, porque un error ahí no se ve hasta que un contrato sale mal.

De la 4 en adelante son endpoints y pantallas que siguen patrones ya andando en este repo (`app/api/contratos/convert-template/route.ts` para la IA con créditos, `components/asesor-docs/DocumentosDelAsesor.tsx` para la interfaz). Copiar código especulativo al plan lo haría divergir de esos ejemplos vivos. Lo que sí queda fijado en cada una es la lista de **cosas que no se negocian**, que es lo que la revisión va a verificar una por una.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/plantillas/docx.ts` | **Crear.** Toda la mecánica del .docx: leer texto, poner huecos sin romper formato, rellenar |
| `lib/plantillas/docx.test.ts` | **Crear.** Los tests de lo anterior, incluido el caso del texto partido |
| `lib/plantillas/deteccion.ts` | **Crear.** Comparar N textos y decir qué tramos son variables |
| `lib/plantillas/deteccion.test.ts` | **Crear.** Los tests de lo anterior |
| `supabase/migrations/20260827120000_plantillas_versionado.sql` | **Crear.** `version_actual` + la tabla de versiones |
| `app/api/asesor-docs/detectar-plantilla/route.ts` | **Crear.** Junta los documentos, corre la detección, la IA nombra. **No guarda nada** |
| `app/api/asesor-docs/confirmar-plantilla/route.ts` | **Crear.** Guarda la versión 1, los datos de cada asesor, y corre la verificación |
| `app/api/asesor-docs/aplicar-version/route.ts` | **Crear.** Regenera el documento de UN asesor con la versión nueva |
| `components/asesor-docs/PlantillasTab.tsx` | **Crear.** La solapa: lista de plantillas, estados, disparadores |
| `components/asesor-docs/RevisionPlantilla.tsx` | **Crear.** La pantalla de revisión obligatoria |
| `app/director/asesores/page.tsx` | **Modificar.** Suma la solapa "Plantillas" al nivel de la página |

---

## Task 1: La mecánica del .docx, pura y con tests

Es la pieza que puede romper en silencio, así que va primero, aislada y probada. Todo lo demás la consume.

**Files:**
- Create: `lib/plantillas/docx.ts`
- Test: `lib/plantillas/docx.test.ts`

**Interfaces:**
- Produces:
  - `DELIMITADORES` — la config de docxtemplater con `{{ }}`
  - `textoDeDocx(buffer: Buffer): Promise<string>` — el texto plano, vía mammoth
  - `ponerHueco(xmlParrafo: string, buscado: string, hueco: string): { xml: string; ok: boolean }`
  - `ponerHuecosEnDocx(zip: PizZip, reemplazos: Array<{ buscado: string; hueco: string }>): { zip: PizZip; puestos: string[]; faltantes: string[] }`
  - `rellenarDocx(zip: PizZip, datos: Record<string, string>): PizZip`
  - `huecosDe(zip: PizZip): string[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/plantillas/docx.test.ts`. Los helpers de abajo arman un `.docx` en memoria, **incluido el caso donde Word parte el texto**, que es el que importa:

```ts
import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { ponerHueco, ponerHuecosEnDocx, rellenarDocx, huecosDe } from "./docx";

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** Un <w:r>: un pedazo de texto con su formato. */
const run = (texto: string, formato = "") =>
  `<w:r>${formato}<w:t xml:space="preserve">${texto}</w:t></w:r>`;
const NEGRITA = `<w:rPr><w:b/></w:rPr>`;

function armarDocx(bodyXml: string): PizZip {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CT);
  zip.folder("_rels")!.file(".rels", RELS);
  zip.folder("word")!.file("document.xml", doc);
  return zip;
}

const xmlDe = (zip: PizZip) => zip.file("word/document.xml")!.asText();
const textoDe = (zip: PizZip) =>
  [...xmlDe(zip).matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("");

// El caso que importa: Word partió "Juan Pérez" en tres pedazos, y el párrafo
// tiene además un título en negrita que NO se puede perder.
const PARRAFO_PARTIDO =
  `<w:p>` +
  run("CLÁUSULA 1. ", NEGRITA) +
  run("El asesor ") +
  run("Juan ") +
  run("Pé") +
  run("rez") +
  run(" con CUIT ") +
  run("20-12345678-9") +
  run(" acuerda.") +
  `</w:p>`;

const TEXTO_ORIGINAL = "CLÁUSULA 1. El asesor Juan Pérez con CUIT 20-12345678-9 acuerda.";

describe("ponerHueco — el texto que Word partió", () => {
  it("encuentra y reemplaza un texto partido en varios pedazos", () => {
    const r = ponerHueco(PARRAFO_PARTIDO, "Juan Pérez", "{{NOMBRE}}");
    expect(r.ok).toBe(true);
    expect(r.xml).toContain("{{NOMBRE}}");
  });

  it("CONSERVA el formato del resto del párrafo", () => {
    // Si esto falla, el documento del asesor pierde negritas, títulos y tablas.
    const r = ponerHueco(PARRAFO_PARTIDO, "Juan Pérez", "{{NOMBRE}}");
    expect(r.xml).toContain("<w:b/>");
  });

  it("también reemplaza un texto que quedó entero", () => {
    const r = ponerHueco(PARRAFO_PARTIDO, "20-12345678-9", "{{CUIT}}");
    expect(r.ok).toBe(true);
    expect(r.xml).toContain("{{CUIT}}");
  });

  it("avisa cuando el texto no está, en vez de romper", () => {
    const r = ponerHueco(PARRAFO_PARTIDO, "Pedro Gómez", "{{NOMBRE}}");
    expect(r.ok).toBe(false);
    expect(r.xml).toBe(PARRAFO_PARTIDO);
  });
});

describe("el viaje de ida y vuelta", () => {
  it("rellenar con los MISMOS datos devuelve el documento original", () => {
    // Es la red de seguridad del spec §7.3: si esto no da idéntico, la
    // plantilla no se publica.
    const zip = armarDocx(PARRAFO_PARTIDO);
    const puesto = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "20-12345678-9", hueco: "{{CUIT}}" },
    ]);
    expect(puesto.faltantes).toEqual([]);
    const salida = rellenarDocx(puesto.zip, { NOMBRE: "Juan Pérez", CUIT: "20-12345678-9" });
    expect(textoDe(salida)).toBe(TEXTO_ORIGINAL);
  });

  it("rellenar con los datos de otro asesor da su documento, con el formato intacto", () => {
    const zip = armarDocx(PARRAFO_PARTIDO);
    const puesto = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "20-12345678-9", hueco: "{{CUIT}}" },
    ]);
    const salida = rellenarDocx(puesto.zip, { NOMBRE: "María González", CUIT: "27-98765432-1" });
    expect(textoDe(salida)).toBe(
      "CLÁUSULA 1. El asesor María González con CUIT 27-98765432-1 acuerda."
    );
    expect(xmlDe(salida)).toContain("<w:b/>");
  });
});

describe("un dato faltante NUNCA escribe 'undefined' en el documento", () => {
  it("deja el hueco vacío en vez de la palabra undefined", () => {
    // Medido con una sonda contra la librería real: sin configurar nada,
    // docxtemplater escribe literalmente "undefined" en el documento.
    // Un contrato que dice "tu CUIT es undefined" es peor que uno que no sale.
    const zip = armarDocx(`<w:p>${run("Hola {{NOMBRE}}, tu CUIT es {{CUIT}}.")}</w:p>`);
    const salida = rellenarDocx(zip, { NOMBRE: "Juan" });
    const texto = textoDe(salida);
    expect(texto).not.toContain("undefined");
    expect(texto).toBe("Hola Juan, tu CUIT es .");
  });
});

describe("huecosDe", () => {
  it("lista los huecos que tiene la plantilla", () => {
    const zip = armarDocx(`<w:p>${run("Hola {{NOMBRE}}, CUIT {{CUIT}}, zona {{ZONA}}.")}</w:p>`);
    expect(huecosDe(zip).sort()).toEqual(["CUIT", "NOMBRE", "ZONA"]);
  });

  it("encuentra un hueco aunque Word lo haya partido", () => {
    // Si el director escribe {{NOMBRE}} en Word, Word puede partirlo al guardar.
    const zip = armarDocx(`<w:p>${run("Hola {{NOM") + run("BRE}}, firmá.")}</w:p>`);
    expect(huecosDe(zip)).toEqual(["NOMBRE"]);
  });

  it("no repite un hueco que aparece dos veces", () => {
    const zip = armarDocx(`<w:p>${run("{{NOMBRE}} ... firma: {{NOMBRE}}")}</w:p>`);
    expect(huecosDe(zip)).toEqual(["NOMBRE"]);
  });
});

describe("ponerHuecosEnDocx", () => {
  it("informa cuáles pudo poner y cuáles no", () => {
    const zip = armarDocx(PARRAFO_PARTIDO);
    const r = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "NO ESTÁ EN EL DOCUMENTO", hueco: "{{FANTASMA}}" },
    ]);
    expect(r.puestos).toEqual(["{{NOMBRE}}"]);
    expect(r.faltantes).toEqual(["{{FANTASMA}}"]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx vitest run lib/plantillas/docx.test.ts
```

Esperado: FALLA con `Failed to resolve import "./docx"`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/plantillas/docx.ts`. La parte delicada —`ponerHueco`— **ya fue probada con una sonda** contra las librerías reales; el algoritmo es: ubicar el rango del texto buscado sobre el texto completo del párrafo, encontrar qué pedazos atraviesa, y reemplazar **solo esos**, conservando el formato del primero y devolviendo el prefijo y el sufijo que sobran.

```ts
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import mammoth from "mammoth"

/**
 * docxtemplater usa { } por defecto. El diseño usa {{ }}, y sin esta config
 * falla con "Duplicate open tag": lee {{NOMBRE}} como { + {NOMBRE} + }.
 * Medido con una sonda antes de escribir esto.
 */
export const DELIMITADORES = { start: "{{", end: "}}" } as const

const OPCIONES = {
  delimiters: DELIMITADORES,
  paragraphLoop: true,
  linebreaks: true,
  /**
   * Sin esto, un dato faltante escribe la palabra "undefined" DENTRO del
   * documento — no falla, no deja el hueco vacío. Un contrato que dice
   * "tu CUIT es undefined" es peor que uno que no sale.
   */
  nullGetter: () => "",
}

/** El texto plano del documento, para comparar y para detectar. */
export async function textoDeDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer })
  return value
}

const RE_RUN = /<w:r>[\s\S]*?<\/w:r>/g
const RE_TEXTO = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Reemplaza `buscado` por `hueco` dentro de UN párrafo.
 *
 * Word parte el texto en pedazos (<w:r>) cada vez que cambia el formato, así
 * que "Juan Pérez" puede estar guardado como "Juan ", "Pé", "rez". Por eso no
 * sirve buscar sobre el XML.
 *
 * Se toca SOLO los pedazos que el texto buscado atraviesa. Aplanar el párrafo
 * entero también encontraría el texto, pero borraría negritas y títulos del
 * resto del párrafo — probado con una sonda.
 */
export function ponerHueco(
  xmlParrafo: string,
  buscado: string,
  hueco: string
): { xml: string; ok: boolean } {
  const runs = [...xmlParrafo.matchAll(RE_RUN)].map((m) => ({
    inicio: m.index!,
    fin: m.index! + m[0].length,
    xml: m[0],
    texto: [...m[0].matchAll(RE_TEXTO)].map((t) => t[1]).join(""),
  }))
  if (!runs.length) return { xml: xmlParrafo, ok: false }

  const completo = runs.map((r) => r.texto).join("")
  const at = completo.indexOf(buscado)
  if (at === -1) return { xml: xmlParrafo, ok: false }

  const hasta = at + buscado.length
  let acum = 0
  let primero = -1
  let ultimo = -1
  let inicioDelPrimero = 0
  for (let i = 0; i < runs.length; i++) {
    const desde = acum
    const finRun = acum + runs[i].texto.length
    if (primero === -1 && finRun > at) {
      primero = i
      inicioDelPrimero = desde
    }
    if (desde < hasta) ultimo = i
    acum = finRun
  }

  const finDelUltimo = runs.slice(0, ultimo + 1).reduce((s, r) => s + r.texto.length, 0)
  const prefijo = completo.slice(inicioDelPrimero, at)
  const sufijo = completo.slice(hasta, finDelUltimo)

  const formato = (runs[primero].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0]
  const run = (t: string) => `<w:r>${formato}<w:t xml:space="preserve">${escapar(t)}</w:t></w:r>`
  const reemplazo =
    (prefijo ? run(prefijo) : "") +
    `<w:r>${formato}<w:t xml:space="preserve">${hueco}</w:t></w:r>` +
    (sufijo ? run(sufijo) : "")

  return {
    xml: xmlParrafo.slice(0, runs[primero].inicio) + reemplazo + xmlParrafo.slice(runs[ultimo].fin),
    ok: true,
  }
}

/** Aplica varios reemplazos sobre todo el documento, párrafo por párrafo. */
export function ponerHuecosEnDocx(
  zip: PizZip,
  reemplazos: Array<{ buscado: string; hueco: string }>
): { zip: PizZip; puestos: string[]; faltantes: string[] } {
  let xml = zip.file("word/document.xml")!.asText()
  const puestos: string[] = []
  const faltantes: string[] = []

  // Los más largos primero: si un valor contiene a otro, hay que reemplazar
  // el grande antes, o el chico lo parte por la mitad.
  const orden = [...reemplazos].sort((a, b) => b.buscado.length - a.buscado.length)

  for (const { buscado, hueco } of orden) {
    let encontrado = false
    xml = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (parrafo) => {
      if (encontrado) return parrafo
      const r = ponerHueco(parrafo, buscado, hueco)
      if (r.ok) encontrado = true
      return r.xml
    })
    ;(encontrado ? puestos : faltantes).push(hueco)
  }

  const salida = new PizZip(zip.generate({ type: "nodebuffer" }))
  salida.file("word/document.xml", xml)
  return { zip: salida, puestos, faltantes }
}

/** Rellena la plantilla con los datos de un asesor. */
export function rellenarDocx(zip: PizZip, datos: Record<string, string>): PizZip {
  const copia = new PizZip(zip.generate({ type: "nodebuffer" }))
  const d = new Docxtemplater(copia, OPCIONES)
  d.render(datos)
  return d.getZip()
}

/** Los nombres de los huecos que tiene la plantilla, sin repetir. */
export function huecosDe(zip: PizZip): string[] {
  const xml = zip.file("word/document.xml")!.asText()
  // Se saca el marcado para que un hueco partido por Word se lea entero.
  const texto = [...xml.matchAll(RE_TEXTO)].map((m) => m[1]).join("")
  const nombres = [...texto.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(nombres)]
}
```

- [ ] **Step 4: Correr los tests**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx vitest run lib/plantillas/docx.test.ts
```

Esperado: los 11 en verde.

- [ ] **Step 5: La suite completa**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npm test
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs"
git add lib/plantillas/docx.ts lib/plantillas/docx.test.ts
git commit -m "feat(plantillas): la mecánica del .docx, con el caso del texto partido cubierto

Word parte el texto en pedazos cada vez que cambia el formato, así que un
'Juan Pérez' puede estar guardado en tres partes y buscarlo sobre el XML no lo
encuentra. Se toca solo los pedazos que el texto atraviesa: aplanar el párrafo
entero también lo encontraría, pero borraría las negritas del resto.

Dos cosas medidas con una sonda antes de escribir esto: los delimitadores hay
que configurarlos a {{ }} porque la librería usa { } por defecto, y sin
nullGetter un dato faltante escribe la palabra 'undefined' DENTRO del documento.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Comparar N documentos y decir qué cambia

El corazón del principio rector: lo idéntico en todos es texto fijo, lo que difiere es el dato de cada uno.

**Files:**
- Create: `lib/plantillas/deteccion.ts`
- Test: `lib/plantillas/deteccion.test.ts`

**Interfaces:**
- Consumes: el paquete `diff`.
- Produces:
  - `type Hueco = { indice: number; contexto: string; valores: Record<string, string> }` — `valores` va del id del asesor al texto que tiene ahí
  - `detectarHuecos(docs: Array<{ advisorId: string; texto: string }>): { huecos: Hueco[]; textoBase: string; advertencias: string[] }`
  - `MINIMO_DOCUMENTOS = 3`

**Cómo funciona:** se toma el primer documento como base y se lo compara contra cada uno de los demás. Un tramo es **hueco** si difiere en al menos uno. Para cada hueco se guarda qué texto tiene cada asesor ahí, y un poco del texto de alrededor, que es lo que después va a leer la IA para ponerle nombre.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/plantillas/deteccion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectarHuecos, MINIMO_DOCUMENTOS } from "./deteccion";

const doc = (advisorId: string, texto: string) => ({ advisorId, texto });

// Tres contratos iguales salvo el nombre, el CUIT y el porcentaje.
const TRES = [
  doc("a", "Contrato con Juan Pérez, CUIT 20-11111111-1, comisión del 30%. Fin."),
  doc("b", "Contrato con María González, CUIT 27-22222222-2, comisión del 35%. Fin."),
  doc("c", "Contrato con Pedro Gómez, CUIT 20-33333333-3, comisión del 40%. Fin."),
];

describe("detectarHuecos", () => {
  it("encuentra los tramos que cambian entre asesores", () => {
    const r = detectarHuecos(TRES);
    const textos = r.huecos.map((h) => h.valores.a);
    expect(textos).toContain("Juan Pérez");
    expect(textos.some((t) => t.includes("20-11111111-1"))).toBe(true);
    expect(textos.some((t) => t.includes("30"))).toBe(true);
  });

  it("guarda el valor de CADA asesor en cada hueco", () => {
    const r = detectarHuecos(TRES);
    const nombre = r.huecos.find((h) => h.valores.a === "Juan Pérez");
    expect(nombre).toBeDefined();
    expect(nombre!.valores.b).toBe("María González");
    expect(nombre!.valores.c).toBe("Pedro Gómez");
  });

  it("NO marca como hueco lo que es igual en todos", () => {
    const r = detectarHuecos(TRES);
    for (const h of r.huecos) {
      expect(h.valores.a).not.toContain("Contrato con");
      expect(h.valores.a).not.toBe("Fin.");
    }
  });

  it("guarda contexto de alrededor, que es lo que después lee la IA", () => {
    const r = detectarHuecos(TRES);
    expect(r.huecos.every((h) => h.contexto.length > 0)).toBe(true);
  });

  it("avisa si hay menos de tres documentos, en vez de inventar", () => {
    // Con dos no se puede medir: cualquier diferencia parece un hueco.
    const r = detectarHuecos(TRES.slice(0, 2));
    expect(r.advertencias.some((a) => a.includes(String(MINIMO_DOCUMENTOS)))).toBe(true);
  });

  it("con documentos idénticos no encuentra ningún hueco", () => {
    const iguales = [doc("a", "Texto fijo."), doc("b", "Texto fijo."), doc("c", "Texto fijo.")];
    expect(detectarHuecos(iguales).huecos).toEqual([]);
  });

  it("no revienta si un documento está vacío: lo avisa", () => {
    const r = detectarHuecos([doc("a", "Hola Juan."), doc("b", ""), doc("c", "Hola Pedro.")]);
    expect(r.advertencias.length).toBeGreaterThan(0);
  });

  it("los huecos salen en el orden en que aparecen en el documento", () => {
    const r = detectarHuecos(TRES);
    expect(r.huecos.map((h) => h.indice)).toEqual([...r.huecos.map((h) => h.indice)].sort((x, y) => x - y));
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-asesores-docs" && npx vitest run lib/plantillas/deteccion.test.ts
```

- [ ] **Step 3: Implementar**

Crear `lib/plantillas/deteccion.ts`. Usá `diffWords` del paquete `diff` comparando el texto base contra cada uno de los demás; juntá los tramos que difieren en al menos una comparación; para cada tramo guardá el valor de cada asesor y unos 60 caracteres de contexto alrededor.

**Decisiones que no se negocian:**
- Con menos de `MINIMO_DOCUMENTOS` (3) **no se falla**: se devuelven los huecos igual pero con una advertencia clara. Es el llamador el que decide qué hacer.
- Un documento vacío o ilegible **no rompe la detección**: se lo excluye y se avisa.
- El orden de los huecos es el del documento, no el del hallazgo.

- [ ] **Step 4-6: Tests, suite, commit** — mismo formato que la Task 1.

---

## Task 3: La migración del versionado

**Files:**
- Create: `supabase/migrations/20260827120000_plantillas_versionado.sql`

**Qué crea:**

```sql
-- advisor_doc_templates suma a qué versión apunta hoy.
ALTER TABLE public.advisor_doc_templates
  ADD COLUMN IF NOT EXISTS version_actual integer;

-- Cada versión de la plantilla. Las viejas NO se borran nunca: de acá sale
-- el volver atrás.
CREATE TABLE IF NOT EXISTS public.advisor_doc_template_versions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   uuid NOT NULL REFERENCES public.advisor_doc_templates(id) ON DELETE CASCADE,
    agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    version       integer NOT NULL,
    docx_path     text NOT NULL,        -- el molde con los {{huecos}}
    campos_schema jsonb NOT NULL,       -- [{ nombre, label, orden }]
    origen        text NOT NULL DEFAULT 'detectada' CHECK (origen IN ('detectada','subida')),
    notas         text,
    created_by    uuid REFERENCES public.profiles(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS advisor_doc_template_versions_unica
    ON public.advisor_doc_template_versions (template_id, version);
CREATE INDEX IF NOT EXISTS advisor_doc_template_versions_agency_idx
    ON public.advisor_doc_template_versions (agency_id);

ALTER TABLE public.advisor_doc_template_versions ENABLE ROW LEVEL SECURITY;

-- Solo el director de la agencia. El asesor nunca ve las versiones (spec §8.7).
DROP POLICY IF EXISTS "Directores gestionan versiones de plantilla" ON public.advisor_doc_template_versions;
CREATE POLICY "Directores gestionan versiones de plantilla"
  ON public.advisor_doc_template_versions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_doc_template_versions.agency_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_doc_template_versions.agency_id
  ));
```

**Nota:** acá el `WITH CHECK` va **explícito**, a diferencia de las políticas de la Etapa B. Postgres lo deriva solo del `USING`, pero escribirlo es más legible y evita que alguien cambie el `USING` sin acordarse. Es el hallazgo menor que quedó diferido en la Etapa B.

- [ ] **Step 1: Escribir la migración** (arriba).
- [ ] **Step 2: PARAR y pedir el OK de Leonardo.** Qué cambia: una columna nullable y una tabla nueva vacía. Qué no: nada existente. Cómo se deshace: `DROP TABLE public.advisor_doc_template_versions;` y `ALTER TABLE public.advisor_doc_templates DROP COLUMN version_actual;`
- [ ] **Step 3: Aplicar por Management API** (solo con el OK).
- [ ] **Step 4: Verificar** contra producción: la columna, la tabla, RLS activo, y **una sola** política.
- [ ] **Step 5: Commit.**

---

## Task 4: El endpoint que detecta la plantilla

**Files:**
- Create: `app/api/asesor-docs/detectar-plantilla/route.ts`

**Qué hace, en orden:**
1. `requireTenant()` y verificar que quien llama es **director** de esa agencia.
2. Traer los `advisor_documents` de ese `template_id`, **excluyendo asesores pausados o desvinculados**.
3. Bajar cada `.docx` de Storage y sacarle el texto con `textoDeDocx`.
4. Correr `detectarHuecos`.
5. **Pedirle a la IA que le ponga nombre a cada hueco**, mandándole solo el contexto y los valores — nunca el documento entero. Vía `consumeAiCredits("plantillas_asesor", 1, ...)`, siguiendo el patrón de `app/api/contratos/convert-template/route.ts`.
6. **Si la IA falla, NO falla la detección:** los huecos salen como `CAMPO_1`, `CAMPO_2`. Es la regla del spec §7.1 y hay que respetarla literalmente.
7. Devolver la propuesta: los huecos con su nombre, su contexto y el valor de cada asesor. **No guarda absolutamente nada.**

**Constraints:**
- El crédito se consume **una vez por detección**, no por asesor.
- Un documento que no se pueda leer no tumba la detección: se excluye y se informa.
- Si quedan menos de 3 documentos legibles, se devuelve la advertencia y se deja decidir al director.

- [ ] Pasos: escribir, compilar, commit. **No se prueba con la app corriendo** — se prueba en la Task 6, cuando haya pantalla.

---

## Task 5: La solapa "Plantillas"

**Files:**
- Create: `components/asesor-docs/PlantillasTab.tsx`
- Modify: `app/director/asesores/page.tsx`

Solapa nueva **al nivel de la página** (junto a la lista de asesores), no dentro del panel de un asesor.

**Qué muestra:** una fila por plantilla con nombre, versión vigente, cuántos asesores la usan, cuántos están en rojo, y el estado (`borrador` / `activa`). Un botón **"Detectar plantilla"** habilitado solo cuando hay 3 o más documentos de ese tipo, con el motivo escrito cuando está deshabilitado.

**Cuidado con el alto:** la página ya tiene el patrón resuelto. Seguir el mismo que usa el panel del asesor: contenedor en columna, barra fija, contenido con scroll propio. **Cero alturas en píxeles.**

**Lo que no se negocia:**
1. El botón de detectar está **deshabilitado** con menos de 3 documentos, y dice **por qué** — no se puede quedar mudo.
2. Distinguir "no hay plantillas" de "falló la consulta", con estados visualmente distintos y un botón de reintentar. Es el mismo error que ya costó una ronda en la Etapa B.
3. La solapa no rompe la lista de asesores que ya está: se agrega al lado, no la reemplaza.
4. Una plantilla en `borrador` se ve distinta de una `activa`, y se entiende qué significa cada una sin tener que preguntarle a nadie.

- [ ] Pasos: escribir, compilar, probar en navegador (lista, estados, botón deshabilitado con su motivo), commit.

---

## Task 6: Revisar y confirmar la plantilla

**Files:**
- Create: `components/asesor-docs/RevisionPlantilla.tsx`
- Create: `app/api/asesor-docs/confirmar-plantilla/route.ts`

**La pantalla (spec §7.2):** no salteable. Muestra la plantilla con los huecos marcados y una tabla de qué valor le extrajo a cada asesor. El director puede **renombrar** un hueco, **borrar** uno mal detectado, o **marcar** uno que se pasó. Nada se guarda hasta que confirma.

**El endpoint de confirmar hace, en orden:**
1. Tomar el `.docx` de uno de los asesores como **molde** y meterle los huecos con `ponerHuecosEnDocx`.
2. Guardarlo en Storage y crear la versión 1.
3. Para **cada** asesor, guardar su `form_data`.
4. **La verificación (spec §7.3):** rellenar la plantilla con los datos de cada asesor, sacarle el texto, y compararlo contra el texto de su archivo original.
   - Idénticos → `estado = 'ok'`.
   - Distintos → `estado = 'revisar'` con la observación, y **la plantilla NO pasa a `activa`**.
5. Devolver el resumen: cuántos quedaron bien y cuáles en rojo, con el motivo.

**Esto es lo que no se puede romper:** si aunque sea un asesor queda en rojo, la plantilla se guarda como `borrador` y no se usa para nada. El director ve exactamente quién falló y por qué.

- [ ] Pasos: escribir, compilar, **probar con 3 documentos reales**, commit.

### ⏸ PUNTO DE CONTROL

Acá se para y se le muestra a Leonardo, con documentos de verdad. Si la detección no le sirve, el versionado no se construye encima.

---

## Task 7: Subir una versión nueva y aplicarla

**Files:**
- Create: `app/api/asesor-docs/aplicar-version/route.ts`
- Modify: `components/asesor-docs/PlantillasTab.tsx`

**El flujo (spec §7.4):**
1. El director elige la plantilla y sube el `.docx` de la versión nueva, **ya completado con los datos de UN asesor que el sistema ya tiene**, e indica cuál. Un archivo genérico o con los huecos en blanco **se rechaza** con ese mensaje: es lo que hace la detección determinista en vez de adivinada.
2. El sistema busca en el archivo nuevo los valores conocidos de ese asesor y pone los huecos ahí.
3. **Si aparece un hueco que antes no existía**, avisa: ese campo queda vacío y hay que completarlo por asesor. Esos asesores quedan en `pendiente` y **siguen con la versión anterior**.
4. **Si un hueco viejo desapareció**, también avisa — pero el dato **no se borra** de `form_data`, para que volver atrás siga funcionando.
5. **Vista previa** del documento de un asesor real con la versión nueva.
6. Recién con el OK explícito se aplica.

**Cómo corre (spec §7.5):** de a un asesor por vez, con barra de progreso y estado por fila. Un asesor que falla no voltea a los otros. El botón queda bloqueado mientras corre. **La versión anterior no se borra nunca.**

- [ ] Pasos: escribir, compilar, probar el camino completo, commit.

---

## Task 8: La prueba completa y la documentación

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run lint` y el cruce contra los archivos de la rama.
- [ ] **Step 2:** `npm run build` **con el servidor bajado**. Un fallo acá es bloqueante.
- [ ] **Step 3:** El recorrido completo, en escritorio y celular.
- [ ] **Step 4:** La bitácora.
- [ ] **Step 5:** Las guías del director y del asesor, **sin tecnicismos**.
- [ ] **Step 6:** Commit. **No se mergea sin el OK de Leonardo después de probarlo él.**
