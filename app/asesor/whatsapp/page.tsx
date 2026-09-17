import type { Metadata } from "next"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { BandejaWhatsApp } from "@/components/whatsapp/BandejaWhatsApp"
import { WhatsAppNoConfigurado } from "@/components/whatsapp/WhatsAppNoConfigurado"
import { instanciaWhatsAppDelUsuario } from "@/lib/whatsapp/instancia-del-usuario"
import type { WhatsAppInstance } from "@/types/whatsapp"

export const metadata: Metadata = {
  title: "Bandeja WhatsApp | PRISMA",
  description: "Gestiona tus conversaciones de WhatsApp en tiempo real.",
}

/**
 * La bandeja del asesor: solo los chats. Su agenda de Contactos es una página
 * del grupo «Difusión» del menú (12/9/2026).
 */
export default async function WhatsAppInboxPage() {
  const { instance, profile } = await instanciaWhatsAppDelUsuario("asesor")

  // Si no hay instancia, solo el director puede configurarla
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
      <BandejaWhatsApp instance={instance as WhatsAppInstance} titulo="Bandeja" hideAgentFilter />
    </div>
  )
}
