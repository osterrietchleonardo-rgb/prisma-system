"use client"

import { useState } from "react"
import type { WAConversation, WhatsAppInstance } from "@/types/whatsapp"
import { ConversationsList } from "./ConversationsList"
import { ActiveChat } from "./ActiveChat"
import { EmptyState } from "./EmptyState"
import { MessageSquare } from "lucide-react"

interface ChatInterfaceProps {
  instance: WhatsAppInstance
}

export default function ChatInterface({ instance }: ChatInterfaceProps) {
  const [activeConversation, setActiveConversation] =
    useState<WAConversation | null>(null)

  return (
    <div className="flex flex-row h-[calc(100vh-64px)]">
      {/* Desktop: List always visible / Mobile: visible only when no active chat */}
      <div
        className={`w-full md:w-[300px] md:flex-shrink-0 md:border-r md:block ${
          activeConversation ? "hidden" : "block"
        }`}
      >
        <ConversationsList
          instance={instance}
          activeId={activeConversation?.id ?? null}
          onSelect={(conv) => setActiveConversation(conv)}
        />
      </div>

      {/* Desktop: Chat always visible / Mobile: visible only when chat active */}
      <div
        className={`flex-1 flex-col min-w-0 ${
          activeConversation ? "flex" : "hidden md:flex"
        }`}
      >
        {activeConversation ? (
          <ActiveChat
            conversation={activeConversation}
            instance={instance}
            onBack={() => setActiveConversation(null)}
            onDeleteChat={() => setActiveConversation(null)}
          />
        ) : (
          <EmptyState 
            icon={MessageSquare} 
            title="Seleccioná una conversación" 
            subtitle="Elegí un contacto de la lista para ver los mensajes e interactuar." 
          />
        )}
      </div>
    </div>
  )
}
