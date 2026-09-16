# Creador de anuncios: texto para Meta y placa con la foto real — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el texto del post salga en párrafos cortos con emojis listos para pegar en Meta, y que la placa de una propiedad de cartera muestre **la foto real de esa propiedad** en vez de una inventada por IA.

**Architecture:** El texto se arregla cambiando el contrato con el modelo: en vez de pedirle un `desarrollo` suelto le pedimos `parrafos` (una lista que el servidor puede contar y sellar), y el servidor los pega con renglón en blanco en el mismo campo `desarrollo` de siempre, así nada de lo que ya existe se rompe. La placa se arma **sin IA**: la foto real de Tokko va arriba intacta, y abajo un panel de marca que el código dibuja con la misma maquinaria de contornos de Inter que ya usa el aviso legal. El alto del panel se **mide** a partir de su contenido; no se fija.

**Tech Stack:** Next.js (App Router), TypeScript, vitest 2.1.9, sharp 0.35, opentype.js 2.0, Supabase, Gemini (solo en el camino sin foto).

**Spec:** `docs/superpowers/specs/2026-09-16-creador-anuncios-texto-y-placa-design.md`

**Worktree:** `C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-anuncios`, rama `feat/anuncios-texto-y-placa` (creada desde `main`).

## Global Constraints

- **EN LA IMAGEN NO VA NINGÚN EMOJI.** Dicho por Leonardo el 16-sep-2026. Ni en el título, ni en la bajada, ni en las casillas de datos. Los emojis existen solo en el texto del post que se pega en Meta.
- **La foto no se toca.** La zona de foto de la placa tiene que ser bit a bit la foto de Tokko (salvo el reescalado y el recorte). Nada de IA sobre ella.
- **El cuerpo de letra que se le pasa a `contornosDeTexto` TIENE que ser un entero.** Con un cuerpo fraccionario opentype.js devuelve coordenadas NaN y el texto se corta a la mitad sin ningún error. Está documentado en `lib/tipografia/contornos.ts`.
- **Un renglón por lienzo al dibujar.** Un solo `<path>` grande se rasteriza incompleto sin avisar (841 letras → se dibujaban 45). Está documentado en `lib/marketing-ia/aviso-legal.ts`.
- **La forma de `copy_drafts.content` sigue siendo `{hook, desarrollo, cta}`.** Los borradores viejos se tienen que seguir leyendo igual.
- **Nunca `git add -A`.** Cada commit lista sus archivos con ruta explícita.
- Correr las pruebas con `npx vitest run <ruta>` (el `npm test` completo también corre `lib/mapa`).
- **El worktree no trae `.env` ni `node_modules`**: hay que resolverlos antes de correr nada (Task 0).

---

### Task 0: Dejar el worktree usable

**Files:**
- Create: `.env` (copiado, no versionado)

- [ ] **Step 1: Copiar el `.env` y las dependencias desde el repo principal**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-anuncios"
cp "../PRISMA-SYSTEM/.env" .env
npm install
```

- [ ] **Step 2: Comprobar que las pruebas que ya existen corren**

Run: `npx vitest run lib/marketing-ia/formatos.test.ts`
Expected: PASS. Si falla acá, es el entorno, no el código nuevo.

No hay commit en esta tarea: `.env` y `node_modules` están gitignoreados.

---

### Task 1: El módulo de párrafos y emojis

Todo lo que el servidor le sella al modelo, en un solo lugar y con pruebas. No toca ninguna ruta todavía.

**Files:**
- Create: `lib/marketing-ia/parrafos.ts`
- Test: `lib/marketing-ia/parrafos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `sinEmojis(texto: string): string`
  - `unEmojiPorParrafo(parrafo: string): string`
  - `armarDesarrollo(parrafos: unknown): string`
  - `contarParrafos(desarrollo: string): number`

- [ ] **Step 1: Write the failing test**

Crear `lib/marketing-ia/parrafos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sinEmojis, unEmojiPorParrafo, armarDesarrollo, contarParrafos } from "./parrafos";

describe("sinEmojis", () => {
  it("saca los emojis y no deja doble espacio", () => {
    // La Inter incrustada tiene 515 glifos y devuelve .notdef para cualquier emoji:
    // si uno llega al titulo de la placa, se dibuja como nada y nadie se entera.
    expect(sinEmojis("Belgrano lidera 🏡 la demanda 🔑")).toBe("Belgrano lidera la demanda");
  });

  it("no toca los acentos, la enie ni los simbolos que Inter si tiene", () => {
    expect(sinEmojis("Departamento de 45 m² en Núñez — USD 130.000")).toBe(
      "Departamento de 45 m² en Núñez — USD 130.000"
    );
  });

  it("un texto sin emojis vuelve igual", () => {
    expect(sinEmojis("Los números no mienten")).toBe("Los números no mienten");
  });
});

describe("unEmojiPorParrafo", () => {
  it("deja el ultimo emoji, que es el que va al final", () => {
    expect(unEmojiPorParrafo("🏡 Tu próxima casa te espera 🔑")).toBe("Tu próxima casa te espera 🔑");
  });

  it("deja en paz al parrafo que ya tiene uno solo", () => {
    expect(unEmojiPorParrafo("Tu próxima casa te espera 🔑")).toBe("Tu próxima casa te espera 🔑");
  });

  it("deja en paz al parrafo que no tiene ninguno", () => {
    expect(unEmojiPorParrafo("Tu próxima casa te espera")).toBe("Tu próxima casa te espera");
  });

  it("de tres emojis deja uno", () => {
    const r = unEmojiPorParrafo("✨ Mirá 🏡 esto ⚠️");
    expect(Array.from(r.matchAll(/\p{Extended_Pictographic}/gu))).toHaveLength(1);
    expect(r).toContain("Mirá");
    expect(r).toContain("esto");
  });
});

describe("armarDesarrollo", () => {
  it("pega los parrafos con un renglon en blanco", () => {
    expect(armarDesarrollo(["Uno.", "Dos.", "Tres."])).toBe("Uno.\n\nDos.\n\nTres.");
  });

  it("descarta los vacios y recorta los espacios de los bordes", () => {
    expect(armarDesarrollo(["  Uno.  ", "", "   ", "Dos."])).toBe("Uno.\n\nDos.");
  });

  it("le aplica el tope de un emoji a cada parrafo", () => {
    expect(armarDesarrollo(["🏡 Hola 🔑", "Chau ✨"])).toBe("Hola 🔑\n\nChau ✨");
  });

  it("si el modelo manda un texto en vez de una lista, lo respeta y no rompe", () => {
    // Red de seguridad: si algun dia el modelo vuelve a mandar un string, la app no se cae.
    expect(armarDesarrollo("Un solo bloque.")).toBe("Un solo bloque.");
  });

  it("si no manda nada, devuelve vacio", () => {
    expect(armarDesarrollo(undefined)).toBe("");
    expect(armarDesarrollo(null)).toBe("");
    expect(armarDesarrollo([])).toBe("");
  });
});

describe("contarParrafos", () => {
  it("cuenta los bloques separados por renglon en blanco", () => {
    expect(contarParrafos("Uno.\n\nDos.\n\nTres.")).toBe(3);
  });

  it("el bug que motivo este trabajo: un bloque solo cuenta 1", () => {
    // El copy real de Maximiliano (copy_drafts 30b0f771) tenia 89 palabras en un bloque.
    expect(contarParrafos("Sabemos lo dificil que es encontrar un destino seguro para tu capital.")).toBe(1);
  });

  it("un texto vacio cuenta 0", () => {
    expect(contarParrafos("")).toBe(0);
    expect(contarParrafos("   ")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/marketing-ia/parrafos.test.ts`
Expected: FAIL — `Failed to resolve import "./parrafos"`.

- [ ] **Step 3: Write minimal implementation**

Crear `lib/marketing-ia/parrafos.ts`:

