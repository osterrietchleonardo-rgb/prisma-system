import { describe, it, expect } from "vitest";
import { detectarHuecos, MINIMO_DOCUMENTOS, TOPE_DIFF_MS } from "./deteccion";

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

// Lo de abajo es lo que se rompe de verdad cuando la detección falla: no que
// no encuentre nada, sino que encuentre de más o parta un dato en pedazos.
describe("detectarHuecos: que no parta ni pegue de más", () => {
  it("son tres datos y salen tres huecos, ni uno más", () => {
    // El CUIT le llega al diff partido en 20 / - / 11111111 / - / 1: si no se
    // vuelve a pegar, un solo dato sale como tres huecos.
    const r = detectarHuecos(TRES);
    expect(r.huecos.map((h) => h.valores.a)).toEqual(["Juan Pérez", "20-11111111-1", "30"]);
    expect(r.huecos.map((h) => h.valores.b)).toEqual(["María González", "27-22222222-2", "35"]);
    expect(r.huecos.map((h) => h.valores.c)).toEqual(["Pedro Gómez", "20-33333333-3", "40"]);
  });

  it("dos datos separados por una coma NO se fusionan en uno", () => {
    // El pegamento junta "20-11" pero no puede juntar "Juan, 30": en cuanto
    // hay un espacio de por medio son dos datos distintos.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Asesor Juan, comisión 30%, zona Norte." },
      { advisorId: "b", texto: "Asesor María, comisión 35%, zona Sur." },
      { advisorId: "c", texto: "Asesor Pedro, comisión 40%, zona Oeste." },
    ]);
    expect(r.huecos.map((h) => h.valores.a)).toEqual(["Juan", "30", "Norte"]);
    expect(r.huecos.map((h) => h.valores.c)).toEqual(["Pedro", "40", "Oeste"]);
  });

  it("una coma y un espacio NO pegan dos datos, aunque sean pocos caracteres", () => {
    // El caso justo: entre "Juan" y "30" hay solo ", ". Es corto y no tiene ni
    // letras ni números, así que lo único que los separa es el espacio.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Ref Juan, 30% ok." },
      { advisorId: "b", texto: "Ref María, 35% ok." },
      { advisorId: "c", texto: "Ref Pedro, 40% ok." },
    ]);
    expect(r.huecos.map((h) => h.valores.a)).toEqual(["Juan", "30"]);
    expect(r.huecos.map((h) => h.valores.b)).toEqual(["María", "35"]);
  });

  it("un número con punto y coma de miles es un solo dato", () => {
    // Al diff le llega partido en 1 / . / 500 / , / 50.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Total 1.500,50 hoy" },
      { advisorId: "b", texto: "Total 2.300,75 hoy" },
      { advisorId: "c", texto: "Total 9.100,25 hoy" },
    ]);
    expect(r.huecos.map((h) => h.valores.a)).toEqual(["1.500,50"]);
    expect(r.huecos.map((h) => h.valores.c)).toEqual(["9.100,25"]);
  });

  it("una fecha con barras es un solo dato", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "Vigente desde 12/03/2024 hasta nuevo aviso." },
      { advisorId: "b", texto: "Vigente desde 05/11/2025 hasta nuevo aviso." },
      { advisorId: "c", texto: "Vigente desde 01/03/2026 hasta nuevo aviso." },
    ]);
    expect(r.huecos.map((h) => h.valores.a)).toEqual(["12/03/2024"]);
    expect(r.huecos.map((h) => h.valores.b)).toEqual(["05/11/2025"]);
  });

  it("un espacio de más en el documento base no corre los valores", () => {
    // Word mete espacios dobles sin que nadie se dé cuenta. Antes esto
    // dejaba el valor como " Juan Pérez" o directamente descartaba el asesor.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Contrato  con   Juan Pérez, comisión del 30%." },
      { advisorId: "b", texto: "Contrato con María González, comisión del 35%." },
      { advisorId: "c", texto: "Contrato con  Pedro Gómez,  comisión del 40%." },
    ]);
    expect(r.advertencias).toEqual([]);
    expect(r.huecos.map((h) => h.valores.a)).toEqual(["Juan Pérez", "30"]);
    expect(r.huecos.map((h) => h.valores.b)).toEqual(["María González", "35"]);
    expect(r.huecos.map((h) => h.valores.c)).toEqual(["Pedro Gómez", "40"]);
  });

  it("una diferencia de solo espacios no es un hueco", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "Hola  Juan  Pérez." },
      { advisorId: "b", texto: "Hola Juan Pérez." },
      { advisorId: "c", texto: "Hola   Juan Pérez." },
    ]);
    expect(r.huecos).toEqual([]);
  });

  it("si la base no dice nada ahí, el hueco queda vacío para ella y con texto para el resto", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "Hola, firma el titular." },
      { advisorId: "b", texto: "Hola, firma el titular Juan Pérez." },
      { advisorId: "c", texto: "Hola, firma el titular Pedro Gómez." },
    ]);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0].valores).toEqual({ a: "", b: "Juan Pérez", c: "Pedro Gómez" });
  });

  it("el contexto trae la frase de alrededor, no solo el dato", () => {
    const r = detectarHuecos(TRES);
    const nombre = r.huecos[0];
    expect(nombre.contexto).toContain("Contrato con");
    expect(nombre.contexto).toContain("Juan Pérez");
    expect(nombre.contexto).toContain("CUIT");
  });

  it("el textoBase es el del primer documento que sirve, no el del primero a secas", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "   " },
      { advisorId: "b", texto: "Hola Juan." },
      { advisorId: "c", texto: "Hola Pedro." },
      { advisorId: "d", texto: "Hola Ana." },
    ]);
    expect(r.textoBase).toBe("Hola Juan.");
    expect(r.huecos.map((h) => h.valores)).toEqual([{ b: "Juan", c: "Pedro", d: "Ana" }]);
  });

  it("dos documentos con el mismo asesor: usa uno y avisa, en vez de pisar el valor", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "Hola Juan." },
      { advisorId: "a", texto: "Hola Otro." },
      { advisorId: "b", texto: "Hola Pedro." },
      { advisorId: "c", texto: "Hola Ana." },
    ]);
    expect(r.advertencias.some((x) => x.includes("más de un documento"))).toBe(true);
    expect(r.huecos[0].valores).toEqual({ a: "Juan", b: "Pedro", c: "Ana" });
  });

  it("con un solo documento no inventa huecos", () => {
    const r = detectarHuecos([{ advisorId: "a", texto: "Hola Juan." }]);
    expect(r.huecos).toEqual([]);
    expect(r.textoBase).toBe("Hola Juan.");
  });

  it("sin documentos devuelve vacío y avisa, en vez de reventar", () => {
    const r = detectarHuecos([]);
    expect(r.huecos).toEqual([]);
    expect(r.textoBase).toBe("");
    expect(r.advertencias.length).toBeGreaterThan(0);
  });
});

