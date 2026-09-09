import { describe, it, expect } from "vitest";
import { decidirEnlace, type CandidataDeEnlace } from "./enlace";

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
