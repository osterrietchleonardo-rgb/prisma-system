"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Info } from "lucide-react"
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TopItem {
  label: string
  count: number
  pct: number
}

interface LeadProfileData {
  tipo_operacion: TopItem[]
  tipo_propiedad: TopItem[]
  ambientes: TopItem[]
  composicion_familiar: TopItem[]
  urgencia: TopItem[]
  presupuesto_compra_avg_usd: number | null
  presupuesto_alquiler_avg_ars: number | null
  inversores: number
  con_preaprobacion: number
  primera_vez: number
  con_experiencia: number
  top_intereses: TopItem[]
  top_necesidades: TopItem[]
  top_motivos: TopItem[]
  top_barrios: TopItem[]
  causas_no_avance: TopItem[]
}

interface Block3LeadProfileProps {
  lead_profile: LeadProfileData
  totalConversations: number
}

const OPERACION_COLORS: Record<string, string> = {
  compra: "#60a5fa",
  alquiler: "#2dd4bf",
  inversion: "#f59e0b",
  null: "#6b7280",
}
const OPERACION_LABELS: Record<string, string> = {
  compra: "Compra",
  alquiler: "Alquiler",
  inversion: "Inversión",
}

const URGENCIA_COLORS: Record<string, string> = {
  inmediata: "#f87171",
  corto_plazo: "#fb923c",
  medio_plazo: "#a78bfa",
  explorando: "#6b7280",
}
const URGENCIA_LABELS: Record<string, string> = {
  inmediata: "< 1 mes",
  corto_plazo: "1–3 meses",
  medio_plazo: "3–6 meses",
  explorando: "Solo explorando",
}

