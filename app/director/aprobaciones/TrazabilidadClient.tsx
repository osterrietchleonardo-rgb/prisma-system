"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft, Bell, Bot, CalendarDays, EyeOff, Loader2, MessageSquare, Plus, RefreshCw, Search, Sparkles, StickyNote, UserCheck, Users,
} from "lucide-react"
import {
  agregarNotaTraza, listarConversacionesConActividad, trazaDeConversacion,
  type ConversacionConActividad, type EstadoEquipo,
} from "@/app/actions/equipo"
import { fechaHoraAR, type CategoriaTraza, type EventoTraza } from "@/lib/equipo/trazabilidad"

interface Props {
  conversaciones: ConversacionConActividad[]
  asesores: EstadoEquipo["asesores"]
}

/** Ícono, color y etiqueta de cada categoría de renglón. El verde es del asesor: es LO que Kevin busca ver. */
const ESTILO: Record<CategoriaTraza, { icono: typeof Bell; color: string; etiqueta: string }> = {
  cliente: { icono: MessageSquare, color: "text-blue-500", etiqueta: "Cliente" },
  bot: { icono: Bot, color: "text-muted-foreground", etiqueta: "Bot" },
  asesor: { icono: UserCheck, color: "text-emerald-500", etiqueta: "Asesor" },
  interno: { icono: EyeOff, color: "text-amber-500", etiqueta: "Interno" },
  agente: { icono: Sparkles, color: "text-purple-500", etiqueta: "Super Agente" },
  aviso: { icono: Bell, color: "text-orange-500", etiqueta: "Aviso" },
  equipo: { icono: Users, color: "text-sky-500", etiqueta: "Equipo" },
  visita: { icono: CalendarDays, color: "text-pink-500", etiqueta: "Visita" },
}

type Traza = Awaited<ReturnType<typeof trazaDeConversacion>>

/**
 * La bitácora que pidió Kevin (2/9): elegís un chat y ves TODO lo que pasó, en orden, con hora:
 * lo que escribió el cliente, lo que hizo el bot, cada aviso de la escalera, cada acción del
 * equipo y — en verde — cada vez que el asesor respondió de verdad.
 */
