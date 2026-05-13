"use server"

import { getDashboardData } from "@/lib/queries/dashboard"
import { createClient } from "@/lib/supabase/server"

export async function getAgentPerformanceAction(agentId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) throw new Error("Agency not found")

  const data = await getDashboardData(profile.agency_id, agentId)
  return data.kpis
}
