"use client"

// El mapa en si. Este archivo SOLO se puede cargar con dynamic(..., { ssr: false }):
// Leaflet toca `window` al importarse y tira el build si corre en el servidor.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import MarkerClusterGroup from "react-leaflet-cluster"
import L from "leaflet"

import "leaflet/dist/leaflet.css"
// El envoltorio de React trae su propia copia, pero se dejan explicitas: son las que
// dan las animaciones al abrir y cerrar los globitos.
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"

import { MapaLapiz, TrazosDibujados, type Trazo } from "./mapa-lapiz"
import type { BBox, FuenteMapa, GrupoUbicacion } from "@/lib/mapa/tipos"

/** Centro por defecto: CABA. Se puede navegar a cualquier lado (hay 3 propiedades en Florida). */
const CENTRO: [number, number] = [-34.6037, -58.4]
const ZOOM = 13

/** Cuanto se espera despues de que el usuario suelta el mapa, antes de consultar. */
const ESPERA_MS = 400

const COLOR: Record<FuenteMapa, string> = {
  own: "#f59e0b",    // dorado — las asignadas al usuario
  agency: "#52525b", // gris   — el resto de la cartera
  roomix: "#2563eb", // azul   — red de colaboracion
}

// ─────────────────────────────── el fondo ───────────────────────────────

/**
 * Fondo del mapa.
 *
 * OpenStreetMap es el que anda SIEMPRE, sin clave y sin cuenta: es el que se usa por
 * defecto para que el mapa nunca aparezca en gris. MapTiler (mas lindo, con los nombres
 * de calles mejor puestos) se usa solo si hay clave Y esa clave contesta.
 *
 * POR QUE NO ALCANZA CON ESCUCHAR EL ERROR DE LA BALDOSA
 * Cuando la clave no sirve, MapTiler NO devuelve un error que el navegador pueda ver:
 * devuelve un 403 con una imagen PNG valida adentro, un papel tapiz que dice
 * "Invalid key / Get a valid key at www.maptiler.com". El navegador la carga contenta,
 * asi que el evento `tileerror` de Leaflet nunca se dispara y el mapa se queda
 * tapizado para siempre. Medido el 2026-08-10 sobre la baldosa de Buenos Aires:
 *
 *   clave buena -> HTTP 200, 117.379 bytes (mapa de verdad)
 *   clave mala  -> HTTP 403,  10.260 bytes (el cartel "Invalid key")
 *
 * Por eso se le pregunta por el ESTADO HTTP con fetch, que si distingue 200 de 403
 * (MapTiler responde con Access-Control-Allow-Origin: * en ambos casos, asi que el
 * navegador puede leerlo). Ojo: fetch lo gobierna `connect-src` de la politica de
 * contenido, no `img-src`; los dos tienen que permitir api.maptiler.com.
 *
 * Se arranca mostrando MapTiler y se baja a OpenStreetMap solo si la prueba falla:
 * asi el caso normal no parpadea, y el caso roto se corrige en un par de decimas.
 *
 * Antecedente: el 2026-08-06 la clave devolvia 403 porque en MapTiler el origen
 * permitido era `vakdor.com` a secas, que no cubre subdominios. Se corrigio a
 * `*.vakdor.com` + `localhost` el 2026-08-10.
 */
const OSM = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

/** El planeta entero en 256px: la baldosa mas barata que hay para probar la clave. */
const baldosaDePrueba = (clave: string) =>
  `https://api.maptiler.com/maps/streets-v2/1/0/0.png?key=${clave}`

