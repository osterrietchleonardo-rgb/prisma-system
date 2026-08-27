"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot } from "lucide-react"

/**
 * Task 18 — lo que decidió el agente sobre este lead, con la razón, la evidencia que citó y
 * qué miró antes de decidir. Lee con la sesión del usuario: la RLS de fase 1 deja ver al
 * director toda su agencia y al asesor solo sus chats. Los compromisos activos y los
 * botones viven en el bloque "Equipo y seguimiento", justo arriba.
 */

interface Decision {
  id: string
  accion: string
  razon: string
  confianza: number
  ejecutada: boolean
  resultado: string | null
  creado_en: string
  modo: string
  plantilla: string | null
  frase_cierre: string | null
  decision_cruda: { evidencia?: string } | null
  contexto_snapshot: { pasos?: Array<{ herramienta: string; input?: Record<string, unknown> }> } | null
}

const ETIQUETA: Record<string, string> = { contactar: "Contactar", posponer: "Posponer", abandonar: "Abandonar", escalar: "Escalar" }
const COLOR: Record<string, string> = {
  contactar: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  posponer: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  abandonar: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  escalar: "bg-red-500/15 text-red-600 dark:text-red-400",
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function queMiro(d: Decision): string | null {
  const pasos = d.contexto_snapshot?.pasos ?? []
  if (!pasos.length) return null
  const vistos = new Set<string>()
  for (const p of pasos) {
    if (p.herramienta === "leer_propiedad") vistos.add(`la propiedad («${String(p.input?.busqueda ?? "")}»)`)
    else if (p.herramienta === "leer_mensajes") vistos.add("los mensajes")
    else if (p.herramienta === "leer_intentos_previos") vistos.add("los intentos previos")
    else if (p.herramienta === "leer_compromisos") vistos.add("los compromisos")
    else if (p.herramienta !== "emitir_decision") vistos.add(p.herramienta.replace(/_/g, " "))
  }
  return vistos.size ? [...vistos].join(" · ") : null
}

function resultadoTexto(d: Decision): string | null {
  if (d.modo === "sombra") return "no se envió (modo sombra: el agente solo mira)"
  if (!d.resultado) return null
  if (d.resultado === "enviada") return "enviada"
  if (d.resultado === "pospuesta") return "pospuesta"
  if (d.resultado === "abandonada") return "seguimiento apagado"
  return d.resultado.replace(/^bloqueada_/, "no se envió: ").replace(/^error_/, "error: ").replace(/_/g, " ")
}

export default function SeguimientoPanel({ conversationId }: { conversationId: string }) {
  const supabase = createClient()
  const [decisiones, setDecisiones] = useState<Decision[]>([])

  useEffect(() => {
    supabase
      .from("seguimiento_decisiones")
      .select("id, accion, razon, confianza, ejecutada, resultado, creado_en, modo, plantilla, frase_cierre, decision_cruda, contexto_snapshot")
      .eq("conversation_id", conversationId)
      .order("creado_en", { ascending: false })
      .limit(5)
      .then(({ data }) => setDecisiones((data ?? []) as Decision[]))
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!decisiones.length) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bot className="w-4 h-4 text-accent" /> Agente de seguimiento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {decisiones.map((d) => {
          const miro = queMiro(d)
          const res = resultadoTexto(d)
          return (
            <div key={d.id} className="space-y-1 border-b last:border-b-0 pb-3 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={COLOR[d.accion] ?? ""}>{ETIQUETA[d.accion] ?? d.accion}</Badge>
                <span className="text-xs text-muted-foreground">{fechaCorta(d.creado_en)} · confianza {Math.round(d.confianza * 100)}%</span>
              </div>
              <p>{d.razon}</p>
              {d.frase_cierre && d.plantilla && (
                <p className="text-xs text-muted-foreground">Mensaje ({d.plantilla.replace(/^seg_/, "")}): <em>“{d.frase_cierre}”</em></p>
              )}
              {d.decision_cruda?.evidencia && (
                <p className="text-xs text-muted-foreground"><span className="font-medium">El dato:</span> {d.decision_cruda.evidencia}</p>
              )}
              {miro && <p className="text-xs text-muted-foreground"><span className="font-medium">Miró:</span> {miro}</p>}
              {res && <p className="text-[11px] text-muted-foreground/80">{res}</p>}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
