"use client"

// La selección de propiedades que el asesor está armando para un cliente.
//
// Se monta UNA sola vez por página, ARRIBA de la barra de solapas del Buscador, y por eso
// la selección cruza las solapas "Buscador" y "Mapa" (que son la misma página: ver
// app/asesor/consultor-ia/page.tsx). Al salir de la página el provider se desmonta y la
// selección se vacía sola, que es lo que se quiere: es de un solo uso.
//
// useSeleccion() devuelve null si no hay provider arriba. No es un descuido: los
// componentes que lo consumen (UnifiedPropertyCard, UnifiedPropertyDetail, MapaResultados)
// son compartidos, y en una pantalla sin provider el check simplemente no se dibuja.
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  alternar as alternarPuro,
  anotar as anotarPuro,
  estaElegida,
  sacar as sacarPuro,
  type Candidata,
  type ItemSeleccion,
} from "@/lib/seleccion/estado"

export interface ValorSeleccion {
  items: ItemSeleccion[]
  elegida: (id: string) => boolean
  alternar: (c: Candidata) => void
  sacar: (id: string) => void
  anotar: (id: string, nota: string) => void
  vaciar: () => void
}

const Ctx = createContext<ValorSeleccion | null>(null)

export function SeleccionProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ItemSeleccion[]>([])

  const alternar = useCallback((c: Candidata) => {
    setItems((previos) => {
      const r = alternarPuro(previos, c)
      if (r.error) toast.error(r.error)
      return r.items
    })
  }, [])

  const sacar = useCallback((id: string) => setItems((p) => sacarPuro(p, id)), [])
  const anotar = useCallback((id: string, nota: string) => setItems((p) => anotarPuro(p, id, nota)), [])
  const vaciar = useCallback(() => setItems([]), [])

  const valor = useMemo<ValorSeleccion>(
    () => ({ items, elegida: (id) => estaElegida(items, id), alternar, sacar, anotar, vaciar }),
    [items, alternar, sacar, anotar, vaciar],
  )

  /**
   * EL ESPACIO PARA LA BARRA LO RESERVA ESTE MARCO, no cada lista.
   *
   * La barra flotante es `fixed bottom-5` y mide ~70px de alto. Medido en el navegador con
   * la ventana angosta: con una propiedad marcada se sentaba ENCIMA del campo donde el
   * asesor escribe la búsqueda (campo 636-684, barra 642-712) — o sea que marcar una
   * propiedad lo dejaba sin poder tipear. Y en el mapa tapaba la última fila de la lista.
   *
   * Reservar el espacio acá arriba lo arregla para las dos solapas de una: como Tailwind
   * usa `box-sizing: border-box`, el `h-full` del hijo pasa a resolverse contra el alto de
   * este marco MENOS el padding, así que todo el contenido se achica y la barra queda en su
   * propia franja. Sin padding cuando no hay nada elegido: la barra tampoco está.
   */
  return (
    <Ctx.Provider value={valor}>
      <div className={`flex h-full flex-col ${items.length > 0 ? "pb-24" : ""}`}>{children}</div>
    </Ctx.Provider>
  )
}

export function useSeleccion(): ValorSeleccion | null {
  return useContext(Ctx)
}
