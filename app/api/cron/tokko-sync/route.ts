import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { getAdminClient, runPropertiesSync, runLeadsSync } from "@/lib/tokko-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────
// Cron de sincronización automática de Tokko (propiedades + leads).
// Lo dispara un GitHub Action 2 veces por día (7am y 6pm Argentina).
// Recorre TODAS las agencias con tokko_api_key y sincroniza cada una,
// usando la misma lógica que los botones manuales (lib/tokko-sync).
// ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  const admin = getAdminClient()

  const { data: agencies, error } = await admin
    .from("agencies")
    .select("id, name, tokko_api_key")
    .not("tokko_api_key", "is", null)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!agencies || agencies.length === 0) {
    return NextResponse.json({ success: true, message: "No hay agencias con Tokko configurado." })
  }

  const results: Record<string, unknown> = {}

  for (const agency of agencies) {
    if (!agency.tokko_api_key) continue
    const res: Record<string, unknown> = {}

    try {
      const props = await runPropertiesSync(admin, agency.id, agency.tokko_api_key)
      res.propiedades = props.count
    } catch (e) {
      res.propiedades_error = e instanceof Error ? e.message : "error"
    }

    try {
      const leads = await runLeadsSync(admin, agency.id, agency.tokko_api_key)
      res.leads_nuevos = leads.nuevos
      res.leads_total = leads.imported
    } catch (e) {
      res.leads_error = e instanceof Error ? e.message : "error"
    }

    results[agency.name || agency.id] = res
  }

  return NextResponse.json({ success: true, agencias: agencies.length, results })
}
