import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data, error } = await supabase.rpc('get_rls_status_prisma') // Helper function or direct SQL via REST if enabled

    // If RPC not available, we use direct postgres query via API if possible
    const { data: tables, error: sqlError } = await supabase
      .from("pg_tables") // Note: This might require specific permissions or custom view
      .select("schemaname, tablename, rowsecurity")
      .eq("schemaname", "public")

    if (sqlError) {
      // Fallback: Just return known table names with a flag indicating we should check them in dashboard
      return NextResponse.json({
        message: "Auditoría manual sugerida. Verificá Row Security en el dashboard de Supabase para estas tablas:",
        tables: ["agencies", "profiles", "properties", "leads", "lead_activities", "visits", "valuations", "agency_documents", "closings"]
      })
    }

    return NextResponse.json(tables)
  } catch (_err) {
    return NextResponse.json({ error: "No se pudo realizar el check" }, { status: 500 })
  }
}
