// Documentos para clientes · compartir. Arma la copia congelada con los datos de QUIEN
// comparte y devuelve el link. Lo pueden usar el asesor y el director.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { generarToken } from "@/lib/ficha/token";
import { marcaDeLaAgencia } from "@/lib/ficha/snapshot";
import { normalizarPlantilla } from "@/lib/documentos/plantilla";
import { armarSnapshot } from "@/lib/documentos/snapshot";
import { urlPublica } from "@/lib/documentos/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { agencyId, userId } = await requireTenant();
    const { plantilla_id } = (await req.json()) as { plantilla_id?: string };
    if (!plantilla_id) return NextResponse.json({ error: "Falta la plantilla." }, { status: 400 });

    const supabase = await createClient();
    const { data: fila } = await supabase
      .from("documentos_plantillas")
      .select("id, agency_id, nombre, cuerpo, header_path, footer_path, bloque_asesor, version, activa, updated_at")
      .eq("id", plantilla_id).eq("agency_id", agencyId).maybeSingle();
    // Inactiva o ajena: para quien comparte, no existe.
    if (!fila || !fila.activa) return NextResponse.json({ error: "Ese documento no está disponible." }, { status: 404 });

    const [{ data: perfil }, { data: agencia }] = await Promise.all([
      supabase.from("profiles").select("full_name, email, phone, clasificacion, role, avatar_url").eq("id", userId).single(),
      supabase.from("agencies").select("id, name, marketing_ai_config").eq("id", agencyId).single(),
    ]);

    const plantilla = normalizarPlantilla(fila);
    const snapshot = armarSnapshot({
      plantilla,
      header_url: urlPublica(plantilla.header_path),
      footer_url: urlPublica(plantilla.footer_path),
      agent: {
        full_name: perfil?.full_name || "",
        email: perfil?.email || "",
        phone: perfil?.phone || "",
        clasificacion: perfil?.clasificacion ?? null,
        role: perfil?.role || "asesor",
        avatar_url: perfil?.avatar_url ?? null,
      },
      agency: { id: agencia?.id || agencyId, name: agencia?.name || "" },
      brand: marcaDeLaAgencia(agencia?.marketing_ai_config),
    });

    const token = generarToken();
    const { error } = await createAdminClient().from("shared_documentos").insert({
      token, snapshot, plantilla_id, created_by: userId, agency_id: agencyId,
    });
    if (error) throw error;

    return NextResponse.json({ token, path: `/documento/${token}` });
  } catch (e: unknown) {
    console.error("documentos/compartir POST:", e);
    return NextResponse.json({ error: "No se pudo armar el documento. Probá de nuevo." }, { status: 500 });
  }
}
