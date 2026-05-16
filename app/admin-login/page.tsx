"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminVakdorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/admin-vakdor/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.mensaje || "Credenciales inválidas")
        return
      }
      router.push("/admin-vakdor/dashboard")
    } catch {
      setError("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070B14",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        padding: "48px 40px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        backdropFilter: "blur(12px)",
      }}>
        {/* Brand — equal to BrandLogo component */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 36, gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: "50%",
              overflow: "hidden",
              background: "#131A2D",
              border: "1px solid rgba(194,120,60,0.3)",
              padding: 4,
              flexShrink: 0,
              boxShadow: "0 4px 16px rgba(194,120,60,0.2)",
            }}>
              <img src="/logo-icon.png" alt="PRISMA IA" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{
                fontSize: 22, fontWeight: 700,
                background: "linear-gradient(90deg, #c2783c, #e29e6d, #c2783c)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.04em",
                lineHeight: 1,
                textTransform: "uppercase",
              }}>PRISMA IA</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>
                REAL ESTATE ✦ SISTEMA INTELIGENTE
              </span>
            </div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: 0 }}>
            Acceso restringido — Panel Admin
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email"
              style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const }}
            />
          </div>
          <div>
            <label style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Contraseña
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password"
              style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const }}
            />
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#fca5a5", fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            marginTop: 8, padding: "13px",
            background: loading ? "rgba(99,102,241,0.5)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: loading ? "none" : "0 4px 20px rgba(99,102,241,0.4)",
          }}>
            {loading ? "Verificando..." : "Ingresar al panel"}
          </button>
        </form>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 32, marginBottom: 0 }}>
          Esta página no está indexada por motores de búsqueda
        </p>
      </div>
    </div>
  )
}
