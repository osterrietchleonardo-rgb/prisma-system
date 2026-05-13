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

function MetricGroup({ title, icon: Icon, metrics, color }: MetricCardProps) {
  return (
    <Card className="border-accent/10 bg-card/30 backdrop-blur-sm transition-all hover:border-accent/30 group">
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <div className={`p-2 rounded-lg bg-${color}/10 group-hover:scale-110 transition-transform`}>
          <Icon className={`h-5 w-5 text-${color}`} />
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
          { label: "Composición Demanda", value: `${kpis.leadsVendedores}V / ${kpis.leadsCompradores}C` },
        ]}
      />

      {/* 2. PRELISTING */}
      <MetricGroup 
        title="Prelisting"
        icon={FileText}
        color="amber-500"
        metrics={[
          { label: "Volumen Tasaciones", value: kpis.tasaciones },
          { label: "Pipeline Potencial", value: formatUSD(kpis.pipelineCaptacion) },
          { label: "Ticket Promedio", value: formatUSD(kpis.ticketPromedioTasacion) },
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
          { label: "WA / Cierre", value: `1:${kpis.ratioWaCierre.toFixed(1)}` },
          { label: "Prosp / Cierre", value: `1:${kpis.ratioProspCierre.toFixed(1)}` },
          { label: "Total / Cierre", value: `1:${kpis.ratioTotalLeadsCierre.toFixed(1)}` },
        ]}
      />
    </div>
  );
}
