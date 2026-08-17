"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Bot,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  Info,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

type Nota = {
  id: string
  texto: string
  autor_id: string
  autor_nombre: string
  autor_rol: string
  creado_at: string
  editado_at?: string
  puedo_tocarla?: boolean
}

interface Props {
  propertyId: string
}

const MAX_LARGO = 800

function fecha(iso?: string) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function NotasIA({ propertyId }: Props) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [botName, setBotName] = useState("tu Asesor IA")
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [maxNotas, setMaxNotas] = useState(20)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [nueva, setNueva] = useState("")
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [textoEditado, setTextoEditado] = useState("")

  const url = `/api/propiedades/${propertyId}/notas-ia`

  const cargar = useCallback(async () => {
    try {
      setCargando(true)
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "No se pudieron cargar las notas")
      setNotas(json.notas || [])
      setBotName(json.bot_name || "tu Asesor IA")
      setPuedeEditar(!!json.puede_editar)
      if (json.max_notas) setMaxNotas(json.max_notas)
    } catch (e: any) {
      toast.error(e.message || "Error al cargar las notas")
    } finally {
      setCargando(false)
    }
  }, [url])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function pedir(init: RequestInit, exito: string) {
    setGuardando(true)
    try {
      const res = await fetch(url, init)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar")
      setNotas(json.notas || [])
      toast.success(exito)
      return true
    } catch (e: any) {
      toast.error(e.message || "Error al guardar")
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function agregar() {
    const texto = nueva.trim()
    if (!texto) return
    const ok = await pedir(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      },
      "Nota agregada"
    )
    if (ok) setNueva("")
  }

  async function guardarEdicion(notaId: string) {
    const texto = textoEditado.trim()
    if (!texto) return
    const ok = await pedir(
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota_id: notaId, texto }),
      },
      "Nota actualizada"
    )
    if (ok) {
      setEditandoId(null)
      setTextoEditado("")
    }
  }

  // El DELETE lleva el id de la nota en la query, no en el body.
  async function borrarNota(nota: Nota) {
    const corta = nota.texto.length > 60 ? `${nota.texto.slice(0, 60)}…` : nota.texto
    if (!window.confirm(`¿Borrar esta nota?\n\n"${corta}"`)) return
    setGuardando(true)
    try {
      const res = await fetch(`${url}?nota_id=${encodeURIComponent(nota.id)}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "No se pudo borrar")
      setNotas(json.notas || [])
      toast.success("Nota borrada")
    } catch (e: any) {
      toast.error(e.message || "Error al borrar")
    } finally {
      setGuardando(false)
    }
  }

  const llegoAlTope = notas.length >= maxNotas

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-accent shrink-0" />
        <h4 className="text-sm font-bold uppercase tracking-widest text-accent">
          Notas para {botName}
        </h4>
        <Separator className="flex-1 bg-accent/10" />
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {puedeEditar ? (
          <>
            Anotá acá todo lo que{" "}
            <span className="font-semibold text-foreground">{botName}</span> debería saber de
            esta propiedad: detalles, condiciones, cosas que no figuran en la ficha. Las tiene
            en cuenta cuando un cliente escribe por WhatsApp.
          </>
        ) : (
          <>
            Lo que el equipo anota acá es lo que{" "}
            <span className="font-semibold text-foreground">{botName}</span> tiene en cuenta
            sobre esta propiedad cuando un cliente escribe por WhatsApp: detalles,
            condiciones, cosas que no figuran en la ficha.
          </>
        )}
      </p>

      <div className="flex items-start gap-2 rounded-lg border border-accent/15 bg-accent/5 p-3">
        <Info className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {botName} <span className="font-semibold text-foreground">no las cuenta por su
          cuenta</span>: solo usa una nota si el cliente pregunta justo por ese tema. Son
          internas, el cliente nunca ve esta pantalla.
        </p>
      </div>

      {cargando ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          {/* Alta de nota */}
          {puedeEditar ? (
            <div className="rounded-xl border border-accent/15 bg-card/30 p-4 space-y-3">
              <Textarea
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Ej: acepta mascotas chicas. La cochera va incluida. No se visita los domingos."
                rows={3}
                maxLength={MAX_LARGO}
                disabled={guardando || llegoAlTope}
                className="resize-none bg-background/60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground/70">
                  {nueva.length}/{MAX_LARGO} caracteres · {notas.length}/{maxNotas} notas
                </span>
                <Button
                  size="sm"
                  onClick={agregar}
                  disabled={guardando || !nueva.trim() || llegoAlTope}
                  className="h-9 gap-2 bg-accent hover:bg-accent/90"
                >
                  {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Agregar nota
                </Button>
              </div>
              {llegoAlTope && (
                <p className="text-[11px] text-amber-500">
                  Llegaste al máximo de {maxNotas} notas. Borrá alguna para agregar una nueva.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-dashed border-accent/20 bg-card/30 p-4">
              <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Esta propiedad no está asignada a vos, así que las notas quedan en modo
                lectura. Las puede escribir el asesor asignado o el director.
              </p>
            </div>
          )}

          {/* Lista */}
          {notas.length === 0 ? (
            <p className="text-xs text-muted-foreground/70 italic">
              Todavía no hay notas cargadas para esta propiedad.
            </p>
          ) : (
            <ul className="space-y-3">
              {notas.map((nota) => {
                const editando = editandoId === nota.id
                return (
                  <li
                    key={nota.id}
                    className="rounded-xl border border-accent/10 bg-card/30 p-4 space-y-3"
                  >
                    {editando ? (
                      <>
                        <Textarea
                          value={textoEditado}
                          onChange={(e) => setTextoEditado(e.target.value)}
                          rows={3}
                          maxLength={MAX_LARGO}
                          disabled={guardando}
                          className="resize-none bg-background/60"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground/70">
                            {textoEditado.length}/{MAX_LARGO}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1.5 border-accent/20"
                              onClick={() => {
                                setEditandoId(null)
                                setTextoEditado("")
                              }}
                              disabled={guardando}
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="h-9 gap-1.5 bg-accent hover:bg-accent/90"
                              onClick={() => guardarEdicion(nota.id)}
                              disabled={guardando || !textoEditado.trim()}
                            >
                              {guardando ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Guardar
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line break-words">
                          {nota.texto}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-accent/10 pt-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge
                              variant="outline"
                              className="h-5 border-accent/20 text-[10px] font-medium"
                            >
                              {nota.autor_nombre}
                            </Badge>
                            <span>{fecha(nota.creado_at)}</span>
                            {nota.editado_at && (
                              <span className="italic">· editada {fecha(nota.editado_at)}</span>
                            )}
                          </div>
                          {nota.puedo_tocarla && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-3 gap-1.5 text-xs"
                                onClick={() => {
                                  setEditandoId(nota.id)
                                  setTextoEditado(nota.texto)
                                }}
                                disabled={guardando}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-3 gap-1.5 text-xs text-destructive hover:text-destructive"
                                onClick={() => borrarNota(nota)}
                                disabled={guardando}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Borrar
                              </Button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
