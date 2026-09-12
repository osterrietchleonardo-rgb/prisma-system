"use client"

// Lo que ve el director: el mapa de la agencia con todas las zonas, un color por asesor, la
// lista por asesor, y «liberar». Tocar una zona de la lista lleva el mapa hasta ella y la
// resalta. NO hay aprobación de zonas ni asignación: Leonardo eligió "primero que la dibuja,
// la gana" (spec). Liberar no borra nada.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, MapPin, Unlock } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { pedir } from "@/lib/farming/cliente"
import { coloresPorAsesor } from "@/lib/farming/colores"
import { bboxDeDibujo, unirBBoxes } from "@/lib/farming/geometria"
import type { BBox } from "@/lib/mapa/tipos"
import type { RespuestaZonas, ZonaFarming } from "@/lib/farming/tipos"
import { MapaFarming } from "./mapa-farming"
import type { ContornoPintado } from "./capas-farming"

export function FarmingDirector() {
  const [datos, setDatos] = useState<RespuestaZonas | null>(null)
  const [liberando, setLiberando] = useState<ZonaFarming | null>(null)
  const [motivo, setMotivo] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [elegida, setElegida] = useState<ZonaFarming | null>(null)
  const [enfocar, setEnfocar] = useState<BBox | null>(null)
  const mapa = useRef<HTMLDivElement>(null)

  const recargar = useCallback(async () => {
    try {
      setDatos(await pedir("/api/farming/zonas"))
    } catch (e: any) {
      toast.error(e.message)
    }
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const equipo = useMemo(() => datos?.equipo ?? [], [datos])
  const colores = useMemo(() => coloresPorAsesor(equipo.map((z) => z.owner_user_id)), [equipo])
  const contornos: ContornoPintado[] = useMemo(
    () => equipo.map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_nombre, geojson: z.geojson, color: colores.get(z.owner_user_id) })),
    [equipo, colores],
  )
  const encuadreEquipo = useMemo(() => unirBBoxes(equipo.map((z) => bboxDeDibujo(z.geojson))), [equipo])

  // Si la zona elegida se liberó, deja de estar resaltada.
  useEffect(() => {
    if (elegida && !equipo.some((z) => z.id === elegida.id)) setElegida(null)
  }, [equipo, elegida])

  const irAZona = (z: ZonaFarming) => {
    setElegida(z)
    // Objeto nuevo cada vez: tocar dos veces la misma zona vuelve a llevar el mapa hasta ella.
    const b = bboxDeDibujo(z.geojson)
    if (b) setEnfocar({ ...b })
    // En el celular la lista está debajo del mapa: sin esto el mapa se mueve fuera de la vista.
    mapa.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const cerrarDialogo = () => {
    setLiberando(null)
    setMotivo("")
  }

  const liberar = async () => {
    if (!liberando) return
    setOcupado(true)
    try {
      await pedir(`/api/farming/zonas/${liberando.id}/liberar`, { method: "POST", body: JSON.stringify({ motivo }) })
      toast.success(`«${liberando.nombre}» liberada. Esas cuadras ya se pueden volver a dibujar.`)
      cerrarDialogo()
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!datos) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  // Agrupado por owner_user_id, no por nombre: dos asesores sin nombre cargado (o dos
  // homónimos) son "otro asesor" los dos, y por nombre caerían en el mismo grupo.
  const porAsesor = new Map<string, { nombre: string; zonas: ZonaFarming[] }>()
  for (const z of equipo) {
    const grupo = porAsesor.get(z.owner_user_id)
    if (grupo) grupo.zonas.push(z)
    else porAsesor.set(z.owner_user_id, { nombre: z.owner_nombre, zonas: [z] })
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Farming de la inmobiliaria</h1>
        <p className="text-sm text-muted-foreground">
          {equipo.length} {equipo.length === 1 ? "zona activa" : "zonas activas"} entre {porAsesor.size} {porAsesor.size === 1 ? "asesor" : "asesores"}. Cada uno dibuja la suya; vos podés liberar una si hace falta. Tocá una zona de la lista para verla en el mapa.
        </p>
      </div>

      <div ref={mapa} className="scroll-mt-4">
        <MapaFarming
          modo={{ tipo: "ver", actual: null }}
          ajenas={contornos}
          titulo={elegida ? `«${elegida.nombre}» · ${elegida.owner_nombre}` : "Las zonas de la inmobiliaria"}
          onGuardar={async () => {}}
          resaltadaId={elegida?.id ?? null}
          enfocar={enfocar}
          encuadreInicial={encuadreEquipo}
        />
      </div>

      {equipo.length === 0 && (
        <p className="text-sm text-muted-foreground">Ningún asesor dibujó todavía su zona.</p>
      )}

      {[...porAsesor.entries()].map(([ownerId, { nombre, zonas }]) => (
        <div key={ownerId} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colores.get(ownerId) }} />
            {nombre}
          </h2>
          {zonas.map((z) => {
            const esElegida = elegida?.id === z.id
            return (
              <div
                key={z.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 ${
                  esElegida ? "border-2" : "border-zinc-200 dark:border-zinc-800"
                }`}
                style={{ borderLeftWidth: 4, borderLeftColor: colores.get(ownerId), ...(esElegida ? { borderColor: colores.get(ownerId) } : {}) }}
              >
                <button onClick={() => irAZona(z)} className="min-w-0 flex-1 text-left">
                  <p className="font-medium">{z.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {z.area_km2.toFixed(2)} km² · {z.pedazos === 1 ? "1 pedazo" : `${z.pedazos} pedazos`}
                    {z.compartida_con.length > 0 && ` · compartida con ${z.compartida_con.map((c) => c.nombre).join(", ")}`}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-accent">
                    <MapPin className="h-3.5 w-3.5" /> {esElegida ? "marcada en el mapa" : "ver en el mapa"}
                  </p>
                </button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setLiberando(z)}>
                  <Unlock className="h-3.5 w-3.5" /> liberar
                </Button>
              </div>
            )
          })}
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
