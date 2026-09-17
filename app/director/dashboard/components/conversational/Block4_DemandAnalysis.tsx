"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useOrdenTabla } from "@/hooks/use-orden-tabla"
import { AvisoOrden, IconoOrden } from "@/components/dashboard/orden-tabla"
import type { ConversationalData, ResumenPresupuesto, TasaVisita } from "@/lib/queries/conversacional"
import { HorizontalBarsCard } from "./Block3_LeadProfile"
import { etiquetaCategoria, fmtNum, fmtPct } from "./formato"

type ClaveTasa = "etiqueta" | "visitas" | "total" | "tasa"

// Fuera del componente: el hook pide una función estable.
const valorTasa = (f: TasaVisita, k: ClaveTasa) => (k === "etiqueta" ? etiquetaCategoria(f.etiqueta) : f[k])

function TablaTasaVisita({
  title, icon, primeraColumna, filas, sinDato,
}: {
  title: string
  icon: string
  primeraColumna: string
  filas: TasaVisita[]
  sinDato: number
}) {
  // Las filas salen de los datos: antes la lista era fija y "venta" quedaba afuera (15/9/2026).
  const { ordenadas, orden, alternar, restablecer } = useOrdenTabla(filas, valorTasa)
  const etiquetas: Record<ClaveTasa, string> = { etiqueta: primeraColumna, visitas: "Visitas", total: "Total", tasa: "Tasa" }
  const totalVisitas = filas.reduce((s, f) => s + f.visitas, 0)
  const totalConversaciones = filas.reduce((s, f) => s + f.total, 0)
  const promedio = totalConversaciones > 0 ? Math.round((totalVisitas / totalConversaciones) * 100) : null
  const maxTasa = Math.max(...filas.map((f) => f.tasa ?? 0), 1)

  const ariaSort = (k: ClaveTasa) => (orden?.clave === k ? (orden.dir === "asc" ? "ascending" : "descending") : "none")
  const Encabezado = ({ clave, alinear = "right" }: { clave: ClaveTasa; alinear?: "left" | "right" }) => (
    <th className={`px-2 py-1 font-semibold ${alinear === "left" ? "text-left" : "text-right"}`} aria-sort={ariaSort(clave)}>
      <button
        type="button"
        onClick={() => alternar(clave)}
        className={`inline-flex min-h-11 items-center gap-1 hover:text-accent ${alinear === "right" ? "ml-auto" : ""}`}
      >
        {etiquetas[clave]} <IconoOrden activo={orden?.clave === clave} dir={orden?.dir} />
      </button>
    </th>
  )

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
        <p className="text-[11px] text-muted-foreground">
          De las conversaciones de cada tipo, cuántas terminaron con visita agendada.
          {promedio !== null && <> En verde, los que superan el promedio ({promedio}%).</>}
          {sinDato > 0 && <> {fmtNum(sinDato)} conversaciones no tienen el dato y no entran.</>}
        </p>
        {filas.length > 1 && (
          <AvisoOrden
            etiqueta={orden ? etiquetas[orden.clave] : null}
            dir={orden?.dir}
            esTexto={orden?.clave === "etiqueta"}
            onRestablecer={restablecer}
          />
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {filas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos en el período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-accent/10">
                <tr>
                  <Encabezado clave="etiqueta" alinear="left" />
                  <Encabezado clave="visitas" />
                  <Encabezado clave="total" />
                  <Encabezado clave="tasa" />
                </tr>
              </thead>
              <tbody className="divide-y divide-accent/5">
                {ordenadas.map((f) => {
                  const arriba = promedio !== null && f.tasa !== null && f.tasa > promedio
                  return (
                    <tr key={f.etiqueta}>
                      <td className="px-2 py-2">{etiquetaCategoria(f.etiqueta)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(f.visitas)}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{fmtNum(f.total)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden min-[400px]:block w-14 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${arriba ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
                              style={{ width: `${((f.tasa ?? 0) / maxTasa) * 100}%` }}
                            />
                          </div>
                          <span className={`font-bold w-10 text-right ${arriba ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                            {fmtPct(f.tasa)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Moneda({ titulo, simbolo, r, color }: { titulo: string; simbolo: string; r: ResumenPresupuesto; color: string }) {
  const fmt = (v: number | null) => (v === null ? "—" : `${simbolo} ${v.toLocaleString("es-AR")}`)
  return (
    <div className="space-y-1">
      <p className={`text-xs font-semibold ${color}`}>{titulo}</p>
      {r.cantidad === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos</p>
      ) : (
        <>
          <p className="text-xl font-bold break-words">{fmt(r.mediana)}</p>
          <p className="text-[11px] text-muted-foreground">valor del medio, sobre {fmtNum(r.cantidad)} clientes</p>
          <p className="text-[11px] text-muted-foreground">de {fmt(r.minimo)} a {fmt(r.maximo)}</p>
        </>
      )}
    </div>
  )
}

export function Block4DemandAnalysis({ demanda }: { demanda: ConversationalData["demanda"] }) {
  const d = demanda
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">Análisis de demanda</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Qué pide el mercado?
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TablaTasaVisita title="Visitas por tipo de propiedad" icon="📊" primeraColumna="Tipo"
          filas={d.porTipoPropiedad} sinDato={d.sinTipoPropiedad} />
        <TablaTasaVisita title="Visitas por tipo de operación" icon="🔄" primeraColumna="Operación"
          filas={d.porOperacion} sinDato={d.sinOperacion} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>💰</span><CardTitle className="text-sm font-semibold">Presupuesto declarado</CardTitle></div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Se toma el tope que dijo el cliente (o el mínimo, si no dio tope), separado por moneda. "Valor del medio": la mitad declaró menos y la otra mitad más.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <Moneda titulo="En dólares" simbolo="US$" r={d.presupuestoUSD} color="text-blue-600 dark:text-blue-400" />
              <div className="border-l border-accent/10 pl-4">
                <Moneda titulo="En pesos" simbolo="$" r={d.presupuestoARS} color="text-teal-700 dark:text-teal-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <HorizontalBarsCard title="Barrios consultados" icon="📍" d={d.barrios} barColor="#c084fc" traducir={false} />
        <HorizontalBarsCard title="Zonas" icon="🗺️" d={d.zonas} barColor="#60a5fa" traducir={false} />
      </div>
    </div>
  )
}
