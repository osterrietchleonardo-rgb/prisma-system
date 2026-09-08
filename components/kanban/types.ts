import { 
  User, 
  Mail, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  MousePointer2, 
  Handshake, 
  FileText 
} from "lucide-react"

/* Cada etapa lleva su fondo Y su color de texto. El contraste entre los dos no
   depende del tema (es texto sobre la chapa, no sobre la pagina), asi que estos
   pares valen igual en claro y en oscuro. Los cobres solidos mantienen la escala
   visual que tenia la transparencia, pero se leen: antes bg-accent/60 con texto
   blanco daba 2,55:1. Medidos sobre cada chapa: entre 5,0 y 8,9. */
export const KANBAN_STAGES = [
  { id: "nuevo", title: "Nuevo contacto", icon: MousePointer2, color: "bg-accent text-accent-foreground" },
  { id: "contacto", title: "Primer contacto", icon: MessageSquare, color: "bg-orange-700 text-white" },
  { id: "calificado", title: "Calificado", icon: User, color: "bg-[#7a4f24] text-white" },
  { id: "visita_agendada", title: "Visita agendada", icon: Calendar, color: "bg-amber-700 text-white" },
  { id: "visita_realizada", title: "Visita realizada", icon: CheckCircle2, color: "bg-primary text-primary-foreground" },
  { id: "propuesta", title: "Propuesta enviada", icon: FileText, color: "bg-[#66421e] text-white" },
  { id: "negociacion", title: "Negociación", icon: Handshake, color: "bg-[#7a4f24] text-white" },
  { id: "cerrado", title: "Cerrado", icon: CheckCircle2, color: "bg-emerald-700 text-white" },
  { id: "perdido", title: "Perdido", icon: XCircle, color: "bg-rose-700 text-white" },
] as const

export type KanbanStage = typeof KANBAN_STAGES[number]["id"]

export interface Lead {
  id: string
  agency_id: string
  full_name: string
  email: string
  phone: string
  source: string
  pipeline_stage: string
  notes?: string
  assigned_agent_id?: string
  created_at: string
  updated_at: string
  tokko_property_title?: string
  tokko_property_price?: string
  tokko_property_type?: string
  tokko_property_operation?: string
  tokko_property_location?: string
  tokko_lead_status?: string
  tokko_agent_name?: string
  tokko_agent_picture?: string
  assigned_agent?: {
    id: string
    full_name: string
    avatar_url: string
  }
}
