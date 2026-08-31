import { describe, it, expect } from "vitest";
import { armarFranjaLegal } from "./aviso-legal";

// El aviso real que pidió Central (sugerencia de Kevin Arlandi, 31-ago-2026): 841 caracteres.
const AVISO_LARGO = `AVISO LEGAL: Todas las operaciones de intermediación inmobiliaria son llevadas a cabo y concluidas exclusivamente por los corredores matriculados Gustavo Guastello CUCICBA 869 y Carlos Belsito CMCPSI 5790. En cumplimiento de la Ley 2.340 (CABA), Ley 10.973 (Prov. Bs. As.), DNU 274/2019 de Lealtad Comercial, Ley 24.240 de Defensa del Consumidor, el Código Civil y Comercial de la Nación y los códigos de ética profesional vigentes, se deja expresa constancia de que los asistentes y colaboradores / Client Support actúan únicamente en tareas de asistencia técnica/administrativa y NO ejercen actos de corretaje inmobiliario. Las fotografías, renders e imágenes publicadas son de carácter meramente ilustrativo y no contractual. Más información en www.CentralRE.com.ar
Central Real Estate Argentina | Mendoza 1962, Belgrano, CABA | 4789-3700`;

const AVISO_CORTO = "Mat. CUCICBA 869 - Corredor responsable: Gustavo Guastello.";

describe("armarFranjaLegal", () => {
  it("no dibuja nada si no hay texto", () => {
    expect(armarFranjaLegal("", 1080, 1080)).toBeNull();
    expect(armarFranjaLegal("   \n  ", 1080, 1080)).toBeNull();
  });

  it("un aviso corto entra en un renglón y con la letra más grande", () => {
    const f = armarFranjaLegal(AVISO_CORTO, 1080, 1080)!;
    expect(f.renglones).toBe(1);
    expect(f.cuerpo).toBe(22);
  });

  it("un aviso largo achica la letra pero no se pasa del tope de alto", () => {
    const f = armarFranjaLegal(AVISO_LARGO, 1080, 1080)!;
    expect(f.cuerpo).toBeGreaterThanOrEqual(13);
    expect(f.alto).toBeLessThanOrEqual(Math.round(1080 * 0.17));
  });

  // Lo que de verdad importa: un aviso legal recortado dice otra cosa que el que escribió el
  // director. Ninguna palabra puede perderse por el camino.
  it("no pierde ni una palabra del texto original", () => {
    const f = armarFranjaLegal(AVISO_LARGO, 1080, 1080)!;
    const original = AVISO_LARGO.replace(/\s+/g, " ").trim();
    const repartido = f.texto.join(" ");
    expect(repartido).toBe(original);
    // Un solo NaN en las coordenadas corta el dibujo entero y el aviso sale a medias.
    expect(f.svg.toString("utf8")).not.toContain("NaN");
  });

  it("escala con el ancho de la imagen", () => {
    const chico = armarFranjaLegal(AVISO_CORTO, 540, 540)!;
    const grande = armarFranjaLegal(AVISO_CORTO, 1080, 1080)!;
    expect(grande.cuerpo).toBeGreaterThan(chico.cuerpo);
  });

  it("el SVG cubre toda la imagen y la franja termina en el borde de abajo", () => {
    const f = armarFranjaLegal(AVISO_LARGO, 1080, 1920)!;
    const svg = f.svg.toString("utf8");
    expect(svg).toContain('width="1080" height="1920"');
    expect(svg).toContain('<rect x="0"');
  });
});
