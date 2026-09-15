"use client";

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrdenTabla } from "@/hooks/use-orden-tabla";
import { AvisoOrden } from "@/components/dashboard/orden-tabla";
import type { FilaCalidadAsesor, LeadsDashboardData } from "@/lib/queries/leads-dashboard";
import { EncabezadoOrdenable } from "./EncabezadoOrdenable";
import { cn } from "@/lib/utils";

const miles = (n: number) => n.toLocaleString("es-AR");
const pct = (n: number, total: number) => (total > 0 ? Math.round((n * 100) / total) : 0);
// 2 de 1.464 redondea a 0%: se lee como "ninguno", así que se escribe "menos del 1%".
const pctTexto = (n: number, total: number) => (n > 0 && pct(n, total) === 0 ? "menos del 1%" : `${pct(n, total)}%`);

type ClaveCalidad = "nombre" | "total" | "pctEmail" | "pctTelefono" | "pctNombre" | "pctCompletos";

const ETIQUETA: Record<ClaveCalidad, string> = {
  nombre: "Asesor",
  total: "Leads",
  pctEmail: "% con email",
  pctTelefono: "% con teléfono",
  pctNombre: "% con nombre",
  pctCompletos: "% con los tres",
};

const colorPct = (p: number) =>
  p >= 80 ? "text-emerald-700 dark:text-emerald-400" : p >= 50 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400";

/**
 * Qué tan completos llegan los datos de los leads. Auditoría del 15/9/2026: dividía por cero
 * cuando no había leads y decía siempre "20% sin nombre" (texto fijo). Ahora todo son cuentas
 * reales del período; sin "score" inventado.
 */
export function DataQualityTab({ data }: { data: LeadsDashboardData }) {
  const { total, calidad } = data;
  const valor = useCallback((f: FilaCalidadAsesor, k: ClaveCalidad) => f[k], []);
  const { ordenadas, orden, alternar, restablecer } = useOrdenTabla(data.calidadPorAsesor, valor);

  const campos = [
    { nombre: "Con email", cantidad: calidad.conEmail },
    { nombre: "Con teléfono", cantidad: calidad.conTelefono },
    { nombre: "Con nombre", cantidad: calidad.conNombre },
    { nombre: "Con etiquetas de Tokko", cantidad: calidad.conEtiquetas },
  ];

  return (
    <div className="space-y-6">
      <Card className="border border-accent/10 bg-card/30 backdrop-blur-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-bold">Datos completos</CardTitle>
          <p className="text-xs text-muted-foreground">
            De los {miles(total)} leads del período, cuántos tienen cada dato cargado en Tokko.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3">
            {campos.map((c) => {
              const p = pct(c.cantidad, total);
              return (
                <li key={c.nombre} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-bold">{c.nombre}</span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {miles(c.cantidad)} <span className="font-medium text-muted-foreground">({p}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-accent/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${p}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className={cn("text-sm font-semibold", calidad.sinContacto > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
            Sin email ni teléfono: {miles(calidad.sinContacto)} ({pctTexto(calidad.sinContacto, total)}).
            <span className="block text-xs font-normal text-muted-foreground">
              A estos no hay forma de escribirles ni llamarlos desde lo que figura en Tokko.
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Sin nombre: {miles(total - calidad.conNombre)} ({pctTexto(total - calidad.conNombre, total)}). Son los que
            Tokko trae sin nombre cargado.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border border-accent/10 bg-card/30 backdrop-blur-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-base font-bold">Datos completos por asesor</CardTitle>
          <p className="text-xs text-muted-foreground">
            De los leads de cada asesor en el período, qué parte tiene email, teléfono y nombre. &quot;% con los
            tres&quot; son los que tienen los tres datos a la vez.
          </p>
          <AvisoOrden
            etiqueta={orden ? ETIQUETA[orden.clave] : null}
            dir={orden?.dir}
            esTexto={orden?.clave === "nombre"}
            onRestablecer={restablecer}
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-accent/5 bg-muted/30 text-muted-foreground">
                <tr>
                  {(Object.keys(ETIQUETA) as ClaveCalidad[]).map((k) => (
                    <EncabezadoOrdenable key={k} clave={k} etiqueta={ETIQUETA[k]} orden={orden} onOrdenar={alternar} fija={k === "nombre"} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-accent/5">
                {ordenadas.map((f) => (
                  <tr key={f.id ?? "sin-asignar"} className="transition-colors hover:bg-accent/5">
                    <td className="sticky left-0 z-10 max-w-[180px] border-r border-accent/10 bg-card/95 px-3 py-3 backdrop-blur-md">
                      <span className={cn("block truncate font-semibold", f.id === null && "italic text-muted-foreground")}>{f.nombre}</span>
                    </td>
                    <td className="px-2 py-3 text-center font-bold tabular-nums">{miles(f.total)}</td>
                    {(["pctEmail", "pctTelefono", "pctNombre", "pctCompletos"] as const).map((k) => (
                      <td key={k} className={cn("px-2 py-3 text-center font-bold tabular-nums", colorPct(f[k]))}>
                        {f[k]}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
