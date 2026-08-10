"use client"

// Mapa · la ventana que lista propiedades: la del globito y la de un punto con varias.
//
// Las dos tenian el mismo defecto: la lista no scrolleaba. MapaResultados scrollea solo
// (tiene su ScrollArea con h-full), pero h-full necesita que el padre TENGA una altura,
// y estaba metido en un div de alto automatico. La cadena que hace falta es
// `flex flex-col` en la ventana + `min-h-0 flex-1` en el cuerpo: sin el min-h-0 un hijo
// flexible nunca se achica por debajo de su contenido y la lista desborda en vez de
// scrollear.
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

        {/* min-h-0 es lo que habilita el scroll: sin el, este hijo crece con la lista y
            la ventana desborda en vez de scrollear. */}
        <div className="min-h-0 flex-1">
          {filtradas.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              Ninguna coincide con “{consulta.trim()}”.
            </p>
          ) : (
            <MapaResultados propiedades={filtradas} onAbrir={onAbrir} />
          )}
        </div>
      </div>
    </div>
  )
}
