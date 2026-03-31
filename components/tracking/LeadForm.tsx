"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadFormSchema, LeadFormData } from "@/lib/tracking/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { WAUploader } from "./WAUploader";
import { WAMetricsPreview } from "./WAMetricsPreview";
import { saveLead } from "@/actions/tracking/saveLead";
import { toast } from "sonner";
import { Loader2, Plus, CalendarIcon, Briefcase, TrendingUp, Sparkles, MessageCircle } from "lucide-react";

interface Props {
  onSuccess: () => void;
}

export function LeadForm({ onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waQuant, setWaQuant] = useState<any>(null);
  const [waQual, setWaQual] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      nombre_lead: "",
      telefono: "",
      canal_origen: "whatsapp",
      fecha_primer_contacto: new Date().toISOString().split("T")[0],
      estado: "activo",
      visita_realizada: false,
      propuesta_enviada: false,
    } as any,
  });

  const { watch, setValue } = form;
  const estadoValue = watch("estado");
  const visitaRealizada = watch("visita_realizada");
  const fechaPrimerContacto = watch("fecha_primer_contacto");

  const onSubmit = async (values: LeadFormData) => {
    setIsSubmitting(true);
    try {
      let diasCierre = null;
      if (values.estado === "cerrado") {
        const start = new Date(values.fecha_primer_contacto);
        const end = new Date();
        diasCierre = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
      }

      const payload = {
        ...values,
        dias_hasta_cierre: diasCierre,
        waMetrics: waQuant,
        waAnalysis: waQual,
        wa_analisis_pendiente: isAnalyzing || (waQuant && !waQual),
      };

      await saveLead(payload);
      toast.success("Lead guardado correctamente");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Ocurrió un error al guardar el lead");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWADataCalculated = (quant: any, qual: any) => {
    setWaQuant(quant);
    if (qual) {
      setWaQual(qual);
      // Actualizar campos del form si la IA detectó que ofreció visita o propiedades
       if (qual.ofrecio_visita) setValue("visita_realizada", true);
       if (qual.ofrecio_propiedades) setValue("propuesta_enviada", true);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-32">
      
      {/* SECCIÓN 1: Datos del lead */}
      <section className="space-y-4">
        <header className="flex items-center gap-2 text-primary font-semibold">
           <Plus className="w-4 h-4" />
           <h3 className="text-sm uppercase tracking-wider">Datos del Lead</h3>
        </header>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label htmlFor="nombre_lead">Nombre Completo *</Label>
            <Input id="nombre_lead" placeholder="Ej: Maria Lopez" {...form.register("nombre_lead")} className="bg-background/50" />
            {form.formState.errors.nombre_lead && <p className="text-[10px] text-red-500">{form.formState.errors.nombre_lead.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" placeholder="+54 9 11..." {...form.register("telefono")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="canal_origen">Canal de Origen</Label>
            <Select onValueChange={(v) => setValue("canal_origen", v as any)} defaultValue={watch("canal_origen") || undefined}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="portal">Portal Inmobiliario</SelectItem>
                <SelectItem value="referido">Referido / Boca en boca</SelectItem>
                <SelectItem value="redes">Redes Sociales</SelectItem>
                <SelectItem value="llamada">Llamada Directa</SelectItem>
                <SelectItem value="presencial">Atención Presencial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha Primer Contacto</Label>
            <div className="relative">
              <Input id="fecha" type="date" {...form.register("fecha_primer_contacto")} />
              <CalendarIcon className="w-4 h-4 absolute right-3 top-2.5 opacity-40 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estado">Estado Actual</Label>
            <Select onValueChange={(v) => setValue("estado", v as any)} defaultValue={watch("estado")}>
              <SelectTrigger>
                <SelectValue placeholder="Estado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="visita_agendada">Visita Agendada</SelectItem>
                <SelectItem value="en_negociacion">En Negociación</SelectItem>
                <SelectItem value="cerrado">Ganado / Cerrado</SelectItem>
                <SelectItem value="perdido">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 col-span-2">
            <Label htmlFor="notas">Notas Internas</Label>
            <Textarea id="notas" placeholder="Comentarios adicionales sobre el lead..." {...form.register("notas")} className="min-h-[80px]" />
          </div>
        </div>
      </section>

      <Separator />

      {/* SECCIÓN 2: Actividad registrada */}
      <section className="space-y-4">
        <header className="flex items-center gap-2 text-primary font-semibold">
           <Briefcase className="w-4 h-4" />
           <h3 className="text-sm uppercase tracking-wider">Actividad Registrada</h3>
        </header>

        <div className="bg-muted/30 rounded-xl p-4 border space-y-4">
          <div className="flex items-center justify-between">
             <div className="space-y-0.5">
                <Label>Visita Realizada</Label>
                <p className="text-[10px] text-muted-foreground">¿Ya conoció alguna propiedad?</p>
             </div>
             <Switch checked={visitaRealizada} onCheckedChange={(c) => setValue("visita_realizada", c)} />
          </div>

          {visitaRealizada && (
            <div className="space-y-2 animate-in fade-in slide-in-from-left-2">
              <Label>Fecha de la Visita</Label>
              <Input type="date" {...form.register("fecha_visita")} />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
             <div className="space-y-0.5">
                <Label>Propuesta / Tasación Enviada</Label>
                <p className="text-[10px] text-muted-foreground">Documentación formal enviada al lead</p>
             </div>
             <Switch checked={watch("propuesta_enviada")} onCheckedChange={(c) => setValue("propuesta_enviada", c)} />
          </div>

          <div className="space-y-2 pt-2">
            <Label>Propiedad Interés / Ofrecida</Label>
            <Input placeholder="Ej: PH Humboldt 1200" {...form.register("propiedad_ofrecida")} />
          </div>
        </div>
      </section>

      <Separator />

      {/* SECCIÓN 3: Resultado (Cerrado) */}
      {estadoValue === "cerrado" && (
        <>
          <section className="space-y-4 animate-in slide-in-from-bottom-4">
            <header className="flex items-center gap-2 text-green-500 font-semibold">
               <TrendingUp className="w-4 h-4" />
               <h3 className="text-sm uppercase tracking-wider">Resultado del Cierre</h3>
            </header>

            <div className="grid grid-cols-2 gap-4 bg-green-500/5 p-4 rounded-xl border border-green-500/20">
               <div className="space-y-2 col-span-2">
                  <Label>Tipo de Operación</Label>
                  <Select onValueChange={(v) => setValue("tipo_operacion", v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Venta, alquiler..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="venta">Comisión por Venta</SelectItem>
                      <SelectItem value="alquiler">Contrato Alquiler</SelectItem>
                      <SelectItem value="temporal">Temporal / Amoblado</SelectItem>
                    </SelectContent>
                  </Select>
               </div>

               <div className="space-y-2">
                  <Label>Precio Operación ($)</Label>
                  <Input type="number" placeholder="Ej: 150000" {...form.register("precio_operacion", { valueAsNumber: true })} />
               </div>

               <div className="space-y-2">
                  <Label>Comisión Neta ($)</Label>
                  <Input type="number" placeholder="Tu parte neta" {...form.register("comision_generada", { valueAsNumber: true })} />
               </div>
            </div>
          </section>
          <Separator />
        </>
      )}

      {/* SECCIÓN 4: Análisis de WhatsApp */}
      <section className="space-y-4">
        <header className="flex items-center gap-2 text-primary font-semibold">
           <MessageCircle className="w-4 h-4" />
           <h3 className="text-sm uppercase tracking-wider">Análisis WhatsApp</h3>
        </header>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Subí el historial de chat para obtener métricas de tiempo de respuesta, 
          ratio de conversación y <span className="font-semibold text-primary">Score de Profesionalismo</span> vía IA.
        </p>

        <WAUploader onDataCalculated={handleWADataCalculated} onAnalysisStatusChange={setIsAnalyzing} />
        <WAMetricsPreview quant={waQuant} qual={waQual} isAnalyzing={isAnalyzing} />
      </section>

      {/* Botón Flotante / De Acción */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t z-10 lg:relative lg:p-0 lg:bg-transparent lg:border-0 lg:z-auto">
        <Button 
          type="submit" 
          className="w-full h-12 text-base font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Guardando Lead...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Guardar y Finalizar
            </>
          )}
        </Button>
      </div>

    </form>
  );
}