function HorizontalBarsCard({
  title,
  icon,
  items,
  barColor,
  labelMap,
  tooltip,
}: {
  title: string
  icon: string
  items: TopItem[]
  barColor: string
  labelMap?: Record<string, string>
  tooltip?: string
}) {
  const max = items[0]?.count || 1
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {tooltip && (
            <TooltipProvider delayDuration={200}>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground/40 cursor-help ml-auto" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px] text-xs">{tooltip}</TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos suficientes</p>
        ) : (
          items.slice(0, 8).map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-[110px] shrink-0 truncate">
                {labelMap?.[item.label] || item.label}
              </span>
              <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{
                    width: `${(item.count / max) * 100}%`,
                    backgroundColor: barColor,
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="text-[11px] font-semibold w-8 text-right shrink-0">{item.count}</span>
              <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{item.pct}%</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function DonutCard({
  title,
  icon,
  data,
  colorMap,
  labelMap,
  tooltip,
}: {
  title: string
  icon: string
  data: TopItem[]
  colorMap: Record<string, string>
  labelMap?: Record<string, string>
  tooltip?: string
}) {
  const chartData = data.map(d => ({
    name: labelMap?.[d.label] || d.label,
    value: d.count,
    pct: d.pct,
    color: colorMap[d.label] || "#6b7280",
  }))

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {tooltip && (
            <TooltipProvider delayDuration={200}>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground/40 cursor-help ml-auto" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px] text-xs">{tooltip}</TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {chartData.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos suficientes</p>
        ) : (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="40%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a2e",
                    border: "1px solid rgba(184,115,51,0.2)",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                  formatter={(value: number, name: string) => [`${value} (${chartData.find(d => d.name === name)?.pct}%)`, name]}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", paddingLeft: "8px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BudgetCard({ lead_profile }: { lead_profile: LeadProfileData }) {
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <CardTitle className="text-sm font-semibold">Presupuesto declarado</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-400">Compra (USD)</p>
          <p className="text-xl font-bold">
            {lead_profile.presupuesto_compra_avg_usd
              ? `USD ${lead_profile.presupuesto_compra_avg_usd.toLocaleString("es-AR")}`
              : <span className="text-muted-foreground text-sm">Sin datos</span>}
          </p>
          <p className="text-xs text-muted-foreground">Promedio declarado</p>
        </div>
        <div className="border-t border-accent/10 pt-3 space-y-1">
          <p className="text-xs font-semibold text-teal-400">Alquiler (ARS)</p>
          <p className="text-xl font-bold">
            {lead_profile.presupuesto_alquiler_avg_ars
              ? `$ ${lead_profile.presupuesto_alquiler_avg_ars.toLocaleString("es-AR")}`
              : <span className="text-muted-foreground text-sm">Sin datos</span>}
          </p>
          <p className="text-xs text-muted-foreground">Promedio declarado</p>
        </div>
      </CardContent>
    </Card>
  )
}

function FlagMetricsCard({ lead_profile, total }: { lead_profile: LeadProfileData; total: number }) {
  const items = [
    { label: "Primera vez comprando", value: lead_profile.primera_vez, color: "text-blue-400" },
    { label: "Con experiencia previa", value: lead_profile.con_experiencia, color: "text-emerald-400" },
    { label: "Inversores (buscan renta)", value: lead_profile.inversores, color: "text-amber-400" },
    { label: "Con preaprobación crédito", value: lead_profile.con_preaprobacion, color: "text-purple-400" },
  ]

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <CardTitle className="text-sm font-semibold">Perfil del comprador</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
              <span className="text-xs text-muted-foreground">
                {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "—"}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function Block3LeadProfile({ lead_profile, totalConversations }: Block3LeadProfileProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold">Perfil del Lead Buscador</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Quién consulta y qué busca?
        </span>
      </div>

      {/* Row 1: Donuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DonutCard
          title="Tipo de operación"
          icon="🔄"
          data={lead_profile.tipo_operacion}
          colorMap={OPERACION_COLORS}
          labelMap={OPERACION_LABELS}
          tooltip="Qué tipo de operación está buscando el lead, inferido por IA del texto de la conversación"
        />
        <DonutCard
          title="Urgencia de búsqueda"
          icon="⏱️"
          data={lead_profile.urgencia}
          colorMap={URGENCIA_COLORS}
          labelMap={URGENCIA_LABELS}
          tooltip="Plazo declarado o inferido en el que el lead necesita concretar"
        />
      </div>

      {/* Row 2: Bars + budget */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <HorizontalBarsCard
          title="Tipo de propiedad"
          icon="🏗️"
          items={lead_profile.tipo_propiedad}
          barColor="#2dd4bf"
          tooltip="Tipo de inmueble que busca el lead"
        />
        <HorizontalBarsCard
          title="Cantidad de ambientes"
          icon="🚪"
          items={lead_profile.ambientes}
          barColor="#a78bfa"
          tooltip="Número de ambientes requeridos por el lead"
        />
        <BudgetCard lead_profile={lead_profile} />
      </div>

      {/* Row 3: Profile qualitative */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <HorizontalBarsCard
          title="Composición familiar"
          icon="👨‍👩‍👧"
          items={lead_profile.composicion_familiar}
          barColor="#fb7185"
          labelMap={{
            pareja_sin_hijos: "Pareja sin hijos",
            familia_con_hijos: "Familia con hijos",
            soltero: "Soltero/a",
            adulto_mayor_solo: "Adulto mayor",
            adultos_mayores_pareja: "Adultos mayores",
          }}
          tooltip="Composición del hogar declarada o inferida por el lead"
        />
        <HorizontalBarsCard
          title="Top barrios consultados"
          icon="📍"
          items={lead_profile.top_barrios}
          barColor="#c084fc"
          tooltip="Barrios o zonas mencionadas por el lead durante la conversación"
        />
        <FlagMetricsCard lead_profile={lead_profile} total={totalConversations} />
      </div>

      {/* Row 4: Interests + needs + loss reasons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <HorizontalBarsCard
          title="Intereses declarados"
          icon="❤️"
          items={lead_profile.top_intereses}
          barColor="#fb923c"
          tooltip="Lo que el lead valora o menciona como importante en la propiedad"
        />
        <HorizontalBarsCard
          title="Necesidades explícitas"
          icon="✅"
          items={lead_profile.top_necesidades}
          barColor="#60a5fa"
          tooltip="Requisitos concretos que el lead enuncia como imprescindibles"
        />
        <HorizontalBarsCard
          title="Causas de no avance"
          icon="⚠️"
          items={lead_profile.causas_no_avance}
          barColor="#fb7185"
          tooltip="Razones inferidas por las que el lead no continuó el proceso"
        />
      </div>
    </div>
  )
}
