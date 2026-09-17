"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { ConnectionIndicator } from "@/components/whatsapp/ConnectionIndicator"
import { CampaignState } from "@/components/whatsapp/CampaignState"

/**
 * Una página del grupo «Difusión»: lo que antes era una solapa de "Asesor IA
 * WhatsApp" (Contactos, Plantillas, Campañas, Configuración IA), con la misma
 * franja de arriba (estado de la conexión) y el mismo contenido.
 *
 * Los componentes de cada sección no se tocaron: siguen recibiendo `instance`
 * y siguen cargándose solo en el navegador (ssr: false), como en las solapas.
 */

export type SeccionDifusion = "contactos" | "plantillas" | "campanas" | "configuracion-ia"

const LoadingSpinner = () => (
  <div className="h-full flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

const ContactsTab = dynamic(
  () => import("@/components/whatsapp/ContactsTab").then((m) => m.default),
  { ssr: false, loading: () => <LoadingSpinner /> },
)
const TemplatesTab = dynamic(() => import("@/components/whatsapp/TemplatesTab"), { ssr: false, loading: () => <LoadingSpinner /> })
const CampaignsTab = dynamic(
  () => import("@/components/whatsapp/CampaignsTab").then((m) => m.default),
  { ssr: false, loading: () => <LoadingSpinner /> },
)
const AiSettingsTab = dynamic(() => import("@/components/whatsapp/AiSettingsTab"), { ssr: false, loading: () => <LoadingSpinner /> })

const TITULOS: Record<SeccionDifusion, string> = {
  contactos: "👥 Contactos",
  plantillas: "📋 Plantillas",
  campanas: "📣 Campañas",
  "configuracion-ia": "⚙️ Configuración IA",
}

/** Las solapas de antes se nombraban por su valor interno; la página, por su dirección. */
const RUTA_POR_SOLAPA: Record<string, SeccionDifusion> = {
  contactos: "contactos",
  plantillas: "plantillas",
  campanas: "campanas",
  config: "configuracion-ia",
}

interface PaginaDifusionProps {
  rol: "director" | "asesor"
  seccion: SeccionDifusion
  instance: any
  /** El asesor ve Contactos sin las acciones de campaña (como en su solapa de antes). */
  hideActions?: boolean
}

export function PaginaDifusion({ rol, seccion, instance, hideActions = false }: PaginaDifusionProps) {
  const router = useRouter()
  const pathname = usePathname()

  // "Iniciar campaña" en Contactos pide cambiar a la solapa Campañas por
  // `CampaignState.setActiveTab('campanas')` (ContactsTab.tsx). Ahora eso es
  // navegar a la página. Los contactos elegidos viajan igual que antes: quedan en
  // `CampaignState`, que vive en memoria mientras no se recargue la pestaña.
  useEffect(() => {
    return CampaignState.subscribeToTab((tab) => {
      const destino = RUTA_POR_SOLAPA[tab]
      if (!destino || destino === seccion) return
      router.push(`/${rol}/difusion/${destino}`)
    })
  }, [rol, seccion, router, pathname])

  let contenido
  switch (seccion) {
    case "contactos":
      contenido = <ContactsTab instance={instance} hideActions={hideActions} />
      break
    case "plantillas":
      contenido = <TemplatesTab instance={instance} />
      break
    case "campanas":
      contenido = <CampaignsTab instance={instance} />
      break
    case "configuracion-ia":
      contenido = <AiSettingsTab instance={instance} />
      break
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-background">
      <div className="border-b px-4 md:px-6 py-2 bg-background flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-muted-foreground px-1">{TITULOS[seccion]}</span>
        <ConnectionIndicator instanceId={instance.id} initialStatus={instance.status} />
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">{contenido}</div>
    </div>
  )
}
