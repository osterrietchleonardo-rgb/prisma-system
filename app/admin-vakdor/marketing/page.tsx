import { listarIdeas } from "@/lib/admin-vakdor/marketing/store"
import MarketingClient from "@/components/admin-vakdor/marketing-client"

export const metadata = {
  title: "Marketing · Panel Admin",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminMarketingPage() {
  const ideas = await listarIdeas()
  return <MarketingClient ideas={ideas} />
}
