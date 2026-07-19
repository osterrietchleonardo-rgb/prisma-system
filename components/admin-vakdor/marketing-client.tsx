"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ESTADOS, type MarketingIdea, type EstadoIdea, type FunnelStage } from "@/lib/admin-vakdor/marketing/types"

const ACCENT = "#c2783c"

// Colores por etapa del embudo.
const FUNNEL_UI: Record<FunnelStage, { label: string; bg: string; border: string; color: string }> = {
  tofu: { label: "TOFU", bg: "rgba(56,189,248,0.14)", border: "rgba(56,189,248,0.4)", color: "#7dd3fc" },
  mofu: { label: "MOFU", bg: "rgba(167,139,250,0.14)", border: "rgba(167,139,250,0.4)", color: "#c4b5fd" },
  bofu: { label: "BOFU", bg: "rgba(52,211,153,0.14)", border: "rgba(52,211,153,0.4)", color: "#6ee7b7" },
}
function FunnelBadge({ funnel }: { funnel: FunnelStage | null }) {
  if (!funnel) return null
  const f = FUNNEL_UI[funnel]
  return (
    <span title={funnel === "tofu" ? "Descubrimiento" : funnel === "mofu" ? "Nutrición" : "Empujón a la reunión"}
      style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 5, background: f.bg, border: `1px solid ${f.border}`, color: f.color }}>
      {f.label}
    </span>
  )
}

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

