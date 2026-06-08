"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

interface Conversation {
  id: string
  agency_id: string
  agency_name: string
  contact_name: string | null
  contact_phone: string | null
  status: string
  bot_active: boolean
  unread_count: number
  pipeline_stage: string | null
  etiquetas: string[]
  agent_name: string | null
  last_message_at: string | null
  updated_at: string | null
}

interface AgencyOption {
  id: string
  name: string
}

const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: "Activo", bg: "rgba(16,185,129,0.15)", color: "#34d399" },
  closed: { label: "Cerrado", bg: "rgba(113,113,122,0.15)", color: "#a1a1aa" },
  pending: { label: "Pendiente", bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—"
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length >= 11) return `+${cleaned}`
  return phone
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—"
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "ahora"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

const PER_PAGE = 25

export default function BandejasClient() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [agencies, setAgencies] = useState<AgencyOption[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [agencyId, setAgencyId] = useState("")
  const [estado, setEstado] = useState("")
  const [page, setPage] = useState(1)

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) })
    if (q) params.set("q", q)
    if (agencyId) params.set("agency_id", agencyId)
    if (estado) params.set("estado", estado)
    const res = await fetch(`/api/admin-vakdor/bandejas?${params}`)
    const data = await res.json()
    setConversations(data.data || [])
    setTotal(data.total || 0)
    if (data.agencies) setAgencies(data.agencies)
    setLoading(false)
  }, [q, agencyId, estado, page])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  function estadoBadge(e: string) {
    const s = ESTADO_BADGE[e] || ESTADO_BADGE.pending
    return (
      <span style={{ padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
        {s.label}
      </span>
    )
  }

  const inputStyle: React.CSSProperties = {
    padding: "9px 14px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    outline: "none",
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Bandejas de entrada</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
          {total} conversaciones de WhatsApp en todas las agencias
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1) }}
          placeholder="Buscar contacto o teléfono..."
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <select
          value={agencyId}
          onChange={(e) => { setAgencyId(e.target.value); setPage(1) }}
          style={inputStyle}
        >
          <option value="">Todas las agencias</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => { setEstado(e.target.value); setPage(1) }}
          style={inputStyle}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="pending">Pendientes</option>
          <option value="closed">Cerrados</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Contacto", "Agencia", "Estado", "Agente", "Último mensaje", ""].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</td></tr>
            ) : conversations.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Sin conversaciones</td></tr>
            ) : conversations.map((c) => (
              <tr
                key={c.id}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => router.push(`/admin-vakdor/bandejas/${c.id}`)}
              >
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    {c.contact_name || "Sin nombre"}
                    {c.bot_active && <span title="Chatbot activo" style={{ fontSize: 11 }}>🤖</span>}
                    {c.unread_count > 0 && (
                      <span style={{ background: "#6366f1", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px" }}>
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{formatPhone(c.contact_phone)}</div>
                </td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{c.agency_name}</td>
                <td style={{ padding: "12px 16px" }}>{estadoBadge(c.status)}</td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  {c.agent_name || <span style={{ fontStyle: "italic", color: "rgba(255,255,255,0.3)" }}>Sin asignar</span>}
                </td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{timeAgo(c.last_message_at)}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ color: "#a5b4fc", fontSize: 12 }}>Ver chat →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PER_PAGE && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            ← Anterior
          </button>
          <span style={{ padding: "7px 14px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {page} / {Math.ceil(total / PER_PAGE)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / PER_PAGE)}
            style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
