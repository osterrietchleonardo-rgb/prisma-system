"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Sparkles, History, RefreshCcw, Activity } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface AiCredits {
  credits_total: number
  credits_used: number
}

interface Transaction {
  id: string
  created_at: string
  feature: string
  credits_consumed: number
  profiles: {
    full_name: string
    email: string
  } | null
}

export function AiCreditsDashboard({ agencyId }: { agencyId: string }) {
  const [credits, setCredits] = useState<AiCredits | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!agencyId) return

    async function fetchCreditsData() {
      try {
        setLoading(true)
        // Fetch global balance
        const { data: creditsData } = await supabase
          .from("agency_ai_credits")
          .select("credits_total, credits_used")
          .eq("agency_id", agencyId)
          .maybeSingle()
        
        if (creditsData) {
          setCredits(creditsData)
        } else {
          // If no credits row, it might be auto-initialized soon or handle fallback
          setCredits({ credits_total: 10000, credits_used: 0 })
        }

        // Fetch recent transactions (last 50) scoped to agency
        const { data: txData, error: txError } = await supabase
          .from("ai_credit_transactions")
          .select(`
            id,
            created_at,
            feature,
            credits_consumed,
            profiles (
              full_name,
              email
            )
          `)
          .eq("agency_id", agencyId)
          .order("created_at", { ascending: false })
          .limit(50)

        if (txError) throw txError
        if (txData) setTransactions(txData as any[])

      } catch (error: any) {
        toast.error("Error al cargar historial: " + (error.message || "Error desconocido"))
        console.error("Error fetching AI credits data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCreditsData()

    // Listen for refresh events
    const handleRefresh = () => fetchCreditsData()
    window.addEventListener("prisma-refresh-credits", handleRefresh)
    
    return () => {
      window.removeEventListener("prisma-refresh-credits", handleRefresh)
    }
  }, [agencyId])

  if (!agencyId) return null

  const remaining = credits ? credits.credits_total - credits.credits_used : 0
  const percentage = credits ? Math.min(100, Math.max(0, (credits.credits_used / credits.credits_total) * 100)) : 0
  const isDanger = percentage > 95
  const isWarning = percentage > 80

  const progressColor = isDanger 
    ? "*:[background-color:hsl(var(--destructive))]" 
    : isWarning 
      ? "*:[background-color:#eab308]" 
      : "*:[background-color:hsl(var(--accent))]"

  return (
    <div className="space-y-6">
      {/* Resumen Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-accent/10 bg-card/30 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Créditos Disponibles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {loading ? "..." : remaining.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              de {credits?.credits_total.toLocaleString() || "0"} totales
            </p>
          </CardContent>
        </Card>

        <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Consumo Mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {percentage.toFixed(1)}%
            </div>
            <Progress value={percentage} className={`h-2 mt-3 ${progressColor}`} />
          </CardContent>
        </Card>

        <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Renovación de Cuota</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">Día 1</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <RefreshCcw className="w-3 h-3" />
              Se renueva automáticamente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Resumen por Módulo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(
          transactions.reduce((acc, tx) => {
            acc[tx.feature] = (acc[tx.feature] || 0) + tx.credits_consumed
            return acc
          }, {} as Record<string, number>)
        ).map(([feature, total]) => (
          <Card key={feature} className="border-accent/10 bg-accent/5 backdrop-blur-sm">
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{feature.replace('_ia', ' IA')}</p>
                <p className="text-xl font-bold">{total} <span className="text-xs font-normal text-muted-foreground">créditos</span></p>
              </div>
              <Activity className="w-8 h-8 text-accent/20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Historial de Transacciones */}
      <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-accent" /> Historial de Uso (Auditoría)
            </CardTitle>
            <CardDescription>
              Últimas 50 operaciones de inteligencia artificial en tu agencia.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-accent/10 bg-background/50 overflow-x-auto audit-table-container">
            <table className="w-full text-sm text-left min-w-[600px]">
              <thead className="bg-accent/5 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Asesor / Usuario</th>
                  <th className="px-4 py-3">Módulo IA</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-accent/10">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Cargando historial...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Aún no hay consumo de IA registrado en este ciclo.
                    </td>
                  </tr>
                ) : (
                  Object.entries(
                    transactions.reduce((acc, tx) => {
                      const key = `${tx.feature}-${tx.profiles?.id || tx.user_id}`
                      if (!acc[key]) {
                        acc[key] = {
                          feature: tx.feature,
                          user: tx.profiles,
                          total_cost: 0,
                          last_activity: tx.created_at,
                          count: 0
                        }
                      }
                      acc[key].total_cost += tx.credits_consumed
                      acc[key].count += 1
                      if (new Date(tx.created_at) > new Date(acc[key].last_activity)) {
                        acc[key].last_activity = tx.created_at
                      }
                      return acc
                    }, {} as Record<string, any>)
                  )
                  .sort((a, b) => new Date(b[1].last_activity).getTime() - new Date(a[1].last_activity).getTime())
                  .map(([key, data]) => (
                    <tr key={key} className="hover:bg-accent/5 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs text-muted-foreground">Último uso:</div>
                        {format(new Date(data.last_activity), "d MMM, HH:mm", { locale: es })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {data.user?.full_name || "Sistema Automático"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {data.user?.email || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-background border-accent/20 text-accent">
                            {data.feature}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">({data.count} ops)</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-destructive">
                        -{data.total_cost}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
