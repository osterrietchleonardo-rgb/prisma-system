import type { Metadata } from "next"
import { DifusionDirector } from "@/components/difusion/DifusionDirector"

export const metadata: Metadata = {
  title: "Plantillas | PRISMA",
}

/** Las plantillas de WhatsApp aprobadas por Meta que usan el bot y las campañas. Antes era una solapa de "Asesor IA WhatsApp". */
export default function PlantillasPage() {
  return <DifusionDirector seccion="plantillas" />
}
