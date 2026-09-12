import type { Metadata } from "next"
import { DifusionDirector } from "@/components/difusion/DifusionDirector"

export const metadata: Metadata = {
  title: "Campañas | PRISMA",
}

/** Los envíos masivos por WhatsApp, con entrega real por contacto. Antes era una solapa de "Asesor IA WhatsApp". */
export default function CampanasPage() {
  return <DifusionDirector seccion="campanas" />
}
