"use client"
import { useState, useEffect } from "react"

interface Bar { label: string; value: number; color: string }
interface Props { data: Bar[]; height?: number; horizontal?: boolean }

function fmtVal(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

const GRID_STEPS = 4
const GRID_COLOR = "rgba(192,192,192,0.10)"
const GRID_LABEL = "rgba(192,192,192,0.50)"

export default function BarChartDivs({ data, height = 180, horizontal = false }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const maxVal = Math.max(...data.map(d => d.value), 1)

  // ── HORIZONTAL layout ────────────────────────────────────────────────────
  if (horizontal) {
    const ticks = Array.from({ length: GRID_STEPS + 1 }, (_, i) =>
      Math.round((maxVal / GRID_STEPS) * i)
    )
    return (
      <div style={{ paddingLeft: 8 }}>
        {/* Scale header */}
        <div style={{ display: "flex", marginBottom: 6, paddingLeft: 138, paddingRight: 40 }}>
          {ticks.map((t, i) => (
            <div key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : "center", fontSize: 10, color: GRID_LABEL }}>
              {fmtVal(t)}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.map((bar, i) => {
            const pct = (bar.value / maxVal) * 100
            const isHovered = hovered === i
            const dimmed = hovered !== null && !isHovered
            return (
              <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                {/* Label */}
                <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "right" }}>
                  {bar.label}
                </div>
                {/* Track with grid lines */}
                <div style={{ flex: 1, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.05)", position: "relative", overflow: "hidden" }}>
                  {/* Vertical grid lines */}
                  {ticks.slice(1, -1).map((_, gi) => (
                    <div key={gi} style={{
                      position: "absolute", top: 0, bottom: 0,
                      left: `${((gi + 1) / GRID_STEPS) * 100}%`,
                      width: 1, background: GRID_COLOR,
                    }} />
                  ))}
                  {/* Bar fill */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: mounted ? `${pct}%` : "0%",
                    background: bar.color, borderRadius: 6,
                    opacity: dimmed ? 0.3 : 1,
                    transition: "width 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease",
                  }} />
                </div>
                {/* Value */}
                <div style={{ width: 32, flexShrink: 0, fontSize: 12, fontWeight: 600, color: dimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)", transition: "color 0.2s ease" }}>
                  {bar.value}
                </div>
                {/* Tooltip */}
                {isHovered && (
                  <div style={{ position: "absolute", right: 44, top: "50%", transform: "translateY(-50%)", background: "#020617", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#C0C0C0", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                    {fmtVal(bar.value)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── VERTICAL layout ──────────────────────────────────────────────────────
  const ticks = Array.from({ length: GRID_STEPS + 1 }, (_, i) =>
    Math.round((maxVal / GRID_STEPS) * i)
  )
  const LABEL_W = 36

  return (
    <div style={{ position: "relative", display: "flex" }}>
      {/* Y-axis labels */}
      <div style={{ width: LABEL_W, flexShrink: 0, position: "relative", height }}>
        {ticks.map((t, i) => (
          <div key={i} style={{
            position: "absolute",
            bottom: `${(i / GRID_STEPS) * 100}%`,
            right: 4,
            fontSize: 10, color: GRID_LABEL, lineHeight: 1, transform: "translateY(50%)",
          }}>
            {fmtVal(t)}
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, position: "relative", height, paddingTop: 20 }}>
        {/* Horizontal grid lines */}
        {ticks.map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: 0, right: 0,
            bottom: `${(i / GRID_STEPS) * 100}%`,
            height: 1, background: GRID_COLOR,
          }} />
        ))}

        {/* Bars */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: "100%", position: "relative" }}>
          {data.map((bar, i) => {
            const pct = (bar.value / maxVal) * 100
            const isHovered = hovered === i
            const dimmed = hovered !== null && !isHovered
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative", height: "100%", justifyContent: "flex-end" }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                {isHovered && (
                  <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%) translateY(-6px)", background: "#020617", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#C0C0C0", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                    {fmtVal(bar.value)}
                  </div>
                )}
                <div style={{ width: "100%", height: mounted ? `${pct}%` : "0%", minHeight: bar.value > 0 ? 4 : 0, background: bar.color, borderRadius: "4px 4px 0 0", opacity: dimmed ? 0.3 : 1, transition: "height 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease", cursor: "default" }} />
                <div style={{ fontSize: 10, color: dimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.4)", textAlign: "center", transition: "color 0.2s ease", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {bar.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