```ts
// Marketing IA · Lo que el servidor le sella al modelo en el texto de un post.
//
// POR QUE EXISTE: hasta el 16-sep-2026 al modelo se le pedia "desarrollo" como un texto suelto
// y salia un bloque de 89 palabras sin un salto de linea ni un emoji (copy_drafts 30b0f771, del
// 10-sep). Pegado en Meta se lee como un ladrillo. Ahora se le pide una LISTA de parrafos, que
// es algo que el servidor puede contar; un "pone renglones en blanco" adentro del prompt no se
// puede verificar, y ese error ya se pago caro con el tamano de las placas (ver formatos.ts).
//
// Y los emojis se limitan ACA y no en el prompt, por la misma razon.

/**
 * Los emojis de verdad, sin llevarse puestos los simbolos tipograficos.
 *
 * `\p{Extended_Pictographic}` agarra los pictogramas (🏡 🔑 ⚠️) pero NO agarra el guion largo,
 * las comillas, el simbolo de grado ni el ² de "45 m²", que Inter si sabe dibujar y que el copy
 * inmobiliario usa todo el tiempo. Se le suman los selectores de variacion y los modificadores
 * de tono de piel, que viajan pegados al emoji y quedarian sueltos.
 */
const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}]/gu;

/** Deja el texto sin un solo emoji. Lo que va dibujado sobre la placa pasa siempre por acá. */
export function sinEmojis(texto: string): string {
  return (texto || "").replace(EMOJI, "").replace(/\s+/g, " ").trim();
}

/**
 * Como mucho un emoji por parrafo, y se conserva el ULTIMO.
 *
 * El ultimo es el de la posicion que se busca: el ejemplo que mando Maximiliano tiene el emoji
 * cerrando el parrafo, nunca en el medio de la frase.
 */
export function unEmojiPorParrafo(parrafo: string): string {
  const encontrados = (parrafo || "").match(EMOJI);
  if (!encontrados || encontrados.length <= 1) return (parrafo || "").trim();

  const ultimo = encontrados[encontrados.length - 1];
  let vistos = 0;
  const total = encontrados.length;
  const limpio = parrafo.replace(EMOJI, (m) => {
    vistos++;
    return vistos === total ? m : "";
  });
  // El reemplazo puede dejar espacios dobles donde habia un emoji en el medio.
  return limpio.replace(/\s+/g, " ").trim() || ultimo;
}

/**
 * Convierte lo que devolvio el modelo en el campo `desarrollo` de siempre.
 *
 * Acepta un string por las dudas: la forma de `copy_drafts.content` no cambia, y si algun dia el
 * modelo vuelve a mandar un bloque suelto la app tiene que seguir funcionando.
 */
export function armarDesarrollo(parrafos: unknown): string {
  if (typeof parrafos === "string") return parrafos.trim();
  if (!Array.isArray(parrafos)) return "";

  return parrafos
    .map((p) => (typeof p === "string" ? unEmojiPorParrafo(p) : ""))
    .filter((p) => p.length > 0)
    .join("\n\n");
}

/** Cuantos parrafos tiene un desarrollo ya armado. Es lo que mide la prueba de regresion. */
export function contarParrafos(desarrollo: string): number {
  return (desarrollo || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/marketing-ia/parrafos.test.ts`
Expected: PASS, 14 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing-ia/parrafos.ts lib/marketing-ia/parrafos.test.ts
git commit -m "feat(marketing): el servidor sella los parrafos y los emojis del post"
```

---

### Task 2: Pedirle párrafos al modelo y sellarlos en las dos rutas

**Files:**
- Modify: `app/api/marketing-ia/generate-batch/route.ts` (el prompt del caso `post` y el post-proceso)
- Modify: `app/api/marketing-ia/generate-copy/route.ts` (que diga lo mismo que el otro)
- Test: `app/api/marketing-ia/generate-batch/prompt.test.ts`

**Interfaces:**
- Consumes: `armarDesarrollo`, `sinEmojis` de Task 1.
- Produces: `REGLAS_POST` (string exportado desde `lib/marketing-ia/parrafos.ts`), `sellarContenidoPost(content: any): any`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `app/api/marketing-ia/generate-batch/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sellarContenidoPost } from "@/lib/marketing-ia/parrafos";
import { contarParrafos } from "@/lib/marketing-ia/parrafos";

const fuente = (archivo: string) =>
  readFileSync(join(process.cwd(), "app/api/marketing-ia", archivo), "utf8");

describe("el prompt del post pide parrafos", () => {
  it("generate-batch le pide una LISTA de parrafos, no un texto suelto", () => {
    // El bug: el prompt decia solo "cuerpo usando el angulo pas" y salia un bloque.
    const src = fuente("generate-batch/route.ts");
    expect(src).toContain('"parrafos"');
    expect(src).not.toContain('"desarrollo":"cuerpo usando el ángulo pas"');
  });

  it("generate-copy dice lo mismo que generate-batch", () => {
    // Habia dos prompts que decian cosas distintas y solo uno corria. Si vuelven a
    // separarse, esto tiene que gritar.
    expect(fuente("generate-copy/route.ts")).toContain('"parrafos"');
  });

  it("las reglas del post viajan desde un solo lugar", () => {
    for (const archivo of ["generate-batch/route.ts", "generate-copy/route.ts"]) {
      expect(fuente(archivo), archivo).toContain("REGLAS_POST");
    }
  });
});

describe("sellarContenidoPost", () => {
  it("convierte los parrafos en un desarrollo con renglones en blanco", () => {
    const sellado = sellarContenidoPost({
      hook: "Los números no mienten",
      parrafos: ["Uno.", "Dos.", "Tres."],
      cta: "Escribinos 📲",
    });
    expect(contarParrafos(sellado.desarrollo)).toBe(3);
  });

  it("EN LA IMAGEN NO VA NINGUN EMOJI: el hook sale limpio", () => {
    const sellado = sellarContenidoPost({
      hook: "🏡 Belgrano lidera la demanda 🔑",
      parrafos: ["Uno."],
      cta: "Escribinos 📲",
    });
    expect(sellado.hook).toBe("Belgrano lidera la demanda");
  });

  it("el CTA si puede llevar su emoji: no se dibuja en la placa", () => {
    const sellado = sellarContenidoPost({ hook: "Hola", parrafos: ["Uno."], cta: "Escribinos 📲" });
    expect(sellado.cta).toBe("Escribinos 📲");
  });

  it("no deja el campo parrafos dando vueltas en lo que se guarda", () => {
    // copy_drafts.content tiene que seguir siendo {hook, desarrollo, cta}.
    const sellado = sellarContenidoPost({ hook: "Hola", parrafos: ["Uno."], cta: "Chau" });
    expect(sellado).not.toHaveProperty("parrafos");
    expect(Object.keys(sellado).sort()).toEqual(["cta", "desarrollo", "hook"]);
  });

  it("un borrador viejo (ya con desarrollo) pasa sin romperse", () => {
    const sellado = sellarContenidoPost({ hook: "Hola", desarrollo: "Bloque viejo.", cta: "Chau" });
    expect(sellado.desarrollo).toBe("Bloque viejo.");
  });
});
```

- [ ] **Step 2: Correr la prueba y verla fallar**

Run: `npx vitest run app/api/marketing-ia/generate-batch/prompt.test.ts`
Expected: FAIL — `sellarContenidoPost` no existe y los `toContain('"parrafos"')` fallan.

- [ ] **Step 3: Agregar `REGLAS_POST` y `sellarContenidoPost` a `lib/marketing-ia/parrafos.ts`**

Agregar al final de `lib/marketing-ia/parrafos.ts`:

```ts
/**
 * Las reglas de forma del texto de un post, en un solo lugar.
 *
 * Viven acá y no adentro de cada ruta porque hasta el 16-sep-2026 habia DOS prompts que decian
 * cosas distintas —generate-copy pedia "3-5 parrafos cortos" y generate-batch no pedia nada— y
 * solo corria el que no pedia nada. Un solo texto compartido hace imposible que vuelvan a
 * separarse.
 */
export const REGLAS_POST = `FORMA DEL TEXTO (esto se pega tal cual en Instagram y Facebook):
- "parrafos" es una LISTA de 6 a 8 párrafos. Cada párrafo, de 1 a 3 renglones. Nunca un bloque largo.
- Emoji: como mucho UNO al final de ALGUNOS párrafos, jamás en todos y jamás en el medio de una frase. Es un remate visual, no una decoración.
- El "hook" va SIN emoji: se dibuja adentro de la placa y ahí los emojis no existen.
- El "cta" sí puede cerrar con un emoji.`;

/**
 * Lo que devuelve el modelo, convertido a lo que se guarda en `copy_drafts.content`.
 *
 * Sale SIEMPRE con la forma {hook, desarrollo, cta}: la base y la pantalla ya leen eso, y los
 * borradores viejos tienen que seguir abriéndose.
 */
export function sellarContenidoPost(content: any): { hook: string; desarrollo: string; cta: string } {
  return {
    // EN LA IMAGEN NO VA NINGUN EMOJI (Leonardo, 16-sep-2026). El hook es lo que se dibuja
    // sobre la placa, asi que se limpia acá y no se confia en que el modelo obedezca.
    hook: sinEmojis(content?.hook ?? ""),
    desarrollo: armarDesarrollo(content?.parrafos ?? content?.desarrollo),
    cta: (content?.cta ?? "").trim(),
  };
}
```

- [ ] **Step 4: Cambiar el esquema en `generate-batch/route.ts`**

En `app/api/marketing-ia/generate-batch/route.ts`, agregar al import de `parrafos`:

```ts
import { REGLAS_POST, sellarContenidoPost } from "@/lib/marketing-ia/parrafos";
```

Reemplazar el bloque `else` del final de `buildBatchCopyPrompt` (el que arma el array JSON del post) por:

```ts
  } else {
    return `${base}

${REGLAS_POST}

Estructura exacta del ARRAY JSON:
[
  {
    "angle": "pas",
    "content": {"hook":"frase de apertura, sin emoji","parrafos":["párrafo 1","párrafo 2","párrafo 3","párrafo 4","párrafo 5","párrafo 6"],"cta":"llamada a la acción"}
  },
  {
    "angle": "transformacion",
    "content": {"hook":"frase de apertura, sin emoji","parrafos":["...6 a 8 párrafos..."],"cta":"llamada a la acción"}
  },
  {
    "angle": "autoridad",
    "content": {"hook":"frase de apertura, sin emoji","parrafos":["...6 a 8 párrafos..."],"cta":"llamada a la acción"}
  }
]`;
  }
```

- [ ] **Step 5: Sellar la respuesta en `generate-batch/route.ts`**

En el `try` que parsea el JSON, justo después del `if (payload.copy_type === "video") { ... }`, agregar el `else`:

```ts
      } else {
        // La forma del texto la sella el servidor, no el modelo: los parrafos se pegan con
        // renglon en blanco, el hook sale sin emoji y cada parrafo se queda con uno solo.
        for (const item of generatedBatch) {
          if (!item?.content) continue;
          item.content = sellarContenidoPost(item.content);
        }
      }
