"use client"
import { useEffect, useState } from "react"

export default function BloqueadosPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState("")

  useEffect(() => {
    const p = new URLSearchParams()
    if (tipo) p.set("tipo", tipo)
    fetch(`/api/admin-vakdor/bloqueados?${p}`)
      .then(r => r.json())
      .then(d => { setItems(d.data || []); setLoading(false) })
  }, [tipo])

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Emails Bloqueados</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
          Usuarios eliminados cuyo email no puede registrarse nuevamente
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <select value={tipo} onChange={e => setTipo(e.target.value)}
          style={{ padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none" }}>
          <option value="">Todos</option>
          <option value="director">Directores</option>
          <option value="asesor">Asesores</option>
        </select>
      </div>

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Email", "Tipo", "Razón", "Bloqueado el"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Sin emails bloqueados</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "10px 16px", color: "#fff", fontSize: 13 }}>{item.email}</td>
                <td style={{ padding: "10px 16px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 20, background: "rgba(99,102,241,0.15)", color: "#a5b4fc", fontSize: 11 }}>
                    {item.tipo_entidad}
                  </span>
                </td>
                <td style={{ padding: "10px 16px", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{item.razon || "–"}</td>
                <td style={{ padding: "10px 16px", color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                  {new Date(item.bloqueado_at).toLocaleDateString("es-AR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
