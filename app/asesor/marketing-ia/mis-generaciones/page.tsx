import type { Metadata } from "next"
import { MarketingHistory } from "@/components/marketing-ia/marketing-history"

export const metadata: Metadata = { title: "Mis Generaciones | PRISMA" }

/** Antes: la solapa "Mis Generaciones" de Marketing IA (el asesor la llama así; el director, "Historial / Galería"). */
export default function MisGeneracionesPage() {
  return <MarketingHistory />
}
