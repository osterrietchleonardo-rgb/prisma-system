import { describe, it, expect } from "vitest";
import {
  PARTICIPACIONES,
  negociosDeCierre,
  transaccionesDe,
  type LogParaConteo,
} from "./participacion";

const cierre = (participacion?: unknown): LogParaConteo => ({
  type: "cierre",
  metadata: participacion === undefined ? {} : { participacion },
});

describe("negociosDeCierre", () => {
  it("las dos puntas valen un negocio entero", () => {
    expect(negociosDeCierre("Ambas puntas")).toBe(1);
  });

  it("una sola punta vale medio negocio, sea venta o alquiler", () => {
    expect(negociosDeCierre("Solo Vendedor")).toBe(0.5);
    expect(negociosDeCierre("Solo Comprador")).toBe(0.5);
    // Estas dos son las que se habían quedado afuera en dos de las tres copias
    // de la regla: un alquiler de una punta contaba como negocio entero.
    expect(negociosDeCierre("Solo Locador")).toBe(0.5);
    expect(negociosDeCierre("Solo Locatario")).toBe(0.5);
  });

  it("el alquiler pesa exactamente lo mismo que la venta", () => {
    expect(negociosDeCierre("Solo Locador")).toBe(negociosDeCierre("Solo Vendedor"));
    expect(negociosDeCierre("Solo Locatario")).toBe(negociosDeCierre("Solo Comprador"));
  });

  it("sin participación cargada el negocio se cuenta entero", () => {
    // Los cierres viejos no tienen el campo: contarlos como medio negocio les
    // borraría media historia a los asesores por un dato que nadie les pidió.
    expect(negociosDeCierre(undefined)).toBe(1);
    expect(negociosDeCierre(null)).toBe(1);
    expect(negociosDeCierre("")).toBe(1);
  });

  it("un texto que no es una opción válida se cuenta entero, no medio", () => {
    // "Dos Puntas" es lo que escribió el cliente a mano en su Excel. No es una
    // opción del sistema: cae en el default y no se pierde el negocio.
    expect(negociosDeCierre("Dos Puntas")).toBe(1);
    expect(negociosDeCierre("solo vendedor")).toBe(1);
  });

  it("toda opción del desplegable tiene peso decidido: entera solo si es Ambas puntas", () => {
    // Si mañana alguien agrega una opción a PARTICIPACIONES sin decidir cuánto
    // vale, este test se lo avisa en vez de dejarla caer en el default.
    for (const p of PARTICIPACIONES) {
      expect(negociosDeCierre(p)).toBe(p === "Ambas puntas" ? 1 : 0.5);
    }
  });
});

describe("transaccionesDe", () => {
  it("suma solo los cierres e ignora las demás etapas", () => {
    const logs: LogParaConteo[] = [
      cierre("Ambas puntas"),
      { type: "captacion", metadata: { participacion: "Ambas puntas" } },
      { type: "prospeccion", metadata: {} },
    ];
    expect(transaccionesDe(logs)).toBe(1);
  });

  it("las dos medias puntas de una misma operación suman un negocio", () => {
    expect(transaccionesDe([cierre("Solo Vendedor"), cierre("Solo Comprador")])).toBe(1);
  });

  it("un alquiler de dos medias puntas también suma un negocio, no dos", () => {
    // Este es el caso que daba distinto según dónde se lo mirara: 1 en el total
    // de la agencia y 2 en el ranking por asesor y en el gráfico mensual.
    expect(transaccionesDe([cierre("Solo Locador"), cierre("Solo Locatario")])).toBe(1);
  });

  it("una cartera mixta de ventas y alquileres da el mismo total mirada de a una", () => {
    const logs = [
      cierre("Ambas puntas"),
      cierre("Solo Vendedor"),
      cierre("Solo Locador"),
      cierre("Solo Locatario"),
      cierre(undefined),
    ];
    // 1 + 0,5 + 0,5 + 0,5 + 1
    expect(transaccionesDe(logs)).toBe(3.5);
    const unaPorUna = logs.reduce((acc, l) => acc + transaccionesDe([l]), 0);
    expect(unaPorUna).toBe(transaccionesDe(logs));
  });

  it("una lista vacía o ausente no rompe", () => {
    expect(transaccionesDe([])).toBe(0);
    expect(transaccionesDe(null)).toBe(0);
    expect(transaccionesDe(undefined)).toBe(0);
  });
});
