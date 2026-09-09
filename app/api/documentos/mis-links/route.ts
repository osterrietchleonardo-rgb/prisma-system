// Documentos para clientes · los links que ESTE usuario ya generó, con vistas: para no
// generar diez veces el mismo.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId, agencyId } = await requireTenant();
    // shared_documentos no tiene políticas: se lee con admin y se filtra acá por quien pide.
    const { data, error } = await createAdminClient()
      .from("shared_documentos")
      .select("token, snapshot, created_at, view_count")
      .eq("created_by", userId).eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({
      links: (data ?? []).map((f) => {
        const p = (f.snapshot as { plantilla?: { nombre?: string; version?: number } })?.plantilla ?? {};
        return {
          token: f.token, path: `/documento/${f.token}`,
          nombre: p.nombre ?? "", version: p.version ?? 0,
          created_at: f.created_at, view_count: f.view_count,
        };
      }),
    });
  } catch (e: unknown) {
    console.error("documentos/mis-links GET:", e);
    return NextResponse.json({ error: "No se pudieron cargar tus links." }, { status: 500 });
  }
}
