"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { performanceLogSchema, PerformanceLogFormData, PerformanceLog } from "@/lib/tracking/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SearchableSelect, Option } from "@/components/ui/searchable-select";
import { savePerformanceLog } from "@/actions/tracking/savePerformanceLog";
import { updatePerformanceLog } from "@/actions/tracking/updatePerformanceLog";
import { getTrackingOptions } from "@/actions/tracking/getTrackingOptions";
import { toast } from "sonner";
import { Loader2, Briefcase, TrendingUp, Sparkles, MapPin, DollarSign, Percent, User } from "lucide-react";

import { createManualContact } from "@/actions/whatsapp/createManualContact";
import { ManualContactFields, ManualContactData } from "@/components/shared/ManualContactFields";

interface Props {
  onSuccess: () => void;
  logToEdit?: PerformanceLog | null;
  isDirector?: boolean;
}

export function PerformanceLogForm({ onSuccess, logToEdit, isDirector = false }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState("");

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
      property_id: null,
      lead_id: null,
      wa_contact_id: null,
      monto_operacion: 0,
      comision_generada: 0,
      fecha_actividad: new Date().toISOString().split("T")[0],
      metadata: {},
    },
  });

  const [trackingOptions, setTrackingOptions] = useState<{
    properties: any[];
    leads: any[];
    waContacts: any[];
    agents?: any[];
  }>({ properties: [], leads: [], waContacts: [], agents: [] });

  const [clientType, setClientType] = useState<"ninguno" | "tokko" | "whatsapp" | "manual">("ninguno");

  // Manual contact form state (con doble verificación + certificación)
  const [manualContact, setManualContact] = useState<ManualContactData>({
    name: "",
    phone: "",
    email: "",
    tags: "",
    isValid: false,
  });
  const [manualAgentId, setManualAgentId] = useState("");

  useEffect(() => {
    getTrackingOptions().then(data => {
      setTrackingOptions(data);
    }).catch(err => console.error("Error fetching tracking options", err));
  }, []);

  // Set initial client type if editing
  useEffect(() => {
    if (logToEdit) {
      if (logToEdit.lead_id) setClientType("tokko");
      else if (logToEdit.wa_contact_id) setClientType("whatsapp");
    }
  }, [logToEdit]);

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
      let finalValues = { ...values };

      // Si seleccionó nuevo contacto manual, lo creamos primero
      if (clientType === "manual") {
        if (!manualContact.isValid) {
          toast.error("Completá y verificá los datos del contacto (nombre, celular y email deben coincidir) y certificá que son veraces.");
          setIsSubmitting(false);
          return;
        }

        const result = await createManualContact({
          name: manualContact.name,
          phone: manualContact.phone,
          email: manualContact.email,
          tags: manualContact.tags,
          agent_id: isDirector && manualAgentId ? manualAgentId : undefined
        });

        if (!result.success || !result.wa_contact_id) {
          toast.error(result.error || "Error al crear el contacto manualmente.");
          setIsSubmitting(false);
          return;
        }
        
        finalValues.wa_contact_id = result.wa_contact_id;
      }

      if (logToEdit) {
        if (!reason || reason.trim() === '') {
          toast.error("Debes ingresar un motivo para guardar la modificación.");
          setIsSubmitting(false);
          return;
        }
        await updatePerformanceLog(logToEdit.id, finalValues, reason);
        toast.success("Registro actualizado correctamente");
      } else {
        await savePerformanceLog(finalValues);
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
                  <SelectItem value="Acciones indirectas">Acciones indirectas</SelectItem>
                  <SelectItem value="Alianzas Estratégicas (Escribanías / Contadores / Abogados)">Alianzas Estratégicas (Escribanías / Contadores / Abogados)</SelectItem>
                  <SelectItem value="Argenprop">Argenprop</SelectItem>
                  <SelectItem value="Arquitectos / Agrimensores">Arquitectos / Agrimensores</SelectItem>
                  <SelectItem value="Buzoneo / Folletos (Farming Geográfico)">Buzoneo / Folletos (Farming Geográfico)</SelectItem>
                  <SelectItem value="Chatbot / Asistente Virtual">Chatbot / Asistente Virtual</SelectItem>
                  <SelectItem value="Cliente Antiguo">Cliente Antiguo</SelectItem>
                  <SelectItem value="Constructor">Constructor</SelectItem>
                  <SelectItem value="Dueño Vende">Dueño Vende</SelectItem>
                  <SelectItem value="Email Marketing / Newsletter">Email Marketing / Newsletter</SelectItem>
                  <SelectItem value="Eventos / Exposiciones">Eventos / Exposiciones</SelectItem>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="Familiar / Amigo">Familiar / Amigo</SelectItem>
                  <SelectItem value="Google Ads (Buscador pago)">Google Ads (Buscador pago)</SelectItem>
                  <SelectItem value="Google Mi Negocio (Google Maps)">Google Mi Negocio (Google Maps)</SelectItem>
                  <SelectItem value="Guardia en Emprendimientos / Showroom">Guardia en Emprendimientos / Showroom</SelectItem>
                  <SelectItem value="Guardias Captación">Guardias Captación</SelectItem>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="Landing Page / Embudos de conversión">Landing Page / Embudos de conversión</SelectItem>
                  <SelectItem value="Letrero / cartel">Letrero / cartel</SelectItem>
                  <SelectItem value="Llamadas en frío (Cold Calling / Prospección)">Llamadas en frío (Cold Calling / Prospección)</SelectItem>
                  <SelectItem value="MercadoLibre">MercadoLibre</SelectItem>
                  <SelectItem value="Nuevo Contacto">Nuevo Contacto</SelectItem>
                  <SelectItem value="Oficina (Mail / Llamado / Puerta)">Oficina (Mail / Llamado / Puerta)</SelectItem>
                  <SelectItem value="Otra inmobiliaria">Otra inmobiliaria</SelectItem>
                  <SelectItem value="Otro agente">Otro agente</SelectItem>
                  <SelectItem value="Otro Portal">Otro Portal</SelectItem>
                  <SelectItem value="Properati / Mudafy">Properati / Mudafy</SelectItem>
                  <SelectItem value="Referido de colega">Referido de colega</SelectItem>
                  <SelectItem value="Referido de Contacto">Referido de Contacto</SelectItem>
                  <SelectItem value="Reubicación">Reubicación</SelectItem>
                  <SelectItem value="Sitio Web">Sitio Web</SelectItem>
                  <SelectItem value="TikTok / YouTube">TikTok / YouTube</SelectItem>
                  <SelectItem value="WhatsApp Business">WhatsApp Business</SelectItem>
                  <SelectItem value="Zonaprop">Zonaprop</SelectItem>
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

        {/* Campos de Vinculación */}
        <Separator />
        <div className="space-y-4">
          <header className="flex items-center gap-2 text-accent/70 font-semibold">
             <MapPin className="w-4 h-4" />
             <h3 className="text-xs uppercase tracking-wider">Activos Vinculados (Opcional)</h3>
          </header>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Propiedad (Desde Tokko)</Label>
              <SearchableSelect 
                options={trackingOptions.properties.map(p => ({
                  label: p.title || p.address || 'Sin título',
                  value: p.id,
                  description: p.tokko_id ? `ID: ${p.tokko_id}` : undefined
                }))}
                value={watch("property_id") || undefined}
                onChange={(val) => {
                  setValue("property_id", val);
                  // Opcional: autocompletar propiedad_ref si está vacío
                  const prop = trackingOptions.properties.find(p => p.id === val);
                  if (prop && !watch("propiedad_ref")) {
                    setValue("propiedad_ref", prop.title || prop.address || prop.tokko_id);
                  }
                }}
                placeholder="Buscar propiedad..."
                emptyMessage="No se encontraron propiedades."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="propiedad_ref">Referencia en Texto (Alternativo)</Label>
              <div className="relative">
                <Input id="propiedad_ref" placeholder="Ej: Av. Santa Fe 1234" {...register("propiedad_ref")} className="pl-10" />
                <MapPin className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="zona_barrio">Zona/Barrio</Label>
              <div className="relative">
                <Input 
                  id="zona_barrio" 
                  placeholder="Ej: Palermo Soho" 
                  value={watch("metadata")?.zona_barrio ?? ""}
                  onChange={(e) => handleMetadataChange("zona_barrio", e.target.value)}
                  className="pl-10" 
                />
                <MapPin className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prop_colab">Propiedad (Colaboración)</Label>
              <div className="relative">
                <Input 
                  id="prop_colab" 
                  placeholder="Ej: PH Colegiales RE/MAX" 
                  value={watch("metadata")?.propiedad_colaboracion ?? ""}
                  onChange={(e) => handleMetadataChange("propiedad_colaboracion", e.target.value)}
                  className="pl-10" 
                />
                <MapPin className="w-4 h-4 absolute left-3 top-3.5 opacity-40" />
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4 border border-white/5 rounded-2xl bg-white/5">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-accent" />
              <Label className="text-sm font-medium">Vincular Cliente</Label>
            </div>
            
            <Select value={clientType} onValueChange={(v: any) => {
              setClientType(v);
              if (v !== "tokko") setValue("lead_id", null);
              if (v !== "whatsapp") setValue("wa_contact_id", null);
            }}>
              <SelectTrigger className="w-full md:w-[200px] h-10">
                <SelectValue placeholder="Tipo de cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Ninguno</SelectItem>
                <SelectItem value="tokko">Lead (Tokko / Web)</SelectItem>
                <SelectItem value="whatsapp">Contacto WhatsApp</SelectItem>
                <SelectItem value="manual">Nuevo Contacto (Manual)</SelectItem>
              </SelectContent>
            </Select>

            {clientType === "tokko" && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <SearchableSelect 
                  options={trackingOptions.leads.map(l => ({
                    label: l.full_name || 'Sin nombre',
                    value: l.id
                  }))}
                  value={watch("lead_id") || undefined}
                  onChange={(val) => setValue("lead_id", val)}
                  placeholder="Buscar Lead de Tokko..."
                  emptyMessage="No se encontraron leads."
                />
              </div>
            )}

            {clientType === "whatsapp" && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <SearchableSelect 
                  options={trackingOptions.waContacts.map(w => ({
                    label: w.name || w.phone,
                    value: w.id,
                    description: w.phone
                  }))}
                  value={watch("wa_contact_id") || undefined}
                  onChange={(val) => setValue("wa_contact_id", val)}
                  placeholder="Buscar Contacto de WA..."
                  emptyMessage="No se encontraron contactos."
                />
              </div>
            )}

            {clientType === "manual" && (
              <div className="animate-in fade-in slide-in-from-top-2 space-y-4 pt-2">
                <ManualContactFields onChange={setManualContact} />

                {isDirector && (
                  <div className="space-y-2">
                    <Label>Asesor Asignado</Label>
                    <Select value={manualAgentId} onValueChange={setManualAgentId}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Asignar a un asesor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {trackingOptions.agents?.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 mt-4">
            <Label htmlFor="fecha_actividad">Fecha de Actividad</Label>
            <Input id="fecha_actividad" type="date" {...register("fecha_actividad")} className="h-11 w-full md:w-1/2" />
          </div>
        </div>
        
        {logToEdit && (
          <>
            <Separator />
            <div className="space-y-4">
              <header className="flex items-center gap-2 text-accent/70 font-semibold">
                <Briefcase className="w-4 h-4" />
                <h3 className="text-xs uppercase tracking-wider">Auditoría</h3>
              </header>
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-destructive font-semibold">Motivo de la modificación *</Label>
                <Textarea 
                  id="reason" 
                  value={reason} 
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explica brevemente por qué estás modificando este registro..." 
                  className="min-h-[80px]"
                  required
                />
              </div>
            </div>
          </>
        )}

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
