"use client";

import { useMemo } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NormalizedLead } from "../tokko-leads-utils";
import { FAST_CHART_COLORS, CHART_PALETTE } from "../tags.config";
import { cn } from "@/lib/utils";
import { Users, Target, Activity, UserMinus } from "lucide-react";

interface LeadsOverviewTabProps {
  leads: NormalizedLead[];
}

export function LeadsOverviewTab({ leads }: LeadsOverviewTabProps) {
  // 1. KPIs
  const totalLeads = leads.length;
  const statusDominante = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => counts[l.lead_status] = (counts[l.lead_status] || 0) + 1);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { name: sorted[0][0], count: sorted[0][1] } : { name: "N/A", count: 0 };
  }, [leads]);

  const agentesActivos = useMemo(() => {
    const set = new Set(leads.map(l => l.agent?.id).filter(Boolean));
    return set.size;
  }, [leads]);

  const sinNombreCount = leads.filter(l => !l.tiene_nombre).length;
  const sinNombrePerc = totalLeads > 0 ? Math.round((sinNombreCount / totalLeads) * 100) : 0;

  // 2. Distribución por Agente
  const agentDistribution = useMemo(() => {
    const map = new Map();
    leads.forEach(l => {
      if (!l.agent) return;
      if (!map.has(l.agent.id)) {
        map.set(l.agent.id, { 
          id: l.agent.id, name: l.agent.name, picture: l.agent.picture, count: 0 
        });
      }
      map.get(l.agent.id).count++;
    });
    const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);
    const max = sorted[0]?.count || 1;
    return sorted.map(a => ({ ...a, percentage: (a.count / max) * 100 }));
  }, [leads]);

  // 3. Origen de Contacto
  const sourceStats = useMemo(() => {
    const map = new Map();
    leads.forEach(l => {
      const src = l.origen || "Sin etiqueta";
      map.set(src, (map.get(src) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  // 4. Tipos de contacto (Buyers/Inquiries, Propietarios, Empresas)
  const contactTypes = useMemo(() => {
    const buyers = leads.filter(l => !l.es_corporativo && !l.is_owner).length;
    const owners = leads.filter(l => l.is_owner).length;
    const companies = leads.filter(l => l.es_corporativo).length;
    return [
      { name: "Buyers/Inquiries", count: buyers, color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      { name: "Propietarios", count: owners, color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
      { name: "Empresas", count: companies, color: "bg-purple-500/10 text-purple-500 border-purple-500/20" }
    ];
  }, [leads]);

  // 5. Ciclo de vida (Muestra de registros con tiempo de cierre)
  const lifecycleData = useMemo(() => {
    return leads
      .filter(l => l.tiempo_de_cierre_horas !== null)
      .slice(0, 8) // Limit to top 8 for the chart
      .map(l => ({
        name: l.nombre_mostrar,
        value: l.tiempo_de_cierre_horas || 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="Total contactos" 
          value={totalLeads.toLocaleString()} 
          subtitle="en dataset completo" 
          icon={<Users className="h-4 w-4 text-accent" />}
        />
        <KPICard 
          title="Estado dominante" 
          value={statusDominante.name} 
          subtitle={`${Math.round((statusDominante.count / totalLeads) * 100)}% en esta muestra`} 
          icon={<Target className="h-4 w-4 text-accent" />}
          badge={statusDominante.name}
        />
        <KPICard 
          title="Agentes activos" 
          value={agentesActivos.toString()} 
          subtitle="en muestra" 
          icon={<Activity className="h-4 w-4 text-accent" />}
        />
        <KPICard 
          title="Sin nombre" 
          value={`${sinNombrePerc}%`} 
          subtitle={`${sinNombreCount} de ${totalLeads} registros`} 
          icon={<UserMinus className="h-4 w-4 text-destructive" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por Agente */}
        <Card className="bg-card/30 backdrop-blur-md border border-accent/10">
          <CardHeader>
            <CardTitle className="text-base font-bold">Distribución por agente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {agentDistribution.slice(0, 6).map((ag) => (
              <div key={ag.id} className="flex items-center gap-4">
                <Avatar className="h-8 w-8 border border-accent/20">
                  <AvatarImage src={ag.picture} />
                  <AvatarFallback className="text-[10px]">{ag.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">{ag.name}</span>
                    <span className="font-bold text-muted-foreground">{ag.count}</span>
                  </div>
                  <Progress value={ag.percentage} className="h-1.5" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Origen de Contacto */}
        <Card className="bg-card/30 backdrop-blur-md border border-accent/10">
          <CardHeader>
            <CardTitle className="text-base font-bold">Origen de contacto (tags)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={sourceStats.slice(0, 5)} layout="vertical" margin={{ left: -20, right: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" fontSize={11} axisLine={false} tickLine={false} width={100} />
                      <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                         {sourceStats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={FAST_CHART_COLORS[entry.name] || CHART_PALETTE[index % CHART_PALETTE.length]} />
                         ))}
                      </Bar>
                   </BarChart>
                </ResponsiveContainer>
             </div>
             
             <div className="space-y-4 pt-4 border-t border-accent/5">
                <h4 className="text-sm font-bold">Tipos de contacto</h4>
                <div className="flex flex-wrap gap-2">
                   {contactTypes.map((type) => (
                      <Badge key={type.name} variant="outline" className={cn("px-3 py-1 text-[10px] font-bold transition-all hover:scale-105", type.color)}>
                         {type.name}: {type.count}
                      </Badge>
                   ))}
                </div>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Ciclo de vida */}
      <Card className="bg-card/30 backdrop-blur-md border border-accent/10">
        <CardHeader>
           <CardTitle className="text-base font-bold">Ciclo de vida del lead (created → deleted)</CardTitle>
           <p className="text-[11px] text-muted-foreground mt-1">Tiempo en sistema antes de cierre — muestra de registros con deleted_at</p>
        </CardHeader>
        <CardContent>
           <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lifecycleData} layout="vertical" margin={{ left: 20, right: 40 }}>
                   <XAxis type="number" hide />
                   <YAxis dataKey="name" type="category" fontSize={11} axisLine={false} tickLine={false} width={100} />
                   <RechartsTooltip 
                    formatter={(value: number) => [`${value}h`, "Horas en sistema"]}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }} 
                   />
                   <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={10} fill="#10b981" minPointSize={4}>
                      {lifecycleData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fillOpacity={1 - (index * 0.1)} />
                      ))}
                   </Bar>
                </BarChart>
             </ResponsiveContainer>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, badge }: { 
  title: string, value: string, subtitle: string, icon: React.ReactNode, badge?: string 
}) {
  return (
    <Card className="bg-card/40 backdrop-blur-md border border-accent/10 transition-all hover:border-accent/30 group">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{title}</span>
          <div className="p-2 rounded-lg bg-accent/5 group-hover:bg-accent/10 transition-colors">
            {icon}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black">{value}</span>
            {badge && (
               <Badge variant="outline" className="text-[8px] bg-accent/10 text-accent border-accent/20 px-1 py-0 h-4">
                  {badge}
               </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}
