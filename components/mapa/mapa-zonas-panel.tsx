"use client"

// Panel de "Mis zonas": los trazos guardados del usuario.
// Son PRIVADAS: cada uno ve solo las suyas, ni el director ve las de un asesor.
import { useEffect, useState } from "react"
import { Loader2, MapPinned, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { FiltrosMapa, ZonaGuardada } from "@/lib/mapa/tipos"
import type { Trazo } from "./mapa-lapiz"

export function MapaZonasPanel({
  trazos,
  filtros,
  onBorrarTrazo,
  onLimpiarTrazos,
  onAplicarZona,
}: {
  trazos: Trazo[]
  filtros: FiltrosMapa
  onBorrarTrazo: (id: string) => void
  onLimpiarTrazos: () => void
  onAplicarZona: (z: ZonaGuardada) => void
}) {
  const [zonas, setZonas] = useState<ZonaGuardada[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [formularioDe, setFormularioDe] = useState<string | null>(null)
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")

  useEffect(() => {
    fetch("/api/mapa/zonas")
      .then((r) => r.json())
      .then((d) => setZonas(d.zonas || []))
      .catch(() => toast.error("No se pudieron traer tus zonas guardadas"))
      .finally(() => setCargando(false))
  }, [])

  const guardar = async (trazo: Trazo) => {
    if (!nombre.trim()) return toast.error("Ponele un nombre a la zona")
    setGuardando(true)
    try {
      const r = await fetch("/api/mapa/zonas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          descripcion,
          geojson: trazo.poligono,
          filtros,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "No se pudo guardar")
      setZonas((z) => [d.zona, ...z])
      setFormularioDe(null)
      setNombre("")
      setDescripcion("")
      toast.success("Zona guardada")
    } catch (e: any) {
      // El trazo NO se borra de la pantalla: el usuario puede reintentar sin redibujar.
      toast.error(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (id: string) => {
    const previas = zonas
    setZonas((z) => z.filter((x) => x.id !== id))
    const r = await fetch(`/api/mapa/zonas?id=${id}`, { method: "DELETE" })
    if (!r.ok) {
      setZonas(previas)
      toast.error("No se pudo borrar la zona")
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Trazos del momento (todavia sin guardar) ── */}
      {trazos.length > 0 && (
        <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {trazos.length} {trazos.length === 1 ? "trazo" : "trazos"} en pantalla
            </span>
            <button onClick={onLimpiarTrazos} className="text-[11px] text-zinc-500 underline">
              borrar todos
            </button>
          </div>
          <p className="px-1 pb-2 text-[10px] text-zinc-400">
            Con varios trazos se muestran las de todos, sumadas.
          </p>

          {trazos.map((t, i) => (
            <div key={t.id} className="mb-1 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Trazo {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setFormularioDe(t.id); setNombre(""); setDescripcion("") }}
                    className="rounded p-1 text-zinc-500 hover:text-sky-600"
                    title="Guardar esta zona"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onBorrarTrazo(t.id)}
                    className="rounded p-1 text-zinc-500 hover:text-red-600"
                    title="Borrar este trazo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {formularioDe === t.id && (
                <div className="mt-2 space-y-1.5">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Nombre (ej: Belgrano familias)"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                  <Textarea
                    className="min-h-[52px] text-xs"
                    placeholder="Descripción (opcional)"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    maxLength={300}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 flex-1 text-xs" disabled={guardando} onClick={() => guardar(t)}>
                      {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFormularioDe(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Zonas guardadas ── */}
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Mis zonas</div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 px-2 pb-2">
          {cargando && <Loader2 className="mx-auto my-4 h-4 w-4 animate-spin text-zinc-400" />}

          {!cargando && zonas.length === 0 && (
            <p className="px-1 py-3 text-[11px] leading-relaxed text-zinc-500">
              Todavía no guardaste ninguna. Dibujá una zona con el lápiz y apretá el <b>+</b> para
              guardarla con nombre. Son tuyas: nadie más las ve.
            </p>
          )}

          {zonas.map((z) => (
            <div
              key={z.id}
              className="group flex items-start gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => onAplicarZona(z)}>
                <div className="flex items-center gap-1.5">
                  <MapPinned className="h-3 w-3 shrink-0 text-sky-600" />
                  <span className="truncate text-xs font-medium">{z.nombre}</span>
                </div>
                {z.descripcion && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{z.descripcion}</p>
                )}
              </button>
              <button
                onClick={() => borrar(z.id)}
                className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                title="Borrar zona"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
