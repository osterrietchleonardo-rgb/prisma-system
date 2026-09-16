"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMemo } from "react"
import type { ConversationalData } from "@/lib/queries/conversacional"
import { DIAS_SEMANA, fmtNum } from "./formato"

type Temporal = ConversationalData["temporal"]

const hora = (h: number) => `${String(h).padStart(2, "0")} h`

function formatDuration(min: number | null) {
  if (min === null) return "—"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** Mapa día × hora en CSS. Todo en hora argentina (se calcula en el servidor). */
function Heatmap({ mapa }: { mapa: number[][] }) {
  const maxVal = useMemo(() => Math.max(1, ...mapa.flat()), [mapa])
  const color = (n: number) => {
    const i = n / maxVal
    return `rgba(${Math.round(80 + i * 104)},${Math.round(40 + i * 75)},${Math.round(10 + i * 20)},${0.4 + i * 0.6})`
  }
  const columnas = { gridTemplateColumns: "64px repeat(24, minmax(12px, 1fr))" }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-[2px]">
        <div className="grid gap-[2px]" style={columnas}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-[9px] text-muted-foreground text-center">{h % 3 === 0 ? h : ""}</span>
          ))}
        </div>
        {mapa.map((fila, dia) => (
          <div key={dia} className="grid gap-[2px] items-center" style={columnas}>
            <span className="text-[10px] text-muted-foreground text-right pr-2">{DIAS_SEMANA[dia]}</span>
            {fila.map((n, h) => (
              <div
                key={h}
                className={`h-5 rounded-[2px] ${n === 0 ? "bg-muted/40" : ""}`}
                style={n > 0 ? { backgroundColor: color(n) } : undefined}
                title={`${DIAS_SEMANA[dia]} ${hora(h)}: ${n} mensajes`}
              />
            ))}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 pl-[66px]">
          <span className="text-[10px] text-muted-foreground">Menos</span>
          <div className="flex gap-[2px]">
            <div className="h-3 w-6 rounded-[2px] bg-muted/40" />
            {[0.2, 0.4, 0.6, 0.8, 1].map((v) => (
              <div key={v} className="h-3 w-6 rounded-[2px]" style={{ backgroundColor: color(Math.round(v * maxVal)) }} />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">Más mensajes</span>
        </div>
      </div>
    </div>
  )
}

function HourBarChart({ porHora }: { porHora: number[] }) {
  const max = Math.max(...porHora, 1)
  const color = (h: number) => (h >= 6 && h <= 11 ? "#60a5fa" : h >= 12 && h <= 18 ? "#b87333" : "#6b7280")
  return (
    <div className="flex items-end gap-[2px] h-24 w-full">
      {porHora.map((n, h) => (
        <div key={h} className="flex-1 flex flex-col justify-end h-full">
          <div
            className="w-full rounded-t-[2px] transition-all duration-300"
            style={{ height: `${(n / max) * 100}%`, minHeight: n > 0 ? "2px" : "0", backgroundColor: color(h) }}
            title={`${hora(h)}: ${n} mensajes`}
          />
        </div>
      ))}
    </div>
  )
}

export function Block5Temporal({ temporal, chats }: { temporal: Temporal; chats: number }) {
  const t = temporal
  // Antes la hora salía de getHours() en el servidor, que corre en UTC: el pico se corría 3
  // horas (15/9/2026). Ahora se calcula con la zona de Buenos Aires.
  const kpis = [
    {
      label: "Hora pico",
      value: t.horaPico !== null ? hora(t.horaPico) : "—",
      sub: t.horaPico !== null ? `entre las ${t.horaPico} y las ${(t.horaPico + 1) % 24} (hora argentina)` : "sin mensajes",
      color: "text-accent",
    },
    { label: "Día pico", value: t.diaPico !== null ? DIAS_SEMANA[t.diaPico] : "—", sub: "el día con más mensajes de clientes", color: "text-purple-600 dark:text-purple-400" },
    {
      label: "Duración media",
      value: formatDuration(t.duracionPromedioMin),
      sub: `del primer al último mensaje, en ${fmtNum(t.conversacionesConDuracion)} conversaciones (las de más de 7 días no se cuentan)`,
      color: "text-blue-600 dark:text-blue-400",
    },
    { label: "Mensajes de clientes", value: fmtNum(t.mensajesLead), sub: "escritos por los clientes en el período", color: "text-emerald-700 dark:text-emerald-400" },
  ]

  const total = chats || 1
  const pctBot = Math.round((t.soloBot / total) * 100)
  const pctPersona = Math.round((t.atendidasPorPersona / total) * 100)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">Comportamiento en el tiempo</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Cuándo y cómo consultan?
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Cuenta los mensajes que escribieron los clientes (no los del bot ni los del equipo) dentro del período, en hora argentina.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(({ label, value, sub, color }) => (
          <Card key={label} className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs font-semibold mt-1">{label}</p>
              <p className="text-[10px] text-muted-foreground leading-snug">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🗓️</span>
            <CardTitle className="text-sm font-semibold">Mapa de actividad: día × hora</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Cada cuadrito es una hora de un día de la semana. Más oscuro, más mensajes de clientes.</p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {t.mensajesLead > 0 ? <Heatmap mapa={t.mapa} /> : (
            <div className="h-32 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Sin mensajes de clientes en el período</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <span>⏰</span>
            <CardTitle className="text-sm font-semibold">Mensajes por hora del día</CardTitle>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Mañana (6 a 11)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent inline-block" />Tarde (12 a 18)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted-foreground/50 inline-block" />Noche (19 a 5)</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {t.mensajesLead > 0 ? (
            <>
              <HourBarChart porHora={t.porHora} />
              <div className="flex justify-between mt-1">
                {["0 h", "6 h", "12 h", "18 h", "23 h"].map((l) => <span key={l} className="text-[9px] text-muted-foreground">{l}</span>)}
              </div>
            </>
          ) : <p className="text-xs text-muted-foreground">Sin mensajes de clientes en el período</p>}
        </CardContent>
      </Card>

      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2"><span>🤖</span><CardTitle className="text-sm font-semibold">¿Quién atendió las conversaciones?</CardTitle></div>
          {/* Antes se usaba "bot apagado" como si fuera "lo atendió una persona": no es lo mismo
              (15/9/2026). Ahora cuenta si hay al menos un mensaje escrito por alguien del equipo. */}
          <p className="text-[11px] text-muted-foreground mt-1">
            "Una persona del equipo" = la conversación tiene al menos un mensaje escrito por alguien de la inmobiliaria en el período.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {chats > 0 ? (
            <div className="space-y-4">
              <div className="flex h-8 w-full rounded-lg overflow-hidden bg-muted/30">
                {t.soloBot > 0 && (
                  <div className="flex items-center justify-center text-xs font-bold text-white" style={{ width: `${pctBot}%`, backgroundColor: "#7c3aed", minWidth: "30px" }}>
                    {pctBot}%
                  </div>
                )}
                {t.atendidasPorPersona > 0 && (
                  <div className="flex items-center justify-center text-xs font-bold text-white" style={{ width: `${pctPersona}%`, backgroundColor: "#b87333", minWidth: "30px" }}>
                    {pctPersona}%
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-purple-600 inline-block" />
                  <div>
                    <p className="font-bold">{fmtNum(t.soloBot)}</p>
                    <p className="text-[10px] text-muted-foreground">Solo el bot</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-accent inline-block" />
                  <div>
                    <p className="font-bold">{fmtNum(t.atendidasPorPersona)}</p>
                    <p className="text-[10px] text-muted-foreground">Con una persona del equipo</p>
                  </div>
                </div>
              </div>
            </div>
          ) : <p className="text-xs text-muted-foreground">Sin datos</p>}
        </CardContent>
      </Card>
    </div>
  )
}
