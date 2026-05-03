"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { performanceLogSchema, PerformanceLogFormData } from "@/lib/tracking/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { WAUploader } from "./WAUploader";
import { WAMetricsPreview } from "./WAMetricsPreview";
import { savePerformanceLog } from "@/actions/tracking/savePerformanceLog";
import { toast } from "sonner";
import { Loader2, CalendarIcon, Briefcase, TrendingUp, Sparkles, MessageCircle, User, MapPin, DollarSign } from "lucide-react";

interface Props {
  onSuccess: () => void;
}

export function PerformanceLogForm({ onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PerformanceLogFormData>({
    resolver: zodResolver(performanceLogSchema) as any,
    defaultValues: {
      type: "lead_seguimiento",
      nombre_cliente: "",
      propiedad_ref: "",
      monto_operacion: 0,
      comision_generada: 0,
      fecha_actividad: new Date().toISOString().split("T")[0],
      fecha_cierre: null,
    },
  });

  const { watch, setValue } = form;
  const activityType = watch("type");

  const onSubmit = async (values: PerformanceLogFormData) => {
    setIsSubmitting(true);
    try {
      await savePerformanceLog(values);
      toast.success("Registro guardado correctamente");
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
      
      {/* SECCIÓN 1: Tipo de Actividad */}
      <section className="space-y-4">
        <header className="flex items-center gap-2 text-accent font-semibold">
           <Briefcase className="w-4 h-4" />
           <h3 className="text-sm uppercase tracking-wider">Tipo de Registro</h3>
        </header>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="type">Actividad Realizada</Label>
            <Select onValueChange={(v) => setValue("type", v as any)} defaultValue={watch("type")}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Seleccionar actividad..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="captacion">🏠 Nueva Captación (Listing)</SelectItem>
                <SelectItem value="transaccion">🤝 Cierre / Transacción</SelectItem>
                <SelectItem value="lead_seguimiento">📞 Seguimiento de Lead</SelectItem>
                <SelectItem value="otro">✨ Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* SECCIÓN 2: Detalles de la Actividad */}
      <section className="space-y-4">
        <header className="flex items-center gap-2 text-accent font-semibold">
           <User className="w-4 h-4" />
           <h3 className="text-sm uppercase tracking-wider">Detalles del Cliente y Propiedad</h3>
        </header>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label htmlFor="nombre_cliente">Nombre del Cliente *</Label>
            <Input id="nombre_cliente" placeholder="Ej: Juan Pérez" {...form.register("nombre_cliente")} className="bg-background/50 h-11" />
            {form.formState.errors.nombre_cliente && <p className="text-[10px] text-red-500">{form.formState.errors.nombre_cliente.message}</p>}
          </div>

          <div className="space-y-2 col-span-2">
            <Label htmlFor="propiedad_ref">Referencia de Propiedad (Dirección o ID)</Label>
            <div className="relative">
              <Input id="propiedad_ref" placeholder="Ej: Av. Santa Fe 1234" {...form.register("propiedad_ref")} className="pl-10" />
              <MapPin className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_actividad">Fecha de Actividad</Label>
            <div className="relative">
              <Input id="fecha_actividad" type="date" {...form.register("fecha_actividad")} />
              <CalendarIcon className="w-4 h-4 absolute right-3 top-2.5 opacity-40 pointer-events-none" />
            </div>
          </div>

          {(activityType === 'transaccion' || activityType === 'captacion') && (
            <div className="space-y-2">
              <Label htmlFor="fecha_cierre">Fecha de Cierre Estimada</Label>
              <div className="relative">
                <Input id="fecha_cierre" type="date" {...form.register("fecha_cierre")} />
                <CalendarIcon className="w-4 h-4 absolute right-3 top-2.5 opacity-40 pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SECCIÓN 3: Métricas Económicas */}
      {(activityType === 'transaccion' || activityType === 'captacion') && (
        <>
          <Separator />
          <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <header className="flex items-center gap-2 text-green-500 font-semibold">
               <DollarSign className="w-4 h-4" />
               <h3 className="text-sm uppercase tracking-wider">Métricas Económicas</h3>
            </header>

            <div className="grid grid-cols-2 gap-4 bg-green-500/5 p-4 rounded-xl border border-green-500/20">
               <div className="space-y-2">
                  <Label>Monto Operación ($)</Label>
                  <Input type="number" placeholder="Ej: 150000" {...form.register("monto_operacion", { valueAsNumber: true })} />
               </div>

               <div className="space-y-2">
                  <Label>Comisión Estimada ($)</Label>
                  <Input type="number" placeholder="Tu parte" {...form.register("comision_generada", { valueAsNumber: true })} />
               </div>
            </div>
          </section>
        </>
      )}

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
              Guardando Actividad...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Registrar Actividad
            </>
          )}
        </Button>
      </div>

    </form>

  );
}