```

- [ ] **Step 6: Alinear `generate-copy/route.ts`**

En `app/api/marketing-ia/generate-copy/route.ts`:

```ts
import { REGLAS_POST, sellarContenidoPost } from "@/lib/marketing-ia/parrafos";
```

Reemplazar el `else` final de `buildCopyPrompt` por:

```ts
  } else {
    return `${base}

${REGLAS_POST}

Estructura exacta:
{"hook":"una frase de apertura demoledora, sin emoji","parrafos":["...6 a 8 párrafos cortos que construyan el deseo usando el ángulo ${config.angle}..."],"cta":"llamada a la acción estratégica"}`;
  }
```

Y en el `try` del parseo, después del `if (copy_type === "video") { ... }`:

```ts
      } else {
        copyContent = sellarContenidoPost(copyContent);
      }
```

(`copyContent` está declarado con `const`: cambiarlo a `let`.)

- [ ] **Step 7: Correr las pruebas**

Run: `npx vitest run app/api/marketing-ia/generate-batch/prompt.test.ts lib/marketing-ia/parrafos.test.ts`
Expected: PASS.

- [ ] **Step 8: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en los tres archivos tocados.

- [ ] **Step 9: Commit**

```bash
git add lib/marketing-ia/parrafos.ts app/api/marketing-ia/generate-batch/route.ts app/api/marketing-ia/generate-copy/route.ts app/api/marketing-ia/generate-batch/prompt.test.ts
git commit -m "fix(marketing): el post sale en parrafos con emojis, listo para pegar en Meta"
```

---

### Task 3: Que el control de letras cuente también los glifos que no existen

**Files:**
- Modify: `lib/tipografia/contornos.ts`
- Test: `lib/tipografia/contornos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `Contornos.letrasRotas` ahora también cuenta los `.notdef`. `armarFranjaLegal` ya lo propaga como `letrasSinDibujo` y la ruta ya lo loguea: no hace falta tocar nada más.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/tipografia/contornos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contornosDeTexto, anchoDelTexto } from "./contornos";

describe("contornosDeTexto", () => {
  it("un emoji cuenta como letra sin dibujar", () => {
    // La Inter incrustada tiene 515 glifos y ninguno es un emoji: charToGlyph('🏡') da .notdef,
    // que devuelve un contorno vacio. Hasta el 16-sep-2026 eso pasaba sin ser contado, asi que
    // un emoji en una placa se dibujaba como nada y nadie se enteraba. Es el mismo accidente
    // del credito de OpenStreetMap del mapa del ACM, que salio en blanco durante meses.
    const c = contornosDeTexto("Casa 🏡", 0, 20, 20);
    expect(c.letrasRotas).toBe(1);
  });

  it("el texto normal no rompe nada", () => {
    const c = contornosDeTexto("Departamento en Núñez — USD 130.000", 0, 20, 20);
    expect(c.letrasRotas).toBe(0);
    expect(c.paths.length).toBeGreaterThan(20);
  });

  it("los espacios no cuentan como letras rotas", () => {
    const c = contornosDeTexto("a b c", 0, 20, 20);
    expect(c.letrasRotas).toBe(0);
  });

  it("anchoDelTexto crece con el cuerpo", () => {
    expect(anchoDelTexto("Belgrano", 40)).toBeGreaterThan(anchoDelTexto("Belgrano", 20));
  });
});
```

- [ ] **Step 2: Correr y verla fallar**

Run: `npx vitest run lib/tipografia/contornos.test.ts`
Expected: FAIL en la primera — `expected 0 to be 1`. **Esta es la prueba que demuestra el agujero.**

- [ ] **Step 3: Implementar**

En `lib/tipografia/contornos.ts`, dentro del `for (const ch of texto)` de `contornosDeTexto`, reemplazar:

```ts
    const g = f.charToGlyph(ch);
    if (previo) x += f.getKerningValue(previo, g) * escala;
    // Un decimal alcanza y sobra para una letra chica, y achica el archivo un 20%.
    const d = g.getPath(x, y, cuerpoEntero).toPathData(1);
    if (d && d.includes("NaN")) letrasRotas++;
    else if (d) paths.push(d);
```

por:

```ts
    const g = f.charToGlyph(ch);
    if (previo) x += f.getKerningValue(previo, g) * escala;
    // Un decimal alcanza y sobra para una letra chica, y achica el archivo un 20%.
    const d = g.getPath(x, y, cuerpoEntero).toPathData(1);
    // Una letra que la fuente NO TIENE devuelve el glifo .notdef, con un contorno vacio: se
    // dibuja como nada, sin error. Hasta el 16-sep-2026 no se contaba, asi que un emoji pasaba
    // el control en silencio. El espacio tambien tiene contorno vacio, pero SI existe en la
    // fuente, por eso el criterio es el nombre del glifo y no si el contorno vino vacio.
    if (g.name === ".notdef") letrasRotas++;
    else if (d && d.includes("NaN")) letrasRotas++;
    else if (d) paths.push(d);
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run lib/tipografia/contornos.test.ts lib/marketing-ia/aviso-legal.test.ts`
Expected: PASS las dos. Si el aviso legal empieza a reportar `letrasSinDibujo > 0`, hay un carácter real que Inter no tiene — anotarlo, no taparlo.

- [ ] **Step 5: Commit**

```bash
git add lib/tipografia/contornos.ts lib/tipografia/contornos.test.ts
git commit -m "fix(tipografia): una letra que la fuente no tiene ya no se pierde en silencio"
```

---

### Task 4: Mover el repartidor de renglones a tipografía

`placa-con-foto.ts` necesita el mismo cortador de renglones que ya tiene `aviso-legal.ts`. En vez de duplicarlo, se mueve al módulo de tipografía, que es donde corresponde (solo depende de `anchoDelTexto`).

**Files:**
- Modify: `lib/tipografia/contornos.ts` (agregar `repartirEnRenglones`)
- Modify: `lib/marketing-ia/aviso-legal.ts` (borrar la copia local e importarla)
- Test: `lib/tipografia/contornos.test.ts` (agregar casos)

**Interfaces:**
- Produces: `repartirEnRenglones(texto: string, cuerpo: number, anchoUtil: number): string[]`

- [ ] **Step 1: Agregar los casos a `lib/tipografia/contornos.test.ts`**

```ts
import { repartirEnRenglones } from "./contornos";

describe("repartirEnRenglones", () => {
  it("corta por palabras sin pasarse del ancho", () => {
    const rs = repartirEnRenglones("Belgrano lidera la demanda de alquileres", 40, 300);
    expect(rs.length).toBeGreaterThan(1);
    for (const r of rs) expect(anchoDelTexto(r, 40)).toBeLessThanOrEqual(300);
  });

  it("respeta los saltos de linea que ya trae el texto", () => {
    // El director separa el aviso legal de la firma de la agencia con un salto.
    const rs = repartirEnRenglones("Primero\nSegundo", 20, 10000);
    expect(rs).toEqual(["Primero", "Segundo"]);
  });

  it("parte a lo bruto una palabra mas larga que el renglon", () => {
    const rs = repartirEnRenglones("www.unaurlmuylargaquenoentra.com.ar", 40, 120);
    expect(rs.length).toBeGreaterThan(1);
    expect(rs.join("")).toBe("www.unaurlmuylargaquenoentra.com.ar");
  });

  it("no devuelve renglones vacios", () => {
    const rs = repartirEnRenglones("  Hola  \n\n  Chau  ", 20, 10000);
    expect(rs).toEqual(["Hola", "Chau"]);
  });
});
```

- [ ] **Step 2: Correr y verla fallar**

Run: `npx vitest run lib/tipografia/contornos.test.ts`
Expected: FAIL — `repartirEnRenglones` no se exporta desde `./contornos`.

- [ ] **Step 3: Mover la función**

Cortar la función `repartirEnRenglones` completa de `lib/marketing-ia/aviso-legal.ts` (con su comentario de arriba) y pegarla en `lib/tipografia/contornos.ts`, al final, con `export`:

```ts
/**
 * Reparte un texto en renglones que entren en `anchoUtil` con ese cuerpo de letra.
 *
 * Respeta los saltos de linea que ya traiga el texto (en el aviso legal suelen separar el aviso
 * de la firma de la agencia) y acomoda cada parrafo dentro del ancho disponible.
 *
 * Vive acá y no en aviso-legal.ts porque desde el 16-sep-2026 lo usan dos cosas: la franja legal
 * y el panel de la placa con foto.
 */
