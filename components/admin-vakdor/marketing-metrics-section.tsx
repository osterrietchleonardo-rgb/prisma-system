"use client"

import { useState, useEffect } from "react"
import type { MarketingMetricsPayload } from "@/lib/admin-vakdor/marketing/metricas"

const ACCENT = "#c2783c"

interface AiAnalysisContent {
  analisis_actual?: string
  analisis_mejora?: string[]
  proximo_paso?: string[]
  ranking_analisis?: string
}

export function MarketingMetricsSection() {
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d">("30d")
  const [data, setData] = useState<MarketingMetricsPayload | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisContent | null>(null)
  const [aiTimestamp, setAiTimestamp] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function cargarMetricas(p: "7d" | "30d" | "90d") {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin-vakdor/marketing/metricas?periodo=${p}`)
      if (res.ok) {
        const d = await res.json()
        setData(d.metrics)
        if (d.aiAnalysis) {
          setAiAnalysis(d.aiAnalysis.contenido)
          setAiTimestamp(d.aiAnalysis.generated_at)
        } else {
          setAiAnalysis(null)
          setAiTimestamp(null)
        }
      }
    } catch (err) {
      console.error("Error cargando métricas:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarMetricas(periodo)
  }, [periodo])

  const funnel = data?.funnel ?? []
  const overall = data?.overallStats ?? { activeUsers: 0, newUsers: 0, sessions: 0, screenPageViews: 0, avgBounceRatePct: 0 }
  const sources = data?.sources

  // Los badges se arman con el estado REAL de cada fuente (antes estaban fijos en el código).
  const TONOS = {
    ok: { bg: "rgba(34,197,94,0.15)", bd: "rgba(34,197,94,0.4)", fg: "#4ade80" },
    warn: { bg: "rgba(245,158,11,0.15)", bd: "rgba(245,158,11,0.4)", fg: "#fbbf24" },
    bad: { bg: "rgba(239,68,68,0.15)", bd: "rgba(239,68,68,0.4)", fg: "#fca5a5" },
    info: { bg: "rgba(56,189,248,0.15)", bd: "rgba(56,189,248,0.4)", fg: "#7dd3fc" },
    off: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.15)", fg: "rgba(255,255,255,0.5)" },
  } as const

  function Badge({ texto, tono }: { texto: string; tono: keyof typeof TONOS }) {
    const c = TONOS[tono]
    return (
      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, fontWeight: 700 }}>
        {texto}
      </span>
    )
  }

  const badgeGa4 =
    !sources ? { texto: "GA4 sin datos", tono: "off" as const }
    : sources.ga4 === "ok" ? { texto: "● GA4 en vivo", tono: "info" as const }
    : sources.ga4 === "parcial" ? { texto: "▲ GA4 incompleto", tono: "warn" as const }
    : { texto: "✕ GA4 sin respuesta", tono: "bad" as const }

  const badgeClarity =
    !sources ? { texto: "Clarity sin datos", tono: "off" as const }
    : sources.clarity === "ok" ? { texto: `🔥 Clarity (${sources.clarityDias} días)`, tono: "ok" as const }
    : sources.clarity === "cache" ? { texto: `🔥 Clarity (${sources.clarityDias} días, cacheado)`, tono: "info" as const }
    : sources.clarity === "sin_token" ? { texto: "Clarity sin token", tono: "off" as const }
    : { texto: "✕ Clarity sin respuesta", tono: "bad" as const }

  const badgeGsc =
    !sources ? { texto: "Search Console sin datos", tono: "off" as const }
    : sources.gsc === "ok" ? { texto: "🔍 Search Console", tono: "ok" as const }
    : { texto: "✕ Search Console sin respuesta", tono: "bad" as const }

  // Cuando Buffer falla, decimos POR QUÉ. Antes contestaba 200 con el error adentro
  // y este badge salía verde arriba de seis tarjetas en cero.
  const badgeBuffer =
    !sources ? { texto: "Buffer sin datos", tono: "off" as const }
    : sources.buffer === "ok" ? { texto: "💼 Buffer", tono: "ok" as const }
    : sources.buffer === "sin_token" ? { texto: "Buffer sin token", tono: "off" as const }
    : { texto: `✕ ${sources.bufferMotivo ?? "Buffer sin respuesta"}`, tono: "bad" as const }

  /**
   * Frescura REAL del análisis, en vez del horario prometido. Los cron de GitHub Actions
   * se atrasan de 2 a 5 horas y a veces no corren: el 31-ago-2026 el de las 07:00 no se
   * ejecutó y el panel seguía anunciando "07:00 y 18:00" como si nada.
   */
  const horasDesdeAnalisis = aiTimestamp ? (Date.now() - new Date(aiTimestamp).getTime()) / 3600000 : null

  function textoFrescura(h: number) {
    if (h < 1) return "recién actualizado"
    if (h < 24) return `hace ${Math.round(h)} h`
    const d = Math.floor(h / 24)
    return `hace ${d} ${d === 1 ? "día" : "días"}`
  }

  const badgeAnalisis =
    horasDesdeAnalisis === null
      ? { texto: "⏰ Sin análisis guardado", tono: "warn" as const }
      : { texto: `⏰ Análisis ${textoFrescura(horasDesdeAnalisis)}`, tono: horasDesdeAnalisis > 18 ? ("bad" as const) : ("off" as const) }

  const clarity = data?.clarityStats ?? {
    rageClicksPct: 0,
    deadClicksPct: 0,
    quickBacksPct: 0,
    avgScrollDepthPct: 0,
    totalSessions: 0,
    distinctUsers: 0,
    botSessions: 0,
    pagesPerSession: 0,
    scriptErrorsPct: 0,
    popularPages: [],
  }

  return (
    <div style={{
      marginTop: 40,
      padding: 24,
      background: "rgba(11, 18, 32, 0.85)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      borderRadius: 16,
      display: "flex",
      flexDirection: "column",
      gap: 24,
      boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.5)"
    }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>
              📊 Métricas de Conversión & Embudo Web (GA4 / Clarity)
            </h2>
            <Badge {...badgeGa4} />
            <Badge {...badgeClarity} />
            <Badge {...badgeGsc} />
            <Badge {...badgeBuffer} />
            <Badge {...badgeAnalisis} />
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0 }}>
            Panel unificado de auditoría para vakdor.com: usuarios activos/nuevos, rebote, tiempo en página, Microsoft Clarity, GSC y Buffer.
            Los números del embudo salen de GA4; Meta recibe los mismos eventos por la API de Conversiones para optimizar las campañas.
          </p>
        </div>

        {/* Period Selector */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 3 }}>
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: periodo === p ? ACCENT : "transparent",
                color: periodo === p ? "#fff" : "rgba(255,255,255,0.5)",
                transition: "all 0.15s ease",
              }}
            >
              {p === "7d" ? "7 Días" : p === "30d" ? "30 Días" : "90 Días"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
          Cargando métricas reales de GA4, Microsoft Clarity API, Search Console y Buffer...
        </div>
      ) : (
        <>
          {/* Top KPI Summaries: Usuarios Activos, Usuarios Nuevos, Vistas, Rebote */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={{ padding: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>👥 Usuarios Activos</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
                {overall.activeUsers.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                {overall.sessions} sesiones en total
              </div>
            </div>

            <div style={{ padding: 14, background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#7dd3fc", marginBottom: 4 }}>🆕 Usuarios Nuevos</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#7dd3fc" }}>
                {overall.newUsers.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                {overall.activeUsers > 0 ? Math.round((overall.newUsers / overall.activeUsers) * 100) : 0}% de primeras visitas
              </div>
            </div>

            <div style={{ padding: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>📄 Vistas Totales de Página</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
                {overall.screenPageViews.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                ~{overall.activeUsers > 0 ? (overall.screenPageViews / overall.activeUsers).toFixed(1) : 0} páginas/usuario
              </div>
            </div>

            <div style={{ padding: 14, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 4 }}>📉 Tasa Promedio de Rebote</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fca5a5" }}>
                {overall.avgBounceRatePct}%
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                Salidas sin interacción
              </div>
            </div>
          </div>

          {/* Gráfico de Embudo Invertido Real */}
          <div style={{
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}>
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  📐 Embudo de Conversión ({funnel.length} etapas reales de vakdor.com)
                </span>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
                  Contado en personas distintas (usuarios de GA4), no en cantidad de eventos.
                </div>
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Del inicio al final: <b style={{ color: "#4ade80" }}>{funnel.length > 0 ? funnel[funnel.length - 1].conversionFromStartPct : 0}%</b>
              </span>
            </div>

            {/* Embudo Trapezoidal Desacoplado */}
            <div style={{
              width: "100%",
              maxWidth: 760,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8
            }}>
              {funnel.map((stage, idx) => {
                // El ancho es PROPORCIONAL al dato real (antes era decorativo: bajaba
                // siempre lo mismo aunque los números dijeran otra cosa).
                // El piso del 22% existe para que una etapa chica siga siendo legible.
                const maxCount = Math.max(...funnel.map((s) => s.count), 1)
                const anchoDe = (c: number) => 22 + 78 * Math.min(1, c / maxCount)
                const topWidth = anchoDe(stage.count)
                const bottomWidth = idx < funnel.length - 1 ? anchoDe(funnel[idx + 1].count) : topWidth

                const colors = [
                  "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.05))",
                  "linear-gradient(135deg, rgba(79,130,246,0.2), rgba(79,130,246,0.05))",
                  "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))",
                  "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))",
                  "linear-gradient(135deg, rgba(217,70,239,0.2), rgba(217,70,239,0.05))",
                  "linear-gradient(135deg, rgba(236,72,153,0.2), rgba(236,72,153,0.05))",
                  "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))",
                  "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(34,197,94,0.12))",
                ]
                const borderColors = [
                  "rgba(56,189,248,0.4)",
                  "rgba(79,130,246,0.4)",
                  "rgba(99,102,241,0.4)",
                  "rgba(168,85,247,0.4)",
                  "rgba(217,70,239,0.4)",
                  "rgba(236,72,153,0.4)",
                  "rgba(245,158,11,0.4)",
                  "rgba(34,197,94,0.6)",
                ]

                return (
                  <div key={stage.key} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                    <div style={{
                      width: `${topWidth}%`,
                      position: "relative",
                      minHeight: 52,
                      borderRadius: 8,
                      overflow: "hidden",
                      border: `1px solid ${borderColors[idx % borderColors.length]}`,
                      boxShadow: idx === funnel.length - 1 ? "0 4px 20px rgba(34,197,94,0.25)" : "none",
                    }}>
                      {/* Fondo Trapezoidal Recortado */}
                      <div style={{
                        position: "absolute",
                        inset: 0,
                        clipPath: `polygon(0% 0%, 100% 0%, ${100 - ((topWidth - bottomWidth) / (2 * topWidth)) * 100}% 100%, ${((topWidth - bottomWidth) / (2 * topWidth)) * 100}% 100%)`,
                        background: colors[idx % colors.length],
                        zIndex: 1,
                      }} />

                      {/* Contenido de Texto Desacoplado */}
                      <div style={{
                        position: "relative",
                        zIndex: 2,
                        padding: "12px 24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        height: "100%",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: "rgba(255,255,255,0.15)", color: "#fff",
                            fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center"
                          }}>
                            {idx + 1}
                          </span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
                              {stage.label}
                            </div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                              {stage.sublabel}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                            {stage.count.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>personas</span>
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>
                            {stage.conversionFromStartPct}% de los que entran · {stage.eventCount.toLocaleString()} veces
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Badge de Abandono entre etapas */}
                    {idx < funnel.length - 1 && (
                      <div style={{
                        marginTop: 2,
                        marginBottom: 2,
                        zIndex: 10,
                        fontSize: 9,
                        color: "#fca5a5",
                        background: "rgba(239,68,68,0.2)",
                        border: "1px solid rgba(239,68,68,0.35)",
                        padding: "2px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                      }}>
                        ↓ Abandono: {funnel[idx + 1].dropoffPct}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Fuga que no se ve en el embudo: llenaron el formulario y el pre-filtro
                les negó el calendario, así que nunca llegan al paso 7. */}
            <div style={{
              width: "100%",
              maxWidth: 760,
              marginTop: 18,
              padding: "12px 16px",
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>
                  ⏳ No calificados (fuera del embudo)
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                  Llenaron el formulario y el pre-filtro no les abrió el calendario (equipo o cartera chicos).
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24" }}>
                  {(data?.noCalificados ?? 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                  {(() => {
                    const envios = funnel.find((s) => s.key === "form_submit")?.count ?? 0
                    return envios > 0 ? `${Math.round(((data?.noCalificados ?? 0) / envios) * 100)}% de los que enviaron` : "sin envíos en el período"
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Páginas Más Visitadas: Vistas, Usuarios Activos, Nuevos, Rebote % y Tiempo Promedio */}
          <div style={{
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                📄 GA4 · Páginas Más Visitadas (Vistas, Nuevos Usuarios, Rebote & Retención)
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Datos Reales de vakdor.com</span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
                    <th style={{ padding: "8px 12px" }}>Página (Path)</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Vistas</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Usuarios Activos</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Nuevos</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>% Rebote</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Tiempo Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.topPagesPerformance ?? []).map((tp, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.85)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: "#fff" }}>{tp.path}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>{tp.views}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{tp.users}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#7dd3fc" }}>{tp.newUsers}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: tp.bounceRatePct > 50 ? "#fca5a5" : "#4ade80" }}>
                        {tp.bounceRatePct}%
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fde047", fontWeight: 700 }}>
                        {tp.avgTimeSeconds}s (~{(tp.avgTimeSeconds / 60).toFixed(1)}m)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grid Secundario: Fuentes de Tráfico, Dispositivos y MICROSOFT CLARITY REAL API METRICS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {/* 1. Fuentes de Tráfico (GA4) */}
            <div style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  🌐 GA4 · Origen del Tráfico
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Canales</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(data?.trafficSources ?? []).map((ts, idx) => (
                  <div key={idx} style={{
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderRadius: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>
                      {ts.channel}
                    </span>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                      <b style={{ color: "#38bdf8" }}>{ts.sessions}</b> sesiones ({ts.activeUsers} usuarios)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Dispositivos (Desktop vs Mobile GA4) */}
            <div style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  💻 GA4 · Dispositivos
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Desktop vs Mobile</span>
              </div>

              <div style={{ display: "flex", gap: 12, padding: "8px 0" }}>
                <div style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>💻 Escritorio</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#c084fc" }}>
                    {data?.deviceBreakdown?.desktopPct ?? 0}%
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {data?.deviceBreakdown?.desktopUsers ?? 0} usuarios
                  </div>
                </div>

                <div style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>📱 Celulares</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#38bdf8" }}>
                    {data?.deviceBreakdown?.mobilePct ?? 0}%
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {data?.deviceBreakdown?.mobileUsers ?? 0} usuarios
                  </div>
                </div>
              </div>
            </div>

            {/* 3. MICROSOFT CLARITY LIVE INSIGHTS API DATA */}
            <div style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f472b6", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  🔥 Microsoft Clarity · Comportamiento Real
                </span>
                <Badge {...badgeClarity} />
              </div>

              {/* Aviso obligatorio: Clarity NO respeta el selector de 7/30/90 días. */}
              <div style={{ fontSize: 10, color: "#fbbf24", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", padding: "6px 8px", borderRadius: 6, lineHeight: 1.4 }}>
                ⚠️ Clarity siempre muestra los <b>últimos {sources?.clarityDias ?? 3} días</b>: su API no acepta otros rangos,
                así que estos números no cambian con el selector de arriba. Además permite solo 10 consultas por día, por eso se cachean.
              </div>

              {/* Cuántas de esas sesiones son personas. Con 2 sesiones humanas, ningún
                  porcentaje de abajo significa nada, y eso tiene que verse. */}
              <div style={{
                fontSize: 10,
                lineHeight: 1.4,
                padding: "6px 8px",
                borderRadius: 6,
                color: clarity.botSessions > clarity.totalSessions ? "#fca5a5" : "rgba(255,255,255,0.55)",
                background: clarity.botSessions > clarity.totalSessions ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${clarity.botSessions > clarity.totalSessions ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.07)"}`,
              }}>
                <b>{clarity.totalSessions}</b> {clarity.totalSessions === 1 ? "sesión real" : "sesiones reales"} y <b>{clarity.botSessions}</b> de robots.
                {clarity.totalSessions < 30 ? " Con tan poca muestra, los porcentajes de abajo no alcanzan para decidir nada." : ""}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Scroll Depth Promedio</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f472b6" }}>
                    {clarity.avgScrollDepthPct}%
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Profundidad de lectura</div>
                </div>

                <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Páginas / Sesión</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#38bdf8" }}>
                    {clarity.pagesPerSession}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Promedio por visita</div>
                </div>

                <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Rage Clicks (Frustración)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: clarity.rageClicksPct > 0 ? "#ef4444" : "#4ade80" }}>
                    {clarity.rageClicksPct}%
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Clics repetitivos</div>
                </div>

                <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Quick Backs (Retornos)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fde047" }}>
                    {clarity.quickBacksPct}%
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Volvieron rápido atrás</div>
                </div>
              </div>
            </div>
          </div>

          {/* Grid Terciario: Métricas Reales de Buffer LinkedIn + SEO Google Search Console */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
            {/* Métricas Orgánicas Reales de Buffer / LinkedIn */}
            <div style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  💼 Buffer · Métricas Reales de LinkedIn
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  LinkedIn Personal
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: "12px 0 0" }}>
                <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Impresiones Totales</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                    {(data?.bufferStats?.totalImpressions ?? 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Alcance (Reach)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#7dd3fc" }}>
                    {(data?.bufferStats?.reach ?? 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Engagement Rate</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#4ade80" }}>
                    {data?.bufferStats?.avgEngagementRate ?? 0}%
                  </div>
                </div>
              </div>

              {/* Datos que ya venían de Buffer y no se estaban mostrando. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Publicaciones</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#a5b4fc" }}>
                    {(data?.bufferStats?.totalPosts ?? 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Reacciones</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fde047" }}>
                    {(data?.bufferStats?.totalReactions ?? 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Comentarios</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f472b6" }}>
                    {(data?.bufferStats?.totalComments ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, background: "rgba(255,255,255,0.02)", padding: 10, borderRadius: 6 }}>
                💡 Totales del canal de LinkedIn personal, vía Buffer.
                <b> No hay ranking por publicación</b>: la API devuelve solo el agregado del período, no el detalle post por post.
              </div>
            </div>

            {/* SEO & Palabras Clave de Google Search Console */}
            <div style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  🔍 Google Search Console · Búsquedas Reales
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>SEO vakdor.com</span>
              </div>

              {/* Totales REALES del sitio. Van arriba de la tabla porque Google esconde
                  las búsquedas de poco volumen: la lista de abajo suma menos que esto.
                  Sin esta fila el panel mostraba 0 clics cuando en realidad hubo 3. */}
              {data?.gscTotales ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {[
                    { k: "Clics", v: data.gscTotales.clicks.toLocaleString(), c: "#4ade80" },
                    { k: "Impresiones", v: data.gscTotales.impressions.toLocaleString(), c: "#fff" },
                    { k: "CTR", v: `${data.gscTotales.ctrPct}%`, c: "#fde047" },
                    { k: "Posición media", v: `${data.gscTotales.position}`, c: "#7dd3fc" },
                  ].map((m) => (
                    <div key={m.k} style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>{m.k}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.45 }}>
                Arriba, el total real del sitio. Abajo, solo las búsquedas que Google deja ver:
                las de muy pocas impresiones las oculta, así que la lista suele sumar menos clics que el total.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                {(data?.gscQueries ?? []).length > 0 ? (
                  (data?.gscQueries ?? []).map((q, idx) => (
                    <div key={idx} style={{
                      padding: "8px 10px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                        "{q.query}"
                      </span>
                      <div style={{ display: "flex", gap: 10, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                        <span><b>{q.clicks}</b> clics</span>
                        <span><b>{q.impressions}</b> imp</span>
                        <span style={{ color: "#7dd3fc" }}>Pos. <b>{q.position}</b></span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "16px 0" }}>
                    Sin consultas de búsqueda registradas en el período
                  </div>
                )}
              </div>
            </div>

            {/* Oportunidades SEO: lo que ya aparece pero todavía no arriba. */}
            <div style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(194,120,60,0.25)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#e0a877", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  ⬆ Oportunidades SEO · posición 4-20
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{data?.periodo ?? ""}</span>
              </div>

              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.45 }}>
                Búsquedas por las que ya aparecés sin estar arriba. Conviene mejorar estas páginas
                antes de escribir una nueva que compita con ellas.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                {(data?.gscOportunidades ?? []).length > 0 ? (
                  (data?.gscOportunidades ?? []).map((o, idx) => (
                    <div key={idx} style={{
                      padding: "8px 10px",
                      background: "rgba(194,120,60,0.05)",
                      border: "1px solid rgba(194,120,60,0.15)",
                      borderRadius: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                          "{o.query}"
                        </span>
                        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>
                          <span><b>{o.impressions}</b> imp</span>
                          <span style={{ color: "#e0a877" }}>Pos. <b>{o.position}</b></span>
                        </div>
                      </div>
                      {o.url ? (
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", wordBreak: "break-all" }}>{o.url}</span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  // Nunca una tabla vacía sin explicación: si la fuente falló, se dice.
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "16px 0" }}>
                    {data?.sources?.gsc === "error"
                      ? "Search Console no respondió en este período"
                      : "Todavía no hay búsquedas en posición 4-20 con impresiones suficientes"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sección de Análisis IA con Gemini 3.5 Flash */}
          <div style={{
            background: "linear-gradient(135deg, rgba(194,120,60,0.08), rgba(99,102,241,0.08))",
            border: "1px solid rgba(194,120,60,0.25)",
            borderRadius: 14,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                    ✦ Análisis Diario de Inteligencia IA
                  </span>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(194,120,60,0.2)", color: ACCENT, fontWeight: 800 }}>
                    Gemini 3.5 Flash
                  </span>
                  <Badge {...badgeAnalisis} />
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>
                    Período: {periodo === "7d" ? "7 días" : periodo === "30d" ? "30 días" : "90 días"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                  {aiTimestamp
                    ? `Generado el ${new Date(aiTimestamp).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}${
                        horasDesdeAnalisis !== null && horasDesdeAnalisis > 18
                          ? " · los números de arriba son de ahora, este texto no"
                          : ""
                      }`
                    : "Todavía no hay análisis guardado para este período."}
                </div>
              </div>
            </div>

            {aiAnalysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* 1. Análisis Actual */}
                <div style={{ padding: 14, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#7dd3fc", textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.04em" }}>
                    🔍 Análisis Actual del Embudo
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
                    {aiAnalysis.analisis_actual}
                  </div>
                </div>

                {/* 2. Análisis de Estrategia LinkedIn */}
                {aiAnalysis.ranking_analisis && (
                  <div style={{ padding: 14, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.04em" }}>
                      💼 Estrategia de Publicaciones (Buffer / LinkedIn)
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
                      {aiAnalysis.ranking_analisis}
                    </div>
                  </div>
                )}

                {/* 3. Análisis de Mejora + Próximos Pasos */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                  <div style={{ padding: 14, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#fde047", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.04em" }}>
                      ⚡ Oportunidades de Mejora
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
                      {(aiAnalysis.analisis_mejora ?? []).map((m, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>{m}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ padding: 14, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.04em" }}>
                      🚀 Próximos Pasos Priorizados
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
                      {(aiAnalysis.proximo_paso ?? []).map((step, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>
                Sin análisis para {periodo === "7d" ? "7 días" : periodo === "30d" ? "30 días" : "90 días"} todavía.
                Lo genera una tarea programada para los tres períodos, dos veces por día. Puede demorarse varias horas.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
