"use client"

import { useState, useEffect } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"

interface AiCreditBadgeProps {
  className?: string
  showLabel?: boolean
}

export function AiCreditBadge({ className, showLabel = true }: AiCreditBadgeProps) {
  const [credits, setCredits] = useState<{ allocated: number; consumed: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("agency_id")
        .eq("id", user.id)
        .single()

      if (profile?.agency_id) {
        const { data } = await supabase
          .from("agency_ai_credits")
          .select("credits_total, credits_used")
          .eq("agency_id", profile.agency_id)
          .maybeSingle()

        if (data) {
          setCredits({
            allocated: data.credits_total,
            consumed: data.credits_used
          })
        }
      }
    } catch (error) {
      console.error("Error fetching credits for badge:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCredits()

    // Listen for custom events that indicate credit consumption
    const handleRefresh = () => fetchCredits()
    window.addEventListener('prisma-refresh-credits', handleRefresh)
    // Also refresh on generation completion
    window.addEventListener('generation-complete', handleRefresh)
    
    return () => {
      window.removeEventListener('prisma-refresh-credits', handleRefresh)
      window.removeEventListener('generation-complete', handleRefresh)
    }
  }, [])

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/5 border border-accent/10", className)}>
        <Loader2 className="w-4 h-4 text-accent animate-spin" />
        {showLabel && <span className="text-xs font-semibold text-muted-foreground">...</span>}
      </div>
    )
  }

  if (!credits) return null

  const remaining = credits.allocated - credits.consumed
  const percentage = Math.min(100, Math.max(0, (credits.consumed / credits.allocated) * 100))
  const isWarning = percentage > 80
  const isDanger = percentage > 95

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/5 border border-accent/10 hover:bg-accent/10 transition-all cursor-default select-none shadow-sm",
            className
          )}>
            <Sparkles className={cn(
              "w-4 h-4 transition-colors",
              isDanger ? "text-destructive" : isWarning ? "text-yellow-500" : "text-accent"
            )} />
            {showLabel && (
              <span className="text-xs font-bold text-foreground">
                {remaining.toLocaleString()} <span className="text-[10px] text-muted-foreground font-medium ml-0.5">créditos</span>
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="w-64 p-4 bg-card border-accent/20 shadow-2xl z-[100]">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Bolsa de Créditos</span>
              <span className={cn(
                "text-xs font-bold",
                isDanger ? "text-destructive" : isWarning ? "text-yellow-500" : "text-accent"
              )}>
                {percentage.toFixed(1)}% usado
              </span>
            </div>
            <Progress 
              value={percentage} 
              className={cn(
                "h-2",
                isDanger ? "*:[background-color:hsl(var(--destructive))]" : isWarning ? "*:[background-color:#eab308]" : "*:[background-color:hsl(var(--accent))]"
              )} 
            />
            <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
              <span>{credits.consumed.toLocaleString()} consumidos</span>
              <span>{credits.allocated.toLocaleString()} totales</span>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-2 text-center border-t border-accent/10 pt-2 italic">
              Actualizado en tiempo real
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
