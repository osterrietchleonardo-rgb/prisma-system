import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { contrato_id, signatures } = await req.json()

    if (!contrato_id) {
      return NextResponse.json({ error: "contrato_id is required" }, { status: 400 })
    }

    // Get the contrato
    const { data: contrato, error: contratoError } = await supabase
      .from("contratos")
      .select("*, contract_templates(*)")
      .eq("id", contrato_id)
      .single()

    if (contratoError || !contrato) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 })
    }

    // Save signatures if provided
    if (signatures && Array.isArray(signatures)) {
      for (const sig of signatures) {
        await supabase.from("contract_signatures").insert({
          contrato_id,
          firmante_rol: sig.firmante_rol,
          firmante_nombre: sig.firmante_nombre,
          firmante_dni: sig.firmante_dni || null,
          firma_imagen_base64: sig.firma_imagen_base64 || null,
          firmado_at: new Date().toISOString(),
        })
      }
    }

    // Update contrato status
    const newEstado = signatures && signatures.length > 0 ? "firmado" : "pendiente_firma"
    await supabase
      .from("contratos")
      .update({ estado: newEstado, updated_at: new Date().toISOString() })
      .eq("id", contrato_id)

    return NextResponse.json({ success: true, estado: newEstado })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Generate PDF error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
