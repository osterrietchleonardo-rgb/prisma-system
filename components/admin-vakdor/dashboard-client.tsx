"use client"
import { useEffect, useState, useCallback } from "react"
import LineChartSVG from "@/components/admin-vakdor/line-chart-svg"
import BarChartDivs from "@/components/admin-vakdor/bar-chart-divs"
import DonutChart from "@/components/admin-vakdor/donut-chart"
import CreditAnalyticsSection from "@/components/admin-vakdor/credit-analytics-section"
import AuditSection from "@/components/admin-vakdor/audit-section"
import type { SnapRow } from "@/lib/admin-vakdor/audit/read"

interface Metricas {
  resumen: {
    agencias: { total: number; activas: number; pausadas: number; eliminadas: number }
    directores: { total: number; activos: number; pausados: number }
    asesores: { total: number; activos: number; pausados: number }
    creditos: { disponibles: number; consumidosHoy: number; consumidosMes: number; consumidosHistorico: number }
    propiedades: number
    facturacion: { mes: number; historico: number; agenciasSinPagoMes: number }
    sugerencias: { pendientes: number; esteMes: number; categoriaMasRepetida: { categoria: string; cantidad: number } | null }
  }
  graficos: {
    evolucionFacturacion: Record<string, number>
    consumoPorAgencia: Record<string, number>
  }
  agenciasList: Array<{ id: string; name: string }>
}

const COLORS = ["#B87333", "#c2783c", "#d99a6c", "#e29e6d", "#8a5a2b"]

