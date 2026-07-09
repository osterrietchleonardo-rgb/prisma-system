import { leerSnapshots } from "@/lib/admin-vakdor/audit/read"
import MetricasClient from "@/components/admin-vakdor/metricas-client"

export const metadata = { title: "Métricas · Panel Admin", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function MetricasPage() {
  const { whatsapp, sistema, redes } = await leerSnapshots()
  return <MetricasClient whatsapp={whatsapp} sistema={sistema} redes={redes} />
}
