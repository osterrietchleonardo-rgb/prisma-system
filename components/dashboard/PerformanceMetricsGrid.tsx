"use client";

import React from "react";
import { 
  MessageSquare, 
  Users, 
  FileText, 
  Search, 
  Home, 
  Lock, 
  DollarSign, 
  Target, 
  Activity,
  ArrowUpRight,
  TrendingUp,
  Percent,
  Briefcase,
  PieChart,
  BarChart3,
  Clock,
  Layers,
  Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MetricCardProps {
  title: string;
  icon: any;
  metrics: {
    label: string;
    value: string | number;
    subValue?: string;
    trend?: "up" | "down" | "neutral";
  }[];
  color: string;
}

/* Las clases se escriben enteras a proposito: Tailwind no puede ver
   `text-${color}` armado con una plantilla y no las genera. El primer tono es
   el que se lee sobre fondo claro; el de dark: es el original. */
const COLORES: Record<string, { fondo: string; icono: string }> = {
  "blue-500":    { fondo: "bg-blue-500/10",    icono: "text-blue-700 dark:text-blue-500" },
  "amber-500":   { fondo: "bg-amber-500/10",   icono: "text-amber-800 dark:text-amber-500" },
  "purple-500":  { fondo: "bg-purple-500/10",  icono: "text-purple-700 dark:text-purple-500" },
  "emerald-500": { fondo: "bg-emerald-500/10", icono: "text-emerald-800 dark:text-emerald-500" },
  "orange-500":  { fondo: "bg-orange-500/10",  icono: "text-orange-800 dark:text-orange-500" },
  "green-500":   { fondo: "bg-green-500/10",   icono: "text-green-800 dark:text-green-500" },
  "slate-500":   { fondo: "bg-slate-500/10",   icono: "text-slate-700 dark:text-slate-400" },
  "red-500":     { fondo: "bg-red-500/10",     icono: "text-red-700 dark:text-red-500" },
  "cyan-500":    { fondo: "bg-cyan-500/10",    icono: "text-cyan-800 dark:text-cyan-500" },
  "violet-500":  { fondo: "bg-violet-500/10",  icono: "text-violet-700 dark:text-violet-500" },
  "teal-500":    { fondo: "bg-teal-500/10",    icono: "text-teal-800 dark:text-teal-500" },
  "sky-500":     { fondo: "bg-sky-500/10",     icono: "text-sky-800 dark:text-sky-500" },
}
const COLOR_POR_DEFECTO = { fondo: "bg-muted", icono: "text-foreground" }

function MetricGroup({ title, icon: Icon, metrics, color }: MetricCardProps) {
  const c = COLORES[color] ?? COLOR_POR_DEFECTO
  return (

    <Card className="border-accent/10 bg-card/30 backdrop-blur-sm transition-all hover:border-accent/30 group">
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <div className={`p-2 rounded-lg ${c.fondo} group-hover:scale-110 transition-transform`}>
          <Icon className={`h-5 w-5 ${c.icono}`} />
        </div>
        <div>
          <CardTitle className="text-sm font-bold uppercase tracking-wider">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center justify-between group/item">
            <span className="text-xs text-muted-foreground group-hover/item:text-foreground transition-colors">{m.label}</span>
            <div className="text-right">
              <div className="text-sm font-semibold tracking-tight">{m.value}</div>
              {m.subValue && <div className="text-[10px] text-muted-foreground">{m.subValue}</div>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PerformanceMetricsGrid({ kpis }: { kpis: any }) {
  if (!kpis) return null;

  const formatUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  // El desglose de la tarjeta Cierre se muestra sólo si hay al menos un
  // alquiler cerrado. Sin alquileres no hay nada que separar y la tarjeta queda
  // exactamente como estaba.
  const hayCierresDeAlquiler = kpis.cierresAlquiler > 0 || kpis.gciAlquiler > 0;
  const hayCierresSinDefinir = kpis.cierresSinDefinir > 0 || kpis.gciSinDefinir > 0;
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {/* 1. PROSPECCIÓN Y CONSULTAS */}
      <MetricGroup 
        title="Prospección"
        icon={MessageSquare}
        color="blue-500"
        metrics={[
          { label: "Consultas WhatsApp", value: kpis.waChats },
          { label: "Prospección Activa", value: kpis.prospeccionActiva },
          {
            label: "Composición Demanda",
            // Los de alquiler sólo se agregan cuando existen, para que la
            // pantalla de hoy (sin alquileres cargados) no cambie ni un
            // carácter: "3V / 2C" sigue siendo "3V / 2C".
            value:
              kpis.leadsLocadores > 0 || kpis.leadsLocatarios > 0
                ? `${kpis.leadsVendedores}V / ${kpis.leadsCompradores}C / ${kpis.leadsLocadores}L / ${kpis.leadsLocatarios}Lt`
                : `${kpis.leadsVendedores}V / ${kpis.leadsCompradores}C`,
          },
        ]}
      />

      {/* 2. PRELISTING */}
      <MetricGroup 
        title="Prelisting"
        icon={FileText}
        color="amber-500"
        metrics={[
          { label: "Volumen Prelisting", value: kpis.prelisting },
          { label: "Pipeline Potencial", value: formatUSD(kpis.pipelineCaptacion) },
          { label: "Ticket Promedio", value: formatUSD(kpis.ticketPromedioTasacion) },
          // Métrica aparte del prelisting: se cuenta sola al generar la ficha en el módulo ACM.
          { label: "Fichas ACM", value: kpis.acm },
        ]}
      />

      {/* 3. PREBUYING */}
      <MetricGroup 
        title="Prebuying"
        icon={Search}
        color="purple-500"
        metrics={[
          { label: "Demanda Calificada", value: kpis.compradores },
          { label: "Poder de Compra", value: formatUSD(kpis.poderCompra) },
          { label: "Ticket Promedio", value: formatUSD(kpis.ticketPromedioBusqueda) },
        ]}
      />

      {/* 4. CAPTACIÓN */}
      <MetricGroup 
        title="Captación"
        icon={Home}
        color="emerald-500"
        metrics={[
          { label: "Inventario Nuevo", value: kpis.captaciones, subValue: `Hit Rate: ${formatPercent(kpis.hitRate)}` },
          { label: "Exclusividad", value: formatPercent(kpis.ratioExclusividad) },
          { label: "Honorario Pactado", value: `${kpis.honorarioPactado}%` },
        ]}
      />

      {/* 5. RESERVA */}
      <MetricGroup 
        title="Reserva"
        icon={Target}
        color="orange-500"
        metrics={[
          { label: "Termómetro (Volumen)", value: kpis.reservas, subValue: `Tasa Oferta: ${formatPercent(kpis.tasaOferta)}` },
          { label: "Compromiso Econ.", value: formatUSD(kpis.compromisoEconomico) },
          { label: "GAP Negociación", value: formatPercent(kpis.gapNegociacion) },
        ]}
      />

      {/* 6. CIERRE */}
      <MetricGroup 
        title="Cierre"
        icon={DollarSign}
        color="green-500"
        metrics={[
          { label: "GCI (Fact. Bruta)", value: formatUSD(kpis.gci), subValue: `Cierres: ${kpis.transacciones}` },
          // Mismo criterio que la Composición de Demanda de Prospección: el
          // desglose sólo aparece cuando hay alquileres que desglosar. Una
          // inmobiliaria que únicamente vende ve la tarjeta igual que siempre.
          ...(hayCierresDeAlquiler
            ? [
                { label: "— Venta", value: formatUSD(kpis.gciVenta), subValue: `Cierres: ${kpis.cierresVenta}` },
                { label: "— Alquiler", value: formatUSD(kpis.gciAlquiler), subValue: `Cierres: ${kpis.cierresAlquiler}` },
                // Los cierres viejos, cargados antes de que existiera el
                // proceso, no se reparten a ojo entre venta y alquiler: se
                // muestran aparte para que las tres líneas sumen el total.
                ...(hayCierresSinDefinir
                  ? [{ label: "— Sin definir", value: formatUSD(kpis.gciSinDefinir), subValue: `Cierres: ${kpis.cierresSinDefinir}` }]
                  : []),
              ]
            : []),
          { label: "Honorario Real", value: `${kpis.honorarioCobrado.toFixed(1)}%` },
          { label: "Neto Asesores", value: formatUSD(kpis.netoAsesores), subValue: `Agency: ${formatUSD(kpis.companyDollar)}` },
        ]}
      />

      {/* 7. CARTERA */}
      <MetricGroup 
        title="Cartera"
        icon={Briefcase}
        color="slate-500"
        metrics={[
          { label: "Inventario Activo", value: kpis.carteraActiva, subValue: formatUSD(kpis.volumenCartera) },
          { label: "Rotación (Venta)", value: formatPercent(kpis.rotacion) },
          { label: "Days on Market", value: `${kpis.dom} días` },
        ]}
      />

      {/* 8. EFICIENCIA GLOBAL */}
      <MetricGroup 
        title="Conversión"
        icon={Zap}
        color="red-500"
        metrics={[
          { 
            label: "WA / Cierre", 
            value: `1:${kpis.ratioWaCierre.toFixed(1)}`,
            subValue: kpis.ratioWaCierre > 0 ? formatPercent(100 / kpis.ratioWaCierre) : "0%"
          },
          { 
            label: "Prosp / Cierre", 
            value: `1:${kpis.ratioProspCierre.toFixed(1)}`,
            subValue: kpis.ratioProspCierre > 0 ? formatPercent(100 / kpis.ratioProspCierre) : "0%"
          },
          { 
            label: "Total / Cierre", 
            value: `1:${kpis.ratioTotalLeadsCierre.toFixed(1)}`,
            subValue: kpis.ratioTotalLeadsCierre > 0 ? formatPercent(100 / kpis.ratioTotalLeadsCierre) : "0%"
          },
        ]}
      />

      {/* 9. TIEMPOS DE RESPUESTA */}
      <MetricGroup 
        title="Tiempos Respuesta"
        icon={Clock}
        color="cyan-500"
        metrics={[
          { label: "1er Msg (BOT)", value: kpis.responseTime?.botFirst || "---" },
          { label: "Entre Msg (BOT)", value: kpis.responseTime?.botBetween || "---" },
          { label: "1er Msg (ASESOR)", value: kpis.responseTime?.humanFirst || "---" },
          { label: "Entre Msg (ASESOR)", value: kpis.responseTime?.humanBetween || "---" },
        ]}
      />
    </div>
  );
}
