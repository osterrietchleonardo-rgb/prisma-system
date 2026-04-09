"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LeadsList } from "@/components/tracking/LeadsList";
import { LeadDrawer } from "@/components/tracking/LeadDrawer";
import { Button } from "@/components/ui/button";
import { Plus, Filter, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLeads } from "@/lib/tracking/queries";
import { Lead } from "@/lib/tracking/types";

export default function TrackingPerformancePage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");

  const fetchLeads = useCallback(async () => {
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
    fetchLeads();
    // Update header title
    window.dispatchEvent(new CustomEvent('prisma-header-title', { detail: "Seguimiento" }));
  }, [fetchLeads]);

  const filteredLeads = leads.filter(l => {
    const matchesSearch = l.nombre_lead.toLowerCase().includes(search.toLowerCase());
    if (filter === "todos") return matchesSearch;
    if (filter === "activos") return matchesSearch && l.estado === "activo";
    if (filter === "cerrados") return matchesSearch && l.estado === "cerrado";
    if (filter === "sin_seguimiento") return matchesSearch && !l.seguimiento_activo && l.estado === "activo";
    return matchesSearch;
  });

  return (
    <div className="w-full p-4 md:p-8 flex flex-col gap-6 md:gap-8 pb-32">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight bg-gradient-to-r from-accent to-accent/60 bg-clip-text text-transparent">
            Gestión de Leads
          </h1>
          <p className="text-xs md:text-sm lg:text-base text-muted-foreground max-w-md hidden sm:block">
            Centralizá el seguimiento de tus prospectos y optimizá el Score de Profesionalismo.
          </p>
        </div>

        <Button 
          size="sm" 
          className="h-10 md:h-12 bg-accent shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all font-bold group px-4 text-accent-foreground"
          onClick={() => setIsDrawerOpen(true)}
        >
          <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2 group-hover:rotate-90 transition-transform" />
          <span className="text-sm md:text-base">Nuevo Lead</span>
        </Button>
      </header>

      {/* Grid: Filters & Table */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <Tabs defaultValue="todos" className="w-full md:w-auto overflow-x-auto scrollbar-none" onValueChange={setFilter}>
            <TabsList className="bg-muted/50 p-1 rounded-lg border w-fit">
              <TabsTrigger value="todos" className="text-xs md:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">Todos</TabsTrigger>
              <TabsTrigger value="activos" className="text-xs md:text-sm data-[state=active]:bg-background">Activos</TabsTrigger>
              <TabsTrigger value="cerrados" className="text-xs md:text-sm data-[state=active]:bg-background">Cerrados</TabsTrigger>
              <TabsTrigger value="sin_seguimiento" className="text-xs md:text-sm data-[state=active]:bg-background">S/ Seguim.</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full md:w-[320px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground opacity-50" />
            <Input 
              placeholder="Buscar por nombre..." 
              className="pl-10 bg-background/50 border-muted-foreground/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4 text-muted-foreground border-2 border-dashed rounded-3xl bg-muted/5">
             <Loader2 className="w-8 h-8 animate-spin text-accent" />
             <p className="font-medium">Cargando tus leads...</p>
          </div>
        ) : (
          <LeadsList leads={filteredLeads} onRefresh={fetchLeads} />
        )}
      </div>

      <LeadDrawer 
        open={isDrawerOpen} 
        onOpenChange={setIsDrawerOpen}
        onSuccess={fetchLeads}
      />
    </div>
  );
}
