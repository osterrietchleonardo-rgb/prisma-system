"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

const ESTADOS = ["", "pendiente", "en_revision", "resuelta", "descartada"]
const CATEGORIAS = ["", "sugerencia", "error", "consulta", "otro"]

const ESTADO_BADGE: Record<string, { bg: string; color: string }> = {
  pendiente: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  en_revision: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  resuelta: { bg: "rgba(16,185,129,0.15)", color: "#34d399" },
  descartada: { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" },
}

export default function SugerenciasClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    estado: "", categoria: "", q: "",
    agencia_id: searchParams.get("agencia_id") || "",
    page: 1,
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filtros.estado) p.set("estado", filtros.estado)
    if (filtros.categoria) p.set("categoria", filtros.categoria)
    if (filtros.q) p.set("q", filtros.q)
    if (filtros.agencia_id) p.set("agencia_id", filtros.agencia_id)
    p.set("page", String(filtros.page))
    p.set("perPage", "25")
    const res = await fetch(`/api/admin-vakdor/sugerencias?${p}`)
    const data = await res.json()
    setItems(data.data || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [filtros])

  useEffect(() => { fetchData() }, [fetchData])

  function updateFiltro(key: string, value: string) {
    setFiltros(f => ({ ...f, [key]: value, page: 1 }))
  }

  function badge(estado: string) {
    const s = ESTADO_BADGE[estado] || ESTADO_BADGE.pendiente
    return (
      <span style={{ padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
        {estado}
      </span>
    )
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Sugerencias & Reportes</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>{total} registradas</p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <input value={filtros.q} onChange={e => updateFiltro("q", e.target.value)}
          placeholder="Buscar en contenido..."
          style={{ flex: 1, minWidth: 200, padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none" }} />
        {[{ key: "estado", opts: ESTADOS, label: "Estado" }, { key: "categoria", opts: CATEGORIAS, label: "Categoría" }].map(({ key, opts, label }) => (
          <select key={key} value={(filtros as any)[key]} onChange={e => updateFiltro(key, e.target.value)}
            style={{ padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none" }}>
            <option value="">{label}</option>
            {opts.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {filtros.agencia_id && (
          <button onClick={() => updateFiltro("agencia_id", "")}
            style={{ padding: "9px 12px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "#a5b4fc", fontSize: 12, cursor: "pointer" }}>
            Filtrado por agencia · ✕
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Tipo", "Contenido", "Agencia", "Estado", "Fecha", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Sin resultados</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                onClick={() => router.push(`/admin-vakdor/sugerencias/${item.id}`)}>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ color: "#a5b4fc", fontSize: 12 }}>{item.type}</span>
                </td>
                <td style={{ padding: "10px 14px", maxWidth: 320 }}>
                  <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.content?.substring(0, 80) || "–"}
                  </div>
                </td>
                <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                  {(item.agencies as any)?.name || "–"}
                </td>
                <td style={{ padding: "10px 14px" }}>{badge(item.estado || "pendiente")}</td>
                <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
                  {new Date(item.created_at).toLocaleDateString("es-AR")}
                </td>
                <td style={{ padding: "10px 14px", color: "#a5b4fc", fontSize: 12 }}>Ver →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 25 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
          <button onClick={() => setFiltros(f => ({ ...f, page: Math.max(1, f.page - 1) }))} disabled={filtros.page === 1}
            style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}>
            ← Anterior
          </button>
          <span style={{ padding: "7px 12px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {filtros.page} / {Math.ceil(total / 25)}
          </span>
          <button onClick={() => setFiltros(f => ({ ...f, page: f.page + 1 }))} disabled={filtros.page >= Math.ceil(total / 25)}
            style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
