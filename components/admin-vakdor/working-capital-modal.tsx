"use client"
import { useEffect, useState, useCallback } from "react"

// ABM de saldos de capital de trabajo de un mes. La VARIACIÓN (Δ) contra el mes
// anterior la calcula el backend; acá solo se cargan los saldos del mes.

const COPPER = "#B87333"

interface WcItem {
  id: string; periodo_mes: string; tipo: string; concepto: string | null
  monto: number; moneda: "USD" | "ARS"; notas: string | null
}

const TIPOS: { key: string; label: string; signo: string; help: string }[] = [
  { key: "por_cobrar", label: "Cuentas por cobrar", signo: "resta caja", help: "Lo que te deben las inmobiliarias (facturado y no cobrado)." },
  { key: "por_pagar", label: "Cuentas por pagar", signo: "suma caja", help: "Lo que le debés a proveedores (recibido y no pagado)." },
  { key: "anticipo_cliente", label: "Anticipos de clientes", signo: "suma caja", help: "Suscripciones cobradas por adelantado." },
  { key: "prepago", label: "Gastos pagados por adelantado", signo: "resta caja", help: "Pagaste algo antes de usarlo (ej. un año de una herramienta)." },
]
const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.key, t.label]))

const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#fff", fontSize: 12.5, padding: "8px 10px", outline: "none" }

function mesLabel(mes: string) {
  const [y, m] = mes.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })
}

export default function WorkingCapitalModal({ mes, onClose }: { mes: string; onClose: (changed: boolean) => void }) {
  const [items, setItems] = useState<WcItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changed, setChanged] = useState(false)
  const [form, setForm] = useState({ tipo: "por_cobrar", monto: "", moneda: "USD", concepto: "" })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin-vakdor/finance/working-capital?mes=${mes}`)
    const d = await r.json()
    setItems(r.ok ? (d.items || []) : [])
    setLoading(false)
  }, [mes])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(changed) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, changed])

  async function agregar() {
    if (!form.monto) return
    setSaving(true)
    const r = await fetch(`/api/admin-vakdor/finance/working-capital`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodo_mes: mes, tipo: form.tipo, monto: Number(form.monto), moneda: form.moneda, concepto: form.concepto }),
    })
    if (r.ok) { setForm({ tipo: "por_cobrar", monto: "", moneda: "USD", concepto: "" }); setChanged(true); await load() }
    else { const d = await r.json().catch(() => ({})); alert(d.error || "Error al guardar") }
    setSaving(false)
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar este saldo?")) return
    const r = await fetch(`/api/admin-vakdor/finance/working-capital?id=${id}`, { method: "DELETE" })
    if (r.ok) { setChanged(true); await load() }
  }

  const sym = (m: string) => (m === "USD" ? "US$" : "$")

  return (
    <div onClick={() => onClose(changed)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#101420", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, width: "100%", maxWidth: 640, boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: COPPER, fontWeight: 600 }}>Capital de trabajo</div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, textTransform: "capitalize" }}>Saldos de {mesLabel(mes)}</div>
          </div>
          <button onClick={() => onClose(changed)} aria-label="Cerrar" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: "18px 22px 24px" }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12.5, lineHeight: 1.55, margin: "0 0 16px" }}>
            Cargá el <b style={{ color: "rgba(255,255,255,0.75)" }}>saldo a fin de mes</b> de cada partida. El sistema calcula solo la variación contra el mes anterior y la resta/suma al Flujo de Caja Libre.
          </p>

          {/* Form alta */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.7fr auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
            <div>
              <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 10.5, display: "block", marginBottom: 4 }}>CLASIFICACIÓN</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={{ ...inputStyle, width: "100%", cursor: "pointer" }}>
                {TIPOS.map((t) => <option key={t.key} value={t.key} style={{ background: "#0f1220" }}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 10.5, display: "block", marginBottom: 4 }}>SALDO</label>
              <input type="number" min={0} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0" style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div>
              <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 10.5, display: "block", marginBottom: 4 }}>MONEDA</label>
              <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} style={{ ...inputStyle, width: "100%", cursor: "pointer" }}>
                <option style={{ background: "#0f1220" }}>USD</option><option style={{ background: "#0f1220" }}>ARS</option>
              </select>
            </div>
            <button onClick={agregar} disabled={saving || !form.monto} style={{ ...inputStyle, cursor: "pointer", background: COPPER, border: "none", fontWeight: 600, height: 35 }}>+ Agregar</button>
          </div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 18 }}>
            {TIPOS.find((t) => t.key === form.tipo)?.help} <span style={{ color: COPPER }}>({TIPOS.find((t) => t.key === form.tipo)?.signo})</span>
          </div>

          {/* Lista */}
          {loading ? (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 20 }}>Cargando…</div>
          ) : items.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: 20 }}>Sin saldos cargados para este mes.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((it) => (
                <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9 }}>
                  <div>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{TIPO_LABEL[it.tipo] || it.tipo}{it.concepto ? <span style={{ color: "rgba(255,255,255,0.4)" }}> · {it.concepto}</span> : null}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 13 }}>{sym(it.moneda)}{Number(it.monto).toLocaleString("es-AR")}</span>
                    <button onClick={() => borrar(it.id)} title="Borrar" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(239,68,68,0.7)", fontSize: 13 }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
