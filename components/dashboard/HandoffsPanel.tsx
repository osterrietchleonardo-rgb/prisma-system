import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertTriangle, CheckCircle2, Clock, MessageCircle, PhoneForwarded, UserCheck } from "lucide-react"
import Link from "next/link"
import type { HandoffsDashboardData, HandoffSeverity, UnattendedHandoff } from "@/lib/queries/handoffs"

interface Props {
  data: HandoffsDashboardData
  /** "/director" o "/asesor" — define a dónde apuntan los links de cada conversación. */
  basePath: string
  /** El director ve de todos los asesores; el asesor solo lo suyo. */
  scope: "agencia" | "propio"
}

const SEVERITY_META: Record<HandoffSeverity, { label: string; dot: string; text: string; row: string }> = {
  critico:  { label: "Crítico",  dot: "bg-red-500",    text: "text-red-500",    row: "border-l-red-500" },
  demorado: { label: "Demorado", dot: "bg-amber-500",  text: "text-amber-500",  row: "border-l-amber-500" },
  reciente: { label: "Reciente", dot: "bg-sky-400",    text: "text-sky-400",    row: "border-l-sky-400" },
}

function formatWait(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 48) return `${Math.round(hours)} h`
  return `${Math.round(hours / 24)} días`
}

export function HandoffsPanel({ data, basePath, scope }: Props) {
  const { unattended, totalHandoffs, attended, criticos, esperandoConMensajes, medianResponseHours } = data

  // Sin derivaciones en el período no hay nada útil que mostrar.
  if (!totalHandoffs) return null

  return (
    <section className="mt-12 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PhoneForwarded className="h-6 w-6 text-accent" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Handoffs sin atender</h2>
            <p className="text-xs text-muted-foreground">
              {scope === "agencia"
                ? "Clientes que el bot derivó a un asesor y todavía nadie respondió"
                : "Clientes que el bot te derivó y todavía no respondiste"}
            </p>
          </div>
        </div>
        <Link
          href={`${basePath}/leads-whatsapp`}
          className="text-xs text-accent font-semibold hover:underline whitespace-nowrap"
        >
          Ver WhatsApp →
        </Link>
      </div>

      {/* ── Resumen ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Sin atender"
          value={unattended.length}
          icon={<AlertTriangle className="h-3.5 w-3.5 text-accent" />}
          desc="Derivaciones en las que todavía no escribió ningún asesor."
          valueClass={unattended.length > 0 ? "text-red-500" : "text-emerald-500"}
        />
        <SummaryCard
          label="Críticos (+24 h)"
          value={criticos}
          icon={<Clock className="h-3.5 w-3.5 text-accent" />}
          desc="Llevan más de un día esperando respuesta."
          valueClass={criticos > 0 ? "text-red-500" : ""}
        />
        <SummaryCard
          label="Esperando respuesta"
          value={esperandoConMensajes}
          icon={<MessageCircle className="h-3.5 w-3.5 text-accent" />}
          desc="El cliente siguió escribiendo después de la derivación y nadie le contestó."
          valueClass={esperandoConMensajes > 0 ? "text-amber-500" : ""}
        />
        <SummaryCard
          label="Respuesta (mediana)"
          value={medianResponseHours === null ? "—" : formatWait(medianResponseHours)}
          icon={<UserCheck className="h-3.5 w-3.5 text-accent" />}
          desc={`Cuánto tarda el asesor en responder. ${attended} de ${totalHandoffs} derivaciones atendidas.`}
        />
      </div>

      {/* ── Listado ── */}
      {unattended.length === 0 ? (
        <Card className="border-accent/10 bg-card/50 p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-semibold text-foreground">Todas las derivaciones fueron atendidas</p>
            <p className="text-xs text-muted-foreground">
              {totalHandoffs} {totalHandoffs === 1 ? "derivación" : "derivaciones"} en el período, sin pendientes.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="border-accent/10 bg-card/50 divide-y divide-accent/10 overflow-hidden">
          {unattended.map(h => (
            <HandoffRow key={h.conversationId} handoff={h} basePath={basePath} scope={scope} />
          ))}
        </Card>
      )}
    </section>
  )
}

function HandoffRow({ handoff, basePath, scope }: { handoff: UnattendedHandoff; basePath: string; scope: Props["scope"] }) {
  const meta = SEVERITY_META[handoff.severity]
  const nombre = handoff.contactName?.trim() || handoff.contactPhone

  return (
    <Link
      href={`${basePath}/leads-whatsapp/${handoff.conversationId}`}
      className={`flex flex-col gap-2 border-l-4 ${meta.row} px-4 py-3 transition-colors hover:bg-accent/5 sm:flex-row sm:items-center sm:justify-between`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{nombre}</p>
          <p className="truncate text-xs text-muted-foreground">
            {scope === "agencia" && (
              <>Asesor: {handoff.agentName || "sin asignar"} · </>
            )}
            Derivado el{" "}
            {new Date(handoff.handoffAt).toLocaleString("es-AR", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-5 sm:pl-0">
        {handoff.clientMessagesAfter > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
            <MessageCircle className="h-3 w-3" />
            {handoff.clientMessagesAfter} sin responder
          </span>
        )}
        <div className="text-right">
          <p className={`text-sm font-bold ${meta.text}`}>{formatWait(handoff.hoursWaiting)}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">esperando</p>
        </div>
      </div>
    </Link>
  )
}

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
