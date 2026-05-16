"use client"
import { useState, useEffect } from "react"

interface Slice { label: string; value: number; color: string }
interface Props { data: Slice[]; size?: number }

const CX = 100
const CY = 100
const R = 68
const STROKE_W = 22
const C = 2 * Math.PI * R  // circumference ≈ 427.26

export default function DonutChart({ data, size = 220 }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)

  // Animate on mount: progress 0 → 1 over ~900ms
  useEffect(() => {
    let start: number
    let raf: number
    const DURATION = 900
    const animate = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / DURATION, 1)
      setProgress(p)
      if (p < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [])

  const total = data.reduce((s, d) => s + d.value, 0) || 1

  // Pre-compute cumulative offsets
  let cumulative = 0
  const segments = data.map((slice) => {
    const segLen = (slice.value / total) * C * progress
    const dashArray = `${segLen} ${C - segLen}`
    const dashOffset = C - cumulative
    cumulative += (slice.value / total) * C * progress
    return { ...slice, dashArray, dashOffset }
  })

  // Center text
  const activeSlice = hovered !== null ? data[hovered] : null
  const centerLabel = activeSlice ? activeSlice.label : "Total"
  const centerValue = activeSlice ? activeSlice.value : total

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      {/* SVG Donut */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg
          width={size} height={size}
          viewBox="0 0 200 200"
          style={{ display: "block" }}
        >
          {/* Track (background ring) */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={STROKE_W}
          />

          {/* Segments — rotated so 0° = top */}
          <g transform={`rotate(-90 ${CX} ${CY})`}>
            {segments.map((seg, i) => {
              const isHovered = hovered === i
              const dimmed = hovered !== null && !isHovered
              return (
                <circle
                  key={i}
                  cx={CX} cy={CY} r={R}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={isHovered ? STROKE_W + 4 : STROKE_W}
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.dashOffset}
                  strokeLinecap="butt"
                  style={{
                    opacity: dimmed ? 0.25 : 1,
                    transition: "opacity 0.3s ease, stroke-width 0.2s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
              )
            })}
          </g>

          {/* Center text */}
          <text
            x={CX} y={CY - 10}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.40)"
            fontSize={10}
            fontFamily="inherit"
          >
            {centerLabel}
          </text>
          <text
            x={CX} y={CY + 12}
            textAnchor="middle" dominantBaseline="middle"
            fill="#fff"
            fontSize={22}
            fontWeight={700}
            fontFamily="inherit"
          >
            {centerValue.toLocaleString()}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 120 }}>
        {data.map((slice, i) => {
          const pct = Math.round((slice.value / total) * 100)
          const isHovered = hovered === i
          const dimmed = hovered !== null && !isHovered
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                opacity: dimmed ? 0.3 : 1,
                transition: "opacity 0.3s ease",
                cursor: "default",
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: slice.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.60)", lineHeight: 1.3 }}>
                {slice.label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>
                {slice.value.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", width: 32, textAlign: "right" }}>
                {pct}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
