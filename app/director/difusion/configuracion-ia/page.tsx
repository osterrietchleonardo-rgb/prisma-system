import type { Metadata } from "next"
import { DifusionDirector } from "@/components/difusion/DifusionDirector"

export const metadata: Metadata = {
  title: "Configuración IA | PRISMA",
}

/** Cómo se comporta el asesor IA en WhatsApp. Antes era una solapa de "Asesor IA WhatsApp". */
export default function ConfiguracionIaWhatsAppPage() {
  return <DifusionDirector seccion="configuracion-ia" />
}
