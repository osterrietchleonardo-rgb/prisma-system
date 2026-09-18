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

interface Resumen {
  total: number
  conversaron: number
  dejaronContacto: number
  soloPreguntas: number
  derivadas: number
  tasaContacto: number
  porObjetivo: Record<string, number>
  sinDefinir: number
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
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [configurado, setConfigurado] = useState(true)
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
      setResumen(d.resumen ?? null)
      setConfigurado(d.configurado !== false)
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
          <h1 className="text-xl font-semibold">Asesor IA Web</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {soloMias
              ? "Vas a ver las consultas de quienes quieren sumarse al equipo."
              : "Las conversaciones que tuvo el asistente en tu sitio."}
          </p>
        </div>
        {rol === "director" && (
          <Button variant="outline" asChild className="h-11">
            <a href="/director/configuracion?tab=integraciones">Configuración</a>
          </Button>
        )}
      </header>

      {!configurado && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
          <p className="font-medium">Todavía falta configurarlo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Para que el asistente atienda en tu web, completá el formulario de integración en{" "}
            <a
              href="/director/configuracion?tab=integraciones"
              className="font-medium underline underline-offset-2"
            >
              Configuración → Integraciones
            </a>
            . Se carga una vez: a dónde van los contactos, cuál es tu sitio y qué consulta le toca
            a cada uno.
          </p>
        </Card>
      )}

      {resumen && resumen.total > 0 && (
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Numero valor={resumen.conversaron} de={resumen.total} titulo="Conversaron" ayuda="Intercambiaron al menos un ida y vuelta. Los que abrieron el chat y se fueron no cuentan." />
            <Numero valor={resumen.dejaronContacto} titulo="Dejaron contacto" ayuda={`${resumen.tasaContacto}% de los que conversaron`} />
            <Numero valor={resumen.soloPreguntas} titulo="Solo preguntas" ayuda="Hablaron pero no dejaron teléfono ni email." />
            <Numero valor={resumen.derivadas} titulo="Derivadas al equipo" ayuda="Ya tienen los datos y el chat abierto." />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
            {Object.entries(resumen.porObjetivo)
              .filter(([, n]) => n > 0)
              .map(([objetivo, n]) => (
                <span key={objetivo} className="rounded-full border px-3 py-1 text-xs">
                  {QUE_QUIERE[objetivo] ?? objetivo}: <strong>{n}</strong>
                </span>
              ))}
            {resumen.sinDefinir > 0 && (
              <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                Sin definir: <strong>{resumen.sinDefinir}</strong>
              </span>
            )}
          </div>
        </Card>
      )}

      {!conversaciones.length && configurado && (
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

/** Un número del panel, con su explicación al lado: un número sin contexto se malinterpreta. */
function Numero({ valor, de, titulo, ayuda }: { valor: number; de?: number; titulo: string; ayuda: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">
        {valor}
        {de !== undefined && <span className="text-base font-normal text-muted-foreground"> / {de}</span>}
      </p>
      <p className="text-sm font-medium">{titulo}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p>
    </div>
  )
}
