"use client"

// Farming · cargar (o corregir) UNA tarjeta de la caminata.
//
// Quién lo usa: un asesor parado en la vereda, con el teléfono en una mano, antes de que
// cambie el semáforo. Por eso lo ÚNICO que este formulario exige es la calle y el tipo: todo
// lo demás se completa después, sentado. `validarDireccion` separa las dos cosas —`errores`
// traba el botón de guardar, `avisos` NUNCA traba: son datos incompletos, no datos malos—.
//
// El buscador de arriba es una ayuda, no un peaje: se puede escribir todo a mano y guardar sin
// elegir ninguna sugerencia. En ese caso la tarjeta va sin coordenadas y no se la traba.
//
// Las unidades totales se MUESTRAN calculadas y no se escriben (regla de las slides, y además
// `unidades_totales` es una columna generada: mandarla rompe el insert).
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, MapPin } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapaBuscador } from "@/components/mapa/mapa-buscador"
import type { Lugar } from "@/lib/mapa/lugares"
import { pedir } from "@/lib/farming/cliente"
import {
  TIPOS,
  partirDireccion,
  unidadesTotales,
  validarDireccion,
  type EntradaDireccion,
  type TipoDireccion,
} from "@/lib/farming/direcciones"
import type { FilaDireccion } from "@/lib/farming/tipos"

/** Todo el formulario vive como texto: un campo numérico vacío tiene que poder quedar vacío,
 *  no volverse 0. La conversión a número (o a null) pasa una sola vez, al armar la entrada. */
interface Formulario {
  calle: string
  altura: string
  tipo: TipoDireccion
  tramo: string
  pisos: string
  unidades_por_piso: string
  unidades: string
  encargado_nombre: string
  encargado_turno: string
  encargado_notas: string
  a_la_venta: boolean
  cartel: "" | "dueno" | "inmobiliaria" | "sin_cartel"
  inmobiliaria_cartel: string
  precio_pedido: string
  moneda: "" | "USD" | "ARS"
  relevada_en: string
  proxima_accion: string
  proxima_accion_en: string
  observaciones: string
  lat: number | null
  lng: number | null
}

const VACIO: Formulario = {
  calle: "", altura: "", tipo: "edificio", tramo: "", pisos: "", unidades_por_piso: "", unidades: "",
  encargado_nombre: "", encargado_turno: "", encargado_notas: "",
  a_la_venta: false, cartel: "", inmobiliaria_cartel: "", precio_pedido: "", moneda: "USD",
  relevada_en: "", proxima_accion: "", proxima_accion_en: "", observaciones: "",
  lat: null, lng: null,
}

const CARTELES = [
  { clave: "dueno", etiqueta: "Lo vende el dueño" },
  { clave: "inmobiliaria", etiqueta: "Cartel de una inmobiliaria" },
  { clave: "sin_cartel", etiqueta: "Sin cartel" },
] as const

/** Un texto vacío es "no lo sé", no un string vacío en la base. */
const texto = (s: string): string | null => (s.trim() ? s.trim() : null)

/** Un número vacío es null. Lo que no se pueda leer como número también: el servidor lo
 *  rechazaría con un 400, y `valoresImposibles` ya cubre los fuera de rango. */
const numero = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function desdeFila(d: FilaDireccion): Formulario {
  return {
    calle: d.calle ?? "",
    altura: d.altura ?? "",
    tipo: d.tipo,
    tramo: d.tramo ?? "",
    pisos: d.pisos != null ? String(d.pisos) : "",
    unidades_por_piso: d.unidades_por_piso != null ? String(d.unidades_por_piso) : "",
    unidades: d.unidades_manual != null ? String(d.unidades_manual) : "",
    encargado_nombre: d.encargado_nombre ?? "",
    encargado_turno: d.encargado_turno ?? "",
    encargado_notas: d.encargado_notas ?? "",
    a_la_venta: !!d.a_la_venta,
    cartel: d.cartel ?? "",
    inmobiliaria_cartel: d.inmobiliaria_cartel ?? "",
    precio_pedido: d.precio_pedido != null ? String(d.precio_pedido) : "",
    moneda: d.moneda ?? "",
    // La base guarda `date`; el input espera "AAAA-MM-DD". Se corta el string y no se pasa por
    // `new Date`: eso mueve la fecha un día para atrás según la zona horaria del teléfono.
    relevada_en: (d.relevada_en ?? "").slice(0, 10),
    proxima_accion: d.proxima_accion ?? "",
    proxima_accion_en: (d.proxima_accion_en ?? "").slice(0, 10),
    observaciones: d.observaciones ?? "",
    lat: d.lat,
    lng: d.lng,
  }
}

