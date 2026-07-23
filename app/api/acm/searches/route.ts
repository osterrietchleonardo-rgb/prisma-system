// ACM · Historial "Mis ACM": lista las búsquedas guardadas.
// El asesor ve las propias; el director ve las de toda la agencia (con el nombre de quién la hizo).
// Devolvemos solo la cabecera de cada fila (sin el snapshot de comparables) para que la lista sea liviana.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId, agencyId, role } = await requireTenant();
    const admin = createAdminClient();

    let q = admin
      .from("acm_searches")
      .select("id, user_id, operacion, sujeto, total_cartera, total_roomix, ficha_token, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (role !== "director") q = q.eq("user_id", userId);

    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
    const nombres: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", userIds);
      for (const p of profs || []) nombres[p.id] = p.full_name || "";
    }

    return NextResponse.json({
      searches: rows.map((r: any) => ({
        id: r.id,
        operacion: r.operacion,
        direccion: r.sujeto?.direccion || "",
        barrio: r.sujeto?.barrio || "",
        tipo: r.sujeto?.tipo_propiedad || "",
        m2: r.sujeto?.m2_cubiertos ?? null,
        total_cartera: r.total_cartera,
        total_roomix: r.total_roomix,
        ficha_token: r.ficha_token,
        autor: nombres[r.user_id] || "",
        es_mio: r.user_id === userId,
        created_at: r.created_at,
      })),
      puede_ver_equipo: role === "director",
    });
  } catch (e: any) {
    console.error("ACM historial error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
