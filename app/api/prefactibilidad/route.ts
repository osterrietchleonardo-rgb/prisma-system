// GET: "Mis prefactibilidades" (asesor: las suyas; director: la agencia). POST: guardar el informe
// (recalculado en el servidor a partir de la parcela).
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { analizarParcela, ParcelaNoEncontrada } from "@/lib/prefactibilidad/analizar";
import { dependenciasSupabase } from "@/lib/prefactibilidad/dependencias-supabase";
import { GcbaNoResponde } from "@/lib/prefactibilidad/gcba";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId, agencyId, role } = await requireTenant();
    const admin = createAdminClient();
    let q = admin.from("prefactibilidades").select("id, direccion, smp, modo, token, creado_en, user_id, cur_publicado:resultado->fuentes->>curPublicado").eq("agency_id", agencyId).order("creado_en", { ascending: false }).limit(200);
    if (role !== "director") q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) throw error;
    // Spec "Qué se congela": si el GCBA publicó un Código más nuevo que el del informe, la lista ofrece recalcular.
    const { data: pub } = await admin.from("gcba_parcelas_cur").select("publicado").order("publicado", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({ prefactibilidades: data ?? [], cur_publicado_actual: pub?.publicado ?? null });
  } catch (e: any) {
    console.error("Prefactibilidad lista error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant();
    const body = await req.json().catch(() => null);
    const smp = typeof body?.smp === "string" ? body.smp.trim().toLowerCase() : "";
    const direccion = typeof body?.direccion === "string" ? body.direccion.trim() : "";
    if (!smp || !direccion) return NextResponse.json({ error: "No hay un análisis para guardar." }, { status: 400 });
    // Lo que se guarda (y después se comparte por link) lo calcula el SERVIDOR de nuevo: el navegador
    // solo dice qué parcela. Así nadie puede guardar números que PRISMA no calculó. Con la caché de la
    // parcela ya caliente, cuesta una consulta de Código y una de terrenos.
    const admin = createAdminClient();
    const p = await analizarParcela(smp, direccion, dependenciasSupabase(admin));
    const { data, error } = await admin.from("prefactibilidades").insert({ agency_id: agencyId, user_id: userId, direccion: p.direccion, smp: p.smp, modo: p.edificabilidad.modo, resultado: p }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    if (e instanceof ParcelaNoEncontrada) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof GcbaNoResponde) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Prefactibilidad guardar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
