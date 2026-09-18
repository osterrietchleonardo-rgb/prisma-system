import type { Metadata } from "next"
import { ConfiguracionChatWeb } from "@/components/chat-web/configuracion-chat-web"

export const metadata: Metadata = { title: "Chat de la web | PRISMA" }

/** La tarjeta donde el director configura el chat de su sitio. Solo el director. */
export default function ChatWebPage() {
  return <ConfiguracionChatWeb />
}
