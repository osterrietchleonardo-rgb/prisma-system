import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, XCircle, MessageCircle } from "lucide-react"
import type { ConversationalData } from "@/lib/queries/conversacional"
import { fmtNum, fmtPct } from "./formato"

const pctDe = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

export function Block2Funnel({ chats, embudo }: { chats: number; embudo: ConversationalData["embudo"] }) {
  // "Calificados" es el dato que marcó el agente (`metricas.calificado` = 'sí'). La regla vieja
  // (tener operación, tipo o presupuesto) daba 463 de 482 en Central (15/9/2026).
  const etapas = [
    { key: "chats", label: "Chats recibidos", count: chats, color: "#60a5fa", lightColor: "rgba(96,165,250,0.15)" },
    { key: "calificados", label: "Calificados", count: embudo.calificados, color: "#34d399", lightColor: "rgba(52,211,153,0.15)" },
    { key: "visitas", label: "Visita agendada", count: embudo.visitas, color: "#a78bfa", lightColor: "rgba(167,139,250,0.15)" },
    { key: "reservas", label: "Reserva confirmada", count: embudo.reservas, color: "#f59e0b", lightColor: "rgba(245,158,11,0.15)" },
  ]
  const max = chats || 1

  const estados = [
    { key: "abiertas", label: "Abiertas", desc: "Siguen en curso", count: embudo.abiertas, icon: MessageCircle, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
    { key: "ganadas", label: "Ganadas", desc: "Marcadas como cerradas con éxito", count: embudo.ganadas, icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
    { key: "perdidas", label: "Perdidas", desc: "Marcadas como cerradas sin éxito", count: embudo.perdidas, icon: XCircle, color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20" },
  ]

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Embudo de conversión</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cuántas conversaciones del período llegaron a cada etapa. El porcentaje es sobre el total de chats.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          {etapas.map((etapa, idx) => {
            const anterior = idx > 0 ? etapas[idx - 1].count : null
            const menos = anterior !== null ? anterior - etapa.count : 0
            return (
              <div key={etapa.key} className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-[96px] sm:w-[140px] shrink-0 text-right leading-tight">
                    {etapa.label}
                  </span>
                  <div className="flex-1 relative h-8 rounded-lg overflow-hidden bg-muted/30">
                    <div
                      className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700"
                      style={{ width: `${(etapa.count / max) * 100}%`, backgroundColor: etapa.lightColor, borderRight: `2px solid ${etapa.color}` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-3">
                      <span className="text-xs font-bold text-foreground">{fmtNum(etapa.count)}</span>
                      <span className="text-xs font-semibold text-foreground/70">{pctDe(etapa.count, chats)}%</span>
                    </div>
                  </div>
                </div>

                {etapa.key === "calificados" && embudo.calificadosParcial > 0 && (
                  <p className="text-[11px] text-muted-foreground pl-[108px] sm:pl-[152px]">
                    Además, {fmtNum(embudo.calificadosParcial)} quedaron calificados a medias (el bot marcó "parcial").
                  </p>
                )}
                {menos > 0 && etapa.key !== "calificados" && (
                  <p className="text-[11px] text-muted-foreground pl-[108px] sm:pl-[152px]">
                    ↘ {fmtNum(menos)} menos que la etapa anterior
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="pt-4 border-t border-accent/10 space-y-3">
          <div>
            <p className="text-sm font-semibold">Cómo quedaron marcadas</p>
            <p className="text-[11px] text-muted-foreground">Estado de cada conversación en el sistema.</p>
          </div>

          <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2">
            {estados.map(({ key, label, desc, count, icon: Icon, color, bg, border }) => (
              <div key={key} className={`rounded-xl p-3 border ${bg} ${border}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>{label}</span>
                </div>
                <p className="text-xl font-bold">{fmtNum(count)}</p>
                <p className="text-[10px] text-muted-foreground">{pctDe(count, chats)}% del total · {desc}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-400/5 border border-emerald-400/15">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Tasa de cierre (ganadas sobre ganadas más perdidas):{" "}
              <span className="font-bold text-sm text-foreground">{fmtPct(embudo.tasaCierre)}</span>
              {/* Las cantidades al lado: con pocas cerradas el % engaña (Central, 15/9/2026: 100% con 2 ganadas y 0 perdidas). */}
              {embudo.tasaCierre !== null &&
                ` (${embudo.ganadas} ${embudo.ganadas === 1 ? "ganada" : "ganadas"}, ${embudo.perdidas} ${embudo.perdidas === 1 ? "perdida" : "perdidas"})`}
              {embudo.tasaCierre === null && " — todavía no hay conversaciones del período marcadas como ganadas o perdidas."}
            </p>
          </div>
        </div>

        <div className="pt-1 border-t border-accent/10">
          <p className="text-xs text-muted-foreground">
            <span className="text-accent font-semibold">{fmtNum(chats)}</span> conversaciones en el período.
            Tasa de conversión general (reservas sobre chats):{" "}
            <span className="font-semibold text-foreground/80">{chats > 0 ? `${pctDe(embudo.reservas, chats)}%` : "—"}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
