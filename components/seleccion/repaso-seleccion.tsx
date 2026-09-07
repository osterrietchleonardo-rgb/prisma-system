"use client"

// El repaso antes de generar la ficha.
//
// Acá el asesor LEE Y CORRIGE lo que va a ver su cliente: el título y la descripción de cada
// propiedad, más una nota opcional suya. Lo que quede en esta pantalla es exactamente lo que
// se publica.
//
// POR QUÉ EXISTE ESTA PANTALLA: la descripción de un aviso de la red viene tal como la
// escribió la inmobiliaria que publica, y ahí adentro suele venir su identidad — 55% de los
// avisos traen matrícula o corredor, 42% el nombre del publicador. Limpiarlo solo NO es
// confiable: en un aviso "Goyena Bienes Raíces" matcheaba con "Av. Pedro Goyena 1600", que es
// la calle de la propiedad. Así que la máquina señala y la persona decide (lib/seleccion/textos.ts).
//
// Portal a <body> por lo mismo que la barra: esto se abre también desde la solapa del mapa,
// donde las capas de Leaflet le ganan a cualquier z-index normal.
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { useSeleccion } from "./seleccion-contexto"
import { fragmentosSeguros, menciones, sacarFragmentos } from "@/lib/seleccion/textos"

const MAX_NOTA = 400
const MAX_NOTA_FINAL = 1000
const MAX_TITULO = 200
const MAX_DESCRIPCION = 4000

interface TextoDePropiedad {
  id: string
  titulo: string
  descripcion: string
  publicador: string | null
}

