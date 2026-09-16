"use client"

// Farming · «A la venta en mi zona»: lo que se publica HOY adentro del territorio del asesor.
// Es lo que le da trabajo el primer día, sin cargar nada.
//
// Los atajos se dibujan solo si tienen avisos (decisión de Leonardo, 16-sep): hoy «se cayó» y
// «bajó el precio» dan cero en todo el sistema, y un botón que da cero se siente roto.
//
// Acá NO se tapa al colega que publica (spec): es la pantalla interna del asesor, no viaja a
// ningún cliente, y saber quién publica es justamente el dato que necesita.
import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Loader2, Undo2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { pedir } from "@/lib/farming/cliente"
import { atajosVisibles, SENALES, type AvisoEnZona, type RespuestaAvisos, type Senal } from "@/lib/farming/avisos"
import type { ZonaFarming } from "@/lib/farming/tipos"

const plata = (n: number | null) => (n === null ? "Precio a consultar" : `USD ${n.toLocaleString("es-AR")}`)

function Tarjeta({ aviso, onDescartar }: { aviso: AvisoEnZona; onDescartar: (a: AvisoEnZona) => void }) {
  return (
    <div className="flex gap-3 rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800">
      {aviso.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={aviso.foto} alt="" className="h-24 w-32 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] text-muted-foreground">sin foto</div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{aviso.titulo}</p>
        <p className="text-sm">{plata(aviso.precio_usd)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[aviso.tipo, aviso.direccion, aviso.barrio].filter(Boolean).join(" · ")}
          {aviso.m2 ? ` · ${aviso.m2} m²` : ""}
          {aviso.ambientes ? ` · ${aviso.ambientes} amb` : ""}
        </p>
        {aviso.publicador && <p className="truncate text-xs text-muted-foreground">Publica: {aviso.publicador}</p>}

        {aviso.senales.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {aviso.senales.map((s) => (
              // `text-primary` (no `text-accent`): sobre fondo claro `--accent` mide 2,78:1,
              // por debajo del piso legible de 4,5. `--primary` es el mismo cobre pero ya
              // resuelto para texto en las dos superficies (comentario de app/globals.css),
              // y es el token que ya usa este mismo patrón de chip en
              // components/whatsapp/ConversationsList.tsx — no un color inventado acá.
              <span key={s} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {SENALES.find((x) => x.clave === s)?.etiqueta}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {aviso.url_publica && (
            <a
              href={aviso.url_publica}
              target="_blank"
              rel="noopener noreferrer"
              // h-11 (44px) a mano: es un <a> suelto, no un <button>, y la regla global de
              // globals.css que estira a 44px en el celular solo alcanza a "a.btn".
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-800"
            >
              <ExternalLink className="h-3.5 w-3.5" /> ver el aviso
            </a>
          )}
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => onDescartar(aviso)}>
            <X className="h-3.5 w-3.5" /> descartar
          </Button>
          {/* ETAPA 3: acá va «crear tarjeta de relevamiento», que manda esta dirección al tablero. */}
        </div>
      </div>
    </div>
  )
}

export function AvisosEnZona({ zonas }: { zonas: ZonaFarming[] }) {
  const [zonaId, setZonaId] = useState(zonas[0]?.id ?? "")
  const [senal, setSenal] = useState<Senal | null>(null)
  const [datos, setDatos] = useState<RespuestaAvisos | null>(null)
  const [avisos, setAvisos] = useState<AvisoEnZona[]>([])
  const [cargando, setCargando] = useState(true)
  const [ultimoDescarte, setUltimoDescarte] = useState<AvisoEnZona | null>(null)

  // Cuenta las cargas: si el asesor cambia de zona o de filtro con un pedido todavía en
  // vuelo (por ejemplo, tocó «ver más» y después cambió de zona), la respuesta vieja no puede
  // pisar los datos de la nueva. Cada `traer` se queda con SU número; si al volver ya no es el
  // último pedido, no toca ningún estado.
  const gen = useRef(0)

  // Corta el flash de la zona/filtro anterior apenas cambia uno de los dos, antes de que
  // llegue la respuesta nueva. También se lleva puesto el "deshacer" pendiente: es de la
  // combinación de zona+filtro anterior, y reinsertarlo bajo la nueva mezclaría dos listas.
  useEffect(() => {
    setAvisos([])
    setDatos(null)
    setUltimoDescarte(null)
  }, [zonaId, senal])

  const traer = useCallback(async (desde: number, reemplazar: boolean) => {
    if (!zonaId) return
    const mio = ++gen.current
    setCargando(true)
    try {
      // El offset es cuántas tarjetas ya hay en pantalla (avisos.length), no una página×60:
      // la lista de excluidos crece con cada descarte, así que un offset fijo por página se
      // corre y saltea avisos (bug real, confirmado en producción). avisos.length siempre es
      // un prefijo del resultado ya filtrado, así que también absorbe un deshacer.
      const qs = new URLSearchParams({ zona_id: zonaId, desde: String(desde) })
      if (senal) qs.set("senal", senal)
      const d: RespuestaAvisos = await pedir(`/api/farming/avisos?${qs}`)
      if (gen.current !== mio) return // una carga más nueva ya ganó
      setDatos(d)
      setAvisos((prev) => (reemplazar ? d.avisos : [...prev, ...d.avisos]))
    } catch (e: any) {
      if (gen.current !== mio) return
      toast.error(e.message)
      // Una carga que reemplaza (zona nueva, filtro nuevo, primera página) y falla no puede
      // dejar en pantalla los datos de la ANTERIOR: el asesor la vería bajo el nombre de la
      // zona nueva, y un descarte ahí escribiría la marca contra la zona equivocada.
      if (reemplazar) {
        setAvisos([])
        setDatos(null)
      }
    } finally {
      if (gen.current !== mio) return
      setCargando(false)
    }
  }, [zonaId, senal])

  useEffect(() => { traer(0, true) }, [traer])

  // Suma o resta de los conteos ya traídos (el total y el de cada señal del aviso), para que
  // el encabezado y los chips no mientan entre un descarte/deshacer y el próximo fetch real
  // (que sí trae el número exacto, porque el RPC de conteos también excluye lo descartado).
  const ajustarConteos = useCallback((delta: number, senales: Senal[]) => {
    setDatos((d) => {
      if (!d) return d
      const conteos = { ...d.conteos, total: d.conteos.total + delta }
      for (const s of senales) conteos[s] += delta
      return { ...d, conteos }
    })
  }, [])

  const descartar = async (a: AvisoEnZona) => {
    // Mismo generation ref que `traer`: si cambia de zona o de filtro mientras el POST está
    // en vuelo, esta lista y estos conteos ya no son los del aviso que se está descartando.
    const mio = gen.current
    setAvisos((prev) => prev.filter((x) => x.id !== a.id))
    setUltimoDescarte(a)
    ajustarConteos(-1, a.senales)
    try {
      await pedir("/api/farming/avisos/marca", {
        method: "POST",
        body: JSON.stringify({ zona_id: zonaId, aviso_id: a.id, es_dueno_directo: a.es_dueno_directo }),
      })
    } catch (e: any) {
      // El asesor tiene que enterarse de que no se guardó SIEMPRE, cambie o no de zona.
      toast.error(e.message)
      // Pero si ya cambió, el aviso vuelto es de OTRA zona: no lo reinserta acá, y el
      // conteo que ajustaría también sería el de la zona equivocada.
      if (gen.current !== mio) return
      setAvisos((prev) => [a, ...prev])
      setUltimoDescarte(null)
      ajustarConteos(1, a.senales)
    }
  }

  const deshacer = async () => {
    if (!ultimoDescarte) return
    const a = ultimoDescarte
    const mio = gen.current
    setUltimoDescarte(null)
    try {
      await pedir(`/api/farming/avisos/marca?zona_id=${encodeURIComponent(zonaId)}&aviso_id=${a.id}`, { method: "DELETE" })
      // Si mientras el DELETE estaba en vuelo cambió de zona o de filtro, reinsertar acá
      // metería el aviso de la zona VIEJA en la lista de la que se está mirando ahora.
      if (gen.current !== mio) return
      setAvisos((prev) => [a, ...prev])
      ajustarConteos(1, a.senales)
    } catch (e: any) {
      // El asesor tiene que enterarse de que el deshacer falló SIEMPRE, cambie o no de zona.
      toast.error(e.message)
      // Si ya cambió, reaparecer el banner sería para la zona VIEJA: tocar «deshacer» ahí
      // dispararía un DELETE contra el zona_id nuevo, la zona equivocada.
      if (gen.current !== mio) return
      setUltimoDescarte(a)
    }
  }

  if (zonas.length === 0) {
    return <p className="text-sm text-muted-foreground">Dibujá una zona en «Mis zonas» y acá vas a ver lo que está a la venta adentro.</p>
  }

  // Recalculado en cada render, no lo que trajo el último fetch: así un atajo que llega a
  // cero por un descarte deja de dibujarse en el momento, no recién en el próximo fetch.
  const atajosAhora = datos ? atajosVisibles(datos.conteos) : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {zonas.length > 1 && (
          <Select
            value={zonaId}
            onValueChange={(v) => {
              // El "deshacer" pendiente y la lista vieja los limpia el useEffect de arriba
              // (corre con cualquier cambio de zonaId o senal).
              setZonaId(v)
              setSenal(null)
            }}
          >
            <SelectTrigger className="h-10 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {zonas.map((z) => <SelectItem key={z.id} value={z.id}>{z.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <p className="text-sm text-muted-foreground">
          {datos ? `${datos.conteos.total} ${datos.conteos.total === 1 ? "propiedad publicada" : "propiedades publicadas"} en «${datos.zona.nombre}»` : "Buscando…"}
        </p>
      </div>

      {/* Los atajos: solo los que tienen avisos AHORA, no los que tenía la última respuesta del
          servidor — `ajustarConteos` los mueve en vivo con cada descarte/deshacer, y un atajo
          en cero se siente roto (la regla de Leonardo, 16-sep).
          La fila se dibuja igual si el filtro activo se quedó sin chip (cayó a cero, por
          ejemplo el único «dueño directo» de la zona se acaba de descartar): sin esto el
          asesor queda mirando una lista vacía con el filtro puesto y sin ningún control para
          salir — «Todas» tiene que seguir ahí siempre que haya un filtro activo. */}
      {datos && (atajosAhora.length > 0 || senal !== null) && (
        <div className="flex flex-wrap gap-2">
          <Button variant={senal === null ? "default" : "outline"} size="sm" className="h-9" onClick={() => setSenal(null)}>
            Todas ({datos.conteos.total})
          </Button>
          {atajosAhora.map((clave) => {
            const s = SENALES.find((x) => x.clave === clave)!
            return (
              <Button
                key={clave}
                variant={senal === clave ? "default" : "outline"}
                size="sm"
                className="h-9"
                onClick={() => setSenal(senal === clave ? null : clave)}
                title={s.porque}
              >
                {s.etiqueta} ({datos.conteos[clave]})
              </Button>
            )
          })}
        </div>
      )}

      {senal && (
        <p className="text-xs text-muted-foreground">{SENALES.find((x) => x.clave === senal)?.porque}.</p>
      )}

      {ultimoDescarte && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <span>Descartaste «{ultimoDescarte.titulo}». No vuelve a aparecer en esta zona.</span>
          <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={deshacer}>
            <Undo2 className="h-3.5 w-3.5" /> deshacer
          </Button>
        </div>
      )}

      {cargando && avisos.length === 0 && (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!cargando && avisos.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
          {senal ? "Ningún aviso de tu zona cumple ese filtro." : "No hay propiedades publicadas dentro de esta zona."}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {avisos.map((a) => <Tarjeta key={a.id} aviso={a} onDescartar={descartar} />)}
      </div>

      {datos?.hay_mas && (
        <Button variant="outline" className="h-10 w-full" disabled={cargando} onClick={() => traer(avisos.length, false)}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver más"}
        </Button>
      )}
    </div>
  )
}