function FondoDelMapa({ onProveedor }: { onProveedor: (p: "maptiler" | "osm") => void }) {
  const clave = process.env.NEXT_PUBLIC_MAPTILER_KEY
  const [maptilerRoto, setMaptilerRoto] = useState(false)
  const usaMaptiler = Boolean(clave) && !maptilerRoto

  useEffect(() => {
    if (!clave) return
    let vivo = true
    const caer = () => {
      if (vivo) setMaptilerRoto(true)
    }
    fetch(baldosaDePrueba(clave))
      .then((r) => {
        if (!r.ok) caer()
      })
      // Sin red, con la politica de contenido bloqueando, o con MapTiler caido:
      // en todos esos casos OpenStreetMap es mejor que un fondo dudoso.
      .catch(caer)
    return () => {
      vivo = false
    }
  }, [clave])

  useEffect(() => {
    onProveedor(usaMaptiler ? "maptiler" : "osm")
  }, [usaMaptiler, onProveedor])

  if (usaMaptiler) {
    return (
      <TileLayer
        // Red de seguridad secundaria: esto si atrapa las caidas de red de verdad
        // (DNS, timeout), donde no llega a haber ninguna imagen.
        eventHandlers={{ tileerror: () => setMaptilerRoto(true) }}
        url={`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${clave}`}
        attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
    )
  }

  return <TileLayer url={OSM.url} attribution={OSM.attribution} />
}

// ─────────────────────────────── los pines ───────────────────────────────

/**
 * Pin dibujado por CSS en vez de una imagen. Ademas de que asi se colorea por fuente,
 * evita el bug clasico de Leaflet con bundlers, donde los iconos del paquete salen rotos
 * porque la ruta de la imagen no sobrevive al empaquetado.
 */
function pin(fuente: FuenteMapa, cuantas: number) {
  const d = cuantas > 1 ? 30 : 20
  const contenido =
    cuantas > 1
      ? `<span style="color:#fff;font-size:11px;font-weight:700;line-height:${d}px">${cuantas}</span>`
      : ""
  return L.divIcon({
    className: "",
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    html: `<div style="width:${d}px;height:${d}px;border-radius:50%;background:${COLOR[fuente]};
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);text-align:center">${contenido}</div>`,
  })
}

/**
 * Globito de un grupo de puntos cercanos.
 *
 * Se dibuja a mano por dos razones. La primera, que el de la libreria pinta verde /
 * amarillo / rojo segun cuantas propiedades hay adentro, y ese semaforo se leia como si
 * el color dijera algo de las propiedades (baratas, caras, disponibles) cuando en
 * realidad solo cuenta cuantas son. La segunda, que eran enormes: a la altura de una
 * ciudad entera el mapa quedaba tapado de circulos y no se veia nada abajo.
 *
 * Aca el color dice lo mismo que en los pines sueltos —de donde salen las propiedades—
 * y el tamaño dice cuantas hay. Se usa la misma prioridad que un pin: si adentro hay
 * aunque sea una tuya, el globito va dorado, para que no se te pierda entre las ajenas.
 */
function armarIconoDeGrupo(buscarFuente: (lat: number, lng: number) => FuenteMapa | undefined) {
  return (cluster: L.MarkerCluster) => {
    const n = cluster.getChildCount()

    let fuente: FuenteMapa = "roomix"
    for (const marcador of cluster.getAllChildMarkers()) {
      const { lat, lng } = marcador.getLatLng()
      const f = buscarFuente(lat, lng)
      if (f === "own") { fuente = "own"; break }
      if (f === "agency") fuente = "agency"
    }

    const d = n < 10 ? 28 : n < 100 ? 34 : 40
    const texto = n > 999 ? "+999" : String(n)
    return L.divIcon({
      className: "",
      iconSize: [d, d],
      iconAnchor: [d / 2, d / 2],
      html: `<div style="width:${d}px;height:${d}px;border-radius:50%;
        background:${COLOR[fuente]}e6;border:2px solid rgba(255,255,255,.9);
        box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;
        justify-content:center;cursor:pointer">
          <span style="color:#fff;font-size:${n > 999 ? 10 : 12}px;font-weight:700">${texto}</span>
        </div>`,
    })
  }
}

function leerBBox(mapa: L.Map): BBox {
  const b = mapa.getBounds()
  return { sur: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), este: b.getEast() }
}

