"use client"
import { useEffect, useState, useCallback } from "react"
import { generateDirectorInvite, deleteDirectorInvite } from "@/lib/actions/admin"
import { Trash2 } from "lucide-react"

interface Invite {
  id: string
  code: string
  is_used: boolean
  used_at: string | null
  created_at: string
  agency_id: string | null
  used_by_email: string | null
}

export default function InvitacionesClient() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [newInviteCode, setNewInviteCode] = useState<string | null>(null)

  const fetchInvites = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), perPage: "20" })
    const res = await fetch(`/api/admin-vakdor/invitaciones?${params}`)
    const data = await res.json()
    setInvites(data.data || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page])

  useEffect(() => { fetchInvites() }, [fetchInvites])

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Invitaciones a Directores</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
            {total} códigos generados
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <button
            disabled={generatingInvite}
            onClick={async () => {
              setGeneratingInvite(true)
              setNewInviteCode(null)
              const res = await generateDirectorInvite()
              if (res.success && res.code) {
                setNewInviteCode(res.code)
                fetchInvites()
              } else {
                alert(res.error || "Error al generar código")
              }
              setGeneratingInvite(false)
            }}
            style={{
              padding: "8px 16px",
              background: "#6366f1",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: generatingInvite ? "not-allowed" : "pointer",
              opacity: generatingInvite ? 0.7 : 1
            }}
          >
            {generatingInvite ? "Generando..." : "+ Generar Nuevo Código"}
          </button>
          {newInviteCode && (
            <div style={{
              background: "rgba(16,185,129,0.15)",
              color: "#34d399",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid rgba(52,211,153,0.3)"
            }}>
              <span>Código generado: {newInviteCode}</span>
              <button 
                onClick={() => navigator.clipboard.writeText(newInviteCode)}
                style={{ background: "transparent", border: "none", color: "#34d399", cursor: "pointer", textDecoration: "underline", fontSize: 12 }}
              >
                Copiar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Código", "Estado", "Fecha Creación", "Fecha Uso", "Email Usuario", "Acciones"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</td></tr>
            ) : invites.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No hay invitaciones generadas</td></tr>
            ) : invites.map(i => (
              <tr
                key={i.id}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <td style={{ padding: "12px 16px", color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>
                  {i.code}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {i.is_used ? (
                    <span style={{ padding: "2px 8px", borderRadius: 20, background: "rgba(16,185,129,0.15)", color: "#34d399", fontSize: 11, fontWeight: 600 }}>Usado</span>
                  ) : (
                    <span style={{ padding: "2px 8px", borderRadius: 20, background: "rgba(245,158,11,0.15)", color: "#fbbf24", fontSize: 11, fontWeight: 600 }}>Pendiente</span>
                  )}
                </td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                  {new Date(i.created_at).toLocaleString("es-AR")}
                </td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                  {i.used_at ? new Date(i.used_at).toLocaleString("es-AR") : "—"}
                </td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                  {i.used_by_email || "—"}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <button 
                    onClick={async () => {
                      if (!confirm(`¿Estás seguro que deseas eliminar el código ${i.code}?`)) return
                      const res = await deleteDirectorInvite(i.id)
                      if (res.success) {
                        fetchInvites()
                      } else {
                        alert(res.error || "Error al eliminar código")
                      }
                    }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(239,68,68,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}
                    title="Eliminar código"
                  >
                    <Trash2 className="w-4 h-4 hover:text-red-500 transition-colors" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            ← Anterior
          </button>
          <span style={{ padding: "7px 14px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {page} / {Math.ceil(total / 20)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
