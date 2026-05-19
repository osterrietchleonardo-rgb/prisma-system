"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

interface FunnelStage {
  count: number
  pct: number
}

interface FunnelData {
  chats_recibidos: FunnelStage
  leads_calificados: FunnelStage
  visita_agendada: FunnelStage
  reserva_confirmada: FunnelStage
}

interface Block2FunnelProps {
  funnel: FunnelData
}

const STAGES = [
  { key: "chats_recibidos", label: "Chats recibidos", color: "#60a5fa", lightColor: "rgba(96,165,250,0.15)" },
  { key: "leads_calificados", label: "Leads calificados", color: "#34d399", lightColor: "rgba(52,211,153,0.15)" },
  { key: "visita_agendada", label: "Visita agendada", color: "#a78bfa", lightColor: "rgba(167,139,250,0.15)" },
  { key: "reserva_confirmada", label: "Reserva confirmada", color: "#f59e0b", lightColor: "rgba(245,158,11,0.15)" },
]

export function Block2Funnel({ funnel }: Block2FunnelProps) {
  const maxCount = funnel.chats_recibidos.count || 1

  const stageData = STAGES.map((stage, idx) => {
    const data = funnel[stage.key as keyof FunnelData]
    const prevData = idx > 0 ? funnel[STAGES[idx - 1].key as keyof FunnelData] : null
    const dropCount = prevData ? prevData.count - data.count : 0
    const dropPct = prevData && prevData.count > 0 ? Math.round((dropCount / prevData.count) * 100) : 0
    return { ...stage, ...data, dropCount, dropPct }
  })

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Funnel de Conversión</CardTitle>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                Cada etapa muestra el número de conversaciones que alcanzaron ese punto del proceso comercial.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {stageData.map((stage, idx) => {
            const barWidth = maxCount > 0 ? (stage.count / maxCount) * 100 : 0

            return (
              <TooltipProvider key={stage.key} delayDuration={100}>
                <div className="space-y-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 group cursor-default">
                        {/* Label */}
                        <span className="text-xs text-muted-foreground w-[140px] shrink-0 text-right">
                          {stage.label}
                        </span>

                        {/* Bar */}
                        <div className="flex-1 relative h-8 rounded-lg overflow-hidden bg-muted/30">
                          <div
                            className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: stage.lightColor,
                              borderRight: `2px solid ${stage.color}`,
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-between px-3">
                            <span className="text-xs font-bold" style={{ color: stage.color }}>
                              {stage.count.toLocaleString("es-AR")}
                            </span>
                            <span className="text-xs font-semibold text-foreground/70">
                              {stage.pct}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      <p className="font-semibold">{stage.label}</p>
                      <p>{stage.count.toLocaleString("es-AR")} conversaciones</p>
                      <p>{stage.pct}% del total</p>
                      {idx > 0 && (
                        <p className="text-rose-400 mt-1">
                          ↓ {stage.dropCount} perdidos desde etapa anterior ({stage.dropPct}%)
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>

                  {/* Drop indicator between stages */}
                  {idx > 0 && stage.dropCount > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="w-[140px] shrink-0" />
                      <p className="text-[10px] text-muted-foreground/60 pl-1">
                        ↘ {stage.dropCount} leads perdidos ({stage.dropPct}% de la etapa anterior)
                      </p>
                    </div>
                  )}
                </div>
              </TooltipProvider>
            )
          })}
        </div>

        {/* Summary note */}
        <div className="mt-4 pt-3 border-t border-accent/10">
          <p className="text-xs text-muted-foreground">
            <span className="text-accent font-semibold">{funnel.chats_recibidos.count}</span> conversaciones analizadas.
            Tasa de cierre global:{" "}
            <span className="font-semibold text-foreground/80">
              {funnel.chats_recibidos.count > 0
                ? `${Math.round((funnel.reserva_confirmada.count / funnel.chats_recibidos.count) * 100)}%`
                : "—"}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
