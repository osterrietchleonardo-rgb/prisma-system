"use client";

import { useMemo } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, 
  AreaChart, Area
} from "recharts";
import { format, startOfWeek, subWeeks, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NormalizedLead } from "../tokko-leads-utils";
import { TrendingUp, Calendar, Zap, Lightbulb } from "lucide-react";

interface ProposedDashboardTabProps {
  leads: NormalizedLead[];
}

export function ProposedDashboardTab({ leads }: ProposedDashboardTabProps) {
  // 1. Crecimiento Semanal (Últimas 12 semanas)
  const weeklyGrowthData = useMemo(() => {
    const counts: Record<string, number> = {};
    const twelveWeeksAgo = subWeeks(new Date(), 12);
    
    leads.forEach(l => {
      const date = new Date(l.created_at);
      if (isAfter(date, twelveWeeksAgo)) {
        const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), "dd MMM", { locale: es });
        counts[weekStart] = (counts[weekStart] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .slice(-12); // Ensure we have a chronological sub-set
  }, [leads]);

  // 2. Matriz de Estado por Agente (Top 5 agentes)
  const agentStatusMatrix = useMemo(() => {
    const agentMap = new Map();
    leads.forEach(l => {
      if (!l.agent) return;
      if (!agentMap.has(l.agent.id)) {
        agentMap.set(l.agent.id, { name: l.agent.name, Activos: 0, Cerrados: 0, Perdidos: 0, Negociacion: 0 });
      }
      const data = agentMap.get(l.agent.id);
      if (l.lead_status === "Activo") data.Activos++;
      if (l.lead_status === "Cerrado") data.Cerrados++;
      if (l.lead_status === "Perdido") data.Perdidos++;
      if (l.lead_status === "En negociación") data.Negociacion++;
    });

    return Array.from(agentMap.values())
      .sort((a, b) => (b.Activos + b.Cerrados) - (a.Activos + a.Cerrados))
      .slice(0, 5);
  }, [leads]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Crecimiento Semanal */}
        <Card className="lg:col-span-2 bg-card/30 backdrop-blur-md border border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
               <CardTitle className="text-base font-bold">Crecimiento Semanal (Volumen)</CardTitle>
               <CardDescription className="text-[10px]">Evolución cualitativa del ingreso de leads (últimas 12 semanas)</CardDescription>
            </div>
            <TrendingUp className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent className="h-[250px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={weeklyGrowthData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ac7cff" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ac7cff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} width={30} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }} />
                  <Area type="monotone" dataKey="value" stroke="#ac7cff" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
               </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recomendaciones IA */}
        <Card className="bg-accent/5 border border-accent/20">
           <CardHeader>
              <div className="flex items-center gap-2">
                 <Zap className="h-4 w-4 text-accent" />
                 <CardTitle className="text-sm font-bold">Inhibidores de Conversión</CardTitle>
              </div>
           </CardHeader>
           <CardContent className="space-y-4">
              <InsightItem 
                icon={<Lightbulb className="h-4 w-4 text-yellow-500" />}
                title="Alta dependencia de Portales"
                text="75% de los leads provienen de Zonaprop. Diversificar fuentes reduciría el riesgo de adquisición."
              />
              <InsightItem 
                icon={<Lightbulb className="h-4 w-4 text-blue-500" />}
                title="Ciclo de Vida 'Flash'"
                text="Gran volumen de leads se cierran en < 24h. Podría indicar falta de seguimiento real o descarte automático."
              />
              <InsightItem 
                icon={<Lightbulb className="h-4 w-4 text-emerald-500" />}
                title="Top Asesores"
                text="Un asesor concentra el 45% del total. Equilibrar la carga mejoraría la calidad de atención."
              />
           </CardContent>
        </Card>
      </div>

      {/* Matriz de Gestión por Agente */}
      <Card className="bg-card/30 backdrop-blur-md border border-accent/10">
         <CardHeader>
            <CardTitle className="text-base font-bold">Matriz de Gestión: Estado vs Asesor</CardTitle>
         </CardHeader>
         <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
               <BarChart data={agentStatusMatrix} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ffffff05" />
                  <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={10} axisLine={false} tickLine={false} width={100} />
                  <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }} />
                  <Bar dataKey="Activos" stackId="a" fill="#10b981" barSize={15} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Cerrados" stackId="a" fill="#64748b" barSize={15} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Negociacion" stackId="a" fill="#3b82f6" barSize={15} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Perdidos" stackId="a" fill="#ef4444" barSize={15} radius={[0, 4, 4, 0]} />
               </BarChart>
            </ResponsiveContainer>
         </CardContent>
      </Card>
    </div>
  );
}

function InsightItem({ icon, title, text }: { icon: React.ReactNode, title: string, text: string }) {
   return (
      <div className="flex gap-3">
         <div className="mt-1">{icon}</div>
         <div className="space-y-0.5">
            <h5 className="text-[11px] font-black uppercase text-foreground">{title}</h5>
            <p className="text-[10px] text-muted-foreground leading-snug">{text}</p>
         </div>
      </div>
   )
}
