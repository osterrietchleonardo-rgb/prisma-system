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
  const maxFunnelCount = funnel.length > 0 ? Math.max(1, funnel[0].count) : 1

  return (
    <div style={{
      marginTop: 40,
      padding: 24,
      background: "rgba(11, 18, 32, 0.75)",
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>
              📊 Métricas de Conversión & Embudo Web (GA4 / CAPI)
            </h2>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.4)", color: "#7dd3fc", fontWeight: 700 }}>
              ● GA4 En Vivo
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80", fontWeight: 700 }}>
              ⚡ CAPI Activo
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", fontWeight: 700 }}>
              ⏰ Cron Diario: 07:00 AM (AR)
            </span>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0 }}>
            Rendimiento en tiempo real de vakdor.com (GA4), frases SEO de Google Search Console y publicaciones de LinkedIn
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
          Cargando métricas reales...
        </div>
      ) : (
        <>
          {/* Gráfico de Embudo Invertido Real (Forma de Triángulo / Embudo Geométrico) */}
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
                📐 Embudo Invertido Geométrico (6 Etapas Reales de vakdor.com)
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Tasa Global de Conversión: <b style={{ color: "#4ade80" }}>{funnel.length > 0 ? funnel[funnel.length - 1].conversionFromStartPct : 0}%</b>
              </span>
            </div>

            {/* Embudo Triangulado / Trapezoidal Stacked */}
            <div style={{
              width: "100%",
              maxWidth: 720,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4
            }}>
              {funnel.map((stage, idx) => {
                const totalStages = funnel.length
                // Ancho superior e inferior para lograr el estrechamiento trapezoidal continuo en forma de embudo/triángulo
                const topWidth = 100 - (idx * (76 / totalStages))
                const bottomWidth = 100 - ((idx + 1) * (76 / totalStages))

                const colors = [
                  "linear-gradient(180deg, rgba(56,189,248,0.22), rgba(56,189,248,0.12))",
                  "linear-gradient(180deg, rgba(99,102,241,0.22), rgba(99,102,241,0.12))",
                  "linear-gradient(180deg, rgba(168,85,247,0.22), rgba(168,85,247,0.12))",
                  "linear-gradient(180deg, rgba(236,72,153,0.22), rgba(236,72,153,0.12))",
                  "linear-gradient(180deg, rgba(245,158,11,0.22), rgba(245,158,11,0.12))",
                  "linear-gradient(180deg, rgba(34,197,94,0.32), rgba(34,197,94,0.18))",
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
                    {/* Bloque Trapezoidal */}
                    <div style={{
                      width: `${topWidth}%`,
                      clipPath: `polygon(0% 0%, 100% 0%, ${100 - ((topWidth - bottomWidth) / (2 * topWidth)) * 100}% 100%, ${((topWidth - bottomWidth) / (2 * topWidth)) * 100}% 100%)`,
                      background: colors[idx % colors.length],
                      borderTop: `1px solid ${borderColors[idx % borderColors.length]}`,
                      padding: "12px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      minHeight: 46,
                      boxShadow: idx === funnel.length - 1 ? "0 4px 20px rgba(34,197,94,0.3)" : "none",
                      transition: "all 0.3s ease",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: "rgba(255,255,255,0.15)", color: "#fff",
                          fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          {idx + 1}
                        </span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>
                            {stage.label}
                          </div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                            {stage.sublabel}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>
                          {stage.count.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>
                          {stage.conversionFromStartPct}% conv.
                        </div>
                      </div>
                    </div>

                    {/* Badge de Fuga / Abandono flotante entre escalones */}
                    {idx < funnel.length - 1 && (
                      <div style={{
                        marginTop: -2,
                        marginBottom: -2,
                        zIndex: 10,
                        fontSize: 9,
                        color: "#fca5a5",
                        background: "rgba(239,68,68,0.2)",
                        border: "1px solid rgba(239,68,68,0.4)",
                        padding: "1px 8px",
                        borderRadius: 999,
                        fontWeight: 700,
                        backdropFilter: "blur(4px)",
                      }}>
                        ↓ Drop-off: {funnel[idx + 1].dropoffPct}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Grid Secundario: Ranking de Buffer + SEO Google Search Console */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            {/* Ranking de Buffer / LinkedIn */}
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
                  💼 Buffer · Ranking de Posts (LinkedIn)
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  Engagement promedio: <b style={{ color: "#a5b4fc" }}>{data?.bufferStats?.avgEngagementRate ?? 0}%</b>
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                {(data?.bufferStats?.ranking ?? []).length > 0 ? (
                  (data?.bufferStats?.ranking ?? []).map((post, rIdx) => (
                    <div key={post.id || rIdx} style={{
                      padding: 10,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                          #{rIdx + 1} {post.text}
                        </span>
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(99,102,241,0.2)", color: "#a5b4fc", fontWeight: 700 }}>
                          {post.formato ?? "carrusel"}
                        </span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                        <span>👁️ {post.impressions} imp</span>
                        <span>👍 {post.reactions} react</span>
                        <span>💬 {post.comments} com</span>
                        <span style={{ color: "#4ade80", fontWeight: 700 }}>⚡ {post.engagementRate}% eng</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "16px 0" }}>
                    Sin publicaciones registradas en el período
                  </div>
                )}
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
                  🔍 Google Search Console · Frases Clave
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Top búsquedas orgánicas</span>
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
                    Sin consultas de búsqueda registradas
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

                {/* 2. Análisis del Ranking de Posts (Buffer/LinkedIn) */}
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
