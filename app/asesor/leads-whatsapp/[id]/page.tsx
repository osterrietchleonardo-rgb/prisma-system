import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ActiveChat } from "@/components/whatsapp/ActiveChat"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: 'Ficha Lead WhatsApp - Prisma System',
}

export default async function AsesorLeadFichaPage({ params }: { params: { id: string } }) {
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

  // Verificar que la conversación le pertenezca al asesor
  const { data: conv } = await supabase
    .from("wa_conversations")
    .select("*, assigned_agent:profiles!wa_conversations_agent_id_fkey(full_name, email, avatar_url)")
    .eq("id", params.id)
    .eq("agency_id", profile.agency_id)
    .eq("agent_id", user.id)
    .single()

  if (!conv) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <h2 className="text-xl font-bold">Conversación no encontrada o sin acceso</h2>
        <Link href="/asesor/leads-whatsapp">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Volver</Button>
        </Link>
      </div>
    )
  }

  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("agency_id", conv.agency_id)
    .single()

  if (!instance) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <h2 className="text-xl font-bold">Instancia de WhatsApp no configurada</h2>
        <Link href="/asesor/leads-whatsapp">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Volver</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col h-[calc(100vh-64px)] max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/asesor/leads-whatsapp">
            <Button variant="outline" size="sm" className="h-8">
              <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Mis Leads
            </Button>
          </Link>
          <h1 className="text-xl font-bold hidden sm:block bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">Ficha del Lead: {conv.contact_name || conv.contact_phone}</h1>
        </div>
      </div>
      <div className="flex-1 border border-accent/10 rounded-2xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-sm relative">
        <ActiveChat conversation={conv} instance={instance} />
      </div>
    </div>
  )
}
