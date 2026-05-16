"use client"
import { useState, useId } from "react"

interface LineChartSVGProps {
  data: { label: string; value: number }[]
  color?: string
  height?: number
}

const PAD = { top: 20, right: 16, bottom: 32, left: 44 }

/** Convierte puntos a un path de Bézier cúbico suave */
function bezierPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ""
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const cpX = (prev.x + curr.x) / 2
    d += ` C ${cpX} ${prev.y} ${cpX} ${curr.y} ${curr.x} ${curr.y}`
  }
  return d
}

/** Igual que bezierPath pero cierra el área hacia abajo */
function areaPath(pts: { x: number; y: number }[], baseY: number): string {
  if (pts.length < 2) return ""
  const line = bezierPath(pts)
  return `${line} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`
}

export default function LineChartSVG({ data, color = "#B87333", height = 200 }: LineChartSVGProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const gradId = useId().replace(/:/g, "")

  if (!data.length) return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
      Sin datos
    </div>
  )

  const W = 600  // viewport width — se escala con viewBox
  const H = height
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const values = data.map(d => d.value)
  const maxV = Math.max(...values, 1)
  const minV = Math.min(...values, 0)
  const range = maxV - minV || 1

  const toX = (i: number) =>
    data.length <= 1
      ? PAD.left + innerW / 2
      : PAD.left + (i / (data.length - 1)) * innerW
  const toY = (v: number) => PAD.top + (1 - (v - minV) / range) * innerH

  const pts = data.map((d, i) => ({ x: toX(i), y: toY(d.value) }))
  const baseY = PAD.top + innerH

  // Ticks del eje Y (4 líneas)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    value: Math.round(minV + t * range),
    y: PAD.top + (1 - t) * innerH,
  }))

  function fmt(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
    return `$${n}`
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block", overflow: "visible" }}
      aria-label="Gráfico de líneas"
    >
      <defs>
        {/* Gradiente de área */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.40" />
          <stop offset="100%" stopColor={color} stopOpacity="0.00" />
        </linearGradient>
      </defs>

      {/* Grid horizontal */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={t.y} x2={PAD.left + innerW} y2={t.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1}
          />
          <text
            x={PAD.left - 8} y={t.y}
            textAnchor="end" dominantBaseline="middle"
            fill="rgba(255,255,255,0.30)" fontSize={10}
          >
            {fmt(t.value)}
          </text>
        </g>
      ))}

      {/* Área bajo la curva */}
      <path
        d={areaPath(pts, baseY)}
        fill={`url(#${gradId})`}
      />

      {/* Línea principal con curvas Bézier */}
      <path
        d={bezierPath(pts)}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Etiquetas eje X + puntos interactivos */}
      {data.map((d, i) => {
        const x = pts[i].x
        const y = pts[i].y
        const isHovered = hovered === i
        return (
          <g key={i}>
            {/* Etiqueta X */}
            <text
              x={x} y={baseY + 16}
              textAnchor="middle"
              fill="rgba(255,255,255,0.30)" fontSize={10}
            >
              {d.label}
            </text>

            {/* Línea vertical al hover */}
            {isHovered && (
              <line
                x1={x} y1={PAD.top} x2={x} y2={baseY}
                stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="4 3"
              />
            )}

            {/* Punto exterior (halo) */}
            <circle
              cx={x} cy={y}
              r={isHovered ? 9 : 0}
              fill={color} opacity={0.18}
              style={{ transition: "r 0.2s ease, opacity 0.2s ease" }}
            />

            {/* Punto interior */}
            <circle
              cx={x} cy={y}
              r={isHovered ? 5 : 3.5}
              fill={color}
              stroke="#0f1220"
              strokeWidth={2}
              style={{ transition: "r 0.2s ease", cursor: "pointer" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />

            {/* Tooltip */}
            {isHovered && (
              <g>
                <rect
                  x={x - 36} y={y - 30}
                  width={72} height={22} rx={5}
                  fill="#1a1f36"
                  stroke={color} strokeOpacity={0.4} strokeWidth={1}
                />
                <text
                  x={x} y={y - 15}
                  textAnchor="middle"
                  fill="#fff" fontSize={11} fontWeight={600}
                >
                  {fmt(d.value)}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
