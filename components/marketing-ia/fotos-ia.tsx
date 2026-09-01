"use client"

/**
 * Solapa "Fotos": retoque de las fotos de una propiedad.
 *
 * El navegador encadena los pasos de a uno (cada uno tarda entre 45 y 90
 * segundos) y va mostrando en cuál va. Cada paso devuelve una URL que es la
 * entrada del siguiente. El orden lo fija el motor: mejorar, limpiar, ambientar.
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { PropertySelector } from "@/components/marketing-ia/property-selector"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Sun, Sparkles, Sofa, ArrowLeft, Loader2, Check, Download, Wand2,
  ImageIcon, Trash2, MousePointerSquareDashed, RotateCcw,
} from "lucide-react"
import { TokkoProperty } from "@/types/marketing-ia"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { tomarFotoPendiente, EVENTO_RETOMAR } from "@/lib/marketing-ia/foto-en-curso"

// ── Los tres modos, en el orden en que se aplican ────────────────────
const MODOS = [
  {
    id: "mejorar" as const,
    nombre: "Mejorar la foto",
    icono: Sun,
    resumen: "Luz, color y cielo",
    detalle: "Levanta una foto oscura o de día nublado. No mueve nada de lugar.",
  },
  {
    id: "limpiar" as const,
    nombre: "Despejar el ambiente",
    icono: Sparkles,
    resumen: "Fuera lo del dueño",
    detalle: "Saca adornos, cuadros, objetos personales y los muebles que hay hoy.",
  },
  {
    id: "ambientar" as const,
    nombre: "Amoblar",
    icono: Sofa,
    resumen: "Home staging",
    detalle: "Amuebla un ambiente vacío respetando paredes, aberturas y piso.",
  },
]

const ESTILOS = [
  { id: "moderno", nombre: "Moderno y sobrio" },
  { id: "calido", nombre: "Cálido y familiar" },
  { id: "nordico", nombre: "Nórdico" },
  { id: "clasico", nombre: "Clásico" },
]

const COLORES_ZONA = [
  { borde: "#FF0000", fondo: "rgba(255,0,0,0.22)", nombre: "Roja" },
  { borde: "#0066FF", fondo: "rgba(0,102,255,0.22)", nombre: "Azul" },
  { borde: "#00C000", fondo: "rgba(0,192,0,0.22)", nombre: "Verde" },
  { borde: "#FFD000", fondo: "rgba(255,208,0,0.22)", nombre: "Amarilla" },
  { borde: "#A000E0", fondo: "rgba(160,0,224,0.22)", nombre: "Violeta" },
]

type Zona = { x: number; y: number; w: number; h: number }
type Cambio = { zona: Zona; pedido: string }
type Paso = "propiedad" | "foto" | "opciones" | "trabajando" | "resultado"

export function FotosIA() {
  const [paso, setPaso] = useState<Paso>("propiedad")
  const [propiedad, setPropiedad] = useState<TokkoProperty | null>(null)
  const [fotoElegida, setFotoElegida] = useState<string | null>(null)
  const [fotos, setFotos] = useState<{ thumb: string; image: string }[]>([])
  const [cargandoFotos, setCargandoFotos] = useState(false)

  const [modos, setModos] = useState<Record<string, boolean>>({ mejorar: true, limpiar: false, ambientar: false })
  const [estilo, setEstilo] = useState("moderno")
  const [protegerTextos, setProtegerTextos] = useState(true)

  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [hechos, setHechos] = useState<string[]>([])
  const [resultado, setResultado] = useState<string | null>(null)
  const [relevamiento, setRelevamiento] = useState<any>(null)
  const [referencia, setReferencia] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // ── Retoque sobre el resultado ─────────────────────────────────────
  const [cambios, setCambios] = useState<Cambio[]>([])
  const [pedidoSuelto, setPedidoSuelto] = useState("")
  const [retocando, setRetocando] = useState(false)

  // Cuando se retoma una foto desde la galería, la propiedad no está cargada:
  // el título y el id vienen con la foto.
  const [tituloRetomado, setTituloRetomado] = useState("")
  const [tokkoRetomado, setTokkoRetomado] = useState<number | string | null>(null)

  // Todo lo que se le hace a una misma foto comparte sesión: así la galería
  // muestra una sola tarjeta con sus pasos adentro en vez de una por paso.
  const [sesion, setSesion] = useState<string | null>(null)

  // Avisarle a la galería que hay una foto nueva, y poder retomar una de ahí.
  const avisarGaleria = () => window.dispatchEvent(new CustomEvent("foto-ia-lista"))

  useEffect(() => {
    const aplicar = (d: any) => {
      if (!d?.url) return
      setResultado(d.url)
      setFotoElegida(d.referencia_url || d.url)
      setReferencia(d.referencia_url || d.url)
      setRelevamiento(d.relevamiento || null)
      setTituloRetomado(d.propiedad || "")
      setTokkoRetomado(d.tokko_id ?? null)
      // Se sigue en la misma sesión: el retoque entra en la tarjeta que ya existe.
      setSesion(d.sesion_id || crypto.randomUUID())
      setCambios([])
      setPedidoSuelto("")
      setAviso(null)
      setPaso("resultado")
    }
    // Al montar puede haber una foto esperando: el panel estaba desmontado
    // cuando se apretó "Seguir editando" en la galería.
    aplicar(tomarFotoPendiente())
    const alEvento = (e: any) => aplicar(e.detail)
    window.addEventListener(EVENTO_RETOMAR, alEvento)
    return () => window.removeEventListener(EVENTO_RETOMAR, alEvento)
  }, [])

  // El buscador de cartera devuelve solo la portada; las demás se piden aparte.
  const traerFotos = async (p: TokkoProperty | null) => {
    if (!p) return
    setCargandoFotos(true)
    try {
      const res = await fetch(`/api/marketing-ia/fotos-propiedad?tokko_id=${p.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudieron traer las fotos")
      setFotos(data.fotos || [])
    } catch (e: any) {
      toast.error(e.message)
      setFotos(p.photos ?? [])
    } finally {
      setCargandoFotos(false)
    }
  }

  const pedir = async (cuerpo: any) => {
    const res = await fetch("/api/marketing-ia/editar-foto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "No se pudo procesar la foto")
    return data
  }

  // ── Correr los modos elegidos, uno atrás del otro ──────────────────
  const procesar = async () => {
    const elegidos = MODOS.filter((m) => modos[m.id]).map((m) => m.id)
    if (!elegidos.length) return toast.error("Elegí al menos una cosa para hacerle a la foto")
    if (!fotoElegida) return

    const nuevaSesion = crypto.randomUUID()
    setSesion(nuevaSesion)
    setPaso("trabajando")
    setHechos([])
    setAviso(null)
    setCambios([])

    let actual = fotoElegida
    // La verdad de lo que tiene la propiedad es la foto original. Solo "mejorar"
    // puede reemplazarla como referencia, porque no mueve nada de lugar y deja
    // la foto legible para el inventario.
    let ref: string = fotoElegida
    let rel: any = null
    const sinAprobar: string[] = []

    try {
      for (const modo of elegidos) {
        setEnCurso(modo)
        const data = await pedir({
          modo,
          estilo,
          foto_url: actual,
          referencia_url: ref,
          relevamiento: rel,
          proteger_textos: protegerTextos,
          tokko_id: propiedad?.id,
          propiedad_titulo: propiedad?.title || tituloRetomado,
          sesion_id: nuevaSesion,
          foto_original: fotoElegida,
        })
        actual = data.url
        if (modo === "mejorar") {
          // La corregida pasa a ser la referencia, y el inventario se vuelve a
          // tomar de ella: sobre una foto oscura se lee mal (6 elementos en vez
          // de 8, granito confundido con madera).
          ref = data.url
          rel = null
        } else {
          rel = data.relevamiento
        }
        if (!data.aprobado) sinAprobar.push(modo)
        setHechos((h) => [...h, modo])
      }

      setResultado(actual)
      setReferencia(ref)
      setRelevamiento(rel)
      avisarGaleria()
      if (sinAprobar.length) {
        setAviso("Alguna parte quedó con detalles: mirala bien antes de publicarla.")
      }
      setPaso("resultado")
    } catch (e: any) {
      toast.error(e.message)
      setPaso("opciones")
    } finally {
      setEnCurso(null)
    }
  }

  // ── Retoque: varias zonas marcadas de una vez ──────────────────────
  const retocar = async () => {
    if (!cambios.length && !pedidoSuelto.trim())
      return toast.error("Marcá alguna zona o escribí qué querés cambiar")

    setRetocando(true)
    try {
      const data = await pedir({
        accion: "reversion",
        foto_url: resultado,
        referencia_url: referencia,
        relevamiento,
        cambios,
        pedido_suelto: pedidoSuelto,
        proteger_textos: protegerTextos,
        tokko_id: propiedad?.id ?? tokkoRetomado,
        propiedad_titulo: propiedad?.title || tituloRetomado,
        sesion_id: sesion,
        foto_original: fotoElegida,
      })
      setResultado(data.url)
      setCambios([])
      setPedidoSuelto("")
      avisarGaleria()
      setAviso(data.aprobado ? null : "El retoque quedó con detalles: revisalo.")
      toast.success("Retoque aplicado")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRetocando(false)
    }
  }

  const volverAEmpezar = () => {
    setTituloRetomado("")
    setTokkoRetomado(null)
    setPaso(propiedad ? "foto" : "propiedad")
    setResultado(null)
    setCambios([])
    setPedidoSuelto("")
    setAviso(null)
  }

  // ═══════════════════════════════════════════════════════════════════
  if (paso === "propiedad") {
    return (
      <div className="space-y-6">
        <Encabezado
          titulo="Elegí la propiedad"
          bajada="Las fotos salen de la ficha que ya está cargada. No hace falta subir nada."
        />
        <PropertySelector
          onSelect={setPropiedad}
          onContinue={() => {
            // El selector se comparte con el flujo de copys, que permite seguir
            // sin propiedad. Acá no: sin propiedad no hay fotos que trabajar.
            if (!propiedad) {
              toast.error("Elegí una propiedad: las fotos salen de su ficha")
              return
            }
            setPaso("foto")
            traerFotos(propiedad)
          }}
        />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  if (paso === "foto") {
    return (
      <div className="space-y-6">
        <Volver onClick={() => setPaso("propiedad")} texto="Cambiar de propiedad" />
        <Encabezado
          titulo="¿Qué foto querés trabajar?"
          bajada={
            cargandoFotos
              ? `${propiedad?.title ?? ""} — buscando las fotos…`
              : `${propiedad?.title ?? ""} — ${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"} en la ficha.`
          }
        />
        {cargandoFotos ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : fotos.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Esta propiedad todavía no tiene fotos cargadas en Tokko.
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {fotos.map((f, i) => (
              <button
                key={i}
                onClick={() => {
                  setFotoElegida(f.image)
                  setPaso("opciones")
                }}
                className={cn(
                  "group relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition",
                  "border-transparent hover:border-accent focus:outline-none focus:border-accent"
                )}
              >
                <img src={f.thumb || f.image} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-sm font-semibold transition">
                    Trabajar esta
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  if (paso === "opciones") {
    const elegidos = MODOS.filter((m) => modos[m.id])
    return (
      <div className="space-y-6">
        <Volver onClick={() => setPaso("foto")} texto="Elegir otra foto" />
        <Encabezado titulo="¿Qué le hacemos?" bajada="Podés elegir más de una. Se aplican en este orden." />

        <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
          <div className="space-y-3">
            {MODOS.map((m, i) => {
              const Icono = m.icono
              const activo = modos[m.id]
              return (
                <Card
                  key={m.id}
                  onClick={() => setModos((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  className={cn(
                    "p-5 cursor-pointer transition border-2",
                    activo ? "border-accent bg-accent/5" : "border-transparent hover:border-muted-foreground/20"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "w-11 h-11 rounded-xl grid place-items-center shrink-0",
                        activo ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icono className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">{m.nombre}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          paso {i + 1}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{m.detalle}</p>
                      {m.id === "ambientar" && activo && (
                        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                          <Label className="text-xs">Estilo de los muebles</Label>
                          <Select value={estilo} onValueChange={setEstilo}>
                            <SelectTrigger className="mt-1.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ESTILOS.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "w-6 h-6 rounded-md border-2 grid place-items-center shrink-0 mt-1",
                        activo ? "bg-accent border-accent" : "border-muted-foreground/30"
                      )}
                    >
                      {activo && <Check className="w-4 h-4 text-accent-foreground" />}
                    </div>
                  </div>
                </Card>
              )
            })}

            <Card className="p-4 flex items-start gap-3">
              <Switch checked={protegerTextos} onCheckedChange={setProtegerTextos} className="mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Cuidar los carteles y números</p>
                <p className="text-muted-foreground">
                  Busca sola los teléfonos, números de casa y chapas de calle, y los devuelve tal cual. Dejalo prendido.
                </p>
              </div>
            </Card>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-xl overflow-hidden border">
              {fotoElegida && <img src={fotoElegida} alt="Foto elegida" className="w-full" />}
            </div>
            <Button size="lg" className="w-full font-bold" onClick={procesar} disabled={!elegidos.length}>
              <Wand2 className="w-4 h-4 mr-2" />
              {elegidos.length ? `Trabajar la foto (${elegidos.length} paso${elegidos.length > 1 ? "s" : ""})` : "Elegí qué hacerle"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Cada paso tarda entre 45 y 90 segundos y consume{" "}
              <strong>3 créditos IA</strong>
              {elegidos.length > 1 && <> — {elegidos.length * 3} en total</>}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  if (paso === "trabajando") {
    const elegidos = MODOS.filter((m) => modos[m.id])
    return (
      <div className="max-w-lg mx-auto py-12 space-y-8">
        <div className="text-center space-y-2">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-accent" />
          <h3 className="text-xl font-bold">Trabajando la foto</h3>
          <p className="text-muted-foreground text-sm">
            Va paso por paso y revisa cada uno antes de seguir. No cierres esta pantalla.
          </p>
        </div>
        <div className="space-y-2">
          {elegidos.map((m) => {
            const listo = hechos.includes(m.id)
            const activo = enCurso === m.id
            const Icono = m.icono
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-xl border transition",
                  listo && "bg-emerald-500/5 border-emerald-500/30",
                  activo && "bg-accent/5 border-accent/40"
                )}
              >
                <div className="w-8 h-8 rounded-lg grid place-items-center bg-muted shrink-0">
                  {listo ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : activo ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Icono className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{m.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {listo ? "Listo" : activo ? "En eso…" : "Esperando"}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <Volver onClick={volverAEmpezar} texto="Trabajar otra foto" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <Encabezado titulo="Así quedó" bajada="Compará con la original. Si algo no te cierra, marcalo abajo y pedí el cambio." />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={resultado ?? "#"} download target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" /> Descargar
            </a>
          </Button>
        </div>
      </div>

      {aviso && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm">
          <span className="font-semibold">Ojo: </span>
          {aviso}
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <figure className="space-y-2">
          <figcaption className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Antes · como está en la ficha
          </figcaption>
          <div className="rounded-xl overflow-hidden border">
            {fotoElegida && <img src={fotoElegida} alt="Antes" className="w-full" />}
          </div>
        </figure>
        <figure className="space-y-2">
          <figcaption className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Después
          </figcaption>
          <div className="rounded-xl overflow-hidden border-2 border-emerald-500/40">
            {resultado && <img src={resultado} alt="Después" className="w-full" />}
          </div>
        </figure>
      </div>

      <LienzoRetoque
        foto={resultado!}
        cambios={cambios}
        setCambios={setCambios}
        pedidoSuelto={pedidoSuelto}
        setPedidoSuelto={setPedidoSuelto}
        onAplicar={retocar}
        trabajando={retocando}
      />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// Lienzo: marcar zonas arrastrando y decir qué hacer en cada una
// ═════════════════════════════════════════════════════════════════════
function LienzoRetoque({
  foto,
  cambios,
  setCambios,
  pedidoSuelto,
  setPedidoSuelto,
  onAplicar,
  trabajando,
}: {
  foto: string
  cambios: Cambio[]
  setCambios: (c: Cambio[]) => void
  pedidoSuelto: string
  setPedidoSuelto: (s: string) => void
  onAplicar: () => void
  trabajando: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dibujando, setDibujando] = useState<Zona | null>(null)
  const inicio = useRef<{ x: number; y: number } | null>(null)

  // Las zonas se guardan en proporción 0-1, así no dependen del tamaño
  // con que se muestre la foto en pantalla.
  const relativo = useCallback((e: { clientX: number; clientY: number }) => {
    const caja = ref.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width)),
      y: Math.min(1, Math.max(0, (e.clientY - caja.top) / caja.height)),
    }
  }, [])

  // El asesor marca con el mouse en la compu y con el dedo en el celular.
  const punto = (e: React.MouseEvent | React.TouchEvent) =>
    "touches" in e ? e.touches[0] || (e as any).changedTouches[0] : e

  const empezar = (e: React.MouseEvent | React.TouchEvent) => {
    if (cambios.length >= COLORES_ZONA.length || trabajando) return
    inicio.current = relativo(punto(e))
    setDibujando({ ...inicio.current, w: 0, h: 0 })
  }

  const mover = (e: React.MouseEvent | React.TouchEvent) => {
    if (!inicio.current) return
    if ("touches" in e) e.preventDefault()   // que el dedo marque en vez de scrollear
    const p = relativo(punto(e))
    setDibujando({
      x: Math.min(inicio.current.x, p.x),
      y: Math.min(inicio.current.y, p.y),
      w: Math.abs(p.x - inicio.current.x),
      h: Math.abs(p.y - inicio.current.y),
    })
  }

  const soltar = () => {
    if (dibujando && dibujando.w > 0.02 && dibujando.h > 0.02) {
      setCambios([...cambios, { zona: dibujando, pedido: "" }])
    }
    inicio.current = null
    setDibujando(null)
  }

  const zonas = dibujando ? [...cambios.map((c) => c.zona), dibujando] : cambios.map((c) => c.zona)

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <MousePointerSquareDashed className="w-5 h-5 text-accent mt-0.5 shrink-0" />
        <div>
          <h4 className="font-bold">¿Querés cambiar algo?</h4>
          <p className="text-sm text-muted-foreground">
            Arrastrá sobre la foto para encerrar lo que querés tocar. Con nombrarlo alcanza —{" "}
            <em>“el perchero”</em> — y si no escribís nada, se saca lo que quedó marcado. El sistema mira la foto y
            completa el resto. Podés marcar varias cosas y se hacen todas juntas. Para <strong>sacar</strong> algo la
            marca es exacta; para <strong>agregar</strong>, es una indicación de por dónde.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        <div
          ref={ref}
          onMouseDown={empezar}
          onMouseMove={mover}
          onMouseUp={soltar}
          onMouseLeave={soltar}
          onTouchStart={empezar}
          onTouchMove={mover}
          onTouchEnd={soltar}
          onTouchCancel={soltar}
          className={cn(
            "relative rounded-xl overflow-hidden border select-none touch-none",
            trabajando ? "cursor-wait" : "cursor-crosshair"
          )}
        >
          <img src={foto} alt="Para retocar" className="w-full pointer-events-none" draggable={false} />
          {zonas.map((z, i) => {
            const c = COLORES_ZONA[i % COLORES_ZONA.length]
            return (
              <div
                key={i}
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${z.x * 100}%`,
                  top: `${z.y * 100}%`,
                  width: `${z.w * 100}%`,
                  height: `${z.h * 100}%`,
                  background: c.fondo,
                  border: `3px solid ${c.borde}`,
                }}
              />
            )
          })}
          {!cambios.length && !dibujando && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium">
                Arrastrá (o deslizá el dedo) para marcar
              </span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {cambios.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no marcaste nada. También podés pedir algo para toda la foto acá abajo, con tus palabras.
            </p>
          )}

          {cambios.map((c, i) => {
            const color = COLORES_ZONA[i % COLORES_ZONA.length]
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-xs">
                    <span
                      className="w-3.5 h-3.5 rounded-full border-2"
                      style={{ borderColor: color.borde, background: color.fondo }}
                    />
                    Zona {color.nombre.toLowerCase()}
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground"
                    onClick={() => setCambios(cambios.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Opcional. Ej: la planta — o dejalo vacío para que lo saque"
                  value={c.pedido}
                  onChange={(e) =>
                    setCambios(cambios.map((x, j) => (j === i ? { ...x, pedido: e.target.value } : x)))
                  }
                />
              </div>
            )
          })}

          <div className="space-y-1.5 pt-1">
            <Label className="text-xs">Algo para toda la foto (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="Por ejemplo: poné cortinas claras en la ventana"
              value={pedidoSuelto}
              onChange={(e) => setPedidoSuelto(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 font-bold" onClick={onAplicar} disabled={trabajando}>
              {trabajando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aplicando…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" /> Aplicar los cambios
                </>
              )}
            </Button>
            {cambios.length > 0 && !trabajando && (
              <Button variant="outline" onClick={() => setCambios([])} title="Borrar las marcas">
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── piezas chicas ────────────────────────────────────────────────────
function Encabezado({ titulo, bajada }: { titulo: string; bajada: string }) {
  return (
    <div>
      <h3 className="text-xl font-bold tracking-tight">{titulo}</h3>
      <p className="text-muted-foreground">{bajada}</p>
    </div>
  )
}

function Volver({ onClick, texto }: { onClick: () => void; texto: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="-ml-2 text-muted-foreground">
      <ArrowLeft className="w-4 h-4 mr-2" /> {texto}
    </Button>
  )
}
