import { listarIdeas, listarEjes } from "@/lib/admin-vakdor/marketing/store"
import MarketingClient from "@/components/admin-vakdor/marketing-client"

export const metadata = {
  title: "Marketing · Panel Admin",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminMarketingPage() {
  // Los ejes se leen acá (server) en vez de por un endpoint: no hace falta estado de carga
  // y un cluster agregado por SQL aparece en los selectores sin desplegar.
  const [ideas, ejes] = await Promise.all([listarIdeas(), listarEjes()])
  return <MarketingClient ideas={ideas} ejes={ejes} />
}
