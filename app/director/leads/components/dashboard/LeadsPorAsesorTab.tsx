"use client";

import { useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrdenTabla } from "@/hooks/use-orden-tabla";
import { AvisoOrden } from "@/components/dashboard/orden-tabla";
import type { FilaAsesorLeads, LeadsDashboardData } from "@/lib/queries/leads-dashboard";
import { EncabezadoOrdenable } from "./EncabezadoOrdenable";
import { cn } from "@/lib/utils";

const miles = (n: number) => n.toLocaleString("es-AR");

/** "nombre", "total", "pct" o "estado:<columna>". */
type ClaveAsesor = string;

const valorFila = (f: FilaAsesorLeads, k: ClaveAsesor) =>
  k === "nombre" ? f.nombre : k === "total" ? f.total : k === "pct" ? f.pctSinContactar : f.estados[k.slice(7)] ?? 0;

const colorPct = (p: number) =>
  p >= 50 ? "text-red-700 dark:text-red-400" : p >= 25 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400";

/**
 * Una sola tabla por asesor: reemplaza la lista "Leads por asesor" y el gráfico "Matriz Estado
 * vs Asesor", que usaba estados que Tokko no tiene (Activo, En negociación, Perdido) y por eso
 * salía casi vacía (auditoría del 15/9/2026). Cada columna se ordena tocándola.
 */
export function LeadsPorAsesorTab({ data }: { data: LeadsDashboardData }) {
  const { ordenadas, orden, alternar, restablecer } = useOrdenTabla(data.porAsesor, valorFila);

  const etiqueta = useCallback(
    (k: ClaveAsesor) => (k === "nombre" ? "Asesor" : k === "total" ? "Total" : k === "pct" ? "% sin contactar" : k.slice(7)),
    []
  );

  const totales = useMemo(() => {
    const porColumna: Record<string, number> = {};
    for (const c of data.columnasEstado) porColumna[c] = data.porAsesor.reduce((s, f) => s + (f.estados[c] ?? 0), 0);
    return porColumna;
  }, [data.porAsesor, data.columnasEstado]);
  const pctTotal = data.total > 0 ? Math.round(((totales["Sin Contactar"] ?? 0) * 100) / data.total) : 0;

  return (
    <Card className="overflow-hidden border border-accent/10 bg-card/30 backdrop-blur-md">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base font-bold">Leads por asesor y estado</CardTitle>
        <p className="text-xs text-muted-foreground">
          Una fila por asesor con los leads que le entraron en el período, repartidos según el estado que tienen hoy
          en Tokko. &quot;Otros&quot; junta los estados que casi no se usan (por ejemplo Evolucionando o Visita
          Confirmada). &quot;% sin contactar&quot; es la parte de sus leads que todavía nadie contactó.
        </p>
        <AvisoOrden
          etiqueta={orden ? etiqueta(orden.clave) : null}
          dir={orden?.dir}
          esTexto={orden?.clave === "nombre"}
          onRestablecer={restablecer}
        />
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-accent/5 bg-muted/30 text-muted-foreground">
              <tr>
                <EncabezadoOrdenable clave="nombre" etiqueta="Asesor" orden={orden} onOrdenar={alternar} fija />
                <EncabezadoOrdenable clave="total" etiqueta="Total" orden={orden} onOrdenar={alternar} />
                {data.columnasEstado.map((c) => (
                  <EncabezadoOrdenable key={c} clave={`estado:${c}`} etiqueta={c} orden={orden} onOrdenar={alternar} />
                ))}
                <EncabezadoOrdenable clave="pct" etiqueta="% sin contactar" orden={orden} onOrdenar={alternar} />
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/5">
              {ordenadas.map((f) => (
                <tr key={f.id ?? "sin-asignar"} className="transition-colors hover:bg-accent/5">
                  <td className="sticky left-0 z-10 max-w-[180px] border-r border-accent/10 bg-card/95 px-3 py-3 backdrop-blur-md">
                    <span className={cn("block truncate font-semibold", f.id === null && "italic text-muted-foreground")}>{f.nombre}</span>
                  </td>
                  <td className="px-2 py-3 text-center font-bold tabular-nums">{miles(f.total)}</td>
                  {data.columnasEstado.map((c) => (
                    <td key={c} className="px-2 py-3 text-center tabular-nums text-foreground/90">
                      {f.estados[c] ? miles(f.estados[c]) : <span className="text-muted-foreground/60">0</span>}
                    </td>
                  ))}
                  <td className={cn("px-2 py-3 text-center font-bold tabular-nums", colorPct(f.pctSinContactar))}>
                    {f.pctSinContactar}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-accent/10 bg-muted/20 font-bold">
              <tr>
                <td className="sticky left-0 z-10 border-r border-accent/10 bg-muted/95 px-3 py-3 backdrop-blur-md">Total</td>
                <td className="px-2 py-3 text-center tabular-nums">{miles(data.total)}</td>
                {data.columnasEstado.map((c) => (
                  <td key={c} className="px-2 py-3 text-center tabular-nums">{miles(totales[c] ?? 0)}</td>
                ))}
                <td className={cn("px-2 py-3 text-center tabular-nums", colorPct(pctTotal))}>{pctTotal}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
