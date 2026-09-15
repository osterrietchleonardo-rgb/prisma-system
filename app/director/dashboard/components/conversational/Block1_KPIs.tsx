import { Card, CardContent } from "@/components/ui/card"
import {
  MessageSquare, CalendarCheck, Handshake, Bot, Percent, CreditCard, Home, UserX,
  type LucideIcon,
} from "lucide-react"
import type { ConversationalData } from "@/lib/queries/conversacional"
import { fmtNum, fmtPct } from "./formato"

interface Tarjeta {
  label: string
  valor: string
  desc: string
  icon: LucideIcon
  color: string
  bg: string
}

function KPICard({ t }: { t: Tarjeta }) {
  const Icon = t.icon
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className={`mb-3 inline-flex p-2 rounded-lg ${t.bg}`}>
          <Icon className={`h-4 w-4 ${t.color}`} />
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight">{t.valor}</p>
          <p className="text-xs font-semibold leading-tight">{t.label}</p>
          {/* La explicación va a la vista: en el celular los globitos no se abren. */}
          <p className="text-[11px] text-muted-foreground leading-snug">{t.desc}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function Block1KPIs({ chats, kpis }: { chats: number; kpis: ConversationalData["kpis"] }) {
  // 15/9/2026: esta fila leía `consultas_apto_credito` y `solicitaron_humano`, pero el cálculo
  // mandaba `apto_credito` y `solicitudes_humano`: esas dos tarjetas salían siempre vacías.
  const tarjetas: Tarjeta[] = [
    { label: "Chats", valor: fmtNum(chats), desc: "Conversaciones de WhatsApp que entraron en el período", icon: MessageSquare, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-400/10" },
    { label: "Visitas agendadas", valor: fmtNum(kpis.visitas), desc: "Conversaciones donde quedó una visita agendada", icon: CalendarCheck, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Reservas confirmadas", valor: fmtNum(kpis.reservas), desc: "Conversaciones donde se confirmó una reserva", icon: Handshake, color: "text-accent", bg: "bg-accent/10" },
    { label: "Seguimientos enviados", valor: fmtNum(kpis.seguimientos), desc: "Mensajes automáticos a clientes que habían dejado de responder", icon: Bot, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-400/10" },
    { label: "Consulta → Visita", valor: fmtPct(kpis.tasaConsultaVisita), desc: "De cada 100 chats, cuántos llegaron a visita agendada", icon: Percent, color: "text-teal-700 dark:text-teal-400", bg: "bg-teal-400/10" },
    { label: "Visita → Reserva", valor: fmtPct(kpis.tasaVisitaReserva), desc: "De cada 100 visitas agendadas, cuántas terminaron en reserva", icon: Percent, color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-400/10" },
    { label: "Aptos para crédito", valor: fmtNum(kpis.aptoCredito), desc: "El bot registró que el cliente puede comprar con crédito", icon: CreditCard, color: "text-sky-700 dark:text-sky-400", bg: "bg-sky-400/10" },
    { label: "Necesitan vender antes", valor: fmtNum(kpis.necesitanVender), desc: "Tienen que vender su propiedad para poder comprar", icon: Home, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-400/10" },
    { label: "Pidieron asesor", valor: fmtNum(kpis.pidieronAsesor), desc: "El cliente pidió hablar con una persona", icon: UserX, color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-400/10" },
  ]

  // (pidió ∧ derivado) / pidió. Antes era derivados / pidieron y en Central daba 202 %, porque
  // contaba también a los derivados que no lo habían pedido (15/9/2026). Esos van aparte.
  const tasa = kpis.tasaDerivacion

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">Métricas generales</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          Período elegido arriba
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {tarjetas.map((t) => <KPICard key={t.label} t={t} />)}
      </div>

      <div className="p-3 rounded-lg border border-dashed border-accent/20 bg-card/30 space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Derivación a una persona del equipo</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="font-bold">{fmtNum(kpis.pidieronAsesor)}</span>
            <span className="text-muted-foreground ml-1">pidieron hablar con una persona</span>
          </span>
          <span>
            <span className="font-bold">{fmtNum(kpis.pidieronYDerivados)}</span>
            <span className="text-muted-foreground ml-1">de esos quedaron derivados a un asesor</span>
          </span>
          <span>
            <span className={`font-bold ${tasa === null ? "" : tasa < 80 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {fmtPct(tasa)}
            </span>
            <span className="text-muted-foreground ml-1">de los pedidos se derivaron</span>
          </span>
          <span>
            <span className="font-bold">{fmtNum(kpis.derivadosSinPedirlo)}</span>
            <span className="text-muted-foreground ml-1">derivados sin haberlo pedido</span>
          </span>
        </div>
      </div>
    </div>
  )
}
