"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, 
  AreaChart, Area
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { NormalizedLead } from "../tokko-leads-utils";
import { Info, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataQualityTabProps {
  leads: NormalizedLead[];
}

export function DataQualityTab({ leads }: DataQualityTabProps) {
  const total = leads.length;

  const qualityStats = useMemo(() => {
    const hasEmail = leads.filter(l => l.email_principal).length;
    const hasPhone = leads.filter(l => l.telefono_principal).length;
    const hasBoth = leads.filter(l => l.email_principal && l.telefono_principal).length;
    const hasName = leads.filter(l => l.tiene_nombre).length;
    const hasTags = leads.filter(l => l.tags.length > 0).length;

    return [
      { name: "Email", count: hasEmail, perc: (hasEmail / total) * 100, color: "#3b82f6" },
      { name: "Teléfono", count: hasPhone, perc: (hasPhone / total) * 100, color: "#10b981" },
      { name: "Nombre", count: hasName, perc: (hasName / total) * 100, color: "#f59e0b" },
      { name: "Etiquetas", count: hasTags, perc: (hasTags / total) * 100, color: "#8b5cf6" },
    ];
  }, [leads, total]);

  const avgScore = useMemo(() => {
    if (total === 0) return 0;
    const sum = leads.reduce((acc, l) => acc + (l.score_calidad_lead || 0), 0);
    return Math.round(sum / total);
  }, [leads, total]);

  const agentQualityRanking = useMemo(() => {
    const map = new Map();
    leads.forEach(l => {
      if (!l.agent) return;
      if (!map.has(l.agent.id)) {
        map.set(l.agent.id, { name: l.agent.name, scoreSum: 0, count: 0 });
      }
      const data = map.get(l.agent.id);
      data.scoreSum += (l.score_calidad_lead || 0);
      data.count++;
    });
    return Array.from(map.values())
      .map(d => ({ name: d.name, avg: Math.round(d.scoreSum / d.count) }))
      .sort((a, b) => b.avg - a.avg);
  }, [leads]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Global Security Score */}
      <Card className="bg-card/40 backdrop-blur-md border border-accent/10">
        <CardContent className="p-8">
           <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="relative h-32 w-32 flex items-center justify-center">
                 <svg className="h-32 w-32 -rotate-90">
                    <circle cx="64" cy="64" r="58" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-accent/10" />
                    <circle cx="64" cy="64" r="58" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray={364} strokeDashoffset={364 - (364 * avgScore / 100)} className="text-accent transition-all duration-1000 ease-out" strokeLinecap="round" />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black">{avgScore}%</span>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Score Global</span>
                 </div>
              </div>
              <div className="flex-1 space-y-4">
                 <div className="flex items-center gap-3">
                    {avgScore > 80 ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <ShieldAlert className="h-5 w-5 text-yellow-500" />}
                    <h3 className="text-xl font-black">Salud del Dataset</h3>
                 </div>
                 <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                    Este score promedia la disponibilidad de **Email, Teléfono, Nombre y Etiquetas**. Un lead con 100% de calidad garantiza un proceso comercial sin fricciones.
                 </p>
                 <div className="flex flex-wrap gap-4">
                    <QualityIndicator label="Total registros" value={total.toString()} />
                    <QualityIndicator label="Grado de integridad" value={avgScore > 75 ? "Óptimo" : "Mejorable"} color={avgScore > 75 ? "text-emerald-500" : "text-yellow-500"} />
                 </div>
              </div>
           </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completitud de campos */}
        <Card className="bg-card/30 backdrop-blur-md border border-accent/10">
           <CardHeader>
              <CardTitle className="text-base font-bold">Completitud por campo</CardTitle>
           </CardHeader>
           <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={qualityStats} margin={{ top: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                    <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis hide domain={[0, 100]} />
                    <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }} />
                    <Bar dataKey="perc" radius={[4, 4, 0, 0]} barSize={40} minPointSize={4}>
                       {qualityStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                    </Bar>
                 </BarChart>
              </ResponsiveContainer>
           </CardContent>
        </Card>

        {/* Calidad por Agente */}
        <Card className="bg-card/30 backdrop-blur-md border border-accent/10">
           <CardHeader>
              <CardTitle className="text-base font-bold">Calidad promedio por agente</CardTitle>
              <p className="text-[10px] text-muted-foreground">Impacto en la gestión de datos por asesor</p>
           </CardHeader>
           <CardContent className="space-y-4">
              {agentQualityRanking.slice(0, 5).map((ag) => (
                <div key={ag.name} className="space-y-1">
                   <div className="flex items-center justify-between text-xs">
                      <span className="font-bold">{ag.name}</span>
                      <span className={cn("font-bold px-2 py-0.5 rounded-full text-[10px]", 
                        ag.avg > 80 ? "bg-emerald-500/10 text-emerald-500" : "bg-yellow-500/10 text-yellow-500")}>
                        {ag.avg}%
                      </span>
                   </div>
                   <Progress value={ag.avg} className="h-1.5" />
                </div>
              ))}
           </CardContent>
        </Card>
      </div>

      <div className="p-4 rounded-xl border border-blue-500/10 bg-blue-500/5 flex items-start gap-4">
         <Info className="h-5 w-5 text-blue-500 mt-0.5" />
         <div className="space-y-1">
            <h4 className="text-sm font-bold">Nota sobre 'Sin nombre'</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
               Aproximadamente el **20% de los leads** en este dataset no cuentan con nombre definido. PRISMA intenta recuperar el nombre extrayendo el alias del email cuando es posible para mejorar la experiencia de usuario.
            </p>
         </div>
      </div>
    </div>
  );
}

function QualityIndicator({ label, value, color }: { label: string, value: string, color?: string }) {
   return (
      <div className="space-y-0.5">
         <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{label}</p>
         <p className={cn("text-sm font-black", color || "text-foreground")}>{value}</p>
      </div>
   )
}
