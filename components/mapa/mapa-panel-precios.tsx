"use client"

// Mapa · panel del precio por m2: la referencia de colores y el ranking de barrios.
//
// Va al costado, no encima del mapa: es una tabla para leer y comparar, y flotando sobre
// las propiedades tapa justo lo que uno quiere mirar.
import { Loader2, TrendingDown, TrendingUp } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatearM2, type BarrioPrecio } from "@/lib/mapa/precio-m2"

export function MapaPanelPrecios({
  barrios,
  tramos,
  moneda,
  cargando,
}: {
  barrios: BarrioPrecio[]
  tramos: { color: string; texto: string }[]
  moneda: string
  cargando: boolean
}) {
  const caro = barrios[0]
  const barato = barrios[barrios.length - 1]

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Precio por m²</p>
      </div>

      {/* Referencia. Muestra los NUMEROS y no solo los colores: la escala se recalcula con
          lo que hay en pantalla, asi que el mismo verde no significa lo mismo en dos
          vistas distintas. Sin los numeros el color no se podria interpretar. */}
      {tramos.length > 0 && (
        <div className="shrink-0 space-y-1 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          {tramos.map((t) => (
            <div key={t.texto} className="flex items-center gap-2">
              <span
                className="h-2.5 w-4 shrink-0 rounded-sm"
                style={{ backgroundColor: t.color }}
              />
              <span className="truncate text-[10px] text-zinc-500">{t.texto}</span>
            </div>
          ))}
          <p className="pt-1 text-[9px] leading-tight text-zinc-400">
            La escala compara contra lo que se ve en pantalla: al acercarte, los colores se
            recalculan.
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {cargando && barrios.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          </div>
        ) : barrios.length === 0 ? (
          <p className="p-3 text-[11px] text-zinc-500">
            No hay suficientes propiedades acá para calcular un precio por metro.
          </p>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-2">
              {caro && barato && caro !== barato && (
                <div className="mb-2 space-y-1 rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800/60">
                  <p className="flex items-center gap-1.5 text-[11px]">
                    <TrendingUp className="h-3 w-3 text-red-500" />
                    <span className="truncate font-medium">{caro.nombre}</span>
                    <span className="ml-auto shrink-0 text-zinc-500">
                      {formatearM2(caro.mediana_m2, moneda)}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px]">
                    <TrendingDown className="h-3 w-3 text-green-600" />
                    <span className="truncate font-medium">{barato.nombre}</span>
                    <span className="ml-auto shrink-0 text-zinc-500">
                      {formatearM2(barato.mediana_m2, moneda)}
                    </span>
                  </p>
                </div>
              )}

              <table className="w-full">
                <tbody>
                  {barrios.map((b, i) => (
                    <tr key={b.nombre} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                      <td className="py-1 pr-1 text-[10px] text-zinc-400">{i + 1}</td>
                      <td className="py-1 pr-2">
                        <span className="block truncate text-[11px] font-medium">{b.nombre}</span>
                        <span className="text-[9px] text-zinc-400">{b.propiedades} avisos</span>
                      </td>
                      <td className="py-1 text-right text-[11px] font-semibold tabular-nums">
                        {formatearM2(b.mediana_m2, moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
