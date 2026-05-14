import { createClient } from "@/lib/supabase/server"
import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { WhatsAppTabsWrapper } from "@/components/whatsapp/WhatsAppTabsWrapper"

export default async function AsesorIAWhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Obtenemos la instancia directamente en el servidor (más rápido y seguro)
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("agency_id", user.id)
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