export function repartirEnRenglones(texto: string, cuerpo: number, anchoUtil: number): string[] {
  const renglones: string[] = [];

  for (const parrafo of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const limpio = parrafo.trim().replace(/\s+/g, " ");
    if (!limpio) continue;

    let actual = "";
    for (const palabra of limpio.split(" ")) {
      const tentativa = actual ? `${actual} ${palabra}` : palabra;
      if (anchoDelTexto(tentativa, cuerpo) <= anchoUtil) {
        actual = tentativa;
        continue;
      }
      if (actual) renglones.push(actual);

      // Una sola palabra mas larga que el renglon (una URL, por ejemplo): se parte a lo bruto.
      if (anchoDelTexto(palabra, cuerpo) > anchoUtil) {
        let trozo = "";
        for (const ch of palabra) {
          if (anchoDelTexto(trozo + ch, cuerpo) > anchoUtil && trozo) {
            renglones.push(trozo);
            trozo = ch;
          } else {
            trozo += ch;
          }
        }
        actual = trozo;
      } else {
        actual = palabra;
      }
    }
    if (actual) renglones.push(actual);
  }

  return renglones;
}
```

En `lib/marketing-ia/aviso-legal.ts`, agregar `repartirEnRenglones` al import que ya existe:

```ts
import { anchoDelTexto, comoPaths, contornosDeTexto, repartirEnRenglones } from "@/lib/tipografia/contornos";
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run lib/tipografia/contornos.test.ts lib/marketing-ia/aviso-legal.test.ts`
Expected: PASS las dos. El aviso legal no cambió de comportamiento: es la misma función, movida.

- [ ] **Step 5: Commit**

```bash
git add lib/tipografia/contornos.ts lib/tipografia/contornos.test.ts lib/marketing-ia/aviso-legal.ts
git commit -m "refactor(tipografia): el repartidor de renglones pasa a tipografia, lo van a usar dos"
```

---

### Task 5: El módulo que arma la placa con la foto real

El corazón del trabajo. Sin IA: la foto arriba, el panel de marca abajo, y **el alto del panel se mide a partir de su contenido**.

**Files:**
- Create: `lib/marketing-ia/placa-con-foto.ts`
- Test: `lib/marketing-ia/placa-con-foto.test.ts`

**Interfaces:**
- Consumes: `repartirEnRenglones`, `anchoDelTexto`, `contornosDeTexto`, `comoPaths` de `lib/tipografia/contornos`.
- Produces:
  ```ts
  export interface ContenidoPanel { titulo: string; bajada?: string; precio?: string; datos?: string[] }
  export interface PlacaArmada {
    imagen: Buffer; altoFoto: number; altoPanel: number; cuerpoTitulo: number;
    renglonesTitulo: number; letrasSinDibujo: number; datosDibujados: number; escalaFoto: number;
  }
  export function medirPanel(opciones: {...}): { ... }   // puro, sin sharp
  export async function armarPlacaConFoto(opciones: {...}): Promise<PlacaArmada>
  ```

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/marketing-ia/placa-con-foto.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { medirPanel, armarPlacaConFoto } from "./placa-con-foto";

/** Una foto de prueba del tamaño y color que se pida. */
const fotoDe = (ancho: number, alto: number, color = { r: 20, g: 120, b: 200 }) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: color } }).jpeg().toBuffer();

const CONTENIDO = {
  titulo: "Belgrano lidera la demanda de alquileres",
  bajada: "Monoambiente full amenities — La Pampa 1300",
  precio: "USD 130.000",
  datos: ["1 ambiente", "45 m²", "Pileta", "Gimnasio", "Seguridad 24 h"],
};

describe("medirPanel", () => {
  it("la foto nunca baja del 45% del alto de la placa", () => {
    // El tope existe para que el panel no se coma la propiedad. Con un titulo larguisimo el
    // panel tiene que achicar la letra y soltar casillas, no crecer sin limite.
    const m = medirPanel({
      ancho: 1080, alto: 1350, reservadoAbajo: 200,
      contenido: { ...CONTENIDO, titulo: "Un titulo absurdamente largo ".repeat(12) },
    });
    expect(m.altoPanel).toBeLessThanOrEqual(1350 * 0.55);
    expect(m.altoFoto).toBeGreaterThanOrEqual(1350 * 0.45);
  });

  it("el cuerpo del titulo es SIEMPRE un entero", () => {
    // Con un cuerpo fraccionario opentype.js devuelve NaN y el texto se corta a la mitad
    // sin ningun error. Ya paso en produccion el 31-ago-2026 con el aviso legal.
    for (const [ancho, alto] of [[1080, 1920], [1080, 1350], [1080, 1080], [1024, 1024]]) {
      const m = medirPanel({ ancho, alto, reservadoAbajo: 200, contenido: CONTENIDO });
      expect(Number.isInteger(m.cuerpoTitulo), `${ancho}x${alto}`).toBe(true);
    }
  });

  it("el panel deja lugar para lo que va abajo: nada se monta sobre el aviso legal", () => {
    // Este es el choque que aparecio en el mockup del 16-sep: en 4:5 las casillas se metian
    // abajo del aviso legal y el logo se montaba encima.
    const reservadoAbajo = 260;
    const m = medirPanel({ ancho: 1080, alto: 1350, reservadoAbajo, contenido: CONTENIDO });
    expect(m.fondoDelContenido).toBeLessThanOrEqual(1350 - reservadoAbajo);
  });

  it("las casillas se sueltan antes que achicar el titulo a ilegible", () => {
    const apretado = medirPanel({
      ancho: 1080, alto: 1080, reservadoAbajo: 400,
      contenido: { ...CONTENIDO, titulo: "Un titulo bastante largo que ocupa varios renglones enteros" },
    });
    expect(apretado.datosDibujados).toBeLessThan(CONTENIDO.datos.length);
    expect(apretado.cuerpoTitulo).toBeGreaterThanOrEqual(28);
  });

  it("ninguna casilla se pasa del ancho util", () => {
    const m = medirPanel({ ancho: 1080, alto: 1920, reservadoAbajo: 200, contenido: CONTENIDO });
    for (const c of m.casillas) expect(c.left + c.ancho).toBeLessThanOrEqual(1080 - m.margen);
  });
});

describe("armarPlacaConFoto", () => {
  it("la placa sale de la medida exacta que se pidio", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    const m = await sharp(r.imagen).metadata();
    expect(m.width).toBe(1080);
    expect(m.height).toBe(1350);
  });

  it("LA FOTO NO SE TOCA: el centro de la zona de foto sigue siendo la foto", async () => {
    // Es lo que sostiene todo el diseno. Si esto falla, la placa no muestra la propiedad real.
    const COLOR = { r: 20, g: 120, b: 200 };
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120, COLOR), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    const px = await sharp(r.imagen)
      .extract({ left: 500, top: Math.round(r.altoFoto / 2), width: 4, height: 4 })
      .raw().toBuffer();
    expect(px[0]).toBeCloseTo(COLOR.r, -1);
    expect(px[1]).toBeCloseTo(COLOR.g, -1);
    expect(px[2]).toBeCloseTo(COLOR.b, -1);
  });

  it("EN LA IMAGEN NO VA NINGUN EMOJI: si llega uno, se ve en el contador", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350, reservadoAbajo: 200,
      contenido: { ...CONTENIDO, titulo: "Belgrano lidera 🏡" },
    });
    expect(r.letrasSinDibujo).toBeGreaterThan(0);
  });

  it("un titulo limpio no deja ninguna letra sin dibujar", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    expect(r.letrasSinDibujo).toBe(0);
  });

  it("avisa cuando la foto es mas chica que la placa y hay que agrandarla", async () => {
    // 7 de 40 portadas de Central miden menos de 1080 px de ancho. Esas salen blandas.
    const r = await armarPlacaConFoto({
      foto: await fotoDe(575, 431), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    expect(r.escalaFoto).toBeGreaterThan(1);
  });

  it("con la foto tipica de Central la achica, no la agranda", async () => {
    // Foto tipica medida el 16-sep-2026: 4:3, mediana de ancho 1500 px.
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    expect(r.escalaFoto).toBeLessThan(1);
  });

  it("anda en los tres formatos", async () => {
    for (const [ancho, alto] of [[1080, 1920], [1080, 1350], [1080, 1080]]) {
      const r = await armarPlacaConFoto({
        foto: await fotoDe(1500, 1120), ancho, alto, reservadoAbajo: 200, contenido: CONTENIDO,
      });
      const m = await sharp(r.imagen).metadata();
      expect(m.width, `${ancho}x${alto}`).toBe(ancho);
      expect(m.height, `${ancho}x${alto}`).toBe(alto);
      expect(r.letrasSinDibujo, `${ancho}x${alto}`).toBe(0);
    }
  });

  it("sin bajada, sin precio y sin datos igual arma la placa", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: { titulo: "Belgrano lidera la demanda" },
    });
    expect(r.datosDibujados).toBe(0);
    expect((await sharp(r.imagen).metadata()).height).toBe(1350);
  });
});
```

- [ ] **Step 2: Correr y verla fallar**

Run: `npx vitest run lib/marketing-ia/placa-con-foto.test.ts`
Expected: FAIL — `Failed to resolve import "./placa-con-foto"`.

- [ ] **Step 3: Implementar**

Crear `lib/marketing-ia/placa-con-foto.ts`:

```ts
// Marketing IA · La placa que muestra la FOTO REAL de la propiedad.
//
// POR QUE NO LA HACE GEMINI: hasta el 16-sep-2026 la placa era una imagen inventada de punta a
// punta por el modelo. Maximiliano Filoreto lo marco el 10-sep: el copy decia "La Pampa 1300,
// USD 130.000" y la imagen mostraba un living que no existe. La causa era que
// flow_data.tokko_property_details venia vacio y el prompt caia en "imagen representativa del
// mercado inmobiliario argentino premium".
//
// POR QUE FOTO + PANEL Y NO FOTO A PANTALLA COMPLETA: medidas 40 portadas reales de Central el
// 16-sep-2026, la foto tipica es 4:3 de 1500 px de ancho. Armando el Reel 9:16:
//   pantalla completa -> usa el 42% del ancho de la foto y hay que agrandarla 1,71x (sale blanda)
//   foto + panel      -> usa el 76% y se achica 0,94x (sale nitida)
// En 4:5 y en cuadrado la foto entra ENTERA, sin recortar nada. El panel gana en los tres.
//
// POR QUE EL PANEL SE MIDE Y NO SE FIJA: con un panel de alto fijo (40% de la placa), en 4:5 las
// casillas de datos se metian abajo del aviso legal y el logo se montaba encima. Salio probando
// el mockup con la foto real, antes de que llegara a produccion.
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { anchoDelTexto, comoPaths, contornosDeTexto, repartirEnRenglones } from "@/lib/tipografia/contornos";

// Todo se mide contra un ancho de referencia de 1080 px (el lado de una placa de Instagram) y
// despues se escala, igual que el aviso legal.
const ANCHO_REF = 1080;

// De mayor a menor: se usa el cuerpo mas grande que entre. Abajo de 28 (en referencia) un titulo
// de placa deja de tener peso de titulo.
const CUERPOS_TITULO_REF = [66, 60, 54, 48, 44, 40, 36, 32, 28];

const MARGEN_REF = 70;          // aire a los costados del panel
const AIRE_ARRIBA_REF = 74;     // entre el borde de la foto y el titulo
const INTERLINEA_TITULO = 1.2;
const CUERPO_BAJADA_REF = 34;
const CUERPO_PRECIO_REF = 56;
const CUERPO_DATO_REF = 28;
const ALTO_LINEA_REF = 5;       // la linea de acento debajo del titulo
const AIRE_REF = 40;            // separacion entre bloques del panel

/** La foto nunca baja de esto: el panel no se puede comer la propiedad. */
const PISO_FOTO = 0.45;

const COLOR_PANEL = "#12161c";
const COLOR_TITULO = "#ffffff";
const COLOR_BAJADA = "#98a4b2";
const COLOR_DATO = "#d6dee8";
const COLOR_ACENTO = "#c98a4b";  // el cobre de la marca

export interface ContenidoPanel {
  /** El hook, YA SIN EMOJIS (lo limpia sellarContenidoPost). */
  titulo: string;
  bajada?: string;
  precio?: string;
  /** Casillas: "1 ambiente", "45 m²", "Pileta". Se sueltan si no entran. */
  datos?: string[];
}

export interface Casilla {
  texto: string;
  left: number;
  top: number;
  ancho: number;
  alto: number;
}

export interface MedidaPanel {
  altoPanel: number;
  altoFoto: number;
  cuerpoTitulo: number;
  renglonesTitulo: string[];
  /** Donde termina lo ultimo que se dibuja. Tiene que caer arriba de lo reservado. */
  fondoDelContenido: number;
  casillas: Casilla[];
  datosDibujados: number;
  margen: number;
  yTitulo: number;
  yLinea: number;
  yBajada: number;
  yPrecio: number;
}

export interface PlacaArmada {
  imagen: Buffer;
  altoFoto: number;
  altoPanel: number;
  cuerpoTitulo: number;
  renglonesTitulo: number;
  /** Tiene que ser SIEMPRE 0. Si no lo es, la placa dice algo distinto de lo que se escribio. */
  letrasSinDibujo: number;
  datosDibujados: number;
  /** <1 = la foto se achica (nitida). >1 = se agranda (sale blanda). */
  escalaFoto: number;
}

/**
 * Cuanto ocupa el panel con este contenido, y por lo tanto cuanto le queda a la foto.
 *
 * Es puro (no toca sharp) a proposito: asi se puede probar la geometria sola, que es donde
 * estaba el choque.
 *
 * `reservadoAbajo` es lo que la ruta va a dibujar DESPUES encima: la franja del aviso legal mas
 * el logo mas su margen. El panel nunca invade esa zona.
 */
export function medirPanel(opciones: {
  ancho: number;
  alto: number;
  reservadoAbajo: number;
  contenido: ContenidoPanel;
}): MedidaPanel {
  const { ancho, alto, reservadoAbajo, contenido } = opciones;
  const escala = ancho / ANCHO_REF;
  const ent = (ref: number) => Math.max(1, Math.round(ref * escala));

  const margen = ent(MARGEN_REF);
  const anchoUtil = ancho - margen * 2;
  const techoPanel = alto * (1 - PISO_FOTO);
  const datosPedidos = (contenido.datos ?? []).filter(Boolean);

  let mejor: MedidaPanel | null = null;

  // Dos palancas, en este orden: primero se achica el titulo; recien si con el cuerpo mas chico
  // sigue sin entrar, se sueltan casillas. Las casillas son lo prescindible; el titulo, no.
  for (const cuerpoRef of CUERPOS_TITULO_REF) {
    for (let cuantosDatos = datosPedidos.length; cuantosDatos >= 0; cuantosDatos--) {
      const cuerpoTitulo = ent(cuerpoRef);
      const renglones = repartirEnRenglones(contenido.titulo || "", cuerpoTitulo, anchoUtil);

      const yTitulo = ent(AIRE_ARRIBA_REF) + cuerpoTitulo;
      const fondoTitulo = yTitulo + (renglones.length - 1) * cuerpoTitulo * INTERLINEA_TITULO;

      const yLinea = fondoTitulo + ent(AIRE_REF);
      let y = yLinea + ent(ALTO_LINEA_REF);

      const cuerpoBajada = ent(CUERPO_BAJADA_REF);
      const yBajada = contenido.bajada ? y + ent(AIRE_REF) + cuerpoBajada : y;
      y = yBajada;

      const cuerpoPrecio = ent(CUERPO_PRECIO_REF);
      const yPrecio = contenido.precio ? y + ent(AIRE_REF) + cuerpoPrecio : y;
      y = yPrecio;

      // Las casillas: se colocan a lo ancho y la que no entra corta la fila.
      const cuerpoDato = ent(CUERPO_DATO_REF);
      const altoCasilla = cuerpoDato + ent(26);
      const yCasillas = cuantosDatos > 0 ? y + ent(AIRE_REF) + altoCasilla : y;
      const casillas: Casilla[] = [];
      if (cuantosDatos > 0) {
        let x = margen;
        for (const texto of datosPedidos.slice(0, cuantosDatos)) {
          const anchoTexto = anchoDelTexto(texto, cuerpoDato);
          const anchoCasilla = anchoTexto + ent(36);
          if (x + anchoCasilla > ancho - margen) break;
          casillas.push({ texto, left: x, top: yCasillas - altoCasilla, ancho: anchoCasilla, alto: altoCasilla });
          x += anchoCasilla + ent(12);
        }
      }
      const fondoDelContenido = (casillas.length ? yCasillas : y) + ent(AIRE_REF);

      const altoPanel = Math.ceil(fondoDelContenido + reservadoAbajo);

      const entra = altoPanel <= techoPanel;
      const esElUltimoIntento =
        cuerpoRef === CUERPOS_TITULO_REF[CUERPOS_TITULO_REF.length - 1] && cuantosDatos === 0;

      if (entra || esElUltimoIntento) {
        mejor = {
          altoPanel: Math.min(altoPanel, Math.ceil(techoPanel)),
          altoFoto: alto - Math.min(altoPanel, Math.ceil(techoPanel)),
          cuerpoTitulo,
          renglonesTitulo: renglones,
          fondoDelContenido: 0, // se completa abajo, ya en coordenadas de la placa
          casillas,
          datosDibujados: casillas.length,
          margen,
          yTitulo,
          yLinea,
          yBajada,
          yPrecio,
        };
        break;
      }
    }
    if (mejor) break;
  }

  // `mejor` no puede ser null: el ultimo intento se acepta siempre.
  const m = mejor as MedidaPanel;
  // Las `y` de arriba son relativas al borde de arriba del panel. Se pasan a coordenadas de la
  // placa entera, que es lo que necesita quien dibuja.
  const base = m.altoFoto;
  m.yTitulo += base;
  m.yLinea += base;
  m.yBajada += base;
  m.yPrecio += base;
  for (const c of m.casillas) c.top += base;
  m.fondoDelContenido = Math.max(
    m.yPrecio,
    m.yBajada,
    m.yTitulo + (m.renglonesTitulo.length - 1) * m.cuerpoTitulo * INTERLINEA_TITULO,
    ...m.casillas.map((c) => c.top + c.alto)
  );
  return m;
}

/** Dibuja un texto como contornos, en su propio lienzo del alto justo. Un renglon por lienzo. */
async function renglon(
  texto: string,
  x: number,
  cuerpo: number,
  ancho: number,
  color: string,
  opacidad = 1
): Promise<{ capa: OverlayOptions; alto: number; rotas: number }> {
  const altoLienzo = Math.ceil(cuerpo * 1.45);
  const c = contornosDeTexto(texto, x, Math.round(cuerpo * 1.08), cuerpo);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${altoLienzo}">${comoPaths(
    c.paths,
    color,
    opacidad
  )}</svg>`;
  return {
    capa: { input: await sharp(Buffer.from(svg)).png().toBuffer(), top: 0, left: 0 },
    alto: altoLienzo,
    rotas: c.letrasRotas,
  };
}

