import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import LeadsWhatsappClient from "./LeadsWhatsappClient"
import { Badge } from "@/components/ui/badge"

export const metadata = {
  title: 'Leads WhatsApp - Prisma System',
  description: 'Gestión de Leads provenientes de WhatsApp',
}

export default async function LeadsWhatsappPage() {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) {
    redirect("/director/dashboard")
  }

  const agency_id = profile.agency_id

  // Fetchear todas las conversaciones activas (Leads) de esta agencia, incluyendo el perfil del asesor asignado
  const { data: conversations, error } = await supabase
    .from('wa_conversations')
    .select('*, assigned_agent:profiles!wa_conversations_agent_id_fkey(full_name, email, avatar_url)')
    .eq('agency_id', agency_id)
    .order('last_message_at', { ascending: false })

  if (error) {
    console.error('Error al obtener los leads de whatsapp:', error)
  }

  return (
    <div className="flex flex-col h-full space-y-6 pt-6 container max-w-[1600px] mx-auto pb-10 px-4 md:px-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex flex-wrap items-center gap-3">
            Leads de WhatsApp
            <Badge variant="outline" className="text-[10px] md:text-xs">Canal Directo</Badge>
            {conversations && conversations.length > 0 && (
              <Badge variant="secondary" className="text-[10px] md:text-xs bg-accent/10 text-accent border-accent/20">
                {conversations.length} {conversations.length === 1 ? 'lead' : 'leads'}
              </Badge>
            )}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Gestión inteligente de leads provenientes de WhatsApp y asignación al Pipeline.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <LeadsWhatsappClient initialConversations={conversations || []} basePath="/director/leads-whatsapp" />
      </div>
    </div>
  )
}
