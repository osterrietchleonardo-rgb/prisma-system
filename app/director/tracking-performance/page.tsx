"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  TrendingUp, 
  Plus, 
  Search, 
  Loader2, 
  LayoutDashboard,
  Filter,
  Trash2,
  Edit2
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PerformanceScaleEditor } from "@/components/tracking/PerformanceScaleEditor";
import { PerformanceHistoryList } from "@/components/tracking/PerformanceHistoryList";
import { PerformanceLogDrawer } from "@/components/tracking/PerformanceLogDrawer";
import { createClient } from "@/lib/supabase/client";
import { getPerformanceLogs } from "@/lib/tracking/queries";
import { AgencyPerformanceConfig, PerformanceLog } from "@/lib/tracking/types";
import { deletePerformanceLog } from "@/actions/tracking/deletePerformanceLog";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TrackingPerformancePageProps {
  isDirector?: boolean;
}

export default function TrackingPerformancePage({ isDirector = true }: TrackingPerformancePageProps) {
  const [activeTab, setActiveTab] = useState("actividad");
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [logToEdit, setLogToEdit] = useState<PerformanceLog | null>(null);
  const [agencyConfig, setAgencyConfig] = useState<AgencyPerformanceConfig | null>(null);
  
  // Deletion states
  const [logToDelete, setLogToDelete] = useState<PerformanceLog | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  
  // Filters
  const [filter, setFilter] = useState<"todos" | "prospeccion" | "prelisting" | "prebuying" | "captacion" | "reserva" | "cierre">("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "original" | "modificada" | "eliminada">("todos");
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

  const handleDeleteConfirm = async () => {
    if (!logToDelete) return;
    if (!deleteReason || deleteReason.trim() === '') {
        toast.error("Debes ingresar un motivo para eliminar este registro");
        return;
    }

    setIsDeleting(true);
    try {
      await deletePerformanceLog(logToDelete.id, deleteReason);
      toast.success("Registro de actividad eliminado correctamente");
      setLogToDelete(null);
      setDeleteReason("");
      fetchLogs();
    } catch (error: any) {
      console.error(error);
      toast.error("Ocurrió un error al intentar eliminar el registro");
    } finally {
      setIsDeleting(false);
    }
  };

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
    const matchesFilter = filter === "todos" || log.type === filter;
    const matchesStatus = statusFilter === "todos" || log.status === statusFilter || (statusFilter === "original" && !log.status);
    
    const matchesSearch = 
      !search || 
      log.propiedad_ref?.toLowerCase().includes(search.toLowerCase()) ||
      Object.values(log.metadata || {}).some(val => 
        val?.toString().toLowerCase().includes(search.toLowerCase())
      );

    return matchesFilter && matchesSearch && matchesStatus;
  });

  return (
    <div id="tracking-performance-page" className="w-full p-4 md:p-8 flex flex-col gap-6 md:gap-8 pb-32">
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
              {isDirector && (
                <TabsTrigger value="configuracion" className="text-xs md:text-sm px-4">Configuración IA</TabsTrigger>
              )}
            </TabsList>
            
            {activeTab === "actividad" && (
              <Button 
                onClick={() => {
                  setLogToEdit(null);
                  setIsDrawerOpen(true);
                }}
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
                <div className="tracking-tabs-list flex bg-muted/30 p-1 rounded-xl border border-white/5">
                    <button 
                      onClick={() => setFilter("todos")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'todos' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Todos
                    </button>
                    <button 
                      onClick={() => setFilter("prospeccion")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'prospeccion' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Prospección
                    </button>
                    <button 
                      onClick={() => setFilter("prelisting")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'prelisting' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Prelisting
                    </button>
                    <button 
                      onClick={() => setFilter("prebuying")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'prebuying' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Prebuying
                    </button>
                    <button 
                      onClick={() => setFilter("captacion")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'captacion' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Captación
                    </button>
                    <button 
                      onClick={() => setFilter("reserva")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'reserva' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Reserva
                    </button>
                    <button 
                      onClick={() => setFilter("cierre")} 
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'cierre' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-muted-foreground hover:text-white'}`}
                    >
                      Cierre
                    </button>
                </div>
                {isDirector && (
                  <div className="tracking-tabs-list flex bg-muted/30 p-1 rounded-xl border border-white/5 ml-2">
                    <button onClick={() => setStatusFilter("todos")} className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${statusFilter === 'todos' ? 'bg-white/20 text-white shadow-sm' : 'text-muted-foreground hover:text-white'}`}>Todos</button>
                    <button onClick={() => setStatusFilter("original")} className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${statusFilter === 'original' ? 'bg-white/20 text-white shadow-sm' : 'text-muted-foreground hover:text-white'}`}>Originales</button>
                    <button onClick={() => setStatusFilter("modificada")} className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${statusFilter === 'modificada' ? 'bg-white/20 text-white shadow-sm' : 'text-muted-foreground hover:text-white'}`}>Modificadas</button>
                    <button onClick={() => setStatusFilter("eliminada")} className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${statusFilter === 'eliminada' ? 'bg-white/20 text-white shadow-sm' : 'text-muted-foreground hover:text-white'}`}>Eliminadas</button>
                  </div>
                )}
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
            <PerformanceHistoryList 
              logs={filteredLogs} 
              onRefresh={fetchLogs} 
              isDirector={isDirector}
              onEdit={(log) => {
                setLogToEdit(log);
                setIsDrawerOpen(true);
              }}
              onDelete={(log) => {
                setLogToDelete(log);
                setDeleteReason("");
              }}
            />
          )}
        </TabsContent>

        {isDirector && (
          <TabsContent value="configuracion" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PerformanceScaleEditor initialConfig={agencyConfig} />
          </TabsContent>
        )}
      </Tabs>

      <PerformanceLogDrawer 
        open={isDrawerOpen} 
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) setLogToEdit(null);
        }}
        onSuccess={fetchLogs}
        logToEdit={logToEdit}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!logToDelete} onOpenChange={(open) => {
        if (!open) {
          setLogToDelete(null);
          setDeleteReason("");
        }
      }}>
        <DialogContent className="border-destructive/20 border-2 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-destructive flex items-center gap-2">
               <Trash2 className="w-5 h-5" /> ¿Eliminar Actividad?
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar este registro de actividad? Esta acción no se puede deshacer y afectará a las métricas del pipeline.
            </DialogDescription>
          </DialogHeader>
          {logToDelete && (
            <div className="bg-muted/30 p-4 rounded-xl space-y-2 border">
              <p className="text-xs text-muted-foreground">Detalles del registro:</p>
              <div className="grid grid-cols-2 gap-y-1 text-xs">
                <span className="font-semibold text-muted-foreground">Fecha:</span>
                <span className="font-medium text-white/95">{new Date(logToDelete.fecha_actividad).toLocaleDateString()}</span>
                <span className="font-semibold text-muted-foreground">Tipo:</span>
                <span className="capitalize font-medium text-white/95">{logToDelete.type}</span>
                {logToDelete.propiedad_ref && (
                  <>
                    <span className="font-semibold text-muted-foreground">Referencia:</span>
                    <span className="font-medium text-white/95 truncate">{logToDelete.propiedad_ref}</span>
                  </>
                )}
                {logToDelete.monto_operacion !== null && logToDelete.monto_operacion > 0 && (
                  <>
                    <span className="font-semibold text-muted-foreground">Monto:</span>
                    <span className="font-medium text-white/95">USD {logToDelete.monto_operacion.toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2 mt-4">
            <Label htmlFor="delete-reason" className="text-destructive font-semibold">Motivo de la eliminación *</Label>
            <Textarea 
              id="delete-reason" 
              value={deleteReason} 
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Explica brevemente por qué estás eliminando este registro..." 
              className="min-h-[80px]"
              required
            />
          </div>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setLogToDelete(null)} disabled={isDeleting}>Cancelar</Button>
            <Button onClick={handleDeleteConfirm} disabled={isDeleting} variant="destructive">
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Confirmar Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
