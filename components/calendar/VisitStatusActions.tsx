"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { triggerCalendarSync } from "@/lib/google-calendar/triggerSync"
import { CheckCircle2, UserCheck, UserX } from "lucide-react"

interface VisitStatusActionsProps {
  visit: any
  onSuccess: () => void
}

/**
 * Botones de ciclo de vida de una visita (calendario, director y asesor).
 * Escriben directamente scheduled_visits.estado_visita (fuente de verdad);
 * el trigger sync_visit_to_conversation propaga a wa_conversations.visit_status.
 *
 * La decisión manual del asesor PISA la automatización: el job de n8n solo
 * transiciona confirmada→realizada, por lo que marcar "no asistió" (desde
 * confirmada o desde realizada) siempre prevalece.
 */
export function VisitStatusActions({ visit, onSuccess }: VisitStatusActionsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()
  const estado: string = visit.estado_visita

  const setEstado = async (nuevo: string, mensaje: string) => {
    try {
      setLoading(nuevo)
      const { error } = await supabase
        .from("scheduled_visits")
        .update({ estado_visita: nuevo })
        .eq("id", visit.id)
      if (error) throw error
      // Espejo en Google Calendar (best-effort, no bloquea).
      triggerCalendarSync(visit.id)
      toast.success(mensaje)
      onSuccess()
    } catch (e: any) {
      toast.error("Error al actualizar el estado: " + e.message)
    } finally {
      setLoading(null)
    }
  }

  const botones: React.ReactNode[] = []

  if (estado === "agendada" || estado === "reprogramada") {
    botones.push(
      <Button
        key="confirmar"
        onClick={() => setEstado("confirmada", "Visita confirmada")}
        disabled={!!loading}
        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar asistencia
      </Button>
    )
  }

  if (estado === "confirmada") {
    botones.push(
      <Button
        key="realizada"
        onClick={() => setEstado("realizada", "Visita marcada como realizada")}
        disabled={!!loading}
        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <UserCheck className="h-4 w-4 mr-1.5" /> Marcar realizada
      </Button>,
      <Button
        key="noshow"
        variant="outline"
        onClick={() => setEstado("no_asistio", "Marcada como no asistió")}
        disabled={!!loading}
        className="w-full sm:w-auto border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
      >
        <UserX className="h-4 w-4 mr-1.5" /> No asistió
      </Button>
    )
  }

  // Override: aunque el sistema la haya marcado realizada automáticamente,
  // el asesor puede corregir a "no asistió".
  if (estado === "realizada") {
    botones.push(
      <Button
        key="noshow-override"
        variant="outline"
        onClick={() => setEstado("no_asistio", "Corregida: el cliente no asistió")}
        disabled={!!loading}
        className="w-full sm:w-auto border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
      >
        <UserX className="h-4 w-4 mr-1.5" /> Corregir: no asistió
      </Button>
    )
  }

  if (botones.length === 0) return null

  return <div className="flex flex-col sm:flex-row flex-wrap gap-3">{botones}</div>
}
