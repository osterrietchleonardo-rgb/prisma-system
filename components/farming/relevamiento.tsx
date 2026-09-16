"use client"

// Farming · «Relevamiento»: lo que el asesor carga caminando su zona.
//
// Es la pantalla para la que existe toda la etapa. Quien la usa está parado frente a un
// edificio con el teléfono en una mano: si para guardar hiciera falta algo más que la calle y
// el tipo, estaría mal hecha.
//
// La lista viene agrupada por etapa en el orden del tablero. Las etapas vacías no se dibujan
// —una columna en cero se siente rota—, salvo «Relevado», que es donde nace todo y donde va el
// cartel de «todavía no cargaste nada».
//
// Nada importante en un globito: en el celular no se abren. Lo que el asesor necesita leer va
// como línea visible.
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, MapPinOff, Pencil, Plus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { pedir } from "@/lib/farming/cliente"
import { ETAPAS, TIPOS } from "@/lib/farming/direcciones"
import type { FilaDireccion, RespuestaDirecciones, ZonaFarming } from "@/lib/farming/tipos"
import { DireccionDialog } from "./direccion-dialog"
import { Propietarios } from "./propietarios"

const etiquetaTipo = (t: FilaDireccion["tipo"]) => TIPOS.find((x) => x.clave === t)?.etiqueta ?? t

/**
 * Para las columnas `date` (`relevada_en`, `proxima_accion_en`): «2026-09-16» → «16/9/2026».
 * Se corta el string y NO se pasa por `new Date`: un `date` de Postgres parseado así se lee
 * como medianoche UTC y en Buenos Aires cae un día antes. En un cuaderno de caminata la fecha
 * ES el dato.
 */
function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split("-")
  if (!a || !m || !d) return null
  return `${Number(d)}/${Number(m)}/${a}`
}

/**
 * Para `fuera_de_zona_desde`, que es `timestamptz` y NO una fecha suelta. Acá sí se pasa por
 * `new Date`, porque el valor trae la hora y la zona: es un instante de verdad. Cortarle el
 * string sería leer el día en UTC, y un trazo redibujado a las 22:00 en Buenos Aires diría que
 * la dirección quedó afuera al día siguiente.
 */
function fechaDeInstante(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return t.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
}

const plata = (n: number | null, moneda: string | null) => {
  if (n === null) return null
  const numero = n.toLocaleString("es-AR")
  if (moneda === "USD") return `USD ${numero}`
  if (moneda === "ARS") return `$ ${numero}`
  // Sin moneda no se inventa ninguna: va el número pelado. Poner «USD» sobre un dato que no
  // trae la moneda es afirmar algo sobre la plata de alguien que la fila no dice.
  return numero
}

