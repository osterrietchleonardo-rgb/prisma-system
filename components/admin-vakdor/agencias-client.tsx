"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

interface Agency {
  id: string
  name: string
  estado: string
  email: string
  invite_code: string | null
  directores: Array<{ full_name: string; estado: string }>
  asesores: Array<{ full_name: string; estado: string }>
  creditos: { total: number; usado: number; disponible: number } | null
  propiedades_tokko: number
  pago_mes_actual: number | null
  created_at: string
}

const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  activo: { label: "Activo", bg: "rgba(16,185,129,0.15)", color: "#34d399" },
  pausado: { label: "Pausado", bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  eliminado: { label: "Eliminado", bg: "rgba(239,68,68,0.15)", color: "#f87171" },
}

export default function AgenciasClient() {
  const router = useRouter()
  const [agencias, setAgencias] = useState<Agency[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [estado, setEstado] = useState("")
  const [page, setPage] = useState(1)

  const fetchAgencias = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), perPage: "20" })
    if (q) params.set("q", q)
    if (estado) params.set("estado", estado)
    const res = await fetch(`/api/admin-vakdor/agencias?${params}`)
    const data = await res.json()
    setAgencias(data.data || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [q, estado, page])

  useEffect(() => { fetchAgencias() }, [fetchAgencias])

  function estadoBadge(e: string) {
    const s = ESTADO_BADGE[e] || ESTADO_BADGE.activo
    return (
      <span style={{ padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
        {s.label}
      </span>
    )
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Agencias</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
          {total} agencias registradas
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }}
          placeholder="Buscar agencia..."
          style={{
            flex: 1, padding: "9px 14px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, color: "#fff", fontSize: 13, outline: "none"
          }}
        />
        <select
          value={estado}
          onChange={e => { setEstado(e.target.value); setPage(1) }}
          style={{
            padding: "9px 14px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, color: "#fff", fontSize: 13, outline: "none"
          }}
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="pausado">Pausados</option>
          <option value="eliminado">Eliminados</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Agencia", "Estado", "Usuarios", "Créditos", "Propiedades", "Pago mes", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</td></tr>
            ) : agencias.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Sin resultados</td></tr>
            ) : agencias.map(a => (
              <tr
                key={a.id}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                onClick={() => router.push(`/admin-vakdor/agencias/${a.id}`)}
              >
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{a.email}</div>
                  {a.invite_code && (
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>
                      Código: {a.invite_code}
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px 16px" }}>{estadoBadge(a.estado)}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                    {a.directores.length}D · {a.asesores.length}A
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ color: a.creditos && a.creditos.disponible < 10 ? "#f87171" : "rgba(255,255,255,0.7)", fontSize: 13 }}>
                    {a.creditos ? `${a.creditos.total}` : "–"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                  {a.propiedades_tokko.toLocaleString()}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {a.pago_mes_actual ? (
                    <span style={{ color: "#34d399", fontSize: 13 }}>${Number(a.pago_mes_actual).toLocaleString()}</span>
                  ) : (
                    <span style={{ color: "#f87171", fontSize: 12 }}>Sin pago</span>
                  )}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ color: "#a5b4fc", fontSize: 12 }}>Ver →</span>
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
