"use client"

// El repaso antes de generar la ficha: las elegidas en el orden en que se marcaron, con una
// nota opcional cada una, la nota final opcional del grupo, y el botón de crear.
//
// Portal a <body> por lo mismo que la barra: esto se abre también desde la solapa del mapa,
// donde las capas de Leaflet le ganan a cualquier z-index normal.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { useSeleccion } from "./seleccion-contexto"

const MAX_NOTA = 400
const MAX_NOTA_FINAL = 1000

export function RepasoSeleccion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const seleccion = useSeleccion()
  const [montado, setMontado] = useState(false)
  const [notaFinal, setNotaFinal] = useState("")
  const [creando, setCreando] = useState(false)
  useEffect(() => setMontado(true), [])

  if (!seleccion || !montado || !abierto || seleccion.items.length === 0) return null

  const crear = async () => {
    if (creando) return
    setCreando(true)
    try {
      const res = await fetch("/api/seleccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propiedades: seleccion.items.map((i) => ({ source: i.source, id: i.id, nota: i.nota })),
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
      onCerrar()
    } catch (e: any) {
      toast.error(e.message || "No pudimos armar la ficha.")
    } finally {
      setCreando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Repasá antes de mandar</h2>
            <p className="text-sm text-muted-foreground">
              Podés escribirle a tu cliente por qué elegiste cada una. Si no escribís nada, no se muestra.
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
          <div className="flex flex-col gap-4">
            {seleccion.items.map((item, i) => (
              <div key={item.id} className="flex gap-3 rounded-xl border p-3">
                <span className="mt-1 text-xs font-bold text-muted-foreground">{i + 1}</span>
                {item.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.foto} alt={item.titulo} className="h-16 w-20 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-16 w-20 shrink-0 rounded-lg bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.titulo}</p>
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
                  <textarea
                    value={item.nota}
                    onChange={(e) => seleccion.anotar(item.id, e.target.value.slice(0, MAX_NOTA))}
                    placeholder="Nota para tu cliente (opcional). Ej: es la más luminosa de las tres."
                    rows={2}
                    className="mt-2 w-full resize-none rounded-lg border bg-background p-2 text-sm"
                  />
                </div>
              </div>
            ))}
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
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-5">
          <span className="text-sm text-muted-foreground">
            {seleccion.items.length} {seleccion.items.length === 1 ? "propiedad" : "propiedades"}
          </span>
          <button
            onClick={crear}
            disabled={creando}
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
