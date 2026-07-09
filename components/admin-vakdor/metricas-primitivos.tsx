"use client"
import type { ReactNode } from "react"

const COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626", gris: "#6b7280" }

export function Semaforo({ estado, size = 10 }: { estado: string; size?: number }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: COLOR[estado] ?? COLOR.gris }} />
  )
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "14px 16px", minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function PanelExperto({
  titulo, semaforo, resumen, right, children,
}: { titulo: string; semaforo: string; resumen?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Semaforo estado={semaforo} size={12} />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: 0, letterSpacing: "-0.01em" }}>{titulo}</h2>
        </div>
        {right}
      </div>
      {children}
      {resumen && (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginTop: 12, fontStyle: "italic" }}>{resumen}</p>
      )}
    </section>
  )
}

export function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>{children}</div>
}
