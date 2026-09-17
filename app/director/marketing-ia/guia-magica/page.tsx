import type { Metadata } from "next"
import { AdGuide } from "@/components/marketing-ia/ad-guide"

export const metadata: Metadata = { title: "Guía Mágica | PRISMA" }

/** Antes: la solapa "Guía Mágica" de Marketing IA. */
export default function GuiaMagicaPage() {
  return <AdGuide />
}