/**
 * Arma la placa: la foto real arriba, el panel de marca abajo.
 *
 * Devuelve la imagen SIN el logo ni el aviso legal: esos los pone la ruta encima, igual que
 * siempre, en el hueco que dejo `reservadoAbajo`.
 */
export async function armarPlacaConFoto(opciones: {
  foto: Buffer;
  ancho: number;
  alto: number;
  reservadoAbajo: number;
  contenido: ContenidoPanel;
  colorAcento?: string;
}): Promise<PlacaArmada> {
  const { foto, ancho, alto, reservadoAbajo, contenido } = opciones;
  const acento = opciones.colorAcento || COLOR_ACENTO;
  const m = medirPanel({ ancho, alto, reservadoAbajo, contenido });
  const escala = ancho / ANCHO_REF;
  const ent = (ref: number) => Math.max(1, Math.round(ref * escala));

  // ─── Cuanto hay que estirar la foto ──────────────────────────────────
  // Se calcula ANTES de recortar: es el dato que le dice al asesor si la foto que eligio es
  // demasiado chica para la placa. 7 de 40 portadas de Central lo son.
  const medidaFoto = await sharp(foto).metadata();
  const anchoOriginal = medidaFoto.width ?? ancho;
  const altoOriginal = medidaFoto.height ?? m.altoFoto;
  const ratioZona = ancho / m.altoFoto;
  const anchoUsado =
    anchoOriginal / altoOriginal > ratioZona ? altoOriginal * ratioZona : anchoOriginal;
  const escalaFoto = ancho / anchoUsado;

  // La foto se lleva a la zona que le toca. `cover` no la deforma: recorta.
  const fotoLista = await sharp(foto)
    .resize(ancho, m.altoFoto, { fit: "cover", position: "centre" })
    .toBuffer();

  // ─── El lienzo: el panel de color, con la foto pegada arriba ─────────
  const base = sharp({
    create: { width: ancho, height: alto, channels: 4, background: COLOR_PANEL },
  });

  const capas: OverlayOptions[] = [{ input: fotoLista, top: 0, left: 0 }];
  let letrasSinDibujo = 0;

  // El titulo, un renglon por lienzo (un <path> grande se rasteriza incompleto sin avisar).
  for (let i = 0; i < m.renglonesTitulo.length; i++) {
    const r = await renglon(
      m.renglonesTitulo[i],
      m.margen,
      m.cuerpoTitulo,
      ancho,
      COLOR_TITULO
    );
    letrasSinDibujo += r.rotas;
    capas.push({
      ...r.capa,
      top: Math.round(m.yTitulo + i * m.cuerpoTitulo * INTERLINEA_TITULO - m.cuerpoTitulo),
    });
  }

  // La linea de acento debajo del titulo.
  capas.push({
    input: await sharp({
      create: {
        width: ent(110),
        height: ent(ALTO_LINEA_REF),
        channels: 4,
        background: acento,
      },
    })
      .png()
      .toBuffer(),
    top: Math.round(m.yLinea),
    left: m.margen,
  });

  if (contenido.bajada) {
    const cuerpo = ent(CUERPO_BAJADA_REF);
    const r = await renglon(contenido.bajada, m.margen, cuerpo, ancho, COLOR_BAJADA);
    letrasSinDibujo += r.rotas;
    capas.push({ ...r.capa, top: Math.round(m.yBajada - cuerpo) });
  }

  if (contenido.precio) {
    const cuerpo = ent(CUERPO_PRECIO_REF);
    const r = await renglon(contenido.precio, m.margen, cuerpo, ancho, acento);
    letrasSinDibujo += r.rotas;
    capas.push({ ...r.capa, top: Math.round(m.yPrecio - cuerpo) });
  }

  for (const c of m.casillas) {
    const cuerpo = ent(CUERPO_DATO_REF);
    // El fondo redondeado de la casilla.
    const fondo = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.ancho}" height="${c.alto}"><rect width="${c.ancho}" height="${c.alto}" rx="${Math.round(
      c.alto / 2
    )}" fill="#ffffff" fill-opacity="0.07"/></svg>`;
    capas.push({
      input: await sharp(Buffer.from(fondo)).png().toBuffer(),
      top: Math.round(c.top),
      left: Math.round(c.left),
    });
    const r = await renglon(c.texto, c.left + ent(18), cuerpo, ancho, COLOR_DATO);
    letrasSinDibujo += r.rotas;
    capas.push({ ...r.capa, top: Math.round(c.top + (c.alto - cuerpo) / 2 - cuerpo * 0.1) });
  }

  const imagen = await base.composite(capas).jpeg({ quality: 92 }).toBuffer();

  return {
    imagen,
    altoFoto: m.altoFoto,
    altoPanel: m.altoPanel,
    cuerpoTitulo: m.cuerpoTitulo,
    renglonesTitulo: m.renglonesTitulo.length,
    letrasSinDibujo,
    datosDibujados: m.datosDibujados,
    escalaFoto: +escalaFoto.toFixed(2),
  };
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run lib/marketing-ia/placa-con-foto.test.ts`
Expected: PASS, 14 pruebas. **Si "LA FOTO NO SE TOCA" falla, parar: el diseño entero se apoya en esa.**

- [ ] **Step 5: Mirar una placa de verdad con el ojo**

Las pruebas dicen que las medidas están bien, no que se vea bien. Guardar una y abrirla:

```bash
npx vitest run lib/marketing-ia/placa-con-foto.test.ts --reporter=verbose
node --input-type=module -e "
import sharp from 'sharp';
import { armarPlacaConFoto } from './lib/marketing-ia/placa-con-foto.ts';
"
```

Si el import de TS desde node da problemas, hacerlo desde una prueba temporal que escriba el archivo con `sharp(...).toFile('scratch/placa-ojo.jpg')` y abrirla. **Mirar los tres formatos.**

- [ ] **Step 6: Commit**

```bash
git add lib/marketing-ia/placa-con-foto.ts lib/marketing-ia/placa-con-foto.test.ts
git commit -m "feat(marketing): la placa se arma con la foto real de la propiedad, sin IA"
```

---

### Task 6: Conectar la placa con foto a la ruta de imagen

**Files:**
- Modify: `app/api/marketing-ia/generate-image/route.ts`
- Modify: `types/marketing-ia.ts` (agregar `foto_url` y `propiedad_tokko_id` a `GenerateImagePayload`)

**Interfaces:**
- Consumes: `armarPlacaConFoto` (Task 5), `formatoDe`, `armarFranjaLegal`, `prepararLogo`, `urlDelLogo`.
- Produces: `GenerateImagePayload.foto_url?: string` y `GenerateImagePayload.propiedad_tokko_id?: number | string | null`.

- [ ] **Step 1: Ampliar el tipo**

En `types/marketing-ia.ts`, dentro de `GenerateImagePayload`, agregar:

```ts
  /**
   * La foto real de la propiedad que eligió el asesor. Si viene, la placa se arma con ESA foto
   * y NO se llama a Gemini (así no hay forma de que la IA le cambie un mueble al depto que se
   * vende, y además no consume créditos de imagen).
   */
  foto_url?: string;
  /**
   * El id de la propiedad. La pantalla manda ESTO y no los datos: hasta el 16-sep-2026 mandaba
   * `flow_data.tokko_property_details`, que está vacío en los perfiles reales, así que la placa
   * no recibía ni la foto ni los datos.
   */
  propiedad_tokko_id?: number | string | null;
```

- [ ] **Step 2: Escribir la prueba que falla**

Crear `app/api/marketing-ia/generate-image/camino.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/api/marketing-ia/generate-image/route.ts"), "utf8");

describe("la ruta de la placa", () => {
  it("con foto no llama a Gemini", () => {
    // Si la foto real pasara por generateImage, el modelo redibuja la propiedad.
    const conFoto = src.slice(src.indexOf("payload.foto_url"));
    const antesDelElse = conFoto.slice(0, conFoto.indexOf("// ─── Camino sin foto"));
    expect(antesDelElse).not.toContain("generateImage(");
  });

  it("con foto no consume creditos de imagen", () => {
    expect(src).toContain("if (!payload.foto_url)");
    const i = src.indexOf('consumeAiCredits("marketing_ia", 2');
    expect(i, "el consumo de creditos tiene que estar adentro del camino sin foto").toBeGreaterThan(0);
  });

  it("la propiedad la busca el servidor, no la manda la pantalla", () => {
    // El bug: flow_data.tokko_property_details viene vacio.
    expect(src).toContain("propiedad_tokko_id");
    expect(src).toContain("tokkobroker.com/api/v1/property/");
  });

  it("el titulo de la placa pasa por sinEmojis", () => {
    // EN LA IMAGEN NO VA NINGUN EMOJI.
    expect(src).toContain("sinEmojis(");
  });
});
```

- [ ] **Step 3: Correr y verla fallar**

Run: `npx vitest run app/api/marketing-ia/generate-image/camino.test.ts`
Expected: FAIL las cuatro.

- [ ] **Step 4: Implementar el camino con foto**

En `app/api/marketing-ia/generate-image/route.ts`, agregar imports:

```ts
import { armarPlacaConFoto, type ContenidoPanel } from "@/lib/marketing-ia/placa-con-foto";
import { sinEmojis } from "@/lib/marketing-ia/parrafos";
```

Agregar esta función auxiliar arriba del `POST` (busca la propiedad como ya hace `generate-batch`):

```ts
/**
 * Los datos de la propiedad, buscados EN EL SERVIDOR.
 *
 * La pantalla manda el id y no los datos: hasta el 16-sep-2026 mandaba
 * `flow_data.tokko_property_details`, que está vacío en los perfiles reales (verificado en
 * `ipc_profiles`), así que la placa no recibía nada y caía en "imagen representativa del
 * mercado inmobiliario argentino premium".
 */