// Un texto largo y otro completamente distinto: el diff no llega a terminar
// con el tope en 0 y esa comparación se cae. Medido: 200 de 200 veces aborta,
// y 200 de 200 el par idéntico pasa por el camino rápido y NO aborta.
const LARGO = Array.from({ length: 400 }, (_, i) => `alfa${i} bravo${i}`).join(" ");
const OTRO_LARGO = Array.from({ length: 400 }, (_, i) => `zulu${i * 7} yanqui${i * 3}`).join(" ");

describe("detectarHuecos: abreviaturas, cuentas y quién entró de verdad", () => {
  it("una razón social de largo distinto no deja a nadie afuera", () => {
    // El diff emite `+ "L. "` con el espacio adentro del agregado, y el tramo
    // igual que sigue arranca con letra. Antes eso descartaba a los dos
    // asesores y la plantilla salía sin un solo hueco, con luz verde.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Firma Gomez S.A. hoy." },
      { advisorId: "b", texto: "Firma Martinez S.R.L. hoy." },
      { advisorId: "c", texto: "Firma Lopez S.A.S. hoy." },
    ]);
    expect(r.advertencias).toEqual([]);
    expect(r.documentosUsados).toEqual(["a", "b", "c"]);
    expect(r.huecos).toHaveLength(2);
    expect(r.huecos[0].valores).toEqual({ a: "Gomez", b: "Martinez", c: "Lopez" });
    expect(r.huecos[1].valores).toEqual({ a: "A.", b: "R.L.", c: "A.S." });
  });

  it("iniciales de largo distinto tampoco", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "Asesor J.P. presente." },
      { advisorId: "b", texto: "Asesor M.G.R. presente." },
      { advisorId: "c", texto: "Asesor L.T.V. presente." },
    ]);
    expect(r.advertencias).toEqual([]);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0].valores).toEqual({ a: "J.P.", b: "M.G.R.", c: "L.T.V." });
  });

  it("el asesor cuya comparación se cayó NO figura en documentosUsados", () => {
    // Sin esta lista, esto es indistinguible de "los tres son idénticos":
    // las dos cosas devuelven huecos vacío y las mismas llaves.
    const r = detectarHuecos(
      [
        { advisorId: "a", texto: LARGO },
        { advisorId: "b", texto: LARGO },
        { advisorId: "c", texto: OTRO_LARGO },
      ],
      { topeDiffMs: 0 },
    );
    expect(r.huecos).toEqual([]);
    expect(r.documentosUsados).toEqual(["a", "b"]);
  });

  it("y se avisa por su nombre cuando la comparación se cae", () => {
    const r = detectarHuecos(
      [
        { advisorId: "a", texto: LARGO },
        { advisorId: "b", texto: LARGO },
        { advisorId: "c", texto: OTRO_LARGO },
      ],
      { topeDiffMs: 0 },
    );
    expect(r.advertencias.some((x) => x.includes("No se pudo comparar") && x.includes("c"))).toBe(true);
  });

  it("documentosUsados deja afuera al vacío y al repetido", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "Hola Juan." },
      { advisorId: "vacio", texto: "   " },
      { advisorId: "a", texto: "Hola Otro." },
      { advisorId: "b", texto: "Hola Pedro." },
      { advisorId: "c", texto: "Hola Ana." },
    ]);
    expect(r.documentosUsados).toEqual(["a", "b", "c"]);
  });

  it("el valor del otro asesor tampoco se lleva el espacio de cola", () => {
    // El diff emite `+ "Otra mas. "`. Ese espacio terminaba guardado en la
    // base de datos y escrito en el contrato de esa persona.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Uno. Fin." },
      { advisorId: "b", texto: "Uno. Otra mas. Fin." },
      { advisorId: "c", texto: "Uno. Distinta cosa. Fin." },
    ]);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0].valores).toEqual({ a: "", b: "Otra mas.", c: "Distinta cosa." });
  });

  it("un separador de cuatro caracteres ya no pega dos datos", () => {
    // El largo del pegamento decide de verdad: con el tope más grande,
    // "Juan--.-30" pasaría a ser un dato solo.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Ref Juan--.-30 ok." },
      { advisorId: "b", texto: "Ref Maria--.-35 ok." },
      { advisorId: "c", texto: "Ref Pedro--.-40 ok." },
    ]);
    expect(r.huecos.map((h) => h.valores.a)).toEqual(["Juan", "30"]);
    expect(r.huecos.map((h) => h.valores.b)).toEqual(["Maria", "35"]);
  });

  it("el indice numera los huecos de corrido, no es siempre el mismo", () => {
    // El test de orden del brief ordena la lista que él mismo devuelve: con
    // los índices en [0,0,0] tampoco se cae. Este los mide.
    const r = detectarHuecos(TRES);
    expect(r.huecos.map((h) => h.indice)).toEqual([0, 1, 2]);
  });
});

