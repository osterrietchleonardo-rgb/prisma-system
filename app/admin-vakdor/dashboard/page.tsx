import { leerSnapshots } from "@/lib/admin-vakdor/audit/read"
import DashboardClient from "@/components/admin-vakdor/dashboard-client"

export const metadata = {
  title: "Dashboard · Panel Admin",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const audit = await leerSnapshots()
  return <DashboardClient audit={audit} />
}
