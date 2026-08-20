import { describe, it, expect } from "vitest";
import {
  PROCESOS_POR_ETAPA,
  ETAPAS_POR_PROCESO,
  ladoDelNegocio,
  etapasPermitidas,
  cardKeyDe,
  labelDeProceso,
  badgeDeProceso,
} from "./proceso";
import type { ActivityType } from "./types";

const CUATRO_VALORES = ["vendedor", "comprador", "locador", "locatario"] as const;
const ETAPAS_LIBRES: ActivityType[] = ["prospeccion", "reserva", "cierre"];
const ETAPAS_CON_LADO_FIJO: ActivityType[] = ["prelisting", "captacion", "prebuying"];

describe("ladoDelNegocio", () => {
  it("agrupa vendedor y locador del lado de quien ofrece", () => {
    expect(ladoDelNegocio("vendedor")).toBe("ofrece");
    expect(ladoDelNegocio("locador")).toBe("ofrece");
  });

  it("agrupa comprador y locatario del lado de quien busca", () => {
    expect(ladoDelNegocio("comprador")).toBe("busca");
    expect(ladoDelNegocio("locatario")).toBe("busca");
  });

  it("sin proceso no hay lado", () => {
    expect(ladoDelNegocio(null)).toBeNull();
  });
});

describe("PROCESOS_POR_ETAPA", () => {
  it("las tres etapas constreñidas por el lado ofrecen exactamente dos opciones", () => {
    for (const etapa of ETAPAS_CON_LADO_FIJO) {
      expect(PROCESOS_POR_ETAPA[etapa]).toHaveLength(2);
    }
  });

  it("prelisting y captacion son del lado de quien ofrece (vendedor o locador)", () => {
    expect(PROCESOS_POR_ETAPA.prelisting.sort()).toEqual(["locador", "vendedor"]);
    expect(PROCESOS_POR_ETAPA.captacion.sort()).toEqual(["locador", "vendedor"]);
  });

  it("prebuying es del lado de quien busca (comprador o locatario)", () => {
    expect(PROCESOS_POR_ETAPA.prebuying.sort()).toEqual(["comprador", "locatario"]);
  });

  it("las etapas libres ofrecen los cuatro valores", () => {
    for (const etapa of ETAPAS_LIBRES) {
      expect(PROCESOS_POR_ETAPA[etapa].sort()).toEqual([...CUATRO_VALORES].sort());
    }
  });
});

describe("ETAPAS_POR_PROCESO", () => {
  it("vendedor y locador comparten las etapas de quien ofrece", () => {
    expect(ETAPAS_POR_PROCESO.vendedor).toEqual(ETAPAS_POR_PROCESO.locador);
    expect(ETAPAS_POR_PROCESO.vendedor).toEqual(
      expect.arrayContaining(["prospeccion", "prelisting", "captacion", "reserva", "cierre"])
    );
    expect(ETAPAS_POR_PROCESO.vendedor).not.toContain("prebuying");
  });

  it("comprador y locatario comparten las etapas de quien busca", () => {
    expect(ETAPAS_POR_PROCESO.comprador).toEqual(ETAPAS_POR_PROCESO.locatario);
    expect(ETAPAS_POR_PROCESO.comprador).toEqual(
      expect.arrayContaining(["prospeccion", "prebuying", "reserva", "cierre"])
    );
    expect(ETAPAS_POR_PROCESO.comprador).not.toContain("prelisting");
    expect(ETAPAS_POR_PROCESO.comprador).not.toContain("captacion");
  });
});

describe("etapasPermitidas", () => {
  it("una tarjeta de comprador no entra en las columnas de quien ofrece", () => {
    const etapas = etapasPermitidas("comprador");
    expect(etapas).toContain("prebuying");
    expect(etapas).not.toContain("prelisting");
    expect(etapas).not.toContain("captacion");
  });

  it("una tarjeta de locatario tampoco entra en las columnas de quien ofrece", () => {
    const etapas = etapasPermitidas("locatario");
    expect(etapas).toContain("prebuying");
    expect(etapas).not.toContain("prelisting");
    expect(etapas).not.toContain("captacion");
  });

  it("una tarjeta de vendedor no entra en la columna de quien busca", () => {
    const etapas = etapasPermitidas("vendedor");
    expect(etapas).toContain("prelisting");
    expect(etapas).toContain("captacion");
    expect(etapas).not.toContain("prebuying");
  });

  it("una tarjeta de locador tampoco entra en la columna de quien busca", () => {
    const etapas = etapasPermitidas("locador");
    expect(etapas).toContain("prelisting");
    expect(etapas).toContain("captacion");
    expect(etapas).not.toContain("prebuying");
  });

  it("prospeccion, reserva y cierre son de los cuatro procesos", () => {
    for (const proceso of CUATRO_VALORES) {
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
  it("separa los cuatro procesos del mismo cliente", () => {
    const claves = new Set(CUATRO_VALORES.map((p) => cardKeyDe("5491155555555", p)));
    expect(claves.size).toBe(4);
  });

  it("agrupa lo que no tiene proceso en una clave propia y estable", () => {
    expect(cardKeyDe("5491155555555", null)).toBe("5491155555555::sin-definir");
  });
});

describe("labelDeProceso", () => {
  it("le pone nombre a los cuatro valores y al caso sin definir", () => {
    expect(labelDeProceso("vendedor")).toBe("Vendedor");
    expect(labelDeProceso("comprador")).toBe("Comprador");
    expect(labelDeProceso("locador")).toBe("Locador");
    expect(labelDeProceso("locatario")).toBe("Locatario");
    expect(labelDeProceso(null)).toBe("Sin definir");
  });
});

describe("badgeDeProceso", () => {
  it("el texto identifica el valor exacto para los cuatro procesos", () => {
    expect(badgeDeProceso("vendedor").label).toBe("VENDEDOR");
    expect(badgeDeProceso("comprador").label).toBe("COMPRADOR");
    expect(badgeDeProceso("locador").label).toBe("LOCADOR");
    expect(badgeDeProceso("locatario").label).toBe("LOCATARIO");
    expect(badgeDeProceso(null).label).toBe("SIN DEFINIR");
  });

  it("el color comunica el lado: vendedor y locador comparten color", () => {
    expect(badgeDeProceso("vendedor").className).toBe(badgeDeProceso("locador").className);
  });

  it("el color comunica el lado: comprador y locatario comparten color", () => {
    expect(badgeDeProceso("comprador").className).toBe(badgeDeProceso("locatario").className);
  });

  it("los dos lados tienen colores distintos entre sí y del caso sin definir", () => {
    const colores = new Set([
      badgeDeProceso("vendedor").className,
      badgeDeProceso("comprador").className,
      badgeDeProceso(null).className,
    ]);
    expect(colores.size).toBe(3);
  });
});
