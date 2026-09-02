"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Users, Clock, AlertTriangle, Loader2 } from "lucide-react"
import {
  darMasTiempo, estadoEquipo, marcarPerdido, noPuedoTomar, reactivarLead, reasignarChat, tomarChat, type EstadoEquipo,
} from "@/app/actions/equipo"

/**
 * El bloque "Equipo y seguimiento" de la ficha del chat: quién lo tiene, qué está pendiente,
 * y los botones según el rol. Asesor: Lo tomo / No lo puedo tomar / Marcar como perdido.
 * Director: Reasignar a… / Lo tomo yo / Dar más tiempo / Marcar como perdido.
 */
export default function EquipoPanel({ conversationId }: { conversationId: string }) {
  const [estado, setEstado] = useState<EstadoEquipo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [dialogo, setDialogo] = useState<null | "no_puedo" | "perdido" | "reasignar">(null)
  const [texto, setTexto] = useState("")
  const [asesorElegido, setAsesorElegido] = useState<string>("")
  const [avisarCliente, setAvisarCliente] = useState(true)

  const cargar = useCallback(async () => {
    try {
      setEstado(await estadoEquipo(conversationId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [conversationId])

  useEffect(() => { void cargar() }, [cargar])

  async function correr(fn: () => Promise<{ ok: boolean; detalle?: string; error?: string }>) {
    setOcupado(true)
    try {
      const r = await fn()
      if (r.ok) {
        toast.success(r.detalle ?? "Listo")
        setDialogo(null)
        setTexto("")
        // el panel se recarga solo; NO router.refresh(): remonta el chat y cierra este panel lateral
        await cargar()
      } else {
        toast.error(r.error ?? "No se pudo")
      }
    } finally {
      setOcupado(false)
    }
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-4 text-xs text-muted-foreground">{error}</CardContent>
      </Card>
    )
  }
  if (!estado) {
    return (
      <Card>
        <CardContent className="pt-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Cargando equipo…
        </CardContent>
      </Card>
    )
  }

  const esDirector = estado.rol === "director"
  const perdido = estado.funnel_status === "closed_lost"
  const compromisoAsesor = estado.compromisos.find((k) => k.tipo === "respuesta_pendiente")
  const otros = estado.asesores.filter((a) => a.id !== estado.asesor?.id)

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" /> Equipo y seguimiento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Asesor a cargo</span>
            <span className="font-medium text-right">
              {estado.asesor ? `${estado.asesor.full_name ?? "—"}${estado.esMio ? " (vos)" : ""}` : <Badge variant="outline">Sin asesor</Badge>}
            </span>
          </div>

          {estado.aprobacionPendiente && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> {estado.aprobacionPendiente.quien} no lo puede tomar
              </div>
              <p className="text-xs text-muted-foreground">«{estado.aprobacionPendiente.justificacion}»</p>
              {esDirector && <p className="text-xs">Decidilo acá abajo o en <a className="underline" href="/director/aprobaciones">Aprobaciones</a>.</p>}
            </div>
          )}

          {estado.compromisos.length > 0 && (
            <ul className="space-y-1">
              {estado.compromisos.map((k) => (
                <li key={k.id} className="flex items-start gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span>
                    {k.descripcion}
                    {k.vence_en && <span className="text-muted-foreground"> · {venceTexto(k.vence_en)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {perdido && <Badge variant="destructive">Marcado como perdido</Badge>}

          <div className="flex flex-wrap gap-2 pt-1">
            {!esDirector && estado.esMio && (
              <>
                <Button size="sm" disabled={ocupado} onClick={() => correr(() => tomarChat(conversationId))}>Lo tomo</Button>
                <Button size="sm" variant="outline" disabled={ocupado} onClick={() => { setTexto(""); setDialogo("no_puedo") }}>No lo puedo tomar</Button>
              </>
            )}
            {esDirector && (
              <>
                {!estado.esMio && (
                  <Button size="sm" disabled={ocupado} onClick={() => correr(() => tomarChat(conversationId))}>Lo tomo yo</Button>
                )}
                {otros.length > 0 && (
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => { setAsesorElegido(""); setTexto(""); setAvisarCliente(true); setDialogo("reasignar") }}>
                    Reasignar a…
                  </Button>
                )}
                {compromisoAsesor && (
                  <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => correr(() => darMasTiempo(conversationId))}>Dar más tiempo</Button>
                )}
              </>
            )}
            {!perdido && (esDirector || estado.esMio) && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={ocupado} onClick={() => { setTexto(""); setDialogo("perdido") }}>
                Marcar como perdido
              </Button>
            )}
            {perdido && (esDirector || estado.esMio) && (
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => correr(() => reactivarLead(conversationId))}>
                Reactivar
              </Button>
            )}
          </div>

          {estado.ultimosEventos.length > 0 && (
            <div className="pt-2 border-t space-y-1">
              {estado.ultimosEventos.map((e, i) => (
                <p key={i} className="text-[11px] text-muted-foreground leading-snug">
                  <span className="font-medium text-foreground/70">{fechaCorta(e.ts)}</span> · {e.descripcion}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* No lo puedo tomar / Marcar como perdido: justificación obligatoria */}
      <Dialog open={dialogo === "no_puedo" || dialogo === "perdido"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogo === "perdido" ? "Marcar como perdido" : "No lo puedo tomar"}</DialogTitle>
            <DialogDescription>
              {dialogo === "perdido"
                ? "El seguimiento automático deja de escribirle. Contá por qué (queda en la ficha)."
                : "El chat deja de ser tuyo y el director recibe tu motivo para reasignarlo."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder="El motivo, con tus palabras…" autoFocus />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={ocupado}>Cancelar</Button>
            <Button
              disabled={ocupado || texto.trim().length < 10}
              onClick={() => correr(() => (dialogo === "perdido" ? marcarPerdido(conversationId, texto) : noPuedoTomar(conversationId, texto)))}
            >
              {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {dialogo === "perdido" ? "Marcar como perdido" : "Soltar el chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reasignar (director) */}
      <Dialog open={dialogo === "reasignar"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reasignar el chat</DialogTitle>
            <DialogDescription>El asesor nuevo recibe un email y un WhatsApp con el detalle y el link al chat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={asesorElegido} onValueChange={setAsesorElegido}>
              <SelectTrigger><SelectValue placeholder="Elegí a quién" /></SelectTrigger>
              <SelectContent>
                {otros.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name ?? a.id}{a.id === estado.yo ? " (vos)" : ""}{a.role === "director" ? " · director" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Motivo (opcional, lo ve el asesor)" />
            {estado.ventanaCerrada && (
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={estado.reapertura.disponible && avisarCliente}
                  disabled={!estado.reapertura.disponible}
                  onCheckedChange={(v) => setAvisarCliente(Boolean(v))}
                  className="mt-0.5"
                />
                <span>
                  Avisarle al cliente por WhatsApp que ahora lo sigue el asesor nuevo
                  <span className="block text-muted-foreground">
                    {estado.reapertura.disponible
                      ? "Hace más de 24 h que no escribe: sale por plantilla, y si contesta, el asesor nuevo lo toma."
                      : estado.reapertura.motivo}
                  </span>
                </span>
              </label>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={ocupado}>Cancelar</Button>
            <Button
              disabled={ocupado || !asesorElegido}
              onClick={() => correr(() => reasignarChat(conversationId, asesorElegido, { motivo: texto, avisarCliente: estado.ventanaCerrada && estado.reapertura.disponible && avisarCliente }))}
            >
              {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reasignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function venceTexto(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  const h = Math.round(Math.abs(ms) / 3600e3)
  if (ms < 0) return h < 1 ? "vencido recién" : `vencido hace ${h} h`
  return h < 1 ? "vence en menos de 1 h" : `vence en ${h} h`
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
