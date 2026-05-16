import DashboardClient from "@/components/admin-vakdor/dashboard-client"

export const metadata = {
  title: "Dashboard · Panel Admin",
  robots: { index: false, follow: false },
}

export default function AdminDashboardPage() {
  return <DashboardClient />
}