/** Avisa el rectangulo visible al cargar y cada vez que el usuario suelta el mapa. */
function Vigia({ onMover }: { onMover: (b: BBox) => void }) {
  const mapa = useMap()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const avisar = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onMover(leerBBox(mapa)), ESPERA_MS)
  }

  useMapEvents({ moveend: avisar, zoomend: avisar })

  useEffect(() => {
    onMover(leerBBox(mapa))
    return () => { if (timer.current) clearTimeout(timer.current) }
    // Solo al montar: despues lo maneja moveend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

/** Encuadra el mapa a un rectangulo cuando el usuario aplica una zona guardada o un trazo. */
function Encuadrar({ a }: { a: BBox | null }) {
  const mapa = useMap()
  useEffect(() => {
    if (!a) return
    mapa.fitBounds(
      [[a.sur, a.oeste], [a.norte, a.este]],
      { padding: [24, 24] },
    )
  }, [a, mapa])
  return null
}

// ─────────────────────────── volver a la vista anterior ───────────────────────────

interface Vista {
  centro: L.LatLng
  zoom: number
}

/**
 * Boton "Volver". Guarda las vistas por las que fue pasando el mapa para poder
 * deshacer un acercamiento, una zona aplicada o un salto a un grupo de puntos.
 *
 * No guarda TODOS los movimientos: arrastrar el mapa unas cuadras no cuenta como una
 * vista nueva. Solo se anota cuando cambia el zoom o cuando el centro se fue lo bastante
 * lejos como para que uno pueda perderse. Si no, la pila se llenaria de micro-pasos y
 * el boton no serviria para nada.
 */
function ControlVolver() {
  const mapa = useMap()
  const pila = useRef<Vista[]>([])
  const antes = useRef<Vista | null>(null)
  const volviendo = useRef(false)
  const [cuantas, setCuantas] = useState(0)

  useMapEvents({
    movestart: () => {
      if (!volviendo.current) antes.current = { centro: mapa.getCenter(), zoom: mapa.getZoom() }
    },
    moveend: () => {
      if (volviendo.current) {
        volviendo.current = false
        setCuantas(pila.current.length)
        return
      }
      const previa = antes.current
      antes.current = null
      if (!previa) return

      // "Se movio en serio" = cambio el zoom, o el centro viejo ya no entra en la mitad
      // interior de lo que se ve ahora.
      const cambioZoom = previa.zoom !== mapa.getZoom()
      const seFueLejos = !mapa.getBounds().pad(-0.25).contains(previa.centro)
      if (!cambioZoom && !seFueLejos) return

      pila.current.push(previa)
      // Techo: es un "deshacer", no un historial completo.
      if (pila.current.length > 20) pila.current.shift()
      setCuantas(pila.current.length)
    },
  })

  const volver = () => {
    const previa = pila.current.pop()
    if (!previa) return
    volviendo.current = true
    setCuantas(pila.current.length)
    mapa.setView(previa.centro, previa.zoom)
  }

  // El boton vive DENTRO del mapa, asi que hay que cortarle los eventos a mano: si no,
  // el click le llega tambien a Leaflet y el mapa se arrastra o se acerca abajo del dedo.
  const cortarEventos = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return
    L.DomEvent.disableClickPropagation(el)
    L.DomEvent.disableScrollPropagation(el)
  }, [])

  if (cuantas === 0) return null

  return (
    <button
      ref={cortarEventos}
      onClick={volver}
      title="Volver a la vista anterior"
      // Debajo del +/- de Leaflet, que ocupa la esquina de arriba a la izquierda: antes
      // se le montaba encima y tapaba el boton de alejar.
      // z-800: por encima de las capas de Leaflet, que llegan hasta 700 (los globos).
      className="absolute left-3 top-[5.25rem] z-[800] flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-lg transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
        <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Volver
    </button>
  )
}

// ─────────────────────────────── el lienzo ───────────────────────────────

export interface MapaLienzoProps {
  grupos: GrupoUbicacion[]
  onMover: (b: BBox) => void
  onAbrirGrupo: (g: GrupoUbicacion) => void
  /** Click en un globito: se abre la lista de TODO lo que tiene adentro. */
  onAbrirCumulo: (gs: GrupoUbicacion[]) => void
  /** Que fondo quedo puesto, para poder avisarlo en pantalla. */
  onProveedor: (p: "maptiler" | "osm") => void
  /** Cuando llega un rectangulo nuevo, el mapa se acomoda a el. */
  encuadrarA?: BBox | null
  lapizActivo?: boolean
  trazos?: Trazo[]
  onTrazo?: (t: Trazo) => void
  /** Se monta dentro del MapContainer: ahi adentro `useMap()` tiene el mapa. */
  children?: React.ReactNode
}

