"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  KanbanSquare, CheckCircle2, XCircle, Users, MessageCircle, Building2, Info, TrendingUp
} from "lucide-react"
import Link from "next/link"

// ── Types ─────────────────────────────────────────────────────────────────────
interface PipelineStage {
  id: string
  total: number
  leads_whatsapp: number
  leads_tokko: number
  leads_manual: number
  leads_total: number
}

interface PipelineSummary {
  total: number
  total_activos: number
  total_cerrado: number
  total_perdido: number
  tasa_cierre_real: number | null
  total_whatsapp: number
  total_tokko: number
  total_manual: number
}

interface Props {
  stages: PipelineStage[]
  summary: PipelineSummary
}

// ── Stage labels & colors ─────────────────────────────────────────────────────
const STAGE_META: Record<string, { label: string; color: string; light: string; desc: string }> = {
  nuevo:            { label: "Nuevo contacto",    color: "#60a5fa", light: "rgba(96,165,250,0.15)",   desc: "Leads recién ingresados, sin primer contacto" },
  contacto:         { label: "Primer contacto",   color: "#fb923c", light: "rgba(251,146,60,0.15)",   desc: "Se realizó un primer contacto con el lead" },
  calificado:       { label: "Calificado",         color: "#a78bfa", light: "rgba(167,139,250,0.15)",  desc: "Lead con intención real y presupuesto definido" },
  visita_agendada:  { label: "Visita agendada",    color: "#f59e0b", light: "rgba(245,158,11,0.15)",   desc: "Visita confirmada para ver la propiedad" },
  visita_realizada: { label: "Visita realizada",   color: "#2dd4bf", light: "rgba(45,212,191,0.15)",   desc: "El lead ya visitó la propiedad" },
  propuesta:        { label: "Propuesta enviada",  color: "#818cf8", light: "rgba(129,140,248,0.15)",  desc: "Se envió propuesta económica al lead" },
  negociacion:      { label: "Negociación",         color: "#c084fc", light: "rgba(192,132,252,0.15)",  desc: "En proceso de negociación activa" },
  cerrado:          { label: "Cerrado (Ganado)",   color: "#34d399", light: "rgba(52,211,153,0.15)",   desc: "Lead que cerró operación exitosamente" },
  perdido:          { label: "Perdido",             color: "#f87171", light: "rgba(248,113,113,0.15)",  desc: "Lead que no avanzó o fue descartado" },
}

