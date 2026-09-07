"use client"

// La línea que explica para qué sirven los checks.
//
// Va debajo de la barra de solapas y NO adentro del encabezado "Buscador IA": ese
// encabezado vive solo en la solapa del chat, y la selección funciona también en el mapa.
// Acá se ve en las dos.
//
// Desaparece en cuanto hay algo elegido: ahí ya entendió, y la barra flotante de abajo pasa
// a ser la que guía.
import { MousePointerClick } from "lucide-react"
import { useSeleccion } from "./seleccion-contexto"

export function PistaSeleccion() {
  const seleccion = useSeleccion()
  if (!seleccion || seleccion.items.length > 0) return null

  return (
    <div className="flex items-start gap-2 border-b bg-accent/5 px-4 py-2 text-xs text-muted-foreground">
      <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <p>
        <span className="font-semibold text-foreground">
          Elegí las propiedades que creas mejor opción para tu cliente y armá una ficha compartible al instante.
        </span>{" "}
        Marcalas con el check de la esquina de la tarjeta, o desde adentro del detalle.
      </p>
    </div>
  )
}
