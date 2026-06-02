"use client";

import React, { useState, useEffect } from "react";
import { 
  Settings2, 
  Target, 
  Save, 
  Sparkles, 
  Info,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AgencyPerformanceConfig } from "@/lib/tracking/types";
import { savePerformanceConfig } from "@/actions/tracking/savePerformanceConfig";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";

const EXPERT_PROMPT = `Evaluá los pasos en orden estricto 1 → 4. En cuanto se cumple una categoría, asigná esa clasificación base y aplicá el Modificador de Rotación.

──────────────────────────────────────────────────
PASO 1 — ¿ÉLITE?
──────────────────────────────────────────────────
Asignar 'Elite' si se cumple AL MENOS UNA de las siguientes:
  [1A]  facturacion_usd >= 10000
  [1B]  transacciones >= 4
  [1C]  rotacion_pct >= 15  Y  captaciones >= 5  Y  transacciones >= 2

──────────────────────────────────────────────────
PASO 2 — ¿SÓLIDO?
──────────────────────────────────────────────────
Asignar 'Sólido' si se cumplen TODAS las siguientes:
  [2A]  facturacion_usd >= 3000
  [2B]  transacciones >= 1
  [2C]  transacciones <= 3

──────────────────────────────────────────────────
PASO 3 — ¿EN DESARROLLO?
──────────────────────────────────────────────────
Asignar 'En Desarrollo' si se cumple AL MENOS UNA de las siguientes:
  [3A]  consultas >= 20  Y  (tasaciones >= 3 O captaciones >= 3)  Y  facturacion_usd < 3000
  [3B]  captaciones >= 4  Y  cartera_activa >= 5  Y  transacciones == 0
  [3C]  transacciones >= 1  Y  facturacion_usd < 3000

──────────────────────────────────────────────────
PASO 4 — REQUIERE ATENCIÓN
──────────────────────────────────────────────────
Si ningún paso anterior produjo resultado:
-> Clasificación = 'Requiere Atención'.

──────────────────────────────────────────────────
MODIFICADOR DE ROTACIÓN
──────────────────────────────────────────────────
Si rotacion_pct >= 20 Y transacciones >= 1, ascender exactamente UNA categoría:
  'Requiere Atención'  ->  'En Desarrollo'
  'En Desarrollo'      ->  'Sólido'`;

interface PerformanceScaleEditorProps {
  initialConfig: AgencyPerformanceConfig | null;
}

