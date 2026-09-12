import type { Metadata } from "next"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { WhatsAppNoConfigurado } from "@/components/whatsapp/WhatsAppNoConfigurado"
import { PaginaDifusion } from "@/components/difusion/PaginaDifusion"
import { instanciaWhatsAppDelUsuario } from "@/lib/whatsapp/instancia-del-usuario"
import type { WhatsAppInstance } from "@/types/whatsapp"

export const metadata: Metadata = {
  title: "Contactos | PRISMA",
}

/** La agenda de WhatsApp del asesor, sin acciones de campaña (como su solapa de antes). */
export default async function ContactosAsesorPage() {
  const { instance, profile } = await instanciaWhatsAppDelUsuario("asesor")

  if (!instance) {
    if (profile.role !== "director") {
      return <WhatsAppNoConfigurado />
    }
    return (
      <div className="flex-1 overflow-y-auto">
        <SetupWizard />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <PaginaDifusion rol="asesor" seccion="contactos" instance={instance as WhatsAppInstance} hideActions />
    </div>
  )
}