function Tarjeta({
  d,
  onEditar,
  onPersonas,
  onBorrar,
}: {
  d: FilaDireccion
  onEditar: (d: FilaDireccion) => void
  onPersonas: (d: FilaDireccion) => void
  onBorrar: (d: FilaDireccion) => void
}) {
  const precio = plata(d.precio_pedido, d.moneda)
  const cuando = fechaCorta(d.proxima_accion_en)
  // `fuera_de_zona_desde` es timestamptz, no date: va por el otro formateador.
  const cayoEl = fechaDeInstante(d.fuera_de_zona_desde)

  return (
    <div className="rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800">
      <p className="font-medium">{d.calle} {d.altura ?? ""}</p>

      <p className="text-xs text-muted-foreground">
        {[
          etiquetaTipo(d.tipo),
          d.unidades_totales ? `${d.unidades_totales} ${d.unidades_totales === 1 ? "unidad" : "unidades"}` : null,
          d.tramo,
        ].filter(Boolean).join(" · ")}
      </p>

      {/* El encargado por su NOMBRE, no un sí/no: es la persona que te abre la puerta. */}
      {d.encargado_nombre && (
        <p className="text-xs text-muted-foreground">
          Encargado: {d.encargado_nombre}{d.encargado_turno ? ` (${d.encargado_turno})` : ""}
        </p>
      )}

      {d.a_la_venta && (
        <p className="text-xs">
          A la venta{precio ? ` · ${precio}` : ""}
          {d.cartel === "inmobiliaria" ? ` · cartel de ${d.inmobiliaria_cartel || "otra inmobiliaria"}` : ""}
          {d.cartel === "dueno" ? " · lo vende el dueño" : ""}
          {d.cartel === "sin_cartel" ? " · sin cartel" : ""}
        </p>
      )}

      {/* La próxima acción, como LÍNEA VISIBLE y no en un globito: es lo que el asesor necesita
          leer de un vistazo antes de volver a esa puerta. */}
      {d.proxima_accion && (
        <p className="mt-1 text-xs font-medium text-accent">
          Qué sigue: {d.proxima_accion}{cuando ? ` · ${cuando}` : ""}
        </p>
      )}

      {/* Dos historias distintas, y no se mezclan: sin fecha la tarjeta NACIÓ afuera de la
          línea (el asesor cargó a propósito la puerta de enfrente); con fecha SE CAYÓ afuera
          cuando alguien movió el trazo (etapa 3-B). En los dos casos se sigue trabajando. */}
      {d.fuera_de_zona && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {cayoEl
            ? `Esta dirección quedó fuera de tu zona el ${cayoEl}. La podés seguir trabajando.`
            : "Esta dirección está fuera de tu zona. La podés seguir trabajando."}
        </p>
      )}

      {d.observaciones && <p className="mt-1 text-xs text-muted-foreground">{d.observaciones}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" className="h-11 gap-1.5 text-xs" onClick={() => onEditar(d)}>
          <Pencil className="h-3.5 w-3.5" /> editar
        </Button>
        <Button variant="ghost" size="sm" className="h-11 gap-1.5 text-xs" onClick={() => onPersonas(d)}>
          <Users className="h-3.5 w-3.5" /> personas
        </Button>
        {/* El que destruye no puede parecerse a los otros dos: va en rojo y al otro extremo de
            la fila, para que el pulgar no lo encuentre por error a un centímetro de «editar».
            La confirmación igual está, pero un botón bien puesto se equivoca menos veces. */}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-11 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onBorrar(d)}
        >
          <Trash2 className="h-3.5 w-3.5" /> borrar
        </Button>
      </div>
    </div>
  )
}

