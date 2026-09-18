"use client"

/**
 * Asesor IA Web · la tarjeta de la solapa Integraciones.
 *
 * Tiene la misma forma que la de Google Calendar: dice en qué estado está y ofrece el botón que
 * corresponde. El formulario completo (que es largo) vive en un popup, así la solapa queda libre
 * para las demás integraciones (Leonardo, 18/9).
 *
 * Tres estados, y cada uno con su acción a la vista, porque "está apagado" sin un botón para
 * prenderlo no le sirve a nadie:
 *   sin conectar       → Conectar (abre el popup)
 *   conectado, apagado → Prender el chat
 *   atendiendo         → Apagar
 */
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Globe, Link2, Loader2, Pencil, Power, PowerOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfiguracionChatWeb } from "@/components/chat-web/configuracion-chat-web"

interface Estado {
  conectado: boolean
  encendido: boolean
  sitio: string | null
}

/** "https://www.vakdor.com/" → "vakdor.com". Si no se puede leer, se muestra tal cual vino. */
function nombreDelSitio(sitio: string | null): string | null {
  if (!sitio) return null
  try {
    return new URL(sitio).hostname.replace(/^www\./, "")
  } catch {
    return sitio
  }
}

export function TarjetaIntegracionChatWeb({ alConectar }: { alConectar?: () => void } = {}) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [noSePudoLeer, setNoSePudoLeer] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [cambiando, setCambiando] = useState(false)
  const [error, setError] = useState("")

  const mirar = useCallback(async () => {
    try {
      const r = await fetch("/api/chat-web/widget")
      if (!r.ok) throw new Error("no se pudo leer")
      const d = await r.json()
      setEstado({
        conectado: Boolean(d?.widget?.id),
        encendido: Boolean(d?.widget?.activo),
        sitio: d?.widget?.sitio ?? null,
      })
      setNoSePudoLeer(false)
    } catch {
      // Si no se pudo preguntar, no se afirma ni que está ni que no está.
      setEstado(null)
      setNoSePudoLeer(true)
    }
  }, [])

  useEffect(() => {
    void mirar()
  }, [mirar])

  async function cambiarInterruptor(prender: boolean) {
    setCambiando(true)
    setError("")
    try {
      const r = await fetch("/api/chat-web/widget/encender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: prender }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(d?.error ?? "No se pudo cambiar. Probá de nuevo.")
        return
      }
      setEstado((v) => (v ? { ...v, encendido: Boolean(d?.widget?.activo) } : v))
    } catch {
      setError("No se pudo cambiar: revisá tu conexión.")
    } finally {
      setCambiando(false)
    }
  }

  function alGuardarElFormulario() {
    setAbierto(false)
    void mirar()
    alConectar?.()
  }

  const sitio = nombreDelSitio(estado?.sitio ?? null)

  return (
    <>
      <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent" />
            Asesor IA Web
          </CardTitle>
          <CardDescription>
            El asistente atiende a quien entra a <strong>tu sitio</strong>, entiende qué necesita y
            te pasa el contacto por WhatsApp y por email. Los colores y el logo los toma de
            Marketing IA → Configuración.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {noSePudoLeer ? (
            <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-500">
              No se pudo verificar la conexión. Recargá la página y volvé a probar.
            </div>
          ) : !estado ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexión...
            </div>
          ) : !estado.conectado ? (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-accent/20 bg-accent/5 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-accent/10 p-2">
                  <Globe className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Sin conectar</h4>
                  <p className="text-xs text-muted-foreground">
                    Se carga una vez: a dónde van los contactos y cuál es tu sitio.
                  </p>
                </div>
              </div>
              <Button
                className="h-11 gap-2 bg-accent hover:bg-accent/90"
                onClick={() => setAbierto(true)}
              >
                <Link2 className="h-4 w-4" /> Conectar el Asesor IA Web
              </Button>
            </div>
          ) : estado.encendido ? (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Conectado y atendiendo</h4>
                  <p className="text-xs text-muted-foreground">
                    {sitio ? `Está atendiendo en ${sitio}` : "Está atendiendo en tu sitio"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="h-11 gap-2" onClick={() => setAbierto(true)}>
                  <Pencil className="h-4 w-4" /> Ver y editar
                </Button>
                <Button
                  variant="outline"
                  className="h-11 gap-2"
                  disabled={cambiando}
                  onClick={() => void cambiarInterruptor(false)}
                >
                  {cambiando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PowerOff className="h-4 w-4" />
                  )}
                  Apagar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/10 p-2">
                  <PowerOff className="h-5 w-5 text-amber-700 dark:text-amber-500" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Conectado, pero apagado</h4>
                  <p className="text-xs text-muted-foreground">
                    Mientras esté apagado no atiende a nadie en tu web. Prendelo cuando el código
                    ya esté pegado en tu sitio.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="h-11 gap-2" onClick={() => setAbierto(true)}>
                  <Pencil className="h-4 w-4" /> Ver y editar
                </Button>
                <Button
                  className="h-11 gap-2 bg-accent hover:bg-accent/90"
                  disabled={cambiando}
                  onClick={() => void cambiarInterruptor(true)}
                >
                  {cambiando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  Prender el chat
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p role="status" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        {/* Ancho fijo y generoso: adentro hay una línea de código larga y una lista de páginas,
            y con el ancho por defecto el popup terminaba con barra horizontal. */}
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-[min(56rem,95vw)] overflow-y-auto overflow-x-hidden border-accent/20 bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-accent" />
              Asesor IA Web
            </DialogTitle>
            <DialogDescription>
              Tres cosas: a dónde van los contactos, qué sitio tiene que conocer el asistente y qué
              secciones son las importantes.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0">
            <ConfiguracionChatWeb alGuardar={alGuardarElFormulario} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
