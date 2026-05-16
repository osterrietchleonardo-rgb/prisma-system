"use client"
import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"

const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  activo: { label: "Activo", bg: "rgba(16,185,129,0.15)", color: "#34d399" },
  pausado: { label: "Pausado", bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  eliminado: { label: "Eliminado", bg: "rgba(239,68,68,0.15)", color: "#f87171" },
}

function Badge({ estado }: { estado: string }) {
  const s = ESTADO_BADGE[estado] || ESTADO_BADGE.activo
  return (
    <span style={{ padding: "2px 9px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h3 style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</h3>
      {children}
    </div>
  )
}

export default function AgenciaDetalleClient() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [creditModal, setCreditModal] = useState(false)
  const [pagoModal, setPagoModal] = useState(false)
  const [creditForm, setCreditForm] = useState({ accion: "agregar", cantidad: 0, motivo: "" })
  const [pagoForm, setPagoForm] = useState({ monto: "", moneda: "ARS", periodo_mes: "", notas: "" })
  const [msg, setMsg] = useState("")

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin-vakdor/agencias/${id}`)
    const d = await res.json()
    setData(d)
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  async function cambiarEstado(accion: string) {
    const motivo = prompt(`Motivo para ${accion}:`)
    if (!motivo) return
    setActionLoading(true)
    const res = await fetch(`/api/admin-vakdor/agencias/${id}/estado`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, motivo }),
    })
    if (res.ok) { fetchData(); setMsg(`Agencia ${accion} correctamente`) }
    else { const d = await res.json(); setMsg(d.error || "Error") }
    setActionLoading(false)
  }

  async function cambiarEstadoUsuario(uid: string, rol: string, accion: string) {
    const motivo = prompt(`Motivo para ${accion} ${rol}:`)
    if (!motivo) return
    const endpoint = `/api/admin-vakdor/${rol === "director" ? "directores" : "asesores"}/${uid}/estado`
    const res = await fetch(endpoint, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, motivo }),
    })
    if (res.ok) { fetchData(); setMsg(`${rol} ${accion} correctamente`) }
    setActionLoading(false)
  }

  async function aplicarCredito() {
    setActionLoading(true)
    const res = await fetch(`/api/admin-vakdor/agencias/${id}/creditos`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creditForm),
    })
    if (res.ok) { fetchData(); setCreditModal(false); setMsg("Créditos actualizados") }
    else { const d = await res.json(); setMsg(d.error) }
    setActionLoading(false)
  }

  async function registrarPago() {
    setActionLoading(true)
    const res = await fetch(`/api/admin-vakdor/agencias/${id}/pagos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pagoForm, monto: parseFloat(pagoForm.monto) }),
    })
    const d = await res.json()
    if (res.ok) { fetchData(); setPagoModal(false); setMsg("Pago registrado") }
    else if (d.error === "PAGO_EXISTENTE") {
      if (confirm("Ya existe un pago para este período. ¿Reemplazar?")) {
        const res2 = await fetch(`/api/admin-vakdor/agencias/${id}/pagos`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pagoForm, monto: parseFloat(pagoForm.monto), forzar: true }),
        })
        if (res2.ok) { fetchData(); setPagoModal(false); setMsg("Pago actualizado") }
      }
    } else { setMsg(d.error) }
    setActionLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando...</div>
  if (!data) return <div style={{ padding: 40, color: "#f87171" }}>Agencia no encontrada</div>

  const { agencia, directores, asesores, creditos, historialCreditos, tokko, pagos, sugerencias, usuariosEliminados } = data

  const inputStyle = {
    width: "100%", padding: "9px 12px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" as const,
  }
  const btnStyle = (variant: "primary" | "danger" | "warning" | "ghost") => ({
    padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
    background: variant === "primary" ? "rgba(99,102,241,0.2)" : variant === "danger" ? "rgba(239,68,68,0.15)" : variant === "warning" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.07)",
    color: variant === "primary" ? "#a5b4fc" : variant === "danger" ? "#f87171" : variant === "warning" ? "#fbbf24" : "rgba(255,255,255,0.6)",
  })

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      {/* Back + Header */}
      <button onClick={() => router.push("/admin-vakdor/agencias")} style={{ ...btnStyle("ghost"), marginBottom: 16 }}>← Volver</button>

      {msg && (
        <div style={{ padding: "10px 14px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "#a5b4fc", fontSize: 13, marginBottom: 16 }}
          onClick={() => setMsg("")}>
          {msg} · <span style={{ opacity: 0.6 }}>Click para cerrar</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>{agencia.name}</h1>
            <Badge estado={agencia.estado || "activo"} />
          </div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
            {agencia.email} · Desde {new Date(agencia.created_at).toLocaleDateString("es-AR")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(agencia.estado === "activo" || !agencia.estado) && (
            <button onClick={() => cambiarEstado("pausar")} style={btnStyle("warning")} disabled={actionLoading}>Pausar</button>
          )}
          {agencia.estado === "pausado" && (
            <button onClick={() => cambiarEstado("activar")} style={btnStyle("primary")} disabled={actionLoading}>Activar</button>
          )}
          {agencia.estado !== "eliminado" && (
            <button onClick={() => cambiarEstado("eliminar")} style={btnStyle("danger")} disabled={actionLoading}>Eliminar</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Créditos */}
        <Section title="💰 Créditos">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[
              { l: "Total", v: creditos?.credits_total ?? "–" },
              { l: "Usado", v: creditos?.credits_used ?? "–" },
              { l: "Disponible", v: creditos ? creditos.credits_total - creditos.credits_used : "–" },
            ].map(({ l, v }) => (
              <div key={l} style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{l}</div>
                <div style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setCreditModal(true)} style={btnStyle("primary")}>Ajustar créditos</button>
          {historialCreditos.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 6 }}>Últimos movimientos</div>
              {historialCreditos.slice(0, 5).map((l: any) => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
                  <span style={{ color: l.accion === "restar" ? "#f87171" : "#34d399" }}>
                    {l.accion === "agregar" ? "+" : l.accion === "restar" ? "-" : "="}{Math.abs(l.cantidad_nueva - l.cantidad_anterior)}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{l.motivo.substring(0, 30)}</span>
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>{new Date(l.timestamp).toLocaleDateString("es-AR")}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Tokko Sync */}
        <Section title="🔄 Tokko Sync">
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Estado de conexión</div>
            <div style={{ color: tokko.estadoConexion === "activa" ? "#34d399" : "#f87171", fontSize: 14, fontWeight: 600 }}>
              {tokko.estadoConexion === "activa" ? "✓ Conectado" : "✗ Sin credenciales"}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Propiedades</div>
              <div style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>{tokko.totalPropiedades}</div>
            </div>
            <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Última sync</div>
              <div style={{ color: "#fff", fontSize: 12 }}>{tokko.ultimaSync ? new Date(tokko.ultimaSync).toLocaleDateString("es-AR") : "–"}</div>
            </div>
          </div>
        </Section>

        {/* Pagos */}
        <Section title="💳 Pagos">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Total acumulado</div>
              <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>${pagos.totalAcumulado.toLocaleString()}</div>
            </div>
            <div>
              {pagos.tienePagoMesActual
                ? <span style={{ color: "#34d399", fontSize: 12 }}>✓ Pago {pagos.mesActual}</span>
                : <span style={{ color: "#f87171", fontSize: 12 }}>✗ Sin pago {pagos.mesActual}</span>
              }
            </div>
            <button onClick={() => setPagoModal(true)} style={btnStyle("primary")}>+ Registrar pago</button>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {pagos.historial.slice(0, 8).map((p: any) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{p.periodo_mes}</span>
                <span style={{ color: "#34d399", fontWeight: 600 }}>${Number(p.monto).toLocaleString()} {p.moneda}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Sugerencias */}
        <Section title="💬 Sugerencias">
          <div style={{ marginBottom: 10 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{sugerencias.total} registradas</span>
          </div>
          {sugerencias.recientes.slice(0, 5).map((s: any) => (
            <div key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
              <span style={{ color: "#a5b4fc", marginRight: 8 }}>[{s.type}]</span>
              <span style={{ color: "rgba(255,255,255,0.6)" }}>{(s.content || "").substring(0, 60)}...</span>
            </div>
          ))}
          <button
            style={{ ...btnStyle("ghost"), marginTop: 10 }}
            onClick={() => router.push(`/admin-vakdor/sugerencias?agencia_id=${id}`)}
          >
            Ver todas →
          </button>
        </Section>
      </div>

      {/* Directores */}
      <Section title={`👤 Directores (${directores.length})`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {directores.map((d: any) => (
            <div key={d.id} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontSize: 13 }}>{d.full_name}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{d.email}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Badge estado={d.estado || "activo"} />
                {d.estado !== "eliminado" && (
                  <button
                    onClick={() => cambiarEstadoUsuario(d.id, "director", d.estado === "pausado" ? "activar" : "pausar")}
                    style={btnStyle(d.estado === "pausado" ? "primary" : "warning")}
                  >
                    {d.estado === "pausado" ? "Activar" : "Pausar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Asesores */}
      <Section title={`🧑‍💼 Asesores (${asesores.length})`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {asesores.map((a: any) => (
            <div key={a.id} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontSize: 13 }}>{a.full_name}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{a.email}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Badge estado={a.estado || "activo"} />
                {a.estado !== "eliminado" && (
                  <button
                    onClick={() => cambiarEstadoUsuario(a.id, "asesor", a.estado === "pausado" ? "activar" : "pausar")}
                    style={btnStyle(a.estado === "pausado" ? "primary" : "warning")}
                  >
                    {a.estado === "pausado" ? "Activar" : "Pausar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Usuarios eliminados */}
      {usuariosEliminados.length > 0 && (
        <Section title={`🗑 Usuarios Eliminados (${usuariosEliminados.length})`}>
          {usuariosEliminados.map((u: any) => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{u.full_name}</span>
                <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginLeft: 8 }}>({u.role})</span>
              </div>
              <button
                onClick={async () => {
                  const motivo = prompt("Motivo para desbloquear:")
                  if (!motivo) return
                  await fetch(`/api/admin-vakdor/usuarios/${u.id}/desbloquear`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ motivo }),
                  })
                  fetchData()
                  setMsg("Usuario desbloqueado")
                }}
                style={btnStyle("primary")}
              >
                Desbloquear
              </button>
            </div>
          ))}
        </Section>
      )}

      {/* Credit Modal */}
      {creditModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 28, width: 380 }}>
            <h3 style={{ color: "#fff", margin: "0 0 18px" }}>Ajustar Créditos</h3>
            <select value={creditForm.accion} onChange={e => setCreditForm(f => ({ ...f, accion: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }}>
              <option value="agregar">Agregar</option>
              <option value="restar">Restar</option>
              <option value="establecer">Establecer en</option>
            </select>
            <input type="number" min={0} placeholder="Cantidad" value={creditForm.cantidad}
              onChange={e => setCreditForm(f => ({ ...f, cantidad: Number(e.target.value) }))} style={{ ...inputStyle, marginBottom: 10 }} />
            <input placeholder="Motivo *" value={creditForm.motivo}
              onChange={e => setCreditForm(f => ({ ...f, motivo: e.target.value }))} style={{ ...inputStyle, marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={aplicarCredito} disabled={!creditForm.motivo || actionLoading} style={{ ...btnStyle("primary"), flex: 1 }}>
                {actionLoading ? "Guardando..." : "Aplicar"}
              </button>
              <button onClick={() => setCreditModal(false)} style={{ ...btnStyle("ghost"), flex: 1 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Pago Modal */}
      {pagoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 28, width: 380 }}>
            <h3 style={{ color: "#fff", margin: "0 0 18px" }}>Registrar Pago</h3>
            <input type="month" value={pagoForm.periodo_mes}
              onChange={e => setPagoForm(f => ({ ...f, periodo_mes: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input type="number" min={0} placeholder="Monto" value={pagoForm.monto}
                onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              <select value={pagoForm.moneda} onChange={e => setPagoForm(f => ({ ...f, moneda: e.target.value }))} style={{ ...inputStyle, width: 80 }}>
                <option>ARS</option><option>USD</option>
              </select>
            </div>
            <input placeholder="Notas (opcional)" value={pagoForm.notas}
              onChange={e => setPagoForm(f => ({ ...f, notas: e.target.value }))} style={{ ...inputStyle, marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={registrarPago} disabled={!pagoForm.monto || !pagoForm.periodo_mes || actionLoading} style={{ ...btnStyle("primary"), flex: 1 }}>
                {actionLoading ? "Guardando..." : "Registrar"}
              </button>
              <button onClick={() => setPagoModal(false)} style={{ ...btnStyle("ghost"), flex: 1 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