export function Relevamiento({ zonas }: { zonas: ZonaFarming[] }) {
  const [zonaId, setZonaId] = useState(zonas[0]?.id ?? "")
  const [datos, setDatos] = useState<RespuestaDirecciones | null>(null)
  const [direcciones, setDirecciones] = useState<FilaDireccion[]>([])
  const [cargando, setCargando] = useState(true)
  // El tercer estado. Sin él, una carga que falla dejaba el encabezado diciendo «Buscando…»
  // para siempre: el toast ya se fue y en pantalla no queda nada que explique qué pasó ni
  // ninguna forma de volver a intentar sin recargar la página entera.
  const [fallo, setFallo] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<FilaDireccion | null>(null)
  const [viendoPersonas, setViendoPersonas] = useState<FilaDireccion | null>(null)

  // Cuenta las cargas: si el asesor cambia de zona con un pedido en vuelo, la respuesta vieja
  // no puede pisar la lista de la nueva. Mismo patrón que «A la venta en mi zona».
  const gen = useRef(0)

  // Cambiar de zona limpia la lista anterior (si no, se ven las tarjetas de la zona vieja bajo
  // el nombre de la nueva) y cierra cualquier diálogo abierto: esa tarjeta ya no es de la zona
  // que se está mirando, y guardarla escribiría contra la lista equivocada.
  useEffect(() => {
    setDirecciones([])
    setDatos(null)
    setFallo(null)
    setCreando(false)
    setEditando(null)
    setViendoPersonas(null)
  }, [zonaId])

  const traer = useCallback(async () => {
    if (!zonaId) return
    const mio = ++gen.current
    setCargando(true)
    setFallo(null)
    try {
      const d: RespuestaDirecciones = await pedir(`/api/farming/direcciones?zona_id=${encodeURIComponent(zonaId)}`)
      if (gen.current !== mio) return
      setDatos(d)
      setDirecciones(d.direcciones || [])
    } catch (e: any) {
      if (gen.current !== mio) return
      toast.error(e.message)
      // No se deja en pantalla la lista de la zona ANTERIOR bajo el nombre de la nueva: un
      // «borrar» ahí iría contra la tarjeta equivocada. Y queda dicho en pantalla, no solo en
      // un toast que se va solo.
      setDirecciones([])
      setDatos(null)
      setFallo(e.message)
    } finally {
      if (gen.current !== mio) return
      setCargando(false)
    }
  }, [zonaId])

  useEffect(() => { traer() }, [traer])

  // La fila que devuelve el servidor es la verdad: se aplica de una, sin recargar la lista
  // entera. `zona_id` se compara igual — si el asesor cambió de zona mientras el diálogo
  // estaba abierto, esa tarjeta no va en esta lista.
  const guardada = (d: FilaDireccion, esNueva: boolean) => {
    if (d.zona_id !== zonaId) return
    setDirecciones((prev) =>
      esNueva
        // Al final: nace en «relevado» con orden 0, y el servidor desempata por created_at.
        ? [...prev, d]
        : prev.map((x) => (x.id === d.id ? d : x)),
    )
  }

  const borrar = async (d: FilaDireccion) => {
    if (
      !window.confirm(
        `¿Borrar ${d.calle} ${d.altura ?? ""}?\n\nSe borra la dirección, sus propietarios y todo su historial. No se puede deshacer.`,
      )
    )
      return
    const mio = gen.current
    try {
      await pedir(`/api/farming/direcciones/${d.id}`, { method: "DELETE" })
      toast.success("Dirección borrada")
      if (gen.current !== mio) return
      setDirecciones((prev) => prev.filter((x) => x.id !== d.id))
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (zonas.length === 0) {
    return <p className="text-sm text-muted-foreground">Dibujá una zona en «Mis zonas» y acá vas a poder cargar lo que camines.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {zonas.length > 1 && (
          <Select value={zonaId} onValueChange={setZonaId}>
            <SelectTrigger className="h-10 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {zonas.map((z) => <SelectItem key={z.id} value={z.id}>{z.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <p className="text-sm text-muted-foreground">
          {datos
            ? `${direcciones.length} ${direcciones.length === 1 ? "dirección cargada" : "direcciones cargadas"} en «${datos.zona.nombre}»`
            : fallo
              ? "No pudimos traer las direcciones de esta zona."
              : "Buscando…"}
        </p>
        <Button className="ml-auto h-11 gap-1.5" onClick={() => setCreando(true)}>
          <Plus className="h-4 w-4" /> agregar dirección
        </Button>
      </div>

      {cargando && direcciones.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : fallo ? (
        <div className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="text-sm text-muted-foreground">{fallo}</p>
          <Button variant="outline" className="h-11" onClick={() => traer()}>Reintentar</Button>
        </div>
      ) : (
        ETAPAS.map((e) => {
          const filas = direcciones.filter((d) => d.etapa === e.clave)
          // Una etapa en cero no se dibuja: una columna vacía se siente rota. «Relevado» es la
          // excepción —es donde nace todo— y ahí va el cartel de que todavía no hay nada.
          if (filas.length === 0 && e.clave !== "relevado") return null
          return (
            <section key={e.clave} className="space-y-2">
              <h2 className="text-sm font-semibold">
                {e.etiqueta} <span className="text-muted-foreground">({filas.length})</span>
              </h2>
              {filas.length === 0 ? (
                // «Relevado» vacío no siempre quiere decir «no cargaste nada»: con doce
                // tarjetas en «Presentado» esa frase sería mentira. El cartel de arranque solo
                // sale cuando la zona no tiene NINGUNA tarjeta; si no, una línea callada.
                <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
                  {direcciones.length === 0
                    ? "Todavía no cargaste ninguna dirección en esta zona. Con la calle y qué es alcanza para empezar."
                    : "Ninguna dirección está en «Relevado» ahora mismo."}
                </p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {filas.map((d) => (
                    <Tarjeta key={d.id} d={d} onEditar={setEditando} onPersonas={setViendoPersonas} onBorrar={borrar} />
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}

      {/* Un diálogo para las dos cosas: con `direccion` en null da de alta, con una fila edita.
          La `key` lo remonta al pasar de una tarjeta a otra sin cerrarlo en el medio. */}
      <DireccionDialog
        key={editando?.id ?? "nueva"}
        abierto={creando || !!editando}
        zonaId={zonaId}
        direccion={editando}
        onCerrar={() => { setCreando(false); setEditando(null) }}
        onGuardada={guardada}
      />

      <Propietarios direccion={viendoPersonas} onCerrar={() => setViendoPersonas(null)} />
    </div>
  )
}
