export interface DolarData {
  casa: string
  nombre: string
  compra: number | null
  venta: number | null
  fechaActualizacion: string
}

export interface DolaresResult {
  oficial: DolarData | null
  mep: DolarData | null
  blue: DolarData | null
  ccl: DolarData | null
  error?: string
  lastUpdated?: string
}

export async function fetchDolares(): Promise<DolaresResult> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares', {
      next: { revalidate: 3600, tags: ['mercado'] },
    })

    if (!res.ok) {
      throw new Error(`dolarapi.com responded with ${res.status}`)
    }

    const dolares: DolarData[] = await res.json()

    const oficial = dolares.find((d) => d.casa === 'oficial') ?? null
    const mep = dolares.find((d) => d.casa === 'bolsa') ?? null
    const blue = dolares.find((d) => d.casa === 'blue') ?? null
    const ccl = dolares.find((d) => d.casa === 'contadoconliqui') ?? null

    return {
      oficial,
      mep,
      blue,
      ccl,
      lastUpdated: mep?.fechaActualizacion ?? new Date().toISOString(),
    }
  } catch (error) {
    console.error('[fetchDolares] Error:', error)
    return {
      oficial: null,
      mep: null,
      blue: null,
      ccl: null,
      error: 'No se pudo obtener el tipo de cambio',
    }
  }
}
