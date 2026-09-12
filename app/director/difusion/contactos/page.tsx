import type { Metadata } from "next"
import { DifusionDirector } from "@/components/difusion/DifusionDirector"

export const metadata: Metadata = {
  title: "Contactos | PRISMA",
}

/** La agenda de WhatsApp de la agencia: altas, listas e inicio de campañas. Antes era una solapa de "Asesor IA WhatsApp". */
export default function ContactosPage() {
  return <DifusionDirector seccion="contactos" />
}
