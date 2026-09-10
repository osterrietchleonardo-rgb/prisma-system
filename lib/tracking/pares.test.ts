import { describe, it, expect } from "vitest";
import { paresSospechosos, operacionesEnlazadas, type CierreParaAparear } from "./pares";

const cierre = (
  id: string,
  agente: string,
  direccion: string,
  participacion: string | null,
  operacionId: string | null = null
): CierreParaAparear => ({
  id,
  agent_id: agente,
  operacion_id: operacionId,
  propiedad_ref: direccion,
  metadata: { participacion },
});

describe("paresSospechosos", () => {
  it("junta las dos puntas de una venta cargadas por asesores distintos", () => {
    const cierres = [
      cierre("1", "ana", "ESPINOSA 3166 - CABA", "Solo Vendedor"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Comprador"),
    ];
    const pares = paresSospechosos(cierres);
    expect(pares).toHaveLength(1);
    expect([pares[0].a.id, pares[0].b.id].sort()).toEqual(["1", "2"]);
  });

  it("no propone los que ya están enlazados", () => {
    const cierres = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor", "op-1"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Comprador", "op-1"),
    ];
    expect(paresSospechosos(cierres)).toHaveLength(0);
  });

  it("no vuelve a proponer los que el director marcó como distintos", () => {
    // Marcarlos distintos les da a cada uno su propia operación, así que dejan
    // de estar sueltos. Por eso un "no son la misma" no reaparece nunca, sin
    // guardar la decisión en ningún lado.
    const cierres = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor", "op-propia-1"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Comprador", "op-propia-2"),
    ];
    expect(paresSospechosos(cierres)).toHaveLength(0);
  });

  it("no propone dos filas del mismo asesor", () => {
    // Un asesor con las dos puntas carga UNA fila con "Ambas puntas".
    const cierres = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor"),
      cierre("2", "ana", "Espinosa 3166", "Solo Comprador"),
    ];
    expect(paresSospechosos(cierres)).toHaveLength(0);
  });

  it("no propone puntas que se contradicen", () => {
    const dosVendedores = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Vendedor"),
    ];
    expect(paresSospechosos(dosVendedores)).toHaveLength(0);

    const conAmbasPuntas = [
      cierre("1", "ana", "Espinosa 3166", "Ambas puntas"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Comprador"),
    ];
    expect(paresSospechosos(conAmbasPuntas)).toHaveLength(0);
  });

  it("no junta dos propiedades distintas de la misma calle", () => {
    const cierres = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor"),
      cierre("2", "bruno", "Espinosa 2200", "Solo Comprador"),
    ];
    expect(paresSospechosos(cierres)).toHaveLength(0);
  });

  it("encuentra la dirección aunque esté en el campo de colaboración", () => {
    const cierres: CierreParaAparear[] = [
      cierre("1", "ana", "SAN LUIS 3057", "Solo Vendedor"),
      {
        id: "2",
        agent_id: "bruno",
        operacion_id: null,
        propiedad_ref: null,
        metadata: { propiedad_colaboracion: "san luis 3057", participacion: "Solo Comprador" },
      },
    ];
    expect(paresSospechosos(cierres)).toHaveLength(1);
  });

  it("con una lista vacía o de uno solo no propone nada", () => {
    expect(paresSospechosos([])).toEqual([]);
    expect(paresSospechosos([cierre("1", "ana", "Espinosa 3166", "Solo Vendedor")])).toEqual([]);
  });

  it("no propone dos veces el mismo par", () => {
    const cierres = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Comprador"),
      cierre("3", "caro", "Rivadavia 100", "Solo Vendedor"),
    ];
    expect(paresSospechosos(cierres)).toHaveLength(1);
  });
});

describe("operacionesEnlazadas", () => {
  it("agrupa las filas que comparten operación", () => {
    const cierres = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor", "op-1"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Comprador", "op-1"),
      cierre("3", "caro", "Bulnes 1180", "Ambas puntas"),
    ];
    const grupos = operacionesEnlazadas(cierres);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].operacionId).toBe("op-1");
    expect(grupos[0].filas.map((f) => f.id)).toEqual(["1", "2"]);
  });

  it("ignora las operaciones de una sola fila", () => {
    // Son las que el director marcó como distintas: no hay nada que revisar.
    const cierres = [
      cierre("1", "ana", "Espinosa 3166", "Solo Vendedor", "op-propia-1"),
      cierre("2", "bruno", "Espinosa 3166", "Solo Comprador", "op-propia-2"),
    ];
    expect(operacionesEnlazadas(cierres)).toEqual([]);
  });

  it("ignora las filas sueltas", () => {
    expect(operacionesEnlazadas([cierre("1", "ana", "Espinosa 3166", "Solo Vendedor")])).toEqual([]);
  });
});
