// Documentos para clientes · vista previa. Arma el snapshot de una plantilla SIN GUARDARLA,
// con un asesor real de la agencia, para que el director vea cómo queda antes de guardar.
// No escribe nada.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { marcaDeLaAgencia } from "@/lib/ficha/snapshot";
import { normalizarPlantilla } from "@/lib/documentos/plantilla";
import { armarSnapshot } from "@/lib/documentos/snapshot";

export const dynamic = "force-dynamic";

const CAMPOS = "full_name, email, phone, clasificacion, role, avatar_url, estado";

export async function POST(req: Request) {
  try {
    const { agencyId, userId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director." }, { status: 403 });
    const body = (await req.json()) as { plantilla?: unknown; header_url?: string | null; footer_url?: string | null };

    const supabase = await createClient();
    const [{ data: asesores }, { data: yo }, { data: agencia }] = await Promise.all([
      supabase.from("profiles").select(CAMPOS).eq("agency_id", agencyId).eq("role", "asesor").order("full_name").limit(30),
      supabase.from("profiles").select(CAMPOS).eq("id", userId).single(),
      supabase.from("agencies").select("id, name, marketing_ai_config").eq("id", agencyId).single(),
    ]);
    // El primer asesor que está activo (pausado y eliminado no cuentan). Si no hay ninguno,
    // el propio director: la vista previa siempre tiene a alguien.
    const activo = (asesores ?? []).find((a) => a.estado !== "pausado" && a.estado !== "eliminado");
    const modelo = activo ?? yo;

    const snapshot = armarSnapshot({
      plantilla: normalizarPlantilla(body.plantilla),
      header_url: body.header_url ?? null,
      footer_url: body.footer_url ?? null,
      agent: {
        full_name: modelo?.full_name || "",
        email: modelo?.email || "",
        phone: modelo?.phone || "",
        clasificacion: modelo?.clasificacion ?? null,
        role: modelo?.role || "asesor",
        avatar_url: modelo?.avatar_url ?? null,
      },
      agency: { id: agencia?.id || agencyId, name: agencia?.name || "" },
      brand: marcaDeLaAgencia(agencia?.marketing_ai_config),
    });
    return NextResponse.json({ snapshot, asesor: modelo?.full_name || "" });
  } catch (e: unknown) {
    console.error("documentos/vista-previa POST:", e);
    return NextResponse.json({ error: "No se pudo armar la vista previa." }, { status: 500 });
  }
}
