"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { MessageSquareText, BrainCircuit, AlertCircle } from "lucide-react"
import { ConversationalFilters } from "./ConversationalFilters"
import { Block1KPIs } from "./Block1_KPIs"
import { Block2Funnel } from "./Block2_Funnel"
import { Block3LeadProfile } from "./Block3_LeadProfile"
import { Block4DemandAnalysis } from "./Block4_DemandAnalysis"
import { Block5Temporal } from "./Block5_Temporal"
import { Block6AttentionQuality } from "./Block6_AttentionQuality"
import { Skeleton } from "@/components/ui/skeleton"

interface InsightsRecord {
  id: string
  status: "pending" | "processing" | "complete" | "error"
  analyzed_at: string
  conversations_count: number
  processed_sessions: number
  total_sessions: number
  kpis: Record<string, unknown>
  funnel: Record<string, unknown>
  lead_profile: Record<string, unknown>
  demand_analysis: Record<string, unknown>
  temporal: Record<string, unknown>
  attention: Record<string, unknown>
  error_message?: string
}

function SkeletonSection() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-card/30 border border-accent/10 rounded-2xl min-h-[280px] text-center">
      <MessageSquareText className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-bold mb-2">Sin análisis disponible</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        No hay conversaciones de WhatsApp en el período seleccionado, o aún no se generó el análisis.
        Seleccioná un período y hacé clic en <strong>"Actualizar análisis"</strong>.
      </p>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 bg-rose-500/5 border border-rose-500/20 rounded-2xl min-h-[180px] text-center">
      <AlertCircle className="h-10 w-10 text-rose-400 mb-3" />
      <h3 className="text-base font-bold mb-1">Error en el análisis</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {message || "Ocurrió un error al procesar las conversaciones. Intentá nuevamente."}
      </p>
    </div>
  )
}

export function ConversationalIntelligence() {
  const [insights, setInsights] = useState<InsightsRecord | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const recordIdRef = useRef<string | null>(null)

  const stopPolling = () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }

  const pollStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversational-insights/status?id=${id}`)
      if (!res.ok) return
      const data: InsightsRecord = await res.json()
      setInsights(data)
      if (data.status === "complete" || data.status === "error") {
        setIsProcessing(false); stopPolling()
      }
    } catch { /* ignore */ }
  }, [])

  const fetchCached = useCallback(async (period: string, from?: string, to?: string) => {
    try {
      const p = new URLSearchParams({ period })
      if (from) p.set("from", from)
      if (to) p.set("to", to)
      const res = await fetch(`/api/conversational-insights/status?${p}`)
      if (res.ok) { const d = await res.json(); if (d) setInsights(d) }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchCached("30d"); return stopPolling }, [fetchCached])

  const handleAnalyze = async (period: string, from?: string, to?: string) => {
    setIsProcessing(true); stopPolling()
    try {
      const res = await fetch("/api/conversational-insights/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, from, to }),
      })
      const data = await res.json()
      if (data.message === "cache_fresh") { await fetchCached(period, from, to); setIsProcessing(false); return }
      if (data.id) {
        recordIdRef.current = data.id
        pollingRef.current = setInterval(() => { if (recordIdRef.current) pollStatus(recordIdRef.current) }, 3000)
        pollStatus(data.id)
      }
    } catch { setIsProcessing(false) }
  }

  const hasData = insights?.status === "complete" && (insights.conversations_count > 0 || insights.total_sessions > 0)
  const hasError = insights?.status === "error"

  return (
    <div className="mt-12 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <BrainCircuit className="h-6 w-6 text-accent" />
          <h2 className="text-2xl font-bold tracking-tight">Inteligencia Conversacional</h2>
          <span className="bg-accent/10 text-accent border border-accent/20 px-2 py-1 rounded-md text-xs font-semibold">IA</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Análisis automático de conversaciones de WhatsApp. Hacé clic en "Actualizar análisis" para procesar el período seleccionado con inteligencia artificial.
        </p>
      </div>

      {/* Filters */}
      <ConversationalFilters
        onAnalyze={handleAnalyze}
        isProcessing={isProcessing}
        lastAnalyzedAt={insights?.analyzed_at || null}
        processedSessions={insights?.processed_sessions || 0}
        totalSessions={insights?.total_sessions || 0}
      />

      {/* Content */}
      <div className="space-y-12">
        {isProcessing && !hasData ? <SkeletonSection />
          : hasError ? <ErrorState message={insights?.error_message} />
          : !hasData ? <EmptyState />
          : (<>
            <Block1KPIs kpis={insights!.kpis as unknown as Parameters<typeof Block1KPIs>[0]["kpis"]} />
            <div className="border-t border-accent/10" />
            <Block2Funnel funnel={insights!.funnel as unknown as Parameters<typeof Block2Funnel>[0]["funnel"]} />
            <div className="border-t border-accent/10" />
            <Block3LeadProfile
              lead_profile={insights!.lead_profile as unknown as Parameters<typeof Block3LeadProfile>[0]["lead_profile"]}
              totalConversations={insights!.conversations_count}
            />
            <div className="border-t border-accent/10" />
            <Block4DemandAnalysis demand_analysis={insights!.demand_analysis as unknown as Parameters<typeof Block4DemandAnalysis>[0]["demand_analysis"]} />
            <div className="border-t border-accent/10" />
            <Block5Temporal temporal={insights!.temporal as unknown as Parameters<typeof Block5Temporal>[0]["temporal"]} />
            <div className="border-t border-accent/10" />
            <Block6AttentionQuality
              attention={insights!.attention as unknown as Parameters<typeof Block6AttentionQuality>[0]["attention"]}
              totalConversations={insights!.conversations_count}
            />
          </>)}
      </div>
    </div>
  )
}
