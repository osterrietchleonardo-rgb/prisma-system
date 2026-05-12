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
        const { data: txData } = await supabase
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

        if (txData) setTransactions(txData as any[])

      } catch (error) {
        console.error("Error fetching AI credits data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCreditsData()
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
          <div className="rounded-md border border-accent/10 bg-background/50 overflow-hidden">
            <table className="w-full text-sm text-left">
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
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-accent/5 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(new Date(tx.created_at), "d MMM, HH:mm", { locale: es })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {tx.profiles?.full_name || "Sistema Automático"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {tx.profiles?.email || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="bg-background border-accent/20 text-accent">
                          {tx.feature}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-destructive">
                        -{tx.credits_consumed}
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
