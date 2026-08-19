import { describe, it, expect } from "vitest";
import { buildPipeline } from "./pipeline";
import type { ActivityType, PerformanceLog, PipelineMove } from "./types";

/** Un log mínimo pero completo, vinculado por defecto al contacto de WhatsApp "wa-1". */
function unLog(over: Partial<PerformanceLog> & { id: string }): PerformanceLog {
  return {
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    agent_id: "agente-1",
    agency_id: "agencia-1",
    type: "prospeccion" as ActivityType,
    proceso: null,
    propiedad_ref: null,
    monto_operacion: null,
    comision_generada: null,
    fecha_actividad: "2026-08-01",
    fecha_cierre: null,
    metadata: {},
    ai_rating: null,
    ai_feedback: null,
    wa_contact_id: "wa-1",
    wa_contacts: { id: "wa-1", name: "Matías Gómez", phone: "+54 9 11 5555-5555" },
    ...over,
  } as PerformanceLog;
}

function unMovimiento(over: Partial<PipelineMove> & { id: string }): PipelineMove {
  return {
    agency_id: "agencia-1",
    agent_id: "agente-1",
    client_key: "5491155555555",
    lead_id: null,
    wa_contact_id: "wa-1",
    from_stage: null,
    to_stage: "reserva" as ActivityType,
    proceso: null,
    created_at: "2026-08-02T10:00:00.000Z",
    ...over,
  } as PipelineMove;
}

describe("buildPipeline: el cliente que compra y además vende", () => {
  it("le arma DOS tarjetas, una por proceso", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra", created_at: "2026-08-01T10:00:00.000Z" }),
        unLog({ id: "2", type: "prelisting", proceso: "venta", created_at: "2026-08-05T10:00:00.000Z" }),
      ],
      []
    );

    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.proceso).sort()).toEqual(["compra", "venta"]);
    expect(new Set(cards.map((c) => c.clientKey)).size).toBe(1);
  });

  it("cargar el prelisting NO le saca la tarjeta de compra de Prebuying", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra", created_at: "2026-08-01T10:00:00.000Z" }),
        unLog({ id: "2", type: "prelisting", proceso: "venta", created_at: "2026-08-05T10:00:00.000Z" }),
      ],
      []
    );

    const compra = cards.find((c) => c.proceso === "compra");
    const venta = cards.find((c) => c.proceso === "venta");
    expect(compra?.stage).toBe("prebuying");
    expect(venta?.stage).toBe("prelisting");
  });

  it("cada tarjeta cuenta sólo sus propias actividades", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra" }),
        unLog({ id: "2", type: "prebuying", proceso: "compra", created_at: "2026-08-03T10:00:00.000Z" }),
        unLog({ id: "3", type: "prelisting", proceso: "venta" }),
      ],
      []
    );

    expect(cards.find((c) => c.proceso === "compra")?.activityCount).toBe(2);
    expect(cards.find((c) => c.proceso === "venta")?.activityCount).toBe(1);
  });
});

describe("buildPipeline: movimientos manuales", () => {
  it("mover la tarjeta de compra no mueve la de venta", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra", created_at: "2026-08-01T10:00:00.000Z" }),
        unLog({ id: "2", type: "prelisting", proceso: "venta", created_at: "2026-08-01T11:00:00.000Z" }),
      ],
      [
        unMovimiento({
          id: "m1",
          proceso: "compra",
          from_stage: "prebuying",
          to_stage: "reserva",
          created_at: "2026-08-10T10:00:00.000Z",
        }),
      ]
    );

    expect(cards.find((c) => c.proceso === "compra")?.stage).toBe("reserva");
    expect(cards.find((c) => c.proceso === "venta")?.stage).toBe("prelisting");
  });
});

describe("buildPipeline: lo de siempre no se rompe", () => {
  it("un cliente con un solo proceso sigue siendo UNA tarjeta", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prospeccion", proceso: "compra" }),
        unLog({ id: "2", type: "prebuying", proceso: "compra", created_at: "2026-08-04T10:00:00.000Z" }),
      ],
      []
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].stage).toBe("prebuying");
    expect(cards[0].activityCount).toBe(2);
  });

  it("las actividades sin proceso forman su propia tarjeta 'sin definir'", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prospeccion", proceso: null }),
        unLog({ id: "2", type: "prebuying", proceso: "compra", created_at: "2026-08-04T10:00:00.000Z" }),
      ],
      []
    );

    expect(cards).toHaveLength(2);
    expect(cards.filter((c) => c.proceso === null)).toHaveLength(1);
    expect(cards.filter((c) => c.proceso === "compra")).toHaveLength(1);
  });

  it("las eliminadas no cuentan para nadie", () => {
    const { cards } = buildPipeline(
      [unLog({ id: "1", type: "prebuying", proceso: "compra", status: "eliminada" })],
      []
    );
    expect(cards).toHaveLength(0);
  });

  it("las actividades sin cliente vinculado no arman tarjeta y se cuentan aparte", () => {
    const { cards, sinCliente } = buildPipeline(
      [unLog({ id: "1", proceso: "compra", wa_contact_id: null, wa_contacts: null, lead_id: null })],
      []
    );
    expect(cards).toHaveLength(0);
    expect(sinCliente).toBe(1);
  });

  it("la tarjeta lleva su propia cardKey, distinta de la clave del cliente", () => {
    const { cards } = buildPipeline(
      [unLog({ id: "1", type: "prebuying", proceso: "compra" })],
      []
    );
    expect(cards[0].cardKey).toBe(`${cards[0].clientKey}::compra`);
  });
});
