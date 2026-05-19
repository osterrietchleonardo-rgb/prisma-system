"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

interface TopItem { label: string; count: number; pct: number }
interface VisitaRate { label: string; total: number; visitas: number; tasa: number }

interface DemandData {
  top_zonas: TopItem[]
  top_barrios: TopItem[]
  tipo_propiedad_demanda: TopItem[]
  tipo_operacion_demanda: TopItem[]
  ambientes_demanda: TopItem[]
  tasa_visita_por_tipo_propiedad: VisitaRate[]
  tasa_visita_por_operacion: VisitaRate[]
  presupuesto_compra_usd: { avg: number | null; min: number | null; max: number | null }
  presupuesto_alquiler_ars: { avg: number | null }
}

const TIPO_PROP_LABELS: Record<string, string> = {
  departamento: "Departamento", casa: "Casa", ph: "PH", duplex: "Dúplex",
  local_comercial: "Local Comercial", terreno: "Terreno", oficina: "Oficina", country: "Country",
}
const TIPO_OP_LABELS: Record<string, string> = {
  compra: "Compra", alquiler: "Alquiler", inversion: "Inversión",
}

function HBar({ label, count, pct, total, color, extra }: {
  label: string; count: number; pct: number; total: number; color: string; extra?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-[130px] shrink-0 truncate">{label}</span>
      <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden">
        <div className="h-full rounded-sm" style={{ width: `${(count / (total || 1)) * 100}%`, backgroundColor: color, opacity: 0.75 }} />
      </div>
      <span className="text-[11px] font-semibold w-6 text-right shrink-0">{count}</span>
      <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{pct}%</span>
      {extra && <span className="text-[10px] text-accent shrink-0">{extra}</span>}
    </div>
  )
}

function VisitaRateCard({ title, icon, data }: { title: string; icon: string; data: VisitaRate[] }) {
  const maxTasa = Math.max(...data.map(d => d.tasa), 1)
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/40 cursor-help ml-auto" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">
                Porcentaje de conversaciones de ese tipo que derivaron en visita agendada.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2.5">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos suficientes</p>
        ) : data.map(item => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{TIPO_PROP_LABELS[item.label] || TIPO_OP_LABELS[item.label] || item.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{item.visitas}/{item.total}</span>
                <span className={`font-bold ${item.tasa >= 30 ? "text-emerald-400" : item.tasa >= 15 ? "text-amber-400" : "text-rose-400"}`}>
                  {item.tasa}%
                </span>
              </div>
            </div>
            <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(item.tasa / maxTasa) * 100}%`,
                  backgroundColor: item.tasa >= 30 ? "#34d399" : item.tasa >= 15 ? "#f59e0b" : "#fb7185",
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function Block4DemandAnalysis({ demand_analysis }: { demand_analysis: DemandData }) {
  const d = demand_analysis
  const maxProp = d.tipo_propiedad_demanda[0]?.count || 1
  const maxBarrio = d.top_barrios[0]?.count || 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold">Análisis de Demanda</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Qué pide el mercado?
        </span>
      </div>

      {/* Row 1: tipo prop + operación + barrios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>🏗️</span><CardTitle className="text-sm font-semibold">Tipo de propiedad</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {d.tipo_propiedad_demanda.length === 0
              ? <p className="text-xs text-muted-foreground">Sin datos</p>
              : d.tipo_propiedad_demanda.map(item => (
                <HBar key={item.label} label={TIPO_PROP_LABELS[item.label] || item.label}
                  count={item.count} pct={item.pct} total={maxProp} color="#2dd4bf" />
              ))}
          </CardContent>
        </Card>

        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>📍</span><CardTitle className="text-sm font-semibold">Top barrios consultados</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {d.top_barrios.length === 0
              ? <p className="text-xs text-muted-foreground">Sin datos</p>
              : d.top_barrios.slice(0, 8).map(item => (
                <HBar key={item.label} label={item.label}
                  count={item.count} pct={item.pct} total={maxBarrio} color="#c084fc" />
              ))}
          </CardContent>
        </Card>

        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>🚪</span><CardTitle className="text-sm font-semibold">Ambientes más buscados</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {d.ambientes_demanda.length === 0
              ? <p className="text-xs text-muted-foreground">Sin datos</p>
              : d.ambientes_demanda.map(item => (
                <HBar key={item.label} label={`${item.label} amb.`}
                  count={item.count} pct={item.pct} total={d.ambientes_demanda[0]?.count || 1} color="#a78bfa" />
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Tasas de visita */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VisitaRateCard title="Tasa de visita por tipo de propiedad" icon="📊"
          data={d.tasa_visita_por_tipo_propiedad} />
        <VisitaRateCard title="Tasa de visita por tipo de operación" icon="🔄"
          data={d.tasa_visita_por_operacion} />
      </div>

      {/* Row 3: Budget summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>💰</span><CardTitle className="text-sm font-semibold">Rangos de presupuesto declarado</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-blue-400">Compra (USD)</p>
                {d.presupuesto_compra_usd.avg
                  ? <>
                    <p className="text-xl font-bold">{`USD ${d.presupuesto_compra_usd.avg.toLocaleString("es-AR")}`}</p>
                    <p className="text-xs text-muted-foreground">promedio declarado</p>
                    {d.presupuesto_compra_usd.min && d.presupuesto_compra_usd.max && (
                      <p className="text-xs text-muted-foreground">
                        {`USD ${d.presupuesto_compra_usd.min.toLocaleString()} – ${d.presupuesto_compra_usd.max.toLocaleString()}`}
                      </p>
                    )}
                  </>
                  : <p className="text-sm text-muted-foreground">Sin datos</p>}
              </div>
              <div className="space-y-1 border-l border-accent/10 pl-4">
                <p className="text-xs font-semibold text-teal-400">Alquiler (ARS)</p>
                {d.presupuesto_alquiler_ars.avg
                  ? <>
                    <p className="text-xl font-bold">{`$ ${d.presupuesto_alquiler_ars.avg.toLocaleString("es-AR")}`}</p>
                    <p className="text-xs text-muted-foreground">promedio declarado</p>
                  </>
                  : <p className="text-sm text-muted-foreground">Sin datos</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>🗺️</span><CardTitle className="text-sm font-semibold">Top zonas</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {d.top_zonas.length === 0
              ? <p className="text-xs text-muted-foreground">Sin datos</p>
              : d.top_zonas.slice(0, 7).map(item => (
                <HBar key={item.label} label={item.label}
                  count={item.count} pct={item.pct} total={d.top_zonas[0]?.count || 1} color="#60a5fa" />
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
