"use client"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

const NAV = [
  { href: "/admin-vakdor/dashboard", icon: "⊞", label: "Dashboard" },
  { href: "/admin-vakdor/agencias", icon: "🏢", label: "Agencias" },
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
    router.push("/admin-vakdor/login")
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
      <div style={{ padding: "0 20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, boxShadow: "0 0 20px rgba(99,102,241,0.3)"
          }}>
            ⬡
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>PRISMA</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>Sistema</div>
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
