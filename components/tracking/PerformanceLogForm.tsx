"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { performanceLogSchema, PerformanceLogFormData, PerformanceLog, ActivityType } from "@/lib/tracking/types";
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
import { Loader2, Briefcase, TrendingUp, Sparkles, MapPin, DollarSign, Percent, User, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { createManualContact } from "@/actions/whatsapp/createManualContact";
import { ManualContactFields, ManualContactData } from "@/components/shared/ManualContactFields";
import { cn } from "@/lib/utils";
import { PROCESOS_POR_ETAPA, ladoDelNegocio, etapasPermitidas, labelDeProceso, type ProcesoNegocio } from "@/lib/tracking/proceso";
import { PIPELINE_STAGES } from "@/lib/tracking/pipeline";

interface Props {
  onSuccess: () => void;
  logToEdit?: PerformanceLog | null;
  isDirector?: boolean;
  /** Fija la etapa y oculta el selector. Lo usa el popup del tablero. */
  forcedType?: ActivityType;
  /** Fija el proceso y lo muestra bloqueado. Lo usa el popup del tablero. */
  forcedProceso?: ProcesoNegocio | null;
  /** Fija el cliente y oculta el selector. Lo usa el popup del tablero. */
  lockedClient?: {
    label: string;
    leadId: string | null;
    waContactId: string | null;
  };
  /** Precarga la propiedad del último registro del cliente (editable). */
  defaults?: { propertyId: string | null; propiedadRef: string | null };
}

export function PerformanceLogForm({
  onSuccess,
  logToEdit,
  isDirector = false,
  forcedType,
  forcedProceso,
  lockedClient,
  defaults,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState("");

  const form = useForm<PerformanceLogFormData>({
    resolver: zodResolver(performanceLogSchema) as any,
    defaultValues: logToEdit ? {
      type: logToEdit.type,
      proceso: logToEdit.proceso ?? undefined,
      propiedad_ref: logToEdit.propiedad_ref || "",
      monto_operacion: logToEdit.monto_operacion || 0,
      comision_generada: logToEdit.comision_generada || 0,
      fecha_actividad: logToEdit.fecha_actividad ? logToEdit.fecha_actividad.split("T")[0] : new Date().toISOString().split("T")[0],
      metadata: logToEdit.metadata || {},
    } : {
      type: forcedType ?? "prospeccion",
      proceso: forcedProceso ?? undefined,
      propiedad_ref: defaults?.propiedadRef ?? "",
      property_id: defaults?.propertyId ?? null,
      lead_id: lockedClient?.leadId ?? null,
      wa_contact_id: lockedClient?.waContactId ?? null,
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

  const [clientType, setClientType] = useState<"ninguno" | "tokko" | "whatsapp" | "manual">(
    lockedClient ? (lockedClient.waContactId ? "whatsapp" : "tokko") : "ninguno"
  );

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
  const proceso = watch("proceso");

  // Qué valores de proceso admite la etapa elegida: dos en prelisting,
  // captación y prebuying (las dos opciones del mismo lado del negocio),
  // cuatro en prospección, reserva y cierre (ahí no hay etapa que lo
  // restrinja, se elige a conciencia). Ya no hay un único valor "fijo" que
  // forzar: cuando la etapa admite dos, hay que preguntar cuál de las dos es.
  const opcionesProceso = PROCESOS_POR_ETAPA[activityType] ?? [];
  // El campo sólo viene bloqueado cuando el proceso lo impone la tarjeta del
  // tablero (mover una tarjeta existente, o abrirle el segundo proceso).
  const procesoBloqueado = !!forcedProceso;
  const ladoDeEstaEtapa = opcionesProceso.length === 2 ? ladoDelNegocio(opcionesProceso[0]) : null;

  useEffect(() => {
    if (forcedProceso) setValue("proceso", forcedProceso);
  }, [forcedProceso, setValue]);

  // Cuando el proceso viene impuesto (por ejemplo desde "Abrir proceso de
  // Venta"), el desplegable de etapas no puede ofrecer las del otro lado.
  const etapasElegibles = etapasPermitidas(forcedProceso ?? null);

  // En prospección el asesor recién está conociendo al cliente: muchas veces
  // sólo tiene el celular. De la segunda etapa en adelante el email vuelve a
  // ser obligatorio, porque a esa altura ya debería tenerlo.
  const emailObligatorio = activityType !== "prospeccion";

  // Sync metadata when specific fields change
  const handleMetadataChange = (key: string, value: any) => {
    const currentMetadata = watch("metadata") || {};
    setValue("metadata", { ...currentMetadata, [key]: value });
  };

  const onSubmit = async (values: PerformanceLogFormData) => {
    setIsSubmitting(true);
    try {
      // `const` y no `let`: nunca se reasigna, sólo se le escribe una propiedad
      // (`wa_contact_id`) más abajo, y eso `const` lo permite igual.
      const finalValues = { ...values };

      // Cliente obligatorio: sin cliente no se puede armar la tarjeta del
      // pipeline. Se valida sobre lo que el usuario ELIGIÓ, no sobre el
      // resultado de resolverlo (ver el caso del alta manual más abajo).
      if (clientType === "ninguno") {
        toast.error("Vinculá un cliente: elegí un lead de Tokko, un contacto de WhatsApp, o cargalo como contacto nuevo.");
        setIsSubmitting(false);
        return;
      }
      if (clientType === "tokko" && !values.lead_id) {
        toast.error("Elegí el lead de Tokko de la lista.");
        setIsSubmitting(false);
        return;
      }
      if (clientType === "whatsapp" && !values.wa_contact_id) {
        toast.error("Elegí el contacto de WhatsApp de la lista.");
        setIsSubmitting(false);
        return;
      }

      // Si seleccionó nuevo contacto manual, lo creamos primero
      if (clientType === "manual") {
        if (!manualContact.isValid) {
          toast.error(
            values.type === "prospeccion"
              ? "Completá y verificá los datos del contacto (nombre y celular deben coincidir; el email es opcional, pero si lo cargás también tiene que coincidir) y certificá que son veraces."
              : "Completá y verificá los datos del contacto (nombre, celular y email deben coincidir) y certificá que son veraces."
          );
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

        if (!result.success) {
          toast.error(result.error || "Error al crear el contacto manualmente.");
          setIsSubmitting(false);
          return;
        }

        // El número ya era de otro asesor: se avisa, pero el registro se guarda igual.
        if (result.warning) {
          toast.warning(result.warning);
        }

        // Puede venir vacío si el lead es de otro asesor y no hay contacto que
        // enlazar; el registro se guarda igual, solo sin el vínculo. En ese
        // caso no va a generar tarjeta en el tablero, y hay que avisarlo.
        finalValues.wa_contact_id = result.wa_contact_id ?? null;
        if (!result.wa_contact_id) {
          toast.warning("La actividad se guarda, pero no va a aparecer en el tablero: ese celular ya es de otro asesor.");
        }
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
      // Deliberadamente genérico: un error de Supabase/Postgres (por ejemplo
      // una violación de CHECK) trae en `DETAIL` la fila entera (uuids,
      // agencia, asesor, montos, fechas), y esos server actions relanzan ese
      // texto crudo. Mostrarlo acá lo expondría en la pantalla del asesor. Y
      // en producción ni siquiera serviría: Next.js enmascara el mensaje de
      // los Server Actions antes de que llegue al cliente, así que mostrar
      // el mensaje puntual no suma nada y sí arriesga la fuga. El detalle
      // real queda en el log del servidor, no en pantalla.
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
            {forcedType ? (
              // Viene del tablero: la etapa la decide la columna donde soltaste
              // la tarjeta, así que se muestra pero no se cambia acá.
              <div className="h-12 px-3 flex items-center rounded-md border border-accent/20 bg-accent/5 text-base font-semibold capitalize">
                {forcedType}
              </div>
            ) : (
              <Select onValueChange={(v) => {
                setValue("type", v as any);
                setValue("metadata", {}); // Reset metadata on type change
                setValue("monto_operacion", 0);
                setValue("comision_generada", 0);
                // El proceso depende de la etapa igual que estos tres campos:
                // se limpia acá SIEMPRE, sin condición, para que un valor de
                // la etapa anterior (por ejemplo "vendedor") no sobreviva al
                // cambiar a una etapa donde no es válido (Prebuying). El
                // useEffect de abajo sólo lo vuelve a rellenar cuando el
                // proceso viene impuesto por la tarjeta del tablero
                // (`forcedProceso`); ninguna de las seis etapas lo impone por
                // sí sola: las tres de lado fijo ahora ofrecen dos opciones,
                // no una, así que siempre hay que elegir.
                setValue("proceso", undefined as any);
              }} value={watch("type")}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Seleccionar actividad..." />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.filter((s) => etapasElegibles.includes(s.id)).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Proceso: de qué lado del negocio está el cliente en esta actividad. */}
          <div className="space-y-2">
            <Label htmlFor="proceso">Proceso *</Label>
            {procesoBloqueado ? (
              <div className="h-12 px-3 flex items-center gap-2 rounded-md border border-accent/20 bg-accent/5">
                <span className="text-base font-semibold">{labelDeProceso(proceso ?? null)}</span>
                <span className="text-[11px] text-muted-foreground">Lo define la tarjeta del tablero</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {opcionesProceso.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setValue("proceso", p, { shouldValidate: true })}
                    className={cn(
                      "h-12 rounded-md border text-base font-semibold transition-all active:scale-95",
                      proceso === p
                        ? "border-accent bg-accent/15 text-foreground"
                        : "border-white/10 bg-background/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {labelDeProceso(p)}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Una misma persona puede estar en más de un proceso a la vez: cada uno lleva su
              propia tarjeta en el tablero.
            </p>
            {ladoDeEstaEtapa && !procesoBloqueado && (
              <p className="text-[11px] text-muted-foreground">
                {PIPELINE_STAGES.find((s) => s.id === activityType)?.title} es siempre de quien{" "}
                {ladoDeEstaEtapa === "ofrece"
                  ? "tiene una propiedad (para vender o para alquilar)"
                  : "busca una propiedad (para comprar o para alquilar)"}
                : por eso sólo aparecen estas dos opciones.
              </p>
            )}
            {errors.proceso && (
              <p className="text-xs text-red-400">{errors.proceso.message as string}</p>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* SECCIÓN 2: Campos Dinámicos según Actividad */}
      <section className="space-y-6">
        
        {/* Prospección */}
        {activityType === "prospeccion" && (
          <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-left-2">
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
              <div className="flex items-center gap-1.5">
                <Label>Participación</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-accent transition-colors">
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[300px]">
                      <p className="text-xs leading-relaxed space-y-1">
                        <span className="block"><strong>Ambas puntas:</strong> representaste a las dos partes del negocio (dueño y comprador/inquilino) → cuenta como 1 negocio completo.</span>
                        <span className="block"><strong>Solo Vendedor / Solo Locador / Solo Comprador / Solo Locatario:</strong> trabajaste una sola punta → cuenta como medio negocio (0.5) en las métricas de cierres.</span>
                        <span className="block opacity-80">No afecta el monto ni la comisión que cargaste, solo cómo se cuenta el negocio en la tasa de cierre, rotación y conversión del dashboard.</span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select onValueChange={(v) => handleMetadataChange("participacion", v)} value={watch("metadata")?.participacion || ""}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar participación..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ambas puntas">Ambas puntas</SelectItem>
                  <SelectItem value="Solo Comprador">Solo Comprador</SelectItem>
                  <SelectItem value="Solo Vendedor">Solo Vendedor</SelectItem>
                  <SelectItem value="Solo Locador">Solo Locador</SelectItem>
                  <SelectItem value="Solo Locatario">Solo Locatario</SelectItem>
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
             <h3 className="text-xs uppercase tracking-wider">Propiedad (opcional) y Cliente</h3>
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
              <Label className="text-sm font-medium">Vincular Cliente *</Label>
            </div>
            
            {lockedClient ? (
              // Viene del tablero: la tarjeta ES el cliente, no se cambia acá.
              <div className="px-3 py-2.5 rounded-md border border-accent/20 bg-accent/5 text-sm font-semibold">
                {lockedClient.label}
              </div>
            ) : (
              <>
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
                <ManualContactFields onChange={setManualContact} emailRequired={emailObligatorio} />

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
              </>
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
