"use client"

// Lo que ve el director: el mapa de la agencia con todas las zonas y de quién es cada una,
// la lista por asesor, y «liberar». NO hay aprobación de zonas ni asignación: Leonardo
// eligió "primero que la dibuja, la gana" (spec). Liberar no borra nada.
import { useCallback, useEffect, useState } from "react"
import { Loader2, Unlock } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { RespuestaZonas, ZonaFarming } from "@/lib/farming/tipos"
import { MapaFarming } from "./mapa-farming"

export function FarmingDirector() {
  const [datos, setDatos] = useState<RespuestaZonas | null>(null)
  const [liberando, setLiberando] = useState<ZonaFarming | null>(null)
  const [motivo, setMotivo] = useState("")
  const [ocupado, setOcupado] = useState(false)

  const recargar = useCallback(async () => {
    try {
      const r = await fetch("/api/farming/zonas")
      const d = await r.json()
      if (!r.ok) return toast.error(d.error || "No se pudieron traer las zonas")
      setDatos(d)
    } catch {
      toast.error("No se pudieron traer las zonas: revisá la conexión y volvé a intentar")
    }
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const cerrarDialogo = () => {
    setLiberando(null)
    setMotivo("")
  }

  const liberar = async () => {
    if (!liberando) return
    setOcupado(true)
    try {
      const r = await fetch(`/api/farming/zonas/${liberando.id}/liberar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(`«${liberando.nombre}» liberada. Esas cuadras ya se pueden volver a dibujar.`)
      cerrarDialogo()
      await recargar()
    } catch (e: any) {
      toast.error(
        e instanceof Error && e.message && !/fetch/i.test(e.message)
          ? e.message
          : "No se pudo liberar la zona: revisá la conexión y volvé a intentar"
      )
    } finally {
      setOcupado(false)
    }
  }

  if (!datos) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  // Agrupado por asesor, para leer el reparto de un vistazo.
  const porAsesor = new Map<string, ZonaFarming[]>()
  for (const z of datos.equipo) porAsesor.set(z.owner_nombre, [...(porAsesor.get(z.owner_nombre) || []), z])

  return (
    <div className="flex h-full flex-col gap-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Farming de la inmobiliaria</h1>
        <p className="text-sm text-muted-foreground">
          {datos.equipo.length} {datos.equipo.length === 1 ? "zona activa" : "zonas activas"} entre {porAsesor.size} {porAsesor.size === 1 ? "asesor" : "asesores"}. Cada uno dibuja la suya; vos podés liberar una si hace falta.
        </p>
      </div>

      <MapaFarming modo={{ tipo: "ver", actual: null }} ajenas={datos.ajenas} onGuardar={async () => {}} onCerrar={() => {}} />

      {datos.equipo.length === 0 && (
        <p className="text-sm text-muted-foreground">Ningún asesor dibujó todavía su zona.</p>
      )}

      {[...porAsesor.entries()].map(([asesor, zonas]) => (
        <div key={asesor} className="space-y-2">
          <h2 className="text-sm font-semibold">{asesor}</h2>
          {zonas.map((z) => (
            <div key={z.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-card px-4 py-3 dark:border-zinc-800">
              <div>
                <p className="font-medium">{z.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {z.area_km2.toFixed(2)} km² · {z.pedazos === 1 ? "1 pedazo" : `${z.pedazos} pedazos`}
                  {z.compartida_con.length > 0 && ` · compartida con ${z.compartida_con.map((c) => c.nombre).join(", ")}`}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setLiberando(z)}>
                <Unlock className="h-3.5 w-3.5" /> liberar
              </Button>
            </div>
          ))}
        </div>
      ))}

      <Dialog open={!!liberando} onOpenChange={(a) => { if (!a) cerrarDialogo() }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Liberar «{liberando?.nombre}»</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            No se borra nada: la zona queda en el historial con la fecha y este motivo. Lo único que cambia es que esas cuadras vuelven a estar libres para que otro asesor las dibuje.
          </p>
          <Textarea placeholder="Por qué se libera (ej: el asesor se desvinculó)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={cerrarDialogo}>Cancelar</Button>
            <Button disabled={!motivo.trim() || ocupado} onClick={liberar}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Liberar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
