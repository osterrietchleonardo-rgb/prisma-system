import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Lead } from "@/components/kanban/types"
import PipelineClient from "./PipelineClient"

export const metadata = {
  title: 'Mi Pipeline - Prisma System',
  description: 'Gestiona tus leads y el avance de tus negociaciones.',
}

export default async function AsesorPipelinePage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) {
    redirect("/asesor/dashboard")
  }

  // ── 1. Leads de Tokko (tabla leads) ──────────────────────────────────────
  const { data: tokkoLeads, error: tokkoError } = await supabase
    .from("leads")
    .select(`
      *,
      assigned_agent:profiles(id, full_name, avatar_url)
    `)
    .eq("assigned_agent_id", user.id)
    .order("created_at", { ascending: false })

  if (tokkoError) {
    console.error("Error al cargar leads de Tokko:", tokkoError)
  }

  // ── 2. Leads de WhatsApp (tabla wa_conversations) ─────────────────────────
  const { data: waConvs, error: waError } = await supabase
    .from("wa_conversations")
    .select(`
      id,
      contact_name,
      contact_phone,
      pipeline_stage,
      status,
      score,
      etiquetas,
      created_at,
      last_message_at,
      agent_id,
      assigned_agent:profiles!wa_conversations_agent_id_fkey(id, full_name, avatar_url)
    `)
    .eq("agency_id", profile.agency_id)
    .eq("agent_id", user.id)
    .order("last_message_at", { ascending: false })

  if (waError) {
    console.error("Error al cargar leads de WhatsApp:", waError)
  }

  // ── 3. Mapear wa_conversations al formato Lead del Kanban ─────────────────
  const waLeads: Lead[] = (waConvs || []).map(conv => ({
    id: conv.id,
    agency_id: profile.agency_id,
    full_name: conv.contact_name || conv.contact_phone || "Sin nombre",
    email: "",
    phone: conv.contact_phone,
    source: "WhatsApp" as const,
    pipeline_stage: conv.pipeline_stage || "nuevo",
    notes: undefined,
    assigned_agent_id: conv.agent_id || undefined,
    created_at: conv.created_at,
    updated_at: conv.last_message_at || conv.created_at,
    tokko_property_title: undefined,
    tokko_property_price: undefined,
    tokko_property_type: undefined,
    tokko_property_operation: undefined,
    tokko_property_location: undefined,
    tokko_lead_status: undefined,
    tokko_agent_name: undefined,
    tokko_agent_picture: undefined,
    assigned_agent: conv.assigned_agent as any ?? undefined,
  }))

  // ── 4. Combinar ambas fuentes ─────────────────────────────────────────────
  const allLeads: Lead[] = [
    ...((tokkoLeads as unknown as Lead[]) || []),
    ...waLeads,
  ]

  return <PipelineClient initialLeads={allLeads} />
}
