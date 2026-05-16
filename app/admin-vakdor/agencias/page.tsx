import AgenciasClient from "@/components/admin-vakdor/agencias-client"

export const metadata = {
  title: "Agencias · Panel Admin",
  robots: { index: false, follow: false },
}

export default function AgenciasPage() {
  return <AgenciasClient />
}
