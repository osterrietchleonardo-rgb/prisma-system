"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Target, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getObjectivesDashboardForYear } from "@/actions/tracking/objetivos";
import {
  MONTH_NAMES,
  OBJECTIVE_METRICS,
  type AdvisorObjectives,
  type ObjectiveMetric,
} from "@/lib/tracking/objetivos-types";
import { useOrdenTabla } from "@/hooks/use-orden-tabla";
import { AvisoOrden, IconoOrden } from "@/components/dashboard/orden-tabla";

interface Props {
  initialData: AdvisorObjectives[];
  initialYear: number;
  /**
   * "agencia" (default) = vista del director: todas las filas y el gráfico con el total del equipo.
   * "propio" = vista del asesor: `initialData` ya viene con su fila sola desde el server, esto solo
   * ajusta los textos para que no diga "total inmobiliaria" sobre un gráfico que es suyo.
   */
  alcance?: "agencia" | "propio";
  /** Asesor elegido en el filtro del dashboard: al cambiar el año se sigue mostrando sólo ese. */
  agentId?: string;
}

const fmtValue = (n: number, unit: "usd" | "count") => {
  if (unit === "usd") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
};

const pctColor = (pct: number | null) => {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 100) return "text-green-700 dark:text-green-400";
  if (pct >= 60) return "text-blue-600 dark:text-blue-400";
  if (pct >= 30) return "text-orange-700 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
};

