"use client"
import { useState } from "react"

export interface EvoPoint {
  label: string
  ingresos: number
  costos: number
}

interface Props {
  data: EvoPoint[]
  height?: number
  simbolo?: string // "US$" | "$"
}

const PAD = { top: 20, right: 16, bottom: 32, left: 52 }

function bezier(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : ""
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i]
    const mx = (p.x + c.x) / 2
    d += ` C ${mx} ${p.y} ${mx} ${c.y} ${c.x} ${c.y}`
  }
  return d
}

export default function FinanceEvolutionChart({ data, height = 220, simbolo = "US$" }: Props) {
  const [hover, setHover] = useState<number | null>(null)

  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
        Sin datos
      </div>
    )
  }

  const W = 640, H = height
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const allVals = data.flatMap((d) => [d.ingresos, d.costos])
  const maxV = Math.max(...allVals, 1)
  const minV = Math.min(...allVals, 0)
  const range = maxV - minV || 1

  const toX = (i: number) => (data.length <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (data.length - 1)) * innerW)
  const toY = (v: number) => PAD.top + (1 - (v - minV) / range) * innerH
  const baseY = PAD.top + innerH

  const ingPts = data.map((d, i) => ({ x: toX(i), y: toY(d.ingresos) }))
  const costPts = data.map((d, i) => ({ x: toX(i), y: toY(d.costos) }))

  const fmt = (n: number) => {
    const a = Math.abs(n)
    if (a >= 1_000_000) return `${simbolo}${(n / 1_000_000).toFixed(1)}M`
    if (a >= 1_000) return `${simbolo}${(n / 1_000).toFixed(1)}k`
    return `${simbolo}${n.toFixed(0)}`
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ value: minV + t * range, y: PAD.top + (1 - t) * innerH }))
  const ING = "#B87333", COST = "#ef4444"

  return (
    <div>
      {/* Leyenda */}
      <div style={{ display: "flex", gap: 18, marginBottom: 10 }}>
        {[{ c: ING, t: "Ingresos" }, { c: COST, t: "Costos" }].map((l) => (
          <div key={l.t} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 20, height: 3, borderRadius: 2, background: l.c }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{l.t}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ING} stopOpacity="0.28" />
            <stop offset="100%" stopColor={ING} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid + labels Y */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={PAD.left + innerW} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.left - 8} y={t.y} textAnchor="end" dominantBaseline="middle" fill="rgba(255,255,255,0.30)" fontSize={10}>
              {fmt(t.value)}
            </text>
          </g>
        ))}

        {/* Área ingresos */}
        <path d={`${bezier(ingPts)} L ${ingPts[ingPts.length - 1].x} ${baseY} L ${ingPts[0].x} ${baseY} Z`} fill="url(#ingGrad)" />

        {/* Líneas */}
        <path d={bezier(costPts)} fill="none" stroke={COST} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" opacity={0.9} />
        <path d={bezier(ingPts)} fill="none" stroke={ING} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Interacción */}
        {data.map((d, i) => {
          const x = toX(i)
          const isH = hover === i
          return (
            <g key={i}>
              <text x={x} y={baseY + 16} textAnchor="middle" fill="rgba(255,255,255,0.30)" fontSize={10}>{d.label}</text>
              {isH && <line x1={x} y1={PAD.top} x2={x} y2={baseY} stroke="rgba(255,255,255,0.14)" strokeWidth={1} strokeDasharray="4 3" />}
              <circle cx={x} cy={toY(d.ingresos)} r={isH ? 5 : 3} fill={ING} stroke="#0f1220" strokeWidth={2} />
              <circle cx={x} cy={toY(d.costos)} r={isH ? 5 : 3} fill={COST} stroke="#0f1220" strokeWidth={2} />
              {/* Zona de hover */}
              <rect x={x - innerW / (data.length * 2)} y={0} width={innerW / data.length} height={H} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} />
              {isH && (
                <g pointerEvents="none">
                  <rect x={Math.min(Math.max(x - 55, 2), W - 112)} y={PAD.top} width={110} height={46} rx={6} fill="#161b2e" stroke="rgba(255,255,255,0.12)" />
                  <text x={Math.min(Math.max(x - 55, 2), W - 112) + 10} y={PAD.top + 18} fill={ING} fontSize={11} fontWeight={600}>{fmt(d.ingresos)}</text>
                  <text x={Math.min(Math.max(x - 55, 2), W - 112) + 10} y={PAD.top + 36} fill={COST} fontSize={11} fontWeight={600}>{fmt(d.costos)}</text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
