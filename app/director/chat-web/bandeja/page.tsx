import { redirect } from "next/navigation"

/** La bandeja ahora es la pantalla principal del Asesor IA Web. */
export default function BandejaVieja() {
  redirect("/director/chat-web")
}
