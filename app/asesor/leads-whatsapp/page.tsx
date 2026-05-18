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
    .order('last_message_at', { ascending: false })

  if (error) {
    console.error('Error al obtener los leads de whatsapp del asesor:', error)
  }

  return (
    <div className="flex flex-col h-full space-y-6 pt-6 container max-w-[1600px] mx-auto pb-10 px-4 md:px-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Mis Leads de WhatsApp
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Revisa el estado de tus contactos asignados desde WhatsApp y su fase en el Pipeline.
        </p>
      </div>

      <LeadsWhatsappClient initialConversations={conversations || []} basePath="/asesor/leads-whatsapp" />
    </div>
  )
}
