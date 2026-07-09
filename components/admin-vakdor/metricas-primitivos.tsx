"use client"
import type { ReactNode } from "react"

// Semáforo: colores semánticos (semáforo real). El resto de la UI usa el cobre de marca.
const COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626", gris: "#6b7280" }
const COBRE = "#B87333"

export function Semaforo({ estado, size = 10 }: { estado: string; size?: number }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: COLOR[estado] ?? COLOR.gris }} />
  )
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderTop: "2px solid rgba(184,115,51,0.45)",
      borderRadius: 10,
      padding: "14px 16px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(184,115,51,0.75)", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function PanelExperto({
  titulo, semaforo, resumen, right, children,
}: { titulo: string; semaforo: string; resumen?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{
      marginBottom: 16,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderLeft: `3px solid ${COBRE}`,
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Semaforo estado={semaforo} size={12} />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0, letterSpacing: "-0.01em" }}>{titulo}</h3>
        </div>
        {right}
      </div>
      {children}
      {resumen && (
        <p style={{
          fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6,
          marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", fontStyle: "italic",
        }}>{resumen}</p>
      )}
    </section>
  )
}

export function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>{children}</div>
}
