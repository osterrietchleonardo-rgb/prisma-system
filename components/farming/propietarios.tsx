"use client"

// Farming · las personas de UNA tarjeta.
//
// Un edificio de 32 unidades puede tener muchos propietarios conocidos, cada uno con su piso,
// su unidad y su teléfono: por eso son filas propias y no un texto suelto en la tarjeta.
//
// Lo único obligatorio es el nombre. El teléfono es un link `tel:`: el asesor está caminando y
// tiene que poder llamar desde acá sin copiar nada a mano.
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Phone, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { pedir } from "@/lib/farming/cliente"
import { VINCULOS, type Vinculo } from "@/lib/farming/direcciones"
import type { FilaDireccion, PropietarioFarming } from "@/lib/farming/tipos"

const etiquetaVinculo = (v: Vinculo) => VINCULOS.find((x) => x.clave === v)?.etiqueta ?? v

const VACIO = { nombre: "", piso: "", unidad: "", vinculo: "propietario" as Vinculo, telefono: "" }

export function Propietarios({
  direccion,
  onCerrar,
}: {
  /** null = cerrado. La tarjeta entera y no solo el id: el título dice de qué puerta se trata. */
  direccion: FilaDireccion | null
  onCerrar: () => void
}) {
  const [gente, setGente] = useState<PropietarioFarming[]>([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState(VACIO)

  // Cuenta las cargas: si el asesor cierra esta tarjeta y abre otra con el GET todavía en
  // vuelo, la lista vieja no puede pintarse sobre la nueva. Mismo patrón que «A la venta en mi
  // zona».
  const gen = useRef(0)

  const traer = useCallback(async (id: string) => {
    const mio = ++gen.current
    setCargando(true)
    try {
      const d = await pedir(`/api/farming/direcciones/${id}/propietarios`)
      if (gen.current !== mio) return
      setGente(d.propietarios || [])
    } catch (e: any) {
      if (gen.current !== mio) return
      toast.error(e.message)
      setGente([])
    } finally {
      if (gen.current !== mio) return
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // Al cambiar de tarjeta (o al cerrar) se limpia todo antes de pedir: si no, se ve por un
    // instante la gente de la puerta anterior bajo el título de la nueva.
    setGente([])
    setNuevo(VACIO)
    if (!direccion) {
      gen.current++ // lo que esté en vuelo ya no aplica
      return
    }
    traer(direccion.id)
  }, [direccion, traer])

  const sumar = async () => {
    if (!direccion || !nuevo.nombre.trim()) return
    const mio = gen.current
    setGuardando(true)
    try {
      const d = await pedir(`/api/farming/direcciones/${direccion.id}/propietarios`, {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevo.nombre.trim(),
          piso: nuevo.piso.trim() || null,
          unidad: nuevo.unidad.trim() || null,
          vinculo: nuevo.vinculo,
          telefono: nuevo.telefono.trim() || null,
        }),
      })
      // El asesor tiene que ver que se guardó aunque ya haya cambiado de tarjeta; lo que no
      // puede es que la persona nueva aparezca en la lista de OTRA puerta.
      toast.success("Persona agregada")
      if (gen.current !== mio) return
      setGente((prev) => [...prev, d.propietario])
      setNuevo(VACIO)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (p: PropietarioFarming) => {
    if (!direccion) return
    if (!window.confirm(`¿Borrar a ${p.nombre} de esta dirección?\n\nSe pierde su teléfono y sus notas. No se puede deshacer.`)) return
    const mio = gen.current
    try {
      await pedir(`/api/farming/direcciones/${direccion.id}/propietarios/${p.id}`, { method: "DELETE" })
      if (gen.current !== mio) return
      setGente((prev) => prev.filter((x) => x.id !== p.id))
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <Dialog open={!!direccion} onOpenChange={(a) => { if (!a) onCerrar() }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Personas de {direccion?.calle} {direccion?.altura ?? ""}</DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : gente.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no anotaste a nadie de esta dirección. El encargado suele ser el primero.
          </p>
        ) : (
          <ul className="space-y-2">
            {gente.map((p) => (
              <li key={p.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.nombre}</p>
                    {/* Todo como línea visible: en el celular los globitos no se abren. */}
                    <p className="text-xs text-muted-foreground">
                      {[
                        etiquetaVinculo(p.vinculo),
                        p.piso ? `piso ${p.piso}` : null,
                        p.unidad ? `unidad ${p.unidad}` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => borrar(p)}
                    title="Borrar esta persona"
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {p.telefono && (
                  // h-11 (44 px) a mano: es un <a> suelto, y la regla global de globals.css que
                  // estira a 44 px en el celular solo alcanza a "a.btn".
                  <a
                    href={`tel:${p.telefono}`}
                    className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-800"
                  >
                    <Phone className="h-3.5 w-3.5" /> {p.telefono}
                  </a>
                )}

                {/* ETAPA 3-B: acá va «→ pasarlo a mi pipeline», que crea el lead en Tracking y
                    guarda el id en farming_propietarios.tracking_log_id (el PATCH de esta
                    pantalla NO toca esa columna). Manda proceso: "vendedor" por defecto —
                    farming es captación— y deja elegir «locador». */}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-sm font-medium">Sumar una persona</p>

          <div className="space-y-1">
            <Label htmlFor="p-nombre">Nombre *</Label>
            <Input id="p-nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Marta Gómez" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-piso">Piso</Label>
              <Input id="p-piso" value={nuevo.piso} onChange={(e) => setNuevo({ ...nuevo, piso: e.target.value })} placeholder="3" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-unidad">Unidad</Label>
              <Input id="p-unidad" value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })} placeholder="B" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-vinculo">Qué es de la propiedad</Label>
              <Select value={nuevo.vinculo} onValueChange={(v) => setNuevo({ ...nuevo, vinculo: v as Vinculo })}>
                <SelectTrigger id="p-vinculo" className="h-11 md:h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VINCULOS.map((v) => <SelectItem key={v.clave} value={v.clave}>{v.etiqueta}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-tel">Teléfono</Label>
              <Input id="p-tel" type="tel" inputMode="tel" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} placeholder="11 5555 4444" />
            </div>
          </div>

          <Button className="h-11 w-full gap-1.5" disabled={guardando || !nuevo.nombre.trim()} onClick={sumar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Agregar</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
