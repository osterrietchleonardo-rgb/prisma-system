import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import LeadsWhatsappClient from "@/app/director/leads-whatsapp/LeadsWhatsappClient"

export const metadata = {
  title: 'Leads WhatsApp - Prisma System',
  description: 'Mis Leads provenientes de WhatsApp',
}

export default async function AsesorLeadsWhatsappPage() {
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

  const { data: conversations, error } = await supabase
    .from('wa_conversations')
    .select('*, assigned_agent:profiles!wa_conversations_agent_id_fkey(full_name, email, avatar_url)')
    .eq('agency_id', profile.agency_id)
    .eq('agent_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error al obtener los leads de whatsapp del asesor:', error)
  }

  const { data: leadsData } = await supabase
    .from('leads')
    .select('phone, pipeline_stage')
    .eq('agency_id', profile.agency_id)
    .eq('source', 'WhatsApp')

  const enrichedConversations = (conversations || []).map((conv: any) => {
    const matchedLead = (leadsData || []).find((l: any) => l.phone === conv.contact_phone)
    return {
      ...conv,
      pipeline_stage: matchedLead ? matchedLead.pipeline_stage : null
    }
  })

  return (
    <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
          Mis Leads de WhatsApp
        </h1>
        <p className="text-muted-foreground text-lg">
          Revisa el estado de tus contactos asignados desde WhatsApp y su fase en el Pipeline.
        </p>
      </div>

      <LeadsWhatsappClient initialConversations={enrichedConversations} />
    </div>
  )
}
