"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ESTADOS, type MarketingIdea, type EstadoIdea } from "@/lib/admin-vakdor/marketing/types"

const ACCENT = "#c2783c"

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 999,
      background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
      whiteSpace: "nowrap",
    }}>{children}</span>
  )
}

function Card({ idea, onMover }: { idea: MarketingIdea; onMover: (id: string, e: EstadoIdea) => void }) {
  const orden = ESTADOS.map((e) => e.key)
  const i = orden.indexOf(idea.estado)
  const prev = i > 0 ? orden[i - 1] : null
  const next = i < orden.length - 1 ? orden[i + 1] : null
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", idea.id)}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10, padding: 12, marginBottom: 10, cursor: "grab",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>
        {idea.titulo}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <Chip>{idea.fuente}</Chip>
        <Chip>{idea.formato}</Chip>
        {idea.angulo ? <Chip>{idea.angulo}</Chip> : null}
      </div>
      {idea.motivo ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginBottom: 8 }}>
          {idea.motivo}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button disabled={!prev} onClick={() => prev && onMover(idea.id, prev)}
          style={{ fontSize: 14, background: "none", border: "none", color: prev ? "#a5b4fc" : "rgba(255,255,255,0.15)", cursor: prev ? "pointer" : "default" }}>◀</button>
        <button disabled={!next} onClick={() => next && onMover(idea.id, next)}
          style={{ fontSize: 14, background: "none", border: "none", color: next ? "#a5b4fc" : "rgba(255,255,255,0.15)", cursor: next ? "pointer" : "default" }}>▶</button>
      </div>
    </div>
  )
}

export default function MarketingClient({ ideas }: { ideas: MarketingIdea[] }) {
  const router = useRouter()
  const [items, setItems] = useState<MarketingIdea[]>(ideas)
  const [dragId, setDragId] = useState<string | null>(null)

  const porEstado = (e: EstadoIdea) => items.filter((i) => i.estado === e)

  async function mover(id: string, estado: EstadoIdea) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, estado } : i)))
    const res = await fetch(`/api/admin-vakdor/marketing/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) { router.refresh() } // revertir con la verdad del server si falló
  }

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Marketing</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
            Pipeline de contenido del Agente IA de Marketing
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
        {ESTADOS.map((col) => {
          const cards = porEstado(col.key)
          const esRechazada = col.key === "rechazada"
          return (
            <div key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("text/plain")
                if (id) mover(id, col.key)
              }}
              style={{
              minWidth: 260, width: 260, flexShrink: 0,
              background: esRechazada ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.015)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 12,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: esRechazada ? "#fca5a5" : ACCENT, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {col.label}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{cards.length}</span>
              </div>
              {cards.map((idea) => <Card key={idea.id} idea={idea} onMover={mover} />)}
              {cards.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "16px 0" }}>—</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
