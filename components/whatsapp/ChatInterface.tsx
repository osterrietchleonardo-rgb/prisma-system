"use client"

import { useState, useEffect } from "react"
import type { WAConversation, WhatsAppInstance } from "@/types/whatsapp"
import { ConversationsList } from "./ConversationsList"
import { ActiveChat } from "./ActiveChat"
import { EmptyState } from "./EmptyState"
import { MessageSquare } from "lucide-react"
import ErrorBoundary from "./ErrorBoundary"

interface ChatInterfaceProps {
  instance: WhatsAppInstance
}

export default function ChatInterface({ instance }: ChatInterfaceProps) {
  const [activeConversation, setActiveConversation] =
    useState<WAConversation | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div className="flex-1 bg-background" />

  if (!instance) return <div className="p-4 text-center text-muted-foreground">Instancia no válida</div>

  return (
    <ErrorBoundary>
      <div className="flex flex-row h-[calc(100vh-64px)] h-[calc(100dvh-64px)] overflow-hidden">
      {/* List Container */}
      <div
        className={`w-full md:w-[320px] lg:w-[380px] md:flex-shrink-0 md:border-r md:block ${
          activeConversation ? "hidden" : "block"
        }`}
      >
        <ConversationsList
          instance={instance}
          activeId={activeConversation?.id ?? null}
          onSelect={(conv) => setActiveConversation(conv)}
        />
      </div>

      {/* Chat Container */}
      <div
        className={`flex-1 flex-col min-w-0 ${
          activeConversation ? "flex" : "hidden md:flex"
        }`}
      >
        {activeConversation ? (
          <ActiveChat
            key={activeConversation.id}
            conversation={activeConversation}
            instance={instance}
            onBack={() => setActiveConversation(null)}
            onDeleteChat={() => setActiveConversation(null)}
          />
        ) : (
          <div className="flex-1 hidden md:block">
            <EmptyState 
              icon={MessageSquare} 
              title="Selecciona una conversación" 
              subtitle="Elegí un contacto de la lista para ver los mensajes e interactuar." 
            />
          </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  )
}
