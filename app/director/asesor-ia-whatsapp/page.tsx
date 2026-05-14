import { createClient } from "@/lib/supabase/server"
import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { WhatsAppTabsWrapper } from "@/components/whatsapp/WhatsAppTabsWrapper"

export default async function AsesorIAWhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // 1. Obtenemos el perfil para saber a qué agencia pertenece el usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) return null

  // 2. Obtenemos la instancia usando el agency_id del perfil
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .maybeSingle()

  return (
    <div id="whatsapp-ia-page" className="flex-1 flex flex-col min-h-0 whatsapp-page-container bg-background">
      {!instance ? (
        <SetupWizard />
      ) : (
        <WhatsAppErrorBoundary>
          <WhatsAppTabsWrapper instance={instance} />
        </WhatsAppErrorBoundary>
      )}
    </div>
  )
}
