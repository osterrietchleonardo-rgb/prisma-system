"use client"

import { Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"
import { useAsesorCreditos } from "@/hooks/use-asesor-creditos"

interface AiCreditBadgeProps {
  className?: string
  showLabel?: boolean
}

export function AiCreditBadge({ className, showLabel = true }: AiCreditBadgeProps) {
  const { data: credits, loading } = useAsesorCreditos()

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/5 border border-accent/10", className)}>
        <Loader2 className="w-4 h-4 text-accent animate-spin" />
        {showLabel && <span className="text-xs font-semibold text-muted-foreground">...</span>}
      </div>
    )
  }

  if (!credits) return null

  const isWarning = credits.porcentaje > 80
  const isDanger  = credits.porcentaje > 95

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/5 border border-accent/10 hover:bg-accent/10 transition-all cursor-default select-none shadow-sm",
            className
          )}>
            <Sparkles className={cn(
              "w-4 h-4 transition-colors",
              isDanger ? "text-destructive" : isWarning ? "text-yellow-500" : "text-accent"
            )} />
            {showLabel && (
              <span className="text-xs font-bold text-foreground">
                {credits.disponible.toLocaleString()}{" "}
                <span className="text-[10px] text-muted-foreground font-medium ml-0.5">créditos</span>
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="w-72 p-4 bg-card border-accent/20 shadow-2xl z-[100]">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Mis Créditos IA</span>
              <span className={cn(
                "text-xs font-bold",
                isDanger ? "text-destructive" : isWarning ? "text-yellow-500" : "text-accent"
              )}>
                {credits.porcentaje}% usado
              </span>
            </div>

            {/* Barra de progreso */}
            <Progress
              value={credits.porcentaje}
              className={cn(
                "h-2",
                isDanger  ? "*:[background-color:hsl(var(--destructive))]"
                : isWarning ? "*:[background-color:#eab308]"
                :             "*:[background-color:hsl(var(--accent))]"
              )}
            />

            {/* Métricas */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-background/60 p-2">
                <div className="text-xs text-muted-foreground">Límite</div>
                <div className="text-sm font-bold">{credits.limiteMensual.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-yellow-500/10 p-2">
                <div className="text-xs text-muted-foreground">Usados</div>
                <div className={`text-sm font-bold ${isWarning ? "text-yellow-400" : ""}`}>
                  {credits.consumidoMes.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <div className="text-xs text-muted-foreground">Quedan</div>
                <div className="text-sm font-bold text-emerald-400">{credits.disponible.toLocaleString()}</div>
              </div>
            </div>

            {/* Desglose por módulo */}
            {credits.desglosePorFeature.length > 0 && (
              <div className="space-y-1.5 border-t border-accent/10 pt-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Por módulo este mes</p>
                {credits.desglosePorFeature.slice(0, 4).map(({ feature, total }) => (
                  <div key={feature} className="flex justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{feature}</span>
                    <span className="font-medium">{total}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/70 text-center border-t border-accent/10 pt-2 italic">
              Cuota personal · {credits.mesActual} · se renueva el 1°
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
