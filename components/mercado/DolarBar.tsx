import { DolaresResult } from "@/lib/mercado/fetchDolares"
import { AlertTriangle } from "lucide-react"

interface DolarBarProps {
  data: DolaresResult
}

interface DolarTile {
  label: string
  compra: number | null
  venta: number | null
  accent: string
  bg: string
}

function fmt(val: number | null): string {
  if (val === null) return "—"
  return val.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function DolarBar({ data }: DolarBarProps) {
  const tiles: DolarTile[] = [
    {
      label: "Oficial",
      compra: data.oficial?.compra ?? null,
      venta: data.oficial?.venta ?? null,
      accent: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
    {
      label: "MEP (Bolsa)",
      compra: data.mep?.compra ?? null,
      venta: data.mep?.venta ?? null,
      accent: "text-violet-400",
      bg: "bg-violet-500/10 border-violet-500/20",
    },
    {
      label: "Blue",
      compra: data.blue?.compra ?? null,
      venta: data.blue?.venta ?? null,
      accent: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: "CCL",
      compra: data.ccl?.compra ?? null,
      venta: data.ccl?.venta ?? null,
      accent: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
  ]

  const hasError = !!data.error

  return (
    <div className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-md shadow-sm">
      <div className="px-4 md:px-8 py-2">
        {hasError ? (
          <div className="flex items-center gap-2 text-xs text-amber-400 py-1">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span>⚠ Sin datos disponibles · dolarapi.com</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mr-2">
              Dólar hoy
            </span>
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs ${tile.bg}`}
              >
                <span className={`font-bold ${tile.accent}`}>{tile.label}</span>
                <span className="text-muted-foreground">
                  C: <span className="text-foreground font-semibold">${fmt(tile.compra)}</span>
                </span>
                <span className="text-muted-foreground">
                  V: <span className="text-foreground font-semibold">${fmt(tile.venta)}</span>
                </span>
              </div>
            ))}
            <span className="text-[9px] text-muted-foreground/50 ml-auto">
              Fuente: dolarapi.com
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
