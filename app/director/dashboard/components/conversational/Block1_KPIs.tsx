"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  MessageSquare, CalendarCheck, Handshake, Bot,
  TrendingUp, TrendingDown, Percent, CreditCard,
  Home, UserX, Minus
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

interface KPIData {
  chats_unicos: number
  visitas_agendadas: number
  reservas_confirmadas: number
  seguimientos_ia: number
  tasa_consulta_visita: number
  tasa_visita_reserva: number
  consultas_apto_credito: number
  necesitan_vender_antes: number
  solicitaron_humano: number
  derivados_a_humano?: number
  tasa_derivacion_efectiva?: number | null
}

interface Block1KPIsProps {
  kpis: KPIData
}

const KPI_CONFIG = [
  {
    key: "chats_unicos",
    label: "Chats únicos",
    icon: MessageSquare,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    format: "number",
    tooltip: "Cantidad de conversaciones únicas de WhatsApp en el período analizado",
  },
  {
    key: "visitas_agendadas",
    label: "Visitas agendadas",
    icon: CalendarCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    format: "number",
    tooltip: "Conversaciones donde el lead confirmó una visita a una propiedad",
  },
  {
    key: "reservas_confirmadas",
    label: "Reservas confirmadas",
    icon: Handshake,
    color: "text-accent",
    bg: "bg-accent/10",
    format: "number",
    tooltip: "Chats donde se confirmó pago de reserva (puede ser antes o después de la visita)",
  },
  {
    key: "seguimientos_ia",
    label: "Seguimientos IA",
    icon: Bot,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    format: "number",
    tooltip: "Mensajes proactivos enviados por el bot a leads que no habían respondido",
  },
  {
    key: "tasa_consulta_visita",
    label: "Consulta → Visita",
    icon: Percent,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    format: "percent",
    tooltip: "% de chats únicos que derivaron en visita agendada",
  },
  {
    key: "tasa_visita_reserva",
    label: "Visita → Reserva",
    icon: Percent,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    format: "percent",
    tooltip: "% de visitas que derivaron en reserva confirmada",
  },
  {
    key: "consultas_apto_credito",
    label: "Consultas crédito",
    icon: CreditCard,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    format: "number",
    tooltip: "Leads que mencionaron o consultaron sobre crédito hipotecario",
  },
  {
    key: "necesitan_vender_antes",
    label: "Necesitan vender antes",
    icon: Home,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    format: "number",
    tooltip: "Leads que indicaron que deben vender su propiedad actual primero",
  },
  {
    key: "solicitaron_humano",
    label: "Pidieron asesor",
    icon: UserX,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    format: "number",
    tooltip: "Chats donde el lead pidió explícitamente ser atendido por una persona",
  },
]

function formatValue(value: number | null | undefined, format: string): string {
  if (value === null || value === undefined) return "—"
  if (format === "percent") return `${value}%`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toString()
}

function KPICard({ config, value }: { config: typeof KPI_CONFIG[0]; value: number | null | undefined }) {
  const Icon = config.icon
  const formatted = formatValue(value, config.format)

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm hover:border-accent/20 transition-colors group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <Icon className={`h-4 w-4 ${config.color}`} />
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/50 cursor-help mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                {config.tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight">{formatted}</p>
          <p className="text-xs text-muted-foreground leading-tight">{config.label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function Block1KPIs({ kpis }: Block1KPIsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold">Métricas Generales</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          Período analizado
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {KPI_CONFIG.map((config) => (
          <KPICard
            key={config.key}
            config={config}
            value={kpis[config.key as keyof KPIData] as number}
          />
        ))}
      </div>

      {/* Derivation quality row */}
      {kpis.derivados_a_humano !== undefined && kpis.solicitaron_humano > 0 && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg border border-dashed border-accent/20 bg-card/30">
          <p className="text-xs text-muted-foreground w-full font-medium mb-0.5">Derivación a asesor humano</p>
          <div className="flex gap-6 text-sm">
            <span>
              <span className="font-bold">{kpis.solicitaron_humano}</span>
              <span className="text-muted-foreground ml-1">solicitaron</span>
            </span>
            <span>
              <span className="font-bold">{kpis.derivados_a_humano || 0}</span>
              <span className="text-muted-foreground ml-1">derivados</span>
            </span>
            <span className={`font-bold ${(kpis.tasa_derivacion_efectiva || 0) < 80 ? "text-rose-400" : "text-emerald-400"}`}>
              {kpis.tasa_derivacion_efectiva !== null && kpis.tasa_derivacion_efectiva !== undefined
                ? `${kpis.tasa_derivacion_efectiva}% efectividad`
                : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
