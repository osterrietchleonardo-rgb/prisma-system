"use client"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

const NAV = [
  { href: "/admin-vakdor/dashboard", icon: "⊞", label: "Dashboard" },
  { href: "/admin-vakdor/finanzas", icon: "💰", label: "Finanzas" },
  { href: "/admin-vakdor/metricas", icon: "◫", label: "Métricas" },
  { href: "/admin-vakdor/agencias", icon: "🏢", label: "Agencias" },
  { href: "/admin-vakdor/bandejas", icon: "📥", label: "Bandejas de entrada" },
  { href: "/admin-vakdor/invitaciones", icon: "🔑", label: "Invitaciones" },
  { href: "/admin-vakdor/sugerencias", icon: "💬", label: "Sugerencias" },
  { href: "/admin-vakdor/bloqueados", icon: "🚫", label: "Bloqueados" },
]

export default function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await fetch("/api/admin-vakdor/logout", { method: "POST" })
    router.push("/admin-login")
  }

  return (
    <aside style={{
      width: 220,
      minHeight: "100vh",
      background: "rgba(255,255,255,0.025)",
      borderRight: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      flexDirection: "column",
      padding: "20px 0",
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: "18px 16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            borderRadius: "50%",
            overflow: "hidden",
            background: "#131A2D",
            border: "1px solid rgba(194,120,60,0.3)",
            padding: 3,
            flexShrink: 0,
          }}>
            <img src="/logo-icon.png" alt="PRISMA IA" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontSize: 15, fontWeight: 700,
              background: "linear-gradient(90deg, #c2783c, #e29e6d, #c2783c)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              textTransform: "uppercase",
            }}>PRISMA IA</span>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
              REAL ESTATE ✦ SISTEMA
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 8,
                textDecoration: "none",
                background: active ? "rgba(99,102,241,0.15)" : "transparent",
                color: active ? "#a5b4fc" : "rgba(255,255,255,0.5)",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                transition: "all 0.15s",
                borderLeft: active ? "2px solid #6366f1" : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </a>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "16px 16px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {adminEmail}
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 7,
            color: "#fca5a5",
            fontSize: 12,
            cursor: loggingOut ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {loggingOut ? "Saliendo..." : "Cerrar sesión"}
        </button>
      </div>
    </aside>
  )
}