export function PerformanceScaleEditor({ initialConfig }: PerformanceScaleEditorProps) {
  const [config, setConfig] = useState<AgencyPerformanceConfig>(initialConfig || {
    metrics: {
      captacion: { target: 4, weight: 30, description: "Propiedades captadas por mes" },
      transaccion: { target: 2, weight: 50, description: "Ventas o cierres realizados" },
      facturacion: { target: 5000, weight: 20, description: "Comisión total generada (USD)" },
      rotacion: { target: 10, weight: 0, description: "Porcentaje de ventas vs cartera" }
    },
    custom_instructions: ""
  });

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const result = await savePerformanceConfig(config);
      if (result.success) {
        toast.success("Configuración guardada", {
          description: "La IA ahora evaluará siguiendo estos parámetros."
        });
      } else {
        toast.error("Error al guardar", { description: result.error });
      }
    } catch (error) {
      toast.error("Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const updateMetric = (key: keyof typeof config.metrics, field: "target" | "weight", value: string) => {
    const numValue = parseFloat(value) || 0;
    setConfig(prev => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        [key]: { ...prev.metrics[key], [field]: numValue }
      }
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-accent" />
            Configuración de Escala IA
          </h2>
          <p className="text-sm text-muted-foreground">
            Define los objetivos y criterios con los que la IA calificará a tus asesores.
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={loading}
          className="bg-accent hover:bg-accent/90 text-white gap-2 shadow-lg shadow-accent/20"
        >
          {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Configuración
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Instrucciones de Clasificación */}
        <Card className="border-accent/10 bg-card/30 backdrop-blur-md shadow-2xl">
          <CardHeader className="border-b border-accent/5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="text-lg">Prompt de Clasificación IA</CardTitle>
                <CardDescription>
                  Definí las reglas para que la IA asigne categorías a tus asesores (ej: Elite, Sólido, etc.) según su performance mensual.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-semibold text-accent uppercase tracking-wider">Lógica de Clasificación</Label>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-accent/20 hover:bg-accent/10 hover:text-accent text-muted-foreground">
                        <BookOpen className="h-3 w-3" />
                        Ver Prompt Experto
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl bg-[#0f1219] border-accent/20">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-accent">
                          <Sparkles className="h-5 w-5" />
                          Prompt Experto Recomendado
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground/80">
                          Este prompt utiliza todas las variables disponibles del embudo (conversaciones, tasaciones, reservas, etc.) para un análisis integral.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="relative mt-2">
                        <div className="absolute top-3 right-3 flex gap-2">
                          <Button 
                            size="sm" 
                            variant="secondary"
                            className="h-7 px-3 text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20"
                            onClick={() => {
                              navigator.clipboard.writeText(EXPERT_PROMPT);
                              toast.success("Prompt copiado al portapapeles");
                            }}
                          >
                            Copiar
                          </Button>
                          <DialogClose asChild>
                            <Button 
                              size="sm" 
                              className="h-7 px-3 text-xs bg-accent hover:bg-accent/90 text-white"
                              onClick={() => {
                                setConfig(prev => ({ ...prev, custom_instructions: EXPERT_PROMPT }));
                                toast.success("Prompt experto aplicado", {
                                  description: "Recuerda guardar la configuración."
                                });
                              }}
                            >
                              Aplicar Prompt
                            </Button>
                          </DialogClose>
                        </div>
                        <pre className="p-4 rounded-xl bg-background/50 border border-accent/10 text-xs text-muted-foreground whitespace-pre-wrap overflow-y-auto max-h-[350px] leading-relaxed">
                          {EXPERT_PROMPT}
                        </pre>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <Badge variant="outline" className="text-[10px] bg-accent/5 text-accent border-accent/20">
                  IA Generativa Activa
                </Badge>
              </div>

              <div className="space-y-0 border border-accent/20 rounded-xl overflow-hidden bg-[#0f1219]">
                {/* Bloque Fijo Superior: Variables */}
                <div className="bg-muted/30 border-b border-accent/20 p-4 font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 mb-2 text-accent/80 font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" /> Variables de Sistema (No Editables)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 opacity-90 mt-3">
                    <div className="flex flex-col leading-tight"><span className="text-accent font-bold">facturacion_usd</span><span className="text-[10px] opacity-70">Comisiones cobradas en el mes (USD)</span></div>
                    <div className="flex flex-col leading-tight"><span className="text-accent font-bold">transacciones</span><span className="text-[10px] opacity-70">Suma de Reservas + Cierres en el mes</span></div>
                    <div className="flex flex-col leading-tight"><span className="text-accent font-bold">captaciones</span><span className="text-[10px] opacity-70">Propiedades nuevas publicadas</span></div>
                    <div className="flex flex-col leading-tight"><span className="text-accent font-bold">cartera_activa</span><span className="text-[10px] opacity-70">Stock total de propiedades activas</span></div>
                    <div className="flex flex-col leading-tight"><span className="text-accent font-bold">tasaciones</span><span className="text-[10px] opacity-70">Total de tasaciones realizadas</span></div>
                    <div className="flex flex-col leading-tight"><span className="text-accent font-bold">consultas</span><span className="text-[10px] opacity-70">Chats de WhatsApp + Prospección activa</span></div>
                    <div className="flex flex-col leading-tight"><span className="text-accent font-bold">rotacion_pct</span><span className="text-[10px] opacity-70">% de cartera vendida (Automático)</span></div>
                  </div>
                </div>

                {/* Área Editable */}
                <Textarea 
                  className="min-h-[250px] font-mono text-sm border-0 focus-visible:ring-0 rounded-none bg-transparent resize-y"
                  placeholder="Escribe la lógica condicional aquí..."
                  value={config.custom_instructions}
                  onChange={(e) => setConfig(prev => ({ ...prev, custom_instructions: e.target.value }))}
                />

                {/* Bloque Fijo Inferior: Formato JSON */}
                <div className="bg-muted/30 border-t border-accent/20 p-4 font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 mb-2 text-accent/80 font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" /> Salida JSON Automática
                  </div>
                  <p className="opacity-80">
                    El sistema se encargará de pedirle al LLM un objeto JSON estricto con `categoria` y `motivo` basado en tus reglas.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-blue-400">
                  <Info className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Métricas de Inventario</span>
                </div>
                <p className="text-[11px] text-blue-200/60 leading-relaxed mb-2">
                  La IA lee: propiedades captadas en el mes y el total de la cartera activa.
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">captaciones</Badge>
                  <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">cartera_activa</Badge>
                </div>
              </div>
              <div className="p-4 bg-green-500/5 border border-green-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-green-400">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Cierres y Eficiencia</span>
                </div>
                <p className="text-[11px] text-green-200/60 leading-relaxed mb-2">
                  La IA lee: transacciones, reservas, facturación en USD y el porcentaje de rotación de cartera.
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">transacciones</Badge>
                  <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">facturacion</Badge>
                  <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">rotacion</Badge>
                </div>
              </div>
              <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-purple-400">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Top & Mid Funnel</span>
                </div>
                <p className="text-[11px] text-purple-200/60 leading-relaxed mb-2">
                  La IA lee: consultas totales por WhatsApp, prospección activa, tasaciones y compradores calificados.
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/20">wa_chats</Badge>
                  <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/20">prospeccion</Badge>
                  <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/20">tasaciones</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
