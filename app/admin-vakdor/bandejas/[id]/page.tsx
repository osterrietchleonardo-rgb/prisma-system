import BandejaDetalleClient from "@/components/admin-vakdor/bandeja-detalle-client"

export const metadata = {
  title: "Conversación · Panel Admin",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function BandejaDetallePage({ params }: { params: { id: string } }) {
  return <BandejaDetalleClient conversationId={params.id} />
}
