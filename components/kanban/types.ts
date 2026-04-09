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

export const KANBAN_STAGES = [
  { id: "nuevo", title: "Nuevo contacto", icon: MousePointer2, color: "bg-accent" },
  { id: "contacto", title: "Primer contacto", icon: MessageSquare, color: "bg-orange-400" },
  { id: "calificado", title: "Calificado", icon: User, color: "bg-accent/80" },
  { id: "visita_agendada", title: "Visita agendada", icon: Calendar, color: "bg-amber-500" },
  { id: "visita_realizada", title: "Visita realizada", icon: CheckCircle2, color: "bg-primary" },
  { id: "propuesta", title: "Propuesta enviada", icon: FileText, color: "bg-accent/60" },
  { id: "negociacion", title: "Negociación", icon: Handshake, color: "bg-primary/80" },
  { id: "cerrado", title: "Cerrado", icon: CheckCircle2, color: "bg-emerald-500" },
  { id: "perdido", title: "Perdido", icon: XCircle, color: "bg-rose-500" },
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
  assigned_agent_id?: string
  created_at: string
  updated_at: string
  assigned_agent?: {
    id: string
    full_name: string
    avatar_url: string
  }
}
