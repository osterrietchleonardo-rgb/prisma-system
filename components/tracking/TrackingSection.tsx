"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getLeads } from "@/lib/tracking/queries";
import { calculateKPIs } from "@/lib/tracking/kpiCalculations";
import { DashboardFilters, Lead } from "@/lib/tracking/types";
import { TrackingKPIs } from "./TrackingKPIs";
import { TrackingCharts } from "./TrackingCharts";
import { TrackingAlerts } from "./TrackingAlerts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingUp, Calendar, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  isDirector: boolean;
}

export function TrackingSection({ isDirector }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<DashboardFilters>({
    period: "month",
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getLeads();
      setLeads(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { kpis, funnelData, originData, performanceRadar, lineChartData } = calculateKPIs(leads, filters);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-6 text-muted-foreground border-2 border-dashed rounded-3xl bg-muted/5 animate-pulse">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-semibold text-lg">Analizando métricas de performance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-8 animate-in fade-in duration-700">
      
      {/* Top Section: Filters & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-background p-6 rounded-2xl border shadow-sm border-primary/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl">
             <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Tracking Performance</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
               <Calendar className="w-3.5 h-3.5" />
               Monitoreo de leads y eficiencia comercial en tiempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Tabs defaultValue="month" className="w-full md:w-auto" onValueChange={(v) => setFilters(prev => ({ ...prev, period: v as any }))}>
             <TabsList className="bg-muted/50 border p-1 rounded-lg">
                <TabsTrigger value="week" className="px-5 data-[state=active]:bg-background">Semana</TabsTrigger>
                <TabsTrigger value="month" className="px-5 data-[state=active]:bg-background">Mes</TabsTrigger>
                <TabsTrigger value="3months" className="px-5 data-[state=active]:bg-background">3 Meses</TabsTrigger>
             </TabsList>
          </Tabs>

          {isDirector && (
            <Select onValueChange={(v) => setFilters(prev => ({ ...prev, userId: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-[180px] bg-background">
                 <Filter className="w-3 h-3 mr-2 text-muted-foreground" />
                 <SelectValue placeholder="Todos los asesores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {/* Dynamically list advisor names if available */}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <TrackingKPIs data={kpis} />

      {/* Alerts for Director */}
      <TrackingAlerts leads={leads} isDirector={isDirector} />

      {/* Charts Section */}
      <TrackingCharts 
        lineData={lineChartData} 
        funnelData={funnelData} 
        originData={originData} 
        radarData={performanceRadar} 
      />

    </div>
  );
}
