"use client"

/**
 * Las fotos retocadas, dentro del Historial.
 *
 * Una foto trabajada con los tres modos son tres filas de `property_photos`,
 * pero para el asesor es UNA foto. Por eso se agrupan por `sesion_id` y se
 * muestra una sola tarjeta, que se abre y deja recorrer los pasos como un
 * carrusel: primero la original de la ficha, después cada paso.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Loader2, Download, Wand2, ImageIcon, Search, Trash2, Sun, Sparkles, Sofa,
  PencilLine, ChevronLeft, ChevronRight, Layers,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { dejarFotoParaEditar } from "@/lib/marketing-ia/foto-en-curso"

type Paso = {
  id: string
  public_url: string
  storage_path: string
  modo: string
  width: number
  height: number
  created_at: string
  sesion_id: string
  tokko_id: number | null
  propiedad: string | null
  foto_original: string | null
  referencia_url: string | null
  relevamiento: any
  aprobado: boolean
}

type Grupo = {
  clave: string
  propiedad: string
  tokkoId: number | string | null
  original: string | null
  pasos: Paso[]
  ultimo: Paso
}

const ETIQUETAS: Record<string, { texto: string; icono: any }> = {
  mejorar: { texto: "Mejorada", icono: Sun },
  limpiar: { texto: "Despejada", icono: Sparkles },
  ambientar: { texto: "Amoblada", icono: Sofa },
  retoque: { texto: "Retocada", icono: PencilLine },
}
const etiquetaDe = (style: string) => ETIQUETAS[style] || { texto: style, icono: ImageIcon }

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  })

export function GaleriaFotos() {
  const [pasos, setPasos] = useState<Paso[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [borrando, setBorrando] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const supabase = createClient()

  const traer = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("property_photos")
        .select(
          "id, public_url, storage_path, modo, width, height, created_at, sesion_id, tokko_id, propiedad, foto_original, referencia_url, relevamiento, aprobado"
        )
        .order("created_at", { ascending: true })
        .limit(400)
      if (error) throw error
      setPasos((data || []) as Paso[])
    } catch (e: any) {
      toast.error("No se pudieron traer las fotos: " + e.message)
    } finally {
      setCargando(false)
    }
  }, [supabase])

  useEffect(() => {
    traer()
    const alGenerar = () => traer()
    window.addEventListener("foto-ia-lista", alGenerar)
    return () => window.removeEventListener("foto-ia-lista", alGenerar)
  }, [traer])

  // ── Una tarjeta por sesión de trabajo ──────────────────────────────
  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Paso[]>()
    for (const p of pasos) {
      const clave = p.sesion_id || `suelta-${p.id}`
      mapa.set(clave, [...(mapa.get(clave) || []), p])
    }
    return Array.from(mapa.entries())
      .map(([clave, lista]) => {
        const ordenados = [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at))
        const ultimo = ordenados[ordenados.length - 1]
        return {
          clave,
          propiedad: ultimo.propiedad || `Propiedad ${ultimo.tokko_id ?? ""}`,
          tokkoId: ultimo.tokko_id,
          original: ordenados[0].foto_original,
          pasos: ordenados,
          ultimo,
        }
      })
      .sort((a, b) => b.ultimo.created_at.localeCompare(a.ultimo.created_at))
  }, [pasos])

  const filtrados = grupos.filter((g) => {
    const t = busqueda.toLowerCase().trim()
    if (!t) return true
    return (
      g.propiedad.toLowerCase().includes(t) ||
      String(g.tokkoId || "").includes(t) ||
      g.pasos.some((p) => etiquetaDe(p.modo).texto.toLowerCase().includes(t))
    )
  })

  // ── Acciones sobre un paso ─────────────────────────────────────────
  const descargar = async (paso: Paso, propiedad: string) => {
    try {
      const res = await fetch(paso.public_url)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      const limpio = propiedad.replace(/[^\w\s-]/g, "").trim().slice(0, 40) || "foto"
      a.href = url
      a.download = `${limpio}-${paso.modo}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error("No se pudo descargar la foto")
    }
  }

  const seguirEditando = (paso: Paso) => {
    dejarFotoParaEditar({
      url: paso.public_url,
      referencia_url: paso.referencia_url || paso.public_url,
      relevamiento: paso.relevamiento,
      tokko_id: paso.tokko_id,
      propiedad: paso.propiedad || "",
      sesion_id: paso.sesion_id,
    })
  }

  const borrar = async (paso: Paso) => {
    setBorrando(paso.id)
    try {
      await supabase.storage.from("marketing-images").remove([paso.storage_path])
      const { error } = await supabase.from("property_photos").delete().eq("id", paso.id)
      if (error) throw error
      setPasos((ps) => ps.filter((x) => x.id !== paso.id))
      toast.success("Paso borrado")
    } catch (e: any) {
      toast.error("No se pudo borrar: " + e.message)
    } finally {
      setBorrando(null)
    }
  }

  // ── Estados vacíos ─────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
        <p className="text-muted-foreground font-medium">Buscando tus fotos…</p>
      </div>
    )
  }

  if (!grupos.length) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/10 rounded-3xl border border-dashed border-muted">
        <ImageIcon className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
        <h3 className="text-xl font-bold">Todavía no retocaste ninguna foto</h3>
        <p className="text-muted-foreground max-w-sm mt-2">
          Andá a la solapa <strong>Fotos</strong>, elegí una propiedad y trabajá alguna de sus fotos.
        </p>
      </div>
    )
  }

  const grupoAbierto = grupos.find((g) => g.clave === abierto) || null

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por propiedad…"
          className="pl-10 h-10 rounded-xl"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtrados.map((g) => {
          const et = etiquetaDe(g.ultimo.modo)
          const Icono = et.icono
          return (
            <Card
              key={g.clave}
              onClick={() => setAbierto(g.clave)}
              className="overflow-hidden flex flex-col cursor-pointer transition hover:border-accent group"
            >
              <div className="relative aspect-[16/10] bg-muted">
                <img
                  src={g.ultimo.public_url}
                  alt={g.propiedad}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <Badge className="absolute top-3 left-3 gap-1.5 shadow-sm">
                  <Icono className="w-3 h-3" /> {et.texto}
                </Badge>
                {g.pasos.length > 1 && (
                  <Badge variant="secondary" className="absolute top-3 right-3 gap-1.5 shadow-sm">
                    <Layers className="w-3 h-3" /> {g.pasos.length} pasos
                  </Badge>
                )}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-sm font-semibold transition">
                    Ver los pasos
                  </span>
                </span>
              </div>
              <div className="p-4">
                <p className="font-semibold truncate" title={g.propiedad}>{g.propiedad}</p>
                <p className="text-xs text-muted-foreground">
                  {fecha(g.ultimo.created_at)}
                  {g.ultimo.width ? ` · ${g.ultimo.width}×${g.ultimo.height}` : ""}
                </p>
              </div>
            </Card>
          )
        })}
      </div>

      {!filtrados.length && (
        <p className="text-center text-muted-foreground py-10">Ninguna foto coincide con esa búsqueda.</p>
      )}

      <Dialog open={!!grupoAbierto} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          {grupoAbierto && (
            <Carrusel
              key={grupoAbierto.clave}
              grupo={grupoAbierto}
              borrando={borrando}
              onDescargar={descargar}
              onSeguir={(p) => { seguirEditando(p); setAbierto(null) }}
              onBorrar={borrar}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// El carrusel: la original primero, después cada paso
// ═════════════════════════════════════════════════════════════════════
function Carrusel({
  grupo, borrando, onDescargar, onSeguir, onBorrar,
}: {
  grupo: Grupo
  borrando: string | null
  onDescargar: (p: Paso, propiedad: string) => void
  onSeguir: (p: Paso) => void
  onBorrar: (p: Paso) => void
}) {
  // La original va como primera diapositiva: se ve de dónde salió.
  const slides = useMemo(
    () => [
      ...(grupo.original
        ? [{
            url: grupo.original,
            paso: null as Paso | null,
            titulo: "Como estaba en la ficha",
            icono: ImageIcon as any,
            cuando: "",
          }]
        : []),
      ...grupo.pasos.map((p) => {
        const et = etiquetaDe(p.modo)
        return {
          url: p.public_url,
          paso: p as Paso | null,
          titulo: et.texto,
          icono: et.icono,
          cuando: fecha(p.created_at),
        }
      }),
    ],
    [grupo]
  )

  const [i, setI] = useState(slides.length - 1) // arranca en el resultado más nuevo
  const tocado = useRef<number | null>(null)
  const indice = Math.max(0, Math.min(i, slides.length - 1))
  const actual = slides[indice]

  const ir = useCallback(
    (d: number) => setI((v) => Math.max(0, Math.min(slides.length - 1, v + d))),
    [slides.length]
  )

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") ir(-1)
      if (e.key === "ArrowRight") ir(1)
    }
    window.addEventListener("keydown", teclas)
    return () => window.removeEventListener("keydown", teclas)
  }, [ir])

  if (!actual) return null
  const Icono = actual.icono

  return (
    <div className="flex flex-col">
      <DialogTitle className="sr-only">{grupo.propiedad}</DialogTitle>

      <div className="px-5 pt-5 pb-3">
        <p className="font-bold text-lg truncate">{grupo.propiedad}</p>
        <p className="text-sm text-muted-foreground">
          {grupo.pasos.length} {grupo.pasos.length === 1 ? "paso" : "pasos"} sobre esta foto
        </p>
      </div>

      <div
        className="relative bg-muted select-none"
        onTouchStart={(e) => { tocado.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (tocado.current === null) return
          const d = e.changedTouches[0].clientX - tocado.current
          if (Math.abs(d) > 45) ir(d < 0 ? 1 : -1)
          tocado.current = null
        }}
      >
        <img src={actual.url} alt={actual.titulo} className="w-full max-h-[60vh] object-contain" />

        {slides.length > 1 && (
          <>
            <button
              onClick={() => ir(-1)}
              disabled={indice === 0}
              aria-label="Anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/85 backdrop-blur grid place-items-center shadow disabled:opacity-30 hover:bg-background transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => ir(1)}
              disabled={indice === slides.length - 1}
              aria-label="Siguiente"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/85 backdrop-blur grid place-items-center shadow disabled:opacity-30 hover:bg-background transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <Badge className="absolute top-4 left-4 gap-1.5 shadow-sm">
          <Icono className="w-3 h-3" /> {actual.titulo}
        </Badge>
      </div>

      {/* los pasos, para saltar directo a uno */}
      {slides.length > 1 && (
        <div className="flex gap-2 px-5 py-3 overflow-x-auto scrollbar-none border-b">
          {slides.map((s, j) => (
            <button
              key={j}
              onClick={() => setI(j)}
              className={cn(
                "shrink-0 rounded-lg overflow-hidden border-2 transition w-20 aspect-[16/10]",
                j === indice ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"
              )}
              title={s.titulo}
            >
              <img src={s.url} alt={s.titulo} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="px-5 py-4 flex flex-wrap items-center gap-2">
        {actual.paso ? (
          <>
            <span className="text-xs text-muted-foreground mr-auto">{actual.cuando}</span>
            <Button size="sm" className="font-semibold" onClick={() => onSeguir(actual.paso!)}>
              <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Seguir editando
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDescargar(actual.paso!, grupo.propiedad)}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => { onBorrar(actual.paso!); ir(-1) }}
              disabled={borrando === actual.paso.id}
              title="Borrar este paso"
            >
              {borrando === actual.paso.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />}
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground mr-auto">
              La foto original de la ficha. No se toca ni se borra desde acá.
            </span>
            <Button size="sm" variant="outline" asChild>
              <a href={actual.url} target="_blank" rel="noreferrer">Abrir la original</a>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
