"use client"

import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw } from "lucide-react"
import type { DireccionOrden } from "@/hooks/use-orden-tabla"

/** Flechita de una columna ordenable: tenue si no ordena, color de acento y con sentido si ordena. */
export function IconoOrden({ activo, dir }: { activo: boolean; dir?: DireccionOrden }) {
  if (!activo) return <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
  return dir === "asc"
    ? <ArrowUp className="h-3 w-3 shrink-0 text-accent" aria-hidden />
    : <ArrowDown className="h-3 w-3 shrink-0 text-accent" aria-hidden />
}

/**
 * Línea visible arriba de la tabla: cómo está ordenada y el botón para volver al orden
 * original. Va a la vista y no en un globito, porque en el celular el globito no se abre.
 */
export function AvisoOrden({
  etiqueta,
  dir,
  esTexto = false,
  onRestablecer,
}: {
  etiqueta: string | null
  dir?: DireccionOrden
  esTexto?: boolean
  onRestablecer: () => void
}) {
  if (!etiqueta) {
    return <p className="text-[11px] text-muted-foreground">Tocá el nombre de una columna para ordenar la tabla.</p>
  }
  const sentido = esTexto
    ? dir === "asc" ? "de la A a la Z" : "de la Z a la A"
    : dir === "asc" ? "de menor a mayor" : "de mayor a menor"
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span>
        Ordenado por <span className="font-semibold text-foreground">{etiqueta}</span>, {sentido}.
      </span>
      <button
        type="button"
        onClick={onRestablecer}
        className="inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 rounded-lg border border-accent/30 px-3 font-semibold text-accent transition-colors hover:bg-accent/10"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
        Orden original
      </button>
    </div>
  )
}
