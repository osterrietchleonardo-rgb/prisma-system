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
  Phone, 
  Mail, 
  MapPin, 
  Tag, 
  Briefcase,
  Search,
  Check
} from "lucide-react"
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

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
          .order("title")
        
        if (propsData) setProperties(propsData)

        // Fetch all profiles for the agency to match assigned_agent by email
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("agency_id", agencyId)
        
        if (profiles) setAllAgencyProfiles(profiles)
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

  const filteredProperties = properties.filter(p => 
    p.title.toLowerCase().includes(propertySearch.toLowerCase()) ||
    p.address?.toLowerCase().includes(propertySearch.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.fecha_visita || !formData.hora_visita || !formData.nombre_completo) {
      toast.error("Por favor completa los campos obligatorios")
      return
    }

    if (isAdmin && !formData.agent_id) {
      toast.error("Por favor selecciona un asesor")
      return
    }

    try {
      setLoading(true)
      
      const { error } = await supabase
        .from("scheduled_visits")
        .insert({
          ...formData,
          lead_id: formData.telefono, // Usar celular como ID de lead
          agency_id: agencyId,
          score_bant: parseInt(formData.score_bant.toString()) || 0
        })

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre_completo">Nombre Completo *</Label>
                <Input 
                  id="nombre_completo" 
                  value={formData.nombre_completo}
                  onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
                  placeholder="Ej: Juan Pérez"
                  className="bg-accent/5 border-accent/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="telefono" 
                    value={formData.telefono}
                    onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                    placeholder="+54 11 ..."
                    className="pl-10 bg-accent/5 border-accent/10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="juan@ejemplo.com"
                    className="pl-10 bg-accent/5 border-accent/10"
                  />
                </div>
              </div>
            </div>
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
              <div className="space-y-2">
                <Label htmlFor="score_bant">Score BANT (0-12)</Label>
                <Input 
                  id="score_bant" 
                  type="number"
                  min="0"
                  max="12"
                  value={formData.score_bant}
                  onChange={(e) => setFormData({...formData, score_bant: parseInt(e.target.value)})}
                  className="bg-accent/5 border-accent/10"
                />
              </div>
            </div>
          </div>

          {/* Gestión y Notas */}
          <div className="space-y-4 border-t border-accent/10 pt-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-accent flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Gestión y Asignación
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(isAdmin || formData.agent_id !== userId) && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Asesor Responsable * 
                    {formData.agent_id !== userId && !isAdmin && (
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">Propiedad Ajena</span>
                    )}
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
                <Input 
                  id="origen_consulta" 
                  value={formData.origen_consulta}
                  onChange={(e) => setFormData({...formData, origen_consulta: e.target.value})}
                  className="bg-accent/5 border-accent/10"
                />
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
