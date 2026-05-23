"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { performanceLogSchema, PerformanceLogFormData, PerformanceLog } from "@/lib/tracking/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { savePerformanceLog } from "@/actions/tracking/savePerformanceLog";
import { updatePerformanceLog } from "@/actions/tracking/updatePerformanceLog";
import { toast } from "sonner";
import { Loader2, Briefcase, TrendingUp, Sparkles, MapPin, DollarSign, Percent } from "lucide-react";

interface Props {
  onSuccess: () => void;
  logToEdit?: PerformanceLog | null;
}

export function PerformanceLogForm({ onSuccess, logToEdit }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PerformanceLogFormData>({
    resolver: zodResolver(performanceLogSchema) as any,
    defaultValues: logToEdit ? {
      type: logToEdit.type,
      propiedad_ref: logToEdit.propiedad_ref || "",
      monto_operacion: logToEdit.monto_operacion || 0,
      comision_generada: logToEdit.comision_generada || 0,
      fecha_actividad: logToEdit.fecha_actividad ? logToEdit.fecha_actividad.split("T")[0] : new Date().toISOString().split("T")[0],
      metadata: logToEdit.metadata || {},
    } : {
      type: "prospeccion",
      propiedad_ref: "",
      monto_operacion: 0,
      comision_generada: 0,
      fecha_actividad: new Date().toISOString().split("T")[0],
      metadata: {},
    },
  });

  const { watch, setValue, register, formState: { errors } } = form;
  const activityType = watch("type");

  // Sync metadata when specific fields change
  const handleMetadataChange = (key: string, value: any) => {
    const currentMetadata = watch("metadata") || {};
    setValue("metadata", { ...currentMetadata, [key]: value });
  };

  const onSubmit = async (values: PerformanceLogFormData) => {
    setIsSubmitting(true);
    try {
      if (logToEdit) {
        await updatePerformanceLog(logToEdit.id, values);
        toast.success("Registro actualizado correctamente");
      } else {
        await savePerformanceLog(values);
        toast.success("Registro guardado correctamente");
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Ocurrió un error al guardar el registro");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-8 pb-32">
      
      {/* SECCIÓN 1: Actividad a registrar */}
      <section className="space-y-4">
        <header className="flex items-center gap-2 text-accent font-semibold">
           <Briefcase className="w-4 h-4" />
           <h3 className="text-sm uppercase tracking-wider">Actividad a registrar</h3>
        </header>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Actividad *</Label>
            <Select onValueChange={(v) => {
              setValue("type", v as any);
              setValue("metadata", {}); // Reset metadata on type change
              setValue("monto_operacion", 0);
              setValue("comision_generada", 0);
            }} value={watch("type")}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Seleccionar actividad..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prospeccion">Prospección</SelectItem>
                <SelectItem value="prelisting">Prelisting</SelectItem>
                <SelectItem value="prebuying">Prebuying</SelectItem>
                <SelectItem value="captacion">Captación</SelectItem>
                <SelectItem value="reserva">Reserva</SelectItem>
                <SelectItem value="cierre">Cierre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* SECCIÓN 2: Campos Dinámicos según Actividad */}
      <section className="space-y-6">
        
        {/* Prospección */}
        {activityType === "prospeccion" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2">
            <div className="space-y-2">
              <Label>Origen</Label>
              <Select onValueChange={(v) => handleMetadataChange("origen", v)} value={watch("metadata")?.origen || ""}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar origen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dueño Directo">Dueño Directo</SelectItem>
                  <SelectItem value="Portal">Portal</SelectItem>
                  <SelectItem value="Referido">Referido</SelectItem>
                  <SelectItem value="Cartel">Cartel</SelectItem>
                  <SelectItem value="Redes">Redes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Lead</Label>
              <Select onValueChange={(v) => handleMetadataChange("tipo_lead", v)} value={watch("metadata")?.tipo_lead || ""}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Vendedor">Vendedor</SelectItem>
                  <SelectItem value="Comprador">Comprador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Prelisting */}
        {activityType === "prelisting" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-2">
            <div className="space-y-2">
              <Label>Valor Tasado / Estimado (USD)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-11"
                  {...register("monto_operacion", { valueAsNumber: true })}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
          </div>
        )}

        {/* Prebuying */}
        {activityType === "prebuying" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-2">
            <div className="space-y-2">
              <Label>Presupuesto del Comprador (USD)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-11"
                  {...register("monto_operacion", { valueAsNumber: true })}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
          </div>
        )}

        {/* Captación */}
        {activityType === "captacion" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2">
            <div className="space-y-2 col-span-1 md:col-span-2">
              <Label>Condición de Captación</Label>
              <Select onValueChange={(v) => handleMetadataChange("condicion_captacion", v)} value={watch("metadata")?.condicion_captacion || ""}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar condición..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Exclusiva">Exclusiva</SelectItem>
                  <SelectItem value="No Exclusiva">No Exclusiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor de Publicación Inicial (USD)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-11"
                  {...register("monto_operacion", { valueAsNumber: true })}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Honorarios Acordados (%)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="3" 
                  className="pl-10 h-11"
                  {...register("comision_generada", { valueAsNumber: true })}
                />
                <Percent className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
          </div>
        )}

        {/* Reserva */}
        {activityType === "reserva" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2">
            <div className="space-y-2">
              <Label>Valor de Publicación Actual (USD)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-11"
                  value={watch("metadata")?.valor_publicacion_actual ?? ""}
                  onChange={(e) => handleMetadataChange("valor_publicacion_actual", parseFloat(e.target.value) || 0)}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor Ofertado por el Cliente (USD)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-11"
                  {...register("monto_operacion", { valueAsNumber: true })}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
            <div className="space-y-2 col-span-1 md:col-span-2">
              <Label>Monto Depositado en Reserva (USD)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-11"
                  value={watch("metadata")?.monto_reserva ?? ""}
                  onChange={(e) => handleMetadataChange("monto_reserva", parseFloat(e.target.value) || 0)}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
          </div>
        )}

        {/* Cierre */}
        {activityType === "cierre" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2">
            <div className="space-y-2">
              <Label>Valor Final de Cierre (USD)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-11"
                  {...register("monto_operacion", { valueAsNumber: true })}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Honorarios Totales Cobrados (%)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  placeholder="3" 
                  className="pl-10 h-11"
                  {...register("comision_generada", { valueAsNumber: true })}
                />
                <Percent className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
            <div className="space-y-2 col-span-1 md:col-span-2">
              <Label>Participación</Label>
              <Select onValueChange={(v) => handleMetadataChange("participacion", v)} value={watch("metadata")?.participacion || ""}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar participación..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ambas puntas">Ambas puntas</SelectItem>
                  <SelectItem value="Solo Comprador">Solo Comprador</SelectItem>
                  <SelectItem value="Solo Vendedor">Solo Vendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Campos comunes (opcionales) */}
        <Separator />
        <div className="space-y-4">
          <header className="flex items-center gap-2 text-accent/70 font-semibold">
             <MapPin className="w-4 h-4" />
             <h3 className="text-xs uppercase tracking-wider">Referencia (Opcional)</h3>
          </header>
          <div className="space-y-2">
            <Label htmlFor="propiedad_ref">Referencia de Propiedad (Dirección o ID)</Label>
            <div className="relative">
              <Input id="propiedad_ref" placeholder="Ej: Av. Santa Fe 1234" {...register("propiedad_ref")} className="pl-10" />
              <MapPin className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fecha_actividad">Fecha de Actividad</Label>
            <Input id="fecha_actividad" type="date" {...register("fecha_actividad")} className="h-11" />
          </div>
        </div>

      </section>

      {/* Botón de Acción */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t z-10 lg:relative lg:p-0 lg:bg-transparent lg:border-0 lg:z-auto">
        <Button 
          type="submit" 
          variant="accent"
          className="w-full h-12 text-base font-bold shadow-lg shadow-accent/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Guardar
            </>
          )}
        </Button>
      </div>

    </form>
  );
}
