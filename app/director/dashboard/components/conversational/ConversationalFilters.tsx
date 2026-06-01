"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, RefreshCw, Clock } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

interface ConversationalFiltersProps {
  onAnalyze: (period: string, from?: string, to?: string, force?: boolean) => void
  isProcessing: boolean
  lastAnalyzedAt: string | null
  processedSessions: number
  totalSessions: number
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "hace un momento"
  if (diffMins < 60) return `hace ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `hace ${diffHours} hs`
  const diffDays = Math.floor(diffHours / 24)
  return `hace ${diffDays} días`
}

export function ConversationalFilters({
  onAnalyze,
  isProcessing,
  lastAnalyzedAt,
  processedSessions,
  totalSessions,
}: ConversationalFiltersProps) {
  const [period, setPeriod] = useState("30d")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [calOpen, setCalOpen] = useState(false)

  const handleAnalyze = () => {
    if (period === "custom" && dateRange?.from && dateRange?.to) {
      onAnalyze("custom", dateRange.from.toISOString(), dateRange.to.toISOString(), true)
    } else {
      onAnalyze(period, undefined, undefined, true)
    }
  }

  const progressPct = totalSessions > 0 ? Math.round((processedSessions / totalSessions) * 100) : 0

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-accent/10 bg-card/30 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        {/* Period selector */}
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm border-accent/20 bg-background/50">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 días</SelectItem>
            <SelectItem value="30d">Últimos 30 días</SelectItem>
            <SelectItem value="90d">Últimos 3 meses</SelectItem>
            <SelectItem value="custom">Rango personalizado</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom date range */}
        {period === "custom" && (
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto h-9 text-xs border-accent/20 bg-background/50 gap-2"
              >
                <CalendarIcon className="h-3.5 w-3.5 text-accent" />
                {dateRange?.from && dateRange?.to
                  ? `${format(dateRange.from, "dd/MM/yy", { locale: es })} – ${format(dateRange.to, "dd/MM/yy", { locale: es })}`
                  : "Seleccionar rango"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range)
                  if (range?.from && range?.to) setCalOpen(false)
                }}
                numberOfMonths={2}
                locale={es}
              />
            </PopoverContent>
          </Popover>
        )}

        {/* Analyze button */}
        <Button
          onClick={handleAnalyze}
          disabled={isProcessing || (period === "custom" && (!dateRange?.from || !dateRange?.to))}
          size="sm"
          className="h-9 gap-2 bg-accent hover:bg-accent/90 text-white font-semibold text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isProcessing ? "animate-spin" : ""}`} />
          {isProcessing ? "Analizando..." : "Actualizar análisis"}
        </Button>
      </div>

      {/* Progress bar or last update timestamp */}
      <div className="flex items-center gap-2">
        {isProcessing && totalSessions > 0 ? (
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Analizando conversación {processedSessions} de {totalSessions}...</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-accent rounded-full h-1.5 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : lastAnalyzedAt ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Análisis actualizado: <span className="text-foreground/70">{timeAgo(lastAnalyzedAt)}</span></span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sin análisis previo para este período. Hacé clic en "Actualizar análisis" para generar.
          </p>
        )}
      </div>
    </div>
  )
}
