"use client"

// Farming · las personas de UNA tarjeta.
//
// Un edificio de 32 unidades puede tener muchos propietarios conocidos, cada uno con su piso,
// su unidad y su teléfono: por eso son filas propias y no un texto suelto en la tarjeta.
//
// Lo único obligatorio es el nombre. El teléfono es un link `tel:`: el asesor está caminando y
// tiene que poder llamar desde acá sin copiar nada a mano.
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Pencil, Phone, Plus, Trash2 } from "lucide-react"
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

/** Los campos del formulario, para el alta y para la corrección: son los mismos. Todo string:
 *  lo que viene de la base puede ser null y un <input> con `value={null}` se vuelve
 *  no-controlado y React protesta. Al mandar, "" vuelve a ser null. */
interface Campos {
  nombre: string
  piso: string
  unidad: string
  vinculo: Vinculo
  telefono: string
  email: string
  notas: string
}

const VACIO: Campos = { nombre: "", piso: "", unidad: "", vinculo: "propietario", telefono: "", email: "", notas: "" }

const desdeFila = (p: PropietarioFarming): Campos => ({
  nombre: p.nombre ?? "",
  piso: p.piso ?? "",
  unidad: p.unidad ?? "",
  vinculo: p.vinculo,
  telefono: p.telefono ?? "",
  email: p.email ?? "",
  notas: p.notas ?? "",
})

/** Lo que viaja al servidor. Un campo vacío se manda como `null` —no como ""—: la base guarda
 *  «no sé» en null, y un "" haría que «tiene teléfono» diera verdadero sobre un teléfono que
 *  no existe. */
const aCuerpo = (c: Campos) => ({
  nombre: c.nombre.trim(),
  piso: c.piso.trim() || null,
  unidad: c.unidad.trim() || null,
  vinculo: c.vinculo,
  telefono: c.telefono.trim() || null,
  email: c.email.trim() || null,
  notas: c.notas.trim() || null,
})

/**
 * Los mismos campos para sumar una persona y para corregirla. Uno solo: si fueran dos
 * formularios, el día que se agregue un campo se agrega en uno y se olvida en el otro — que es
 * exactamente cómo `email` y `notas` terminaron siendo columnas que se escribían por la API y
 * no se podían cargar ni leer desde ninguna pantalla.
 */
