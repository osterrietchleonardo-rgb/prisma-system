"use client"

// El mapa de Farming: el MISMO lienzo y el MISMO lápiz del Buscador, con cuatro modos.
//   nueva      → dibujar un trazo y guardarlo con nombre
//   redibujar  → el trazo nuevo reemplaza al actual
//   sumar      → el trazo nuevo se suma al actual (lo une el servidor)
//   ver        → sin lápiz
// Las zonas ajenas se ven siempre como contorno: sin eso se dibuja a ciegas y se choca.
//
// ARRANCA CON LA MANITO, no con el lápiz (pedido de Leonardo, 12-sep): con el lápiz prendido
// de entrada, arrastrar para ir hasta la zona DIBUJA en vez de mover. Primero se llega (con la
// lupita o arrastrando), después se toca el lápiz. Al soltar el trazo el lápiz se apaga solo y
// se abre el cuadro para ponerle nombre y guardar.
//
// LO QUE SE LEE Y SE TOCA VA ARRIBA: abajo a la derecha flota el globito del chat de la app y
// abajo a la izquierda el botón «Volver» del mapa. En el celular el globito tapaba la indicación
// y el botón «Guardar» (medido el 12-sep a 390×844).
import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, Pencil, Save, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MapaBuscador } from "@/components/mapa/mapa-buscador"
import type { Trazo } from "@/components/mapa/mapa-lapiz"
import type { Lugar } from "@/lib/mapa/lugares"
import type { BBox } from "@/lib/mapa/tipos"
import { bboxDeDibujo, type Dibujo } from "@/lib/farming/geometria"
import type { Choque } from "@/lib/farming/tipos"
import type { ContornoPintado } from "./capas-farming"

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

/** Lo que pregunta el cuadro al soltar el trazo, según el modo. */
const CUADRO: Record<"nueva" | "redibujar" | "sumar", { titulo: string; texto: string; boton: string }> = {
  nueva: {
    titulo: "Guardar como zona de farming",
    texto: "Ponele un nombre para reconocerla. Si pisa la zona de un colega, te lo marcamos en rojo y tu trazo no se borra.",
    boton: "Guardar como zona de farming",
  },
  redibujar: {
    titulo: "¿Reemplazar el trazo de la zona?",
    texto: "El dibujo nuevo reemplaza al anterior. Si pisa la zona de un colega, no se guarda y te lo marcamos en rojo.",
    boton: "Reemplazar",
  },
  sumar: {
    titulo: "¿Sumar este pedazo a la zona?",
    texto: "El pedazo nuevo se suma a la zona que ya tenés. Si pisa la zona de un colega, no se guarda y te lo marcamos en rojo.",
    boton: "Sumar el pedazo",
  },
}

const nada = () => {}

