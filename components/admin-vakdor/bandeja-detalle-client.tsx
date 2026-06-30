"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

interface Message {
  id: string
  content: string
  role: string // bot | human | lead | internal
  message_type: string
  metadata: Record<string, any> | null
  created_at: string
}

interface ConversationDetail {
  id: string
  agency_name: string
  agent_name: string | null
  contact_name: string | null
  contact_phone: string | null
  status: string
  bot_active: boolean
  pipeline_stage: string | null
  etiquetas: string[]
  score: number
  last_message_at: string | null
  created_at: string
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—"
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length >= 11) return `+${cleaned}`
  return phone
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// El "lead" (cliente) va a la izquierda; bot/human/internal (la agencia) a la derecha
function isOutgoing(role: string): boolean {
  return role !== "lead"
}

function roleLabel(role: string): string {
  switch (role) {
    case "bot": return "Bot"
    case "human": return "Asesor"
    case "internal": return "Nota interna"
    case "lead": return "Cliente"
    default: return role
  }
}

const MEDIA_TYPES = ["image", "video", "audio", "document"]

// Resuelve la URL del adjunto: prioriza metadata.media_url; si no, y el tipo es media,
// usa el content (algunos mensajes guardan la URL directo en content).
function getMediaUrl(m: Message): string | null {
  const fromMeta = m.metadata?.media_url
  if (typeof fromMeta === "string" && fromMeta) return fromMeta
  if (MEDIA_TYPES.includes(m.message_type) && /^https?:\/\//.test(m.content || "")) return m.content
  return null
}

// Convierte URLs sueltas dentro del texto en enlaces clicables (p.ej. "Ficha completa: https://...")
function renderTextWithLinks(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#a5b4fc", textDecoration: "underline", wordBreak: "break-all" }}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export default function BandejaDetalleClient({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const [conv, setConv] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin-vakdor/bandejas/${conversationId}`)
    if (res.status === 404) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const data = await res.json()
    setConv(data.conversation)
    setMessages(data.messages || [])
    setLoading(false)
  }, [conversationId])

  // Refresco automático silencioso: trae solo los mensajes nuevos (sin parpadeo ni
  // perder el scroll). No toca el estado de carga ni borra lo ya mostrado.
  const silentRefresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin-vakdor/bandejas/${conversationId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.conversation) setConv(data.conversation)
      if (Array.isArray(data.messages)) {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id))
          const nuevos = (data.messages as Message[]).filter((m) => !existing.has(m.id))
          return nuevos.length ? [...prev, ...nuevos] : prev
        })
      }
    } catch {
      /* error transitorio de red: lo ignoramos y reintentamos en el próximo ciclo */
    }
  }, [conversationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Polling cada 5 s mientras la conversación está abierta
  useEffect(() => {
    const id = setInterval(silentRefresh, 5000)
    return () => clearInterval(id)
  }, [silentRefresh])

  if (loading) {
    return <div style={{ padding: 40, color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Cargando conversación...</div>
  }

  if (notFound || !conv) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <button onClick={() => router.push("/admin-vakdor/bandejas")} style={backBtnStyle}>← Volver a Bandejas</button>
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 24 }}>Conversación no encontrada.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", height: "100%", maxWidth: 980, margin: "0 auto" }}>
      {/* Header */}
      <button onClick={() => router.push("/admin-vakdor/bandejas")} style={backBtnStyle}>← Volver a Bandejas</button>

      <div style={{ marginTop: 16, marginBottom: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 19, fontWeight: 700, margin: 0 }}>
              {conv.contact_name || "Sin nombre"}
            </h1>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 4 }}>
              {formatPhone(conv.contact_phone)}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
            <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Agencia: </span>{conv.agency_name}</div>
            <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Agente: </span>{conv.agent_name || "Sin asignar"}</div>
            {conv.bot_active && <div style={{ color: "#34d399" }}>🤖 Chatbot activo</div>}
          </div>
        </div>
        {conv.etiquetas && conv.etiquetas.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {conv.etiquetas.map((tag, i) => (
              <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: "auto", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 40 }}>No hay mensajes en esta conversación.</div>
        ) : messages.map((m) => {
          const out = isOutgoing(m.role)
          const internal = m.role === "internal"
          const mediaUrl = getMediaUrl(m)
          // Evitamos repetir el texto si el content es exactamente la URL del adjunto
          const showText = m.content && m.content !== mediaUrl
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "72%",
                padding: "9px 13px",
                borderRadius: 14,
                background: internal
                  ? "rgba(245,158,11,0.12)"
                  : out
                    ? "rgba(99,102,241,0.18)"
                    : "rgba(255,255,255,0.07)",
                border: internal ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(255,255,255,0.06)",
                borderBottomRightRadius: out ? 4 : 14,
                borderBottomLeftRadius: out ? 14 : 4,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: internal ? "#fbbf24" : out ? "#a5b4fc" : "rgba(255,255,255,0.45)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {roleLabel(m.role)}
                </div>

                {/* Adjunto multimedia */}
                {mediaUrl && (
                  <div style={{ marginBottom: showText ? 8 : 4 }}>
                    {m.message_type === "image" ? (
                      <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={mediaUrl}
                          alt="Imagen"
                          style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 10, objectFit: "cover", display: "block", cursor: "pointer" }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                        />
                      </a>
                    ) : m.message_type === "video" ? (
                      <video src={mediaUrl} controls style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 10 }} />
                    ) : m.message_type === "audio" ? (
                      <audio src={mediaUrl} controls style={{ width: "100%" }} />
                    ) : (
                      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#a5b4fc", fontSize: 12, textDecoration: "underline" }}>
                        📎 Ver archivo adjunto
                      </a>
                    )}
                  </div>
                )}

                {showText && (
                  <div style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}>
                    {renderTextWithLinks(m.content)}
                  </div>
                )}

                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, textAlign: "right" }}>
                  {formatTime(m.created_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        Vista de solo lectura · {messages.length} mensajes
      </div>
    </div>
  )
}

const backBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  alignSelf: "flex-start",
}
