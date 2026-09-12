import type { Metadata } from "next"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { BandejaWhatsApp } from "@/components/whatsapp/BandejaWhatsApp"
import { instanciaWhatsAppDelUsuario } from "@/lib/whatsapp/instancia-del-usuario"

export const metadata: Metadata = {
  title: "Asesor IA en WhatsApp | PRISMA",
}

/**
 * La bandeja: solo el chat. Contactos, Plantillas, Campañas y Configuración IA
 * son páginas del grupo «Difusión» del menú (12/9/2026).
 */
export default async function AsesorIAWhatsAppPage() {
  const { instance } = await instanciaWhatsAppDelUsuario("director")

  return (
    <div id="whatsapp-ia-page" className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      {!instance || instance.status === "disconnected" ? (
        <SetupWizard />
      ) : (
        <BandejaWhatsApp instance={instance} titulo="Chat" />
      )}
    </div>
  )
}
