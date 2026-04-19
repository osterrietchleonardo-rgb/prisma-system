// =============================================
// WhatsApp Module — Types
// Corresponde al schema de P1 (Supabase)
// =============================================

// --- Enums (union types) ---

export type InstanceStatus = 'connected' | 'disconnected' | 'pending'

export type ConversationStatus = 'active' | 'closed' | 'pending'

export type MessageRole = 'bot' | 'human' | 'lead' | 'internal'

export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED'

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

// --- Interfaces ---

export interface WhatsAppInstance {
  id: string
  agency_id: string
  instance_name: string
  evo_instance_name: string | null
  integration_type: 'evolution' | 'meta_direct'
  token: string
  phone_number_id: string
  business_id: string
  status: InstanceStatus
  phone_display: string | null
  created_at: string
  updated_at: string
}

export interface WAConversation {
  id: string
  agency_id: string
  instance_id: string | null
  contact_phone: string
  contact_name: string | null
  last_message_at: string
  last_inbound_at: string | null
  bot_active: boolean
  status: ConversationStatus
  score: number
  unread_count: number
  etiquetas: string[]
  created_at: string
}

export interface WAMessage {
  id: string
  conversation_id: string
  agency_id: string
  content: string
  role: MessageRole
  message_type: string
  wamid: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface WATemplate {
  id: string
  agency_id: string
  template_name: string
  status: TemplateStatus
  category: TemplateCategory | null
  language: string
  components: unknown[]
  rejection_reason: string | null
  meta_template_id: string | null
  created_at: string
  updated_at: string
}

// --- Action Response Types ---

export interface WhatsAppActionResult {
  success: boolean
  error?: string
}

export interface ConnectWhatsAppInput {
  token: string
  phone_number_id: string
  business_id: string
}

export interface InstanceStatusResult {
  state: string
}

export interface CreateTemplateInput {
  template_name: string
  category: TemplateCategory
  language: string
  header?: string
  body: string
  footer?: string
  buttons?: unknown[]
}
