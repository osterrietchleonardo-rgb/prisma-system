import { describe, it, expect } from "vitest";
import { filaCurDesdeCsv } from "./filas-cur";

// Fila real del CSV (Roosevelt 4554 no; Zuviría 3939, gid 498024), tal cual viene.
const FILA = { gid: "498024", smp: "056-068-040b", seccion: "056", manzana: "068", parcela: "040b", uni_edif_1: "17.2", uni_edif_2: "0", uni_edif_3: "0", uni_edif_4: "0", uso_1: "3", dist_1_grp: "", dist_1_esp: "", dist_2_grp: "", dist_2_esp: "", catalogado: "0", tipo_mza: "ATIPICA", barrio: "PARQUE AVELLANEDA", comuna: "9", plano_l: "24.2", dist_cpu_1: "R2b II", fot_em_1: "1.2", alicuota: "0.1", inc_uva_21: "50" };

describe("una fila del CSV del Código → una fila de gcba_parcelas_cur", () => {
  it("tipa números, arma el arreglo de alturas sin ceros y guarda las fechas", () => {
    const f = filaCurDesdeCsv(FILA, "2026-06-24")!;
    expect(f.smp).toBe("056-068-040b");
    expect(f.uni_edif).toEqual([17.2]);
    expect(f.plano_l).toBe(24.2); expect(f.tipo_mza).toBe("ATIPICA"); expect(f.catalogado).toBe(0);
    expect(f.dist_1_grp).toBeNull(); expect(f.dist_cpu_1).toBe("R2b II"); expect(f.fot_em_1).toBe(1.2);
    expect(f.alicuota).toBe(0.1); expect(f.inc_uva_21).toBe(50);
    expect(f.fuente_fecha).toBe("2024-12-31"); expect(f.publicado).toBe("2026-06-24");
  });
  it("dos alturas → dos elementos; sin smp → null", () => {
    expect(filaCurDesdeCsv({ ...FILA, uni_edif_2: "31.2", uni_edif_1: "38" }, "2026-06-24")!.uni_edif).toEqual([38, 31.2]);
    expect(filaCurDesdeCsv({ ...FILA, smp: "" }, "2026-06-24")).toBeNull();
  });
});
