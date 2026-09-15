import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, CheckCircle2, XCircle, MessageSquare, Bot } from "lucide-react"
import type { ConversationalData } from "@/lib/queries/conversacional"
import { fmtNum, fmtPct } from "./formato"

type Atencion = ConversationalData["atencion"]

function GaugeCard({ label, value, color, bg, icon, sub }: {
  label: string; value: string; color: string; bg: string; icon: ReactNode; sub: string
}) {
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${bg} ${color}`}>{icon}</div>
        <div className="min-w-0">
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          <p className="text-xs font-semibold">{label}</p>
          <p className="text-[10px] text-muted-foreground leading-snug">{sub}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Barra({ label, count, pct, max, color }: { label: string; count: number; pct: number; max: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold shrink-0">{count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
      </div>
      <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(count / (max || 1)) * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function CompromisosChart({ c, total }: { c: Atencion["compromiso"]; total: number }) {
  const t = total || 1
  const bars = [
    { label: "Alto", count: c.alto, color: "#34d399" },
    { label: "Medio", count: c.medio, color: "#f59e0b" },
    { label: "Bajo", count: c.bajo, color: "#fb7185" },
    { label: "Sin datos", count: c.sinDatos, color: "#94a3b8" },
  ]
  return (
    <div className="space-y-3">
      <div className="flex gap-1 h-10 w-full rounded-lg overflow-hidden">
        {bars.map((b) => b.count > 0 && (
          <div key={b.label} className="flex items-center justify-center text-xs font-bold text-white" style={{ width: `${(b.count / t) * 100}%`, backgroundColor: b.color }}>
            {Math.round((b.count / t) * 100) > 10 ? `${Math.round((b.count / t) * 100)}%` : ""}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: b.color }} />
            <div>
              <p className="text-xs font-bold">{b.count} <span className="font-normal text-muted-foreground">({Math.round((b.count / t) * 100)}%)</span></p>
              <p className="text-[10px] text-muted-foreground">{b.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Block6AttentionQuality({ atencion, chats, pidieron, tasaDerivacion }: {
  atencion: Atencion
  chats: number
  pidieron: number
  tasaDerivacion: number | null
}) {
  const a = atencion
  const conMotivo = a.causasNoAvance.conDato
  const maxCausa = a.causasNoAvance.items[0]?.cantidad || 1
  const maxCorte = a.cortes[0]?.cantidad || 1
  const pctMotivo = (n: number) => (conMotivo > 0 ? Math.round((n / conMotivo) * 100) : 0)
  const objeciones = [
    { label: "Precio o presupuesto", count: a.objecionPrecio },
    { label: "Ubicación o zona", count: a.objecionUbicacion },
  ]
  const maxObj = Math.max(a.objecionPrecio, a.objecionUbicacion, 1)
  const conPersona = chats - a.sinIntervencionHumana

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">Calidad de atención</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Por qué se pierden oportunidades?
        </span>
      </div>

      {/* 15/9/2026: "Resuelto por bot" era total − pidieron (no mide eso), "Derivación efectiva"
          daba 202 % y "Mensajes prom./lead" era en realidad el promedio de seguimientos. */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3">
        <GaugeCard
          label="Sin intervención humana"
          value={fmtPct(a.tasaSinIntervencion)}
          color="text-purple-600 dark:text-purple-400" bg="bg-purple-400/10"
          icon={<Bot className="h-5 w-5" />}
          sub={`${fmtNum(a.sinIntervencionHumana)} de ${fmtNum(chats)} conversaciones no tienen ningún mensaje de una persona del equipo`}
        />
        <GaugeCard
          label="Pidieron asesor"
          value={fmtPct(a.tasaPidieron)}
          color="text-orange-700 dark:text-orange-400" bg="bg-orange-400/10"
          icon={<AlertTriangle className="h-5 w-5" />}
          sub={`${fmtNum(pidieron)} de ${fmtNum(chats)} clientes pidieron hablar con una persona`}
        />
        <GaugeCard
          label="Derivación"
          value={fmtPct(tasaDerivacion)}
          color={tasaDerivacion !== null && tasaDerivacion >= 80 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}
          bg={tasaDerivacion !== null && tasaDerivacion >= 80 ? "bg-emerald-400/10" : "bg-rose-400/10"}
          icon={tasaDerivacion !== null && tasaDerivacion >= 80 ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          sub="de los que pidieron una persona, cuántos quedaron derivados a un asesor"
        />
        <GaugeCard
          label="Mensajes del cliente por chat"
          value={a.mensajesLeadPorChat !== null ? a.mensajesLeadPorChat.toLocaleString("es-AR") : "—"}
          color="text-blue-600 dark:text-blue-400" bg="bg-blue-400/10"
          icon={<MessageSquare className="h-5 w-5" />}
          sub="promedio de mensajes que escribió cada cliente en el período"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🚫</span>
              <CardTitle className="text-sm font-semibold">Causas de no avance</CardTitle>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {conMotivo > 0
                ? `El bot anotó un motivo en ${fmtNum(conMotivo)} conversaciones. Los motivos escritos igual se agrupan; el % es sobre esas ${fmtNum(conMotivo)}.`
                : "El bot no anotó motivos de no avance en este período."}
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {a.causasNoAvance.items.map((item) => (
              <div key={item.etiqueta} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground flex-1 truncate" title={item.etiqueta}>{item.etiqueta}</span>
                <div className="w-16 sm:w-24 h-3 bg-muted/30 rounded-sm overflow-hidden shrink-0">
                  <div className="h-full bg-rose-400/70 rounded-sm" style={{ width: `${(item.cantidad / maxCausa) * 100}%` }} />
                </div>
                <span className="text-[11px] font-semibold w-6 text-right shrink-0">{item.cantidad}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <CardTitle className="text-sm font-semibold">Objeciones: precio y ubicación</CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Motivos de no avance que nombran el precio (precio, presupuesto, caro, tope, valor, expensas) o la ubicación (ubicación, zona, barrio, lejos, distancia). El % es sobre los motivos anotados.
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {conMotivo === 0
                ? <p className="text-xs text-muted-foreground">Sin motivos anotados en el período</p>
                : objeciones.map((o) => (
                  <Barra key={o.label} label={o.label} count={o.count} pct={pctMotivo(o.count)} max={maxObj} color="#fb923c" />
                ))}
            </CardContent>
          </Card>

          <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <span className="text-base">✂️</span>
                <CardTitle className="text-sm font-semibold">Conversaciones que se cortaron</CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Marcadas por el sistema como cortadas. El % es sobre todos los chats.</p>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {a.cortes.length === 0
                ? <p className="text-xs text-muted-foreground">Ninguna conversación del período quedó marcada como cortada.</p>
                : a.cortes.map((c) => (
                  <Barra key={c.etiqueta} label={c.etiqueta} count={c.cantidad} pct={c.pct} max={maxCorte} color="#fb7185" />
                ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <CardTitle className="text-sm font-semibold">Nivel de compromiso de los clientes</CardTitle>
          </div>
          {/* La leyenda vieja ("preguntó muchos detalles") no describía la regla (15/9/2026).
              Esta es exactamente la que se calcula en lib/queries/conversacional.ts. */}
          <ul className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
            <li><span className="font-semibold text-foreground/80">Alto:</span> agendó una visita o confirmó una reserva.</li>
            <li><span className="font-semibold text-foreground/80">Medio:</span> dijo qué busca (operación, tipo de propiedad o presupuesto), dio un plazo de hasta 6 meses y no tiene motivo de no avance.</li>
            <li><span className="font-semibold text-foreground/80">Bajo:</span> el resto.</li>
            <li><span className="font-semibold text-foreground/80">Sin datos:</span> el bot no registró nada de esa conversación.</li>
          </ul>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {chats > 0 ? <CompromisosChart c={a.compromiso} total={chats} /> : <p className="text-xs text-muted-foreground">Sin datos</p>}
        </CardContent>
      </Card>

      {chats > 0 && (
        <div className="p-4 rounded-xl border border-dashed border-accent/20 bg-card/20">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-accent font-semibold">Resumen del período:</span>{" "}
            de <span className="font-semibold text-foreground/80">{fmtNum(chats)}</span> conversaciones,{" "}
            <span className="font-semibold text-purple-600 dark:text-purple-400">{fmtNum(a.sinIntervencionHumana)}</span> las llevó solo el bot y{" "}
            <span className="font-semibold text-accent">{fmtNum(conPersona)}</span> tuvieron al menos un mensaje de una persona del equipo.{" "}
            {fmtNum(pidieron)} clientes pidieron hablar con un asesor
            {tasaDerivacion !== null && ` y el ${tasaDerivacion}% de ellos quedó derivado`}.
          </p>
        </div>
      )}
    </div>
  )
}
