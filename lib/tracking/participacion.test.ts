import { describe, it, expect } from "vitest";
import {
  PARTICIPACIONES,
  negociosDeCierre,
  transaccionesDe,
  gciDe,
  desgloseDeCierres,
  type LogParaConteo,
} from "./participacion";

const cierre = (participacion?: unknown): LogParaConteo => ({
  type: "cierre",
  metadata: participacion === undefined ? {} : { participacion },
});

/** Un cierre con todo lo que hace falta para medir plata y tipo de operación. */
const operacion = (
  proceso: string | null,
  monto: number | string,
  comision: number | string,
  participacion = "Ambas puntas"
): LogParaConteo => ({
  type: "cierre",
  proceso,
  monto_operacion: monto,
  comision_generada: comision,
  metadata: { participacion },
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

describe("gciDe", () => {
  it("multiplica el valor por el porcentaje de honorarios", () => {
    expect(gciDe([operacion("vendedor", 120000, 3)])).toBe(3600);
  });

  it("acepta los numeric de Postgres, que llegan como texto", () => {
    // `monto_operacion` y `comision_generada` son numeric: el driver los
    // devuelve como string. Sin el Number() esto daba NaN o concatenaba.
    expect(gciDe([operacion("vendedor", "120000", "3")])).toBe(3600);
  });

  it("una fila sin monto ni comisión no rompe ni ensucia la suma", () => {
    const sinPlata: LogParaConteo = { type: "cierre", metadata: {} };
    expect(gciDe([operacion("vendedor", 120000, 3), sinPlata])).toBe(3600);
  });

  it("ignora lo que no es cierre", () => {
    const captacion: LogParaConteo = {
      type: "captacion",
      monto_operacion: 999999,
      comision_generada: 10,
    };
    expect(gciDe([operacion("vendedor", 120000, 3), captacion])).toBe(3600);
  });
});

describe("desgloseDeCierres", () => {
  const cartera = [
    operacion("vendedor", 120000, 3, "Solo Vendedor"),
    operacion("comprador", 100000, 4, "Solo Comprador"),
    operacion("locador", 12000, 5, "Solo Locador"),
    operacion("locatario", 8000, 5, "Solo Locatario"),
    operacion(null, 50000, 2, "Ambas puntas"),
  ];

  it("manda cada cierre al lado que le corresponde", () => {
    const d = desgloseDeCierres(cartera);
    expect(d.venta.gci).toBe(3600 + 4000);
    expect(d.alquiler.gci).toBe(600 + 400);
    expect(d.sinDefinir.gci).toBe(1000);
  });

  it("cuenta los negocios por separado con la misma regla de medias puntas", () => {
    const d = desgloseDeCierres(cartera);
    expect(d.venta.transacciones).toBe(1); // 0,5 + 0,5
    expect(d.alquiler.transacciones).toBe(1); // 0,5 + 0,5
    expect(d.sinDefinir.transacciones).toBe(1); // ambas puntas
  });

  it("las tres partes suman siempre el total, sin perder ni duplicar nada", () => {
    // Es la regla que hace que la pantalla no pueda mentir: si un cierre no
    // cae en venta ni en alquiler, tiene que aparecer en "sin definir".
    const d = desgloseDeCierres(cartera);
    expect(d.venta.gci + d.alquiler.gci + d.sinDefinir.gci).toBeCloseTo(d.total.gci, 10);
    expect(d.venta.transacciones + d.alquiler.transacciones + d.sinDefinir.transacciones).toBe(
      d.total.transacciones
    );
  });

  it("un proceso desconocido no se reparte: cae en sin definir", () => {
    const d = desgloseDeCierres([operacion("cualquier_cosa", 10000, 3)]);
    expect(d.venta.gci).toBe(0);
    expect(d.alquiler.gci).toBe(0);
    expect(d.sinDefinir.gci).toBe(300);
    expect(d.total.gci).toBe(300);
  });

  it("sin cierres devuelve todo en cero y no rompe", () => {
    for (const d of [desgloseDeCierres([]), desgloseDeCierres(null), desgloseDeCierres(undefined)]) {
      expect(d.total).toEqual({ transacciones: 0, gci: 0 });
      expect(d.venta).toEqual({ transacciones: 0, gci: 0 });
      expect(d.alquiler).toEqual({ transacciones: 0, gci: 0 });
      expect(d.sinDefinir).toEqual({ transacciones: 0, gci: 0 });
    }
  });
});
