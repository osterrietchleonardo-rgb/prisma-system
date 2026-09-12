import type { Metadata } from "next"
import { MarketingAiSettings } from "@/components/marketing-ia/marketing-ai-settings"

export const metadata: Metadata = { title: "Configuración IA | PRISMA" }

/** Antes: la solapa "Configuración IA" de Marketing IA. Solo el director la tiene. */
export default function ConfiguracionIaMarketingPage() {
  return <MarketingAiSettings />
}
