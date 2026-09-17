import { describe, it, expect } from "vitest";
import { armarAvisos, requiereEstudio } from "./avisos";
import type { CatastroParcela, Edificabilidad, FilaCur } from "./tipos";

const lote: CatastroParcela = { smp: "053-050-006", direccion: "ROOSEVELT 4554", superficieTotal: 375, superficieCubierta: 212, frente: 8.66, fondo: 43.3, propiedadHorizontal: false, pisosSobreRasante: 1, unidadesFuncionales: 0, centroide: [-58.48, -34.57] };
const cur: FilaCur = { smp: "053-050-006", uniEdif: [17.2], planoL: 24.2, tipoMza: "TIPICA", catalogado: 0, distGrp: null, distEsp: null, distCpu: "R2b I", barrio: "VILLA URQUIZA", comuna: "12", publicado: "2026-06-24" };
const edif = { modo: "oficial", unidades: ["USAM"], alturaMaxima: 17.2, planoLimite: 24.2, plantas: [], m2Construibles: 1, m2Vendibles: 0.8, huella: null } as Edificabilidad;

describe("avisos de la prefactibilidad", () => {
  it("lote común: ningún aviso", () => {
    expect(armarAvisos({ cur, lote, manzanaTipo: "TIPICA", esEsquina: false, edificabilidad: edif })).toEqual([]);
  });
  it("esquina y manzana atípica: avisos fuertes", () => {
    const a = armarAvisos({ cur, lote, manzanaTipo: "ATIPICA", esEsquina: true, edificabilidad: edif });
    expect(a.map((x) => x.clave).sort()).toEqual(["atipica", "esquina"]);
    expect(requiereEstudio(a)).toBe(true);
  });
  it("área especial, catalogado y dos alturas", () => {
    const a = armarAvisos({ cur: { ...cur, distGrp: "APH", distEsp: "APH 45", catalogado: 1, uniEdif: [38, 31.2] }, lote, manzanaTipo: "TIPICA", esEsquina: false, edificabilidad: edif });
    expect(a.map((x) => x.clave).sort()).toEqual(["area_especial", "catalogado", "dos_alturas"]);
    expect(a.find((x) => x.clave === "area_especial")!.texto).toContain("APH 45");
  });
  it("PH con muchas unidades: aviso suave; plano límite del CSV distinto al de la unidad: fuerte", () => {
    const a = armarAvisos({ cur: { ...cur, planoL: 29.8 }, lote: { ...lote, propiedadHorizontal: true, unidadesFuncionales: 240, pisosSobreRasante: 16 }, manzanaTipo: "TIPICA", esEsquina: false, edificabilidad: edif });
    expect(a.find((x) => x.clave === "ph_consolidado")!.fuerte).toBe(false);
    expect(a.find((x) => x.clave === "plano_limite_raro")!.fuerte).toBe(true);
  });
  it("sin envolvente oficial y sin dato de código", () => {
    const a = armarAvisos({ cur: null, lote, manzanaTipo: null, esEsquina: false, edificabilidad: null });
    expect(a.map((x) => x.clave).sort()).toEqual(["sin_dato_codigo", "sin_envolvente"]);
  });
});