export function DireccionDialog({
  abierto,
  zonaId,
  direccion,
  onCerrar,
  onGuardada,
}: {
  abierto: boolean
  zonaId: string
  /** null = tarjeta nueva. Con fila = la misma pantalla, editando (PATCH). */
  direccion: FilaDireccion | null
  onCerrar: () => void
  onGuardada: (d: FilaDireccion, esNueva: boolean) => void
}) {
  const [f, setF] = useState<Formulario>(VACIO)
  const [guardando, setGuardando] = useState(false)
  // El error que vuelve del servidor (el 409 «esa puerta ya está», sobre todo) va ACÁ adentro,
  // no a un toast que se va solo: el diálogo sigue abierto y el asesor tiene que poder leerlo
  // mientras corrige la altura.
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  // Las coordenadas que puso el buscador en ESTA apertura. Si después el asesor corrige la
  // calle a mano, ese punto ya no es el de la puerta que está escribiendo y se tira: con él
  // viaja el cálculo de «fuera de zona» del servidor. Las coordenadas que YA venían guardadas
  // en la tarjeta no se tocan: ahí el asesor está arreglando una tilde, no mudando la puerta.
  const delBuscador = useRef(false)

  const editando = !!direccion

  useEffect(() => {
    if (!abierto) return
    setF(direccion ? desdeFila(direccion) : VACIO)
    setErrorServidor(null)
    delBuscador.current = false
  }, [abierto, direccion])

  const cambiar = (parche: Partial<Formulario>) => setF((v) => ({ ...v, ...parche }))

  // Escribir la calle o la altura a mano invalida el punto que vino de una sugerencia.
  const cambiarPuerta = (parche: Partial<Formulario>) =>
    setF((v) => ({ ...v, ...parche, ...(delBuscador.current ? { lat: null, lng: null } : {}) }))

  const esEdificio = f.tipo === "edificio"

  /** Lo que se le manda al servidor, y lo mismo que valida el cliente. Un solo lugar. */
  const entrada: Partial<EntradaDireccion> = useMemo(() => ({
    calle: f.calle,
    altura: texto(f.altura),
    tipo: f.tipo,
    tramo: texto(f.tramo),
    // Las tres columnas de unidades se mandan SIEMPRE, con null en las que la pantalla no
    // muestra para este tipo. Si no, un edificio que se pasa a casa se quedaría con los pisos
    // viejos escondidos en la fila, y la tarjeta seguiría diciendo «32 unidades» sin que haya
    // ningún campo en pantalla que lo explique.
    pisos: esEdificio ? numero(f.pisos) : null,
    unidades_por_piso: esEdificio ? numero(f.unidades_por_piso) : null,
    unidades_manual: esEdificio ? null : numero(f.unidades),
    encargado_nombre: texto(f.encargado_nombre),
    encargado_turno: texto(f.encargado_turno),
    encargado_notas: texto(f.encargado_notas),
    lat: f.lat,
    lng: f.lng,
    a_la_venta: f.a_la_venta,
    // Lo del cartel y el precio solo existe si está a la venta: apagar el tilde tiene que
    // limpiar la fila, no dejar un precio huérfano que nadie vuelve a ver.
    cartel: f.a_la_venta ? (f.cartel || null) : null,
    inmobiliaria_cartel: f.a_la_venta && f.cartel === "inmobiliaria" ? texto(f.inmobiliaria_cartel) : null,
    precio_pedido: f.a_la_venta ? numero(f.precio_pedido) : null,
    moneda: f.a_la_venta ? (f.moneda || null) : null,
    relevada_en: texto(f.relevada_en),
    proxima_accion: texto(f.proxima_accion),
    proxima_accion_en: texto(f.proxima_accion_en),
    observaciones: texto(f.observaciones),
  }), [f, esEdificio])

  const { errores, avisos } = useMemo(() => validarDireccion(entrada), [entrada])

  const total = unidadesTotales(entrada)

  const guardar = async () => {
    if (errores.length > 0) return
    setGuardando(true)
    setErrorServidor(null)
    try {
      const r = editando
        ? await pedir(`/api/farming/direcciones/${direccion!.id}`, { method: "PATCH", body: JSON.stringify(entrada) })
        : await pedir("/api/farming/direcciones", { method: "POST", body: JSON.stringify({ zona_id: zonaId, ...entrada }) })

      toast.success(editando ? "Tarjeta guardada" : "Dirección cargada")
      if (!editando && r.fuera_de_zona) {
        toast("Ojo: ese punto cae fuera de tu zona. La tarjeta se guardó igual.")
      }
      // Los avisos del servidor (los mismos que ya se veían adentro del diálogo mientras
      // llenaba) se repiten al cerrar: adentro se van con el diálogo, y lo que quedó a medias
      // tiene que quedar dicho. Nunca trabaron nada: la tarjeta ya está guardada.
      if (Array.isArray(r.avisos) && r.avisos.length > 0) {
        toast(`Quedó a medias: ${r.avisos.join(" ")}`)
      }
      onGuardada(r.direccion, !editando)
      onCerrar()
    } catch (e: any) {
      setErrorServidor(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const elegirDelBuscador = (l: Lugar) => {
    if (l.tipo !== "direccion") {
      toast("Elegí una dirección de la lista y se completan solas la calle y la altura.")
      return
    }
    // `detalle` es el nombre completo de MapTiler («Av. Cabildo 1200, CABA, Argentina»): el
    // primer pedazo, antes de la primera coma, es la puerta. `partirDireccion` necesita que el
    // número quede al final, y en el nombre completo no queda. Si no hay detalle, se usa el
    // nombre corto, que a veces viene sin altura — y esa se escribe a mano.
    const puerta = (l.detalle || "").split(",")[0]?.trim() || l.nombre
    const { calle, altura } = partirDireccion(puerta)
    delBuscador.current = true
    cambiar({
      calle: calle || l.nombre,
      altura: altura ?? "",
      lat: l.punto?.lat ?? null,
      lng: l.punto?.lng ?? null,
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => { if (!a) onCerrar() }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar la dirección" : "Agregar una dirección"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <MapaBuscador onElegir={elegirDelBuscador} />
            <p className="mt-1 text-xs text-muted-foreground">
              Elegí la dirección de la lista y se completan la calle, la altura y el punto en el mapa.
              También podés escribir todo a mano: se guarda igual.
            </p>
            {f.lat !== null && f.lng !== null && (
              <p className="mt-1 flex items-center gap-1 text-xs text-accent">
                <MapPin className="h-3.5 w-3.5" /> Punto guardado: esta dirección se va a poder ver en el mapa.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="calle">Calle *</Label>
              <Input id="calle" value={f.calle} onChange={(e) => cambiarPuerta({ calle: e.target.value })} placeholder="Av. Cabildo" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="altura">Altura</Label>
              <Input id="altura" value={f.altura} onChange={(e) => cambiarPuerta({ altura: e.target.value })} placeholder="1200" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tipo">Qué es *</Label>
              <Select value={f.tipo} onValueChange={(v) => cambiar({ tipo: v as TipoDireccion })}>
                <SelectTrigger id="tipo" className="h-11 md:h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.clave} value={t.clave}>{t.etiqueta}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tramo">Cuadra o tramo</Label>
              <Input id="tramo" value={f.tramo} onChange={(e) => cambiar({ tramo: e.target.value })} placeholder="Cabildo 1200-1300" />
            </div>
          </div>

          {esEdificio ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pisos">Pisos</Label>
                <Input id="pisos" type="number" inputMode="numeric" value={f.pisos} onChange={(e) => cambiar({ pisos: e.target.value })} placeholder="8" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="upp">Unidades por piso</Label>
                <Input id="upp" type="number" inputMode="numeric" value={f.unidades_por_piso} onChange={(e) => cambiar({ unidades_por_piso: e.target.value })} placeholder="4" />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="unidades">Unidades</Label>
              <Input id="unidades" type="number" inputMode="numeric" value={f.unidades} onChange={(e) => cambiar({ unidades: e.target.value })} placeholder="1" />
            </div>
          )}

          {/* Se calcula, no se escribe: la regla de las slides. No es un campo deshabilitado —
              es texto, así que no hay ningún camino por el que se pueda tipear. */}
          <p className="text-sm text-muted-foreground">
            {total !== null
              ? <>Total: <span className="font-medium text-foreground">{total} {total === 1 ? "unidad" : "unidades"}</span> · se calcula solo</>
              : "Total de unidades: se calcula solo con los números de arriba."}
          </p>

          <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-sm font-medium">El encargado</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="enc-nombre">Nombre</Label>
                <Input id="enc-nombre" value={f.encargado_nombre} onChange={(e) => cambiar({ encargado_nombre: e.target.value })} placeholder="Jorge" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="enc-turno">Cuándo está</Label>
                <Input id="enc-turno" value={f.encargado_turno} onChange={(e) => cambiar({ encargado_turno: e.target.value })} placeholder="mañanas" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="enc-notas">Notas</Label>
              <Input id="enc-notas" value={f.encargado_notas} onChange={(e) => cambiar({ encargado_notas: e.target.value })} placeholder="Atiende por el portero eléctrico" />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            {/* El tilde es de 20 px pero lo tocable es toda la fila de 44: la regla global de
                globals.css estira los <button> a 44 px en el celular y dejaría la casilla
                alta y finita, así que se le saca con `min-h-0` y el alto lo pone la fila. */}
            <label htmlFor="a-la-venta" className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-medium">
              <Checkbox
                id="a-la-venta"
                className="h-5 w-5 min-h-0"
                checked={f.a_la_venta}
                onCheckedChange={(v) => cambiar({ a_la_venta: v === true })}
              />
              Está a la venta
            </label>

            {f.a_la_venta && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="cartel">El cartel</Label>
                  <Select value={f.cartel} onValueChange={(v) => cambiar({ cartel: v as Formulario["cartel"] })}>
                    <SelectTrigger id="cartel" className="h-11 md:h-10"><SelectValue placeholder="Elegí" /></SelectTrigger>
                    <SelectContent>
                      {CARTELES.map((c) => <SelectItem key={c.clave} value={c.clave}>{c.etiqueta}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {f.cartel === "inmobiliaria" && (
                  <div className="space-y-1">
                    <Label htmlFor="inmo">De qué inmobiliaria</Label>
                    <Input id="inmo" value={f.inmobiliaria_cartel} onChange={(e) => cambiar({ inmobiliaria_cartel: e.target.value })} />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="precio">Precio que piden</Label>
                    <Input id="precio" type="number" inputMode="numeric" value={f.precio_pedido} onChange={(e) => cambiar({ precio_pedido: e.target.value })} placeholder="180000" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="moneda">Moneda</Label>
                    <Select value={f.moneda} onValueChange={(v) => cambiar({ moneda: v as Formulario["moneda"] })}>
                      <SelectTrigger id="moneda" className="h-11 md:h-10"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="ARS">Pesos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="relevada">Cuándo la relevaste</Label>
            <Input id="relevada" type="date" value={f.relevada_en} onChange={(e) => cambiar({ relevada_en: e.target.value })} className="h-11 md:h-10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="prox">Qué sigue</Label>
              <Input id="prox" value={f.proxima_accion} onChange={(e) => cambiar({ proxima_accion: e.target.value })} placeholder="Dejar la carta 1" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prox-en">Para cuándo</Label>
              <Input id="prox-en" type="date" value={f.proxima_accion_en} onChange={(e) => cambiar({ proxima_accion_en: e.target.value })} className="h-11 md:h-10" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="obs">Observaciones</Label>
            <Textarea id="obs" rows={3} value={f.observaciones} onChange={(e) => cambiar({ observaciones: e.target.value })} placeholder="Lo que viste en la puerta" />
          </div>

          {/* Los errores TRABAN el botón. Los avisos NO: son datos incompletos, y el asesor está
              parado en la vereda — se completan después. */}
          {errores.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              {errores.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {avisos.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              {avisos.map((x) => <li key={x}>{x}</li>)}
              <li className="font-medium">Se puede guardar igual.</li>
            </ul>
          )}
          {errorServidor && (
            <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{errorServidor}</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
            <Button className="h-11" onClick={guardar} disabled={guardando || errores.length > 0}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? "Guardar" : "Agregar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