async function traerPropiedad(
  tokkoId: number | string | null | undefined,
  claveAgencia: string | null
): Promise<TokkoProperty | null> {
  if (!tokkoId) return null;
  const clave = claveAgencia || process.env.TOKKO_API_KEY;
  if (!clave) return null;
  try {
    const res = await fetch(`https://tokkobroker.com/api/v1/property/${tokkoId}/?key=${clave}&format=json`);
    if (!res.ok) return null;
    const p = await res.json();
    return {
      id: p.id,
      reference_code: p.reference_code,
      title: p.publication_title || p.address,
      address: p.address,
      zone: p.location?.name || "",
      property_type: p.type?.name || "",
      operation_type: p.operations?.[0]?.operation_type || "",
      price: p.operations?.[0]?.prices?.[0]?.price || 0,
      currency: p.operations?.[0]?.prices?.[0]?.currency || "USD",
      surface_total: p.surface || 0,
      surface_covered: p.roofed_surface || 0,
      rooms: p.room_amount || 0,
      bathrooms: p.bathroom_amount || 0,
      description: p.description,
      tags: (p.tags || []).map((t: any) => t.name),
    } as TokkoProperty;
  } catch (e) {
    console.error("[PLACA] No se pudo traer la propiedad de Tokko:", e);
    return null;
  }
}

/** El contenido del panel, armado con los datos reales. Sin emojis: acá no se pueden dibujar. */
function contenidoDelPanel(hook: string, p: TokkoProperty | null): ContenidoPanel {
  const ubicacion = [p?.address, p?.zone].filter(Boolean).join(", ");
  const precio = p?.price
    ? `${p.currency || "USD"} ${Number(p.price).toLocaleString("es-AR")}`
    : undefined;
  const datos = [
    p?.rooms ? `${p.rooms} ${p.rooms === 1 ? "ambiente" : "ambientes"}` : null,
    p?.surface_total ? `${p.surface_total} m²` : null,
    p?.bathrooms ? `${p.bathrooms} ${p.bathrooms === 1 ? "baño" : "baños"}` : null,
    ...(p?.tags ?? []).slice(0, 3),
  ].filter(Boolean) as string[];

  return {
    titulo: sinEmojis(hook),
    bajada: ubicacion ? sinEmojis(ubicacion) : undefined,
    precio,
    datos: datos.map(sinEmojis),
  };
}
```

Dentro del `POST`, reemplazar el bloque que empieza en `let imageBuffer: Buffer;` y su `try` por esta estructura (el camino sin foto queda **igual que hoy**, solo se mueve adentro del `else`):

```ts
    const propiedad = await traerPropiedad(payload.propiedad_tokko_id, agency?.tokko_api_key ?? null);

    let imageBuffer: Buffer;
    let txId: string | null = null;

    if (payload.foto_url) {
      // ─── Camino con foto real: no se llama a Gemini y no se gastan créditos ──────────
      // La foto tiene que llegar bit a bit a la placa: si pasara por el modelo, redibujaría el
      // inmueble y la publicidad mostraría una propiedad que no es la que se vende.
      const resFoto = await fetch(payload.foto_url);
      if (!resFoto.ok) {
        return NextResponse.json(
          { error: `No se pudo descargar la foto de la propiedad (${resFoto.status})` },
          { status: 502 }
        );
      }
      const fotoBruta = Buffer.from(await resFoto.arrayBuffer());

      // El logo y el aviso legal se miden PRIMERO: el panel no puede invadir su lugar.
      const franjaLegal = await armarFranjaLegal(
        marketingConfig.legal_notice || "",
        especificacion.ancho,
        especificacion.alto
      );
      const logoUrl = urlDelLogo(marketingConfig, payload.logo_variant) || agency?.logo_url;
      let logoListo: Awaited<ReturnType<typeof prepararLogo>> | null = null;
      if (logoUrl) {
        try {
          const resLogo = await fetch(logoUrl);
          if (resLogo.ok) {
            logoListo = await prepararLogo(
              Buffer.from(await resLogo.arrayBuffer()),
              especificacion.ancho,
              marketingConfig.logo_size
            );
          }
        } catch (e) {
          console.error("[PLACA] No se pudo preparar el logo:", e);
        }
      }
      const margen = Math.round(especificacion.ancho * 0.04);
      const reservadoAbajo = (franjaLegal?.alto ?? 0) + (logoListo?.alto ?? 0) + margen * 2;

      const placa = await armarPlacaConFoto({
        foto: fotoBruta,
        ancho: especificacion.ancho,
        alto: especificacion.alto,
        reservadoAbajo,
        contenido: contenidoDelPanel(payload.copy_content.hook, propiedad),
        colorAcento: marketingConfig.brand_colors?.[0],
      });
      imageBuffer = placa.imagen;

      console.log(
        `[PLACA] Con foto real: ${especificacion.ancho}x${especificacion.alto}, foto ${placa.altoFoto}px ` +
          `(escala ${placa.escalaFoto}x), titulo ${placa.renglonesTitulo} renglones cuerpo ${placa.cuerpoTitulo}, ` +
          `${placa.datosDibujados} casillas`
      );
      if (placa.letrasSinDibujo > 0) {
        // Nunca deberia pasar: el hook ya sale sin emojis de sellarContenidoPost y acá pasa otra
        // vez por sinEmojis. Si igual llega uno, la placa dice algo distinto de lo que se escribio.
        console.error(`[ERROR] Placa: ${placa.letrasSinDibujo} letras no se pudieron dibujar`);
      }
      if (placa.escalaFoto > 1.5) {
        console.warn(`[WARN] Placa: la foto se agrandó ${placa.escalaFoto}x, va a salir poco nítida`);
      }

      // El logo y el aviso legal encima, en el hueco reservado.
      const capas: OverlayOptions[] = [];
      if (franjaLegal) capas.push({ input: franjaLegal.png, top: franjaLegal.top, left: 0 });
      if (logoListo) {
        const left = especificacion.ancho - logoListo.ancho - margen;
        const top = especificacion.alto - (franjaLegal?.alto ?? 0) - logoListo.alto - margen;
        capas.push({ input: logoListo.png, top: Math.round(top), left: Math.round(left) });
      }
      if (capas.length > 0) imageBuffer = await sharp(imageBuffer).composite(capas).toBuffer();
    } else {
      // ─── Camino sin foto: como siempre, la imagen la inventa Gemini ──────────────────
      txId = await consumeAiCredits("marketing_ia", 2, `Generate Image: ${payload.format} ${payload.style}`);
      // ... acá va TODO el cuerpo del try/catch que existe hoy, sin cambios ...
    }
```

**Importante para quien implemente:** el camino sin foto se mueve tal cual está, incluido su `try/catch` con el manejo del 429 de Gemini y el registro del costo. La única línea que cambia es que `payload.tokko_property` se reemplaza por `propiedad` (la que busca el servidor) al armar `finalPrompt`, para que el bug del `tokko_property_details` vacío también quede arreglado en ese camino.

`buildImagePrompt` pasa a recibir la propiedad como tercer parámetro:

```ts
const buildImagePrompt = (payload: GenerateImagePayload, branding?: any, propiedad?: TokkoProperty | null): string => {
```

y adentro, `payload.tokko_property` se reemplaza por `propiedad ?? payload.tokko_property`.

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run app/api/marketing-ia/generate-image/camino.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add types/marketing-ia.ts app/api/marketing-ia/generate-image/route.ts app/api/marketing-ia/generate-image/camino.test.ts
git commit -m "feat(marketing): la ruta arma la placa con la foto real y busca la propiedad ella misma"
```

---

### Task 7: El paso de elegir la foto en la pantalla

**Files:**
- Modify: `components/marketing-ia/copy-generator-flow.tsx`

**Interfaces:**
- Consumes: `GET /api/marketing-ia/fotos-propiedad?tokko_id=<id>` → `{ titulo: string, fotos: {thumb: string, image: string}[] }` (ya existe).
- Produces: manda `foto_url` y `propiedad_tokko_id` en el body de `/api/marketing-ia/generate-image`.

- [ ] **Step 1: Agregar el estado y la búsqueda de fotos**

Después de los `useState` que ya existen:

```tsx
  // ── La foto real de la propiedad para la placa ─────────────────────
  // Solo tiene sentido si el perfil IPC está atado a una propiedad de cartera. Si no, la placa
  // sale como salía antes (la imagen la inventa Gemini) y este paso ni aparece.
  const [fotos, setFotos] = useState<{ thumb: string; image: string }[]>([])
  const [fotoElegida, setFotoElegida] = useState<string | null>(null)
  const [cargandoFotos, setCargandoFotos] = useState(false)
  // Cuáles son demasiado chicas para la placa. El ancho NO viene del endpoint: se lo pregunta al
  // navegador cuando ya cargó la miniatura (`naturalWidth`). Así no hay que tocar ni la base ni
  // el sincronizador para avisar algo que es puramente visual. 7 de cada 40 portadas de Central
  // miden menos de 1080 px, así que el aviso se va a ver seguido.
  const [fotosChicas, setFotosChicas] = useState<Record<string, boolean>>({})

  const propiedadDelIpc = (selectedIpc as any)?.propiedad_tokko_id
    ?? (selectedIpc?.flow_data as any)?.propiedad_tokko_id
    ?? null
```

Y un efecto que las traiga al elegir el IPC:

```tsx
  useEffect(() => {
    setFotos([])
    setFotoElegida(null)
    setFotosChicas({})
    if (!propiedadDelIpc || copyType !== 'post') return

    setCargandoFotos(true)
    fetch(`/api/marketing-ia/fotos-propiedad?tokko_id=${propiedadDelIpc}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const lista = data?.fotos ?? []
        setFotos(lista)
        // La portada viene elegida: es la que la inmobiliaria ya eligió como la mejor.
        if (lista[0]) setFotoElegida(lista[0].image)
      })
      .catch(() => { /* Sin fotos, la placa sale como antes. */ })
      .finally(() => setCargandoFotos(false))
  }, [propiedadDelIpc, copyType])
