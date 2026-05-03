import { PerformanceScaleEditor } from "@/components/tracking/PerformanceScaleEditor";
import { createClient } from "@/lib/supabase/client";
import { AgencyPerformanceConfig } from "@/lib/tracking/types";
// ... (rest of imports)

export default function TrackingPerformancePage() {
  const [activeTab, setActiveTab] = useState("actividad");
  const [agencyConfig, setAgencyConfig] = useState<AgencyPerformanceConfig | null>(null);
  // ... (existing states)

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

  // ... (filteredLogs logic)

  return (
    <div className="w-full p-4 md:p-8 flex flex-col gap-6 md:gap-8 pb-32">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 mb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-accent mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Gestión de Rendimiento</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Tracking Performance
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <TabsList className="bg-muted/50 p-1 rounded-lg border">
              <TabsTrigger value="actividad" className="text-xs md:text-sm">Actividad</TabsTrigger>
              <TabsTrigger value="configuracion" className="text-xs md:text-sm">Configuración IA</TabsTrigger>
            </TabsList>
            
            {activeTab === "actividad" && (
              <Button 
                variant="accent"
                size="sm" 
                className="h-10 shadow-lg shadow-accent/20 font-bold group px-4"
                onClick={() => setIsDrawerOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
                <span>Nueva Actividad</span>
              </Button>
            )}
          </div>
        </header>

        <TabsContent value="actividad" className="space-y-6 mt-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               {/* Inner filters for activity */}
               <div className="flex bg-muted/50 p-0.5 rounded-lg border">
                  <button onClick={() => setFilter("todos")} className={`px-3 py-1.5 text-xs rounded-md transition-all ${filter === 'todos' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Todos</button>
                  <button onClick={() => setFilter("captaciones")} className={`px-3 py-1.5 text-xs rounded-md transition-all ${filter === 'captaciones' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Captaciones</button>
                  <button onClick={() => setFilter("transacciones")} className={`px-3 py-1.5 text-xs rounded-md transition-all ${filter === 'transacciones' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Transacciones</button>
               </div>
            </div>

            <div className="relative w-full md:w-[320px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground opacity-50" />
              <Input 
                placeholder="Buscar por cliente..." 
                className="pl-10 bg-background/50 border-muted-foreground/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-muted-foreground border-2 border-dashed rounded-3xl bg-muted/5">
               <Loader2 className="w-8 h-8 animate-spin text-accent" />
               <p className="font-medium">Cargando historial...</p>
            </div>
          ) : (
            <PerformanceHistoryList logs={filteredLogs} onRefresh={fetchLogs} />
          )}
        </TabsContent>

        <TabsContent value="configuracion" className="mt-0">
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

