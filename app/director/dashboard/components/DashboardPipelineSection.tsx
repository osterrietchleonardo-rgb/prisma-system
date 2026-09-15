"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  KanbanSquare, CheckCircle2, XCircle, Users, TrendingUp
} from "lucide-react"
import Link from "next/link"

// ── Types ─────────────────────────────────────────────────────────────────────
// Sólo conversaciones de WhatsApp de PRISMA: los leads de Tokko ya no entran (15/9/2026).
interface PipelineStage {
  id: string
  total: number
}

interface PipelineSummary {
  total: number
  total_activos: number
  total_cerrado: number
  total_perdido: number
  tasa_cierre_real: number | null
}

interface Props {
  stages: PipelineStage[]
  summary: PipelineSummary
}

// ── Stage labels & colors ─────────────────────────────────────────────────────
/* `color` pinta la barra; `colorTexto` es el mismo color pero legible sobre
   fondo claro, para el numero. En oscuro se sigue usando `color`. */
const STAGE_META: Record<string, { label: string; color: string; colorTexto: string; light: string; desc: string }> = {
  nuevo:            { label: "Nuevo contacto",    color: "#60a5fa", colorTexto: "#2563eb", light: "rgba(96,165,250,0.15)",   desc: "Conversaciones que todavía no avanzaron de etapa" },
  contacto:         { label: "Primer contacto",   color: "#fb923c", colorTexto: "#c2410c", light: "rgba(251,146,60,0.15)",   desc: "Se realizó un primer contacto con el lead" },
  calificado:       { label: "Calificado",         color: "#a78bfa", colorTexto: "#7c3aed", light: "rgba(167,139,250,0.15)",  desc: "Lead con intención real y presupuesto definido" },
  visita_agendada:  { label: "Visita agendada",    color: "#f59e0b", colorTexto: "#b45309", light: "rgba(245,158,11,0.15)",   desc: "Visita confirmada para ver la propiedad" },
  visita_realizada: { label: "Visita realizada",   color: "#2dd4bf", colorTexto: "#0f766e", light: "rgba(45,212,191,0.15)",   desc: "El lead ya visitó la propiedad" },
  propuesta:        { label: "Propuesta enviada",  color: "#818cf8", colorTexto: "#4f46e5", light: "rgba(129,140,248,0.15)",  desc: "Se envió propuesta económica al lead" },
  negociacion:      { label: "Negociación",         color: "#c084fc", colorTexto: "#9333ea", light: "rgba(192,132,252,0.15)",  desc: "En proceso de negociación activa" },
  cerrado:          { label: "Cerrado (Ganado)",   color: "#34d399", colorTexto: "#047857", light: "rgba(52,211,153,0.15)",   desc: "Conversación marcada como operación ganada en PRISMA" },
  perdido:          { label: "Perdido",             color: "#f87171", colorTexto: "#dc2626", light: "rgba(248,113,113,0.15)",  desc: "Conversación descartada o que el cliente dejó de responder" },
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
              Conversaciones de WhatsApp de PRISMA que entraron en el período, en qué etapa están hoy
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard
          label="Conversaciones"
          value={summary.total}
          icon={<Users className="h-4 w-4 text-accent" />}
          desc="Todas las conversaciones de WhatsApp de la inmobiliaria"
        />
        <SummaryCard
          label="Activas"
          value={summary.total_activos}
          icon={<TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
          desc="En proceso: sin las ganadas ni las perdidas"
          valueClass="text-blue-600 dark:text-blue-400"
        />
        <SummaryCard
          label="Ganadas"
          value={summary.total_cerrado}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />}
          desc="Marcadas como operación ganada en PRISMA"
          valueClass="text-emerald-700 dark:text-emerald-400"
        />
        <SummaryCard
          label="Perdidas"
          value={summary.total_perdido}
          icon={<XCircle className="h-4 w-4 text-rose-700 dark:text-rose-400" />}
          desc="Descartadas o el cliente dejó de responder"
          valueClass="text-rose-700 dark:text-rose-400"
        />
        <SummaryCard
          label="Tasa de cierre"
          value={summary.tasa_cierre_real !== null ? `${summary.tasa_cierre_real}%` : "—"}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />}
          desc="Ganadas ÷ (ganadas + perdidas)"
          valueClass={
            summary.tasa_cierre_real !== null
              ? summary.tasa_cierre_real >= 60 ? "text-emerald-700 dark:text-emerald-400"
              : summary.tasa_cierre_real >= 40 ? "text-amber-700 dark:text-amber-400"
              : "text-rose-700 dark:text-rose-400"
              : ""
          }
        />
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
                    summary.tasa_cierre_real >= 60 ? "text-emerald-700 dark:text-emerald-400"
                    : summary.tasa_cierre_real >= 40 ? "text-amber-700 dark:text-amber-400"
                    : "text-rose-700 dark:text-rose-400"
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
  // La explicación va a la vista: en el celular el globito no se abre.
  return (
    <Card className="border-accent/10 bg-card/50 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">{icon}
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>
    </Card>
  )
}

function StageBar({ stage, maxTotal }: { stage: PipelineStage; maxTotal: number }) {
  const meta = STAGE_META[stage.id] || { label: stage.id, color: "#6b7280", colorTexto: "#374151", light: "rgba(107,114,128,0.15)", desc: "" }
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
                <span
                  className="text-xs font-bold text-[var(--c-claro)] dark:text-[var(--c-oscuro)]"
                  style={{ "--c-claro": meta.colorTexto, "--c-oscuro": meta.color } as React.CSSProperties}
                >{stage.total}</span>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs max-w-[200px] space-y-1">
          <p className="font-semibold">{meta.label}</p>
          <p>{meta.desc}</p>
          <p className="pt-1 border-t border-muted mt-1">{stage.total} conversaciones</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
