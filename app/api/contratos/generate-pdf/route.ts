import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { consumeAiCredits } from "@/lib/auth/tenant-validation"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { contrato_id } = await req.json()

    if (!contrato_id) {
      return NextResponse.json({ error: "contrato_id is required" }, { status: 400 })
    }

    // Consume 5 credits for professional AI contract generation/finalization
    await consumeAiCredits("contratos_ia", 5, `Finalizing Contract ID: ${contrato_id}`);

    // Get the contrato
    const { data: contrato, error: contratoError } = await supabase
      .from("contratos")
      .select("id")
      .eq("id", contrato_id)
      .single()

    if (contratoError || !contrato) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 })
    }

    // La firma es presencial (en papel): el contrato queda listo para firmar.
    await supabase
      .from("contratos")
      .update({ estado: "pendiente_firma", updated_at: new Date().toISOString() })
      .eq("id", contrato_id)

    return NextResponse.json({ success: true, estado: "pendiente_firma" })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Generate PDF error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
