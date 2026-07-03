"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Check, X, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

type RefreshState = "idle" | "loading" | "success" | "partial" | "error"

interface SourceStatus {
  status: "ok" | "fallback" | "error"
  periodo?: string
  message?: string
  barrios_actualizados?: number
}

interface AggregatedResults {
  icc?: SourceStatus
  zonaprop: Record<string, SourceStatus>
  mudafy?: SourceStatus
  escrituras?: SourceStatus
  ucema?: SourceStatus
}

interface RefreshButtonProps {
  lastUpdated: string | null
}

function relativeTime(iso: string | null): string {
  if (!iso) return "sin datos"
  const diffMs = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diffMs)) return "sin datos"
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return "recién"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

/** Llama a una fuente del sync. Devuelve su objeto `results` o null si falla. */
async function syncSource(qs: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`/api/mercado/sync?${qs}`)
    if (!r.ok) return null
    const j = await r.json()
    return j.results ?? null
  } catch {
    return null
  }
}

function summarize(r: AggregatedResults): { text: string; allOk: boolean } {
  const zonas = Object.values(r.zonaprop)
  const zonasOk = zonas.filter((z) => z.status === "ok").length
  const parts: string[] = []

  parts.push(`ICC ${r.icc?.status === "ok" ? r.icc.periodo ?? "✓" : r.icc?.status ?? "—"}`)
  parts.push(`${zonasOk}/${zonas.length || 4} zonas`)
  parts.push(
    r.mudafy?.status === "ok" ? `${r.mudafy.barrios_actualizados ?? ""} barrios`.trim() : `barrios: ${r.mudafy?.status ?? "—"}`
  )
  parts.push(`Escrituras ${r.escrituras?.status === "ok" ? r.escrituras.periodo ?? "✓" : r.escrituras?.status ?? "—"}`)
  parts.push(`Cierre ${r.ucema?.status === "ok" ? r.ucema.periodo ?? "✓" : r.ucema?.status ?? "—"}`)

  const allOk =
    r.icc?.status === "ok" &&
    zonas.length > 0 &&
    zonasOk === zonas.length &&
    r.mudafy?.status === "ok" &&
    r.escrituras?.status === "ok" &&
    r.ucema?.status === "ok"
  return { text: parts.join(" · "), allOk }
}

export function RefreshButton({ lastUpdated }: RefreshButtonProps) {
  const [state, setState] = useState<RefreshState>("idle")
  const [detail, setDetail] = useState<string>("")
  const [syncedAt, setSyncedAt] = useState<string | null>(lastUpdated)
  const [, forceTick] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const handleClick = useCallback(async () => {
    if (state === "loading") return
    setState("loading")
    setDetail("")

    try {
      // Cada fuente en paralelo → cada request del servidor queda < 10s (Hobby).
      const [icc, mudafy, escrituras, ucema, caba, norte, oeste] = await Promise.all([
        syncSource("source=icc"),
        syncSource("source=mudafy"),
        syncSource("source=escrituras"),
        syncSource("source=ucema"),
        syncSource("source=zonaprop&zona=CABA"),
        syncSource("source=zonaprop&zona=GBA_NORTE"),
        syncSource("source=zonaprop&zona=GBA_OESTE"),
      ])

      // GBA Sur necesita el período publicado (lo da CABA) para barrer un solo mes.
      const cabaStatus = (caba?.zonaprop as Record<string, SourceStatus> | undefined)?.CABA
      const periodo = cabaStatus?.periodo
      const sur = await syncSource(`source=zonaprop&zona=GBA_SUR${periodo ? `&periodo=${encodeURIComponent(periodo)}` : ""}`)

      // Si TODAS las fuentes fallaron a nivel red → error duro.
      if (![icc, mudafy, escrituras, ucema, caba, norte, oeste, sur].some(Boolean)) {
        throw new Error("sin respuesta del servidor")
      }

      const zonaprop: Record<string, SourceStatus> = {
        ...((caba?.zonaprop as Record<string, SourceStatus>) ?? {}),
        ...((norte?.zonaprop as Record<string, SourceStatus>) ?? {}),
        ...((oeste?.zonaprop as Record<string, SourceStatus>) ?? {}),
        ...((sur?.zonaprop as Record<string, SourceStatus>) ?? {}),
      }
      const results: AggregatedResults = {
        icc: icc?.icc as SourceStatus | undefined,
        zonaprop,
        mudafy: mudafy?.mudafy as SourceStatus | undefined,
        escrituras: escrituras?.escrituras as SourceStatus | undefined,
        ucema: ucema?.ucema as SourceStatus | undefined,
      }

      await fetch("/api/mercado/refresh", { method: "POST" }).catch(() => {})

      const { text, allOk } = summarize(results)
      setDetail(text)
      setSyncedAt(new Date().toISOString())
      setState(allOk ? "success" : "partial")
      router.refresh()
      setTimeout(() => setState("idle"), 8000)
    } catch (error) {
      console.error("Sync error:", error)
      setDetail(error instanceof Error ? error.message : "error desconocido")
      setState("error")
      setTimeout(() => setState("idle"), 6000)
    }
  }, [state, router])

  const config: Record<RefreshState, { icon: React.ReactNode; label: string; className: string }> = {
    idle: {
      icon: <RefreshCw className="w-4 h-4" />,
      label: "Actualizar datos",
      className: "bg-accent text-accent-foreground hover:bg-accent/90",
    },
    loading: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      label: "Actualizando…",
      className: "bg-accent/70 text-accent-foreground cursor-not-allowed",
    },
    success: {
      icon: <Check className="w-4 h-4 text-emerald-400" />,
      label: "Actualizado",
      className: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    },
    partial: {
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      label: "Actualizado (parcial)",
      className: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    },
    error: {
      icon: <X className="w-4 h-4 text-red-400" />,
      label: "Error al actualizar",
      className: "bg-red-500/20 text-red-400 border border-red-500/30",
    },
  }

  const { icon, label, className } = config[state]

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1">
      <Button
        onClick={handleClick}
        disabled={state === "loading"}
        className={`gap-2 text-sm font-semibold transition-all duration-200 ${className}`}
        size="sm"
      >
        {icon}
        <span>{label}</span>
      </Button>

      <span
        className={`text-[10px] leading-tight text-right max-w-[280px] ${
          state === "error" ? "text-red-400/80" : "text-muted-foreground/70"
        }`}
      >
        {detail && state !== "idle"
          ? state === "error"
            ? `Error: ${detail}`
            : detail
          : `Actualizado ${relativeTime(syncedAt)}`}
      </span>
    </div>
  )
}
