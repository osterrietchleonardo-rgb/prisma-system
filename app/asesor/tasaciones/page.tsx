"use client";

import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Calculator, History } from "lucide-react";

import { Sujeto, Comparable, ResultadoTasacion, FactorAjusteValor } from "@/lib/tasacion/types";
import { Step1Sujeto } from "@/app/asesor/tasaciones/components/step1-sujeto";
import { Step2Comparables } from "@/app/asesor/tasaciones/components/step2-comparables";
import { Step3Grilla } from "@/app/asesor/tasaciones/components/step3-grilla";
import { Step4Resultado } from "@/app/asesor/tasaciones/components/step4-resultado";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";

export default function TasacionesPageWrapper() {
  const [tab, setTab] = useState("mcm");
  const [step, setStep] = useState(1);
  const supabase = createClient();

  // ESTADO GLOBAL DE TASACION MCM
  const [sujeto, setSujeto] = useState<Sujeto>({
    direccion: "",
    barrio: "",
    tipo_propiedad: "departamento",
    m2_cubiertos: 0,
    m2_semicubiertos: 0,
    m2_descubiertos: 0,
    antiguedad_anios: 0,
    estado_conservacion: "bueno",
    calidad_construccion: "estandar",
    dormitorios: 0,
    banos: 0,
    orientacion: "norte",
    piso: 0,
    vista: "frente",
    amenidades: {
      cochera_cubierta: false,
      cochera_descubierta: false,
      baulera: false,
      pileta: false,
      gimnasio: false,
      sum: false,
      seguridad_24hs: false,
      jardin_privado: false,
      terraza_privada: false
    },
    ocupacion: "libre",
    moneda: "USD"
  });

  const [comparables, setComparables] = useState<Comparable[]>([]);
  
  // Configuracion Global
  const [configGlobal, setConfigGlobal] = useState({
    meses_transcurridos_por_comp: {},
    variacion_mensual: 0,
    descuento_oferta: -8,
    margen_negociacion: 5
  });

  // Sobrescrituras y Exclusiones de Step 3
  const [sobrescrituras, setSobrescrituras] = useState<Record<string, Partial<FactorAjusteValor>>>({});
  const [excluidos, setExcluidos] = useState<string[]>([]);
  
  // Resultados y metadata de informe
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoTasacion | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");

  const [currentTasacionId, setCurrentTasacionId] = useState<string | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);

  const loadHistorial = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if(!session) return;
    const { data } = await supabase.from('tasaciones').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false }).limit(10);
    if(data) setHistorial(data);
  }, [supabase]);

  useEffect(() => {
    loadHistorial();
  }, [loadHistorial]);

  const saveBorrador = useCallback(async (isFinal = false) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if(!session) return;

        const payload = {
          user_id: session.user.id,
          sujeto,
          comparables,
          factores_configuracion: { configGlobal, sobrescrituras, excluidos },
          resultado: resultadoFinal,
          observaciones,
          cliente_nombre: clienteNombre,
          estado: isFinal ? 'finalizada' : 'borrador',
          updated_at: new Date().toISOString()
        };

        if (currentTasacionId) {
          await supabase.from('tasaciones').update(payload).eq('id', currentTasacionId);
        } else {
          const { data } = await supabase.from('tasaciones').insert(payload).select('id').single();
          if (data) setCurrentTasacionId(data.id);
        }
        loadHistorial();
        toast.info(isFinal ? "Tasación guardada" : "Borrador guardado", { position: "bottom-right", duration: 1500 });
    } catch(e) {
        console.error("Error saving draft", e);
    }
  }, [supabase, sujeto, comparables, configGlobal, sobrescrituras, excluidos, resultadoFinal, observaciones, clienteNombre, currentTasacionId, loadHistorial]);

  const handleNextStep1 = () => {
    setStep(2);
    saveBorrador();
  };

  const handleNextStep2 = () => {
    setStep(3);
    saveBorrador();
  };

  const handleNextStep3 = (res: ResultadoTasacion) => {
    setResultadoFinal(res);
    setStep(4);
    saveBorrador();
  };

  const handeSaveDefinitiva = async () => {
    await saveBorrador(true);
    toast.success("Tasación finalizada y guardada en el historial.");
    setStep(1);
    setCurrentTasacionId(null);
  };

  const loadTasacionEnCurso = (t: any) => {
    setSujeto(t.sujeto);
    setComparables(t.comparables);
    setConfigGlobal(t.factores_configuracion?.configGlobal || configGlobal);
    setSobrescrituras(t.factores_configuracion?.sobrescrituras || {});
    setExcluidos(t.factores_configuracion?.excluidos || []);
    setResultadoFinal(t.resultado);
    setObservaciones(t.observaciones || "");
    setClienteNombre(t.cliente_nombre || "");
    setCurrentTasacionId(t.id);
    setStep(t.resultado ? 4 : (t.comparables?.length > 0 ? 3 : 1));
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Módulo de Tasaciones
          </h2>
          <p className="text-muted-foreground mt-1">
            Genera valoraciones precisas para tus captaciones.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-card w-full justify-start h-12 p-1 border border-accent/10 mb-6">
          <TabsTrigger value="mcm" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground flex-1 sm:flex-none">
            <Calculator className="w-4 h-4 mr-2" /> Método Comparación (MCM)
          </TabsTrigger>
          <TabsTrigger value="ia" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground flex-1 sm:flex-none">
            <Sparkles className="w-4 h-4 mr-2" /> Tasador Rápido (IA)
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="mcm" className="mt-0">
          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3">
                <Card className="border-accent/10 bg-card/20 backdrop-blur-md shadow-xl overflow-hidden print:shadow-none print:border-none print:bg-white">
                  <CardHeader className="border-b border-accent/5 pb-4 print:hidden">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-accent">Paso {step} de 4</p>
                        <Badge variant="outline" className="text-[10px] border-accent/10">MCM Pro v2.0</Badge>
                    </div>
                    <Progress value={(step / 4) * 100} className="h-1 bg-accent/10" indicatorClassName="bg-accent" />
                  </CardHeader>
                  <CardContent className="p-0 sm:p-8 print:p-0">
                    <div className="p-4 sm:p-0">
                    {step === 1 && (
                      <Step1Sujeto 
                        sujeto={sujeto} 
                        onChange={setSujeto} 
                        onNext={handleNextStep1} 
                      />
                    )}
                    {step === 2 && (
                      <Step2Comparables 
                        comparables={comparables} 
                        onChange={setComparables} 
                        onNext={handleNextStep2} 
                        onPrev={() => setStep(1)}
                      />
                    )}
                    {step === 3 && (
                      <Step3Grilla 
                        sujeto={sujeto}
                        comparables={comparables}
                        configGlobal={configGlobal}
                        setConfigGlobal={setConfigGlobal}
                        sobrescrituras={sobrescrituras}
                        setSobrescrituras={setSobrescrituras}
                        excluidos={excluidos}
                        setExcluidos={setExcluidos}
                        onNext={handleNextStep3}
                        onPrev={() => setStep(2)}
                      />
                    )}
                    {step === 4 && resultadoFinal && (
                      <Step4Resultado
                        sujeto={sujeto}
                        comparables={comparables}
                        resultado={resultadoFinal}
                        observaciones={observaciones}
                        setObservaciones={setObservaciones}
                        clienteNombre={clienteNombre}
                        setClienteNombre={setClienteNombre}
                        onPrev={() => setStep(3)}
                        onFinishSave={handeSaveDefinitiva}
                      />
                    )}
                    </div>
                  </CardContent>
                </Card>
            </div>

            <div className="space-y-6 print:hidden">
              <Card className="border-accent/10 bg-card/20">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <History className="h-5 w-5 text-accent" />
                    Historial
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {historial.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">Tus tasaciones recientes aparecerán aquí.</p>
                  ) : (
                    historial.map((h) => (
                      <div key={h.id} className="p-3 rounded-xl border border-accent/10 bg-card/40 hover:bg-card/80 transition-all cursor-pointer" onClick={() => loadTasacionEnCurso(h)}>
                        <div className="flex justify-between items-start mb-1">
                           <span className={`text-[10px] font-bold uppercase ${h.estado === 'borrador' ? 'text-amber-500' : 'text-green-500'}`}>{h.estado}</span>
                           <span className="text-[10px] text-muted-foreground">{format(new Date(h.updated_at), 'dd/MM/yy')}</span>
                        </div>
                        <p className="text-sm font-bold truncate pr-4">{h.sujeto?.direccion || "Sin dirección"}</p>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{h.sujeto?.tipo_propiedad}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
              
               <div className="p-6 rounded-3xl bg-accent/5 border border-accent/10 text-xs text-muted-foreground">
                  <p><strong>Cálculo Homogeneizado:</strong> El módulo compara características constructivas (% de mejora/detrimento), superficies (m² equivalentes totales) y amenities frente al inmueble a tasar.</p>
               </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ia" className="mt-0">
           <div className="p-12 text-center text-muted-foreground bg-card/10 rounded-2xl border border-accent/10">
               El módulo IA rápido ha sido movido temporalmente.
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
