import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { DolaresResult } from "@/lib/mercado/fetchDolares"
import { BarriosResult } from "@/lib/mercado/fetchBarrios"
import { CierreResult } from "@/lib/mercado/fetchCierre"
import { ICCResult } from "@/lib/mercado/fetchICC"
import { EscriturasResult } from "@/lib/mercado/fetchEscrituras"
import { ZonaResult } from "@/app/api/mercado/zonaprop/route"
import { DolarBar } from "./DolarBar"
import { KpiCards } from "./KpiCards"
import { CierreSection } from "./CierreSection"
import { BarriosTable } from "./BarriosTable"
import { ICCCard } from "./ICCCard"
import { ZonapropSection } from "./ZonapropSection"
import { RefreshButton } from "./RefreshButton"
import type { EvolutionPoint } from "./EvolutionChart"

// Dynamic import — client-only Recharts component
const EvolutionChart = dynamic(
  () => import("./EvolutionChart").then((m) => m.EvolutionChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[340px] w-full rounded-2xl" />,
  }
)

interface PulsoMercadoContentProps {
  dolares: DolaresResult
  barrios: BarriosResult
  cierre: CierreResult
  icc: ICCResult
  escrituras: EscriturasResult
  zonas: ZonaResult[]
  lastUpdated: string | null
  zonapropError: boolean
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Sin datos disponibles"
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function labelMes(periodo: string): string {
  const m = periodo.match(/(\d{4})-(\d{2})/)
  if (!m) return periodo
  return `${MESES_ABREV[Number(m[2]) - 1] ?? m[2]} ${m[1].slice(2)}`
}

/** Une lista (Zonaprop) y cierre real (REMAX+UCEMA) por mes. Últimos 18 meses. */
function buildEvolution(barrios: BarriosResult, cierre: CierreResult): EvolutionPoint[] {
  const puntos = new Map<string, EvolutionPoint>()
  for (const h of barrios.historical ?? []) {
    puntos.set(h.periodo, { periodo: h.periodo, label: h.label, lista: h.promedio_caba_usd, cierre: null })
  }
  for (const c of cierre.serie) {
    if (c.cierre_general_usd == null) continue
    const prev = puntos.get(c.periodo)
    if (prev) prev.cierre = c.cierre_general_usd
    else puntos.set(c.periodo, { periodo: c.periodo, label: labelMes(c.periodo), lista: null, cierre: c.cierre_general_usd })
  }
  return Array.from(puntos.values())
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .slice(-18)
}

export function PulsoMercadoContent({
  dolares,
  barrios,
  cierre,
  icc,
  escrituras,
  zonas,
  lastUpdated,
  zonapropError,
}: PulsoMercadoContentProps) {
  const evolution = buildEvolution(barrios, cierre)

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky Dolar Bar */}
      <DolarBar data={dolares} />

      <div className="px-4 md:px-8 py-8 space-y-8 max-w-screen-2xl w-full mx-auto animate-in fade-in duration-300">
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Pulso de Mercado</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cotización del dólar en tiempo real · Indicadores inmobiliarios por reporte oficial
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Datos de mercado actualizados: {formatDateTime(lastUpdated)}
            </p>
          </div>
          <RefreshButton lastUpdated={lastUpdated} />
        </div>

        {/* ── KPI Cards ── */}
        <KpiCards dolares={dolares} cierre={cierre} icc={icc} escrituras={escrituras} />

        {/* ── Evolution Chart — lista (Zonaprop) vs cierre real (REMAX+UCEMA) ── */}
        <EvolutionChart data={evolution} />

        {/* ── Cierre real por ambientes ── */}
        <CierreSection cierre={cierre} />

        {/* ── Barrios Table ── */}
        <BarriosTable
          barrios={barrios.barrios}
          fuente={barrios.fuente}
          fechaActualizacion={barrios.fecha_actualizacion}
          brechaPct={cierre.general?.brecha_pct ?? null}
          brechaLabel={cierre.periodoLabel}
          hasError={!!barrios.error || barrios.barrios.length === 0}
        />

        {/* ── ICC Card ── */}
        <ICCCard icc={icc} />

        {/* ── Zonaprop Section ── */}
        <ZonapropSection zonas={zonas} hasError={zonapropError} />


      </div>
    </div>
  )
}
