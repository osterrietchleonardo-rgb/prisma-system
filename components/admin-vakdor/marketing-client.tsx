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

/** ISO → valor de <input type="datetime-local"> en hora local ("YYYY-MM-DDTHH:mm"). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 999,
      background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
      maxWidth: "100%", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.25,
    }}>{children}</span>
  )
}

function Card({ idea, onMover, desarrollando, onVer, onProgramar }: {
  idea: MarketingIdea; onMover: (id: string, e: EstadoIdea) => void
  desarrollando: boolean; onVer: (idea: MarketingIdea) => void
  onProgramar: (id: string, fechaISO: string | null) => void
}) {
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
      {desarrollando ? (
        <div style={{ fontSize: 11, color: ACCENT, marginBottom: 8 }}>Desarrollando…</div>
      ) : null}
      {idea.contenido ? (
        <button onClick={() => onVer(idea)}
          style={{
            fontSize: 11, padding: "4px 8px", borderRadius: 6, width: "100%", marginBottom: 8,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.75)", cursor: "pointer",
          }}>
          📄 Ver contenido
        </button>
      ) : null}
      {idea.estado === "en_revision" ? <Reformular idea={idea} /> : null}
      {idea.estado === "aprobada" || idea.programada_para ? (
        <div key={`prog-${idea.id}-${idea.programada_para ?? ""}`} style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 4 }}>
            📅 Programar
          </label>
          <input type="datetime-local" defaultValue={isoToLocalInput(idea.programada_para)}
            onChange={(e) => {
              const v = e.target.value
              onProgramar(idea.id, v ? new Date(v).toISOString() : null)
            }}
            style={{ width: "100%", fontSize: 11, padding: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", colorScheme: "dark" }} />
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

const FUENTES_FILTRO = [
  { key: "", label: "Todas" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" },
  { key: "blog", label: "Blog" },
] as const

const FORMATOS_FILTRO = [
  { key: "", label: "Todos" },
  { key: "post_texto", label: "Post de texto" },
  { key: "carrusel", label: "Carrusel" },
  { key: "imagen", label: "Imagen" },
  { key: "encuesta", label: "Encuesta" },
  { key: "articulo_linkedin", label: "Artículo LinkedIn" },
  { key: "reel", label: "Reel" },
  { key: "lead_magnet", label: "Lead magnet" },
  { key: "articulo_blog", label: "Artículo blog" },
] as const

const FUENTE_COLOR: Record<string, { bg: string; text: string }> = {
  linkedin: { bg: "rgba(99,102,241,0.25)", text: "#a5b4fc" },
  blog: { bg: "rgba(194,120,60,0.25)", text: "#e29e6d" },
  instagram: { bg: "rgba(236,72,153,0.25)", text: "#f9a8d4" },
}

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

function Calendario({ items, onVer }: { items: MarketingIdea[]; onVer: (i: MarketingIdea) => void }) {
  const [mes, setMes] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [fFuente, setFFuente] = useState("")
  const [fFormato, setFFormato] = useState("")
  const [fAngulo, setFAngulo] = useState("")

  const filtradas = items.filter((i) => {
    if (fFuente && i.fuente !== fFuente) return false
    if (fFormato && i.formato !== fFormato) return false
    if (fAngulo && !(i.angulo ?? "").toLowerCase().includes(fAngulo.toLowerCase())) return false
    return true
  })

  const primerDia = new Date(mes.y, mes.m, 1)
  const diasEnMes = new Date(mes.y, mes.m + 1, 0).getDate()
  // getDay(): 0=domingo..6=sábado. La semana arranca en lunes.
  const offset = (primerDia.getDay() + 6) % 7
  const celdas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)]
  while (celdas.length % 7 !== 0) celdas.push(null)

  const hoy = new Date()
  const nombreMes = primerDia.toLocaleDateString("es-AR", { month: "long", year: "numeric" })

  const ideasDelDia = (dia: number) => filtradas.filter((i) => {
    if (!i.programada_para) return false
    const d = new Date(i.programada_para)
    return d.getFullYear() === mes.y && d.getMonth() === mes.m && d.getDate() === dia
  })

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={fFuente} onChange={(e) => setFFuente(e.target.value)} style={inputStyle}>
          {FUENTES_FILTRO.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select value={fFormato} onChange={(e) => setFFormato(e.target.value)} style={inputStyle}>
          {FORMATOS_FILTRO.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <input value={fAngulo} onChange={(e) => setFAngulo(e.target.value)} placeholder="Ángulo contiene…" style={inputStyle} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 }}>
        <button onClick={() => setMes((m) => { const d = new Date(m.y, m.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer" }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", textTransform: "capitalize", minWidth: 160, textAlign: "center" }}>
          {nombreMes}
        </span>
        <button onClick={() => setMes((m) => { const d = new Date(m.y, m.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer" }}>›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {DIAS_SEMANA.map((d) => (
          <div key={d} style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "4px 0" }}>{d}</div>
        ))}
        {celdas.map((dia, idx) => {
          const esHoy = dia !== null && mes.y === hoy.getFullYear() && mes.m === hoy.getMonth() && dia === hoy.getDate()
          return (
            <div key={idx} style={{
              minHeight: 90, borderRadius: 8, padding: 6,
              background: "rgba(255,255,255,0.02)",
              border: esHoy ? `1px solid ${ACCENT}` : "1px solid rgba(255,255,255,0.06)",
            }}>
              {dia !== null ? (
                <>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, textAlign: "right" }}>{dia}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {ideasDelDia(dia).map((idea) => {
                      const color = FUENTE_COLOR[idea.fuente] ?? { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.7)" }
                      const titulo = idea.titulo.length > 18 ? `${idea.titulo.slice(0, 18)}…` : idea.titulo
                      return (
                        <button key={idea.id} onClick={() => onVer(idea)}
                          style={{
                            fontSize: 10, textAlign: "left", padding: "2px 6px", borderRadius: 5,
                            background: color.bg, color: color.text, border: "none", cursor: "pointer",
                          }}>
                          {titulo}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function MarketingClient({ ideas }: { ideas: MarketingIdea[] }) {
  const router = useRouter()
  const [items, setItems] = useState<MarketingIdea[]>(ideas)
  const [nueva, setNueva] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [desarrollandoId, setDesarrollandoId] = useState<string | null>(null)
  const [verIdea, setVerIdea] = useState<MarketingIdea | null>(null)
  const [vista, setVista] = useState<"tablero" | "calendario">("tablero")

  const porEstado = (e: EstadoIdea) => items.filter((i) => i.estado === e)

  async function programar(id: string, fechaISO: string | null) {
    const anterior = items.find((i) => i.id === id)?.programada_para ?? null
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, programada_para: fechaISO } : i)))
    try {
      const res = await fetch(`/api/admin-vakdor/marketing/${id}/programar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: fechaISO }),
      })
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, programada_para: anterior } : i)))
        alert("No se pudo programar.")
      }
    } catch {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, programada_para: anterior } : i)))
      alert("No se pudo programar.")
    }
  }

  async function desarrollar(id: string) {
    setDesarrollandoId(id)
    try {
      const res = await fetch(`/api/admin-vakdor/marketing/${id}/desarrollar`, { method: "POST" })
      if (res.ok) {
        const d = await res.json()
        setItems((prev) => prev.map((i) => (i.id === id ? {
          ...i,
          contenido: d.contenido ?? i.contenido,
          primer_comentario: d.primer_comentario ?? i.primer_comentario,
          hashtags: d.hashtags ?? i.hashtags,
          blog: d.blog ?? i.blog,
        } : i)))
        alert("Contenido desarrollado ✓")
      } else {
        alert("No se pudo desarrollar el contenido.")
      }
    } catch {
      alert("No se pudo desarrollar el contenido.")
    } finally {
      setDesarrollandoId(null)
    }
  }

  async function mover(id: string, estado: EstadoIdea) {
    const item = items.find((i) => i.id === id)
    const previo = item?.estado
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
        return
      }
      if (estado === "en_proceso" && item && !item.contenido) {
        if (window.confirm("¿Desarrollar el contenido completo con IA ahora?")) {
          await desarrollar(id)
        }
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 3 }}>
            {(["tablero", "calendario"] as const).map((v) => (
              <button key={v} onClick={() => setVista(v)}
                style={{
                  padding: "6px 12px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: vista === v ? ACCENT : "transparent",
                  color: vista === v ? "#fff" : "rgba(255,255,255,0.5)",
                }}>
                {v === "tablero" ? "Tablero" : "Calendario"}
              </button>
            ))}
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
      </div>

      {vista === "tablero" ? (
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
                {cards.map((idea) => (
                  <Card key={idea.id} idea={idea} onMover={mover}
                    desarrollando={desarrollandoId === idea.id} onVer={setVerIdea} onProgramar={programar} />
                ))}
                {cards.length === 0 ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "16px 0" }}>—</div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <Calendario items={items} onVer={setVerIdea} />
      )}

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

      {verIdea ? (
        <div onClick={() => setVerIdea(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#0d1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: 560, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <h2 style={{ fontSize: 16, color: "#fff", margin: 0 }}>{verIdea.titulo}</h2>
              <button onClick={() => setVerIdea(null)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(verIdea.contenido ?? "")
                alert("Contenido copiado ✓")
              }}
              style={{ alignSelf: "flex-start", padding: "6px 12px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Copiar contenido
            </button>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", maxHeight: 360, overflowY: "auto", padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              {verIdea.contenido}
            </div>
            {verIdea.primer_comentario ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Primer comentario
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "pre-wrap", padding: 8, background: "rgba(0,0,0,0.15)", borderRadius: 6 }}>
                  {verIdea.primer_comentario}
                </div>
              </div>
            ) : null}
            {verIdea.hashtags && verIdea.hashtags.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {verIdea.hashtags.map((h, idx) => <Chip key={idx}>{h}</Chip>)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
