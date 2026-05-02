import { ZonaResult } from "@/app/api/mercado/zonaprop/route"
import { TrendingUp, TrendingDown, AlertTriangle, ExternalLink, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ZonapropSectionProps {
  zonas: ZonaResult[]
  hasError: boolean
}

function fmt(val: number | null, prefix = "", suffix = ""): string {
  if (val === null) return "—"
  return `${prefix}${val.toLocaleString("es-AR")}${suffix}`
}

function mesLabel(mesReporte: string | null): string {
  if (!mesReporte) return "Reporte"
  const [year, month] = mesReporte.split("-")
  const meses = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ]
  return `Reporte: ${meses[parseInt(month)]} ${year}`
}

function VarIndicator({ val, label }: { val: number | null; label: string }) {
  if (val === null) return null
  const isPos = val >= 0
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-bold ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isPos ? "+" : ""}
        {val}%
      </span>
    </div>
  )
}

function ZonaCard({ zona }: { zona: ZonaResult }) {
  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-base">{zona.zona}</h4>
        {zona.mes_reporte ? (
          <Badge variant="outline" className="text-[10px] shrink-0">
            <FileText className="w-2.5 h-2.5 mr-1" />
            {mesLabel(zona.mes_reporte)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 shrink-0">
            Sin reporte
          </Badge>
        )}
      </div>

      {!zona.parseado_ok ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Datos no disponibles este mes
            {zona.error && <span className="text-muted-foreground ml-1">· {zona.error}</span>}
          </div>
          {zona.url_pdf && (
            <a
              href={zona.url_pdf}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Descargar PDF manualmente
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Main price */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
              Precio m² venta
            </p>
            <p className="text-3xl font-bold text-violet-400 tabular-nums">
              {zona.precio_m2_venta_usd !== null
                ? `USD ${zona.precio_m2_venta_usd.toLocaleString("es-AR")}`
                : "—"}
            </p>
          </div>

          {/* Variaciones */}
          <div className="flex flex-wrap gap-3">
            <VarIndicator val={zona.variacion_mensual_pct} label="Mensual:" />
            <VarIndicator val={zona.variacion_anual_pct} label="Anual:" />
          </div>

          {/* Alquileres */}
          {(zona.precio_alquiler_2amb_ars || zona.precio_alquiler_3amb_ars) && (
            <div className="bg-muted/20 rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] mb-1.5">
                Alquileres promedio (ARS)
              </p>
              {zona.precio_alquiler_2amb_ars && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">2 ambientes</span>
                  <span className="font-semibold">{fmt(zona.precio_alquiler_2amb_ars, "$")}</span>
                </div>
              )}
              {zona.precio_alquiler_3amb_ars && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">3 ambientes</span>
                  <span className="font-semibold">{fmt(zona.precio_alquiler_3amb_ars, "$")}</span>
                </div>
              )}
            </div>
          )}

          {/* Barrios sub-table */}
          {zona.barrios.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Barrios destacados
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-1 text-muted-foreground font-medium">Barrio</th>
                    <th className="text-right pb-1 text-muted-foreground font-medium">USD/m²</th>
                    <th className="text-right pb-1 text-muted-foreground font-medium">Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {zona.barrios.slice(0, 8).map((b) => (
                    <tr key={b.nombre} className="border-b border-border/30">
                      <td className="py-1">{b.nombre}</td>
                      <td className="py-1 text-right font-semibold text-violet-400 tabular-nums">
                        {b.precio_m2_usd.toLocaleString("es-AR")}
                      </td>
                      <td className="py-1 text-right">
                        {b.variacion_pct !== null ? (
                          <span className={b.variacion_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {b.variacion_pct >= 0 ? "+" : ""}
                            {b.variacion_pct}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* PDF link */}
          {zona.url_pdf && (
            <a
              href={zona.url_pdf}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-accent transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Ver reporte PDF completo
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export function ZonapropSection({ zonas, hasError }: ZonapropSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Reportes Zonaprop — Precios por Zona
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Datos extraídos de reportes PDF mensuales
          </p>
        </div>
      </div>

      {hasError || zonas.length === 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            ⚠ Sin datos disponibles · Zonaprop
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {zonas.map((z) => (
            <ZonaCard key={z.zona} zona={z} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/50 mt-3">
        Fuente: Zonaprop · zonaprop.com.ar
      </p>
    </div>
  )
}
