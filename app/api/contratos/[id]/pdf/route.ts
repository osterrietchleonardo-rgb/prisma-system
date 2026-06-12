import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const CONTRATOS_BUCKET = "contratos"

/**
 * Recibe el PDF generado en el cliente (FormData "file") y lo guarda en Storage.
 * Usa un path estable por contrato, de modo que al modificar se reemplaza el PDF
 * (upsert) y el link se mantiene. Devuelve y persiste la URL pública en contratos.pdf_url.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Verificar que el contrato existe y obtener su agencia para el path
    const { data: contrato, error: contratoError } = await supabase
      .from("contratos")
      .select("id, agency_id")
      .eq("id", params.id)
      .single()

    if (contratoError || !contrato) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const supabaseAdmin = createAdminClient()
    const storagePath = `${contrato.agency_id}/generados/${contrato.id}.pdf`

    const { error: uploadError } = await supabaseAdmin.storage
      .from(CONTRATOS_BUCKET)
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: `Error al subir el PDF: ${uploadError.message}` }, { status: 500 })
    }

    const publicUrl = supabaseAdmin.storage.from(CONTRATOS_BUCKET).getPublicUrl(storagePath).data.publicUrl

    // Cache-busting: al reemplazar el archivo, el navegador podría servir el viejo.
    const pdf_url = `${publicUrl}?v=${Date.now()}`

    await supabase
      .from("contratos")
      .update({ pdf_url, updated_at: new Date().toISOString() })
      .eq("id", contrato.id)

    return NextResponse.json({ success: true, pdf_url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Upload contract PDF error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