function Card({ idea, onMover, onVer, onProgramar, onPublicar, publicando, onReformulada }: {
  idea: MarketingIdea; onMover: (id: string, e: EstadoIdea) => void
  onVer: (idea: MarketingIdea) => void
  onProgramar: (id: string, fechaISO: string | null) => void
  onPublicar: (id: string) => void
  publicando: boolean
  onReformulada: (id: string, patch: Partial<MarketingIdea>) => void
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
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <FunnelBadge funnel={idea.funnel} />
        <Chip>{idea.fuente}</Chip>
        <Chip>{idea.formato}</Chip>
        {idea.angulo ? <Chip>{idea.angulo}</Chip> : null}
      </div>
      {idea.assets && idea.assets.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {idea.assets.map((a, idx) => (
            <button key={idx}
              onClick={async () => {
                // Assets del worker viven en bucket público → abrir la url directa.
                // Los del bucket privado (sin url) se firman por el endpoint.
                if (a.url && /^https?:\/\//.test(a.url)) { window.open(a.url, "_blank"); return }
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
      {idea.estado === "en_revision" ? <Reformular idea={idea} onResult={(patch) => onReformulada(idea.id, patch)} /> : null}
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
      {idea.estado === "aprobada" && idea.fuente === "blog" ? (
        <button disabled={publicando} onClick={() => onPublicar(idea.id)}
          style={{
            width: "100%", marginBottom: 8, padding: "6px 0", fontSize: 11, fontWeight: 600,
            background: publicando ? "rgba(194,120,60,0.4)" : ACCENT, border: "none", borderRadius: 6,
            color: "#fff", cursor: publicando ? "default" : "pointer",
          }}>
          {publicando ? "Publicando…" : "Publicar (web + LinkedIn)"}
        </button>
      ) : null}
      {idea.estado === "aprobada" && idea.fuente === "linkedin" ? (
        <button disabled={publicando} onClick={() => onPublicar(idea.id)}
          style={{
            width: "100%", marginBottom: 8, padding: "6px 0", fontSize: 11, fontWeight: 600,
            background: publicando ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.85)", border: "none", borderRadius: 6,
            color: "#fff", cursor: publicando ? "default" : "pointer",
          }}>
          {publicando ? "Publicando…" : "Publicar en LinkedIn"}
        </button>
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

function Reformular({ idea, onResult }: { idea: MarketingIdea; onResult: (patch: Partial<MarketingIdea>) => void }) {
  const [comentario, setComentario] = useState("")
  const [contenido, setContenido] = useState(idea.contenido ?? "")
  const [cargando, setCargando] = useState(false)
  const [regenerar, setRegenerar] = useState(false)
  const puedeRegenerar = idea.formato === "carrusel" || idea.formato === "lead_magnet"
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
      {puedeRegenerar ? (
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
          <input type="checkbox" checked={regenerar} onChange={(e) => setRegenerar(e.target.checked)} style={{ accentColor: ACCENT }} />
          También regenerar imágenes/PDF (rehace la pieza con el worker)
        </label>
      ) : null}
      <button disabled={cargando || !comentario.trim()}
        onClick={async () => {
          setCargando(true)
          try {
            const res = await fetch(`/api/admin-vakdor/marketing/${idea.id}/reformular`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ comentario: comentario.trim(), regenerar_visuales: puedeRegenerar && regenerar }),
            })
            if (res.ok) {
              const d = await res.json()
              setComentario("")
              if (d.regenerando) {
                onResult({ contenido: null, estado: "en_proceso", assets: [] })
                alert("Reformulado ✓ — la tarjeta volvió a “En proceso”; el worker rehace la descripción + las imágenes/PDF y la devuelve a “En revisión”.")
              } else {
                setContenido(d.contenido)
                onResult({ contenido: d.contenido })
              }
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
        {cargando ? (regenerar && puedeRegenerar ? "Reformulando + regenerando…" : "Reformulando…") : "Reformular"}
      </button>
    </div>
  )
}

/** Fuerza descarga desde Supabase Storage (query `?download=<nombre>` → Content-Disposition attachment). */
function urlDescarga(url: string, nombre: string) {
  return url + (url.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(nombre)
}

const btnDescarga: React.CSSProperties = {
  alignSelf: "flex-start", fontSize: 12, padding: "5px 12px", borderRadius: 6, marginTop: 6,
  background: "rgba(194,120,60,0.15)", border: "1px solid rgba(194,120,60,0.35)", color: "#e29e6d",
  textDecoration: "none", fontWeight: 600, cursor: "pointer",
}
const previewLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: ACCENT, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em",
}

/** Preview real de la pieza en el visor: carrusel = galería slide por slide; lead_magnet = PDF embebido; resto = imagen. */
function PreviewPieza({ idea }: { idea: MarketingIdea }) {
  const [i, setI] = useState(0)
  const assets = (idea.assets ?? []) as Array<{ tipo?: string; url?: string; orden?: number }>
  const slides = assets
    .filter((a) => a.tipo === "png" && typeof a.url === "string" && a.url.startsWith("http"))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const pdf = assets.find((a) => a.tipo === "pdf" && typeof a.url === "string" && a.url.startsWith("http"))
  const blogImg = (idea.blog as Record<string, unknown>)?.featured_image_url

  if (idea.formato === "carrusel" && slides.length > 0) {
    const idx = Math.min(i, slides.length - 1)
    return (
      <div>
        <div style={previewLabel}>Carrusel — slide {idx + 1}/{slides.length}</div>
        <div style={{ position: "relative" }}>
          <img src={slides[idx].url} alt={`slide ${idx + 1}`}
            style={{ width: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "block" }} />
          {slides.length > 1 ? (
            <>
              <button onClick={() => setI((idx - 1 + slides.length) % slides.length)}
                style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", fontSize: 16, zIndex: 2 }}>◀</button>
              <button onClick={() => setI((idx + 1) % slides.length)}
                style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", fontSize: 16, zIndex: 2 }}>▶</button>
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
          {slides.map((_, k) => (
            <span key={k} onClick={() => setI(k)}
              style={{ width: 7, height: 7, borderRadius: "50%", cursor: "pointer", background: k === idx ? ACCENT : "rgba(255,255,255,0.25)" }} />
          ))}
        </div>
        {pdf?.url ? (
          <a href={urlDescarga(pdf.url, `carrusel-${idea.id}.pdf`)} download style={btnDescarga}>⬇ Descargar PDF</a>
        ) : null}
      </div>
    )
  }

  if (idea.formato === "lead_magnet" && pdf?.url) {
    return (
      <div>
        <div style={previewLabel}>Lead magnet (PDF)</div>
        <iframe src={pdf.url} title="lead magnet"
          style={{ width: "100%", height: 460, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, background: "#fff" }} />
        <a href={urlDescarga(pdf.url, `lead-magnet-${idea.id}.pdf`)} download style={btnDescarga}>⬇ Descargar PDF</a>
      </div>
    )
  }

  const img = typeof blogImg === "string" && blogImg.startsWith("http") ? blogImg : slides[0]?.url
  return img ? (
    <div>
      <div style={previewLabel}>Imagen de marca</div>
      <img src={img} alt="portada" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }} />
    </div>
  ) : null
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
  const [fFunnel, setFFunnel] = useState("")
  const [fAngulo, setFAngulo] = useState("")

  const filtradas = items.filter((i) => {
    if (fFuente && i.fuente !== fFuente) return false
    if (fFormato && i.formato !== fFormato) return false
    if (fFunnel && i.funnel !== fFunnel) return false
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
        <select value={fFunnel} onChange={(e) => setFFunnel(e.target.value)} style={inputStyle}>
          <option value="">Todo el embudo</option>
          <option value="tofu">TOFU · Descubrimiento</option>
          <option value="mofu">MOFU · Nutrición</option>
          <option value="bofu">BOFU · Reunión</option>
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
  const [publicandoId, setPublicandoId] = useState<string | null>(null)
  const [verIdea, setVerIdea] = useState<MarketingIdea | null>(null)
  const [comentarioModal, setComentarioModal] = useState<string | null>(null)
  const [vista, setVista] = useState<"tablero" | "calendario">("tablero")

  const porEstado = (e: EstadoIdea) => items.filter((i) => i.estado === e)

  function onReformulada(id: string, patch: Partial<MarketingIdea>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    setVerIdea((v) => (v && v.id === id ? { ...v, ...patch } : v))
  }

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

  async function publicar(id: string) {
    if (publicandoId) return
    const item = items.find((i) => i.id === id)
    const esLinkedIn = item?.fuente === "linkedin"
    const confirmMsg = esLinkedIn
      ? "¿Publicar este post en tu LinkedIn AHORA? (sale a tu cuenta real)"
      : "¿Publicar este artículo AHORA en la web de Vakdor Y en tu LinkedIn?"
    if (!window.confirm(confirmMsg)) return
    setPublicandoId(id)
    try {
      const res = await fetch(`/api/admin-vakdor/marketing/${id}/publicar`, { method: "POST" })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, estado: "publicada" } : i)))
        if (esLinkedIn) {
          if (d.primer_comentario) {
            setComentarioModal(d.primer_comentario)
          } else {
            alert("Publicado en LinkedIn ✓")
          }
        } else {
          // Blog: web + LinkedIn (teaser). Si LinkedIn salió y hay primer comentario, mostralo para pegar.
          const ln = d.linkedin ? "y en LinkedIn ✓" : (d.linkedin_omitido ? `(LinkedIn omitido: ${d.linkedin_omitido})` : "")
          if (d.linkedin && d.primer_comentario) {
            alert(`Publicado en la web ${ln}\n${d.url ?? ""}`)
            setComentarioModal(d.primer_comentario)
          } else {
            alert(`Publicado en la web ${ln}\n${d.url ?? ""}`)
          }
        }
      } else {
        alert("No se pudo publicar: " + (d.error ?? ""))
      }
    } catch {
      alert("No se pudo publicar: " + "error de red")
    } finally {
      setPublicandoId(null)
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
      if (estado === "en_proceso" && item && (!item.contenido || !(item.assets && item.assets.length))) {
        // El WORKER (local/EasyPanel) desarrolla la pieza: contenido con estructura copywriter
        // + imágenes de marca (portada / slides de carrusel / PDF). Acá no se desarrolla nada.
        alert("En proceso ✓ — el worker va a desarrollar el contenido y las imágenes de marca, y la pasará a “En revisión”. (Asegurate de que el worker esté corriendo.)")
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
                    onVer={setVerIdea} onProgramar={programar}
                    onPublicar={publicar} publicando={publicandoId === idea.id} onReformulada={onReformulada} />
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
                  formato: fd.get("formato"), funnel: fd.get("funnel"),
                  angulo: fd.get("angulo"), motivo: fd.get("motivo"),
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
            <select name="funnel" defaultValue="tofu" style={inputStyle}>
              <option value="tofu">TOFU · Descubrimiento (dolor amplio)</option>
              <option value="mofu">MOFU · Nutrición (mecanismo/método)</option>
              <option value="bofu">BOFU · Empujón a la reunión</option>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><FunnelBadge funnel={verIdea.funnel} /></div>
                <h2 style={{ fontSize: 16, color: "#fff", margin: 0 }}>{verIdea.titulo}</h2>
              </div>
              <button onClick={() => setVerIdea(null)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <PreviewPieza idea={verIdea} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Descripción del posteo</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(verIdea.contenido ?? "")
                  alert("Descripción copiada ✓")
                }}
                style={{ padding: "5px 12px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Copiar
              </button>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", maxHeight: 360, overflowY: "auto", padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              {verIdea.contenido}
            </div>
            {(() => {
              const b = (verIdea.blog ?? {}) as Record<string, unknown>
              const lnPost = typeof b.linkedin_post === "string" ? b.linkedin_post : ""
              const lnCom = typeof b.linkedin_primer_comentario === "string" ? b.linkedin_primer_comentario : ""
              if (verIdea.fuente !== "blog" || !lnPost) return null
              return (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.04em" }}>Versión LinkedIn (post + portada)</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto", padding: 12, background: "rgba(99,102,241,0.06)", borderRadius: 8 }}>{lnPost}</div>
                  {lnCom ? (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase" }}>Primer comentario (engagement)</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "pre-wrap", padding: 8, background: "rgba(0,0,0,0.15)", borderRadius: 6 }}>{lnCom}</div>
                    </div>
                  ) : null}
                </div>
              )
            })()}
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

      {comentarioModal ? (
        <div onClick={() => setComentarioModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#0d1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: 480, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <h2 style={{ fontSize: 16, color: "#fff", margin: 0 }}>Publicado ✓ — pegá el primer comentario</h2>
              <button onClick={() => setComentarioModal(null)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>
              Pegalo como primer comentario en tu post de LinkedIn.
            </p>
            <textarea readOnly value={comentarioModal} rows={6}
              style={{ width: "100%", fontSize: 13, padding: 10, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.85)", resize: "vertical" }} />
            <button
              onClick={() => {
                navigator.clipboard.writeText(comentarioModal)
                alert("Comentario copiado ✓")
              }}
              style={{ alignSelf: "flex-start", padding: "6px 12px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Copiar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
