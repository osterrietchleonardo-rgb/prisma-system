import { describe, it, expect } from "vitest";
import {
  decidirEnlace,
  puedenSerLasDosPuntas,
  ladoDeParticipacion,
  type CandidataDeEnlace,
} from "./enlace";

const NUEVO = "op-nueva";
const nuevoId = () => NUEVO;

describe("decidirEnlace", () => {
  it("sin candidatas no enlaza nada", () => {
    expect(decidirEnlace([], nuevoId)).toEqual({ operacionId: null, aEnlazar: [] });
  });

  it("con una candidata suelta, crea la operación y las une a las dos", () => {
    // El caso normal: Ana cargó su punta sin enlace, llega Bruno.
    const candidatas: CandidataDeEnlace[] = [{ id: "fila-ana", operacion_id: null }];
    expect(decidirEnlace(candidatas, nuevoId)).toEqual({
      operacionId: NUEVO,
      aEnlazar: ["fila-ana"],
    });
  });

  it("si la otra punta ya tiene operación, se suma a esa en vez de crear otra", () => {
    const candidatas: CandidataDeEnlace[] = [{ id: "fila-ana", operacion_id: "op-vieja" }];
    expect(decidirEnlace(candidatas, nuevoId)).toEqual({
      operacionId: "op-vieja",
      aEnlazar: [],
    });
  });

  it("a las que ya están enlazadas no las vuelve a tocar", () => {
    // Escribirles el mismo valor no cambia nada y les ensucia el updated_at a
    // filas de otros asesores.
    const candidatas: CandidataDeEnlace[] = [
      { id: "fila-ana", operacion_id: "op-vieja" },
      { id: "fila-tercera", operacion_id: null },
    ];
    expect(decidirEnlace(candidatas, nuevoId)).toEqual({
      operacionId: "op-vieja",
      aEnlazar: ["fila-tercera"],
    });
  });

  it("con DOS operaciones distintas en la misma dirección, no enlaza", () => {
    // La misma propiedad vendida dos veces en el año. Elegir una al azar haría
    // desaparecer una venta entera del volumen; no enlazar sólo lo deja
    // inflado, y eso el director lo puede corregir.
    const candidatas: CandidataDeEnlace[] = [
      { id: "fila-a", operacion_id: "op-1" },
      { id: "fila-b", operacion_id: "op-2" },
    ];
    expect(decidirEnlace(candidatas, nuevoId)).toEqual({ operacionId: null, aEnlazar: [] });
  });

  it("dos filas de la MISMA operación no son ambiguas", () => {
    // Tres asesores en una operación ya enlazada: se suma a la que hay.
    const candidatas: CandidataDeEnlace[] = [
      { id: "fila-a", operacion_id: "op-1" },
      { id: "fila-b", operacion_id: "op-1" },
    ];
    expect(decidirEnlace(candidatas, nuevoId)).toEqual({ operacionId: "op-1", aEnlazar: [] });
  });

  it("varias sueltas se unen todas bajo la misma operación nueva", () => {
    const candidatas: CandidataDeEnlace[] = [
      { id: "fila-a", operacion_id: null },
      { id: "fila-b", operacion_id: undefined },
    ];
    expect(decidirEnlace(candidatas, nuevoId)).toEqual({
      operacionId: NUEVO,
      aEnlazar: ["fila-a", "fila-b"],
    });
  });

  it("nunca devuelve una operación sin id cuando decidió enlazar", () => {
    // Si devolviera null con filas a enlazar, esas filas quedarían con un
    // operacion_id vacío y el volumen se seguiría duplicando en silencio.
    const casos: CandidataDeEnlace[][] = [
      [{ id: "a", operacion_id: null }],
      [{ id: "a", operacion_id: "op-1" }],
      [{ id: "a", operacion_id: "op-1" }, { id: "b", operacion_id: "op-2" }],
      [],
    ];
    for (const candidatas of casos) {
      const d = decidirEnlace(candidatas, nuevoId);
      if (d.aEnlazar.length > 0) expect(d.operacionId).toBeTruthy();
    }
  });
});

describe("ladoDeParticipacion", () => {
  it("agrupa por lado del negocio", () => {
    expect(ladoDeParticipacion("Solo Vendedor")).toBe("ofrece");
    expect(ladoDeParticipacion("Solo Locador")).toBe("ofrece");
    expect(ladoDeParticipacion("Solo Comprador")).toBe("busca");
    expect(ladoDeParticipacion("Solo Locatario")).toBe("busca");
    expect(ladoDeParticipacion("Ambas puntas")).toBe("ambas");
  });

  it("lo que no reconoce queda sin definir", () => {
    expect(ladoDeParticipacion(null)).toBe("sin definir");
    expect(ladoDeParticipacion("")).toBe("sin definir");
    expect(ladoDeParticipacion("Dos Puntas")).toBe("sin definir");
  });
});

describe("puedenSerLasDosPuntas", () => {
  it("vendedor y comprador son las dos puntas de una venta", () => {
    expect(puedenSerLasDosPuntas("Solo Vendedor", "Solo Comprador")).toBe(true);
    expect(puedenSerLasDosPuntas("Solo Comprador", "Solo Vendedor")).toBe(true);
  });

  it("locador y locatario son las dos puntas de un alquiler", () => {
    expect(puedenSerLasDosPuntas("Solo Locador", "Solo Locatario")).toBe(true);
  });

  it("quien hizo AMBAS puntas no se enlaza con nadie", () => {
    // El caso que se colo en produccion: una fila "Ambas puntas" enlazada con
    // una "Solo Vendedor" hacia que una sola operacion contara 1,5 negocios.
    expect(puedenSerLasDosPuntas("Ambas puntas", "Solo Vendedor")).toBe(false);
    expect(puedenSerLasDosPuntas("Solo Comprador", "Ambas puntas")).toBe(false);
    expect(puedenSerLasDosPuntas("Ambas puntas", "Ambas puntas")).toBe(false);
  });

  it("dos del mismo lado no pueden ser las dos puntas", () => {
    // Dos asesores no representaron los dos al vendedor de la misma venta.
    expect(puedenSerLasDosPuntas("Solo Vendedor", "Solo Vendedor")).toBe(false);
    expect(puedenSerLasDosPuntas("Solo Comprador", "Solo Comprador")).toBe(false);
    expect(puedenSerLasDosPuntas("Solo Vendedor", "Solo Locador")).toBe(false);
  });

  it("si a alguna le falta la participacion, no se puede probar la contradiccion", () => {
    // Las filas historicas se cargaron antes de que existiera el campo. Decide
    // la persona, no el sistema.
    expect(puedenSerLasDosPuntas("Solo Vendedor", null)).toBe(true);
    expect(puedenSerLasDosPuntas(null, "Solo Vendedor")).toBe(true);
    expect(puedenSerLasDosPuntas(null, null)).toBe(true);
  });

  it("cruzar venta con alquiler igual cuenta como dos puntas distintas", () => {
    // Raro, pero no es contradictorio: los lados son opuestos. Que la operacion
    // mezcle venta y alquiler es un problema de carga, no de este control.
    expect(puedenSerLasDosPuntas("Solo Vendedor", "Solo Locatario")).toBe(true);
  });
});
