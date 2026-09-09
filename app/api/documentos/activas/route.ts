// Documentos para clientes · lo que el usuario puede compartir: las plantillas activas de su
// agencia, y qué datos suyos faltan (para avisarle antes de que salga un documento incompleto).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { variablesQueFaltan } from "@/lib/documentos/variables";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { agencyId, userId } = await requireTenant();
    const supabase = await createClient();
    const [{ data: plantillas, error }, { data: perfil }, { data: agencia }] = await Promise.all([
      supabase
        .from("documentos_plantillas")
        .select("id, nombre, version, header_path, footer_path")
        .eq("agency_id", agencyId).eq("activa", true).order("nombre"),
      supabase.from("profiles").select("full_name, email, phone, clasificacion, role").eq("id", userId).single(),
      supabase.from("agencies").select("name").eq("id", agencyId).single(),
    ]);
    if (error) throw error;
    return NextResponse.json({
      plantillas: (plantillas ?? []).map((p) => ({
        id: p.id, nombre: p.nombre, version: p.version,
        tiene_header: !!p.header_path, tiene_footer: !!p.footer_path,
      })),
      faltan: variablesQueFaltan({ ...(perfil ?? {}), agencia: agencia?.name }),
    });
  } catch (e: unknown) {
    console.error("documentos/activas GET:", e);
    return NextResponse.json({ error: "No se pudieron cargar los documentos." }, { status: 500 });
  }
}
