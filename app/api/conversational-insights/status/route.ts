import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("agency_id, role").eq("id", user.id).single()

    if (!profile?.agency_id || profile.role !== "director")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const admin = createAdminClient()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    // Fetch by record ID (used during polling)
    if (id) {
      const { data } = await admin
        .from("dashboard_conversational_insights")
        .select("id, status, analyzed_at, conversations_count, processed_sessions, total_sessions, kpis, funnel, lead_profile, demand_analysis, temporal, attention, error_message")
        .eq("id", id)
        .eq("agency_id", profile.agency_id)
        .single()
      if (!data) return NextResponse.json(null)
      return NextResponse.json(data)
    }

    // Fetch latest for a given period (initial load)
    const period = searchParams.get("period") || "30d"
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const now = new Date()
    let periodStart: Date
    let periodEnd = new Date(now)

    if (period === "7d") periodStart = new Date(now.getTime() - 7 * 86400000)
    else if (period === "90d") periodStart = new Date(now.getTime() - 90 * 86400000)
    else if (period === "custom" && from && to) {
      periodStart = new Date(from); periodEnd = new Date(to)
    } else {
      periodStart = new Date(now.getTime() - 30 * 86400000)
    }

    const { data } = await admin
      .from("dashboard_conversational_insights")
      .select("id, status, analyzed_at, conversations_count, processed_sessions, total_sessions, kpis, funnel, lead_profile, demand_analysis, temporal, attention, error_message")
      .eq("agency_id", profile.agency_id)
      .eq("period_start", periodStart.toISOString())
      .eq("period_end", periodEnd.toISOString())
      .maybeSingle()

    return NextResponse.json(data || null)
  } catch (err) {
    console.error("[insights status]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