function MetricCard({ label, value, sub, color = "#6366f1", icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string
}) {
  return (
    <div style={{
      padding: "20px 22px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardClient({ audit }: {
  audit: { whatsapp: SnapRow[]; sistema: SnapRow | null; redes: SnapRow | null }
}) {
  const [data, setData] = useState<Metricas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actividadAgency, setActividadAgency] = useState<string>("")
  const [activities, setActivities] = useState<any[]>([])
  const [activitiesCount, setActivitiesCount] = useState<number>(0)
  const [activitiesPage, setActivitiesPage] = useState<number>(1)
  const [activitiesLoading, setActivitiesLoading] = useState<boolean>(false)

  const fetchActivities = useCallback(async () => {
    setActivitiesLoading(true)
    try {
      const url = `/api/admin-vakdor/dashboard/user-activity?page=${activitiesPage}&limit=10${
        actividadAgency ? `&agency_id=${actividadAgency}` : ""
      }`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setActivities(json.activities || [])
        setActivitiesCount(json.total || 0)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setActivitiesLoading(false)
    }
  }, [activitiesPage, actividadAgency])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  useEffect(() => {
    fetch("/api/admin-vakdor/dashboard/metricas")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError("Error cargando métricas"); setLoading(false) })
  }, [])

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.4)" }}>
      Cargando métricas...
    </div>
  )
  if (error || !data) return (
    <div style={{ padding: 32, color: "#fca5a5" }}>{error || "Sin datos"}</div>
  )

  const { resumen, graficos, agenciasList } = data

  // Preparar datos de gráficos
  const facturacionData = Object.entries(graficos.evolucionFacturacion)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([mes, monto]) => ({ label: mes.substring(5), value: monto }))

  const agenciasEstadoData = [
    { label: "Activas",   value: resumen.agencias.activas,   color: "#B87333" },
    { label: "Pausadas",  value: resumen.agencias.pausadas,  color: "rgba(192,192,192,0.6)" },
    { label: "Eliminadas",value: resumen.agencias.eliminadas,color: "rgba(192,192,192,0.35)" },
  ].filter(d => d.value > 0)

  const usuariosData = [
    { label: "Dir. Activos",  value: resumen.directores.activos,  color: "#B87333" },
    { label: "Dir. Pausados", value: resumen.directores.pausados, color: "#4b5563" },
    { label: "As. Activos",   value: resumen.asesores.activos,    color: "#c2783c" },
    { label: "As. Pausados",  value: resumen.asesores.pausados,   color: "#374151" },
  ]

  const FEATURE_LABELS: Record<string, string> = {
    consultor_ia: "Consultor IA",
    marketing_ia: "Marketing IA",
    tutor_ia: "Tutor IA",
    propiedades_descripcion: "Descripción de Propiedad",
    documentos_ia: "Documentos IA",
    general: "General",
  }

  return (
    <div style={{ padding: "28px 32px", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Panel Global</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
          Visión general del sistema PRISMA · {new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Auditoría diaria — los 3 expertos (WhatsApp, Salud, Redes) en posición estratégica */}
      <AuditSection whatsapp={audit.whatsapp} sistema={audit.sistema} redes={audit.redes} />

      {/* Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <MetricCard icon="🏢" label="Agencias activas" value={resumen.agencias.activas} sub={`${resumen.agencias.total} en total`} color="#B87333" />
        <MetricCard icon="👤" label="Directores" value={resumen.directores.activos} sub={`${resumen.directores.pausados} pausados`} color="#c2783c" />
        <MetricCard icon="🧑‍💼" label="Asesores" value={resumen.asesores.activos} sub={`${resumen.asesores.pausados} pausados`} color="#d99a6c" />
        <MetricCard icon="🏠" label="Propiedades sync" value={resumen.propiedades.toLocaleString()} color="#e29e6d" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <MetricCard icon="⚡" label="Créditos disponibles" value={resumen.creditos.disponibles.toLocaleString()} sub={`${resumen.creditos.consumidosHoy} hoy`} color="#B87333" />
        <MetricCard icon="📊" label="Consumo este mes" value={resumen.creditos.consumidosMes.toLocaleString()} sub="créditos" color="#c2783c" />
        <MetricCard icon="💰" label="Facturado este mes" value={`$${resumen.facturacion.mes.toLocaleString()}`} sub={`${resumen.facturacion.agenciasSinPagoMes} sin pago`} color="#d99a6c" />
        <MetricCard icon="💬" label="Sugerencias pendientes" value={resumen.sugerencias.pendientes} sub={`${resumen.sugerencias.esteMes} este mes`} color="#e29e6d" />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Facturación mensual — SVG nativo */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Evolución de Facturación</h3>
          <LineChartSVG data={facturacionData} color="#B87333" height={200} />
        </div>

        {/* Estado de agencias — Donut nativo */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Estado de Agencias</h3>
          {agenciasEstadoData.length > 0
            ? <DonutChart data={agenciasEstadoData} size={180} />
            : <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", paddingTop: 40 }}>Sin agencias</div>
          }
        </div>
      </div>

      {/* Users chart */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Usuarios del Sistema</h3>
        <BarChartDivs data={usuariosData} horizontal height={160} />
      </div>

      {/* Activity Log */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>Actividad Reciente de Usuarios</h3>
            {activitiesLoading && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Cargando...</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Agencia:</span>
            <select
              value={actividadAgency}
              onChange={e => {
                setActividadAgency(e.target.value)
                setActivitiesPage(1)
              }}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                color: "#fff",
                padding: "4px 10px",
                fontSize: 12,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="" style={{ background: "#111" }}>Todas las agencias</option>
              {agenciasList?.map(a => (
                <option key={a.id} value={a.id} style={{ background: "#111" }}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
        {activities.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 24 }}>Sin actividad registrada</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {activities.map((log) => (
                <div key={log.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: 6,
                  transition: "background 0.1s",
                }}>
                  <div style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: log.feature === "marketing_ia" ? "#c2783c" : log.feature === "tutor_ia" ? "#d99a6c" : log.feature === "propiedades_descripcion" ? "#e29e6d" : "#B87333",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                    <strong style={{ color: "#fff" }}>{log.userName}</strong>{" "}
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>({log.userRole})</span> de{" "}
                    <span style={{ color: "#d99a6c" }}>{log.agencyName}</span> usó{" "}
                    <strong style={{ color: "#f3f4f6" }}>{FEATURE_LABELS[log.feature] || log.feature}</strong>{" "}
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>({log.creditsConsumed} {log.creditsConsumed === 1 ? "crédito" : "créditos"})</span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                    {new Date(log.timestamp).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>

            {/* Paginación */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                Total: {activitiesCount} · Página {activitiesPage} de {Math.ceil(activitiesCount / 10) || 1}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={activitiesPage === 1 || activitiesLoading}
                  onClick={() => setActivitiesPage(p => Math.max(1, p - 1))}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    color: activitiesPage === 1 ? "rgba(255,255,255,0.2)" : "#fff",
                    padding: "5px 12px",
                    fontSize: 12,
                    cursor: activitiesPage === 1 ? "default" : "pointer",
                    outline: "none",
                  }}
                >
                  Anterior
                </button>
                <button
                  disabled={activitiesPage >= Math.ceil(activitiesCount / 10) || activitiesLoading}
                  onClick={() => setActivitiesPage(p => p + 1)}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    color: activitiesPage >= Math.ceil(activitiesCount / 10) ? "rgba(255,255,255,0.2)" : "#fff",
                    padding: "5px 12px",
                    fontSize: 12,
                    cursor: activitiesPage >= Math.ceil(activitiesCount / 10) ? "default" : "pointer",
                    outline: "none",
                  }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <CreditAnalyticsSection />
      </div>
    </div>
  )
}
