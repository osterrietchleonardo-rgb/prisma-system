"use client";

import React, { useState } from "react";
import { 
  Settings2, 
  Target, 
  Save, 
  Sparkles, 
  Info,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AgencyPerformanceConfig } from "@/lib/tracking/types";
import { savePerformanceConfig } from "@/actions/tracking/savePerformanceConfig";

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
                <Label className="text-sm font-semibold text-accent uppercase tracking-wider">Lógica de Clasificación</Label>
                <Badge variant="outline" className="text-[10px] bg-accent/5 text-accent border-accent/20">
                  IA Generativa Activa
                </Badge>
              </div>
              <Textarea 
                placeholder={`Ejemplo de Prompt:
"Clasificá como 'Elite' si el asesor supera las 5 captaciones o $10,000 en facturación.
Clasificá como 'Sólido' si tiene entre 2 y 4 captaciones.
Si tiene 0 captaciones, marcalo como 'Requiere Atención'."`}
                value={config.custom_instructions}
                onChange={(e) => setConfig(prev => ({ ...prev, custom_instructions: e.target.value }))}
                className="min-h-[250px] bg-background/30 border-accent/10 focus:border-accent/30 transition-all text-sm leading-relaxed p-4 rounded-xl resize-none shadow-inner"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-blue-400">
                  <Info className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Variable: Captaciones</span>
                </div>
                <p className="text-[11px] text-blue-200/60 leading-relaxed">
                  La IA recibirá el total de propiedades captadas por el asesor en el período seleccionado.
                </p>
              </div>
              <div className="p-4 bg-green-500/5 border border-green-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-green-400">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Variable: Cierres</span>
                </div>
                <p className="text-[11px] text-green-200/60 leading-relaxed">
                  Total de transacciones efectivas (ventas/alquileres) registradas.
                </p>
              </div>
              <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-purple-400">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Variable: Facturación</span>
                </div>
                <p className="text-[11px] text-purple-200/60 leading-relaxed">
                  Suma total de comisiones generadas por el asesor en USD.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