export function RepasoSeleccion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const seleccion = useSeleccion()
  const [montado, setMontado] = useState(false)
  const [notaFinal, setNotaFinal] = useState("")
  const [creando, setCreando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [errorAlCargar, setErrorAlCargar] = useState<string | null>(null)
  const [textos, setTextos] = useState<Record<string, { titulo: string; descripcion: string; publicador: string | null }>>({})
  useEffect(() => setMontado(true), [])

  const items = seleccion?.items ?? []
  const clave = items.map((i) => i.id).join("|")

  // Los textos se piden al servidor porque el listado del mapa trae solo la portada: la
  // descripción completa —que es justo la que hay que revisar— no está en pantalla.
  const traerTextos = useCallback(async () => {
    if (items.length === 0) return
    setCargando(true)
    setErrorAlCargar(null)
    try {
      const res = await fetch("/api/seleccion/textos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propiedades: items.map((i) => ({ source: i.source, id: i.id })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No pudimos traer los textos.")
      const mapa: Record<string, { titulo: string; descripcion: string; publicador: string | null }> = {}
      for (const t of data.textos as TextoDePropiedad[]) {
        mapa[t.id] = { titulo: t.titulo, descripcion: t.descripcion, publicador: t.publicador }
      }
      setTextos(mapa)
      if (data.omitidas?.length > 0) {
        toast.warning(
          data.omitidas.length === 1
            ? "Una de las propiedades ya no está publicada y no va a entrar en la ficha."
            : `${data.omitidas.length} propiedades ya no están publicadas y no van a entrar en la ficha.`,
        )
      }
    } catch (e: any) {
      setErrorAlCargar(e.message || "No pudimos traer los textos.")
    } finally {
      setCargando(false)
    }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (abierto) traerTextos()
  }, [abierto, traerTextos])

  if (!seleccion || !montado || !abierto || items.length === 0) return null

  const editar = (id: string, campo: "titulo" | "descripcion", valor: string) =>
    setTextos((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))

  const crear = async () => {
    if (creando) return
    setCreando(true)
    try {
      const res = await fetch("/api/seleccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propiedades: items.map((i) => ({
            source: i.source,
            id: i.id,
            nota: i.nota,
            titulo: textos[i.id]?.titulo ?? "",
            descripcion: textos[i.id]?.descripcion ?? "",
          })),
          nota_final: notaFinal,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No pudimos armar la ficha.")

      const url = `${window.location.origin}${data.path}`
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        /* sin clipboard */
      }
      window.open(data.path, "_blank", "noopener")

      if (data.omitidas?.length > 0) {
        // Nunca se descarta una propiedad en silencio.
        toast.warning(
          `La ficha está lista, pero ${
            data.omitidas.length === 1
              ? "una propiedad no entró porque ya no está publicada"
              : `${data.omitidas.length} propiedades no entraron porque ya no están publicadas`
          }.`,
        )
      } else {
        toast.success("Ficha lista y link copiado. Ya podés pegarlo en WhatsApp.")
      }

      seleccion.vaciar()
      setNotaFinal("")
      setTextos({})
      onCerrar()
    } catch (e: any) {
      toast.error(e.message || "No pudimos armar la ficha.")
    } finally {
      setCreando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Repasá antes de mandar</h2>
            <p className="text-sm text-muted-foreground">
              Esto es lo que va a leer tu cliente. Corregí lo que quieras: se manda tal cual quede acá.
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cargando && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Trayendo los textos…
            </div>
          )}

          {errorAlCargar && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-sm">{errorAlCargar}</p>
              <button onClick={traerTextos} className="text-sm font-semibold underline">
                Probar de nuevo
              </button>
            </div>
          )}

          {!cargando && !errorAlCargar && (
            <>
              <div className="flex flex-col gap-5">
                {items.map((item, i) => {
                  const t = textos[item.id]
                  const descripcion = t?.descripcion ?? ""
                  const aSacar = fragmentosSeguros(descripcion)
                  const nombres = menciones(descripcion, t?.publicador)

                  return (
                    <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 text-xs font-bold text-muted-foreground">{i + 1}</span>
                        {item.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.foto} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-14 w-20 shrink-0 rounded-lg bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">
                            {item.precio > 0
                              ? `${item.moneda === "ARS" ? "$" : "USD"} ${item.precio.toLocaleString("es-AR")}`
                              : "Consultar"}
                          </p>
                        </div>
                        <button
                          onClick={() => seleccion.sacar(item.id)}
                          className="shrink-0 text-xs text-muted-foreground underline transition-colors hover:text-foreground"
                        >
                          Sacar
                        </button>
                      </div>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground">Título</span>
                        <input
                          value={t?.titulo ?? ""}
                          onChange={(e) => editar(item.id, "titulo", e.target.value.slice(0, MAX_TITULO))}
                          className="w-full rounded-lg border bg-background p-2 text-sm"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground">Descripción</span>
                        <textarea
                          value={descripcion}
                          onChange={(e) => editar(item.id, "descripcion", e.target.value.slice(0, MAX_DESCRIPCION))}
                          rows={6}
                          className="w-full resize-y rounded-lg border bg-background p-2 text-sm leading-relaxed"
                        />
                      </label>

                      {/* Lo que hay que mirar. Nada se borra solo. */}
                      {aSacar.length > 0 && (
                        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <p className="text-xs">
                              Esto identifica a la inmobiliaria que publica. Si lo dejás, tu cliente lo va a leer.
                            </p>
                          </div>
                          <ul className="flex flex-col gap-1 pl-6">
                            {aSacar.map((f, k) => (
                              <li key={k} className="text-xs italic text-muted-foreground">
                                «{f.length > 110 ? f.slice(0, 110) + "…" : f}»
                              </li>
                            ))}
                          </ul>
                          <button
                            onClick={() => editar(item.id, "descripcion", sacarFragmentos(descripcion, aSacar))}
                            className="self-start rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                          >
                            {aSacar.length === 1 ? "Sacar esta frase" : `Sacar estas ${aSacar.length} frases`}
                          </button>
                        </div>
                      )}

                      {nombres.length > 0 && (
                        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                          También aparece <strong>{nombres.join(", ")}</strong> en el texto. Puede ser el nombre de
                          la inmobiliaria… o el de la calle. Miralo vos: esto no se saca solo.
                        </p>
                      )}

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Tu nota para el cliente (opcional)
                        </span>
                        <textarea
                          value={item.nota}
                          onChange={(e) => seleccion.anotar(item.id, e.target.value.slice(0, MAX_NOTA))}
                          placeholder="Ej: es la más luminosa de las tres."
                          rows={2}
                          className="w-full resize-none rounded-lg border bg-background p-2 text-sm"
                        />
                      </label>
                    </div>
                  )
                })}
              </div>

              <div className="mt-5">
                <label className="text-sm font-semibold" htmlFor="nota-final-seleccion">
                  Nota final (opcional)
                </label>
                <textarea
                  id="nota-final-seleccion"
                  value={notaFinal}
                  onChange={(e) => setNotaFinal(e.target.value.slice(0, MAX_NOTA_FINAL))}
                  placeholder="Va al final de todo. Ej: cualquiera de las tres entra en tu presupuesto; decime cuál querés visitar."
                  rows={3}
                  className="mt-2 w-full resize-none rounded-lg border bg-background p-2 text-sm"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-5">
          <span className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "propiedad" : "propiedades"}
          </span>
          <button
            onClick={crear}
            disabled={creando || cargando || !!errorAlCargar}
            className="flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
          >
            {creando && <Loader2 className="h-4 w-4 animate-spin" />}
            {creando ? "Armando…" : "Crear la ficha"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