export default function MapaLienzo({
  grupos,
  onMover,
  onAbrirGrupo,
  onAbrirCumulo,
  onProveedor,
  encuadrarA = null,
  lapizActivo = false,
  trazos = [],
  onTrazo,
  children,
}: MapaLienzoProps) {
  const marcadores = useMemo(
    () =>
      grupos.map((g) => (
        <Marker
          key={g.clave}
          position={[g.lat, g.lng]}
          icon={pin(g.fuente_del_pin, g.propiedades.length)}
          eventHandlers={{ click: () => onAbrirGrupo(g) }}
        />
      )),
    [grupos, onAbrirGrupo],
  )

  // Para ir del globito a las propiedades: cada marcador se reconoce por su coordenada,
  // que es exactamente la clave con la que se armaron los grupos.
  const porClave = useMemo(() => {
    const m = new Map<string, GrupoUbicacion>()
    for (const g of grupos) m.set(g.clave, g)
    return m
  }, [grupos])

  // El icono del globito se arma UNA sola vez: la libreria lo guarda al crear la capa y
  // no lo vuelve a leer. Por eso la busqueda va por un ref, que siempre apunta al mapa
  // de grupos vigente aunque cambien los filtros.
  const buscarPorClave = useRef(porClave)
  buscarPorClave.current = porClave

  const iconoDeGrupo = useMemo(
    () =>
      armarIconoDeGrupo((lat, lng) =>
        buscarPorClave.current.get(`${lat.toFixed(6)},${lng.toFixed(6)}`)?.fuente_del_pin,
      ),
    [],
  )

  const alClickearCumulo = useRef<(e: { layer: L.MarkerCluster }) => void>(() => {})
  alClickearCumulo.current = (e) => {
    const dentro: GrupoUbicacion[] = []
    for (const marcador of e.layer.getAllChildMarkers()) {
      const { lat, lng } = marcador.getLatLng()
      const g = porClave.get(`${lat.toFixed(6)},${lng.toFixed(6)}`)
      if (g) dentro.push(g)
    }
    if (dentro.length > 0) onAbrirCumulo(dentro)
  }

  // El evento se engancha a mano porque el envoltorio de React no expone `clusterclick`
  // (solo `onClick`, que es el de los marcadores sueltos). Se desengancha primero para
  // no acumular escuchas cuando React vuelve a pasar por aca.
  const grupoRef = useCallback((capa: L.MarkerClusterGroup | null) => {
    if (!capa) return
    capa.off("clusterclick")
    capa.on("clusterclick", (e: any) => alClickearCumulo.current(e))
  }, [])

  return (
    <MapContainer
      center={CENTRO}
      zoom={ZOOM}
      className="h-full w-full"
      // El fondo gris es el que se ve mientras cargan las baldosas.
      style={{ background: "#e4e4e7" }}
      preferCanvas
    >
      <FondoDelMapa onProveedor={onProveedor} />

      <Vigia onMover={onMover} />
      <Encuadrar a={encuadrarA} />
      <ControlVolver />

      <MarkerClusterGroup
        ref={grupoRef}
        chunkedLoading
        maxClusterRadius={45}
        showCoverageOnHover={false}
        // Los dos apagados a proposito. Antes, al apretar un globito, el mapa se acercaba
        // y desparramaba circulitos sueltos sin decir que era cada uno. Ahora el click
        // abre la lista de las propiedades que tiene adentro, que es lo que se busca.
        zoomToBoundsOnClick={false}
        spiderfyOnMaxZoom={false}
        iconCreateFunction={iconoDeGrupo}
      >
        {marcadores}
      </MarkerClusterGroup>

      <TrazosDibujados trazos={trazos} />
      {onTrazo && <MapaLapiz activo={lapizActivo} onTrazo={onTrazo} />}

      {children}
    </MapContainer>
  )
}
