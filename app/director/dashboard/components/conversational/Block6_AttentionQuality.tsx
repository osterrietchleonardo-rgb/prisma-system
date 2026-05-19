"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, CheckCircle2, XCircle, TrendingDown } from "lucide-react"

interface TopItem { label: string; count: number; pct: number }

interface AttentionData {
  tasa_resolucion_bot: number
  tasa_solicitud_humano: number
  tasa_derivacion_efectiva: number | null
  objeciones_frecuencia: { label: string; count: number; pct: number }[]
  total_objeciones_detectadas: number
  causas_no_avance: TopItem[]
  avg_mensajes_lead: number | null
  compromisos: { alto: number; medio: number; bajo: number }
  bot_handled: number
  human_escalated: number
  avg_duration_min: number | null
}

function GaugeCard({ label, value, color, icon, sub }: {
  label: string; value: string | number; color: string; icon: React.ReactNode; sub?: string
}) {
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-opacity-10 shrink-0`} style={{ backgroundColor: `${color}20` }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color }}>{value}</p>
          <p className="text-xs font-semibold">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function ObjecionBar({ label, count, pct, max }: { label: string; count: number; pct: number; max: number }) {
  const severity = pct >= 30 ? "#f87171" : pct >= 15 ? "#fb923c" : "#fbbf24"
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" style={{ color: severity }} />
          {label}
        </span>
        <span className="font-semibold">{count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
      </div>
      <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(count / max) * 100}%`, backgroundColor: severity }} />
      </div>
    </div>
  )
}

function CompromisosChart({ compromisos, total }: { compromisos: { alto: number; medio: number; bajo: number }; total: number }) {
  const { alto, medio, bajo } = compromisos
  const t = total || 1
  const bars = [
    { label: "Alto", count: alto, color: "#34d399" },
    { label: "Medio", count: medio, color: "#f59e0b" },
    { label: "Bajo", count: bajo, color: "#fb7185" },
  ]
  return (
    <div className="space-y-3">
      <div className="flex gap-1 h-10 w-full rounded-lg overflow-hidden">
        {bars.map(b => b.count > 0 && (
          <div key={b.label} className="flex items-center justify-center text-xs font-bold text-white"
            style={{ width: `${(b.count / t) * 100}%`, backgroundColor: b.color }}>
            {Math.round((b.count / t) * 100) > 10 ? `${Math.round((b.count / t) * 100)}%` : ""}
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        {bars.map(b => (
          <div key={b.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: b.color }} />
            <div>
              <p className="text-xs font-bold">{b.count}</p>
              <p className="text-[10px] text-muted-foreground">{b.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Block6AttentionQuality({ attention, totalConversations }: {
  attention: AttentionData; totalConversations: number
}) {
  const a = attention
  const maxObjCount = a.objeciones_frecuencia?.[0]?.count || 1
  const maxCausaCount = a.causas_no_avance?.[0]?.count || 1

  const totalCompromisos = (a.compromisos?.alto || 0) + (a.compromisos?.medio || 0) + (a.compromisos?.bajo || 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold">Calidad de Atención</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Por qué se pierden oportunidades?
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GaugeCard
          label="Resuelto por bot"
          value={`${a.tasa_resolucion_bot ?? 0}%`}
          color="#a78bfa"
          icon={<CheckCircle2 className="h-5 w-5" />}
          sub="sin intervención humana"
        />
        <GaugeCard
          label="Pidieron asesor"
          value={`${a.tasa_solicitud_humano ?? 0}%`}
          color="#fb923c"
          icon={<AlertTriangle className="h-5 w-5" />}
          sub="solicitaron humano"
        />
        <GaugeCard
          label="Derivación efectiva"
          value={a.tasa_derivacion_efectiva != null ? `${a.tasa_derivacion_efectiva}%` : "—"}
          color={a.tasa_derivacion_efectiva != null && a.tasa_derivacion_efectiva >= 80 ? "#34d399" : "#fb7185"}
          icon={a.tasa_derivacion_efectiva != null && a.tasa_derivacion_efectiva >= 80
            ? <CheckCircle2 className="h-5 w-5" />
            : <XCircle className="h-5 w-5" />}
          sub="de solicitudes atendidas"
        />
        <GaugeCard
          label="Mensajes prom./lead"
          value={a.avg_mensajes_lead != null ? a.avg_mensajes_lead.toString() : "—"}
          color="#60a5fa"
          icon={<TrendingDown className="h-5 w-5" />}
          sub="engagement de leads"
        />
      </div>

      {/* Objeciones + causas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <CardTitle className="text-sm font-semibold">Objeciones detectadas</CardTitle>
              {a.total_objeciones_detectadas > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">{a.total_objeciones_detectadas} total</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Frenan la decisión del lead en las conversaciones
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {!a.objeciones_frecuencia?.length
              ? <p className="text-xs text-muted-foreground">Sin objeciones detectadas</p>
              : a.objeciones_frecuencia.map(obj => (
                <ObjecionBar key={obj.label} label={obj.label}
                  count={obj.count} pct={obj.pct} max={maxObjCount} />
              ))}
          </CardContent>
        </Card>

        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🚫</span>
              <CardTitle className="text-sm font-semibold">Causas de no avance</CardTitle>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Por qué el lead no continuó el proceso
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {!a.causas_no_avance?.length
              ? <p className="text-xs text-muted-foreground">Sin datos suficientes</p>
              : a.causas_no_avance.map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground flex-1 truncate">{item.label}</span>
                  <div className="w-24 h-3 bg-muted/30 rounded-sm overflow-hidden">
                    <div className="h-full bg-rose-400/70 rounded-sm"
                      style={{ width: `${(item.count / maxCausaCount) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-semibold w-6 text-right shrink-0">{item.count}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Commitment levels */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <CardTitle className="text-sm font-semibold">Nivel de compromiso de los leads</CardTitle>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Alto = preguntó muchos detalles / quiso visitar · Medio = interés moderado · Bajo = pregunta única sin seguimiento
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {totalCompromisos > 0
            ? <CompromisosChart compromisos={a.compromisos} total={totalCompromisos} />
            : <p className="text-xs text-muted-foreground">Sin datos suficientes</p>}
        </CardContent>
      </Card>

      {/* Summary insight */}
      {totalConversations > 0 && (
        <div className="p-4 rounded-xl border border-dashed border-accent/20 bg-card/20">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-accent font-semibold">Resumen del período:</span>{" "}
            De <span className="font-semibold text-foreground/80">{totalConversations}</span> conversaciones,{" "}
            <span className="font-semibold text-purple-400">{a.bot_handled}</span> fueron resueltas íntegramente por el bot y{" "}
            <span className="font-semibold text-accent">{a.human_escalated}</span> requirieron intervención humana
            {a.tasa_derivacion_efectiva != null && ` (con ${a.tasa_derivacion_efectiva}% de efectividad en la derivación)`}.
            {a.objeciones_frecuencia?.length > 0 && ` La principal objeción detectada fue "${a.objeciones_frecuencia[0].label}" (${a.objeciones_frecuencia[0].pct}% de los chats).`}
          </p>
        </div>
      )}
    </div>
  )
}
