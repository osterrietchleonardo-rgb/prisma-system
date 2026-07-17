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
import { Clock, Calendar, Edit3 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { getTrackingOptions } from "@/actions/tracking/getTrackingOptions"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Search, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { triggerCalendarSync } from "@/lib/google-calendar/triggerSync"

interface EditVisitDialogProps {
  visit: any | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencyId: string
}

export function EditVisitDialog({ visit, open, onOpenChange, onSuccess, agencyId }: EditVisitDialogProps) {
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<any[]>([])
  const [propSearch, setPropSearch] = useState("")
  
  const [formData, setFormData] = useState({
    fecha_visita: "",
    hora_visita: "",
    propiedad_titulo: "",
    zona_propiedad: "",
    propiedad_colaboracion: "",
    motivo_cambio: ""
  })

  useEffect(() => {
    if (visit && open) {
      setFormData({
        fecha_visita: visit.fecha_visita || "",
        hora_visita: visit.hora_visita || "",
        propiedad_titulo: visit.propiedad_titulo || "",
        zona_propiedad: visit.zona_propiedad || "",
        propiedad_colaboracion: visit.propiedad_colaboracion || "",
        motivo_cambio: ""
      })
    }
  }, [visit, open])

  useEffect(() => {
    if (open && agencyId) {
      getTrackingOptions().then((res) => {
        setProperties(res.properties)
      })
    }
  }, [open, agencyId])

  const filteredProps = properties.filter(p => 
    p.title.toLowerCase().includes(propSearch.toLowerCase()) || 
    p.address.toLowerCase().includes(propSearch.toLowerCase())
  )

  const handlePropertyChange = (propId: string) => {
    const prop = properties.find(p => p.id === propId)
    if (prop) {
      setFormData(prev => ({
        ...prev, 
        propiedad_titulo: prop.title,
        zona_propiedad: prop.location_name || ""
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.motivo_cambio.trim()) {
      toast.error("Por favor ingresa el motivo del cambio.")
      return
    }

    try {
      setLoading(true)
      const supabase = createClient()
      
      let finalPropiedadTitulo = formData.propiedad_titulo;
      if (formData.propiedad_colaboracion) {
        finalPropiedadTitulo = finalPropiedadTitulo
          ? `${finalPropiedadTitulo} | Colab: ${formData.propiedad_colaboracion}`
          : `Colaboración: ${formData.propiedad_colaboracion}`;
      }

      const updateData = {
        fecha_visita: formData.fecha_visita,
        hora_visita: formData.hora_visita,
        propiedad_titulo: finalPropiedadTitulo,
        zona_propiedad: formData.zona_propiedad,
        motivo_cambio: formData.motivo_cambio
      }

      const { error } = await supabase
        .from("scheduled_visits")
        .update(updateData)
        .eq("id", visit.id)

      if (error) throw error

      // Actualizar el evento espejo en Google Calendar (best-effort, no bloquea).
      triggerCalendarSync(visit.id)

      toast.success("Visita reprogramada exitosamente")
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error("Error al actualizar:", error)
      toast.error("Error al actualizar la visita: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-accent/20 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-accent" />
            Reprogramar / Editar Visita
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit_fecha_visita" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Fecha
              </Label>
              <Input 
                id="edit_fecha_visita" 
                type="date" 
                value={formData.fecha_visita}
                onChange={(e) => setFormData({...formData, fecha_visita: e.target.value})}
                className="bg-accent/5 border-accent/10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_hora_visita" className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Hora
              </Label>
              <Input 
                id="edit_hora_visita" 
                type="time" 
                value={formData.hora_visita}
                onChange={(e) => setFormData({...formData, hora_visita: e.target.value})}
                className="bg-accent/5 border-accent/10"
              />
            </div>
          </div>

          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Propiedad
            </Label>
            <div className="space-y-2">
               <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left bg-accent/5 border-accent/10 h-auto p-3 min-w-0 overflow-hidden">
                    {formData.propiedad_titulo ? (
                      <div className="flex flex-col min-w-0 overflow-hidden">
                        <span className="font-bold line-clamp-1">{formData.propiedad_titulo}</span>
                        <span className="text-xs text-muted-foreground line-clamp-1">{formData.zona_propiedad}</span>
                      </div>
                    ) : "Seleccionar desde base de datos..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] max-w-[90vw] p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por título o dirección..."
                        className="pl-8 bg-transparent border-none focus-visible:ring-0 shadow-none"
                        value={propSearch}
                        onChange={(e) => setPropSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-2 flex flex-col gap-1">
                    {filteredProps.length === 0 ? (
                      <p className="p-4 text-sm text-center text-muted-foreground">No se encontraron propiedades.</p>
                    ) : (
                      filteredProps.map(prop => (
                        <button
                          key={prop.id}
                          type="button"
                          className={cn(
                            "w-full text-left p-2 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5 min-w-0 overflow-hidden",
                            formData.propiedad_titulo === prop.title && "bg-accent/10"
                          )}
                          onClick={() => handlePropertyChange(prop.id)}
                        >
                          <span className="font-semibold line-clamp-1 text-xs">{prop.title}</span>
                          <span className="text-[11px] text-muted-foreground line-clamp-1">{prop.address}</span>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_propiedad_colaboracion" className="text-xs">O Propiedad (Colaboración)</Label>
              <Input 
                id="edit_propiedad_colaboracion" 
                value={formData.propiedad_colaboracion}
                onChange={(e) => setFormData({...formData, propiedad_colaboracion: e.target.value})}
                placeholder="Ej: PH Colegiales RE/MAX"
                className="bg-accent/5 border-accent/10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo_cambio" className="text-red-400">Motivo del Cambio *</Label>
            <Textarea 
              id="motivo_cambio" 
              value={formData.motivo_cambio}
              onChange={(e) => setFormData({...formData, motivo_cambio: e.target.value})}
              placeholder="Ej: El cliente solicitó posponer la visita por viaje..."
              className="bg-accent/5 border-red-500/30 h-24"
              required
            />
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !formData.motivo_cambio.trim()}
              className="bg-accent hover:bg-accent/90"
            >
              {loading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
