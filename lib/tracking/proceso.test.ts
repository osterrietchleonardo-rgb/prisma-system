import { describe, it, expect } from "vitest";
import {
  PROCESO_FIJO,
  etapasPermitidas,
  cardKeyDe,
  badgeDeProceso,
} from "./proceso";

describe("PROCESO_FIJO", () => {
  it("fija el lado en las tres etapas que ya lo definen", () => {
    expect(PROCESO_FIJO.prelisting).toBe("venta");
    expect(PROCESO_FIJO.captacion).toBe("venta");
    expect(PROCESO_FIJO.prebuying).toBe("compra");
  });

  it("deja libres las etapas donde el asesor tiene que elegir", () => {
    expect(PROCESO_FIJO.prospeccion).toBeUndefined();
    expect(PROCESO_FIJO.reserva).toBeUndefined();
    expect(PROCESO_FIJO.cierre).toBeUndefined();
  });
});

describe("etapasPermitidas", () => {
  it("una tarjeta de compra no entra en las columnas del vendedor", () => {
    const etapas = etapasPermitidas("compra");
    expect(etapas).toContain("prebuying");
    expect(etapas).not.toContain("prelisting");
    expect(etapas).not.toContain("captacion");
  });

  it("una tarjeta de venta no entra en la columna del comprador", () => {
    const etapas = etapasPermitidas("venta");
    expect(etapas).toContain("prelisting");
    expect(etapas).toContain("captacion");
    expect(etapas).not.toContain("prebuying");
  });

  it("prospeccion, reserva y cierre son de los dos lados", () => {
    for (const proceso of ["compra", "venta"] as const) {
      const etapas = etapasPermitidas(proceso);
      expect(etapas).toContain("prospeccion");
      expect(etapas).toContain("reserva");
      expect(etapas).toContain("cierre");
    }
  });

  it("sin proceso definido no bloquea nada, como el tablero de hoy", () => {
    expect(etapasPermitidas(null)).toHaveLength(6);
  });
});

describe("cardKeyDe", () => {
  it("separa los dos procesos del mismo cliente", () => {
    expect(cardKeyDe("5491155555555", "compra")).not.toBe(
      cardKeyDe("5491155555555", "venta")
    );
  });

  it("agrupa lo que no tiene proceso en una clave propia y estable", () => {
    expect(cardKeyDe("5491155555555", null)).toBe("5491155555555::sin-definir");
  });
});

describe("badgeDeProceso", () => {
  it("le pone nombre a los tres estados posibles", () => {
    expect(badgeDeProceso("compra").label).toBe("COMPRA");
    expect(badgeDeProceso("venta").label).toBe("VENTA");
    expect(badgeDeProceso(null).label).toBe("SIN DEFINIR");
  });
});
