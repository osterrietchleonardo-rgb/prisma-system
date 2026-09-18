import type { Metadata } from "next"
import { BandejaChatWeb } from "@/components/chat-web/bandeja-chat-web"

export const metadata: Metadata = { title: "Asesor IA Web | PRISMA" }

/**
 * Asesor IA Web, para el director: lo primero que se ve son los chats y las métricas
 * (Leonardo, 18/9). La configuración vive en Configuración → Integraciones, junto con Google
 * Calendar: se carga una vez y no tiene por qué estar en el medio del trabajo diario.
 */
export default function AsesorIaWebPage() {
  return <BandejaChatWeb rol="director" />
}
