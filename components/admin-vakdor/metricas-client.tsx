"use client"
import { useState } from "react"
import { motion } from "motion/react"
import type { SnapRow } from "@/lib/admin-vakdor/audit/read"
import { PanelExperto, Kpi, Grid, Semaforo } from "./metricas-primitivos"

export default function MetricasClient({
  whatsapp, sistema, redes,
}: { whatsapp: SnapRow[]; sistema: SnapRow | null; redes: SnapRow | null }) {
  const global = whatsapp.find((w) => w.scope === "global")
  const [scope, setScope] = useState<string>("global")
  const waActual = whatsapp.find((w) => w.scope === scope) ?? global

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Encabezado + barra resumen */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Métricas</h1>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          <span><Semaforo estado={global?.semaforo ?? "gris"} /> WhatsApp</span>
          <span><Semaforo estado={sistema?.semaforo ?? "gris"} /> Salud</span>
          <span><Semaforo estado={redes?.semaforo ?? "gris"} /> Redes</span>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* PANEL 1 — WHATSAPP */}
        {waActual && (
          <PanelExperto
            titulo="1 · WhatsApp"
            semaforo={waActual.semaforo}
            resumen={waActual.resumen}
            right={
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                style={{ background: "#131A2D", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}
              >
                <option value="global">Global</option>
                {whatsapp.filter((w) => w.scope !== "global").map((w) => (
                  <option key={w.scope} value={w.scope}>{w.metricas?.agencia ?? w.scope}</option>
                ))}
              </select>
            }
          >
            <Grid>
              <Kpi label="Leads nuevos" value={waActual.metricas.leads_nuevos ?? 0} />
              <Kpi label="Conv. activas" value={waActual.metricas.conversaciones_activas ?? 0} />
              <Kpi label="Sin responder" value={waActual.metricas.sin_responder_total ?? 0} sub={`${waActual.metricas.sin_responder_6h ?? 0} +6h`} />
              <Kpi label="Agente ciego" value={waActual.metricas.agente_ciego ?? 0} />
              <Kpi label="1ª respuesta" value={waActual.metricas.primera_respuesta_min_mediana ?? "—"} sub="min (mediana)" />
              <Kpi label="Tasa respuesta" value={waActual.metricas.tasa_respuesta_pct != null ? `${waActual.metricas.tasa_respuesta_pct}%` : "—"} />
              <Kpi label="Calificados" value={waActual.metricas.calificados ?? 0} />
              <Kpi label="Prop. mostradas" value={waActual.metricas.propiedades_mostradas ?? 0} />
              <Kpi label="Visitas agendadas" value={waActual.metricas.visitas_agendadas ?? 0} />
              <Kpi label="Handoffs" value={waActual.metricas.handoffs ?? 0} />
              <Kpi label="Campaña / orgánico" value={`${waActual.metricas.origen_campana ?? 0}/${waActual.metricas.origen_organico ?? 0}`} />
              <Kpi label="Enfriados" value={waActual.metricas.enfriados ?? 0} />
            </Grid>
          </PanelExperto>
        )}

        {/* PANEL 2 — SALUD (lo llena la routine; si no hay datos, gris) */}
        <PanelExperto titulo="2 · Salud del sistema" semaforo={sistema?.semaforo ?? "gris"} resumen={sistema?.resumen}>
          {sistema ? (
            <Grid>
              {Object.entries(sistema.metricas?.servicios ?? {}).map(([k, v]) => (
                <Kpi key={k} label={k} value={String((v as any)?.estado ?? v)} />
              ))}
            </Grid>
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Sin datos todavía (corre 06:30).</p>
          )}
        </PanelExperto>

        {/* PANEL 3 — REDES */}
        <PanelExperto titulo="3 · Redes / SEO / Meta" semaforo={redes?.semaforo ?? "gris"} resumen={redes?.resumen}>
          {redes ? (
            <Grid>
              {Object.entries(redes.metricas?.kpis ?? {}).map(([k, v]) => (
                <Kpi key={k} label={k} value={String(v)} />
              ))}
            </Grid>
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Sin datos todavía (corre 06:30).</p>
          )}
        </PanelExperto>
      </motion.div>
    </div>
  )
}
