import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import LeadsWhatsappClient from "./LeadsWhatsappClient"

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
    <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
          Leads de WhatsApp
        </h1>
        <p className="text-muted-foreground text-lg">
          Gestiona los leads que te han contactado por WhatsApp y envíalos al Pipeline.
        </p>
      </div>

      <LeadsWhatsappClient initialConversations={conversations || []} basePath="/director/leads-whatsapp" />
    </div>
  )
}
