"use client";

import React from "react";
import { 
  Home, 
  TrendingUp, 
  DollarSign, 
  Percent,
  ArrowUpRight,
  Target,
  Briefcase
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PerformanceKpisProps {
  data: {
    captaciones: number;
    transacciones: number;
    facturacion: number;
    rotacion: number;
  };
}

export function PerformanceKpis({ data }: PerformanceKpisProps) {
  const kpis = [
    {
      title: "Captación",
      value: data.captaciones,
      description: "Propiedades captadas este mes",
      icon: Home,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Transacciones",
      value: data.transacciones,
      description: "Cierres realizados",
      icon: Target,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "Facturación",
      value: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data.facturacion),
      description: "Comisiones generadas",
      icon: DollarSign,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      title: "Rotación Cartera",
      value: `${data.rotacion.toFixed(1)}%`,
      description: "Ventas / Inventario Promedio",
      icon: Percent,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <Card key={i} className="overflow-hidden border-accent/10 bg-card/30 backdrop-blur-sm transition-all hover:border-accent/30 hover:shadow-lg group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{kpi.title}</CardTitle>
            <div className={`p-2 ${kpi.bg} rounded-lg group-hover:scale-110 transition-transform`}>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{kpi.value}</div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] text-muted-foreground">{kpi.description}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
