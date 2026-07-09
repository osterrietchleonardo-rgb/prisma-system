"use client"
import { useState } from "react"
import type { ReactNode } from "react"
import { motion } from "motion/react"
import type { SnapRow } from "@/lib/admin-vakdor/audit/read"
import { PanelExperto, Kpi, Grid, Semaforo } from "./metricas-primitivos"

/** Encabezado de un grupo (app/sistema/tema) con acento cobre. */
function GrupoTitulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#e29e6d", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
      {children}
    </div>
  )
}

/** Un grupo = título + grilla de KPIs. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <GrupoTitulo>{titulo}</GrupoTitulo>
      <Grid>{children}</Grid>
    </div>
  )
}

/** Render de métricas que ya vienen agrupadas en metricas.grupos (Salud, Redes). */
function GruposDeDatos({ grupos }: { grupos?: Record<string, Record<string, any>> }) {
  const entries = Object.entries(grupos ?? {})
  if (!entries.length) return <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Sin datos todavía (corre 06:30).</p>
  return (
    <>
      {entries.map(([grupo, kvs]) => (
        <Grupo key={grupo} titulo={grupo}>
          {Object.entries(kvs ?? {}).map(([k, v]) => (
            <Kpi key={k} label={k} value={String(v)} />
          ))}
        </Grupo>
      ))}
    </>
  )
}

/** Desglose de n8n por workflow: estado · errores · causa · corrección. */
function N8nWorkflows({ data }: { data?: Record<string, { estado: string; errores: string; causa: string; correccion: string }> }) {
  const entries = Object.entries(data ?? {})
  if (!entries.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <GrupoTitulo>n8n · desglose por workflow</GrupoTitulo>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map(([nombre, w]) => (
          <div key={nombre} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Semaforo estado={w.estado} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{nombre}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginLeft: "auto" }}>{w.errores}</span>
            </div>
            {w.causa && w.causa !== "—" && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginTop: 6 }}>
                <span style={{ color: "#e29e6d", fontWeight: 600 }}>Causa:</span> {w.causa}
              </div>
            )}
            {w.correccion && !["—", "Sin acción."].includes(w.correccion) && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginTop: 3 }}>
                <span style={{ color: "#16a34a", fontWeight: 600 }}>Corrección:</span> {w.correccion}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AuditSection({
  whatsapp, sistema, redes,
}: { whatsapp: SnapRow[]; sistema: SnapRow | null; redes: SnapRow | null }) {
  const global = whatsapp.find((w) => w.scope === "global")
  const [scope, setScope] = useState<string>("global")
  const waActual = whatsapp.find((w) => w.scope === scope) ?? global
  const m = waActual?.metricas ?? {}

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Encabezado de sección + barra resumen de los 3 semáforos */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 4, height: 18, background: "#B87333", borderRadius: 2, display: "inline-block" }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 }}>Auditoría diaria del sistema</h2>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          <span><Semaforo estado={global?.semaforo ?? "gris"} /> WhatsApp</span>
          <span><Semaforo estado={sistema?.semaforo ?? "gris"} /> Salud</span>
          <span><Semaforo estado={redes?.semaforo ?? "gris"} /> Redes</span>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* PANEL 1 — WHATSAPP (global + toggle por agencia), agrupado por tema */}
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
            <Grupo titulo="Actividad">
              <Kpi label="Leads nuevos" value={m.leads_nuevos ?? 0} />
              <Kpi label="Conv. activas" value={m.conversaciones_activas ?? 0} />
              <Kpi label="Msgs in / out" value={`${m.msgs_entrantes ?? 0}/${m.msgs_salientes ?? 0}`} />
              <Kpi label="Contactos nuevos" value={m.contactos_nuevos ?? 0} />
            </Grupo>
            <Grupo titulo="Atención / SLA">
              <Kpi label="Sin responder" value={m.sin_responder_total ?? 0} sub={`${m.sin_responder_6h ?? 0} +6h`} />
              <Kpi label="Agente ciego" value={m.agente_ciego ?? 0} />
              <Kpi label="1ª respuesta" value={m.primera_respuesta_min_mediana ?? "—"} sub="min (mediana)" />
              <Kpi label="Tasa respuesta" value={m.tasa_respuesta_pct != null ? `${m.tasa_respuesta_pct}%` : "—"} />
            </Grupo>
            <Grupo titulo="Embudo">
              <Kpi label="Calificados" value={m.calificados ?? 0} />
              <Kpi label="Prop. mostradas" value={m.propiedades_mostradas ?? 0} />
              <Kpi label="Visitas agendadas" value={m.visitas_agendadas ?? 0} />
              <Kpi label="Handoffs" value={m.handoffs ?? 0} />
            </Grupo>
            <Grupo titulo="Origen">
              <Kpi label="Campaña / orgánico" value={`${m.origen_campana ?? 0}/${m.origen_organico ?? 0}`} />
              <Kpi label="Reactivaciones" value={m.reactivaciones ?? 0} />
              <Kpi label="Enfriados" value={m.enfriados ?? 0} />
            </Grupo>
          </PanelExperto>
        )}

        {/* PANEL 2 — SALUD (agrupado por app/sistema) */}
        <PanelExperto titulo="2 · Salud del sistema" semaforo={sistema?.semaforo ?? "gris"} resumen={sistema?.resumen}>
          <GruposDeDatos grupos={sistema?.metricas?.grupos} />
          <N8nWorkflows data={sistema?.metricas?.n8n_workflows} />
        </PanelExperto>

        {/* PANEL 3 — REDES (agrupado por fuente) */}
        <PanelExperto titulo="3 · Redes / SEO / Meta" semaforo={redes?.semaforo ?? "gris"} resumen={redes?.resumen}>
          <GruposDeDatos grupos={redes?.metricas?.grupos} />
        </PanelExperto>
      </motion.div>
    </div>
  )
}
