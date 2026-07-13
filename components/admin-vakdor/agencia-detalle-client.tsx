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
  const [creditForm, setCreditForm] = useState({ credits_total: 0, credits_director: 0, credits_asesores: 0, motivo: "" })
  const [creditInfo, setCreditInfo] = useState<{ numAsesores: number; creditsPorAsesor: number } | null>(null)
  const [pagoForm, setPagoForm] = useState({ id: "", monto: "", moneda: "ARS", periodo_mes: "", notas: "" })
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

  async function openCreditModal() {
    const res = await fetch(`/api/admin-vakdor/agencias/${id}/creditos`)
    const d = await res.json()
    if (res.ok) {
      setCreditForm({
        credits_total:    d.creditos?.credits_total    ?? 0,
        credits_director: d.creditos?.credits_director ?? 0,
        credits_asesores: d.creditos?.credits_asesores ?? 0,
        motivo: "",
      })
      setCreditInfo({ numAsesores: d.numAsesores, creditsPorAsesor: d.creditsPorAsesor })
    }
    setCreditModal(true)
  }

  async function aplicarCredito() {
    setActionLoading(true)
    const res = await fetch(`/api/admin-vakdor/agencias/${id}/creditos`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creditForm),
    })
    const d = await res.json()
    if (res.ok) {
      fetchData()
      setCreditModal(false)
      setMsg(`Créditos actualizados: ${d.creditos.credits_total} total · ${d.creditos.credits_director} director · ${d.creditos.credits_asesores} asesores (${d.creditsPorAsesor} c/u)`)
    } else {
      setMsg(d.error)
    }
    setActionLoading(false)
  }

  function abrirNuevoPago() {
    setPagoForm({ id: "", monto: "", moneda: "ARS", periodo_mes: "", notas: "" })
    setPagoModal(true)
  }

  function editarPago(p: any) {
    setPagoForm({
      id: p.id,
      monto: String(p.monto),
      moneda: p.moneda,
      periodo_mes: p.periodo_mes,
      notas: p.notas ?? "",
    })
    setPagoModal(true)
  }

  async function guardarPago() {
    setActionLoading(true)
    const payload = {
      monto: parseFloat(pagoForm.monto),
      moneda: pagoForm.moneda,
      periodo_mes: pagoForm.periodo_mes,
      notas: pagoForm.notas,
    }

    // Editar un pago existente (PATCH).
    if (pagoForm.id) {
      const res = await fetch(`/api/admin-vakdor/pagos/${pagoForm.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (res.ok) { fetchData(); setPagoModal(false); setMsg("Pago actualizado") }
      else if (d.error === "PERIODO_OCUPADO") { setMsg(d.mensaje || "Ya hay un pago para ese mes en esta agencia.") }
      else { setMsg(d.error || "Error al editar el pago") }
      setActionLoading(false)
      return
    }

    // Registrar un pago nuevo (POST).
    const res = await fetch(`/api/admin-vakdor/agencias/${id}/pagos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const d = await res.json()
    if (res.ok) { fetchData(); setPagoModal(false); setMsg("Pago registrado") }
    else if (d.error === "PAGO_EXISTENTE") {
      if (confirm("Ya existe un pago para este período. ¿Reemplazar?")) {
        const res2 = await fetch(`/api/admin-vakdor/agencias/${id}/pagos`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, forzar: true }),
        })
        if (res2.ok) { fetchData(); setPagoModal(false); setMsg("Pago actualizado") }
      }
    } else { setMsg(d.error) }
    setActionLoading(false)
  }

  async function borrarPago(p: any) {
    if (!confirm(`¿Borrar el pago de ${p.periodo_mes} ($${Number(p.monto).toLocaleString()} ${p.moneda})? No se puede deshacer.`)) return
    setActionLoading(true)
    const res = await fetch(`/api/admin-vakdor/pagos/${p.id}`, { method: "DELETE" })
    if (res.ok) { fetchData(); setMsg("Pago eliminado") }
    else { const d = await res.json().catch(() => ({})); setMsg(d.error || "Error al eliminar el pago") }
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
          {/* Totales */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { l: "Total mensual", v: creditos?.credits_total ?? "–", c: "#fff" },
              { l: "Usado",         v: creditos?.credits_used  ?? "–", c: creditos && creditos.credits_used > creditos.credits_total * 0.8 ? "#f87171" : "rgba(255,255,255,0.9)" },
              { l: "Disponible",    v: creditos ? creditos.credits_total - creditos.credits_used : "–", c: "#34d399" },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ textAlign: "center", padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{l}</div>
                <div style={{ color: c, fontSize: 20, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
          {/* Distribución por rol */}
          <div style={{ background: "rgba(184,115,51,0.08)", border: "1px solid rgba(184,115,51,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Distribución mensual</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Director</div>
                <div style={{ color: "#B87333", fontSize: 16, fontWeight: 700 }}>{creditos?.credits_director ?? 0}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>usados: {creditos?.credits_used_director ?? 0}</div>
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Pool asesores</div>
                <div style={{ color: "#B87333", fontSize: 16, fontWeight: 700 }}>{creditos?.credits_asesores ?? 0}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>usados: {creditos?.credits_used_asesores ?? 0}</div>
              </div>
            </div>
          </div>
          <button onClick={openCreditModal} style={btnStyle("primary")}>Configurar distribución →</button>
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
            <button onClick={abrirNuevoPago} style={btnStyle("primary")}>+ Registrar pago</button>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {pagos.historial.slice(0, 8).map((p: any) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{p.periodo_mes}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#34d399", fontWeight: 600 }}>${Number(p.monto).toLocaleString()} {p.moneda}</span>
                  <button onClick={() => editarPago(p)} disabled={actionLoading} title="Editar pago"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1, padding: 0 }}>✏️</button>
                  <button onClick={() => borrarPago(p)} disabled={actionLoading} title="Borrar pago"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(239,68,68,0.75)", fontSize: 13, lineHeight: 1, padding: 0 }}>🗑️</button>
                </div>
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

      {/* Credit Modal — Distribución */}
      {creditModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 28, width: 420 }}>
            <h3 style={{ color: "#fff", margin: "0 0 6px" }}>Configurar Créditos Mensuales</h3>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: "0 0 20px", lineHeight: 1.5 }}>
              Los créditos se renuevan el 1° de cada mes sin acumular sobrante.
            </p>

            {/* Total */}
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 4 }}>TOTAL MENSUAL DE AGENCIA</label>
            <input type="number" min={0} value={creditForm.credits_total}
              onChange={e => setCreditForm(f => ({ ...f, credits_total: Number(e.target.value) }))}
              style={{ ...inputStyle, marginBottom: 16, fontSize: 18, fontWeight: 700 }} />

            {/* Validación suma */}
            {creditForm.credits_director + creditForm.credits_asesores > creditForm.credits_total && (
              <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 6 }}>
                ⚠ Director + Asesores ({creditForm.credits_director + creditForm.credits_asesores}) supera el total ({creditForm.credits_total})
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {/* Director */}
              <div>
                <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 4 }}>CUOTA DIRECTOR</label>
                <input type="number" min={0} max={creditForm.credits_total} value={creditForm.credits_director}
                  onChange={e => setCreditForm(f => ({ ...f, credits_director: Number(e.target.value) }))}
                  style={{ ...inputStyle, color: "#B87333" }} />
              </div>
              {/* Asesores */}
              <div>
                <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 4 }}>POOL ASESORES</label>
                <input type="number" min={0} max={creditForm.credits_total} value={creditForm.credits_asesores}
                  onChange={e => setCreditForm(f => ({ ...f, credits_asesores: Number(e.target.value) }))}
                  style={{ ...inputStyle, color: "#B87333" }} />
              </div>
            </div>

            {/* Info por asesor */}
            {creditInfo && creditInfo.numAsesores > 0 && (
              <div style={{ padding: "8px 12px", background: "rgba(184,115,51,0.08)", border: "1px solid rgba(184,115,51,0.2)", borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{creditInfo.numAsesores} asesor{creditInfo.numAsesores !== 1 ? "es" : ""} activos → </span>
                <span style={{ color: "#B87333", fontWeight: 700 }}>
                  {creditForm.credits_asesores > 0 && creditInfo.numAsesores > 0
                    ? Math.floor(creditForm.credits_asesores / creditInfo.numAsesores)
                    : 0}
                </span>
                <span style={{ color: "rgba(255,255,255,0.5)" }}> créditos por asesor</span>
              </div>
            )}

            {/* Sin asignar */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, padding: "6px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 6, fontSize: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>Sin asignar:</span>
              <span style={{ color: creditForm.credits_director + creditForm.credits_asesores > creditForm.credits_total ? "#f87171" : "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                {Math.max(0, creditForm.credits_total - creditForm.credits_director - creditForm.credits_asesores)}
              </span>
            </div>

            <input placeholder="Motivo (opcional)" value={creditForm.motivo}
              onChange={e => setCreditForm(f => ({ ...f, motivo: e.target.value }))} style={{ ...inputStyle, marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={aplicarCredito}
                disabled={actionLoading || creditForm.credits_director + creditForm.credits_asesores > creditForm.credits_total}
                style={{ ...btnStyle("primary"), flex: 1 }}
              >
                {actionLoading ? "Guardando..." : "Guardar distribución"}
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
            <h3 style={{ color: "#fff", margin: "0 0 18px" }}>{pagoForm.id ? "Editar Pago" : "Registrar Pago"}</h3>
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
              <button onClick={guardarPago} disabled={!pagoForm.monto || !pagoForm.periodo_mes || actionLoading} style={{ ...btnStyle("primary"), flex: 1 }}>
                {actionLoading ? "Guardando..." : pagoForm.id ? "Guardar cambios" : "Registrar"}
              </button>
              <button onClick={() => setPagoModal(false)} style={{ ...btnStyle("ghost"), flex: 1 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
