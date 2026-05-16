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
      width: "100%",
      maxWidth: 420,
      padding: "48px 40px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      backdropFilter: "blur(12px)",
    }}>
      {/* Logo / Brand */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          width: 52, height: 52,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          borderRadius: 14,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, marginBottom: 16,
          boxShadow: "0 0 30px rgba(99,102,241,0.4)",
        }}>
          ⬡
        </div>
        <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0 }}>
          Panel Administrativo
        </h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "6px 0 0" }}>
          Acceso restringido — PRISMA System
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              width: "100%", padding: "12px 14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, color: "#fff", fontSize: 14,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: "100%", padding: "12px 14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, color: "#fff", fontSize: 14,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: "10px 14px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8, color: "#fca5a5", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 8, padding: "13px",
            background: loading
              ? "rgba(99,102,241,0.5)"
              : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            border: "none", borderRadius: 8,
            color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: loading ? "none" : "0 4px 20px rgba(99,102,241,0.4)",
          }}
        >
          {loading ? "Verificando..." : "Ingresar al panel"}
        </button>
      </form>

      <p style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 32, marginBottom: 0 }}>
        Esta página no está indexada por motores de búsqueda
      </p>
    </div>
  )
}
