import { DolaresResult } from "@/lib/mercado/fetchDolares"
import { BarriosResult } from "@/lib/mercado/fetchBarrios"
import { ICCResult } from "@/lib/mercado/fetchICC"
import { Building2, DollarSign, HardHat, FileText, AlertTriangle } from "lucide-react"

interface KpiCardsProps {
  dolares: DolaresResult
  barrios: BarriosResult
  icc: ICCResult
}

function fmt(val: number | null, prefix = "", suffix = ""): string {
  if (val === null) return "—"
  return `${prefix}${val.toLocaleString("es-AR")}${suffix}`
}

interface KpiCardDef {
  title: string
  value: string
  sub: string
  badge?: string | null
  badgeColor?: string
  icon: React.ReactNode
  accent: string
  bg: string
  hasError: boolean
  errorSource: string
}

export function KpiCards({ dolares, barrios, icc }: KpiCardsProps) {
  const cards: KpiCardDef[] = [
    {
      title: "m² Promedio CABA",
      value: fmt(barrios.promedio_caba_usd, "USD "),
      sub: barrios.period ? `Período: ${barrios.period}` : "Último mes disponible",
      icon: <Building2 className="w-5 h-5" />,
      accent: "text-violet-400",
      bg: "from-violet-500/10 to-violet-500/5 border-violet-500/20",
      hasError: !!barrios.error || barrios.promedio_caba_usd === null,
      errorSource: "data.buenosaires.gob.ar",
    },
    {
      title: "Dólar MEP",
      value: fmt(dolares.mep?.venta ?? null, "$"),
      sub: "Venta (bolsa)",
      icon: <DollarSign className="w-5 h-5" />,
      accent: "text-violet-400",
      bg: "from-violet-500/10 to-violet-500/5 border-violet-500/20",
      hasError: !!dolares.error || dolares.mep === null,
      errorSource: "dolarapi.com",
    },
    {
      title: "Índice ICC General",
      value: fmt(icc.data?.icc_nivel_general ?? null),
      sub: icc.data
        ? `Var. mensual: ${icc.data.var_nivel_general_pct >= 0 ? "+" : ""}${icc.data.var_nivel_general_pct}% · i.a.: +${icc.data.var_anual_pct}%`
        : "Base 2012=100 · IDECBA",
      badge: icc.data ? `${icc.data.indice_tiempo}` : null,
      badgeColor: "text-amber-400/80",
      icon: <HardHat className="w-5 h-5" />,
      accent: "text-amber-400",
      bg: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
      hasError: !!icc.error || icc.data === null,
      errorSource: "estadisticaciudad.gob.ar",
    },
    {
      title: "Escrituras CABA",
      value: barrios.escrituras_count ? `${barrios.escrituras_count.toLocaleString("es-AR")}` : "—",
      sub: barrios.escrituras_count
        ? `Actos compraventa ${barrios.escrituras_year ?? ""}`
        : "Sin datos disponibles",
      badge: barrios.escrituras_var != null
        ? `${barrios.escrituras_var >= 0 ? "+" : ""}${barrios.escrituras_var}% i.a.`
        : null,
      badgeColor: (barrios.escrituras_var ?? 0) >= 0 ? "text-emerald-400" : "text-red-400",
      icon: <FileText className="w-5 h-5" />,
      accent: "text-emerald-400",
      bg: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
      hasError: barrios.escrituras_count === null,
      errorSource: "estadisticaciudad.gob.ar",
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`relative rounded-2xl border bg-gradient-to-br p-5 ${card.bg} overflow-hidden`}
        >
          {/* Decorative glow */}
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/5 blur-xl pointer-events-none" />

          <div className="flex items-start justify-between mb-3">
            <div className={`${card.accent} opacity-80`}>{card.icon}</div>
            {card.hasError && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                Sin datos
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
            {card.title}
          </p>
          <p className={`text-2xl font-bold tracking-tight ${card.hasError ? "text-muted-foreground" : "text-foreground"}`}>
            {card.value}
          </p>
          {card.badge && (
            <span className={`text-xs font-semibold mt-0.5 ${card.badgeColor ?? "text-muted-foreground"}`}>
              {card.badge}
            </span>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {card.hasError ? `⚠ Sin datos disponibles · ${card.errorSource}` : card.sub}
          </p>
        </div>
      ))}
    </div>
  )
}
