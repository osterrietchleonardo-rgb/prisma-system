import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { instanciaWhatsAppDelUsuario } from "@/lib/whatsapp/instancia-del-usuario"
import { PaginaDifusion, type SeccionDifusion } from "./PaginaDifusion"

/**
 * Una página de Difusión para el director. Misma puerta de entrada que tenía la
 * pantalla de "Asesor IA WhatsApp": sin instancia (o desconectada) se muestra el
 * asistente de conexión; con instancia, la sección pedida.
 */
export async function DifusionDirector({ seccion }: { seccion: SeccionDifusion }) {
  const { instance } = await instanciaWhatsAppDelUsuario("director")

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      {!instance || instance.status === "disconnected" ? (
        <SetupWizard />
      ) : (
        <PaginaDifusion rol="director" seccion={seccion} instance={instance} />
      )}
    </div>
  )
}
