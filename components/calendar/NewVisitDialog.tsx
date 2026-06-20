"use client"

import React, { useState, useEffect } from "react"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { 
  CalendarIcon,
  Clock,
  User,
  MapPin,
  Tag,
  Briefcase,
  Search
} from "lucide-react"
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { getTrackingOptions } from "@/actions/tracking/getTrackingOptions"
import { createManualContact } from "@/actions/whatsapp/createManualContact"
import { ManualContactFields, ManualContactData } from "@/components/shared/ManualContactFields"

interface NewVisitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencyId: string
  userId: string
  isAdmin?: boolean
  agents?: any[]
}

export function NewVisitDialog({ 
  open, 
  onOpenChange, 
  onSuccess, 
  agencyId, 
  userId, 
  isAdmin, 
  agents 
}: NewVisitDialogProps) {
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<any[]>([])
  const [allAgencyProfiles, setAllAgencyProfiles] = useState<any[]>([])
  const [propertySearch, setPropertySearch] = useState("")

  const [formData, setFormData] = useState({
    nombre_completo: "",
    telefono: "",
    email: "",
    fecha_visita: "",
    hora_visita: "",
    propiedad_titulo: "",
    zona_propiedad: "",
    propiedad_colaboracion: "",
    tipo_operacion: "compra",
    presupuesto: "",
    calificacion_lead: "WARM",
    score_bant: 0,
    intereses_clave: "",
    objeciones_detectadas: "",
    decisores: "",
    origen_consulta: "Manual",
    resumen_conversacion: "",
    agent_id: isAdmin ? "" : userId
  })

  const [trackingOptions, setTrackingOptions] = useState<{
    leads: any[];
    waContacts: any[];
  }>({ leads: [], waContacts: [] });
  const [clientType, setClientType] = useState<"ninguno" | "manual" | "tokko" | "whatsapp">("ninguno");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  // Contacto manual con doble verificación + certificación
  const [manualContact, setManualContact] = useState<ManualContactData>({
    name: "",
    phone: "",
    email: "",
    tags: "",
    isValid: false,
  });

  const supabase = createClient()

  // Fetch properties and initial profiles on mount/open
  useEffect(() => {
    if (open && agencyId) {
      async function fetchData() {
        // Fetch properties
        const { data: propsData } = await supabase
          .from("properties")
          .select("id, title, address, assigned_agent, city")
          .eq("agency_id", agencyId)
          .eq("is_active", true)
          .order("title")
        
        if (propsData) setProperties(propsData)

        // Fetch all profiles for the agency to match assigned_agent by email
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("agency_id", agencyId)
        
        if (profiles) setAllAgencyProfiles(profiles)

        // Fetch tracking options for leads and WA contacts
        const options = await getTrackingOptions()
        setTrackingOptions(options)
      }
      fetchData()
    }
  }, [open, agencyId, supabase])

  const handlePropertyChange = (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId)
    if (property) {
      let updatedData = {
        ...formData,
        propiedad_titulo: property.title,
        zona_propiedad: property.city || property.address || ""
      }

      // Try to auto-assign agent if email matches
      if (property.assigned_agent?.email) {
        const matchedProfile = allAgencyProfiles.find(
          p => p.email?.toLowerCase() === property.assigned_agent.email.toLowerCase()
        )
        if (matchedProfile) {
          updatedData.agent_id = matchedProfile.id
          toast.info(`Asesor asignado automáticamente: ${matchedProfile.full_name} (${property.assigned_agent.name} en Tokko)`)
        } else {
          toast.warning(`No se encontró un perfil en PRISMA para el asesor de Tokko: ${property.assigned_agent.name} (${property.assigned_agent.email})`)
        }
      }

      setFormData(updatedData)
    }
  }

  const activeAgentId = isAdmin ? formData.agent_id : userId;
  const activeProfile = allAgencyProfiles.find(p => p.id === activeAgentId);

  const filteredProperties = properties.filter(p => {
    const searchMatch = p.title.toLowerCase().includes(propertySearch.toLowerCase()) ||
                        p.address?.toLowerCase().includes(propertySearch.toLowerCase());
                        
    // Filter by selected agent's email. If admin hasn't selected an agent, show all.
    const agentMatch = activeProfile?.email && p.assigned_agent?.email
      ? p.assigned_agent.email.toLowerCase() === activeProfile.email.toLowerCase()
      : (isAdmin && !formData.agent_id);

    return searchMatch && agentMatch;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let finalPhone = formData.telefono;
    let finalName = formData.nombre_completo;
    let finalEmail = formData.email;

    if (clientType === "manual") {
      finalName = manualContact.name;
      finalPhone = manualContact.phone;
      finalEmail = manualContact.email;
    } else if (clientType === "tokko" && selectedLeadId) {
      const lead = trackingOptions.leads.find(l => l.id === selectedLeadId);
      if (lead) {
        finalPhone = lead.phone || lead.cellphone || "";
        finalName = lead.full_name || lead.name || "";
        finalEmail = lead.email || "";
      }
    } else if (clientType === "whatsapp" && selectedLeadId) {
      const waContact = trackingOptions.waContacts.find(c => c.id === selectedLeadId);
      if (waContact) {
        finalPhone = waContact.phone || "";
        finalName = waContact.name || "";
      }
    }

    if (!formData.fecha_visita || !formData.hora_visita || !finalName || !finalPhone) {
      toast.error("Por favor completa los campos obligatorios de fecha, hora y cliente (nombre y teléfono)")
      return
    }

    if (clientType === "manual" && !manualContact.isValid) {
      toast.error("Completá y verificá los datos del cliente (nombre, celular y email deben coincidir) y certificá que son veraces.")
      return
    }

    const finalAgentId = isAdmin ? formData.agent_id : userId;

    if (isAdmin && !finalAgentId) {
      toast.error("Por favor selecciona un asesor")
      return
    }

    try {
      setLoading(true)

      // Si es manual, creamos el contacto en WA para que quede registrado
      if (clientType === "manual") {
        if (!/^\d+$/.test(finalPhone)) {
          toast.error("El número de celular debe contener solo números (código de país y área, ej: 549...).");
          setLoading(false);
          return;
        }

        const result = await createManualContact({
          name: finalName,
          phone: finalPhone,
          email: finalEmail,
          tags: manualContact.tags,
          agent_id: finalAgentId
        });
        
        if (!result.success) {
          toast.error(result.error || "Error al registrar el contacto manual en WhatsApp.");
          setLoading(false);
          return;
        }
      }
      
      const insertData: any = {
        ...formData,
        nombre_completo: finalName,
        telefono: finalPhone,
        email: finalEmail,
        lead_id: finalPhone, // Usar celular como ID de lead según requerimiento
        agency_id: agencyId,
        agent_id: finalAgentId, // Override for cases where formData.agent_id is empty
        score_bant: 0 // Hardcoded to 0
      }

      // Merge prop_colab with title if it's set
      if (formData.propiedad_colaboracion) {
        insertData.propiedad_titulo = insertData.propiedad_titulo 
          ? `${insertData.propiedad_titulo} | Colab: ${formData.propiedad_colaboracion}`
          : `Colaboración: ${formData.propiedad_colaboracion}`;
      }

      // Eliminar el campo que no existe en la base de datos
      delete insertData.propiedad_colaboracion;

      const { error } = await supabase
        .from("scheduled_visits")
        .insert(insertData)

      if (error) throw error

      toast.success("Visita agendada correctamente")
      onSuccess()
      onOpenChange(false)
      // Reset form
      setFormData({
        nombre_completo: "",
        telefono: "",
        email: "",
        fecha_visita: "",
        hora_visita: "",
        propiedad_titulo: "",
        zona_propiedad: "",
        propiedad_colaboracion: "",
        tipo_operacion: "compra",
        presupuesto: "",
        calificacion_lead: "WARM",
        score_bant: 0,
        intereses_clave: "",
        objeciones_detectadas: "",
        decisores: "",
        origen_consulta: "Manual",
        resumen_conversacion: "",
        agent_id: isAdmin ? "" : userId
      })
      setClientType("ninguno");
      setSelectedLeadId(null);
    } catch (error: any) {
      console.error(error)
      toast.error("Error al agendar visita: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-accent/20">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-accent" />
            Agendar Nueva Visita Manual
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Identificadores y Contacto */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-accent flex items-center gap-2">
              <User className="h-4 w-4" /> Información del Lead
            </h3>
            
            <div className="mb-4">
              <Label>Vincular Cliente</Label>
              <Select value={clientType} onValueChange={(v: any) => {
                setClientType(v);
                setSelectedLeadId(null);
              }}>
                <SelectTrigger className="w-full md:w-[300px] h-10 bg-accent/5 border-accent/10">
                  <SelectValue placeholder="Tipo de cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Ninguno</SelectItem>
                  <SelectItem value="tokko">Lead (Tokko / Web)</SelectItem>
                  <SelectItem value="whatsapp">Contacto WhatsApp</SelectItem>
                  <SelectItem value="manual">Nuevo Contacto (Manual)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {clientType === "manual" && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <ManualContactFields
                  onChange={setManualContact}
                  inputClassName="bg-accent/5 border-accent/10"
                />
              </div>
            )}

            {clientType === "tokko" && (
               <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label>Buscar Lead de Tokko</Label>
                  <SearchableSelect 
                    options={trackingOptions.leads.map(l => ({
                      label: l.full_name || 'Sin nombre',
                      value: l.id
                    }))}
                    value={selectedLeadId || undefined}
                    onChange={(val) => setSelectedLeadId(val)}
                    placeholder="Buscar Lead de Tokko..."
                    emptyMessage="No se encontraron leads."
                  />
               </div>
            )}

            {clientType === "whatsapp" && (
               <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label>Buscar Contacto WhatsApp</Label>
                  <SearchableSelect 
                    options={trackingOptions.waContacts.map(c => ({
                      label: `${c.name || 'Sin nombre'} (${c.phone})`,
                      value: c.id
                    }))}
                    value={selectedLeadId || undefined}
                    onChange={(val) => setSelectedLeadId(val)}
                    placeholder="Buscar Contacto WhatsApp..."
                    emptyMessage="No se encontraron contactos."
                  />
               </div>
            )}
          </div>

          {/* Detalles de la Visita */}
          <div className="space-y-4 border-t border-accent/10 pt-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-accent flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Detalles de la Cita
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha_visita">Fecha *</Label>
                <Input 
                  id="fecha_visita" 
                  type="date"
                  value={formData.fecha_visita}
                  onChange={(e) => setFormData({...formData, fecha_visita: e.target.value})}
                  className="bg-accent/5 border-accent/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hora_visita">Hora *</Label>
                <Input 
                  id="hora_visita" 
                  type="time"
                  value={formData.hora_visita}
                  onChange={(e) => setFormData({...formData, hora_visita: e.target.value})}
                  className="bg-accent/5 border-accent/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="propiedad_titulo">Seleccionar Propiedad (Tokko)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between bg-accent/5 border-accent/10 h-10 font-normal"
                    >
                      {formData.propiedad_titulo || "Seleccionar propiedad..."}
                      <Briefcase className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0 bg-card border-accent/20 shadow-2xl" align="start">
                    <div className="p-2 border-b border-accent/10">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar propiedad por título o dirección..."
                          className="pl-8 h-9 border-none bg-accent/5 focus-visible:ring-0"
                          value={propertySearch}
                          onChange={(e) => setPropertySearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto p-1">
                      {filteredProperties.length === 0 ? (
                        <div className="p-4 text-sm text-center text-muted-foreground">
                          No se encontraron propiedades
                        </div>
                      ) : (
                        filteredProperties.map((prop) => (
                          <button
                            key={prop.id}
                            type="button"
                            className={cn(
                              "w-full text-left p-2 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5",
                              formData.propiedad_titulo === prop.title && "bg-accent/10"
                            )}
                            onClick={() => handlePropertyChange(prop.id)}
                          >
                            <span className="font-semibold">{prop.title}</span>
                            <span className="text-xs text-muted-foreground line-clamp-1">{prop.address}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="propiedad_colaboracion">Propiedad (Colaboración)</Label>
                <Input 
                  id="propiedad_colaboracion" 
                  value={formData.propiedad_colaboracion}
                  onChange={(e) => setFormData({...formData, propiedad_colaboracion: e.target.value})}
                  placeholder="Ej: PH Colegiales RE/MAX"
                  className="bg-accent/5 border-accent/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zona_propiedad">Zona / Barrio</Label>
                <Input 
                  id="zona_propiedad" 
                  value={formData.zona_propiedad}
                  onChange={(e) => setFormData({...formData, zona_propiedad: e.target.value})}
                  placeholder="Ej: Palermo"
                  className="bg-accent/5 border-accent/10"
                />
              </div>
            </div>
          </div>

          {/* Perfil BANT y Operación */}
          <div className="space-y-4 border-t border-accent/10 pt-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-accent flex items-center gap-2">
              <Tag className="h-4 w-4" /> Calificación y Perfil
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Operación</Label>
                <Select 
                  value={formData.tipo_operacion} 
                  onValueChange={(v) => setFormData({...formData, tipo_operacion: v})}
                >
                  <SelectTrigger className="bg-accent/5 border-accent/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compra">Compra</SelectItem>
                    <SelectItem value="alquiler">Alquiler</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="presupuesto">Presupuesto</Label>
                <Input 
                  id="presupuesto" 
                  value={formData.presupuesto}
                  onChange={(e) => setFormData({...formData, presupuesto: e.target.value})}
                  placeholder="Ej: 200k USD"
                  className="bg-accent/5 border-accent/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Calificación</Label>
                <Select 
                  value={formData.calificacion_lead} 
                  onValueChange={(v) => setFormData({...formData, calificacion_lead: v})}
                >
                  <SelectTrigger className="bg-accent/5 border-accent/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOT">🔥 HOT</SelectItem>
                    <SelectItem value="WARM">⚡ WARM</SelectItem>
                    <SelectItem value="COLD">❄️ COLD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Gestión y Notas */}
          <div className="space-y-4 border-t border-accent/10 pt-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-accent flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Gestión y Asignación
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isAdmin && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Asesor Responsable * 
                  </Label>
                  <Select 
                    value={formData.agent_id} 
                    onValueChange={(v) => setFormData({...formData, agent_id: v})}
                  >
                    <SelectTrigger className="bg-accent/5 border-accent/10">
                      <SelectValue placeholder="Seleccionar asesor" />
                    </SelectTrigger>
                    <SelectContent>
                      {allAgencyProfiles?.map(agent => (
                        <SelectItem key={agent.id} value={agent.id}>{agent.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground italic">
                    Este es el asesor que gestionará la visita en el sistema.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="origen_consulta">Origen de Consulta</Label>
                <Select 
                  value={formData.origen_consulta} 
                  onValueChange={(v) => setFormData({...formData, origen_consulta: v})}
                >
                  <SelectTrigger className="bg-accent/5 border-accent/10">
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
                    <SelectItem value="Manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="intereses_clave">Intereses Clave</Label>
                <Textarea 
                  id="intereses_clave" 
                  value={formData.intereses_clave}
                  onChange={(e) => setFormData({...formData, intereses_clave: e.target.value})}
                  placeholder="¿Qué busca exactamente?"
                  className="bg-accent/5 border-accent/10 h-20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resumen_conversacion">Resumen Conversación</Label>
                <Textarea 
                  id="resumen_conversacion" 
                  value={formData.resumen_conversacion}
                  onChange={(e) => setFormData({...formData, resumen_conversacion: e.target.value})}
                  placeholder="Contexto relevante..."
                  className="bg-accent/5 border-accent/10 h-20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="objeciones_detectadas">Objeciones</Label>
                <Textarea 
                  id="objeciones_detectadas" 
                  value={formData.objeciones_detectadas}
                  onChange={(e) => setFormData({...formData, objeciones_detectadas: e.target.value})}
                  placeholder="Ej: Precio alto, zona ruidosa..."
                  className="bg-accent/5 border-accent/10 h-20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decisores">Decisores</Label>
                <Textarea 
                  id="decisores" 
                  value={formData.decisores}
                  onChange={(e) => setFormData({...formData, decisores: e.target.value})}
                  placeholder="¿Quién toma la decisión final?"
                  className="bg-accent/5 border-accent/10 h-20"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-accent/10">
             <Button 
               type="button" 
               variant="outline" 
               onClick={() => onOpenChange(false)}
               className="border-accent/20 hover:bg-accent/5"
             >
               Cancelar
             </Button>
             <Button 
               type="submit" 
               disabled={loading}
               className="bg-accent hover:bg-accent/90"
             >
               {loading ? "Agendando..." : "Agendar Visita"}
             </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
