"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

const ESTADOS = ["pendiente", "en_proceso", "en_revision", "resuelta", "pospuesta"]
const ESTADO_BADGE: Record<string, { bg: string; color: string }> = {
  pendiente: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  en_proceso: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  en_revision: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  resuelta: { bg: "rgba(16,185,129,0.15)", color: "#34d399" },
  pospuesta: { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" },
}

export default function SugerenciaDetalleClient() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState("")
  const [respuesta, setRespuesta] = useState("")
  const [notaCliente, setNotaCliente] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState("")

  useEffect(() => {
    fetch(`/api/admin-vakdor/sugerencias/${id}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setEstado(d.estado || "pendiente")
        setRespuesta(d.respuesta || "")
        setNotaCliente(d.nota_cliente || "")
        setLoading(false)
      })
  }, [id])

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/admin-vakdor/sugerencias/${id}/estado`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado, respuesta, nota_cliente: notaCliente }),
    })
    if (res.ok) setMsg("Guardado correctamente")
    else { const d = await res.json(); setMsg(d.error || "Error") }
    setSaving(false)
  }

  async function eliminar() {
    if (!confirm("¿Está seguro de que desea eliminar este reporte/sugerencia de forma permanente?")) return
    setDeleting(true)
    const res = await fetch(`/api/admin-vakdor/sugerencias/${id}`, {
      method: "DELETE",
    })
    if (res.ok) {
      router.push("/admin-vakdor/sugerencias")
    } else {
      const d = await res.json()
      setMsg(d.error || "Error al eliminar")
      setDeleting(false)
    }
  }

  if (loading) return <div style={{ padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando...</div>
  if (!data) return <div style={{ padding: 40, color: "#f87171" }}>No encontrado</div>

  const badge = ESTADO_BADGE[estado] || ESTADO_BADGE.pendiente
  const inputStyle = { width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" as const }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 720 }}>
      <button onClick={() => router.back()} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer", marginBottom: 20 }}>
        ← Volver
      </button>

      {msg && (
        <div onClick={() => setMsg("")} style={{ padding: "10px 14px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "#a5b4fc", fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
          {msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 22, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <span style={{ padding: "2px 9px", borderRadius: 20, background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600 }}>{estado}</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginLeft: 10 }}>[{data.type}]</span>
          </div>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            {new Date(data.created_at).toLocaleString("es-AR")}
          </span>
        </div>

        {data.titulo && (
          <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 600, margin: "0 0 10px" }}>{data.titulo}</h2>
        )}

        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{data.content}</p>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Usuario</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{(data.profiles as any)?.full_name || data.email || "–"}</div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Agencia</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{(data.agencies as any)?.name || "–"}</div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Rol</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{(data.profiles as any)?.role || "–"}</div>
          </div>
        </div>

        {/* Evidence images */}
        {data.evidence_urls && data.evidence_urls.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 10 }}>EVIDENCIA VISUAL</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {(data.evidence_urls as string[]).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", transition: "transform 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.03)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Evidencia ${i + 1}`} style={{ width: 160, height: 120, objectFit: "cover", display: "block" }} />
                </a>
              ))}
            </div>
          </div>
        )}


      </div>

      {/* Management */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 22 }}>
        <h3 style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 16px" }}>Gestión</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 6 }}>Estado</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ESTADOS.map(e => {
              const s = ESTADO_BADGE[e]
              return (
                <button key={e} onClick={() => setEstado(e)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${estado === e ? s.color : "rgba(255,255,255,0.12)"}`, background: estado === e ? s.bg : "transparent", color: estado === e ? s.color : "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontWeight: estado === e ? 600 : 400 }}>
                  {e}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 6 }}>Nota para el cliente (opcional)</label>
          <textarea
            value={notaCliente}
            onChange={e => setNotaCliente(e.target.value)}
            rows={3}
            placeholder="Escribí aquí lo que verá el cliente..."
            style={{ ...inputStyle, resize: "vertical" as const, marginBottom: 16 }}
          />

          <label style={{ display: "block", color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 6 }}>Nota interna (opcional)</label>
          <textarea
            value={respuesta}
            onChange={e => setRespuesta(e.target.value)}
            rows={3}
            placeholder="Agregar nota o respuesta interna..."
            style={{ ...inputStyle, resize: "vertical" as const }}
          />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={save} disabled={saving || deleting}
            style={{ padding: "10px 24px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 600, cursor: (saving || deleting) ? "not-allowed" : "pointer", opacity: (saving || deleting) ? 0.7 : 1 }}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          
          <button onClick={eliminar} disabled={saving || deleting}
            style={{ padding: "10px 24px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#f87171", fontSize: 14, fontWeight: 600, cursor: (saving || deleting) ? "not-allowed" : "pointer", opacity: (saving || deleting) ? 0.7 : 1, marginLeft: "auto" }}>
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  )
}