describe("detectarHuecos: que el hueco quede parejo entre los asesores", () => {
  it("un dato pegado al final del documento no se lleva el salto de línea", () => {
    // Se junta todo: el hueco pasa por el pegamento (la fecha) Y es lo último
    // del documento. La rama que pega dos rangos se salteaba el recorte, así
    // que la base quedaba con el "\n" y los otros asesores con su fecha
    // limpia. Desparejo entre asesores es peor que parejo mal.
    const r = detectarHuecos([
      { advisorId: "a", texto: "VIG: 12/03/2024\n" },
      { advisorId: "b", texto: "VIG: 05/11/2025\n" },
      { advisorId: "c", texto: "VIG: 28/02/2026\n" },
    ]);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0].valores).toEqual({ a: "12/03/2024", b: "05/11/2025", c: "28/02/2026" });
  });

  it("lo mismo con un CUIT y con un importe al final", () => {
    const cuit = detectarHuecos([
      { advisorId: "a", texto: "CUIT 20-11111111-1\n" },
      { advisorId: "b", texto: "CUIT 27-22222222-2\n" },
      { advisorId: "c", texto: "CUIT 20-33333333-3\n" },
    ]);
    expect(cuit.huecos[0].valores).toEqual({ a: "20-11111111-1", b: "27-22222222-2", c: "20-33333333-3" });

    const importe = detectarHuecos([
      { advisorId: "a", texto: "Total 1.500,50 " },
      { advisorId: "b", texto: "Total 2.300,75" },
      { advisorId: "c", texto: "Total 9.100,25" },
    ]);
    expect(importe.huecos[0].valores).toEqual({ a: "1.500,50", b: "2.300,75", c: "9.100,25" });
  });

  it("el valor del otro asesor tampoco se lleva el espacio de CABEZA", () => {
    // El diff emite `+ "  Maria Gonzalez Lopez"` cuando ese documento trae
    // espacios de sobra antes del campo. Recortar solo la cola no alcanza.
    const r = detectarHuecos([
      { advisorId: "a", texto: "Asesor: Juan, ok." },
      { advisorId: "b", texto: "Asesor:   Maria Gonzalez Lopez, ok." },
      { advisorId: "c", texto: "Asesor: Pedro Gomez, ok." },
    ]);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0].valores).toEqual({ a: "Juan", b: "Maria Gonzalez Lopez", c: "Pedro Gomez" });
  });

  it("ni el salto de línea de cabeza, que en un .docx es lo mismo", () => {
    const r = detectarHuecos([
      { advisorId: "a", texto: "Zona: Norte." },
      { advisorId: "b", texto: "Zona:\n  Sur profundo." },
      { advisorId: "c", texto: "Zona: Oeste." },
    ]);
    expect(r.huecos[0].valores).toEqual({ a: "Norte", b: "Sur profundo", c: "Oeste" });
  });

  it("el tope del diff tiene que seguir siendo finito: es la baranda", () => {
    // Sin tope, dos contratos largos y muy distintos cuelgan la pantalla del
    // director y nada se pone en rojo. El valor puede cambiar; que sea finito
    // y positivo, no.
    expect(Number.isFinite(TOPE_DIFF_MS)).toBe(true);
    expect(TOPE_DIFF_MS).toBeGreaterThan(0);
  });
});