function CamposPersona({
  id,
  valor,
  onCambio,
}: {
  /** Prefijo de los `id` de los campos: hay un formulario de alta y uno por persona abierta. */
  id: string
  valor: Campos
  onCambio: (c: Campos) => void
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${id}-nombre`}>Nombre *</Label>
        <Input
          id={`${id}-nombre`}
          className="h-11 md:h-10"
          value={valor.nombre}
          onChange={(e) => onCambio({ ...valor, nombre: e.target.value })}
          placeholder="Marta Gómez"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-piso`}>Piso</Label>
          <Input id={`${id}-piso`} className="h-11 md:h-10" value={valor.piso} onChange={(e) => onCambio({ ...valor, piso: e.target.value })} placeholder="3" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-unidad`}>Unidad</Label>
          <Input id={`${id}-unidad`} className="h-11 md:h-10" value={valor.unidad} onChange={(e) => onCambio({ ...valor, unidad: e.target.value })} placeholder="B" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-vinculo`}>Qué es de la propiedad</Label>
          <Select value={valor.vinculo} onValueChange={(v) => onCambio({ ...valor, vinculo: v as Vinculo })}>
            <SelectTrigger id={`${id}-vinculo`} className="h-11 md:h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VINCULOS.map((v) => <SelectItem key={v.clave} value={v.clave}>{v.etiqueta}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-tel`}>Teléfono</Label>
          <Input
            id={`${id}-tel`}
            className="h-11 md:h-10"
            type="tel"
            inputMode="tel"
            value={valor.telefono}
            onChange={(e) => onCambio({ ...valor, telefono: e.target.value })}
            placeholder="11 5555 4444"
          />
        </div>
      </div>

      {/* `email` y `notas` existen en la base desde la migración y la API ya los guardaba: sin
          estos dos campos eran columnas de solo escritura, imposibles de cargar y de leer. */}
      <div className="space-y-1">
        <Label htmlFor={`${id}-email`}>Email</Label>
        <Input
          id={`${id}-email`}
          className="h-11 md:h-10"
          type="email"
          inputMode="email"
          value={valor.email}
          onChange={(e) => onCambio({ ...valor, email: e.target.value })}
          placeholder="marta@ejemplo.com"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-notas`}>Notas</Label>
        <Input
          id={`${id}-notas`}
          className="h-11 md:h-10"
          value={valor.notas}
          onChange={(e) => onCambio({ ...valor, notas: e.target.value })}
          placeholder="Atiende después de las 18"
        />
      </div>
    </>
  )
}

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
  // Qué persona se está corrigiendo, y con qué valores. Sin esto, la única forma de arreglar un
  // teléfono mal tipeado era borrar a la persona y volver a escribirla entera — perdiendo sus
  // notas y su historial, con un cartel que además avisaba que no se podía deshacer.
  const [editando, setEditando] = useState<{ id: string; campos: Campos } | null>(null)

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
    setEditando(null)
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
        body: JSON.stringify(aCuerpo(nuevo)),
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

  /** Corregir a una persona que ya está cargada. Pega contra el PATCH de
   *  /api/farming/direcciones/[id]/propietarios/[pid], que existía desde la etapa 3-A y no
   *  tenía quién lo llamara: el asesor que tipeaba mal un teléfono solo podía borrar y rehacer. */
  const guardarEdicion = async () => {
    if (!direccion || !editando || !editando.campos.nombre.trim()) return
    const mio = gen.current
    setGuardando(true)
    try {
      const d = await pedir(`/api/farming/direcciones/${direccion.id}/propietarios/${editando.id}`, {
        method: "PATCH",
        body: JSON.stringify(aCuerpo(editando.campos)),
      })
      toast.success("Persona corregida")
      if (gen.current !== mio) return
      // La fila que devuelve el servidor es la verdad (el teléfono vuelve normalizado): se
      // aplica esa, no lo que quedó tipeado en el formulario.
      setGente((prev) => prev.map((x) => (x.id === d.propietario.id ? d.propietario : x)))
      setEditando(null)
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
                {editando?.id === p.id ? (
                  // Corrigiendo a esta persona, ahí mismo en su fila: no se abre otro diálogo
                  // arriba de este, que en el celular deja la pantalla imposible de entender.
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Corregir a {p.nombre}</p>
                    <CamposPersona
                      id={`p-${p.id}`}
                      valor={editando.campos}
                      onCambio={(campos) => setEditando({ id: p.id, campos })}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="h-11 flex-1"
                        disabled={guardando || !editando.campos.nombre.trim()}
                        onClick={guardarEdicion}
                      >
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                      </Button>
                      <Button variant="outline" className="h-11 flex-1" disabled={guardando} onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
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
                      <div className="flex shrink-0 items-start">
                        {/* Corregir, sin borrar. Un teléfono mal tipeado no puede costar la
                            persona entera con sus notas. */}
                        <button
                          onClick={() => setEditando({ id: p.id, campos: desdeFila(p) })}
                          title="Corregir a esta persona"
                          aria-label={`Corregir a ${p.nombre}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => borrar(p)}
                          title="Borrar esta persona"
                          aria-label={`Borrar a ${p.nombre}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* El email y las notas, VISIBLES: se venían guardando y no se veían en
                        ningún lado. «Atiende después de las 18» es justo lo que hay que leer
                        antes de golpear la puerta de nuevo. */}
                    {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                    {p.notas && <p className="mt-1 text-xs">{p.notas}</p>}

                    {p.telefono && (
                      // h-11 (44 px) a mano: es un <a> suelto, y la regla global de globals.css
                      // que estira a 44 px en el celular solo alcanza a "a.btn".
                      <a
                        href={`tel:${p.telefono}`}
                        className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-800"
                      >
                        <Phone className="h-3.5 w-3.5" /> {p.telefono}
                      </a>
                    )}
                  </>
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

          <CamposPersona id="p-nueva" valor={nuevo} onCambio={setNuevo} />

          <Button className="h-11 w-full gap-1.5" disabled={guardando || !nuevo.nombre.trim()} onClick={sumar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Agregar</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
