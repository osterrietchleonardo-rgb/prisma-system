"use client"

// Mapa · la cajita para buscar un lugar.
//
// Sugiere mientras se tipea, mezclando lo propio con lo de afuera:
//   zonas guardadas · barrios de tu cartera · barrios de la red · direcciones
//
// Las tres primeras salen de /api/mapa/lugares. Las direcciones las pide ESTE
// componente, desde el navegador, contra MapTiler: la clave exige la cabecera Origin y
// el servidor no la manda, asi que pedirlas desde el backend devuelve 403 (verificado el
// 2026-08-10). Por eso son dos pedidos y no uno.
//
// Los dos pedidos se pintan por separado a medida que llegan: el de barrios tarda ~8 ms
// y el de direcciones sale a internet. Esperar a los dos haria que la lista aparezca
// tarde por culpa del mas lento.
import { useCallback, useEffect, useRef, useState } from "react"
import { Building2, Loader2, MapPin, Navigation, Search, Star, X } from "lucide-react"
import { recuadroDePunto, type Lugar, type TipoLugar } from "@/lib/mapa/lugares"

const ESPERA_MS = 250
const MINIMO = 2

const ICONO: Record<TipoLugar, typeof MapPin> = {
  zona: Star,
  cartera: Building2,
  barrio: MapPin,
  direccion: Navigation,
}

const COLOR: Record<TipoLugar, string> = {
  zona: "text-amber-500",
  cartera: "text-amber-600",
  barrio: "text-sky-600",
  direccion: "text-zinc-400",
}

/** Direcciones de MapTiler. Devuelve [] ante cualquier problema: es un extra, no el plato. */
async function buscarDirecciones(q: string, senal: AbortSignal): Promise<Lugar[]> {
  const clave = process.env.NEXT_PUBLIC_MAPTILER_KEY
  if (!clave) return []

  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json` +
    `?key=${clave}&country=ar&limit=4&autocomplete=true`

  try {
    const r = await fetch(url, { signal: senal })
    if (!r.ok) return []
    const d = await r.json()

    return (d.features || []).flatMap((f: any): Lugar[] => {
      const [lng, lat] = f.center || []
      if (typeof lat !== "number" || typeof lng !== "number") return []
      // MapTiler manda el recuadro como [oeste, sur, este, norte] cuando el lugar tiene
      // extension (un barrio, una ciudad). Un domicilio puntual no lo trae.
      const b = Array.isArray(f.bbox) && f.bbox.length === 4 ? f.bbox : null
      return [{
        id: `dir:${f.id ?? f.place_name}`,
        tipo: "direccion",
        nombre: f.text || f.place_name,
        detalle: f.place_name || "",
        bbox: b
          ? { oeste: b[0], sur: b[1], este: b[2], norte: b[3] }
          : recuadroDePunto(lat, lng),
      }]
    })
  } catch {
    return []
  }
}

export function MapaBuscador({ onElegir }: { onElegir: (l: Lugar) => void }) {
  const [texto, setTexto] = useState("")
  const [propios, setPropios] = useState<Lugar[]>([])
  const [direcciones, setDirecciones] = useState<Lugar[]>([])
  const [buscando, setBuscando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)

  const caja = useRef<HTMLDivElement>(null)
  const enVuelo = useRef<AbortController | null>(null)

  const lista = [...propios, ...direcciones]

  useEffect(() => {
    const q = texto.trim()
    if (q.length < MINIMO) {
      enVuelo.current?.abort()
      setPropios([])
      setDirecciones([])
      setBuscando(false)
      return
    }

    setBuscando(true)
    const reloj = setTimeout(() => {
      enVuelo.current?.abort()
      const ctrl = new AbortController()
      enVuelo.current = ctrl

      const barrios = fetch(`/api/mapa/lugares?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { lugares: [] }))
        .then((d) => { if (!ctrl.signal.aborted) setPropios(d.lugares || []) })
        .catch(() => {})

      const dir = buscarDirecciones(q, ctrl.signal)
        .then((ds) => { if (!ctrl.signal.aborted) setDirecciones(ds) })

      // El cartelito de "buscando" se apaga con el ultimo, pero cada lista ya se pinto.
      Promise.all([barrios, dir]).finally(() => {
        if (!ctrl.signal.aborted) setBuscando(false)
      })
    }, ESPERA_MS)

    return () => clearTimeout(reloj)
  }, [texto])

  // Al cambiar los resultados, el resaltado vuelve arriba: si no, Enter elige una fila
  // que ya no es la que el usuario esta mirando.
  useEffect(() => setResaltado(0), [texto])

  useEffect(() => {
    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", afuera)
    return () => document.removeEventListener("mousedown", afuera)
  }, [])

  const elegir = useCallback(
    (l: Lugar) => {
      onElegir(l)
      setTexto(l.nombre)
      setAbierto(false)
    },
    [onElegir],
  )

  const limpiar = () => {
    setTexto("")
    setPropios([])
    setDirecciones([])
    setAbierto(false)
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setAbierto(false)
    if (!lista.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setResaltado((i) => (i + 1) % lista.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setResaltado((i) => (i - 1 + lista.length) % lista.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const l = lista[resaltado]
      if (l) elegir(l)
    }
  }

  const hayQueMostrar = abierto && texto.trim().length >= MINIMO

  return (
    <div ref={caja} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
          placeholder="Buscar un barrio, una zona guardada o una dirección…"
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-sky-500 dark:border-zinc-800 dark:bg-zinc-900"
        />
        {buscando ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
        ) : texto ? (
          <button
            onClick={limpiar}
            title="Borrar"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {hayQueMostrar && (
        <div className="absolute left-0 right-0 top-full z-[900] mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          {lista.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-500">
              {buscando ? "Buscando…" : "No encontramos ese lugar."}
            </p>
          ) : (
            lista.map((l, i) => {
              const Icono = ICONO[l.tipo]
              return (
                <button
                  key={l.id}
                  onMouseEnter={() => setResaltado(i)}
                  onClick={() => elegir(l)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    i === resaltado ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  <Icono className={`h-4 w-4 shrink-0 ${COLOR[l.tipo]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.nombre}</span>
                    <span className="block truncate text-xs text-zinc-500">{l.detalle}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
