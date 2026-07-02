import FinanzasClient from "@/components/admin-vakdor/finanzas-client"

export const metadata = {
  title: "Finanzas · Panel Admin",
  robots: { index: false, follow: false },
}

export default function AdminFinanzasPage() {
  return <FinanzasClient />
}
