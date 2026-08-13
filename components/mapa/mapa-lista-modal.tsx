"use client"

// Mapa · la ventana que lista propiedades: la del globito y la de un punto con varias.
//
// Las dos tenian el mismo defecto: la lista no scrolleaba, quedaba recortada.
//
// El primer intento fue armar bien la cadena de flex (`flex flex-col` + `min-h-0 flex-1`)
// y dejar que scrolleara el ScrollArea de la lista. NO ALCANZO: ese componente es
// `overflow-hidden` con un visor de `h-full`, y `h-full` es un porcentaje que necesita
// que el padre tenga una altura RESUELTA. Adentro de una ventana que se mide por
// `max-h-[80vh]` eso no pasa de forma confiable, asi que el visor quedaba en cero y el
// overflow-hidden recortaba sin barra.
//
// Ahora el scroll lo pone esta ventana, con alto explicito y overflow propio, y la lista
// se dibuja sin su ScrollArea (`desplazable={false}`). Un div con max-height y
// overflow-y-auto scrollea siempre, sin depender de ninguna cadena.
import { useMemo, useState } from "react"
import { MapPin, Search, X } from "lucide-react"
import { MapaResultados } from "./mapa-resultados"
import { buscarEnPropiedades } from "@/lib/mapa/buscar-propiedades"
import type { PropiedadMapa } from "@/lib/mapa/tipos"

// Con pocas propiedades la cajita estorba mas de lo que ayuda.
const DESDE_CUANTAS_BUSCAR = 8

export function MapaListaModal({
  propiedades,
  titulo,
  aviso,
  onAbrir,
  onCerrar,
}: {
  propiedades: PropiedadMapa[]
  titulo: string
  /** Linea de advertencia opcional (ej: avisos publicados por varias inmobiliarias). */
  aviso?: React.ReactNode
  onAbrir: (id: string) => void
  onCerrar: () => void
}) {
  const [consulta, setConsulta] = useState("")

  const filtradas = useMemo(
    () => buscarEnPropiedades(propiedades, consulta),
    [propiedades, consulta],
  )

  const hayBuscador = propiedades.length >= DESDE_CUANTAS_BUSCAR

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4" />
            {/* Con el buscador puesto se muestran las dos cifras: si solo se viera la
                filtrada, parece que se perdieron propiedades. */}
            {consulta.trim() && filtradas.length !== propiedades.length
              ? `${filtradas.length} de ${propiedades.length} — ${titulo}`
              : `${propiedades.length} ${titulo}`}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>

        {aviso}

        {hayBuscador && (
          <div className="relative shrink-0 border-b border-zinc-200 p-2 dark:border-zinc-800">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              autoFocus
              placeholder="Filtrar por calle, tipo, precio, inmobiliaria…"
              className="w-full rounded-lg border border-zinc-200 bg-transparent py-1.5 pl-8 pr-8 text-xs outline-none focus:border-sky-500 dark:border-zinc-800"
            />
            {consulta && (
              <button
                onClick={() => setConsulta("")}
                aria-label="Borrar el filtro"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* El scroll va ACA, con un alto explicito y overflow propio. No se delega en el
            ScrollArea de la lista: ese es `overflow-hidden` y necesita que le baje una
            altura real por la cadena de padres, cosa que adentro de una ventana flotante
            no pasa. El resultado era una lista recortada que no scrolleaba.
            overscroll-contain evita que al llegar al final se empiece a mover el mapa. */}
        <div className="max-h-[60vh] min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filtradas.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              Ninguna coincide con “{consulta.trim()}”.
            </p>
          ) : (
            <MapaResultados propiedades={filtradas} onAbrir={onAbrir} desplazable={false} />
          )}
        </div>
      </div>
    </div>
  )
}
