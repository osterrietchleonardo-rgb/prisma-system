import type { Metadata } from "next"
import { MarketingHistory } from "@/components/marketing-ia/marketing-history"

export const metadata: Metadata = { title: "Historial / Galería | PRISMA" }

/** Antes: la solapa "Historial / Galería" de Marketing IA. */
export default function HistorialPage() {
  return <MarketingHistory />
}
