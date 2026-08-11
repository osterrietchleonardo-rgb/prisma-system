"use client"

// Solapa "Mapa" del Buscador IA. Es el contenedor: maneja el estado, pide los datos y
// arma la pantalla. El mapa en si vive en mapa-lienzo.tsx y se carga sin SSR.
//
// No comparte NADA con el chat: si esto fallara, el chat sigue funcionando igual.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { DollarSign, List, Loader2, MapPin, Pencil, SlidersHorizontal, Star, X } from "lucide-react"
import { toast } from "sonner"

import { MapaBuscador } from "./mapa-buscador"
import { MapaFiltros } from "./mapa-filtros"
import { MapaResultados } from "./mapa-resultados"
import { MapaFicha } from "./mapa-ficha"
import { MapaListaModal } from "./mapa-lista-modal"
import { MapaPanelPrecios } from "./mapa-panel-precios"
import { MapaZonasPanel } from "./mapa-zonas-panel"
import type { Trazo } from "./mapa-lapiz"
import { bboxDePoligono, serializarBBox } from "@/lib/mapa/bbox"
import { agruparPorUbicacion } from "@/lib/mapa/agrupar"
import { filtrarPorTrazos } from "@/lib/mapa/filtro-poligono"
import { etiquetaDeTipo } from "@/lib/mapa/tipos-propiedad"
import type { Lugar } from "@/lib/mapa/lugares"
import { cortesDeEscala, tramosDeReferencia, type BarrioPrecio, type CeldaPrecio, type ManzanaPrecio } from "@/lib/mapa/precio-m2"
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
  barrio: null,
}

