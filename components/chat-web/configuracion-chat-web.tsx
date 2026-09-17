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

interface PersonaDelEquipo {
  id: string
  nombre: string
  rol: string
  tieneEmail: boolean
  tieneCelular: boolean
}

interface Widget {
  id: string
  sitio: string
  whatsapp_destino: string | null
  email_destino: string | null
  perfil_equipo_id: string | null
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
  const [whatsapp2, setWhatsapp2] = useState("")
  const [email, setEmail] = useState("")
  const [email2, setEmail2] = useState("")
  const [perfilEquipo, setPerfilEquipo] = useState("ninguno")
  const [equipo, setEquipo] = useState<PersonaDelEquipo[]>([])
  const [acento, setAcento] = useState("")
  const [secciones, setSecciones] = useState<Seccion[]>([])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [r, rEquipo] = await Promise.all([fetch("/api/chat-web/widget"), fetch("/api/chat-web/equipo")])
      const d = await r.json()
      const dEquipo = await rEquipo.json().catch(() => ({ equipo: [] }))
      setEquipo(dEquipo.equipo ?? [])
      setWidget(d.widget ?? null)
      setPaginas(d.paginas ?? [])
      if (d.widget) {
        setSitio(d.widget.sitio ?? "")
        // Lo ya guardado se da por verificado: no se le pide al director que lo reescriba.
        setWhatsapp(d.widget.whatsapp_destino ?? "")
        setWhatsapp2(d.widget.whatsapp_destino ?? "")
        setEmail(d.widget.email_destino ?? "")
        setEmail2(d.widget.email_destino ?? "")
        setPerfilEquipo(d.widget.perfil_equipo_id ?? "ninguno")
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
          email_destino: email,
          perfil_equipo_id: perfilEquipo,
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

  // La doble verificación no sirve de nada si igual se puede guardar: el botón se apaga.
  const contactosVerificados =
    whatsapp.trim() === whatsapp2.trim() && email.trim() === email2.trim()

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

      <Card className="space-y-5 p-4 sm:p-5">
        <div>
          <h2 className="font-medium">A dónde van los contactos</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuando alguien deja sus datos, te llega el resumen con un botón para escribirle por
            WhatsApp en un toque. Los dos campos se escriben dos veces a propósito: un dígito mal
            y el contacto se pierde sin que nadie se entere.
          </p>
        </div>

        <CampoVerificado
          id="whatsapp"
          etiqueta="WhatsApp que recibe los contactos"
          valor={whatsapp}
          repetido={whatsapp2}
          onValor={setWhatsapp}
          onRepetido={setWhatsapp2}
          placeholder="+54 9 11 5060-4928"
          tipo="tel"
          error={errores.whatsapp_destino}
        />

        <CampoVerificado
          id="email"
          etiqueta="Email que recibe los contactos"
          valor={email}
          repetido={email2}
          onValor={setEmail}
          onRepetido={setEmail2}
          placeholder="leads@tuinmobiliaria.com.ar"
          tipo="email"
          error={errores.email_destino}
          ayuda="Este es el que funciona desde el primer día: no depende de que WhatsApp apruebe nada."
        />

        <div className="space-y-2">
          <Label htmlFor="perfil-equipo">Quién recibe los «quiero sumarme al equipo»</Label>
          <select
            id="perfil-equipo"
            value={perfilEquipo}
            onChange={(e) => setPerfilEquipo(e.target.value)}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="ninguno">Que vayan al contacto de arriba</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.tieneEmail}>
                {p.nombre} · {p.rol}
                {p.tieneEmail ? "" : " (sin email cargado)"}
              </option>
            ))}
          </select>
          {errores.perfil_equipo_id && <p className="text-sm text-red-600">{errores.perfil_equipo_id}</p>}
          <p className="text-xs text-muted-foreground">
            Se elige de tu equipo: el sistema ya sabe su celular y su email, así que no hay nada
            que escribir ni nada que se pueda tipear mal.
          </p>
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

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="font-medium">Cómo va a quedar en tu web</h2>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-2">
            <span aria-hidden>{widget ? "✓" : "1."}</span>
            <span className={widget ? "text-muted-foreground" : ""}>
              Configurar a dónde van los contactos y cuál es tu sitio.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>{widget?.rastreo_estado === "ok" ? "✓" : "2."}</span>
            <span className={widget?.rastreo_estado === "ok" ? "text-muted-foreground" : ""}>
              Leer tu sitio, para que el asistente sepa de qué habla tu web.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>3.</span>
            <span>
              <strong>El código para pegar en tu web.</strong> Todavía no está: aparece acá, para
              copiar y pegar, cuando el asistente esté terminado. Hasta entonces no tendría a quién
              contestarle.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>✓</span>
            <span className="text-muted-foreground">
              <strong>La bandeja</strong> ya está:{" "}
              <a href="/director/chat-web/bandeja" className="underline">
                ver las conversaciones
              </a>
              . La ves vos, y el asesor que elijas arriba (solo los que quieren sumarse al equipo).
            </span>
          </li>
        </ol>
      </Card>

      <div className="sticky bottom-0 flex justify-end bg-background/80 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {!contactosVerificados && (
            <span className="text-sm text-red-600">Los datos de contacto no coinciden.</span>
          )}
          <Button
            onClick={guardar}
            disabled={guardando || !contactosVerificados}
            className="h-11 min-w-[140px]"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Un dato de contacto se escribe DOS veces, y la segunda no se puede pegar. Es el mismo criterio
 * del alta manual de contactos: un dígito mal en el WhatsApp o una letra de menos en el email y
 * los leads se pierden en silencio, que es la peor forma de perderlos.
 */
function CampoVerificado(props: {
  id: string
  etiqueta: string
  valor: string
  repetido: string
  onValor: (v: string) => void
  onRepetido: (v: string) => void
  placeholder: string
  tipo: "tel" | "email"
  error?: string
  ayuda?: string
}) {
  const bloquearPegar = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault()
  const escrito = props.valor.trim().length > 0
  const coincide = props.valor.trim() === props.repetido.trim()

  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.etiqueta}</Label>
      <Input
        id={props.id}
        value={props.valor}
        onChange={(e) => props.onValor(e.target.value)}
        placeholder={props.placeholder}
        className="h-11"
        inputMode={props.tipo === "tel" ? "tel" : "email"}
        autoComplete="off"
      />
      <Input
        id={`${props.id}-repetir`}
        value={props.repetido}
        onChange={(e) => props.onRepetido(e.target.value)}
        onPaste={bloquearPegar}
        onDrop={bloquearPegar}
        placeholder="Escribilo de nuevo para confirmar"
        className="h-11"
        inputMode={props.tipo === "tel" ? "tel" : "email"}
        autoComplete="off"
        aria-label={`Confirmar ${props.etiqueta.toLowerCase()}`}
      />
      {escrito && (
        <p className={`text-sm ${coincide ? "text-emerald-600" : "text-red-600"}`}>
          {coincide ? "✓ Coinciden" : "✗ No coinciden"}
        </p>
      )}
      {props.error && <p className="text-sm text-red-600">{props.error}</p>}
      {props.ayuda && <p className="text-xs text-muted-foreground">{props.ayuda}</p>}
    </div>
  )
}
