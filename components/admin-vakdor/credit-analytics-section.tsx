"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface FeatureCost {
  feature: string
  usos: number
  credits: number
  usd: number
  usdPerCredit: number
  inputTokens: number
  outputTokens: number
}

interface UserRow {
  full_name: string
  email: string
  role: string
  agency_name: string
  credits: number
  usd: number
  features: string
}

interface CreditConfig {
  credits_total: number
  credits_director: number
  credits_asesores: number
  credits_used: number
}

interface Meta {
  agencyName: string
  numAsesores: number
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  totalCreditsUsed: number
  totalUsd: number
}

interface Agency { id: string; name: string }

interface AnalyticsData {
  agencies: Agency[]
  featureCosts: FeatureCost[]
  userRanking: UserRow[]
  creditConfig: CreditConfig | null
  meta?: Meta
}

/* ─── Feature labels ────────────────────────────────────────────────────────── */

const FEATURE_LABELS: Record<string, { icon: string; label: string }> = {
  consultor_ia: { icon: "🤖", label: "Consultor IA" },
  marketing_ia: { icon: "🎯", label: "Marketing IA" },
  tutor_ia: { icon: "🎓", label: "Tutor IA" },
  propiedades_descripcion: { icon: "📝", label: "Propiedades Desc." },
  documentos_ia: { icon: "📄", label: "Documentos IA" },
  general: { icon: "⚙️", label: "General" },
}

function featureLabel(f: string) {
  return FEATURE_LABELS[f] || { icon: "🔹", label: f }
}

function usd(n: number) {
  return `$${n.toFixed(4)}`
}

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
}

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 13,
  color: "rgba(255,255,255,0.75)",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
}

const tdBoldStyle: React.CSSProperties = { ...tdStyle, color: "#fff", fontWeight: 600 }
const tdUsdStyle: React.CSSProperties = { ...tdStyle, color: "#10b981", fontFamily: "monospace" }
const tdDimStyle: React.CSSProperties = { ...tdStyle, color: "rgba(255,255,255,0.35)", fontSize: 12 }

/* ─── Component ─────────────────────────────────────────────────────────────── */

