import { describe, it, expect } from "vitest"
import { marcaDeLaAgencia, propiedadParaFicha } from "./snapshot"

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTRA_AGENCIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/**
 * Cliente de base falso. Reproduce SOLO la cadena que usa propiedadParaFicha:
 *   from(tabla).select(cols).eq(col, val)[.eq(col, val)].maybeSingle()
 */
function clienteFalso(filas: Record<string, Array<Record<string, unknown>>>, romper?: string) {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {}
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => {
          filtros[col] = val
          return api
        },
        maybeSingle: async () => {
          if (romper === tabla) return { data: null, error: { message: "roto a propósito" } }
          const encontrada = (filas[tabla] ?? []).find((f) =>
            Object.entries(filtros).every(([k, v]) => f[k] === v),
          )
          return { data: encontrada ?? null, error: null }
        },
      }
      return api
    },
  }
}

// La foto usa un host neutro a propósito: `urlsFotoRed` solo reescribe los hosts de la red
// (cdn.roomix.ai, zonapropcdn.com), y acá lo que se prueba es el mapeo, no el proxy.
const AVISO_RED = {
  slug: "depto-palermo-1",
  title: "Depto 3 amb en Palermo",
  description: "Luminoso",
  price: 185000,
  currency: "USD",
  property_type: "Departamento",
  operation: "sale",
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  area_m2: 78,
  address: "Gorriti 5000",
  neighborhood: "Palermo",
  city: "CABA",
  images: ["https://fotos.example/a.webp"],
  amenities: ["balcón"],
  // Datos del colega que NO pueden viajar a la ficha del cliente:
  roomix_agency_name: "Inmobiliaria Colega",
  roomix_agency_logo: "https://colega.example/logo.png",
  phone: "1122334455",
  whatsapp: "1122334455",
  canonical_url: "https://roomix.ai/aviso/1",
  source_listing_url: "https://portal.example/aviso/1",
}

describe("propiedadParaFicha · red de colaboración", () => {
  it("mapea el aviso de la red al formato de la ficha", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [AVISO_RED] }) as any,
      "roomix",
      "roomix_depto-palermo-1",
      AGENCIA,
    )

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.title).toBe("Depto 3 amb en Palermo")
    expect(r.propiedad.status).toBe("Venta")
    expect(r.propiedad.total_area).toBe(78)
    expect(r.propiedad.city).toBe("Palermo")
    expect(r.propiedad.source).toBe("roomix")
  })

  it("NO deja pasar ningún dato de la inmobiliaria que publica", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [AVISO_RED] }) as any,
      "roomix",
      "roomix_depto-palermo-1",
      AGENCIA,
    )

    expect(r.ok).toBe(true)
    if (!r.ok) return
    const texto = JSON.stringify(r.propiedad)
    expect(texto).not.toContain("Inmobiliaria Colega")
    expect(texto).not.toContain("colega.example")
    expect(texto).not.toContain("1122334455")
    expect(texto).not.toContain("roomix.ai")
    expect(texto).not.toContain("portal.example")
  })

  it("si la consulta falla devuelve 503, no 'no existe'", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [AVISO_RED] }, "roomix_properties") as any,
      "roomix",
      "roomix_depto-palermo-1",
      AGENCIA,
    )

    expect(r).toEqual({ ok: false, estado: 503, motivo: expect.stringContaining("unos segundos") })
  })

  it("si el aviso ya no está, lo dice como baja de la publicación", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ roomix_properties: [] }) as any,
      "roomix",
      "roomix_no-existe",
      AGENCIA,
    )

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.estado).toBe(404)
    expect(r.motivo).toContain("ya no está publicada")
  })
})

describe("propiedadParaFicha · cartera", () => {
  const PROPIA = {
    id: "11111111-1111-4111-8111-111111111111",
    agency_id: AGENCIA,
    title: "Casa en Vicente López",
    description: "Con jardín",
    price: 320000,
    currency: "USD",
    property_type: "Casa",
    status: "Venta",
    bedrooms: 3,
    bathrooms: 2,
    total_area: 210,
    covered_area: 160,
    address: "Av. Maipú 3000",
    city: "Vicente López",
    images: ["https://tokko.example/1.jpg"],
    tokko_data: { tags: [{ name: "parrilla" }, { name: "pileta" }], public_url: "https://x.example/p" },
  }

  it("saca los amenities de tokko_data.tags", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ properties: [PROPIA] }) as any,
      "own",
      PROPIA.id,
      AGENCIA,
    )

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propiedad.amenities).toEqual(["parrilla", "pileta"])
    expect(r.propiedad.public_url).toBe("https://x.example/p")
  })

  it("una propiedad de OTRA agencia no se encuentra", async () => {
    const r = await propiedadParaFicha(
      clienteFalso({ properties: [PROPIA] }) as any,
      "own",
      PROPIA.id,
      OTRA_AGENCIA,
    )

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.estado).toBe(404)
    expect(r.motivo).toContain("no pertenece a tu agencia")
  })
})

describe("marcaDeLaAgencia", () => {
  it("se queda solo con los colores que son texto", () => {
    expect(marcaDeLaAgencia({ brand_colors: ["#0a1f33", 42, "", null, "#c8a061"] }).colors).toEqual([
      "#0a1f33",
      "#c8a061",
    ])
  })

  it("sin configuración devuelve los valores por defecto", () => {
    expect(marcaDeLaAgencia(null)).toEqual({ colors: [], font: "sans", logo_url: null })
  })
})
