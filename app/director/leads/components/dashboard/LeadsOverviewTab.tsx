"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { AlertTriangle, CircleAlert, Clock, Users, UserX, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConteoLeads, LeadsDashboardData } from "@/lib/queries/leads-dashboard";
import { FAST_CHART_COLORS, CHART_PALETTE } from "../tags.config";
import { cn } from "@/lib/utils";

const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const miles = (n: number) => n.toLocaleString("es-AR");
const pct = (n: number, total: number) => (total > 0 ? Math.round((n * 100) / total) : 0);
// 7 de 1.464 redondea a 0%: se lee como "ninguno", así que se escribe "menos del 1%".
const pctTexto = (n: number, total: number) => (n > 0 && pct(n, total) === 0 ? "menos del 1%" : `${pct(n, total)}%`);

/**
 * Resumen de Leads Comerciales. Todo sale de `data` (calculado en el servidor, sin IA).
 * Se sacaron el "Ciclo de vida" y el "ciclo flash" (auditoría del 15/9/2026): usaban
 * `deleted_at` de Tokko como si fuera la fecha de cierre, y no lo es; no medían nada.
 */
export function LeadsOverviewTab({ data }: { data: LeadsDashboardData }) {
  const { total } = data;

  const semanas = useMemo(
    () =>
      data.semanas.map((s) => ({
        etiqueta: corta(s.desde),
        rango: s.desde === s.hasta ? `El ${corta(s.desde)}` : `Del ${corta(s.desde)} al ${corta(s.hasta)}`,
        cantidad: s.cantidad,
      })),
    [data.semanas]
  );
  const semanaPico = useMemo(
    () => semanas.reduce<(typeof semanas)[number] | null>((max, s) => (!max || s.cantidad > max.cantidad ? s : max), null),
    [semanas]
  );

  const cerrados = data.porEstado.find((e) => e.nombre === "Cerrado")?.cantidad ?? 0;

  return (
    <div className="space-y-6">
      {/* Números del período */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          titulo="Leads que entraron"
          valor={miles(total)}
          detalle={`en el período${data.agentId ? ", del asesor elegido" : ""}`}
          icono={<Inbox className="h-4 w-4 text-accent" />}
        />
        <KPICard
          titulo="Siguen sin contactar"
          valor={miles(data.sinContactar)}
          detalle={`${pctTexto(data.sinContactar, total)} del total · ${miles(data.sinContactarMas48h)} con más de 48 h`}
          icono={<Clock className="h-4 w-4 text-destructive" />}
        />
        {data.sinAsignar !== null ? (
          <KPICard
            titulo="Sin asesor asignado"
            valor={miles(data.sinAsignar)}
            detalle={`${pctTexto(data.sinAsignar, total)} del total`}
            icono={<UserX className="h-4 w-4 text-destructive" />}
          />
        ) : (
          <KPICard
            titulo="Cerrados en Tokko"
            valor={miles(cerrados)}
            detalle={`${pctTexto(cerrados, total)} del total`}
            icono={<UserX className="h-4 w-4 text-accent" />}
          />
        )}
        <KPICard
          titulo={data.agentId ? "Estados distintos" : "Asesores con leads"}
          valor={miles(data.agentId ? data.porEstado.length : data.asesoresConLeads)}
          detalle={data.agentId ? "en los que están sus leads hoy" : "recibieron al menos uno"}
          icono={<Users className="h-4 w-4 text-accent" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Leads por semana */}
        <Card className="min-w-0 border border-accent/10 bg-card/30 backdrop-blur-md lg:col-span-2">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-bold">Leads por semana</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cada barra es una semana de lunes a domingo. La primera y la última pueden estar incompletas si el
              período empieza o termina a mitad de semana.
            </p>
            {semanaPico && semanaPico.cantidad > 0 && (
              <p className="text-xs font-medium text-foreground">
                Semana con más leads: {semanaPico.rango.toLowerCase()} ({miles(semanaPico.cantidad)}).
              </p>
            )}
          </CardHeader>
          <CardContent className="h-[250px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={semanas} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                <XAxis dataKey="etiqueta" fontSize={10} axisLine={false} tickLine={false} minTickGap={12} interval="preserveStartEnd" />
                <YAxis fontSize={10} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <RechartsTooltip
                  cursor={{ fill: "rgba(148,163,184,0.12)" }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.rango ?? ""}
                  formatter={(value: number) => [miles(value), "Leads"]}
                  contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", color: "white" }}
                  itemStyle={{ color: "white" }}
                />
                <Bar dataKey="cantidad" fill="#ac7cff" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Inhibidores de conversión: calculados, sin textos fijos */}
        <Card className="border border-accent/20 bg-accent/5">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-bold">Qué está frenando la conversión</CardTitle>
            <p className="text-xs text-muted-foreground">
              Calculado con los leads del período. El % es sobre los {miles(total)} leads que entraron.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.inhibidores.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay nada para marcar en este período.</p>
            ) : (
              data.inhibidores.map((linea) => (
                <div key={linea.clave} className="flex gap-3">
                  <div className="mt-0.5 shrink-0">
                    {linea.tono === "alerta" ? (
                      <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-400" />
                    ) : (
                      <CircleAlert className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <h5 className="break-words text-xs font-bold text-foreground">{linea.titulo}</h5>
                    <p className="text-sm font-black">
                      {linea.numero} <span className="text-xs font-bold text-muted-foreground">({linea.porcentaje === 0 ? "menos del 1%" : `${linea.porcentaje}%`})</span>
                    </p>
                    <p className="text-xs leading-snug text-muted-foreground">{linea.texto}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border border-accent/10 bg-card/30 backdrop-blur-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-bold">Estado en Tokko</CardTitle>
            <p className="text-xs text-muted-foreground">
              El estado que cada lead tiene hoy en Tokko, no el que tenía cuando entró.
            </p>
          </CardHeader>
          <CardContent>
            <ListaConBarras filas={data.porEstado} total={total} />
          </CardContent>
        </Card>

        <Card className="border border-accent/10 bg-card/30 backdrop-blur-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-bold">De dónde llegaron</CardTitle>
            <p className="text-xs text-muted-foreground">
              La fuente que registra Tokko. &quot;Tokko Broker&quot; son los leads sin fuente identificada.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <ListaConBarras filas={data.porFuente} total={total} colores />

            <div className="space-y-2 border-t border-accent/5 pt-4">
              <h4 className="text-sm font-bold">Tipo de contacto</h4>
              <div className="flex flex-wrap gap-2">
                <Chip nombre="Interesados" cantidad={data.tiposContacto.interesados} total={total} clase="bg-blue-500/10 text-blue-800 dark:text-blue-400 border-blue-500/20" />
                <Chip nombre="Propietarios" cantidad={data.tiposContacto.propietarios} total={total} clase="bg-orange-500/10 text-orange-800 dark:text-orange-400 border-orange-500/20" />
                <Chip nombre="Empresas" cantidad={data.tiposContacto.empresas} total={total} clase="bg-purple-500/10 text-purple-800 dark:text-purple-400 border-purple-500/20" />
              </div>
              <p className="text-xs text-muted-foreground">
                Propietarios y empresas son los que Tokko tiene marcados así; el resto son interesados que consultaron.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Lista "nombre · barra · cantidad (%)": se lee en el celular sin tocar nada. */
function ListaConBarras({ filas, total, colores = false }: { filas: ConteoLeads[]; total: number; colores?: boolean }) {
  const max = filas[0]?.cantidad || 1;
  return (
    <ul className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.nombre} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-bold">{f.nombre}</span>
            <span className="shrink-0 font-bold tabular-nums">
              {miles(f.cantidad)} <span className="font-medium text-muted-foreground">({pctTexto(f.cantidad, total)})</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-accent/10">
            <div
              className={cn("h-full rounded-full", !colores && "bg-accent")}
              style={{
                width: `${Math.max(2, (f.cantidad / max) * 100)}%`,
                ...(colores ? { backgroundColor: FAST_CHART_COLORS[f.nombre] || CHART_PALETTE[i % CHART_PALETTE.length] } : {}),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Chip({ nombre, cantidad, total, clase }: { nombre: string; cantidad: number; total: number; clase: string }) {
  return (
    <span className={cn("rounded-md border px-3 py-1.5 text-xs font-bold", clase)}>
      {nombre}: {miles(cantidad)} ({pctTexto(cantidad, total)})
    </span>
  );
}

function KPICard({ titulo, valor, detalle, icono }: { titulo: string; valor: string; detalle: string; icono: React.ReactNode }) {
  return (
    <Card className="border border-accent/10 bg-card/40 backdrop-blur-md">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</span>
          <div className="shrink-0 rounded-lg bg-accent/5 p-2">{icono}</div>
        </div>
        <p className="text-2xl font-black tabular-nums">{valor}</p>
        <p className="text-[11px] text-muted-foreground">{detalle}</p>
      </CardContent>
    </Card>
  );
}
