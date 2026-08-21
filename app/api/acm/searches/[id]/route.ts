// ACM · Historial "Mis ACM": abrir (GET) o borrar (DELETE) una búsqueda guardada.
// GET devuelve el snapshot completo para reabrir la pantalla de resultados tal cual quedó.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { normalizarFotoRoomix } from "@/lib/acm/fotos-descarga";

export const dynamic = "force-dynamic";

// El asesor solo toca las propias; el director, cualquiera de su agencia.
async function findRow(id: string, select: string) {
  const { userId, agencyId, role } = await requireTenant();
  const admin = createAdminClient();
  let q = admin.from("acm_searches").select(select).eq("id", id).eq("agency_id", agencyId);
  if (role !== "director") q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return { admin, row: data as any };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { row } = await findRow(params.id, "id, operacion, sujeto, exclude_id, resultados, ficha_token, created_at");
    if (!row) return NextResponse.json({ error: "No encontramos ese ACM." }, { status: 404 });

    const r = row.resultados || {};
    return NextResponse.json({
      id: row.id,
      operacion: row.operacion,
      sujeto: row.sujeto,
      exclude_id: row.exclude_id,
      cartera: Array.isArray(r.cartera) ? r.cartera : [],
      // La foto se arregla AL LEER, no solo al guardar: el snapshot de las búsquedas hechas
      // antes de este fix tiene congelada la URL `.webp` que el CDN de roomix no sirve (ver
      // `normalizarFotoRoomix`). Sin esto, reabrir un ACM viejo desde "Mis ACM" seguiría
      // mostrando la tarjeta sin foto para siempre. No se reescribe la fila: la búsqueda
      // guardada es un registro de lo que se buscó, y arreglar la URL al vuelo alcanza.
      roomix: Array.isArray(r.roomix)
        ? r.roomix.map((c: any) => (c?.imagen ? { ...c, imagen: normalizarFotoRoomix(c.imagen) } : c))
        : [],
      con_semantica: Boolean(r.con_semantica),
      // Ausente en búsquedas guardadas ANTES de este fix (viejo `resultados` sin estos campos):
      // `Boolean(undefined)` da `false`, el mismo default seguro que ya tenía el front
      // hardcodeado — ninguna búsqueda vieja pasa a mostrar un banner que antes no tenía.
      cartera_fallo: Boolean(r.cartera_fallo),
      roomix_fallo: Boolean(r.roomix_fallo),
      ficha_token: row.ficha_token,
      created_at: row.created_at,
    });
  } catch (e: any) {
    console.error("ACM historial detalle error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, row } = await findRow(params.id, "id");
    if (!row) return NextResponse.json({ error: "No encontramos ese ACM." }, { status: 404 });
    const { error } = await admin.from("acm_searches").delete().eq("id", row.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("ACM historial borrar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
