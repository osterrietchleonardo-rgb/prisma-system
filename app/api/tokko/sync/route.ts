import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { runPropertiesSync } from "@/lib/tokko-sync"

export const dynamic = "force-dynamic";
import { rateLimit, LIMITS } from "@/lib/rate-limiter"

export async function POST() {
  const supabase = createClient()
  
  try {
    // 1. Verificar sesión y rol
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, agency_id")
      .eq("id", session.user.id)
      .single()

    if (profile?.role !== "director" || !profile.agency_id) {
      return NextResponse.json({ error: "No tienes permisos para realizar esta acción" }, { status: 403 })
    }

    // 2. Rate Limiting (1 req/5min por agencyId)
    const rl = await rateLimit(profile.agency_id, LIMITS.TOKKO_SYNC)
    if (!rl.success) {
      return NextResponse.json({ error: rl.errorMessage }, { status: 429 })
    }

    // 3. Obtener API Key de Tokko
    const { data: agency } = await supabase
      .from("agencies")
      .select("tokko_api_key")
      .eq("id", profile.agency_id)
      .single()

    if (!agency?.tokko_api_key) {
      return NextResponse.json({ error: "API Key de Tokko no configurada" }, { status: 400 })
    }

    // 3.5 Crear admin client para bypass RLS en inserciones
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 4. Sync (lógica compartida con el cron — ver lib/tokko-sync)
    const { count } = await runPropertiesSync(adminClient, profile.agency_id, agency.tokko_api_key)

    return NextResponse.json({ success: true, count })

  } catch (error: any) {
    const message = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    console.error("Tokko Sync Error:", message)
    return NextResponse.json({ 
      error: message || "Error interno durante la sincronización con Tokko" 
    }, { status: 500 })
  }
}