export function MapaFarming({
  modo,
  ajenas,
  titulo,
  onGuardar,
  onCerrar,
  resaltadaId,
  enfocar,
  encuadreInicial,
}: {
  modo: ModoMapa
  ajenas: ContornoPintado[]
  /** Reemplaza el texto de la barra de arriba (por default sale de TITULO según el modo). */
  titulo?: string
  onGuardar: (args: { nombre?: string; geojson: Dibujo }) => Promise<void>
  /** Sin esto no hay X: el director no tiene a dónde "cerrar" (el mapa es lo único en su pantalla). */
  onCerrar?: () => void
  /** La zona elegida en la lista del director. */
  resaltadaId?: string | null
  /** Cada objeto nuevo hace volar el mapa ahí (el director toca una zona de la lista). */
  enfocar?: BBox | null
  /** Adónde abre el mapa cuando no hay zona actual (el director: todas las del equipo). */
  encuadreInicial?: BBox | null
}) {
  const actual = modo.tipo === "nueva" ? null : modo.actual

  const [trazo, setTrazo] = useState<Trazo | null>(null)
  const [lapizActivo, setLapizActivo] = useState(false)
  const [cuadroAbierto, setCuadroAbierto] = useState(false)
  const [nombre, setNombre] = useState("")
  const [choques, setChoques] = useState<Choque[]>([])
  const [guardando, setGuardando] = useState(false)
  const [encuadre, setEncuadre] = useState<BBox | null>(() => (actual ? bboxDeDibujo(actual) : encuadreInicial ?? null))
  /** La dirección buscada en la lupita: se marca con el pin rojo. */
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number; nombre: string } | null>(null)

  useEffect(() => {
    if (enfocar) setEncuadre(enfocar)
  }, [enfocar])

  // Con el lápiz, cada trazo nuevo REEMPLAZA al anterior: acá se dibuja UNA zona (o UN
  // pedazo) por vez. Para dos pedazos se usa "sumar" dos veces. Al soltar, vuelve la manito
  // y se abre el cuadro para guardar.
  const agregarTrazo = useCallback((t: Trazo) => {
    setTrazo(t)
    setChoques([])
    setLapizActivo(false)
    setEncuadre(bboxDeDibujo(t.poligono))
    setCuadroAbierto(true)
  }, [])

  // La lupita solo lleva: un barrio o una zona encuadran; una dirección además clava el pin.
  const irALugar = useCallback((l: Lugar) => {
    setEncuadre(l.bbox)
    setUbicacion(l.punto ? { ...l.punto, nombre: l.detalle || l.nombre } : null)
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
      // Un 409 trae los recortes: se cierra el cuadro para que se vea lo rayado en el mapa, y
      // el trazo NO se borra, para corregir sin redibujar todo (spec, "Choque de zonas").
      if (Array.isArray(e?.choques)) {
        setChoques(e.choques)
        setCuadroAbierto(false)
      }
      toast.error(e?.message || "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  const puedeDibujar = modo.tipo !== "ver"
  const cuadro = modo.tipo === "ver" ? null : CUADRO[modo.tipo]

  return (
    <div
      className="relative isolate h-[calc(100dvh-12rem)] overflow-hidden rounded-xl border border-zinc-200 sm:h-[560px] dark:border-zinc-800"
      /* Con el lápiz activo el navegador no se queda con el gesto del dedo: sin esto, arrastrar
         para dibujar hace scroll de la página. Con la manito, el dedo mueve el mapa. */
      style={{ touchAction: lapizActivo ? "none" : undefined }}
    >
      <MapaLienzo
        grupos={[]}
        onMover={nada}
        onAbrirGrupo={nada}
        onAbrirCumulo={nada}
        onProveedor={nada}
        encuadrarA={encuadre}
        ubicacion={ubicacion}
        lapizActivo={lapizActivo}
        trazos={modo.tipo === "sumar" && trazo ? [trazo] : []}
        onTrazo={puedeDibujar ? agregarTrazo : undefined}
      >
        <CapasFarming propia={propia} ajenas={ajenas} choques={choques} resaltadaId={resaltadaId} />
      </MapaLienzo>

      {/* ── Arriba: la lupita (y la X); debajo el título y el lápiz; debajo lo que hay que leer
          o tocar ahora. `pointer-events-none` en los contenedores y `auto` en cada control: si
          no, la franja transparente se come el arrastre del mapa. pl-14 deja pasar el zoom. ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] space-y-2 p-3 pl-14">
        <div className="flex items-center gap-2">
          <div className="pointer-events-auto min-w-0 flex-1 sm:max-w-md">
            <MapaBuscador onElegir={irALugar} />
          </div>
          {onCerrar && (
            <button
              onClick={onCerrar}
              title="Cerrar"
              className="pointer-events-auto ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-zinc-700 shadow dark:bg-zinc-900 dark:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="pointer-events-auto w-fit min-w-0 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium shadow dark:bg-zinc-900/95">
            {titulo ?? TITULO[modo.tipo]}
          </div>
          {puedeDibujar && (
            <button
              onClick={() => setLapizActivo((v) => !v)}
              title={lapizActivo ? "Volver a mover el mapa" : "Dibujar a mano alzada"}
              className={`pointer-events-auto ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-lg transition-colors ${
                lapizActivo ? "bg-sky-700 text-white" : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Las indicaciones van como línea visible, nunca en un globito (en el celular no se abre). */}
        {puedeDibujar && !lapizActivo && !trazo && (
          <p className="w-fit max-w-full rounded-lg bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-white shadow">
            Mové el mapa hasta tu zona (o buscala con la lupita) y tocá el lápiz para dibujar.
          </p>
        )}

        {lapizActivo && (
          <p className="w-fit max-w-full rounded-lg bg-sky-700/95 px-3 py-1.5 text-xs font-medium text-white shadow">
            Dibujá sin soltar. Las zonas grises son de tus colegas: no se pueden pisar.
          </p>
        )}

        {/* La línea visible del choque, no un globito: en el celular los globitos no se abren. */}
        {choques.length > 0 && (
          <p className="max-w-full rounded-lg bg-red-700/95 px-3 py-2 text-xs text-white shadow">
            {choques.map((c) => `Tu trazo pisa el ${c.pct}% de «${c.nombre}» (${c.owner_nombre})`).join(". ")}. Lo rayado es lo que choca: corré el trazo y volvé a guardar.
          </p>
        )}

        {/* Con un trazo en pantalla y el cuadro cerrado (se canceló, o chocó): volver a abrirlo o
            empezar de nuevo. */}
        {puedeDibujar && trazo && !lapizActivo && (
          <div className="pointer-events-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="h-9 shadow" onClick={() => { setTrazo(null); setChoques([]) }}>
              Borrar el trazo
            </Button>
            <Button size="sm" className="h-9 gap-1.5 shadow" disabled={guardando} onClick={() => setCuadroAbierto(true)}>
              <Save className="h-4 w-4" />
              Guardar
            </Button>
          </div>
        )}
      </div>

      {cuadro && (
        <Dialog open={cuadroAbierto} onOpenChange={(abierto) => { if (!abierto && !guardando) setCuadroAbierto(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{cuadro.titulo}</DialogTitle>
              <DialogDescription>{cuadro.texto}</DialogDescription>
            </DialogHeader>
            {modo.tipo === "nueva" && (
              <Input
                placeholder="Nombre (ej: Belgrano R)"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nombre.trim() && !guardando) guardar() }}
                maxLength={80}
                autoFocus
              />
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" disabled={guardando} onClick={() => setCuadroAbierto(false)}>
                Seguir editando
              </Button>
              <Button disabled={guardando || (modo.tipo === "nueva" && !nombre.trim())} onClick={guardar} className="gap-1.5">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {cuadro.boton}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
