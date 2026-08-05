"use client"

// Solapa "Mapa" del Buscador IA. Es el contenedor: maneja el estado, pide los datos y
// arma la pantalla. El mapa en si vive en mapa-lienzo.tsx y se carga sin SSR.
//
// No comparte NADA con el chat: si esto fallara, el chat sigue funcionando igual.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, MapPin, X } from "lucide-react"
import { toast } from "sonner"

import { MapaFiltros } from "./mapa-filtros"
import { MapaResultados } from "./mapa-resultados"
import { MapaFicha } from "./mapa-ficha"
import { serializarBBox } from "@/lib/mapa/bbox"
import { agruparPorUbicacion } from "@/lib/mapa/agrupar"
import { filtrarPorTrazos } from "@/lib/mapa/filtro-poligono"
import type { BBox, FiltrosMapa, GrupoUbicacion, PropiedadMapa, RespuestaMapa } from "@/lib/mapa/tipos"

// Leaflet toca `window` al importarse: sin ssr:false el build se cae.
const MapaLienzo = dynamic(() => import("./mapa-lienzo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  ),
})

const FILTROS_INICIALES: FiltrosMapa = {
  operacion: "Venta",
  tipo: null,
  precio_min: null,
  precio_max: null,
  moneda: "USD",
  ambientes_min: null,
  fuentes: ["own", "agency", "roomix"],
}

export function MapaTab() {
  const [filtros, setFiltros] = useState<FiltrosMapa>(FILTROS_INICIALES)
  const [bbox, setBbox] = useState<BBox | null>(null)
  const [propiedades, setPropiedades] = useState<PropiedadMapa[]>([])
  const [truncado, setTruncado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [trazos, setTrazos] = useState<unknown[]>([])
  const [grupoAbierto, setGrupoAbierto] = useState<GrupoUbicacion | null>(null)
  const [fichaId, setFichaId] = useState<string | null>(null)

  const enVuelo = useRef<AbortController | null>(null)
  const hayTiles = Boolean(process.env.NEXT_PUBLIC_MAPTILER_KEY)

  // ── Traer las propiedades del rectangulo visible ──
  useEffect(() => {
    if (!bbox) return

    // Al mover rapido se disparan varios pedidos: se cancela el anterior para que no
    // llegue desordenado y pinte datos viejos encima de los nuevos.
    enVuelo.current?.abort()
    const ctrl = new AbortController()
    enVuelo.current = ctrl
    setCargando(true)

    const qs = new URLSearchParams({
      bbox: serializarBBox(bbox),
      operacion: filtros.operacion,
      moneda: filtros.moneda,
      fuentes: filtros.fuentes.join(","),
    })
    if (filtros.tipo) qs.set("tipo", filtros.tipo)
    if (filtros.precio_min !== null) qs.set("precio_min", String(filtros.precio_min))
    if (filtros.precio_max !== null) qs.set("precio_max", String(filtros.precio_max))
    if (filtros.ambientes_min !== null) qs.set("ambientes_min", String(filtros.ambientes_min))

    fetch(`/api/mapa/propiedades?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || "No se pudieron traer las propiedades")
        return data as RespuestaMapa
      })
      .then((data) => {
        setPropiedades(data.propiedades)
        setTruncado(data.truncado)
      })
      .catch((e) => {
        if (e.name === "AbortError") return
        toast.error(e.message)
      })
      .finally(() => {
        if (enVuelo.current === ctrl) setCargando(false)
      })

    return () => ctrl.abort()
  }, [bbox, filtros])

  // ── El lapiz recorta en el navegador: cero consultas nuevas ──
  const visibles = useMemo(
    () => filtrarPorTrazos(propiedades, trazos),
    [propiedades, trazos],
  )

  // Con el tope pasado no se dibujan puntos sueltos: solo los globitos con las cantidades.
  const grupos = useMemo(
    () => (truncado ? [] : agruparPorUbicacion(visibles)),
    [visibles, truncado],
  )

  const onMover = useCallback((b: BBox) => setBbox(b), [])
  const onAbrirGrupo = useCallback((g: GrupoUbicacion) => {
    if (g.propiedades.length === 1) setFichaId(g.propiedades[0].id)
    else setGrupoAbierto(g)
  }, [])

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[560px] flex-col gap-3">
      <MapaFiltros filtros={filtros} onCambio={setFiltros} />

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[1fr_22rem]">
        {/* ── El mapa ── */}
        <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <MapaLienzo grupos={grupos} onMover={onMover} onAbrirGrupo={onAbrirGrupo} />

          {/* Contador. Sale del MISMO estado que la lista, para que no puedan discrepar. */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium shadow dark:bg-zinc-900/90">
            {cargando ? (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> buscando…
              </span>
            ) : (
              <>
                {visibles.length} {visibles.length === 1 ? "propiedad" : "propiedades"} a la vista
              </>
            )}
          </div>

          {truncado && (
            <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-lg bg-amber-500/95 px-3 py-1.5 text-xs font-medium text-white shadow">
              Hay demasiadas propiedades acá. Acercate para verlas una por una.
            </div>
          )}

          {!hayTiles && (
            <div className="absolute right-3 top-3 z-[500] max-w-[15rem] rounded-lg bg-zinc-900/90 px-3 py-2 text-[11px] text-white shadow">
              Falta la clave del proveedor de mapas: se ve el fondo gris, pero los puntos, el
              lápiz y la lista funcionan igual.
            </div>
          )}
        </div>

        {/* ── Panel de resultados ── */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <MapaResultados propiedades={visibles} onAbrir={setFichaId} />
        </div>
      </div>

      {/* ── Varias propiedades en el mismo punto: se listan todas, no se elige una ── */}
      {grupoAbierto && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setGrupoAbierto(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4" />
                {grupoAbierto.propiedades.length} propiedades en esta ubicación
              </div>
              <button onClick={() => setGrupoAbierto(null)} aria-label="Cerrar">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            {grupoAbierto.posibles_repetidas.length > 0 && (
              <p className="border-b border-zinc-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800 dark:border-zinc-800 dark:bg-amber-950/40 dark:text-amber-300">
                Ojo: {grupoAbierto.posibles_repetidas.length}{" "}
                {grupoAbierto.posibles_repetidas.length === 1 ? "aviso parece estar" : "avisos parecen estar"}{" "}
                publicado por más de una inmobiliaria. No se ocultó ninguno.
              </p>
            )}

            <div className="max-h-[60vh]">
              <MapaResultados
                propiedades={grupoAbierto.propiedades}
                onAbrir={(id) => { setGrupoAbierto(null); setFichaId(id) }}
              />
            </div>
          </div>
        </div>
      )}

      {fichaId && <MapaFicha id={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  )
}
