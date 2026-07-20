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
  const clarity = data?.clarityStats ?? {
    rageClicksPct: 0,
    deadClicksPct: 0,
    quickBacksPct: 0,
    avgScrollDepthPct: 0,
    totalSessions: 0,
    distinctUsers: 0,
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
              📊 Métricas de Conversión & Embudo Web (GA4 / CAPI / Clarity)
            </h2>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.4)", color: "#7dd3fc", fontWeight: 700 }}>
              ● GA4 En Vivo
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80", fontWeight: 700 }}>
              ⚡ CAPI Activo
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(236,72,153,0.15)", border: "1px solid rgba(236,72,153,0.4)", color: "#f472b6", fontWeight: 700 }}>
              🔥 Clarity API Conectado
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", fontWeight: 700 }}>
              ⏰ Cron Diario: 07:00 AM (AR)
            </span>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0 }}>
            Panel unificado de auditoría para vakdor.com: usuarios activos/nuevos, rebote, tiempo en página, Microsoft Clarity, GSC y Buffer
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
              <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                📐 Embudo Invertido de Conversión (6 Etapas Reales de vakdor.com)
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Tasa Global de Conversión: <b style={{ color: "#4ade80" }}>{funnel.length > 0 ? funnel[funnel.length - 1].conversionFromStartPct : 0}%</b>
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
                const totalStages = funnel.length
                const topWidth = 100 - (idx * (65 / totalStages))
                const bottomWidth = 100 - ((idx + 1) * (65 / totalStages))

                const colors = [
                  "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.05))",
                  "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))",
                  "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))",
                  "linear-gradient(135deg, rgba(236,72,153,0.2), rgba(236,72,153,0.05))",
                  "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))",
                  "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(34,197,94,0.12))",
                ]
                const borderColors = [
                  "rgba(56,189,248,0.4)",
                  "rgba(99,102,241,0.4)",
                  "rgba(168,85,247,0.4)",
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
                            {stage.count.toLocaleString()}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>
                            {stage.conversionFromStartPct}% del total
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
                <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 700 }}>● API Live</span>
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: "12px 0" }}>
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

              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, background: "rgba(255,255,255,0.02)", padding: 10, borderRadius: 6 }}>
                💡 <b>Métricas conectadas en vivo con Buffer GraphQL API</b> para el canal de LinkedIn Personal de Vakdor.
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
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(168,85,247,0.2)", color: "#c084fc", fontWeight: 700 }}>
                    ⏰ Cron Diario (07:00 AM)
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                  {aiTimestamp ? `Generado automáticamente el: ${new Date(aiTimestamp).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : "El análisis diario se generará automáticamente mañana a las 07:00 AM por el cron."}
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
                El análisis diario de Gemini 3.5 Flash se ejecuta de manera automatizada todas las mañanas a las 07:00 AM.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
