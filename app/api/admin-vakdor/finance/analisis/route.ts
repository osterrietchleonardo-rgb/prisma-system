import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { prismaIA } from "@/lib/gemini"
import {
  loadFinanceData,
  kpisDeMes,
  estadoResultadoDeMes,
  ebitdaFclDeMes,
  nAgenciasPagando,
} from "@/lib/admin-vakdor/finance/metrics"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

function getFreshAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
    }
  )
}

const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const r2 = (n: number) => Math.round(n * 100) / 100

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => ({} as any))
  const now = new Date()
  const mes = (body?.mes as string) || mesKey(now)

  const db = getFreshAdminDb()
  const data = await loadFinanceData(db)
  const { pagos } = data

  const kpis = kpisDeMes(mes, data)
  const er = estadoResultadoDeMes(mes, data)

  // Punto de equilibrio (en agencias)
  const n = nAgenciasPagando(mes, pagos)
  const precio = n > 0 ? kpis.ingresos / n : 0
  const costoVarUnit = n > 0 ? kpis.costosVariables / n : 0
  const mcUnit = precio - costoVarUnit
  const puntoEquilibrio = mcUnit > 0 ? Math.ceil(kpis.gastosFijos / mcUnit) : null

  // EBITDA y Flujo de Caja Libre (Δ capital de trabajo calculado desde los saldos)
  const ef = ebitdaFclDeMes(mes, data)
  const fcl = ef.fcl

  // Evolución últimos 12 meses (resumen compacto)
  const evolucion = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const m = mesKey(d)
    const k = kpisDeMes(m, data)
    evolucion.push({ mes: m, ingresos: r2(k.ingresos), costos: r2(k.costosTotal), ebit: r2(k.ebit) })
  }

  const resumen = {
    mes,
    moneda: "USD",
    estado_de_resultado: {
      ventas: r2(er.ventas),
      costo_de_ventas: r2(er.costoVentas),
      utilidad_bruta: r2(er.utilidadBruta),
      gastos_operativos: r2(er.gastosOperativos),
      utilidad_operativa: r2(er.utilidadOperativa),
      gastos_financieros: r2(er.gastosFinancieros),
      utilidad_antes_impuestos: r2(er.utilidadAntesImpuestos),
      impuestos: r2(er.impuestos),
      utilidad_neta: r2(er.utilidadNeta),
    },
    margenes: {
      margen_neto_pct: kpis.margenPct != null ? r2(kpis.margenPct) : null,
      margen_contribucion: r2(kpis.mc),
      apalancamiento_operativo: kpis.dol != null ? r2(kpis.dol) : null,
    },
    punto_de_equilibrio: {
      agencias_que_pagan: n,
      precio_promedio_por_agencia: r2(precio),
      costo_variable_por_agencia: r2(costoVarUnit),
      margen_contribucion_unitario: r2(mcUnit),
      gastos_fijos: r2(kpis.gastosFijos),
      agencias_para_equilibrio: puntoEquilibrio,
    },
    ebitda_y_fcl: {
      utilidad_operativa: r2(ef.utilidadOperativa),
      depreciacion_amortizacion: r2(ef.depreciacionAmortizacion),
      ebitda: r2(ef.ebitda),
      margen_ebitda_pct: ef.ventas > 0 ? r2((ef.ebitda / ef.ventas) * 100) : null,
      impuestos: r2(ef.impuestos),
      capex: r2(ef.capex),
      delta_capital_trabajo: r2(ef.deltaCapitalTrabajo),
      flujo_caja_libre: r2(fcl),
      margen_fcl_pct: ef.ventas > 0 ? r2((fcl / ef.ventas) * 100) : null,
    },
    evolucion_12_meses: evolucion,
  }

  const prompt = `Sos un CFO / experto en finanzas de una empresa SaaS argentina llamada Vakdor, que le cobra una suscripción mensual a inmobiliarias (cada "unidad" es una agencia que paga). Analizá estos números (todo en USD) y devolvé recomendaciones accionables y concretas, con cifras, sin relleno ni obviedades. Prestá especial atención al **EBITDA** (rentabilidad operativa de caja y su margen) y al **Flujo de Caja Libre** (la caja real que queda tras impuestos, CAPEX y capital de trabajo): si el FCL es negativo o mucho menor al EBITDA, explicá por qué y qué hacer.

DATOS DEL MES Y EVOLUCIÓN:
${JSON.stringify(resumen, null, 2)}

Respondé ÚNICAMENTE con un JSON válido con esta estructura exacta (todo en español, cada item una frase clara y concreta):
{
  "diagnostico": "2-4 oraciones sobre la salud financiera del mes y la tendencia",
  "mejoras": ["acciones concretas para mejorar el resultado"],
  "optimizacion_costos": ["dónde y cómo recortar o eficientizar costos, con foco en costo de ventas y gastos"],
  "proximos_pasos": ["próximos pasos priorizados y accionables"],
  "riesgos": ["riesgos o señales de alerta a vigilar"]
}
No agregues texto fuera del JSON.`

  let contenido: any
  try {
    const aiResult = await prismaIA.generateContent(prompt)
    const text = aiResult.response.text()
    const jsonString = text.replace(/```json|```/g, "").trim()
    contenido = JSON.parse(jsonString)
  } catch (e) {
    console.error("Finance IA analysis error:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "No se pudo generar el análisis del experto IA." }, { status: 502 })
  }

  const generated_at = new Date().toISOString()
  const { error: upErr } = await db
    .from("finance_ai_analysis")
    .upsert({ mes, contenido, modelo: "gemini-3.5-flash", generated_at }, { onConflict: "mes" })
  if (upErr) {
    console.error("Finance IA analysis save error:", upErr.message)
    // El análisis se generó igual; lo devolvemos aunque no se haya podido guardar.
  }

  return NextResponse.json({ mes, contenido, generated_at, modelo: "gemini-3.5-flash" })
}
