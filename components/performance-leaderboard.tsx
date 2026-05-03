"use client";

import React from "react";
import { 
  Trophy, 
  Sparkles,
  Percent,
  TrendingUp,
  LayoutDashboard
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AdvisorSummary {
  id: string;
  name: string;
  captaciones: number;
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

  return (
    <Card className="border-accent/10 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl">
      <CardHeader className="border-b border-accent/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg shadow-inner">
              <Trophy className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle className="text-lg">Ranking de Asesores</CardTitle>
              <CardDescription>Performance consolidada con clasificación IA y rotación.</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-widest text-muted-foreground/70">
              <tr>
                <th className="px-6 py-4 font-bold">Asesor</th>
                <th className="px-6 py-4 font-bold text-center">Captaciones</th>
                <th className="px-6 py-4 font-bold text-center">Cierres</th>
                <th className="px-6 py-4 font-bold text-center">Inventario</th>
                <th className="px-6 py-4 font-bold text-center">Rotación</th>
                <th className="px-6 py-4 font-bold text-center">Facturación</th>
                <th className="px-6 py-4 font-bold text-right">Clasificación IA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/5">
              {sortedAdvisors.map((advisor, index) => (
                <tr key={advisor.id} className="group hover:bg-accent/5 transition-all duration-200">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent ring-1 ring-accent/20">
                        {advisor.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-white/90">{advisor.name}</span>
                        <span className="text-[10px] text-muted-foreground">Posición #{index + 1}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-white/80">{advisor.captaciones}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-white/80">{advisor.transacciones}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-muted-foreground/80">{advisor.cartera_activa}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant="outline" className={cn(
                      "font-mono text-[10px] border-none px-2",
                      advisor.rotacion >= 10 ? "text-green-400 bg-green-400/5" : 
                      advisor.rotacion >= 5 ? "text-blue-400 bg-blue-400/5" : "text-orange-400 bg-orange-400/5"
                    )}>
                      {advisor.rotacion.toFixed(1)}%
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-accent">
                      {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(advisor.facturacion)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className={`${getBadgeColor(advisor.classification)} gap-1.5 cursor-help py-1 px-3 border-accent/20 shadow-sm transition-transform active:scale-95`}>
                            <Sparkles className="h-3 w-3" />
                            {advisor.classification || "Sin Clasificar"}
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
                  <td colSpan={7} className="px-6 py-16 text-center">
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
