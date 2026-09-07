"use client"

// Las dos formas de marcar una propiedad: el check de los listados y el botón del detalle.
// Las dos leen del mismo contexto, así que lo marcado en un lado se ve marcado en el otro.
//
// Si no hay provider arriba, las dos devuelven null: los componentes que las usan son
// compartidos y no toda pantalla arma selecciones.
import { Check } from "lucide-react"
import { useSeleccion } from "./seleccion-contexto"
import type { Candidata } from "@/lib/seleccion/estado"

export function candidataDePropiedad(p: {
  id: string
  source: "own" | "agency" | "roomix"
  title: string | null
  price: number
  currency: string
  images?: string[]
}): Candidata {
  return {
    id: p.id,
    source: p.source,
    titulo: p.title || "Propiedad",
    precio: p.price || 0,
    moneda: p.currency || "USD",
    foto: p.images?.[0] || null,
  }
}

/**
 * El check de los listados.
 *
 * El área tocable mide 44px aunque el dibujo mida 24: en el celular, un blanco de 24px se
 * falla más de lo que se acierta. Y frena la propagación porque el contenedor de la fila
 * abre el detalle al clickearlo — sin eso, marcar abriría la propiedad.
 */
export function CheckSeleccion({ candidata }: { candidata: Candidata }) {
  const seleccion = useSeleccion()
  if (!seleccion) return null

  const elegida = seleccion.elegida(candidata.id)

  return (
    <button
      type="button"
      aria-label={elegida ? "Sacar de la selección" : "Agregar a la selección"}
      aria-pressed={elegida}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        seleccion.alternar(candidata)
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-sm transition-colors ${
          elegida
            ? "border-accent bg-accent text-accent-foreground"
            : "border-zinc-300 bg-white/90 dark:border-zinc-500 dark:bg-zinc-800/90"
        }`}
      >
        {elegida && <Check className="h-4 w-4" strokeWidth={3} />}
      </span>
    </button>
  )
}

/** El botón del detalle abierto. */
export function BotonSeleccion({ candidata }: { candidata: Candidata }) {
  const seleccion = useSeleccion()
  if (!seleccion) return null

  const elegida = seleccion.elegida(candidata.id)

  return (
    <button
      type="button"
      onClick={() => seleccion.alternar(candidata)}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${
        elegida
          ? "border border-accent/40 bg-accent/10 text-accent"
          : "bg-accent text-accent-foreground hover:bg-accent/90"
      }`}
    >
      <Check className="h-4 w-4" strokeWidth={3} />
      {elegida ? "Sacar de la selección" : "Agregar a la selección"}
    </button>
  )
}