/** Boton de la barra: prende y apaga un panel, y avisa si tiene algo puesto. */
function BotonPanel({
  icono: Icono,
  texto,
  activo,
  marca,
  onClick,
}: {
  icono: typeof MapPin
  texto: string
  activo: boolean
  /** Numerito naranja: cuantos filtros o trazos hay puestos. */
  marca?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
        activo
          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          : "bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      <Icono className="h-3.5 w-3.5" />
      {texto}
      {marca !== undefined && (
        <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
          {marca}
        </span>
      )}
    </button>
  )
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

  // Que paneles estan abiertos. Arrancan CERRADOS a proposito: lo primero que tiene que
  // ver el asesor es el mapa entero, y abre lo que necesita.
  const [verFiltros, setVerFiltros] = useState(false)
  const [verZonas, setVerZonas] = useState(false)
  const [verLista, setVerLista] = useState(false)

  const [verPrecios, setVerPrecios] = useState(false)
  const [manzanas, setManzanas] = useState<ManzanaPrecio[]>([])
  const [celdas, setCeldas] = useState<CeldaPrecio[]>([])
  const [unidadPrecio, setUnidadPrecio] = useState<"manzana" | "cuadricula">("cuadricula")
  const [barriosPrecio, setBarriosPrecio] = useState<BarrioPrecio[]>([])
  const [cargandoPrecios, setCargandoPrecios] = useState(false)

  const enVuelo = useRef<AbortController | null>(null)
  const enVueloPrecios = useRef<AbortController | null>(null)

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
    if (filtros.barrio) qs.set("barrio", filtros.barrio)

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

  // ── El mapa de calor de $/m2 ──
  //
  // Va aparte de las propiedades a proposito: sale de tablas precalculadas, no depende de
  // los filtros de tipo ni de precio, y solo se pide con la capa prendida. Mezclarlo en la
  // consulta de propiedades obligaria a traerlo siempre, aunque nadie lo mire.
  useEffect(() => {
    if (!verPrecios || !bbox) {
      setManzanas([])
      setCeldas([])
      setBarriosPrecio([])
      return
    }
    enVueloPrecios.current?.abort()
    const ctrl = new AbortController()
    enVueloPrecios.current = ctrl
    setCargandoPrecios(true)

    const qs = new URLSearchParams({
      bbox: serializarBBox(bbox),
      operacion: filtros.operacion,
      moneda: filtros.moneda,
    })
    fetch(`/api/mapa/precio-m2?${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo traer el precio por m²"))))
      .then((d) => {
        if (ctrl.signal.aborted) return
        setManzanas(d.manzanas || [])
        setCeldas(d.celdas || [])
        setUnidadPrecio(d.unidad === "manzana" ? "manzana" : "cuadricula")
        setBarriosPrecio(d.barrios || [])
      })
      .catch((e) => { if (e.name !== "AbortError") toast.error(e.message) })
      .finally(() => { if (enVueloPrecios.current === ctrl) setCargandoPrecios(false) })

    return () => ctrl.abort()
  }, [verPrecios, bbox, filtros.operacion, filtros.moneda])

  // La escala se arma con lo que hay EN PANTALLA: ver cortesDeEscala().
  const valoresM2 = useMemo(
    () => (manzanas.length > 0 ? manzanas : celdas).map((c) => c.mediana_m2),
    [manzanas, celdas],
  )
  const cortesPrecio = useMemo(() => cortesDeEscala(valoresM2), [valoresM2])
  const tramosPrecio = useMemo(
    () => tramosDeReferencia(valoresM2, cortesPrecio, filtros.moneda),
    [valoresM2, cortesPrecio, filtros.moneda],
  )

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

  // Elegir un lugar del buscador. Un barrio o una direccion SOLO mueven el mapa; una
  // zona guardada ademas recorta, porque para eso se dibujo.
  const irALugar = useCallback((l: Lugar) => {
    if (l.tipo === "zona" && l.geojson) {
      const trazo: Trazo = { id: `lugar_${l.id}`, poligono: l.geojson as Trazo["poligono"] }
      setTrazos([trazo])
      const b = bboxDePoligono(l.geojson)
      if (b) setEncuadrarA(b)
      else toast.error("Esa zona no tiene un trazo válido")
      return
    }
    // Un barrio nuevo con el trazo viejo puesto mostraria cero propiedades sin explicar
    // por que: el trazo de antes no encierra nada de donde acabamos de aterrizar.
    setTrazos([])
    setEncuadrarA(l.bbox)

    // Un barrio ademas FILTRA. Acercarse no alcanza: en el recuadro de Belgrano el 46%
    // de lo que entra es de los barrios vecinos, y en el de Palermo el 65% (medido el
    // 2026-08-10). Quien busco "Belgrano" quiere Belgrano.
    //
    // Una direccion NO filtra: es un punto, no un barrio, y ademas puede caer en un
    // barrio que no tenga nada. Ahi el filtro dejaria la pantalla vacia.
    setFiltros((f) => ({
      ...f,
      barrio: l.tipo === "barrio" || l.tipo === "cartera" ? l.nombre : null,
    }))
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

  // Cuantos filtros hay puestos, para avisarlo en el boton: con la barra escondida, un
  // filtro olvidado explica una pantalla vacia y nadie lo veria.
  const filtrosActivos = useMemo(() => {
    let n = 0
    if (filtros.tipo) n++
    if (filtros.precio_min !== null) n++
    if (filtros.precio_max !== null) n++
    if (filtros.ambientes_min !== null) n++
    if (filtros.barrio) n++
    if (filtros.fuentes.length < 3) n++
    return n || undefined
  }, [filtros])

  const etiquetaTipo = etiquetaDeTipo(filtros.tipo)
  const avisoTipo = etiquetaTipo && (sinEseTipo.cartera || sinEseTipo.colaboracion)
    ? sinEseTipo.colaboracion && !sinEseTipo.cartera
      ? `“${etiquetaTipo}” solo se muestra de tu cartera: la red de colaboración no separa ese tipo.`
      : `“${etiquetaTipo}” no existe en una de las dos fuentes.`
    : null

  return (
    /* EL MAPA OCUPA TODO. Antes los paneles laterales se comian 616 px de ancho fijo
       (240 de "Mis zonas" + 352 de resultados + separaciones) y el buscador con los
       filtros otros ~160 de alto. En una notebook de 1366x768 el mapa quedaba en
       750x404 px: menos de un tercio de la pantalla.

       Ahora los paneles FLOTAN sobre el mapa en vez de empujarlo. La diferencia no es
       estetica: si empujaran, cada vez que se abre o cierra uno el mapa cambiaria de
       tamano, con el cambiaria el rectangulo visible, y eso dispara una consulta nueva y
       hace parpadear los pines. Flotando, el mapa no se entera de nada.

       `isolate` no es decorativo: Leaflet pone sus capas en z-index 400 a 700, y sin
       aislar competian de igual a igual con el modal de la ficha (z-50). Por eso los
       puntos del mapa se veian dibujados ENCIMA de la ficha abierta. */
    <div className="relative isolate h-[calc(100vh-11rem)] min-h-[560px] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <MapaLienzo
        manzanasPrecio={verPrecios ? manzanas : undefined}
        celdasPrecio={verPrecios ? celdas : undefined}
        cortesPrecio={cortesPrecio}
        monedaPrecio={filtros.moneda}
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

      {/* ── Barra de arriba: buscador y los tres botones ──
          `pointer-events-none` en el contenedor y `auto` en cada control: sin eso, la
          franja transparente se comeria el arrastre del mapa en toda la parte de arriba. */}
      {/* pl-14 deja pasar el control de zoom de Leaflet, que vive pegado arriba a la
          izquierda: sin ese margen el buscador se le monta encima. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] space-y-2 p-3 pl-14">
        <div className="pointer-events-auto w-full max-w-md">
          <MapaBuscador onElegir={irALugar} />
        </div>

        {filtros.barrio && (
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 py-1 pl-3 pr-1.5 text-xs font-medium text-white shadow">
              Solo {filtros.barrio}
              <button
                onClick={() => setFiltros((f) => ({ ...f, barrio: null }))}
                title="Ver también los barrios vecinos"
                className="rounded-full p-0.5 transition-colors hover:bg-white/25"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <BotonPanel
            icono={SlidersHorizontal}
            texto="Filtros"
            activo={verFiltros}
            marca={filtrosActivos}
            onClick={() => setVerFiltros((v) => !v)}
          />
          <BotonPanel
            icono={Star}
            texto="Mis zonas"
            activo={verZonas}
            marca={trazos.length || undefined}
            onClick={() => setVerZonas((v) => !v)}
          />
          <BotonPanel
            icono={List}
            texto={verPrecios ? "Ranking" : "Resultados"}
            activo={verLista}
            onClick={() => setVerLista((v) => !v)}
          />
        </div>

        {verFiltros && (
          <div className="pointer-events-auto w-full max-w-4xl rounded-xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
            <MapaFiltros filtros={filtros} onCambio={setFiltros} />
          </div>
        )}

        {avisoTipo && (
          <p className="pointer-events-auto w-fit rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 shadow dark:bg-amber-950/90 dark:text-amber-300">
            {avisoTipo}
          </p>
        )}
      </div>

      {/* ── Mis zonas: flota a la izquierda ──
          Baja cuando la barra de filtros esta desplegada: si no, se le mete abajo. */}
      {verZonas && (
        <div className={`absolute bottom-14 left-3 z-[650] w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 ${verFiltros ? "top-[19rem]" : "top-32"}`}>
          <MapaZonasPanel
            trazos={trazos}
            filtros={filtros}
            onBorrarTrazo={(id) => setTrazos((t) => t.filter((x) => x.id !== id))}
            onLimpiarTrazos={() => setTrazos([])}
            onAplicarZona={aplicarZona}
          />
        </div>
      )}

      {/* ── Resultados (o el ranking de precios): flota a la derecha ──
          Arranca en top-16 para no taparle los botones del lápiz y de los precios. */}
      {verLista && (
        <div className="absolute bottom-14 right-3 top-16 z-[650] w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          {verPrecios ? (
            <MapaPanelPrecios
              barrios={barriosPrecio}
              tramos={tramosPrecio}
              moneda={filtros.moneda}
              unidad={unidadPrecio}
              cargando={cargandoPrecios}
            />
          ) : (
            <MapaResultados propiedades={visibles} onAbrir={setFichaId} />
          )}
        </div>
      )}

      {/* ── El lápiz ── */}
      <button
        onClick={() => setLapizActivo((v) => !v)}
        title={lapizActivo ? "Salir del lápiz" : "Dibujar una zona a mano alzada"}
        className={`absolute right-3 top-3 z-[700] flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors ${
          lapizActivo ? "bg-sky-600 text-white" : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        }`}
      >
        <Pencil className="h-4 w-4" />
      </button>

      <button
        onClick={() => setVerPrecios((v) => !v)}
        title={verPrecios ? "Ocultar el precio por m²" : "Ver el precio por m² por manzana"}
        className={`absolute right-16 top-3 z-[700] flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors ${
          verPrecios ? "bg-emerald-600 text-white" : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        }`}
      >
        <DollarSign className="h-4 w-4" />
      </button>

      {lapizActivo && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[700] -translate-x-1/2 rounded-lg bg-sky-600/95 px-3 py-1.5 text-xs font-medium text-white shadow">
          Dibujá la zona sin soltar. Podés hacer varios trazos: se suman.
        </div>
      )}

      {trazoVacio && (
        <div className="absolute left-1/2 top-14 z-[700] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-zinc-900/95 px-3 py-1.5 text-xs text-white shadow">
          Ninguna propiedad en esta zona.
          <button className="underline" onClick={() => setTrazos([])}>borrar el trazo</button>
        </div>
      )}

      {/* Contador. Sale del MISMO estado que la lista, para que no puedan discrepar. */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[600] rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium shadow dark:bg-zinc-900/90">
        {cargando ? (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" /> buscando…
          </span>
        ) : (
          <>
            {/* El "+" no es decorativo: pasado el tope, este numero es el del tope, no el
                de la zona. Sin el signo el mapa afirma que hay 1.000 cuando puede haber
                40.000. El aviso va PEGADO al numero y no en un cartel aparte: centrado
                abajo se montaba justo encima de este contador. */}
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
        <div className="pointer-events-none absolute bottom-3 right-3 z-[600] rounded-lg bg-zinc-900/80 px-2.5 py-1 text-[10px] text-white shadow">
          Fondo: OpenStreetMap
        </div>
      )}

      {/* ── Varias propiedades en el mismo punto: se listan todas, no se elige una ── */}
      {grupoAbierto && (
        <MapaListaModal
          propiedades={grupoAbierto.propiedades}
          titulo="propiedades en esta ubicación"
          aviso={
            grupoAbierto.posibles_repetidas.length > 0 ? (
              <p className="shrink-0 border-b border-zinc-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800 dark:border-zinc-800 dark:bg-amber-950/40 dark:text-amber-300">
                Ojo: {grupoAbierto.posibles_repetidas.length}{" "}
                {grupoAbierto.posibles_repetidas.length === 1 ? "aviso parece estar" : "avisos parecen estar"}{" "}
                publicado por más de una inmobiliaria. No se ocultó ninguno.
              </p>
            ) : undefined
          }
          onAbrir={(id) => { setGrupoAbierto(null); setFichaId(id) }}
          onCerrar={() => setGrupoAbierto(null)}
        />
      )}

      {/* ── Click en un globito: todas las propiedades que tenia adentro ── */}
      {cumuloAbierto && (
        <MapaListaModal
          propiedades={cumuloAbierto}
          titulo="propiedades en esta zona"
          onAbrir={(id) => { setCumuloAbierto(null); setFichaId(id) }}
          onCerrar={() => setCumuloAbierto(null)}
        />
      )}

      {fichaId && <MapaFicha id={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  )
}
