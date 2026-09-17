// Abrir (GET) o borrar (DELETE) una prefactibilidad guardada. Molde: app/api/acm/searches/[id]/route.ts.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function buscar(id: string, select: string) {
  const { userId, agencyId, role } = await requireTenant();
  const admin = createAdminClient();
  let q = admin.from("prefactibilidades").select(select).eq("id", id).eq("agency_id", agencyId);
  if (role !== "director") q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return { admin, row: data as any };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { row } = await buscar(params.id, "id, resultado, token, creado_en");
    if (!row) return NextResponse.json({ error: "No encontramos esa prefactibilidad." }, { status: 404 });
    return NextResponse.json({ prefactibilidad: row.resultado, token: row.token, creado_en: row.creado_en });
  } catch (e: any) {
    console.error("Prefactibilidad detalle error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, row } = await buscar(params.id, "id");
    if (!row) return NextResponse.json({ error: "No encontramos esa prefactibilidad." }, { status: 404 });
    const { error } = await admin.from("prefactibilidades").delete().eq("id", row.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Prefactibilidad borrar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
