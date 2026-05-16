"use client"
import { useEffect, useState } from "react"
import LineChartSVG from "@/components/admin-vakdor/line-chart-svg"
import BarChartDivs from "@/components/admin-vakdor/bar-chart-divs"
import DonutChart from "@/components/admin-vakdor/donut-chart"

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
  actividadReciente: Array<{
    id: string
    accion: string
    entidad_tipo: string
    entidad_id: string
    timestamp: string
    ip_address: string
  }>
}

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"]

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

export default function DashboardClient() {
  const [data, setData] = useState<Metricas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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

  const { resumen, graficos, actividadReciente } = data

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
    { label: "Dir. Activos",  value: resumen.directores.activos,  color: "#6366f1" },
    { label: "Dir. Pausados", value: resumen.directores.pausados, color: "#4b5563" },
    { label: "As. Activos",   value: resumen.asesores.activos,    color: "#8b5cf6" },
    { label: "As. Pausados",  value: resumen.asesores.pausados,   color: "#374151" },
  ]

  const ACCION_LABELS: Record<string, string> = {
    LOGIN: "Inicio de sesión",
    AGENCIA_PAUSAR: "Agencia pausada",
    AGENCIA_ACTIVAR: "Agencia activada",
    AGENCIA_ELIMINAR: "Agencia eliminada",
    CREDITOS_AGREGAR: "Créditos agregados",
    CREDITOS_RESTAR: "Créditos restados",
    CREDITOS_ESTABLECER: "Créditos establecidos",
    PAGO_REGISTRADO: "Pago registrado",
    DIRECTOR_PAUSAR: "Director pausado",
    DIRECTOR_ACTIVAR: "Director activado",
    DIRECTOR_ELIMINAR: "Director eliminado",
    ASESOR_PAUSAR: "Asesor pausado",
    ASESOR_ELIMINAR: "Asesor eliminado",
    SUGERENCIA_RESUELTA: "Sugerencia resuelta",
    USUARIO_DESBLOQUEADO: "Usuario desbloqueado",
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

      {/* Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <MetricCard icon="🏢" label="Agencias activas" value={resumen.agencias.activas} sub={`${resumen.agencias.total} en total`} color="#6366f1" />
        <MetricCard icon="👤" label="Directores" value={resumen.directores.activos} sub={`${resumen.directores.pausados} pausados`} color="#8b5cf6" />
        <MetricCard icon="🧑‍💼" label="Asesores" value={resumen.asesores.activos} sub={`${resumen.asesores.pausados} pausados`} color="#a78bfa" />
        <MetricCard icon="🏠" label="Propiedades sync" value={resumen.propiedades.toLocaleString()} color="#7c3aed" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <MetricCard icon="⚡" label="Créditos disponibles" value={resumen.creditos.disponibles.toLocaleString()} sub={`${resumen.creditos.consumidosHoy} hoy`} color="#10b981" />
        <MetricCard icon="📊" label="Consumo este mes" value={resumen.creditos.consumidosMes.toLocaleString()} sub="créditos" color="#059669" />
        <MetricCard icon="💰" label="Facturado este mes" value={`$${resumen.facturacion.mes.toLocaleString()}`} sub={`${resumen.facturacion.agenciasSinPagoMes} sin pago`} color="#f59e0b" />
        <MetricCard icon="💬" label="Sugerencias pendientes" value={resumen.sugerencias.pendientes} sub={`${resumen.sugerencias.esteMes} este mes`} color="#ef4444" />
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
        <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Actividad Reciente</h3>
        {actividadReciente.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 24 }}>Sin actividad registrada</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {actividadReciente.slice(0, 15).map((log) => (
              <div key={log.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 10px",
                borderRadius: 6,
                transition: "background 0.1s",
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: log.accion.includes("ELIMINAR") ? "#ef4444" : log.accion.includes("PAUSAR") ? "#f59e0b" : "#10b981",
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  {ACCION_LABELS[log.accion] || log.accion}
                  {log.entidad_tipo && <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>· {log.entidad_tipo}</span>}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                  {new Date(log.timestamp).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
