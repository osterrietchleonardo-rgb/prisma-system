import type { Metadata } from "next"
import { BandejaChatWeb } from "@/components/chat-web/bandeja-chat-web"

export const metadata: Metadata = { title: "Chat de la web | PRISMA" }

/**
 * La bandeja del chat web para el asesor que el director eligió en el desplegable del widget.
 * Quien no fue elegido no llega acá por el menú, y si escribe la dirección a mano el endpoint le
 * devuelve 403: la regla está en lib/chat-web/acceso.ts y en la política de la base.
 */
export default function BandejaChatWebAsesorPage() {
  return <BandejaChatWeb rol="asesor" />
}
