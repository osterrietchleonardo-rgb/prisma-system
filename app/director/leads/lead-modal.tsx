"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  User
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { getAgencyAgents } from "@/lib/queries/director"

interface LeadModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  onSuccess: () => Promise<void> | void
}

export function LeadModal({ isOpen, setIsOpen, onSuccess }: LeadModalProps) {
  const [agents, setAgents] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!isOpen) return;
    async function loadAgents() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return;
        const { data: profile } = await supabase.from("profiles").select("agency_id").eq("id", session.user.id).single()
        if (profile?.agency_id) {
           const ags = await getAgencyAgents({ agencyId: profile.agency_id })
           setAgents(ags || [])
        }
      } catch (err) {
        console.error("Error loading agents:", err)
      }
    }
    loadAgents()
  }, [isOpen, supabase])

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    source: "Manual",
    assigned_agent_id: "",
    notes: "",
    tokko_property_operation: "",
    tokko_property_type: "",
    tokko_lead_status: "Nuevo"
  })

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error("Sin sesión"); return }

      const { data: profile } = await supabase
        .from("profiles").select("agency_id").eq("id", session.user.id).single()

      // Map Tokko status to PRISMA pipeline stage
      let pipelineStage = "nuevo";
      const status = formData.tokko_lead_status.toLowerCase();
      if (status.includes("nuevo")) pipelineStage = "nuevo";
      else if (status.includes("contacto")) pipelineStage = "contacto";
      else if (status.includes("calificado")) pipelineStage = "calificado";
      else if (status.includes("negociación") || status.includes("negociacion")) pipelineStage = "negociacion";

      const { error } = await supabase.from("leads").insert([{
        ...formData,
        agency_id: profile?.agency_id,
        pipeline_stage: pipelineStage,
        status: "active"
      }])
      if (error) throw error
      toast.success("Lead creado correctamente")
      setIsOpen(false)
      onSuccess()

      // Limpiar form
      setFormData({
        full_name: "",
        phone: "",
        email: "",
        source: "Manual",
        assigned_agent_id: "",
        notes: "",
        tokko_property_operation: "",
        tokko_property_type: "",
        tokko_lead_status: "Nuevo"
      })
    } catch (_error) {
      toast.error("Error al crear lead")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-accent hover:bg-accent/90 gap-2 shadow-lg shadow-accent/20 active:scale-95 transition-all">
          <Plus className="h-4 w-4" />
          <span>Nuevo Lead</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-card border-accent/20 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6 text-accent" />
            Agregar Nuevo Lead
          </DialogTitle>
          <DialogDescription>
            Cargá un prospecto manualmente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmitManual} className="grid grid-cols-2 gap-4 pt-4">
          <div className="space-y-2">
            <Label>Nombre Completo</Label>
            <Input placeholder="Ej: Juan Pérez" value={formData.full_name}
              onChange={(e) => setFormData({...formData, full_name: e.target.value})} required />
          </div>
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input placeholder="+54 9 11..." value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="juan@email.com" value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Asignar Asesor</Label>
            <Select value={formData.assigned_agent_id} onValueChange={(v) => setFormData({...formData, assigned_agent_id: v})}>
              <SelectTrigger><SelectValue placeholder="Seleccionar asesor" /></SelectTrigger>
              <SelectContent>
                {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Operación</Label>
            <Select value={formData.tokko_property_operation} onValueChange={(v) => setFormData({...formData, tokko_property_operation: v})}>
              <SelectTrigger><SelectValue placeholder="Venta / Alquiler..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Venta">Venta</SelectItem>
                <SelectItem value="Alquiler">Alquiler</SelectItem>
                <SelectItem value="Alquiler Temporario">Alquiler Temporario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Propiedad</Label>
            <Select value={formData.tokko_property_type} onValueChange={(v) => setFormData({...formData, tokko_property_type: v})}>
              <SelectTrigger><SelectValue placeholder="Casa / Depto..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Departamento">Departamento</SelectItem>
                <SelectItem value="Casa">Casa</SelectItem>
                <SelectItem value="Ph">PH</SelectItem>
                <SelectItem value="Terreno">Terreno</SelectItem>
                <SelectItem value="Oficina">Oficina</SelectItem>
                <SelectItem value="Local">Local</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Estado Inicial (CRM)</Label>
            <Select value={formData.tokko_lead_status} onValueChange={(v) => setFormData({...formData, tokko_lead_status: v})}>
              <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Nuevo">Nuevo</SelectItem>
                <SelectItem value="En contacto">En contacto</SelectItem>
                <SelectItem value="Calificado">Calificado</SelectItem>
                <SelectItem value="En negociación">En negociación</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Notas Iniciales</Label>
            <textarea className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              placeholder="Detalles sobre el interés del lead..."
              value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={loading}>
              {loading ? "Creando..." : "Crear Lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
