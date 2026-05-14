"use client";

import React from "react";
import { 
  Trophy, 
  Sparkles,
  Percent,
  TrendingUp,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Search,
  Home,
  Target,
  DollarSign,
  Briefcase,
  Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AdvisorSummary {
  id: string;
  name: string;
  wa_chats: number;
  prospeccion: number;
  tasaciones: number;
  compradores: number;
  captaciones: number;
  reservas: number;
  transacciones: number;
  facturacion: number;
  cartera_activa: number;
  rotacion: number;
  classification: string;
  classificationReason: string;
}

interface PerformanceLeaderboardProps {
  advisors: AdvisorSummary[];
}

export function PerformanceLeaderboard({ advisors }: PerformanceLeaderboardProps) {
  // Sort by facturacion descending
  const sortedAdvisors = [...advisors].sort((a, b) => b.facturacion - a.facturacion);

  const getBadgeColor = (classification: string) => {
    const cls = classification?.toLowerCase() || "";
    if (cls.includes('elite') || cls.includes('top') || cls.includes('estrella')) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/50";
    if (cls.includes('sólido') || cls.includes('solido') || cls.includes('consistente')) return "bg-blue-500/20 text-blue-500 border-blue-500/50";
    if (cls.includes('desarrollo') || cls.includes('aprendizaje')) return "bg-orange-500/20 text-orange-500 border-orange-500/50";
    return "bg-slate-500/20 text-slate-400 border-slate-500/50";
  };

  const MetricHeader = ({ icon: Icon, label, tooltip }: { icon: any, label: string, tooltip: string }) => (
    <th className="px-3 py-4 font-bold text-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="flex flex-col items-center gap-1 mx-auto group">
            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            <span className="text-[9px] uppercase tracking-tighter opacity-70 group-hover:opacity-100">{label}</span>
          </TooltipTrigger>
          <TooltipContent className="bg-popover/95 backdrop-blur-md border-accent/20">
            <p className="text-xs font-semibold">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </th>
  );

  return (
    <Card className="performance-leaderboard-container border-accent/10 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl">
      <CardHeader className="border-b border-accent/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg shadow-inner">
              <Trophy className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle className="text-lg">Ranking de Asesores</CardTitle>
              <CardDescription>Métricas detalladas por etapa del embudo comercial.</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm text-left min-w-[1000px]">
            <thead className="bg-muted/30 text-muted-foreground/70 border-b border-accent/5">
              <tr>
                <th className="px-6 py-4 font-bold min-w-[200px]">Asesor</th>
                <MetricHeader icon={MessageSquare} label="Chats" tooltip="WhatsApp Recibidos" />
                <MetricHeader icon={TrendingUp} label="Prosp." tooltip="Prospección Activa" />
                <MetricHeader icon={FileText} label="Tasac." tooltip="Tasaciones Realizadas" />
                <MetricHeader icon={Search} label="Comp." tooltip="Compradores Calificados" />
                <MetricHeader icon={Home} label="Capt." tooltip="Propiedades Captadas" />
                <MetricHeader icon={Target} label="Res." tooltip="Reservas Logradas" />
                <MetricHeader icon={Zap} label="Cierre" tooltip="Cierres Totales" />
                <MetricHeader icon={Briefcase} label="Cart." tooltip="Cartera Activa (Tokko)" />
                <MetricHeader icon={Percent} label="Rot." tooltip="% Rotación Anualizada" />
                <MetricHeader icon={DollarSign} label="Fact." tooltip="GCI (Facturación Bruta)" />
                <th className="px-6 py-4 font-bold text-right">Clasificación IA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/5">
              {sortedAdvisors.map((advisor, index) => (
                <tr key={advisor.id} className="group hover:bg-accent/5 transition-all duration-200">
                  <td className="px-6 py-4 sticky left-0 bg-card/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent ring-1 ring-accent/20">
                        {advisor.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-white/90 truncate max-w-[120px]">{advisor.name}</span>
                        <span className="text-[10px] text-muted-foreground">Posición #{index + 1}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-blue-400/80">{advisor.wa_chats}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-indigo-400/80">{advisor.prospeccion}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-amber-400/80">{advisor.tasaciones}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-medium text-purple-400/80">{advisor.compradores}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-bold text-emerald-400/90">{advisor.captaciones}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-bold text-orange-400/90">{advisor.reservas}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-bold text-red-400/90">{advisor.transacciones}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <Badge variant="secondary" className="bg-slate-500/10 text-slate-400 border-none font-mono text-[10px]">
                      {advisor.cartera_activa}
                    </Badge>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className={cn(
                      "font-mono text-[11px] font-bold",
                      advisor.rotacion >= 10 ? "text-green-400" : 
                      advisor.rotacion >= 5 ? "text-blue-400" : "text-orange-400"
                    )}>
                      {advisor.rotacion.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="font-bold text-accent whitespace-nowrap">
                      {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(advisor.facturacion)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className={`${getBadgeColor(advisor.classification)} gap-1.5 cursor-help py-1 px-3 border-accent/20 shadow-sm transition-transform active:scale-95`}>
                            <Sparkles className="h-3 w-3" />
                            <span className="whitespace-nowrap">{advisor.classification || "Sin Clasificar"}</span>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[280px] bg-card/95 border-accent/20 backdrop-blur-xl p-4 shadow-2xl">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 border-b border-accent/10 pb-2">
                              <TrendingUp className="h-3 w-3 text-accent" />
                              <p className="text-[10px] uppercase font-bold text-accent tracking-tighter">Análisis de Desempeño</p>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed italic">
                              "{advisor.classificationReason}"
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                </tr>
              ))}
              {sortedAdvisors.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                      <LayoutDashboard className="h-10 w-10 opacity-20" />
                      <p className="italic text-sm font-light">No hay actividad registrada en este período.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Utility to merge classes
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
