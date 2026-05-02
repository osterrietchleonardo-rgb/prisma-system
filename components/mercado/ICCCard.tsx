import { ICCResult } from "@/lib/mercado/fetchICC"
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react"

interface ICCCardProps {
  icc: ICCResult
}

interface Chapter {
  label: string
  value: number | null
  var: number | null
  color: string
}

function VarBadge({ val }: { val: number | null }) {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>
  const isPositive = val > 0
  const isNeutral = val === 0
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isNeutral
          ? "bg-muted/30 text-muted-foreground"
          : isPositive
          ? "bg-red-500/10 text-red-400"
          : "bg-emerald-500/10 text-emerald-400"
      }`}
    >
      {isNeutral ? (
        <Minus className="w-3 h-3" />
      ) : isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {isPositive ? "+" : ""}
      {val}%
    </span>
  )
}

export function ICCCard({ icc }: ICCCardProps) {
  const hasError = !!icc.error || icc.data === null

  const chapters: Chapter[] = icc.data
    ? [
        {
          label: "Nivel General",
          value: icc.data.icc_nivel_general,
          var: icc.data.var_nivel_general_pct,
          color: "bg-violet-500/20 border-violet-500/30",
        },
        {
          label: "Materiales",
          value: icc.data.icc_materiales,
          var: icc.data.var_materiales_pct,
          color: "bg-blue-500/20 border-blue-500/30",
        },
        {
          label: "Mano de Obra",
          value: icc.data.icc_mano_obra,
          var: icc.data.var_mano_obra_pct,
          color: "bg-amber-500/20 border-amber-500/30",
        },
        {
          label: "Gastos Generales",
          value: icc.data.icc_gastos_generales,
          var: icc.data.var_gastos_generales_pct,
          color: "bg-emerald-500/20 border-emerald-500/30",
        },
      ]
    : []

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Costo de Construcción — ICC INDEC
          </h3>
          {icc.data?.indice_tiempo && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Período: {icc.data.indice_tiempo}
            </p>
          )}
        </div>
        {hasError && (
          <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-1">
            <AlertTriangle className="w-3 h-3" />
            Sin datos · datos.gob.ar
          </div>
        )}
      </div>

      {hasError ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          No se pudo obtener el índice ICC INDEC
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {chapters.map((ch) => (
            <div
              key={ch.label}
              className={`rounded-xl border p-4 ${ch.color}`}
            >
              <p className="text-xs text-muted-foreground font-medium mb-2">{ch.label}</p>
              <p className="text-xl font-bold tabular-nums mb-2">
                {ch.value !== null ? ch.value.toLocaleString("es-AR", { minimumFractionDigits: 1 }) : "—"}
              </p>
              <VarBadge val={ch.var} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-border/50">
        <p className="text-xs text-amber-300/80 font-medium bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          ⚠ Índice base 1993=100. No es un precio absoluto en $/m².
        </p>
        <p className="text-[10px] text-muted-foreground/50">
          Fuente: INDEC · datos.gob.ar · CC-BY 4.0
        </p>
      </div>
    </div>
  )
}