export default function TrazabilidadClient({ conversaciones: inicial, asesores }: Props) {
  const [conversaciones, setConversaciones] = useState(inicial)
  const [busqueda, setBusqueda] = useState("")
  const [filtroAsesor, setFiltroAsesor] = useState("todos")
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [traza, setTraza] = useState<Traza | null>(null)
  const [cargando, setCargando] = useState(false)
  const [refrescando, setRefrescando] = useState(false)
  // La nota del director: "final" = al final de la historia; un número = después de ese renglón.
  const [notaEn, setNotaEn] = useState<number | "final" | null>(null)
  const [notaTexto, setNotaTexto] = useState("")
  const [guardandoNota, setGuardandoNota] = useState(false)

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return conversaciones.filter((c) => {
      if (filtroAsesor === "sin_asesor" && c.asesor) return false
      if (filtroAsesor !== "todos" && filtroAsesor !== "sin_asesor" && c.asesor?.id !== filtroAsesor) return false
      if (!q) return true
      return [c.nombre, c.telefono ?? "", c.asesor?.full_name ?? ""].some((t) => t.toLowerCase().includes(q))
    })
  }, [conversaciones, busqueda, filtroAsesor])

  async function abrir(conversationId: string) {
    setSeleccion(conversationId)
    setCargando(true)
    setTraza(null)
    setNotaEn(null)
    setNotaTexto("")
    try {
      setTraza(await trazaDeConversacion(conversationId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar la trazabilidad.")
      setSeleccion(null)
    } finally {
      setCargando(false)
    }
  }

  async function guardarNota() {
    if (!seleccion || !traza || notaEn === null) return
    setGuardandoNota(true)
    try {
      const ancla = notaEn === "final" ? null : traza.eventos[notaEn]?.ts ?? null
      const r = await agregarNotaTraza(seleccion, notaTexto, ancla)
      if (r.ok) {
        setNotaEn(null)
        setNotaTexto("")
        setTraza(await trazaDeConversacion(seleccion))
      } else {
        toast.error(r.error)
      }
    } finally {
      setGuardandoNota(false)
    }
  }

  async function refrescar() {
    setRefrescando(true)
    try {
      const r = await listarConversacionesConActividad()
      setConversaciones(r.conversaciones)
      if (seleccion) setTraza(await trazaDeConversacion(seleccion))
    } catch {
      toast.error("No se pudo actualizar.")
    } finally {
      setRefrescando(false)
    }
  }

  const elegida = seleccion ? conversaciones.find((c) => c.conversation_id === seleccion) : null

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por cliente, teléfono o asesor" className="pl-9" />
        </div>
        <Select value={filtroAsesor} onValueChange={setFiltroAsesor}>
          <SelectTrigger className="sm:w-[220px]"><SelectValue placeholder="Asesor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los asesores</SelectItem>
            <SelectItem value="sin_asesor">Sin asesor asignado</SelectItem>
            {asesores.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={refrescar} disabled={refrescando}>
          {refrescando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">Actualizar</span>
        </Button>
      </div>

      <div className="grid md:grid-cols-5 gap-4 items-start">
        {/* Lista de chats con actividad (en celular se oculta cuando hay uno abierto) */}
        <div className={`md:col-span-2 space-y-2 ${seleccion ? "hidden md:block" : ""}`}>
          <p className="text-xs text-muted-foreground">
            Chats con actividad del agente o del equipo en los últimos 14 días · {filtradas.length}
          </p>
          {filtradas.length === 0 && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">
              {conversaciones.length === 0 ? "Todavía no hay actividad registrada." : "Nada coincide con el filtro."}
            </CardContent></Card>
          )}
          <div className="rounded-xl border divide-y overflow-hidden max-h-[70vh] overflow-y-auto">
            {filtradas.map((c) => (
              <button
                key={c.conversation_id}
                onClick={() => abrir(c.conversation_id)}
                className={`w-full text-left p-3 text-sm hover:bg-muted/50 transition-colors ${seleccion === c.conversation_id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{c.nombre}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{fechaHoraAR(c.ultimoTs)}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.asesor?.full_name ?? "Sin asesor"} · {c.eventos} {c.eventos === 1 ? "evento" : "eventos"}
                </div>
                <div className="text-xs text-muted-foreground/80 truncate mt-0.5">{c.ultimoEvento}</div>
              </button>
            ))}
          </div>
        </div>

        {/* La línea de tiempo */}
        <div className={`md:col-span-3 ${seleccion ? "" : "hidden md:block"}`}>
          {!seleccion && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">
              Elegí un chat de la lista para ver su historia completa.
            </CardContent></Card>
          )}
          {seleccion && (
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" className="md:hidden -ml-2" onClick={() => { setSeleccion(null); setTraza(null) }}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> Volver
                  </Button>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold">{traza?.lead.nombre ?? elegida?.nombre ?? ""}</p>
                    <p className="text-xs text-muted-foreground">
                      {traza?.lead.telefono ? `+${traza.lead.telefono} · ` : ""}
                      {traza?.lead.asesor ? `Asesor: ${traza.lead.asesor}` : "Sin asesor asignado"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/director/leads-whatsapp/${seleccion}`}><MessageSquare className="w-4 h-4 mr-1" /> Ver el chat</Link>
                  </Button>
                </div>

                {cargando && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando la historia…
                  </div>
                )}

                {!cargando && traza && traza.eventos.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Este chat todavía no tiene nada registrado.</p>
                )}

                {!cargando && traza && traza.eventos.length > 0 && (
                  <>
                    {/* Altura fija con scroll: la historia no estira la pantalla (pedido 2/9) */}
                    <div className="relative space-y-0 max-h-[60vh] overflow-y-auto pr-1">
                      {traza.eventos.map((e, i) => (
                        <div key={i}>
                          <Renglon evento={e} onNota={() => { setNotaEn(i); setNotaTexto("") }} />
                          {notaEn === i && (
                            <ComposerNota texto={notaTexto} onTexto={setNotaTexto} guardando={guardandoNota}
                              onGuardar={guardarNota} onCancelar={() => setNotaEn(null)} />
                          )}
                        </div>
                      ))}
                    </div>
                    {notaEn === "final" ? (
                      <ComposerNota texto={notaTexto} onTexto={setNotaTexto} guardando={guardandoNota}
                        onGuardar={guardarNota} onCancelar={() => setNotaEn(null)} />
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => { setNotaEn("final"); setNotaTexto("") }}>
                        <StickyNote className="w-4 h-4 mr-1" /> Agregar una nota
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Renglon({ evento, onNota }: { evento: EventoTraza; onNota: () => void }) {
  const estilo = ESTILO[evento.categoria]
  const Icono = estilo.icono
  return (
    <div className="group flex gap-3 py-2 border-l-2 border-muted pl-3 ml-2 relative">
      <span className="absolute -left-[9px] top-3 bg-background rounded-full">
        <Icono className={`w-4 h-4 ${estilo.color}`} />
      </span>
      <div className="min-w-0 flex-1 pl-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{fechaHoraAR(evento.ts)}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${estilo.color} border-current`}>{estilo.etiqueta}</Badge>
        </div>
        <p className={`text-sm ${evento.categoria === "asesor" ? "font-medium" : ""}`}>{evento.titulo}</p>
        {evento.detalle && <p className="text-xs text-muted-foreground break-words">«{evento.detalle}»</p>}
      </div>
      <button
        type="button"
        onClick={onNota}
        title="Agregar una nota acá"
        className="self-start mt-1 p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ComposerNota({ texto, onTexto, guardando, onGuardar, onCancelar }: {
  texto: string
  onTexto: (t: string) => void
  guardando: boolean
  onGuardar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="ml-5 my-2 p-3 rounded-lg border bg-muted/30 space-y-2">
      <Textarea
        value={texto}
        onChange={(e) => onTexto(e.target.value)}
        rows={2}
        autoFocus
        placeholder='Tu nota interna acá ("avisé por llamada", "me lo crucé en la ofi y le dije")'
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onGuardar} disabled={guardando || texto.trim().length < 3}>
          {guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar la nota
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
      </div>
    </div>
  )
}
