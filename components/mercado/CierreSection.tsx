import { CierreResult, SegmentoCierre } from "@/lib/mercado/fetchCierre"
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ExternalLink, BadgeCheck } from "lucide-react"

interface CierreSectionProps {
  cierre: CierreResult
}

function VarBadge({ val, label }: { val: number | null; label: string }) {
  if (val === null) return null
  const isPos = val > 0
  const isNeutral = val === 0
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`inline-flex items-center gap-0.5 font-semibold ${
          isNeutral ? "text-muted-foreground" : isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isNeutral ? <Minus className="w-3 h-3" /> : isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isPos ? "+" : ""}
        {val}%
      </span>
    </div>
  )
}

function SegmentoCard({ titulo, seg }: { titulo: string; seg: SegmentoCierre | null }) {
  return (
    <div className="rounded-xl border bg-muted/10 p-4 flex flex-col gap-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{titulo}</p>
      <p className="text-2xl font-bold tabular-nums text-emerald-400">
        {seg?.valor != null ? `USD ${seg.valor.toLocaleString("es-AR")}` : "—"}
      </p>
      <div className="flex flex-col gap-1 mt-1">
        <VarBadge val={seg?.var_mensual_pct ?? null} label="Mensual" />
        <VarBadge val={seg?.var_interanual_pct ?? null} label="Interanual" />
        {seg?.brecha_pct != null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Vs. publicado</span>
            <span className="font-semibold text-violet-300/90">{seg.brecha_pct}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function CierreSection({ cierre }: CierreSectionProps) {
  const hasError = !!cierre.error || !cierre.ultimo

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            Precio de cierre real · CABA
            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20">
              <BadgeCheck className="w-3 h-3" />
              Operaciones concretadas
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lo que efectivamente se pagó (no el precio publicado)
            {cierre.periodoLabel ? ` · Informe ${cierre.periodoLabel}` : ""}
          </p>
        </div>
        {hasError && (
          <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-1 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            Sin datos · ucema.edu.ar
          </div>
        )}
      </div>

      {hasError ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          No se pudo obtener el Índice Real m2 (REMAX + UCEMA)
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <SegmentoCard titulo="Promedio CABA" seg={cierre.general} />
          <SegmentoCard titulo="Monoambiente" seg={cierre.amb1} />
          <SegmentoCard titulo="2 ambientes" seg={cierre.amb2} />
          <SegmentoCard titulo="3 ambientes" seg={cierre.amb3} />
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground/50">
          Fuente: Índice Real m2 by REMAX y UCEMA (respaldo de Reporte Inmobiliario) · precios efectivos de venta de departamentos
        </p>
        {cierre.url_pdf && (
          <a
            href={cierre.url_pdf}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-accent transition-colors shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
            Ver informe PDF completo
          </a>
        )}
      </div>
    </div>
  )
}
