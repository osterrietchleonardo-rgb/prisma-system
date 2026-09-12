"use client"

// El mapa de Farming: el MISMO lienzo y el MISMO lápiz del Buscador, con cuatro modos.
//   nueva      → dibujar un trazo y guardarlo con nombre
//   redibujar  → el trazo nuevo reemplaza al actual
//   sumar      → el trazo nuevo se suma al actual (lo une el servidor)
//   ver        → sin lápiz
// Las zonas ajenas se ven siempre como contorno: sin eso se dibuja a ciegas y se choca.
import { useCallback, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, Pencil, Save, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Trazo } from "@/components/mapa/mapa-lapiz"
import type { BBox } from "@/lib/mapa/tipos"
import { bboxDeDibujo, type Dibujo } from "@/lib/farming/geometria"
import type { Choque, ContornoAjeno } from "@/lib/farming/tipos"

// Leaflet toca `window` al importarse: sin ssr:false el build se cae.
const MapaLienzo = dynamic(() => import("@/components/mapa/mapa-lienzo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  ),
})
const CapasFarming = dynamic(() => import("./capas-farming"), { ssr: false })

export type ModoMapa =
  | { tipo: "nueva" }
  | { tipo: "redibujar"; zonaId: string; actual: Dibujo }
  | { tipo: "sumar"; zonaId: string; actual: Dibujo }
  | { tipo: "ver"; actual: Dibujo | null }

const TITULO: Record<ModoMapa["tipo"], string> = {
  nueva: "Dibujá tu zona de farming",
  redibujar: "Redibujá la zona: el trazo nuevo reemplaza al anterior",
  sumar: "Dibujá el pedazo que falta: se suma a la zona",
  ver: "Tu zona",
}

const nada = () => {}

export function MapaFarming({
  modo,
  ajenas,
  titulo,
  onGuardar,
  onCerrar,
}: {
  modo: ModoMapa
  ajenas: ContornoAjeno[]
  /** Reemplaza el texto de la barra de arriba (por default sale de TITULO según el modo). */
  titulo?: string
  onGuardar: (args: { nombre?: string; geojson: Dibujo }) => Promise<void>
  onCerrar: () => void
}) {
  const [trazo, setTrazo] = useState<Trazo | null>(null)
  const [lapizActivo, setLapizActivo] = useState(modo.tipo !== "ver")
  const [nombre, setNombre] = useState("")
  const [choques, setChoques] = useState<Choque[]>([])
  const [guardando, setGuardando] = useState(false)

  const actual = modo.tipo === "nueva" ? null : modo.actual

  // Al abrir, el mapa se acomoda a la zona actual; al terminar un trazo, al trazo.
  const encuadrarA = useMemo<BBox | null>(() => {
    if (trazo) return bboxDeDibujo(trazo.poligono)
    return actual ? bboxDeDibujo(actual) : null
  }, [trazo, actual])

  // Con el lápiz, cada trazo nuevo REEMPLAZA al anterior: acá se dibuja UNA zona (o UN
  // pedazo) por vez. Para dos pedazos se usa "sumar" dos veces.
  const agregarTrazo = useCallback((t: Trazo) => {
    setTrazo(t)
    setChoques([])
    setLapizActivo(false)
  }, [])

  // Lo que se ve en verde: en "sumar", lo actual + el trazo; en los demás, el trazo o lo actual.
  const propia: Dibujo | null = useMemo(() => {
    if (modo.tipo === "sumar") return modo.actual
    if (trazo) return trazo.poligono
    return actual
  }, [modo, trazo, actual])

  const guardar = async () => {
    if (!trazo) return toast.error("Primero dibujá la zona con el lápiz")
    if (modo.tipo === "nueva" && !nombre.trim()) return toast.error("Ponele un nombre a la zona")
    setGuardando(true)
    try {
      await onGuardar({ nombre: modo.tipo === "nueva" ? nombre.trim() : undefined, geojson: trazo.poligono })
    } catch (e: any) {
      // Un 409 trae los recortes: se dibujan rayados y el trazo NO se borra, para corregir
      // sin redibujar todo (spec, "Choque de zonas").
      if (Array.isArray(e?.choques)) setChoques(e.choques)
      toast.error(e?.message || "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  const puedeDibujar = modo.tipo !== "ver"

  return (
    <div
      className="relative isolate h-[calc(100dvh-12rem)] overflow-hidden rounded-xl border border-zinc-200 sm:h-[560px] dark:border-zinc-800"
      style={{ touchAction: lapizActivo ? "none" : undefined }}
    >
      <MapaLienzo
        grupos={[]}
        onMover={nada}
        onAbrirGrupo={nada}
        onAbrirCumulo={nada}
        onProveedor={nada}
        encuadrarA={encuadrarA}
        lapizActivo={lapizActivo}
        trazos={modo.tipo === "sumar" && trazo ? [trazo] : []}
        onTrazo={puedeDibujar ? agregarTrazo : undefined}
      >
        <CapasFarming propia={propia} ajenas={ajenas} choques={choques} />
      </MapaLienzo>

      {/* Barra de arriba */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] flex flex-wrap items-center gap-2 p-3 pl-14">
        <div className="pointer-events-auto rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium shadow dark:bg-zinc-900/95">
          {titulo ?? TITULO[modo.tipo]}
        </div>
        {modo.tipo === "nueva" && (
          <Input
            className="pointer-events-auto h-8 w-56 text-xs"
            placeholder="Nombre (ej: Belgrano R)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={80}
          />
        )}
        <button
          onClick={onCerrar}
          title="Cerrar"
          className="pointer-events-auto ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow dark:bg-zinc-900 dark:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {puedeDibujar && (
        <button
          onClick={() => setLapizActivo((v) => !v)}
          title={lapizActivo ? "Salir del lápiz" : "Dibujar a mano alzada"}
          className={`absolute right-3 top-14 z-[700] flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors ${
            lapizActivo ? "bg-sky-700 text-white" : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {lapizActivo && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-[700] -translate-x-1/2 rounded-lg bg-sky-700/95 px-3 py-1.5 text-xs font-medium text-white shadow">
          Dibujá sin soltar. Las zonas grises son de tus colegas: no se pueden pisar.
        </div>
      )}

      {/* La línea visible del choque, no un globito: en el celular los globitos no se abren. */}
      {choques.length > 0 && (
        <div className="absolute inset-x-3 bottom-16 z-[700] rounded-lg bg-red-700/95 px-3 py-2 text-xs text-white shadow">
          Tu trazo pisa {choques.map((c) => `«${c.nombre}» (${c.owner_nombre}, ${c.pct}%)`).join(", ")}. Lo rayado es lo que choca: corré el trazo y volvé a guardar.
        </div>
      )}

      {puedeDibujar && (
        <div className="absolute bottom-3 right-3 z-[700] flex gap-2">
          {trazo && (
            <Button variant="secondary" size="sm" className="h-9" onClick={() => { setTrazo(null); setChoques([]); setLapizActivo(true) }}>
              Borrar el trazo
            </Button>
          )}
          <Button size="sm" className="h-9 gap-1.5" disabled={!trazo || guardando} onClick={guardar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      )}
    </div>
  )
}
