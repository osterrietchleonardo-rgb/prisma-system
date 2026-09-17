"use client"

/**
 * Chat web · La bandeja: las conversaciones que tuvo el asistente en el sitio.
 *
 * La ven el director y el asesor que el director eligió en el desplegable. Ese asesor ve solo los
 * "quiero sumarme al equipo" — el aviso de arriba se lo dice, para que no crea que está viendo
 * todo y falte algo sin que se entere.
 *
 * No se contesta desde acá a propósito: el chat web es un embudo a WhatsApp, que es donde el
 * equipo ya trabaja. Por eso el botón grande de cada conversación es "Escribirle por WhatsApp".
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Conversacion {
  id: string
  objetivo: string | null
  datos: Record<string, string> | null
  estado: string
  pagina_origen: string | null
  last_message_at: string
  mensajes_count: number
  derivada_a?: string | null
}

interface MensajeGuardado {
  rol: string
  texto: string
  created_at: string
}

const QUE_QUIERE: Record<string, string> = {
  busca_propiedad: "Busca una propiedad",
  vender_propiedad: "Quiere vender la suya",
  sumarse_equipo: "Quiere sumarse al equipo",
  consulta_empresa: "Consulta",
  reclamo: "Reclamo",
}

const soloNumeros = (t: string | undefined) => String(t ?? "").replace(/\D/g, "")

function cuando(iso: string): string {
  const fecha = new Date(iso)
  const minutos = Math.round((Date.now() - fecha.getTime()) / 60000)
  if (minutos < 60) return `hace ${Math.max(1, minutos)} min`
  if (minutos < 60 * 24) return `hace ${Math.round(minutos / 60)} h`
  return fecha.toLocaleDateString("es-AR")
}

export function BandejaChatWeb({ rol }: { rol: "director" | "asesor" }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [soloMias, setSoloMias] = useState(false)
  const [abierta, setAbierta] = useState<Conversacion | null>(null)
  const [mensajes, setMensajes] = useState<MensajeGuardado[]>([])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await fetch("/api/chat-web/bandeja")
      const d = await r.json()
      if (!r.ok) {
        setError(d.error ?? "No se pudo abrir la bandeja.")
        return
      }
      setConversaciones(d.conversaciones ?? [])
      setSoloMias(Boolean(d.soloMias))
    } catch {
      setError("No se pudo abrir la bandeja.")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function abrir(c: Conversacion) {
    setAbierta(c)
    setMensajes([])
    const r = await fetch(`/api/chat-web/bandeja?conversacion=${encodeURIComponent(c.id)}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) setMensajes(d.mensajes ?? [])
  }

  if (cargando) return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Chat de la web</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {soloMias
              ? "Vas a ver las consultas de quienes quieren sumarse al equipo."
              : "Las conversaciones que tuvo el asistente en tu sitio."}
          </p>
        </div>
        {rol === "director" && (
          <Button variant="outline" asChild className="h-11">
            <a href="/director/chat-web">Configurar el chat</a>
          </Button>
        )}
      </header>

      {!conversaciones.length && (
        <Card className="p-6 text-sm text-muted-foreground">
          Todavía no hay conversaciones. Van a aparecer acá apenas alguien escriba desde tu sitio.
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
        <ul className="space-y-2">
          {conversaciones.map((c) => {
            const d = c.datos ?? {}
            return (
              <li key={c.id}>
                <button
                  onClick={() => abrir(c)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    abierta?.id === c.id ? "border-foreground/40 bg-muted/60" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{d.nombre || "Sin nombre"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{cuando(c.last_message_at)}</span>
                  </div>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {QUE_QUIERE[c.objetivo ?? ""] ?? "Todavía no se sabe qué necesita"}
                    {c.estado === "derivada" ? " · derivada" : ""}
                  </span>
                  {(d.telefono || d.email) && (
                    <span className="mt-0.5 block truncate text-xs">{d.telefono || d.email}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {abierta && (
          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{abierta.datos?.nombre || "Sin nombre"}</p>
                <p className="text-xs text-muted-foreground">
                  {QUE_QUIERE[abierta.objetivo ?? ""] ?? "Sin definir"}
                  {abierta.pagina_origen ? ` · entró por ${abierta.pagina_origen}` : ""}
                </p>
              </div>
              {soloNumeros(abierta.datos?.telefono).length >= 10 ? (
                <Button asChild className="h-11 bg-[#25D366] text-white hover:bg-[#1eb356]">
                  <a
                    href={`https://wa.me/${soloNumeros(abierta.datos?.telefono)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Escribirle por WhatsApp
                  </a>
                </Button>
              ) : abierta.datos?.email ? (
                <Button asChild variant="outline" className="h-11">
                  <a href={`mailto:${abierta.datos.email}`}>Escribirle por email</a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">No dejó datos de contacto.</span>
              )}
            </div>

            {abierta.datos && Object.keys(abierta.datos).length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {Object.entries(abierta.datos).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-lg border p-3">
              {mensajes.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.rol === "visitante"
                      ? "ml-auto bg-foreground/10"
                      : m.rol === "sistema"
                        ? "mx-auto bg-transparent text-center text-xs text-muted-foreground"
                        : "bg-muted"
                  }`}
                >
                  {m.texto}
                </div>
              ))}
              {!mensajes.length && <p className="text-sm text-muted-foreground">Abriendo la conversación…</p>}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
