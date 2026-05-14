"use client"

import { useState, useEffect } from "react"
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div className="flex-1 bg-background" />

  return (
    <div style={{color:'white', padding:'20px', backgroundColor: 'blue', height: '100%'}}>CHATINTERFACE OK</div>
  )
}
