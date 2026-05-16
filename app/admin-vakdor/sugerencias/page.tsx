import { Suspense } from "react"
import SugerenciasClient from "@/components/admin-vakdor/sugerencias-client"

export const metadata = {
  title: "Sugerencias · Panel Admin",
  robots: { index: false, follow: false },
}

export default function SugerenciasPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando...</div>}>
      <SugerenciasClient />
    </Suspense>
  )
}
