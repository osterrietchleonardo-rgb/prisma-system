"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  TrendingUp, 
  Plus, 
  Search, 
  Loader2, 
  LayoutDashboard,
  Filter
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PerformanceScaleEditor } from "@/components/tracking/PerformanceScaleEditor";
import { PerformanceHistoryList } from "@/components/tracking/PerformanceHistoryList";
import { PerformanceLogDrawer } from "@/components/tracking/PerformanceLogDrawer";
import { createClient } from "@/lib/supabase/client";
import { getPerformanceLogs } from "@/lib/tracking/queries";
import { AgencyPerformanceConfig, PerformanceLog } from "@/lib/tracking/types";

export default function TrackingPerformancePage() {
  const [activeTab, setActiveTab] = useState("actividad");
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [agencyConfig, setAgencyConfig] = useState<AgencyPerformanceConfig | null>(null);
  
  // Filters
  const [filter, setFilter] = useState<"todos" | "captaciones" | "transacciones">("todos");
  const [search, setSearch] = useState("");

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPerformanceLogs();
      setLogs(data);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAgencyConfig = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", user.id)
      .single();

    if (profile?.agency_id) {
      const { data: agency } = await supabase
        .from("agencies")
        .select("performance_config")
        .eq("id", profile.agency_id)
        .single();
      
      if (agency?.performance_config) {
        setAgencyConfig(agency.performance_config);
      }
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchAgencyConfig();
    window.dispatchEvent(new CustomEvent('prisma-header-title', { detail: "Tracking Performance" }));
  }, [fetchLogs, fetchAgencyConfig]);

  const filteredLogs = logs.filter(log => {
    const matchesFilter = 
      filter === "todos" || 
      (filter === "captaciones" && log.type === "captacion") ||
      (filter === "transacciones" && log.type === "transaccion");
    
    const matchesSearch = 
      !search || 
      log.nombre_cliente?.toLowerCase().includes(search.toLowerCase()) ||
      log.propiedad_ref?.toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="w-full p-4 md:p-8 flex flex-col gap-6 md:gap-8 pb-32">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 mb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-accent mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent/70">Gestión de Rendimiento</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white/90">
              Tracking Performance
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <TabsList className="bg-muted/30 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
              <TabsTrigger value="actividad" className="text-xs md:text-sm px-4">Actividad</TabsTrigger>
              <TabsTrigger value="configuracion" className="text-xs md:text-sm px-4">Configuración IA</TabsTrigger>
            </TabsList>
            
            {activeTab === "actividad" && (
              <Button 
                onClick={() => setIsDrawerOpen(true)}
                className="bg-accent hover:bg-accent/90 text-white font-bold h-10 px-6 rounded-xl shadow-lg shadow-accent/20 gap-2 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nueva Actividad</span>
              </Button>
            )}
          </div>
        </header>

        <TabsContent value="actividad" className="space-y-6 mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="bg-card/30 border-accent/10 backdrop-blur-md p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="flex bg-muted/30 p-1 rounded-xl border border-white/5">
                    <button 
                      onClick={() => setFilter("todos")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'todos' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Todos
                    </button>
                    <button 
                      onClick={() => setFilter("captaciones")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'captaciones' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Captaciones
                    </button>
                    <button 
                      onClick={() => setFilter("transacciones")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'transacciones' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Transacciones
                    </button>
                </div>
              </div>

              <div className="relative w-full md:w-[320px]">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/50" />
                <Input 
                  placeholder="Buscar por cliente o propiedad..." 
                  className="pl-10 bg-background/30 border-white/5 focus:border-accent/50 transition-all rounded-xl h-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-muted-foreground border-2 border-dashed border-accent/10 rounded-[2rem] bg-accent/5">
               <Loader2 className="w-10 h-10 animate-spin text-accent/50" />
               <p className="font-medium tracking-wide">Analizando historial de performance...</p>
            </div>
          ) : (
            <PerformanceHistoryList logs={filteredLogs} onRefresh={fetchLogs} />
          )}
        </TabsContent>

        <TabsContent value="configuracion" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <PerformanceScaleEditor initialConfig={agencyConfig} />
        </TabsContent>
      </Tabs>

      <PerformanceLogDrawer 
        open={isDrawerOpen} 
        onOpenChange={setIsDrawerOpen}
        onSuccess={fetchLogs}
      />
    </div>
  );
}

// Simple Card component internal helper to avoid missing imports
function Card({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`rounded-3xl ${className}`}>
      {children}
    </div>
  )
}