export default function CreditAnalyticsSection() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [selectedAgency, setSelectedAgency] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

  // ── Fetch analytics ───────────────────────────────────────────────────────
  const fetchData = useCallback(async (agencyId?: string) => {
    setLoading(true)
    try {
      const url = agencyId
        ? `/api/admin-vakdor/dashboard/credit-analytics?agency_id=${agencyId}`
        : "/api/admin-vakdor/dashboard/credit-analytics"
      const res = await fetch(url)
      if (!res.ok) return
      const json: AnalyticsData = await res.json()
      setData(json)
      if (json.agencies?.length && agencies.length === 0) {
        setAgencies(json.agencies)
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [agencies.length])

  // ── Init: load agencies ───────────────────────────────────────────────────
  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── On agency change ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAgency) return
    fetchData(selectedAgency)
  }, [selectedAgency]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAgency) return

    const supabase = createClient()
    const channel = supabase
      .channel(`credit-analytics-${selectedAgency}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_credit_transactions",
          filter: `agency_id=eq.${selectedAgency}`,
        },
        () => {
          // Refetch on new transaction
          fetchData(selectedAgency)
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ai_credit_transactions",
          filter: `agency_id=eq.${selectedAgency}`,
        },
        () => {
          // Refetch when usd_cost gets updated (updateAiTransactionCost)
          fetchData(selectedAgency)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [selectedAgency]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Projections ───────────────────────────────────────────────────────────
  const projections = computeProjections(data)

  return (
    <div style={{ ...cardStyle, borderTop: "3px solid #6366f1", marginTop: 8 }}>
      {/* Header + collapse toggle */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>💰</span>
          <h3 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>
            Analytics de Créditos IA
          </h3>
          {selectedAgency && data?.meta && (
            <span style={{
              fontSize: 11,
              background: "rgba(99,102,241,0.2)",
              color: "#a5b4fc",
              padding: "2px 8px",
              borderRadius: 6,
              fontWeight: 500,
            }}>
              🟢 Tiempo real
            </span>
          )}
        </div>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 18, transition: "transform 0.2s", transform: collapsed ? "rotate(-90deg)" : "rotate(0)" }}>
          ▾
        </span>
      </div>

      {collapsed ? null : (
        <div style={{ marginTop: 16 }}>
          {/* Agency selector */}
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>Agencia:</label>
            <select
              value={selectedAgency}
              onChange={e => setSelectedAgency(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#fff",
                padding: "7px 12px",
                fontSize: 13,
                flex: 1,
                maxWidth: 400,
                outline: "none",
              }}
            >
              <option value="" style={{ background: "#111" }}>— Seleccionar agencia —</option>
              {(agencies.length > 0 ? agencies : data?.agencies || []).map(a => (
                <option key={a.id} value={a.id} style={{ background: "#111" }}>{a.name}</option>
              ))}
            </select>
            {loading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Cargando...</span>}
          </div>

          {!selectedAgency && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", padding: 32, fontSize: 13 }}>
              Seleccioná una agencia para ver el análisis de créditos
            </div>
          )}

          {selectedAgency && data?.meta && (
            <>
              {/* Summary chips */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                <Chip label="Créditos usados" value={data.meta.totalCreditsUsed} />
                <Chip label="Costo real USD" value={usd(data.meta.totalUsd)} color="#10b981" />
                <Chip label="Usuarios activos" value={`${data.meta.activeUsers} / ${data.meta.totalUsers}`} />
                <Chip label="Sin uso" value={data.meta.inactiveUsers} color="#f59e0b" />
                {data.creditConfig && <Chip label="Créditos/mes" value={data.creditConfig.credits_total.toLocaleString()} color="#8b5cf6" />}
              </div>

              {/* 1. Feature Costs Table */}
              <SectionTitle>📐 Precios por Feature (Costo Real Registrado)</SectionTitle>
              <div style={{ overflowX: "auto", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Feature</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Créditos</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Costo USD</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>USD / Crédito</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Usos</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>% del Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.featureCosts.map(f => {
                      const fl = featureLabel(f.feature)
                      const pct = data.meta!.totalCreditsUsed > 0
                        ? ((f.credits / data.meta!.totalCreditsUsed) * 100).toFixed(1)
                        : "0"
                      return (
                        <tr key={f.feature}>
                          <td style={tdBoldStyle}>{fl.icon} {fl.label}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{f.credits}</td>
                          <td style={{ ...tdUsdStyle, textAlign: "right" }}>{usd(f.usd)}</td>
                          <td style={{ ...tdDimStyle, textAlign: "right", fontFamily: "monospace" }}>{usd(f.usdPerCredit)}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{f.usos}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{pct}%</td>
                        </tr>
                      )
                    })}
                    {data.featureCosts.length > 0 && (
                      <tr style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                        <td style={{ ...tdBoldStyle, fontWeight: 700 }}>TOTAL</td>
                        <td style={{ ...tdBoldStyle, textAlign: "right" }}>{data.meta!.totalCreditsUsed}</td>
                        <td style={{ ...tdUsdStyle, textAlign: "right", fontWeight: 700 }}>{usd(data.meta!.totalUsd)}</td>
                        <td style={{ ...tdDimStyle, textAlign: "right", fontFamily: "monospace" }}>
                          {data.meta!.totalCreditsUsed > 0 ? usd(data.meta!.totalUsd / data.meta!.totalCreditsUsed) : "$0.0000"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{data.featureCosts.reduce((s, f) => s + f.usos, 0)}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>100%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 2. User Ranking */}
              <SectionTitle>🏆 Ranking de Usuarios por Consumo + Costo USD</SectionTitle>
              <div style={{ overflowX: "auto", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Usuario</th>
                      <th style={thStyle}>Rol</th>
                      <th style={thStyle}>Agencia</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Créditos</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Costo USD</th>
                      <th style={thStyle}>Features usadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.userRanking.map((u, i) => (
                      <tr key={u.email + i}>
                        <td style={tdDimStyle}>{i + 1}</td>
                        <td style={tdBoldStyle}>
                          <div>{u.full_name}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>{u.email}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 11,
                            padding: "2px 7px",
                            borderRadius: 4,
                            background: u.role === "director" ? "rgba(139,92,246,0.2)" : "rgba(99,102,241,0.15)",
                            color: u.role === "director" ? "#c4b5fd" : "#a5b4fc",
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={tdDimStyle}>{u.agency_name}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{u.credits}</td>
                        <td style={{ ...tdUsdStyle, textAlign: "right" }}>{usd(u.usd)}</td>
                        <td style={{ ...tdDimStyle, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.features}</td>
                      </tr>
                    ))}
                    {data.userRanking.length === 0 && (
                      <tr><td colSpan={7} style={{ ...tdDimStyle, textAlign: "center", padding: 20 }}>Sin consumo registrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 3. Projection Table */}
              {projections && (
                <>
                  <SectionTitle>🔮 Proyección: Si usaran los {data.creditConfig?.credits_total.toLocaleString() || "N/A"} créditos mensuales</SectionTitle>
                  <div style={{ overflowX: "auto", marginBottom: 20 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Feature</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>% del mix</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Créditos proy.</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>USD / Crédito</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Costo USD proy.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projections.byFeature.map(p => {
                          const fl = featureLabel(p.feature)
                          return (
                            <tr key={p.feature}>
                              <td style={tdBoldStyle}>{fl.icon} {fl.label}</td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>{p.pct.toFixed(1)}%</td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>{Math.round(p.projectedCredits).toLocaleString()}</td>
                              <td style={{ ...tdDimStyle, textAlign: "right", fontFamily: "monospace" }}>{usd(p.usdPerCredit)}</td>
                              <td style={{ ...tdUsdStyle, textAlign: "right" }}>{usd(p.projectedUsd)}</td>
                            </tr>
                          )
                        })}
                        <tr style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                          <td style={{ ...tdBoldStyle, fontWeight: 700 }}>TOTAL</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>100%</td>
                          <td style={{ ...tdBoldStyle, textAlign: "right" }}>{data.creditConfig?.credits_total.toLocaleString()}</td>
                          <td style={tdDimStyle} />
                          <td style={{ ...tdUsdStyle, textAlign: "right", fontWeight: 700 }}>{usd(projections.totalProjectedUsd)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 4. Scenarios Table */}
                  <SectionTitle>📋 Escenarios de Proyección</SectionTitle>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}></th>
                          <th style={thStyle}>Escenario</th>
                          <th style={thStyle}>Descripción</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Costo mensual USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projections.scenarios.map((s, i) => (
                          <tr key={i}>
                            <td style={tdStyle}>{s.icon}</td>
                            <td style={tdBoldStyle}>{s.name}</td>
                            <td style={tdDimStyle}>{s.description}</td>
                            <td style={{ ...tdUsdStyle, textAlign: "right", fontWeight: 600 }}>{usd(s.usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function Chip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      padding: "8px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
    }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: color || "#fff" }}>{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 style={{
      color: "#fff",
      fontSize: 13,
      fontWeight: 600,
      margin: "0 0 10px",
      paddingBottom: 6,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {children}
    </h4>
  )
}

/* ─── Projection Calculator ─────────────────────────────────────────────────── */

interface Projection {
  byFeature: Array<{ feature: string; pct: number; projectedCredits: number; usdPerCredit: number; projectedUsd: number }>
  totalProjectedUsd: number
  scenarios: Array<{ icon: string; name: string; description: string; usd: number }>
}

function computeProjections(data: AnalyticsData | null): Projection | null {
  if (!data?.creditConfig || !data.featureCosts.length || !data.meta) return null

  const totalCredits = data.creditConfig.credits_total
  const totalUsed = data.meta.totalCreditsUsed
  if (totalUsed === 0 || totalCredits === 0) return null

  // Project each feature based on its current mix percentage
  const byFeature = data.featureCosts.map(f => {
    const pct = (f.credits / totalUsed) * 100
    const projectedCredits = (pct / 100) * totalCredits
    const usdPerCredit = f.usdPerCredit
    const projectedUsd = projectedCredits * usdPerCredit
    return { feature: f.feature, pct, projectedCredits, usdPerCredit, projectedUsd }
  })

  const totalProjectedUsd = byFeature.reduce((s, f) => s + f.projectedUsd, 0)

  // Find the most/least expensive per-credit features
  const sorted = [...data.featureCosts].sort((a, b) => b.usdPerCredit - a.usdPerCredit)
  const mostExpensive = sorted[0]
  const leastExpensive = sorted[sorted.length - 1]

  const scenarios = [
    {
      icon: "🟢",
      name: "Actual",
      description: `${totalUsed} créd usados (${((totalUsed / totalCredits) * 100).toFixed(1)}% utilización)`,
      usd: data.meta.totalUsd,
    },
    {
      icon: "🟡",
      name: "Mix actual × total",
      description: `Misma proporción de features × ${totalCredits.toLocaleString()} créd`,
      usd: totalProjectedUsd,
    },
    {
      icon: "🔴",
      name: `Peor caso: todo ${featureLabel(mostExpensive.feature).label}`,
      description: `${totalCredits.toLocaleString()} créditos solo ${featureLabel(mostExpensive.feature).label.toLowerCase()}`,
      usd: totalCredits * mostExpensive.usdPerCredit,
    },
    {
      icon: "🟢",
      name: `Mejor caso: todo ${featureLabel(leastExpensive.feature).label}`,
      description: `${totalCredits.toLocaleString()} créditos solo ${featureLabel(leastExpensive.feature).label.toLowerCase()}`,
      usd: totalCredits * leastExpensive.usdPerCredit,
    },
    {
      icon: "🟠",
      name: "Realista: 50% adopción",
      description: `${(totalCredits / 2).toLocaleString()} créd con mix actual`,
      usd: totalProjectedUsd / 2,
    },
  ]

  return { byFeature, totalProjectedUsd, scenarios }
}
