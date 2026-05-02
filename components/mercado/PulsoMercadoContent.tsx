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
  lastUpdated: string
  zonapropError: boolean
}

function formatDateTime(iso: string): string {
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
              Datos en tiempo real del mercado inmobiliario argentino
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Última actualización: {formatDateTime(lastUpdated)}
            </p>
          </div>
          <RefreshButton />
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
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
          <p className="text-xs text-amber-300/80 leading-relaxed">
            ⚠ <strong>Nota:</strong> Precios de publicación (oferta). El cierre real suele ser entre un{" "}
            <strong>8% y 15% menor</strong>. Fuente: UCEMA / RE/MAX.
          </p>
        </div>

        {/* ── Global Attributions ── */}
        <div className="border-t pt-4 pb-2 space-y-1">
          <p className="text-[10px] text-muted-foreground/40">
            Tipo de cambio: Fuente: dolarapi.com ·
            Precios m² CABA: DGEyC-GCBA / Argenprop · data.buenosaires.gob.ar · CC-BY 2.5 AR ·
            ICC INDEC: datos.gob.ar · CC-BY 4.0 ·
            Reportes de mercado: Zonaprop · zonaprop.com.ar
          </p>
        </div>
      </div>
    </div>
  )
}