// ── Main component ────────────────────────────────────────────────────────────
export function DashboardPipelineSection({ stages, summary }: Props) {
  const maxTotal = Math.max(...stages.map(s => s.total), 1)

  // Active stages (not cerrado/perdido)
  const activeStages = stages.filter(s => s.id !== "cerrado" && s.id !== "perdido")
  const closedStages = stages.filter(s => s.id === "cerrado" || s.id === "perdido")

  return (
    <section className="mt-12 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KanbanSquare className="h-6 w-6 text-accent" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Estado del Pipeline</h2>
            <p className="text-xs text-muted-foreground">
              Todos los leads activos — WhatsApp + Tokko Broker + Manual
            </p>
          </div>
        </div>
        <Link
          href="/director/pipeline"
          className="text-xs text-accent font-semibold hover:underline flex items-center gap-1"
        >
          Ver Pipeline completo →
        </Link>
      </div>

      {/* ── Summary KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          label="Total leads"
          value={summary.total}
          icon={<Users className="h-4 w-4 text-accent" />}
          desc="Todos los leads de todas las fuentes"
        />
        <SummaryCard
          label="Activos"
          value={summary.total_activos}
          icon={<TrendingUp className="h-4 w-4 text-blue-400" />}
          desc="Leads en proceso (excluye cerrados y perdidos)"
          valueClass="text-blue-400"
        />
        <SummaryCard
          label="Cerrados"
          value={summary.total_cerrado}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          desc="Operaciones cerradas exitosamente"
          valueClass="text-emerald-400"
        />
        <SummaryCard
          label="Perdidos"
          value={summary.total_perdido}
          icon={<XCircle className="h-4 w-4 text-rose-400" />}
          desc="Leads que no avanzaron"
          valueClass="text-rose-400"
        />
        <SummaryCard
          label="Tasa de cierre"
          value={summary.tasa_cierre_real !== null ? `${summary.tasa_cierre_real}%` : "—"}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          desc="Cerrados / (Cerrados + Perdidos)"
          valueClass={
            summary.tasa_cierre_real !== null
              ? summary.tasa_cierre_real >= 60 ? "text-emerald-400"
              : summary.tasa_cierre_real >= 40 ? "text-amber-400"
              : "text-rose-400"
              : ""
          }
        />
        {/* Origen breakdown */}
        <Card className="border-accent/10 bg-card/50 p-3 flex flex-col gap-1.5">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Por origen</p>
          {summary.total_whatsapp > 0 && (
            <div className="flex items-center gap-1.5">
              <MessageCircle className="h-3 w-3 text-green-400 shrink-0" />
              <span className="text-xs text-muted-foreground">WhatsApp</span>
              <span className="ml-auto text-xs font-bold text-green-400">{summary.total_whatsapp}</span>
            </div>
          )}
          {summary.total_tokko > 0 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="text-xs text-muted-foreground">Tokko</span>
              <span className="ml-auto text-xs font-bold text-blue-400">{summary.total_tokko}</span>
            </div>
          )}
          {summary.total_manual > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-purple-400 shrink-0" />
              <span className="text-xs text-muted-foreground">Manual</span>
              <span className="ml-auto text-xs font-bold text-purple-400">{summary.total_manual}</span>
            </div>
          )}
        </Card>
      </div>

      {/* ── Stage bars ── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Etapas activas */}
        {activeStages.length > 0 && (
          <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-semibold uppercase tracking-wide">
                Etapas activas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeStages.map(stage => (
                <StageBar key={stage.id} stage={stage} maxTotal={maxTotal} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Etapas finales (cerrado / perdido) */}
        {closedStages.length > 0 && (
          <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground font-semibold uppercase tracking-wide">
                  Etapas finales
                </CardTitle>
                {summary.tasa_cierre_real !== null && (
                  <span className={`text-xs font-bold ${
                    summary.tasa_cierre_real >= 60 ? "text-emerald-400"
                    : summary.tasa_cierre_real >= 40 ? "text-amber-400"
                    : "text-rose-400"
                  }`}>
                    Tasa de cierre: {summary.tasa_cierre_real}%
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {closedStages.map(stage => (
                <StageBar key={stage.id} stage={stage} maxTotal={maxTotal} />
              ))}

              {/* Note sobre Tokko leads en cerrado */}
              {(summary.total_tokko > 0) && (
                <p className="text-[10px] text-muted-foreground/60 pt-2 border-t border-accent/10">
                  ℹ Los leads de Tokko Broker marcados como "cerrado" en Tokko se sincronizan automáticamente.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SummaryCard({
  label, value, icon, desc, valueClass = ""
}: {
  label: string; value: string | number; icon: React.ReactNode; desc: string; valueClass?: string
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="border-accent/10 bg-card/50 p-3 cursor-default">
            <div className="flex items-center gap-1.5 mb-1.5">{icon}
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
          </Card>
        </TooltipTrigger>
        <TooltipContent className="text-xs max-w-[180px]">{desc}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function StageBar({ stage, maxTotal }: { stage: PipelineStage; maxTotal: number }) {
  const meta = STAGE_META[stage.id] || { label: stage.id, color: "#6b7280", light: "rgba(107,114,128,0.15)", desc: "" }
  const barWidth = maxTotal > 0 ? (stage.total / maxTotal) * 100 : 0

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-3 cursor-default">
            <span className="text-xs text-muted-foreground w-[130px] shrink-0 text-right truncate">
              {meta.label}
            </span>
            <div className="flex-1 relative h-7 rounded-lg overflow-hidden bg-muted/30">
              <div
                className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700"
                style={{ width: `${barWidth}%`, backgroundColor: meta.light, borderRight: `2px solid ${meta.color}` }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2">
                <span className="text-xs font-bold" style={{ color: meta.color }}>{stage.total}</span>
                <div className="flex items-center gap-1.5">
                  {stage.leads_whatsapp > 0 && (
                    <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                      <MessageCircle className="h-2.5 w-2.5" />{stage.leads_whatsapp}
                    </span>
                  )}
                  {stage.leads_tokko > 0 && (
                    <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
                      <Building2 className="h-2.5 w-2.5" />{stage.leads_tokko}
                    </span>
                  )}
                  {stage.leads_manual > 0 && (
                    <span className="text-[10px] text-purple-400 flex items-center gap-0.5">
                      <Users className="h-2.5 w-2.5" />{stage.leads_manual}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs max-w-[200px] space-y-1">
          <p className="font-semibold">{meta.label}</p>
          <p>{meta.desc}</p>
          <p className="pt-1 border-t border-muted mt-1">{stage.total} leads en total</p>
          {stage.leads_whatsapp > 0 && <p className="text-green-400">WhatsApp: {stage.leads_whatsapp}</p>}
          {stage.leads_tokko > 0 && <p className="text-blue-400">Tokko Broker: {stage.leads_tokko}</p>}
          {stage.leads_manual > 0 && <p className="text-purple-400">Manual: {stage.leads_manual}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
