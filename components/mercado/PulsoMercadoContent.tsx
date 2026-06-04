import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { DolaresResult } from "@/lib/mercado/fetchDolares"
import { BarriosResult } from "@/lib/mercado/fetchBarrios"
import { ICCResult } from "@/lib/mercado/fetchICC"
import { ZonaResult } from "@/app/api/mercado/zonaprop/route"
import { DolarBar } from "./DolarBar"
import { KpiCards } from "./KpiCards"
import { BarriosTable } from "./BarriosTable"
import { ICCCard } from "./ICCCard"
import { ZonapropSection } from "./ZonapropSection"
import { RefreshButton } from "./RefreshButton"

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
  icc: ICCResult
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

export function PulsoMercadoContent({
  dolares,
  barrios,
  icc,
  zonas,
  lastUpdated,
  zonapropError,
}: PulsoMercadoContentProps) {
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
        <KpiCards dolares={dolares} barrios={barrios} icc={icc} />

        {/* ── Evolution Chart — datos reales del CSV histórico ── */}
        <EvolutionChart historical={barrios.historical ?? []} />

        {/* ── Barrios Table ── */}
        <BarriosTable
          barrios={barrios.barrios}
          period={barrios.period}
          hasError={!!barrios.error || barrios.barrios.length === 0}
        />

        {/* ── ICC Card ── */}
        <ICCCard icc={icc} />

        {/* ── Zonaprop Section ── */}
        <ZonapropSection zonas={zonas} hasError={zonapropError} />

        {/* ── Footer Disclaimer ── */}
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 px-5 py-4">
          <p className="text-xs text-blue-300/80 leading-relaxed">
            💡 <strong>Nota sobre Precios:</strong> El tablero integra precios de <strong>Oferta</strong> (Mudafy) y, cuando hay reporte disponible, precios <strong>Reales de Cierre</strong> (RE/MAX-UCEMA). Cada indicador muestra su fecha real de actualización; las fuentes se sincronizan con el botón <strong>“Actualizar datos”</strong>.
          </p>
        </div>

        {/* ── Global Attributions ── */}
        <div className="border-t pt-4 pb-2 space-y-1">
          <p className="text-[10px] text-muted-foreground/40 leading-relaxed uppercase tracking-widest font-medium mb-2">
            Fuentes de Datos
          </p>
          <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
            • Tipo de cambio: dolarapi.com (tiempo real)<br/>
            • Precios de oferta por barrio: Mudafy<br/>
            • Precios de cierre: RE/MAX · UCEMA · Reporte Inmobiliario<br/>
            • Escrituras CABA: Colegio de Escribanos de la Ciudad de Buenos Aires<br/>
            • ICC (costo construcción): IDECBA (GCBA) · base 2012=100<br/>
            • Reportes regionales: Zonaprop Index
          </p>
        </div>
      </div>
    </div>
  )
}
