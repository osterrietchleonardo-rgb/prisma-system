import { createClient } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { getAsesorKPIs, getAsesorLeads, getAsesorVisits } from "@/lib/queries/asesor"

export function useAsesorDashboard(agentId: string) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const [kpis, leads, visits] = await Promise.all([
        getAsesorKPIs(agentId),
        getAsesorLeads(agentId),
        getAsesorVisits(agentId)
      ])

      setData({
        kpis,
        recentLeads: leads.slice(0, 5),
        upcomingVisits: visits.filter(v => new Date(v.scheduled_at) >= new Date()).slice(0, 5),
        leadsEvolution: [] // Removed mock data to comply with "no data, no metrics" request
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (agentId) {
      fetchDashboardData()
    }
  }, [agentId])

  return { data, loading, error, refresh: fetchDashboardData }
}

