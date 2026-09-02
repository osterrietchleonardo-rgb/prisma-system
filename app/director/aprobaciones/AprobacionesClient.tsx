"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle2, Loader2, MessageSquare, Search } from "lucide-react"
import { resolverAprobacion, type AprobacionVista, type EstadoEquipo } from "@/app/actions/equipo"

interface Props {
  pendientes: AprobacionVista[]
  historial: AprobacionVista[]
  asesores: EstadoEquipo["asesores"]
}

type FiltroEstado = "todas" | "pendiente" | "aprobada" | "rechazada" | "vencida"

const ETIQUETA: Record<string, string> = { aprobada: "Resuelta", rechazada: "Sin asesor", vencida: "Vencida", pendiente: "Pendiente" }

/**
 * La pantalla del director: lo pendiente agrupado por quién lo pidió (así ve de un vistazo
 * qué asesor está soltando chats), un buscador (cliente, teléfono, asesor o motivo) y un
 * filtro por estado para el historial.
 */
export default function AprobacionesClient({ pendientes, historial, asesores }: Props) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<null | { id: string; modo: "reasignar" | "rechazar" }>(null)
  const [asesorElegido, setAsesorElegido] = useState("")
  const [texto, setTexto] = useState("")
  const [avisarCliente, setAvisarCliente] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todas")
  const [filtroAsesor, setFiltroAsesor] = useState<string>("todos")

  const coincide = (a: AprobacionVista) => {
    const q = busqueda.trim().toLowerCase()
    if (filtroAsesor !== "todos" && a.quien !== filtroAsesor) return false
    if (!q) return true
    return [a.lead.nombre, a.lead.telefono ?? "", a.quien, a.justificacion, a.decididaPor ?? ""]
      .some((t) => t.toLowerCase().includes(q))
  }

  const pendientesFiltradas = useMemo(() => pendientes.filter(coincide), [pendientes, busqueda, filtroAsesor]) // eslint-disable-line react-hooks/exhaustive-deps
  const historialFiltrado = useMemo(
    () => historial.filter((a) => coincide(a) && (filtroEstado === "todas" || a.estado === filtroEstado)),
    [historial, busqueda, filtroAsesor, filtroEstado] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const grupos = useMemo(() => {
    const m = new Map<string, AprobacionVista[]>()
    for (const a of pendientesFiltradas) m.set(a.quien, [...(m.get(a.quien) ?? []), a])
    return [...m.entries()].sort((x, y) => y[1].length - x[1].length)
  }, [pendientesFiltradas])
  const quienes = useMemo(() => [...new Set([...pendientes, ...historial].map((a) => a.quien))].sort(), [pendientes, historial])

  async function decidir(id: string, decision: Parameters<typeof resolverAprobacion>[1]) {
    setOcupado(id)
    try {
      const r = await resolverAprobacion(id, decision)
      if (r.ok) {
        toast.success(r.detalle ?? "Listo")
        setDialogo(null)
        setTexto("")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Buscador y filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por cliente, teléfono, asesor o motivo" className="pl-9" />
        </div>
        <Select value={filtroAsesor} onValueChange={setFiltroAsesor}>
          <SelectTrigger className="sm:w-[200px]"><SelectValue placeholder="Asesor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los asesores</SelectItem>
            {quienes.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as FiltroEstado)}>
          <SelectTrigger className="sm:w-[170px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Historial: todas</SelectItem>
            <SelectItem value="aprobada">Resueltas</SelectItem>
            <SelectItem value="rechazada">Sin asesor</SelectItem>
            <SelectItem value="vencida">Vencidas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Pendientes {pendientesFiltradas.length > 0 && <Badge className="ml-2">{pendientesFiltradas.length}</Badge>}
        </h2>
        {pendientesFiltradas.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {pendientes.length === 0 ? "No hay nada esperando tu decisión." : "Nada coincide con la búsqueda."}
            </CardContent>
          </Card>
        )}
        {grupos.map(([quien, lista]) => (
          <div key={quien} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {quien} <span className="text-xs">· {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}</span>
            </h3>
            {lista.map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    <span>No puede tomar el chat de {a.lead.nombre}</span>
                    {a.lead.telefono && <span className="text-xs font-normal text-muted-foreground">+{a.lead.telefono}</span>}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Pedido {hace(a.creado_en)}{a.vence_en ? ` · vence ${hace(a.vence_en, true)}` : ""}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm"><span className="text-muted-foreground">Su motivo: </span>«{a.justificacion}»</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={ocupado === a.id} onClick={() => decidir(a.id, { tipo: "lo_tomo" })}>
                      {ocupado === a.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Lo tomo yo
                    </Button>
                    <Button size="sm" variant="outline" disabled={ocupado === a.id} onClick={() => { setAsesorElegido(""); setTexto(""); setAvisarCliente(true); setDialogo({ id: a.id, modo: "reasignar" }) }}>
                      Reasignar a…
                    </Button>
                    <Button size="sm" variant="ghost" disabled={ocupado === a.id} onClick={() => { setTexto(""); setDialogo({ id: a.id, modo: "rechazar" }) }}>
                      Dejar sin asesor
                    </Button>
                    {a.lead.conversation_id && (
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/director/leads-whatsapp/${a.lead.conversation_id}`}><MessageSquare className="w-4 h-4 mr-1" /> Ver el chat</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </section>

      {historial.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Ya decididas {historialFiltrado.length !== historial.length && <span className="text-sm font-normal text-muted-foreground">({historialFiltrado.length} de {historial.length})</span>}</h2>
          {historialFiltrado.length === 0 && <p className="text-sm text-muted-foreground">Nada coincide con el filtro.</p>}
          <div className="rounded-xl border divide-y">
            {historialFiltrado.map((a) => (
              <div key={a.id} className="p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <Badge variant={a.estado === "aprobada" ? "default" : a.estado === "rechazada" ? "secondary" : "outline"} className="w-fit">
                  {ETIQUETA[a.estado] ?? a.estado}
                </Badge>
                <span className="flex-1">
                  {a.quien} soltó el chat de <strong>{a.lead.nombre}</strong>
                  <span className="text-muted-foreground"> · «{a.justificacion}»</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {descripcionDecision(a, asesores)}{a.decidida_en ? ` · ${hace(a.decidida_en)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={dialogo !== null} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogo?.modo === "rechazar" ? "Dejar sin asesor" : "Reasignar el chat"}</DialogTitle>
            <DialogDescription>
              {dialogo?.modo === "rechazar"
                ? "El chat queda sin asesor por ahora. Contá por qué (queda en la ficha)."
                : "El asesor nuevo recibe un email y un WhatsApp con qué busca el cliente, su último mensaje, tu comentario y el link al chat."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dialogo?.modo === "reasignar" && (
              <Select value={asesorElegido} onValueChange={setAsesorElegido}>
                <SelectTrigger><SelectValue placeholder="Elegí a quién" /></SelectTrigger>
                <SelectContent>
                  {asesores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}{p.role === "director" ? " · director" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
              placeholder={dialogo?.modo === "rechazar" ? "El motivo, con tus palabras…" : "Tu comentario para el asesor (opcional)"} />
            {dialogo?.modo === "reasignar" && (
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox checked={avisarCliente} onCheckedChange={(v) => setAvisarCliente(Boolean(v))} className="mt-0.5" />
                <span>
                  Si hace más de 24 h que el cliente no escribe, avisarle por WhatsApp que ahora lo sigue el asesor nuevo
                  <span className="block text-muted-foreground">Sale por plantilla solo si la conversación está cerrada y el cliente tiene nombre registrado.</span>
                </span>
              </label>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={ocupado !== null}>Cancelar</Button>
            <Button
              disabled={ocupado !== null || (dialogo?.modo === "reasignar" ? !asesorElegido : texto.trim().length < 10)}
              onClick={() => dialogo && decidir(dialogo.id, dialogo.modo === "rechazar"
                ? { tipo: "rechazar", motivo: texto }
                : { tipo: "reasignar", asesorId: asesorElegido, motivo: texto, avisarCliente })}
            >
              {ocupado !== null && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {dialogo?.modo === "rechazar" ? "Dejar sin asesor" : "Reasignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function descripcionDecision(a: AprobacionVista, asesores: EstadoEquipo["asesores"]): string {
  const d = a.decision as { tipo?: string; a?: string; motivo?: string } | null
  if (a.estado === "vencida") return "nadie respondió en 48 h"
  if (!d) return ""
  if (d.tipo === "lo_tomo") return `${a.decididaPor ?? "El director"} lo tomó`
  if (d.tipo === "reasignar") return `${a.decididaPor ?? "El director"} lo reasignó a ${asesores.find((p) => p.id === d.a)?.full_name ?? "otro asesor"}`
  if (d.tipo === "rechazar") return `${a.decididaPor ?? "El director"} lo dejó sin asesor: «${d.motivo ?? ""}»`
  return ""
}

function hace(iso: string, futuro = false): string {
  const ms = Date.parse(iso) - Date.now()
  const h = Math.round(Math.abs(ms) / 3600e3)
  if (futuro) return ms < 0 ? "ya venció" : h < 1 ? "en menos de 1 h" : h < 48 ? `en ${h} h` : `en ${Math.round(h / 24)} días`
  if (h < 1) return "hace minutos"
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}
