"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ESTADOS, type MarketingIdea, type EstadoIdea } from "@/lib/admin-vakdor/marketing/types"

const ACCENT = "#c2783c"

const inputStyle: React.CSSProperties = {
  padding: "9px 12px", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  color: "#fff", fontSize: 13, outline: "none",
}

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
      {idea.assets && idea.assets.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {idea.assets.map((a, idx) => (
            <button key={idx}
              onClick={async () => {
                const win = window.open("", "_blank") // abrir sincrónico para conservar el gesto
                try {
                  const res = await fetch(`/api/admin-vakdor/marketing/${idea.id}/asset?path=${encodeURIComponent(a.path)}`)
                  if (res.ok) {
                    const { url } = await res.json()
                    if (win) win.location.href = url
                    else window.open(url, "_blank")
                  } else {
                    if (win) win.close()
                    alert("No se pudo abrir el archivo.")
                  }
                } catch {
                  if (win) win.close()
                  alert("No se pudo abrir el archivo.")
                }
              }}
              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", cursor: "pointer" }}>
              ⬇ {a.tipo.toUpperCase()}{idea.assets.length > 1 ? ` ${idx + 1}` : ""}
            </button>
          ))}
        </div>
      ) : null}
      {idea.motivo ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginBottom: 8 }}>
          {idea.motivo}
        </div>
      ) : null}
      {idea.estado === "en_revision" ? <Reformular idea={idea} /> : null}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button disabled={!prev} onClick={() => prev && onMover(idea.id, prev)}
          style={{ fontSize: 14, background: "none", border: "none", color: prev ? "#a5b4fc" : "rgba(255,255,255,0.15)", cursor: prev ? "pointer" : "default" }}>◀</button>
        <button disabled={!next} onClick={() => next && onMover(idea.id, next)}
          style={{ fontSize: 14, background: "none", border: "none", color: next ? "#a5b4fc" : "rgba(255,255,255,0.15)", cursor: next ? "pointer" : "default" }}>▶</button>
      </div>
    </div>
  )
}

function Reformular({ idea }: { idea: MarketingIdea }) {
  const [comentario, setComentario] = useState("")
  const [contenido, setContenido] = useState(idea.contenido ?? "")
  const [cargando, setCargando] = useState(false)
  return (
    <div style={{ marginBottom: 8 }}>
      {contenido ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto", marginBottom: 6, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
          {contenido}
        </div>
      ) : null}
      <textarea value={comentario} onChange={(e) => setComentario(e.target.value)}
        placeholder="Comentario para reformular…" rows={2}
        style={{ width: "100%", fontSize: 11, padding: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", resize: "vertical" }} />
      <button disabled={cargando || !comentario.trim()}
        onClick={async () => {
          setCargando(true)
          try {
            const res = await fetch(`/api/admin-vakdor/marketing/${idea.id}/reformular`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ comentario: comentario.trim() }),
            })
            if (res.ok) {
              const d = await res.json()
              setContenido(d.contenido)
              setComentario("")
            } else {
              alert("No se pudo reformular. Probá de nuevo.")
            }
          } catch {
            alert("No se pudo reformular. Probá de nuevo.")
          } finally {
            setCargando(false)
          }
        }}
        style={{ marginTop: 6, width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 600, background: cargando ? "rgba(194,120,60,0.4)" : ACCENT, border: "none", borderRadius: 6, color: "#fff", cursor: cargando ? "default" : "pointer" }}>
        {cargando ? "Reformulando…" : "Reformular"}
      </button>
    </div>
  )
}

export default function MarketingClient({ ideas }: { ideas: MarketingIdea[] }) {
  const router = useRouter()
  const [items, setItems] = useState<MarketingIdea[]>(ideas)
  const [nueva, setNueva] = useState(false)
  const [generando, setGenerando] = useState(false)

  const porEstado = (e: EstadoIdea) => items.filter((i) => i.estado === e)

  async function mover(id: string, estado: EstadoIdea) {
    const previo = items.find((i) => i.id === id)?.estado
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, estado } : i)))
    try {
      const res = await fetch(`/api/admin-vakdor/marketing/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      })
      if (!res.ok) {
        if (previo) setItems((prev) => prev.map((i) => (i.id === id ? { ...i, estado: previo! } : i)))
        router.refresh() // resincronizar con la verdad del server
        alert("No se pudo mover la idea; volvió a su estado anterior.")
      }
    } catch {
      if (previo) setItems((prev) => prev.map((i) => (i.id === id ? { ...i, estado: previo! } : i)))
      router.refresh()
      alert("No se pudo mover la idea; volvió a su estado anterior.")
    }
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
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setNueva(true)}
            style={{ padding: "9px 16px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Nueva idea
          </button>
          <button disabled={generando}
            onClick={async () => {
              setGenerando(true)
              try {
                const res = await fetch("/api/admin-vakdor/marketing/generar", { method: "POST" })
                if (res.ok) {
                  router.refresh()
                } else {
                  alert("No se pudieron generar ideas ahora")
                }
              } catch {
                alert("No se pudieron generar ideas ahora")
              } finally {
                setGenerando(false)
              }
            }}
            style={{ padding: "9px 16px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "#a5b4fc", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {generando ? "Generando…" : "✦ Generar ideas ahora"}
          </button>
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

      {nueva ? (
        <div onClick={() => setNueva(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <form onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget as HTMLFormElement)
              const res = await fetch("/api/admin-vakdor/marketing", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  titulo: fd.get("titulo"), fuente: fd.get("fuente"),
                  formato: fd.get("formato"), angulo: fd.get("angulo"), motivo: fd.get("motivo"),
                }),
              })
              if (res.ok) { const { idea } = await res.json(); setItems((p) => [idea, ...p]); setNueva(false) }
            }}
            style={{ background: "#0d1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: 420, display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 16, color: "#fff", margin: 0 }}>Nueva idea</h2>
            <input name="titulo" required placeholder="Título de la idea" style={inputStyle} />
            <select name="fuente" defaultValue="linkedin" style={inputStyle}>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="blog">Blog</option>
            </select>
            <select name="formato" defaultValue="post_texto" style={inputStyle}>
              <option value="post_texto">Post de texto</option>
              <option value="carrusel">Carrusel</option>
              <option value="imagen">Imagen</option>
              <option value="encuesta">Encuesta</option>
              <option value="articulo_linkedin">Artículo LinkedIn</option>
              <option value="reel">Reel</option>
              <option value="lead_magnet">Lead magnet</option>
              <option value="articulo_blog">Artículo blog</option>
            </select>
            <input name="angulo" placeholder="Ángulo (opcional)" style={inputStyle} />
            <input name="motivo" placeholder="Motivo / por qué (opcional)" style={inputStyle} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setNueva(false)} style={{ padding: "8px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Cancelar</button>
              <button type="submit" style={{ padding: "8px 14px", background: ACCENT, border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Crear</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
