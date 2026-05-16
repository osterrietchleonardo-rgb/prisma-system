"use client"
import { useState, useEffect } from "react"

interface Bar {
  label: string
  value: number
  color: string
}

interface BarChartDivsProps {
  data: Bar[]
  height?: number
  /** Si true, las barras son horizontales (layout vertical tipo recharts) */
  horizontal?: boolean
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function BarChartDivs({ data, height = 180, horizontal = false }: BarChartDivsProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  // Animación de entrada: espera 1 frame para disparar la transición
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const maxVal = Math.max(...data.map(d => d.value), 1)

  if (horizontal) {
    // ── Layout horizontal (barras crecen hacia la derecha) ──────────────────
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0" }}>
        {data.map((bar, i) => {
          const pct = (bar.value / maxVal) * 100
          const isHovered = hovered === i
          const dimmed = hovered !== null && !isHovered

          return (
            <div
              key={i}
              style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Label */}
              <div style={{
                width: 130, flexShrink: 0,
                fontSize: 12, color: "rgba(255,255,255,0.45)",
                textAlign: "right", lineHeight: 1.3,
              }}>
                {bar.label}
              </div>

              {/* Track */}
              <div style={{
                flex: 1, height: 28, borderRadius: 6,
                background: "rgba(255,255,255,0.05)",
                position: "relative", overflow: "hidden",
                cursor: "default",
              }}>
                {/* Fill */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: mounted ? `${pct}%` : "0%",
                  background: bar.color,
                  borderRadius: 6,
                  opacity: dimmed ? 0.3 : 1,
                  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease",
                }} />
              </div>

              {/* Value */}
              <div style={{
                width: 32, flexShrink: 0,
                fontSize: 12, fontWeight: 600,
                color: dimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
                transition: "color 0.2s ease",
              }}>
                {bar.value}
              </div>

              {/* Tooltip */}
              {isHovered && (
                <div style={{
                  position: "absolute", right: 44, top: "50%",
                  transform: "translateY(-50%)",
                  background: "#020617",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 6, padding: "4px 10px",
                  fontSize: 12, fontWeight: 600, color: "#C0C0C0",
                  whiteSpace: "nowrap", pointerEvents: "none",
                  zIndex: 10,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                }}>
                  {fmt(bar.value)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Layout vertical (barras crecen hacia arriba) ─────────────────────────
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-around",
      height,
      gap: 8,
      paddingTop: 20, // espacio para tooltip
    }}>
      {data.map((bar, i) => {
        const pct = (bar.value / maxVal) * 100
        const isHovered = hovered === i
        const dimmed = hovered !== null && !isHovered

        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              position: "relative",
              height: "100%",
              justifyContent: "flex-end",
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Tooltip */}
            {isHovered && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: "50%",
                transform: "translateX(-50%) translateY(-6px)",
                background: "#020617",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6, padding: "4px 10px",
                fontSize: 12, fontWeight: 600, color: "#C0C0C0",
                whiteSpace: "nowrap", pointerEvents: "none",
                zIndex: 10,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}>
                {fmt(bar.value)}
              </div>
            )}

            {/* Barra */}
            <div style={{
              width: "100%",
              height: mounted ? `${pct}%` : "0%",
              minHeight: bar.value > 0 ? 4 : 0,
              background: bar.color,
              borderRadius: "4px 4px 0 0",
              opacity: dimmed ? 0.3 : 1,
              transition: "height 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease",
              cursor: "default",
            }} />

            {/* Label */}
            <div style={{
              fontSize: 10,
              color: dimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.4)",
              textAlign: "center",
              lineHeight: 1.2,
              transition: "color 0.2s ease",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {bar.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
