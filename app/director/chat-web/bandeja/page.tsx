import type { Metadata } from "next"
import { BandejaChatWeb } from "@/components/chat-web/bandeja-chat-web"

export const metadata: Metadata = { title: "Chat de la web | PRISMA" }

/** La bandeja del chat web para el director: ve todas las conversaciones de su agencia. */
export default function BandejaChatWebDirectorPage() {
  return <BandejaChatWeb rol="director" />
}
