"use client"

import { IconoOrden } from "@/components/dashboard/orden-tabla"
import type { OrdenTabla } from "@/hooks/use-orden-tabla"
import { cn } from "@/lib/utils"

/**
 * Encabezado de columna ordenable de las tablas de Leads Comerciales: todo el encabezado es un
 * botón de 44 px de alto (se toca bien con el dedo). Un toque ordena de menor a mayor, el segundo
 * de mayor a menor y el tercero vuelve al orden original (useOrdenTabla).
 */
export function EncabezadoOrdenable<K extends string>({
  clave,
  etiqueta,
  orden,
  onOrdenar,
  fija = false,
}: {
  clave: K
  etiqueta: string
  orden: OrdenTabla<K> | null
  onOrdenar: (clave: K) => void
  /** Primera columna: queda fija al deslizar la tabla de costado. */
  fija?: boolean
}) {
  const activo = orden?.clave === clave
  return (
    <th
      scope="col"
      aria-sort={activo ? (orden!.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "px-2 py-1 font-bold",
        fija && "sticky left-0 z-20 min-w-[150px] border-r border-accent/10 bg-muted/95 backdrop-blur-md"
      )}
    >
      <button
        type="button"
        onClick={() => onOrdenar(clave)}
        className={cn(
          "flex min-h-11 w-full items-center gap-1 text-[11px] leading-tight transition-colors hover:text-accent",
          fija ? "justify-start text-left" : "justify-center text-center"
        )}
      >
        <span>{etiqueta}</span>
        <IconoOrden activo={activo} dir={orden?.dir} />
      </button>
    </th>
  )
}
