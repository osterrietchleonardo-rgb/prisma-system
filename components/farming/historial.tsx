"use client"

// Farming · el historial de UNA tarjeta: todo lo que se caminó en esa puerta.
//
// Cada fila de `farming_contactos` es un movimiento real y FIRMADO: qué se hizo, de qué columna
// a cuál pasó, quién y cuándo. En una zona compartida es la única forma de saber si la carta 2
// ya la dejó un colega el martes — sin esto, dos asesores golpean la misma puerta.
//
// El nombre lo arma el servidor (`quien`): acá nunca se dibuja un uuid.
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { pedir } from "@/lib/farming/cliente"
import { etiquetaDe, type EtapaDireccion } from "@/lib/farming/direcciones"
import { TIPOS_CONTACTO } from "@/lib/farming/tablero"
import { fechaCorta } from "@/lib/farming/fechas"
import type { FilaDireccion } from "@/lib/farming/tipos"

/** Una fila del historial tal como la devuelve `/api/farming/direcciones/[id]/contactos`:
 *  la fila entera de `farming_contactos` más `quien`, que el servidor resuelve contra
 *  `profiles` para que nunca viaje un uuid a la pantalla. */
interface FilaContacto {
  id: string
  fecha: string
  tipo: string
  cartas_entregadas: number | null
  etapa_desde: string | null
  etapa_hasta: string | null
  nota: string | null
  quien: string
  created_at: string
}

const etiquetaTipo = (t: string) => TIPOS_CONTACTO.find((x) => x.clave === t)?.etiqueta ?? t

/** El nombre de una etapa que viene como string suelto de la base. Si mañana aparece un valor
 *  que la pantalla no conoce, se muestra tal cual antes que esconder la fila. */
const etiquetaEtapa = (e: string | null) => (e ? etiquetaDe(e as EtapaDireccion) : null)

export function Historial({
  direccion,
  onCerrar,
}: {
  /** null = cerrado. La tarjeta entera: el título dice de qué puerta es este historial. */
  direccion: FilaDireccion | null
  onCerrar: () => void
}) {
  const [filas, setFilas] = useState<FilaContacto[]>([])
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  // Cuenta las cargas: si se cierra esta tarjeta y se abre otra con el GET todavía en vuelo, el
  // historial viejo no puede pintarse bajo el título de la puerta nueva. Mismo patrón que
  // «Personas» y «A la venta en mi zona».
  const gen = useRef(0)

  const traer = useCallback(async (id: string) => {
    const mio = ++gen.current
    setCargando(true)
    setFallo(null)
    try {
      const d = await pedir(`/api/farming/direcciones/${id}/contactos`)
      if (gen.current !== mio) return
      setFilas(d.contactos || [])
    } catch (e: any) {
      if (gen.current !== mio) return
      toast.error(e.message)
      setFilas([])
      // Queda dicho EN PANTALLA y no solo en un toast que se va solo: si no, el diálogo se ve
      // igual que una puerta sin historial, que es justo lo contrario de lo que pasó.
      setFallo(e.message)
    } finally {
      if (gen.current !== mio) return
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    setFilas([])
    setFallo(null)
    if (!direccion) {
      gen.current++ // lo que esté en vuelo ya no aplica
      return
    }
    traer(direccion.id)
  }, [direccion, traer])

  return (
    <Dialog open={!!direccion} onOpenChange={(a) => { if (!a) onCerrar() }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de {direccion?.calle} {direccion?.altura ?? ""}</DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : fallo ? (
          <p className="text-sm text-muted-foreground">{fallo}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay nada anotado en esta puerta. Cada vez que la muevas de columna, el
            movimiento queda acá.
          </p>
        ) : (
          <ul className="space-y-2">
            {filas.map((f) => {
              const desde = etiquetaEtapa(f.etapa_desde)
              const hasta = etiquetaEtapa(f.etapa_hasta)
              return (
                <li key={f.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="font-medium">
                      {etiquetaTipo(f.tipo)}
                      {f.cartas_entregadas != null
                        ? ` · ${f.cartas_entregadas} ${f.cartas_entregadas === 1 ? "carta" : "cartas"}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{fechaCorta(f.fecha)}</p>
                  </div>

                  {/* De qué columna a cuál. Cuando no cambió de columna igual se dice: «pasé
                      otra carta» sin moverse también es trabajo caminado. */}
                  {hasta && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {desde && desde !== hasta ? (
                        <>
                          {desde} <ArrowRight className="h-3 w-3 shrink-0" /> {hasta}
                        </>
                      ) : (
                        <>Quedó en {hasta}</>
                      )}
                    </p>
                  )}

                  {/* Quién, SIEMPRE y como línea visible: en una zona compartida es la mitad del
                      dato. El servidor ya lo manda con nombre, nunca un uuid. */}
                  <p className="mt-0.5 text-xs text-muted-foreground">Lo anotó {f.quien}</p>

                  {f.nota && <p className="mt-1 text-xs">{f.nota}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
