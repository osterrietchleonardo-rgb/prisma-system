"use client";

import { useMemo, useState } from "react";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter } from "date-fns";
import { 
  Filter, Calendar as CalendarIcon, LayoutDashboard, Database, ShieldCheck, Zap
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { NormalizedLead, TokkoTag } from "./tokko-leads-utils";
import { LeadsOverviewTab } from "./dashboard/LeadsOverviewTab";
import { DataStructureTab } from "./dashboard/DataStructureTab";
import { DataQualityTab } from "./dashboard/DataQualityTab";
import { ProposedDashboardTab } from "./dashboard/ProposedDashboardTab";
import { cn } from "@/lib/utils";

interface LeadsDashboardProps {
  leads: NormalizedLead[];
  tagsByGroup: Record<string, TokkoTag[]>;
  lastSync?: Date | null;
}

export function LeadsDashboard({ leads, tagsByGroup, lastSync }: LeadsDashboardProps) {
  const [dateRange, setDateRange] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredLeads = useMemo(() => {
    let result = [...leads];
    
    // Agent Filter
    if (agentFilter !== "all") {
      result = result.filter(l => l.agent?.id?.toString() === agentFilter);
    }
    
    // Status Filter
    if (statusFilter !== "all") {
      result = result.filter(l => l.lead_status === statusFilter);
    }
    
    // Date Filter
    const today = new Date();
    if (dateRange !== "all") {
      let startDate = new Date();
      if (dateRange === "today") startDate = startOfDay(today);
      if (dateRange === "week") startDate = startOfWeek(today, { weekStartsOn: 1 });
      if (dateRange === "month") startDate = startOfMonth(today);
      if (dateRange === "quarter") startDate = startOfQuarter(today);
      
      result = result.filter(l => new Date(l.created_at) >= startDate);
    }

    return result;
  }, [leads, dateRange, agentFilter, statusFilter]);

  // Active Agents for filter
  const activeAgents = useMemo(() => {
    const agentsMap = new Map();
    leads.forEach(l => {
      if (l.agent && l.agent.id) {
        agentsMap.set(l.agent.id.toString(), { id: l.agent.id, name: l.agent.name });
      }
    });
    return Array.from(agentsMap.values());
  }, [leads]);

  return (
    <div className="flex flex-col space-y-6 animate-in fade-in duration-700">
      
      {/* Header & Global Filters */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
           <div className="space-y-1">
              <h1 className="text-xl md:text-2xl font-black tracking-tight flex flex-wrap items-center gap-2 text-white">
                 Análisis de Leads — Tokko CRM
                 <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] md:text-[10px] font-bold">
                    Datos Reales (Sincronizado)
                 </Badge>
              </h1>
              <p className="text-xs text-muted-foreground font-medium">
                 {lastSync ? `Última sincronización: ${lastSync.toLocaleString()} · ` : ""}
                 Visualizando {filteredLeads.length.toLocaleString()} registros filtrados
              </p>
           </div>

           <div className="flex flex-wrap items-center gap-3 bg-card/40 backdrop-blur-md p-2 rounded-xl border border-accent/10">
              <div className="flex items-center gap-2 px-2 border-r border-accent/10 mr-1">
                 <Filter className="h-3 w-3 text-muted-foreground" />
                 <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Filtros</span>
              </div>
              
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full sm:w-[140px] h-10 md:h-8 text-[11px] md:text-[10px] bg-transparent border-none focus:ring-0">
                   <CalendarIcon className="h-3 w-3 mr-2 text-accent" />
                   <SelectValue placeholder="Rango" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el tiempo</SelectItem>
                  <SelectItem value="today">Hoy</SelectItem>
                  <SelectItem value="week">Esta semana</SelectItem>
                  <SelectItem value="month">Este mes</SelectItem>
                </SelectContent>
              </Select>

               <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-full sm:w-[160px] h-10 md:h-8 text-[11px] md:text-[10px] bg-transparent border-none focus:ring-0">
                   <LayoutDashboard className="h-3 w-3 mr-2 text-accent" />
                   <SelectValue placeholder="Asesor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los asesores</SelectItem>
                  {activeAgents.map(ag => (
                    <SelectItem key={ag.id} value={ag.id.toString()}>{ag.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

               <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px] h-10 md:h-8 text-[11px] md:text-[10px] bg-transparent border-none focus:ring-0">
                   <Database className="h-3 w-3 mr-2 text-accent" />
                   <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="En negociación">En negociación</SelectItem>
                  <SelectItem value="Cerrado">Cerrado</SelectItem>
                  <SelectItem value="Perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
           </div>
        </div>

        {/* Dashboard Navigation */}
        <Tabs defaultValue="overview" className="w-full">
           <TabsList className="bg-card/40 backdrop-blur-md border border-accent/10 h-10 p-1 mb-8">
              <TabsTrigger value="overview" className="text-xs font-bold gap-2">
                 <LayoutDashboard className="h-3.5 w-3.5" />
                 Visión general
              </TabsTrigger>
              <TabsTrigger value="structure" className="text-xs font-bold gap-2">
                 <Database className="h-3.5 w-3.5" />
                 Estructura de datos
              </TabsTrigger>
              <TabsTrigger value="quality" className="text-xs font-bold gap-2">
                 <ShieldCheck className="h-3.5 w-3.5" />
                 Calidad de datos
              </TabsTrigger>
              <TabsTrigger value="proposed" className="text-xs font-bold gap-2">
                 <Zap className="h-3.5 w-3.5" />
                 Dashboard propuesto
              </TabsTrigger>
           </TabsList>

           <TabsContent value="overview">
              <LeadsOverviewTab leads={filteredLeads} />
           </TabsContent>
           
           <TabsContent value="structure">
              <DataStructureTab />
           </TabsContent>

           <TabsContent value="quality">
              <DataQualityTab leads={filteredLeads} />
           </TabsContent>

           <TabsContent value="proposed">
              <ProposedDashboardTab leads={filteredLeads} />
           </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}