export function ObjectivesDashboard({ initialData, initialYear, alcance = "agencia", agentId }: Props) {
  const esPropio = alcance === "propio";
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(initialYear);
  const [metric, setMetric] = useState<ObjectiveMetric>("facturacion");
  const [data, setData] = useState<AdvisorObjectives[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  const metricMeta = OBJECTIVE_METRICS.find((m) => m.key === metric)!;

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) arr.push(y);
    return arr.reverse();
  }, [currentYear]);

  const handleYearChange = useCallback(async (v: string) => {
    const y = Number(v);
    setYear(y);
    setIsLoading(true);
    try {
      const fresh = await getObjectivesDashboardForYear(y, agentId);
      setData(fresh);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  // Totales por mes (suma de todos los asesores) para el gráfico
  const chartData = useMemo(() => {
    return MONTH_NAMES.map((mn, i) => {
      const month = i + 1;
      let objetivo = 0;
      let alcanzado = 0;
      for (const adv of data) {
        const cell = adv.metrics[metric]?.[month];
        if (cell) {
          objetivo += cell.objetivo;
          alcanzado += cell.alcanzado;
        }
      }
      const pct = objetivo > 0 ? Math.round((alcanzado / objetivo) * 100) : 0;
      return { name: mn, objetivo, alcanzado, pct };
    });
  }, [data, metric]);

  // Orden de la tabla: por asesor (A→Z) o por el % cumplido de un mes. Las tres filas de cada
  // asesor (objetivo, alcanzado, %) se mueven juntas. Clave "asesor" o el número de mes.
  const valorObjetivo = useCallback(
    (adv: AdvisorObjectives, clave: string) =>
      clave === "asesor" ? adv.name : adv.metrics[metric]?.[Number(clave)]?.pct ?? null,
    [metric],
  );
  const { ordenadas, orden, alternar, restablecer } = useOrdenTabla(data, valorObjetivo);
  const ariaSort = (k: string) =>
    orden?.clave === k ? (orden.dir === "asc" ? "ascending" : "descending") : "none";

  const hasAnyObjective = useMemo(
    () => data.some((a) => Object.values(a.metrics[metric] || {}).some((c) => c.objetivo > 0)),
    [data, metric],
  );

  return (
    <Card className="border-accent/10 bg-card/30 backdrop-blur-sm overflow-hidden shadow-xl w-full">
      <CardHeader className="border-b border-accent/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg shadow-inner">
              <Target className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle className="text-lg">Objetivos vs Alcanzado</CardTitle>
              <CardDescription>
                {esPropio
                  ? "Tus metas mensuales y tu cumplimiento real."
                  : "Metas mensuales por asesor y su cumplimiento real."}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-muted/30 p-1 rounded-xl border border-white/5">
              {OBJECTIVE_METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    metric === m.key
                      ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Select value={String(year)} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[110px] h-9 bg-background/30 border-white/10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            <span>Cargando objetivos...</span>
          </div>
        ) : !hasAnyObjective ? (
          <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Target className="w-10 h-10 opacity-20" />
            <p className="italic text-sm text-center px-6">
              {esPropio ? (
                <>
                  Todavía no tenés objetivos de {metricMeta.label.toLowerCase()} cargados para {year}.
                  <br />
                  Los define tu director desde Tracking Performance.
                </>
              ) : (
                <>
                  Aún no hay objetivos de {metricMeta.label.toLowerCase()} cargados para {year}.
                  <br />
                  Cárgalos desde Tracking Performance → Objetivos.
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Tabla */}
            <div className="px-5 pt-3">
              <AvisoOrden
                etiqueta={
                  !orden ? null : orden.clave === "asesor" ? "Asesor" : `% cumplido de ${MONTH_NAMES[Number(orden.clave) - 1]}`
                }
                dir={orden?.dir}
                esTexto={orden?.clave === "asesor"}
                onRestablecer={restablecer}
              />
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm text-left min-w-[1100px]">
                <thead className="bg-muted/30 text-muted-foreground border-b border-accent/5">
                  <tr>
                    <th className="px-5 py-3 font-bold min-w-[200px] sticky left-0 bg-muted/95 backdrop-blur-md z-10 border-r border-accent/10" aria-sort={ariaSort("asesor")}>
                      <button type="button" onClick={() => alternar("asesor")} className="flex min-h-11 items-center gap-1.5 hover:text-accent">
                        Asesor <IconoOrden activo={orden?.clave === "asesor"} dir={orden?.dir} />
                      </button>
                    </th>
                    {MONTH_NAMES.map((mn, i) => (
                      <th key={mn} className="px-2 py-3 font-bold text-center text-[11px]" aria-sort={ariaSort(String(i + 1))}>
                        <button
                          type="button"
                          onClick={() => alternar(String(i + 1))}
                          title={`Ordenar por el % cumplido de ${mn}`}
                          className="mx-auto flex min-h-11 items-center gap-0.5 hover:text-accent"
                        >
                          {mn} <IconoOrden activo={orden?.clave === String(i + 1)} dir={orden?.dir} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-accent/5">
                  {ordenadas.map((adv) => (
                    <React.Fragment key={adv.agentId}>
                      {/* Objetivo */}
                      <tr className="hover:bg-accent/5">
                        <td
                          rowSpan={3}
                          className="px-5 py-2 align-top sticky left-0 bg-card/95 backdrop-blur-md z-10 border-r border-accent/10 font-semibold text-foreground/90 truncate max-w-[200px]"
                        >
                          {adv.name}
                        </td>
                        {MONTH_NAMES.map((mn, i) => {
                          const c = adv.metrics[metric]?.[i + 1];
                          return (
                            <td key={mn} className="px-2 py-1.5 text-center text-[11px] text-muted-foreground">
                              {c && c.objetivo > 0 ? fmtValue(c.objetivo, metricMeta.unit) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Alcanzado */}
                      <tr className="hover:bg-accent/5 bg-accent/[0.02]">
                        {MONTH_NAMES.map((mn, i) => {
                          const c = adv.metrics[metric]?.[i + 1];
                          return (
                            <td key={mn} className="px-2 py-1.5 text-center text-[11px] font-medium text-foreground/90">
                              {c ? fmtValue(c.alcanzado, metricMeta.unit) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                      {/* % */}
                      <tr className="hover:bg-accent/5 border-b-2 border-accent/10">
                        {MONTH_NAMES.map((mn, i) => {
                          const c = adv.metrics[metric]?.[i + 1];
                          return (
                            <td key={mn} className={`px-2 py-1.5 text-center text-[11px] font-bold ${pctColor(c?.pct ?? null)}`}>
                              {c && c.pct !== null ? `${Math.round(c.pct)}%` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2 flex gap-4 text-[10px] text-muted-foreground border-t border-accent/5">
              <span>Fila 1: Objetivo</span>
              <span>Fila 2: Alcanzado</span>
              <span>Fila 3: % cumplido</span>
            </div>

            {/* Gráfico de evolución */}
            <div className="p-5 border-t border-accent/5">
              <p className="text-sm font-semibold text-foreground/80 mb-3">
                Evolución {metricMeta.label} {year} — {esPropio ? "mis objetivos" : "total inmobiliaria"}
              </p>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212, 163, 115, 0.1)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#888", fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#888", fontSize: 10 }}
                      tickFormatter={(v) => (metricMeta.unit === "usd" ? `$${Number(v) / 1000}k` : `${v}`)}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#888", fontSize: 10 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1a1a",
                        border: "1px solid rgba(212, 163, 115, 0.2)",
                        borderRadius: "12px",
                      }}
                      formatter={(value: any, name: any) => {
                        if (name === "% cumplido") return [`${Math.round(value)}%`, name];
                        return [fmtValue(Number(value), metricMeta.unit), name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="objetivo" name="Objetivo" fill="#D4A373" radius={[4, 4, 0, 0]} barSize={14} />
                    <Bar yAxisId="left" dataKey="alcanzado" name="Alcanzado" fill="#4ade80" radius={[4, 4, 0, 0]} barSize={14} />
                    <Line yAxisId="right" type="monotone" dataKey="pct" name="% cumplido" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
