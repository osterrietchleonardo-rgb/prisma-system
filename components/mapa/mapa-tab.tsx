"use client"

// Solapa "Mapa" del Buscador IA. Es el contenedor: maneja el estado, pide los datos y
// arma la pantalla. El mapa en si vive en mapa-lienzo.tsx y se carga sin SSR.
//
// No comparte NADA con el chat: si esto fallara, el chat sigue funcionando igual.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, MapPin, Pencil, X } from "lucide-react"
import { toast } from "sonner"

import { MapaFiltros } from "./mapa-filtros"
import { MapaResultados } from "./mapa-resultados"
import { MapaFicha } from "./mapa-ficha"
import { MapaZonasPanel } from "./mapa-zonas-panel"
import type { Trazo } from "./mapa-lapiz"
import { bboxDePoligono, serializarBBox } from "@/lib/mapa/bbox"
import { agruparPorUbicacion } from "@/lib/mapa/agrupar"
import { filtrarPorTrazos } from "@/lib/mapa/filtro-poligono"
import { etiquetaDeTipo } from "@/lib/mapa/tipos-propiedad"
import type { BBox, FiltrosMapa, GrupoUbicacion, PropiedadMapa, RespuestaMapa, ZonaGuardada } from "@/lib/mapa/tipos"

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
  const [trazos, setTrazos] = useState<Trazo[]>([])
  const [lapizActivo, setLapizActivo] = useState(false)
  const [encuadrarA, setEncuadrarA] = useState<BBox | null>(null)
  const [grupoAbierto, setGrupoAbierto] = useState<GrupoUbicacion | null>(null)
  const [cumuloAbierto, setCumuloAbierto] = useState<PropiedadMapa[] | null>(null)
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [sinEseTipo, setSinEseTipo] = useState({ cartera: false, colaboracion: false })

  const enVuelo = useRef<AbortController | null>(null)

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
        setSinEseTipo(data.sin_ese_tipo ?? { cartera: false, colaboracion: false })
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
    () => filtrarPorTrazos(propiedades, trazos.map((t) => t.poligono)),
    [propiedades, trazos],
  )

  // Un trazo que no encierra nada casi siempre es un error de pulso: hay que avisarlo,
  // porque si no el usuario ve la pantalla vacia y no entiende por que.
  const trazoVacio = trazos.length > 0 && visibles.length === 0 && propiedades.length > 0

  const agregarTrazo = useCallback((t: Trazo) => {
    setTrazos((prev) => [...prev, t])
    setLapizActivo(false)
    const b = bboxDePoligono(t.poligono)
    if (b) setEncuadrarA(b)
  }, [])

  const aplicarZona = useCallback((z: ZonaGuardada) => {
    const trazo: Trazo = { id: `zona_${z.id}`, poligono: z.geojson as Trazo["poligono"] }
    setTrazos([trazo])
    const b = bboxDePoligono(z.geojson)
    if (b) setEncuadrarA(b)
    else toast.error("Esa zona no tiene un trazo válido")
  }, [])

  // Pasado el tope se siguen dibujando los globitos, con el contador avisando que son
  // una muestra. Antes se borraba todo y quedaba el mapa vacio: sobre una ciudad entera
  // eso es casi siempre, y un mapa en blanco no le sirve a nadie. Mil puntos de muestra
  // + un cartel que aclara que son mil de muchos mas es mas util y igual de honesto.
  const grupos = useMemo(() => agruparPorUbicacion(visibles), [visibles])

  const onMover = useCallback((b: BBox) => setBbox(b), [])
  const onAbrirGrupo = useCallback((g: GrupoUbicacion) => {
    if (g.propiedades.length === 1) setFichaId(g.propiedades[0].id)
    else setGrupoAbierto(g)
  }, [])

  // Un globito puede tapar muchos puntos, y cada punto muchas propiedades: se listan
  // todas juntas, que es lo que se necesita para elegir.
  const onAbrirCumulo = useCallback((gs: GrupoUbicacion[]) => {
    setCumuloAbierto(gs.flatMap((g) => g.propiedades))
  }, [])

  const [proveedor, setProveedor] = useState<"maptiler" | "osm">("osm")
  const onProveedor = useCallback((p: "maptiler" | "osm") => setProveedor(p), [])

  const etiquetaTipo = etiquetaDeTipo(filtros.tipo)
  const avisoTipo = etiquetaTipo && (sinEseTipo.cartera || sinEseTipo.colaboracion)
    ? sinEseTipo.colaboracion && !sinEseTipo.cartera
      ? `“${etiquetaTipo}” solo se muestra de tu cartera: la red de colaboración no separa ese tipo.`
      : `“${etiquetaTipo}” no existe en una de las dos fuentes.`
    : null

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[560px] flex-col gap-3">
      <MapaFiltros filtros={filtros} onCambio={setFiltros} />

      {avisoTipo && (
        <p className="-mt-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {avisoTipo}
        </p>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[15rem_1fr_22rem]">
        {/* ── Mis zonas ── */}
        <div className="hidden overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 lg:block">
          <MapaZonasPanel
            trazos={trazos}
            filtros={filtros}
            onBorrarTrazo={(id) => setTrazos((t) => t.filter((x) => x.id !== id))}
            onLimpiarTrazos={() => setTrazos([])}
            onAplicarZona={aplicarZona}
          />
        </div>

        {/* ── El mapa ──
            `isolate` no es decorativo: Leaflet pone sus capas en z-index 400 a 700, y sin
            aislar competian de igual a igual con el modal de la ficha (z-50). Por eso los
            puntos del mapa se veian dibujados ENCIMA de la ficha abierta. */}
        <div className="relative isolate overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <MapaLienzo
            grupos={grupos}
            onMover={onMover}
            onAbrirGrupo={onAbrirGrupo}
            onAbrirCumulo={onAbrirCumulo}
            onProveedor={onProveedor}
            encuadrarA={encuadrarA}
            lapizActivo={lapizActivo}
            trazos={trazos}
            onTrazo={agregarTrazo}
          />

          {/* ── El lápiz ── */}
          <button
            onClick={() => setLapizActivo((v) => !v)}
            title={lapizActivo ? "Salir del lápiz" : "Dibujar una zona a mano alzada"}
            className={`absolute right-3 top-3 z-[500] flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors ${
              lapizActivo ? "bg-sky-600 text-white" : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            }`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {lapizActivo && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-lg bg-sky-600/95 px-3 py-1.5 text-xs font-medium text-white shadow">
              Dibujá la zona sin soltar. Podés hacer varios trazos: se suman.
            </div>
          )}

          {trazoVacio && (
            <div className="absolute left-1/2 top-14 z-[500] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-zinc-900/95 px-3 py-1.5 text-xs text-white shadow">
              Ninguna propiedad en esta zona.
              <button className="underline" onClick={() => setTrazos([])}>borrar el trazo</button>
            </div>
          )}

          {/* Contador. Sale del MISMO estado que la lista, para que no puedan discrepar. */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium shadow dark:bg-zinc-900/90">
            {cargando ? (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> buscando…
              </span>
            ) : (
              <>
                {/* El "+" no es decorativo: pasado el tope, este numero es el del tope,
                    no el de la zona. Sin el signo el mapa afirma que hay 1.000 cuando
                    puede haber 40.000. El aviso va PEGADO al numero y no en un cartel
                    aparte: centrado abajo se montaba justo encima de este contador. */}
                {truncado && "+"}
                {visibles.length} {visibles.length === 1 ? "propiedad" : "propiedades"} a la vista
                {truncado && (
                  <span className="ml-1.5 border-l border-zinc-300 pl-1.5 font-normal text-amber-600 dark:border-zinc-700 dark:text-amber-500">
                    es una muestra, acercate para verlas todas
                  </span>
                )}
              </>
            )}
          </div>

          {proveedor === "osm" && (
            <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-lg bg-zinc-900/80 px-2.5 py-1 text-[10px] text-white shadow">
              Fondo: OpenStreetMap
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

      {/* ── Click en un globito: todas las propiedades que tenia adentro ── */}
      {cumuloAbierto && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCumuloAbierto(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4" />
                {cumuloAbierto.length} propiedades en esta zona
              </div>
              <button onClick={() => setCumuloAbierto(null)} aria-label="Cerrar">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <MapaResultados
                propiedades={cumuloAbierto}
                onAbrir={(id) => { setCumuloAbierto(null); setFichaId(id) }}
              />
            </div>
          </div>
        </div>
      )}

      {fichaId && <MapaFicha id={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  )
}
