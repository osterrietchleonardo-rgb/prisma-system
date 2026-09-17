import { describe, expect, it } from "vitest"
import { estadoDeFecha, fechaCorta, fechaDeInstante, hoyEnBuenosAires } from "./fechas"

describe("fechaCorta", () => {
  it("muestra el día que dice la fila, no el de UTC", () => {
    // El trampolín de esta función, escrito al lado del que sí lo pisa: para el MISMO string,
    // `fechaCorta` (que corta) dice 16 y `fechaDeInstante` (que pasa por `new Date`) dice 15,
    // porque un `date` pelado se lee como medianoche UTC y en Buenos Aires eso es el día
    // anterior. Si alguien reescribe `fechaCorta` copiando a su hermana, este par se rompe.
    expect(fechaCorta("2026-09-16")).toBe("16/9/2026")
    expect(fechaDeInstante("2026-09-16")).toBe("15/9/2026")
  })

  it("le saca el cero de adelante al día y al mes", () => {
    expect(fechaCorta("2026-01-05")).toBe("5/1/2026")
  })

  it("aguanta un timestamp entero y se queda con su fecha", () => {
    expect(fechaCorta("2026-09-16T23:30:00+00:00")).toBe("16/9/2026")
  })

  it("sin fecha no inventa ninguna", () => {
    expect(fechaCorta(null)).toBeNull()
    expect(fechaCorta("")).toBeNull()
    expect(fechaCorta("cualquier cosa")).toBeNull()
  })
})

describe("fechaDeInstante", () => {
  it("lee un timestamptz en la hora de Buenos Aires", () => {
    // 01:30 UTC del 17 son las 22:30 del 16 en Buenos Aires: el día es el 16.
    expect(fechaDeInstante("2026-09-17T01:30:00Z")).toBe("16/9/2026")
  })

  it("una fecha rota no rompe la pantalla", () => {
    expect(fechaDeInstante(null)).toBeNull()
    expect(fechaDeInstante("no es una fecha")).toBeNull()
  })
})

describe("estadoDeFecha", () => {
  it("la de ayer está vencida", () => {
    expect(estadoDeFecha("2026-09-16", "2026-09-17")).toBe("vencida")
  })

  it("la de HOY no está vencida: es de hoy", () => {
    // La que sostiene la tarjeta. Con `<=` en vez de `<`, o sin el estado «hoy», el asesor
    // arranca el día con una tarjeta en rojo que en realidad todavía no debe nada.
    expect(estadoDeFecha("2026-09-17", "2026-09-17")).toBe("hoy")
  })

  it("la de mañana es futura", () => {
    expect(estadoDeFecha("2026-09-18", "2026-09-17")).toBe("futura")
  })

  it("cruza el fin de mes y el fin de año sin confundirse", () => {
    expect(estadoDeFecha("2026-08-31", "2026-09-01")).toBe("vencida")
    expect(estadoDeFecha("2027-01-01", "2026-12-31")).toBe("futura")
  })

  it("sin fecha, o con una que no se entiende, no dice nada", () => {
    expect(estadoDeFecha(null, "2026-09-17")).toBe("sin_fecha")
    expect(estadoDeFecha("", "2026-09-17")).toBe("sin_fecha")
    expect(estadoDeFecha("16/9/2026", "2026-09-17")).toBe("sin_fecha")
  })
})

describe("hoyEnBuenosAires", () => {
  it("devuelve una fecha con el formato que compara estadoDeFecha", () => {
    expect(hoyEnBuenosAires()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("es el hoy que usa estadoDeFecha por default", () => {
    // Sin esto, `estadoDeFecha(hoy)` podría no dar «hoy» si el default se calculara con otro
    // huso que el de esta función — que es justo el error que el endpoint de mover evita al
    // guardar `farming_contactos.fecha`.
    expect(estadoDeFecha(hoyEnBuenosAires())).toBe("hoy")
  })
})
