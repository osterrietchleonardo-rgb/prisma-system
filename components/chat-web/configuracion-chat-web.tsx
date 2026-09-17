"use client"

/**
 * Chat web · La tarjeta donde el director configura el chat de su sitio.
 *
 * Tres cosas y nada más: a dónde van los contactos, qué sitio tiene que conocer el asistente, y
 * qué secciones son las importantes. Todo lo demás (logo, colores, tipografía) sale solo de
 * Marketing IA → Configuración: acá no se vuelve a cargar nada.
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Seccion {
  nombre: string
  url: string
  resumen: string
}

interface Widget {
  id: string
  sitio: string
  whatsapp_destino: string | null
  destinos_por_objetivo: Record<string, string> | null
  secciones: Seccion[] | null
  acento: string | null
  activo: boolean
  rastreo_estado: string
  rastreo_en: string | null
  rastreo_motivo: string | null
  rastreo_paginas: number
  rastreo_truncado: boolean
}

interface PaginaLeida {
  url: string
  titulo: string
  orden: number
  excluida: boolean
}

const MOTIVOS: Record<string, string> = {
  sitio_invalido: "La dirección del sitio no es válida.",
  interna: "Esa dirección apunta a una red interna y no se puede leer.",
  sin_respuesta: "El sitio no respondió. Puede estar caído o bloquear a los robots.",
  sin_texto: "Se pudo entrar, pero no se encontró texto para leer.",
  sin_vectores: "Se leyó el sitio, pero no se pudieron preparar las búsquedas.",
  sin_paginas: "No se encontró ninguna página para leer.",
}

export function ConfiguracionChatWeb() {
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const [widget, setWidget] = useState<Widget | null>(null)
  const [paginas, setPaginas] = useState<PaginaLeida[]>([])
  const [sitio, setSitio] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [whatsappEquipo, setWhatsappEquipo] = useState("")
  const [acento, setAcento] = useState("")
  const [secciones, setSecciones] = useState<Seccion[]>([])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await fetch("/api/chat-web/widget")
      const d = await r.json()
      setWidget(d.widget ?? null)
      setPaginas(d.paginas ?? [])
      if (d.widget) {
        setSitio(d.widget.sitio ?? "")
        setWhatsapp(d.widget.whatsapp_destino ?? "")
        setWhatsappEquipo(d.widget.destinos_por_objetivo?.sumarse_equipo ?? "")
        setAcento(d.widget.acento ?? "")
        setSecciones(d.widget.secciones ?? [])
      }
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo cargar la configuración." })
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function guardar() {
    setGuardando(true)
    setAviso(null)
    setErrores({})
    try {
      const r = await fetch("/api/chat-web/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sitio,
          whatsapp_destino: whatsapp,
          destinos_por_objetivo: { sumarse_equipo: whatsappEquipo },
          secciones,
          acento,
          activo: widget?.activo ?? false,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        setErrores(d.errores ?? {})
        setAviso({ tipo: "error", texto: d.error ?? "Revisá los datos marcados." })
        return
      }
      setWidget(d.widget)
      setAviso({ tipo: "ok", texto: "Guardado." })
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo guardar." })
    } finally {
      setGuardando(false)
    }
  }

  async function leerElSitio() {
    setLeyendo(true)
    setAviso(null)
    try {
      const r = await fetch("/api/chat-web/widget/rastrear", { method: "POST" })
      const d = await r.json()
      if (!r.ok) {
        setAviso({ tipo: "error", texto: d.error ?? "No se pudo leer el sitio." })
        return
      }
      const cortado = d.truncado ? " (se llegó al tope de 60 páginas)" : ""
      setAviso(
        d.estado === "ok"
          ? { tipo: "ok", texto: `Listo: se leyeron ${d.paginasLeidas} páginas${cortado}.` }
          : { tipo: "error", texto: MOTIVOS[d.motivo ?? ""] ?? "No se pudo leer el sitio." }
      )
      await cargar()
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo leer el sitio." })
    } finally {
      setLeyendo(false)
    }
  }

  const cambiarSeccion = (i: number, campo: keyof Seccion, valor: string) =>
    setSecciones((prev) => prev.map((s, j) => (j === i ? { ...s, [campo]: valor } : s)))

  if (cargando) return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold">Chat de la web</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El asistente atiende a quien entra a tu sitio, entiende qué necesita y te pasa el contacto
          por WhatsApp. Los colores y el logo los toma de Marketing IA → Configuración.
        </p>
      </header>

      {aviso && (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            aviso.tipo === "ok"
              ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-300"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-medium">A dónde van los contactos</h2>
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp que recibe los contactos</Label>
          <Input
            id="whatsapp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+54 9 11 5060-4928"
            className="h-11"
            inputMode="tel"
          />
          {errores.whatsapp_destino && <p className="text-sm text-red-600">{errores.whatsapp_destino}</p>}
          <p className="text-xs text-muted-foreground">
            Cuando alguien deja sus datos, te llega un mensaje con el resumen y el link para seguir
            la conversación por WhatsApp.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp-equipo">Para quien quiere sumarse al equipo (opcional)</Label>
          <Input
            id="whatsapp-equipo"
            value={whatsappEquipo}
            onChange={(e) => setWhatsappEquipo(e.target.value)}
            placeholder="Si lo dejás vacío, va al número de arriba"
            className="h-11"
            inputMode="tel"
          />
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-medium">Tu sitio</h2>
        <div className="space-y-2">
          <Label htmlFor="sitio">Dirección</Label>
          <Input
            id="sitio"
            value={sitio}
            onChange={(e) => setSitio(e.target.value)}
            placeholder="micasa.com.ar"
            className="h-11"
            inputMode="url"
          />
          {errores.sitio && <p className="text-sm text-red-600">{errores.sitio}</p>}
          <p className="text-xs text-muted-foreground">
            El sistema lee tu sitio para poder responder con lo que dice tu web y pasar el link
            exacto de cada sección. No entra a las fichas de cada propiedad: esas ya las tiene de
            tu cartera.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={leerElSitio} disabled={leyendo || !widget} className="h-11">
            {leyendo ? "Leyendo el sitio…" : "Leer el sitio ahora"}
          </Button>
          {!widget && <span className="text-xs text-muted-foreground">Primero guardá la dirección.</span>}
          {widget?.rastreo_en && (
            <span className="text-xs text-muted-foreground">
              Última lectura: {new Date(widget.rastreo_en).toLocaleString("es-AR")} ·{" "}
              {widget.rastreo_paginas} páginas
              {widget.rastreo_truncado ? " (tope alcanzado)" : ""}
            </span>
          )}
        </div>
        {widget?.rastreo_estado === "error" && widget.rastreo_motivo && (
          <p className="text-sm text-red-600">{MOTIVOS[widget.rastreo_motivo] ?? widget.rastreo_motivo}</p>
        )}

        {paginas.length > 0 && (
          <div className="rounded-lg border">
            <p className="border-b px-3 py-2 text-sm font-medium">
              Lo que el asistente sabe de tu web ({new Set(paginas.map((p) => p.url)).size} páginas)
            </p>
            <ul className="max-h-64 divide-y overflow-y-auto text-sm">
              {[...new Map(paginas.map((p) => [p.url, p])).values()].map((p) => (
                <li key={p.url} className="px-3 py-2">
                  <span className="block truncate font-medium">{p.titulo || p.url}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.url}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="font-medium">Las secciones importantes</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Lo que vos cargás acá manda sobre lo que encuentre solo. Es el mapa: a dónde querés que
            mande a alguien que pregunta por tasaciones, por alquileres o por sumarse al equipo.
          </p>
        </div>

        {secciones.map((s, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={s.nombre}
                onChange={(e) => cambiarSeccion(i, "nombre", e.target.value)}
                placeholder="Tasaciones"
                className="h-11"
                aria-label={`Nombre de la sección ${i + 1}`}
              />
              <Input
                value={s.url}
                onChange={(e) => cambiarSeccion(i, "url", e.target.value)}
                placeholder="https://micasa.com.ar/tasaciones"
                className="h-11"
                inputMode="url"
                aria-label={`Link de la sección ${i + 1}`}
              />
            </div>
            <Input
              value={s.resumen}
              onChange={(e) => cambiarSeccion(i, "resumen", e.target.value)}
              placeholder="En dos líneas: qué hay en esta sección"
              className="h-11"
              aria-label={`Qué hay en la sección ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              className="h-11 text-red-600"
              onClick={() => setSecciones((prev) => prev.filter((_, j) => j !== i))}
            >
              Quitar
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => setSecciones((prev) => [...prev, { nombre: "", url: "", resumen: "" }])}
        >
          Agregar una sección
        </Button>
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="font-medium">Color del chat (opcional)</h2>
        <p className="text-xs text-muted-foreground">
          Por defecto usa el color de tu marca. Si querés otro solo para el chat, ponelo acá; el
          sistema ajusta solo los contrastes para que todo se lea.
        </p>
        <div className="flex items-center gap-3">
          <Input
            value={acento}
            onChange={(e) => setAcento(e.target.value)}
            placeholder="#b87333"
            className="h-11 max-w-[180px]"
            aria-label="Color del chat"
          />
          <span
            aria-hidden
            className="h-9 w-9 rounded-full border"
            style={{ background: /^#[0-9a-fA-F]{3,6}$/.test(acento) ? acento : "transparent" }}
          />
        </div>
        {errores.acento && <p className="text-sm text-red-600">{errores.acento}</p>}
      </Card>

      <div className="sticky bottom-0 flex justify-end bg-background/80 py-3 backdrop-blur">
        <Button onClick={guardar} disabled={guardando} className="h-11 min-w-[140px]">
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  )
}
