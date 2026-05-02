export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse-fork')

// Configuración de fuentes
const SOURCES = {
  ICC: {
    baseUrl: 'https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads',
    pattern: (y: number, m: number) => `/${y}/${m.toString().padStart(2, '0')}/EE_ICC_01-16.xlsx` // Ejemplo de patrón
  },
  ZONAPROP: {
    baseUrl: 'https://www.zonaprop.com.ar/blog/wp-content/uploads',
    pattern: (y: number, m: number, slug: string) => `/${y}/${m.toString().padStart(2, '0')}/INDEX_${slug}_REPORTE_${y}-${m.toString().padStart(2, '0')}.pdf`
  }
}

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store' 
    })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')

  // Seguridad: Solo permitir ejecución con secret o en desarrollo
  if (process.env.NODE_ENV === 'production' && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const results = {
    icc: { status: 'skipped', details: '' },
    zonaprop: { status: 'skipped', details: '' },
    timestamp: new Date().toISOString()
  }

  const supabase = createClient()
  const now = new Date()

  // ─── 1. SYNC ICC (Costo Construcción) ───
  try {
    let iccBuffer: ArrayBuffer | null = null
    let usedUrl = ''
    
    // Probar últimos 3 meses para encontrar el más reciente
    for (let i = 0; i < 3; i++) {
      const d = new Date()
      d.setMonth(now.getMonth() - i)
      const url = `${SOURCES.ICC.baseUrl}${SOURCES.ICC.pattern(d.getFullYear(), d.getMonth() + 1)}`
      iccBuffer = await tryFetch(url)
      if (iccBuffer) {
        usedUrl = url
        break
      }
    }

    if (iccBuffer) {
      const wb = XLSX.read(Buffer.from(iccBuffer), { type: 'buffer' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      
      // Lógica de extracción (basada en fetchICC.ts)
      const title = String(rows[0]?.[0] ?? '')
      const monthMatch = title.match(/(\w+ de \d{4})\s*$/)
      const indice_tiempo = monthMatch ? monthMatch[1] : 'Reporte Reciente'
      
      const { error } = await supabase.from('mercado_icc').upsert({
        id: 1, // Mantenemos solo el registro más reciente o podrías usar indice_tiempo como PK
        indice_tiempo,
        icc_nivel_general: Number(rows[3]?.[1]) || 0,
        icc_materiales: Number(rows[4]?.[1]) || 0,
        icc_mano_obra: Number(rows[5]?.[1]) || 0,
        icc_gastos_generales: Number(rows[6]?.[1]) || 0,
        var_nivel_general_pct: Number(rows[3]?.[2]) || 0,
        var_anual_pct: Number(rows[3]?.[4]) || 0,
        fecha_actualizacion: new Date().toISOString()
      })

      if (error) throw error
      results.icc = { status: 'success', details: `Actualizado: ${indice_tiempo} (${usedUrl})` }
    } else {
      results.icc = { status: 'not_found', details: 'No se encontró reporte ICC reciente' }
    }
  } catch (err: any) {
    results.icc = { status: 'error', details: err.message }
  }

  // ─── 2. SYNC ZONAPROP (CABA) ───
  try {
    let zpBuffer: ArrayBuffer | null = null
    let usedUrl = ''
    let mesReporte = ''

    for (let i = 0; i < 3; i++) {
      const d = new Date()
      d.setMonth(now.getMonth() - i)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const url = `${SOURCES.ZONAPROP.baseUrl}${SOURCES.ZONAPROP.pattern(y, m, 'CABA')}`
      zpBuffer = await tryFetch(url)
      if (zpBuffer) {
        usedUrl = url
        mesReporte = `${y}-${m.toString().padStart(2, '0')}`
        break
      }
    }

    if (zpBuffer) {
      const pdfData = await pdfParse(Buffer.from(zpBuffer))
      const text = pdfData.text || ''
      
      // Regex simples para extraer datos clave del PDF
      const precioMatch = text.match(/USD\s*([\d.,]+)/i)
      const precio = precioMatch ? parseFloat(precioMatch[1].replace(/\./g, '').replace(',', '.')) : null

      const { error } = await supabase.from('mercado_zonas').upsert({
        id: 'CABA',
        zona: 'CABA',
        precio_m2_venta_usd: precio,
        url_pdf: usedUrl,
        mes_reporte: mesReporte,
        fecha_actualizacion: new Date().toISOString()
      })

      if (error) throw error
      results.zonaprop = { status: 'success', details: `PDF CABA Sincronizado: ${mesReporte}` }
    } else {
      results.zonaprop = { status: 'not_found', details: 'No se encontró PDF Zonaprop reciente' }
    }
  } catch (err: any) {
    results.zonaprop = { status: 'error', details: err.message }
  }

  return NextResponse.json(results)
}