```

- [ ] **Step 2: Mandar la foto al generar**

En `handleGenerateBatch`, en el `body` del `fetch` a `/api/marketing-ia/generate-image`, reemplazar `tokko_property: tokkoProperty,` por:

```tsx
                propiedad_tokko_id: propiedadDelIpc,
                foto_url: fotoElegida ?? undefined,
```

- [ ] **Step 3: Agregar el paso a la pantalla**

Dentro del bloque `{copyType === 'post' && (...)}`, después del bloque del logo:

```tsx
            {/* La foto real de la propiedad. Solo aparece si el perfil está atado a una
                propiedad de cartera: si no, no hay nada que elegir. */}
            {propiedadDelIpc && (
              <div className="space-y-4">
                <Label className="text-sm font-bold">6. Foto de la placa</Label>
                {cargandoFotos ? (
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="aspect-[4/3] rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : fotos.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Esta propiedad todavía no tiene fotos en Tokko. La placa va a salir con una imagen creada por IA.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2 max-h-[260px] overflow-y-auto pr-1">
                      {fotos.map((f, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFotoElegida(f.image)}
                          className={cn(
                            "relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition",
                            fotoElegida === f.image ? "border-accent ring-1 ring-accent" : "border-transparent hover:border-accent/50"
                          )}
                        >
                          <img
                            src={f.thumb || f.image}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-full object-cover"
                            // El ancho real lo sabe el navegador recién cuando la bajó.
                            onLoad={(e) => {
                              const ancho = (e.currentTarget as HTMLImageElement).naturalWidth
                              if (ancho && ancho < 1080) {
                                setFotosChicas((prev) => (prev[f.image] ? prev : { ...prev, [f.image]: true }))
                              }
                            }}
                          />
                          {fotosChicas[f.image] && (
                            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white py-0.5">
                              poco nítida
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Las 3 placas salen con esta foto, tal cual está en Tokko. Sin retocar.
                    </p>
                  </>
                )}
              </div>
            )}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/marketing-ia/copy-generator-flow.tsx
git commit -m "feat(marketing): el asesor elige con que foto de la propiedad sale la placa"
```

---

### Task 8: Probarlo en el navegador, que es lo único que cuenta

Las pruebas dicen que las medidas están bien. **No dicen que se vea bien ni que ande.**

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar el dev server en un puerto propio**

El 3007 es de la terminal de ACM de Leonardo. Usar 3011.

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM-anuncios"
npm run dev -- -p 3011
```

Con `run_in_background`, que el harness lo mantiene vivo.

- [ ] **Step 2: Entrar con la cuenta correcta**

`http://localhost:3011` → **PRISMAIA - VAKDOR**. **Nunca entrar como un asesor de Central.**

- [ ] **Step 3: Generar 3 variantes de post sobre un IPC con propiedad**

Ir a Marketing IA → elegir un IPC de tipo "vender" que tenga propiedad → Post/Texto → elegir una foto → generar.

Verificar, con el ojo:

- El texto sale en **6 a 8 párrafos** con renglón en blanco entre medio, y con algún emoji al final de algunos. **Contarlos.**
- **La placa muestra la propiedad de verdad**, no un living inventado.
- **En la placa no hay ni un emoji.**
- El aviso legal se lee entero, el logo no se monta sobre nada, las casillas no se desbordan.
- "Copiar Todo" pega el texto con los renglones en blanco puestos.

- [ ] **Step 4: Los tres formatos y los dos temas**

Repetir con Post vertical, Reel/Historia y Post cuadrado. Y con el tema claro y el oscuro: el panel es un color nuevo.

- [ ] **Step 5: El celular**

Con Playwright CLI y `page.setViewportSize` (el MCP de Chrome no sirve acá). Verificar que la tira de miniaturas se pueda tocar: las casillas de 44px son regla global.

- [ ] **Step 6: El camino sin propiedad no se rompió**

Generar un post con un IPC de tipo **captar** (sin propiedad). Verificar que **no aparece el paso 6** y que la placa sale como antes, con la imagen de Gemini.

- [ ] **Step 7: Guardar la evidencia**

Capturas a `scratch/` (no van a git). Es lo que se le muestra a Leonardo.

- [ ] **Step 8: Commit de la bitácora**

Escribir la entrada del día en `docs/interno/bitacora-sesiones.md`: qué se construyó, qué se decidió, los errores propios (el número de 16:9 que estaba mal), y qué quedó pendiente (el título corto para la placa).

```bash
git add docs/interno/bitacora-sesiones.md
git commit -m "docs: bitacora del creador de anuncios"
```

---

### Task 9: El OK de Leonardo y el merge

- [ ] **Step 1: Mostrarle**

Pasarle el link `http://localhost:3011` y las capturas. **No mergear nada sin su OK.**

- [ ] **Step 2: Traer main hacia la rama**

`main` suele estar checkouteado en otra carpeta, así que no se hace `git checkout main`.

```bash
git fetch origin
git merge origin/main --no-edit
```

- [ ] **Step 3: Correr las pruebas sobre el código ya mezclado**

Run: `npx vitest run lib/marketing-ia lib/tipografia app/api/marketing-ia`
Expected: PASS.

- [ ] **Step 4: Verificar que el push es fast-forward**

```bash
git merge-base --is-ancestor origin/main HEAD
```

Expected: código 0. Si no, volver a mezclar.

- [ ] **Step 5: Pushear**

```bash
git push origin HEAD:main
git push -u origin feat/anuncios-texto-y-placa
```

- [ ] **Step 6: Cerrar las dos sugerencias**

Pasar `system_feedback` a `resuelta` para `79226ee2-93da-4f66-81b6-1edba0b705b9` y `ce6b815b-782e-496b-9282-2082110e90b7`, con la respuesta para Maximiliano. **Escribir en la base necesita el OK de Leonardo**: proponerle el UPDATE exacto y esperar.

---

## Self-Review

**Cobertura del spec:**

| Sección del spec | Tarea |
|---|---|
| El texto en párrafos con emojis | 1, 2 |
| El hook sin emoji | 1 (`sinEmojis`), 2 (`sellarContenidoPost`), 6 (`contenidoDelPanel`) |
| Los dos prompts que decían cosas distintas | 2 |
| `letrasRotas` no cuenta `.notdef` | 3 |
| El panel se mide, no se asume | 5 (`medirPanel`, con la prueba del choque) |
| La foto no se toca | 5 (prueba píxel) , 6 (no pasa por `generateImage`) |
| Aviso de foto chica | 5 (`escalaFoto`), 6 (log), 7 ("poco nítida") |
| El paso de elegir foto | 7 |
| Sin propiedad, todo igual que hoy | 6 (el `else`), 7 (el paso no aparece), 8 Step 6 |
| Créditos: el camino con foto no gasta | 6 (`txId` solo en el `else`) |
| El bug de `tokko_property_details` | 6 (`traerPropiedad`) |
| Pruebas en navegador, dos temas, celular | 8 |

**Sin placeholders:** cada paso de código tiene el código. No hay "TBD" ni "manejar los errores".

**Consistencia de tipos:** `ContenidoPanel`, `MedidaPanel`, `PlacaArmada` se definen en Task 5 y se usan con esos mismos nombres en Task 6. `sinEmojis`/`armarDesarrollo`/`sellarContenidoPost`/`REGLAS_POST` se definen en Task 1-2 y se importan en 2 y 6. `repartirEnRenglones` se mueve en Task 4 y se usa en Task 5.

**Una dependencia de orden que importa:** Task 4 (mover `repartirEnRenglones`) tiene que ir **antes** de Task 5, que la importa desde `@/lib/tipografia/contornos`.

**Un hueco que el auto-chequeo encontró y quedó cerrado:** `fotos-propiedad/route.ts` no devuelve el ancho de cada foto, así que el aviso "poco nítida" iba a quedar inerte para siempre. Se cerró midiendo en el cliente con `naturalWidth` cuando la miniatura terminó de cargar (Task 7): no toca ni la base ni el sincronizador. Funciona porque ese endpoint devuelve la **misma URL** en `thumb` y en `image`, así que el ancho de la miniatura *es* el de la foto.

**Lo que queda explícitamente afuera** (del spec, §6): el título corto aparte para la placa, agrandar con IA las fotos chicas, un segundo diseño para las fotos verticales, y una foto distinta por variante.
