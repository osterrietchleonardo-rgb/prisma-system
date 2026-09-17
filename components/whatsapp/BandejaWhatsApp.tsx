"use client"

import dynamic from "next/dynamic"
import { ConnectionIndicator } from "./ConnectionIndicator"

/**
 * La bandeja de WhatsApp: solo el chat.
 *
 * Antes esta pantalla tenía solapas (Plantillas, Contactos, Campañas,
 * Configuración IA). Desde el 12/9/2026 esas son páginas del grupo «Difusión»
 * del menú; acá queda la franja de arriba con el estado de la conexión y el chat.
 */

const ChatInterface = dynamic(
  () => import("./ChatInterface").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-accent/20" />
          <p className="text-muted-foreground text-sm">Cargando chat...</p>
        </div>
      </div>
    ),
  },
)

interface BandejaWhatsAppProps {
  instance: any
  /** Cómo se llama la franja de arriba: "Chat" para el director, "Bandeja" para el asesor. */
  titulo: string
  /** El asesor no filtra por asesor (solo ve lo suyo). */
  hideAgentFilter?: boolean
}

export function BandejaWhatsApp({ instance, titulo, hideAgentFilter = false }: BandejaWhatsAppProps) {
  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-background">
      <div className="border-b px-4 md:px-6 py-2 bg-background flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-muted-foreground px-1">💬 {titulo}</span>
        <ConnectionIndicator instanceId={instance.id} initialStatus={instance.status} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatInterface instance={instance} hideAgentFilter={hideAgentFilter} />
      </div>
    </div>
  )
}
