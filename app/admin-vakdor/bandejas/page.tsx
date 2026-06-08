import BandejasClient from "@/components/admin-vakdor/bandejas-client"

export const metadata = {
  title: "Bandejas de entrada · Panel Admin",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function BandejasPage() {
  return <BandejasClient />
}
