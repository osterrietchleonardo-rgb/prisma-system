// Ficha pública de UNA propiedad: el asesor/director genera un link de lujo con su tarjeta
// de contacto y la marca de su agencia. El armado del pedazo de snapshot vive en
// lib/ficha/snapshot.ts, compartido con la ficha de una SELECCIÓN de varias propiedades.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { generarToken } from "@/lib/ficha/token";
import { marcaDeLaAgencia, propiedadParaFicha } from "@/lib/ficha/snapshot";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { source, id } = await req.json();
    if (!source || !id) {
      return NextResponse.json({ error: "Faltan datos de la propiedad." }, { status: 400 });
    }
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    // ── Perfil del asesor/director que comparte (su tarjeta de contacto) ──
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, avatar_url, role")
      .eq("id", userId)
      .single();

    // ── Agencia + marca (Marketing IA → Configuración IA) ──
    const { data: agency } = await supabase
      .from("agencies")
      .select("id, name, marketing_ai_config")
      .eq("id", agencyId)
      .single();

    // ── Propiedad: Roomix (por slug) o cartera propia/agencia (properties por uuid,
    //    validando agencia). Las tres respuestas de error —503 si falló la consulta, 404
    //    si el aviso de la red se dio de baja, 404 si no es de tu agencia— salen de acá.
    const resultado = await propiedadParaFicha(supabase as any, source, String(id), agencyId);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.motivo }, { status: resultado.estado });
    }

    const snapshot = {
      property: resultado.propiedad,
      agent: {
        full_name: profile?.full_name || "",
        email: profile?.email || "",
        phone: profile?.phone || "",
        avatar_url: profile?.avatar_url || null,
        role: profile?.role || "asesor",
      },
      agency: { id: agency?.id || agencyId, name: agency?.name || "" },
      brand: marcaDeLaAgencia(agency?.marketing_ai_config),
    };

    const token = generarToken();
    const admin = createAdminClient();
    const { error: insErr } = await admin.from("shared_properties").insert({
      token,
      property_source: resultado.propiedad.source,
      property_id: String(id),
      snapshot,
      created_by: userId,
      agency_id: agencyId,
    });
    if (insErr) throw insErr;

    return NextResponse.json({ token, path: `/ficha/${token}` });
  } catch (error: any) {
    console.error("Share ficha error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
