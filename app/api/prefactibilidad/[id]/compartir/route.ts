// Genera (o reutiliza) el token del link público. Token base62 de 12, como el del ACM.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function genToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(crypto.randomBytes(12)).map((b) => alphabet[b % 62]).join("");
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId, role } = await requireTenant();
    const admin = createAdminClient();
    let q = admin.from("prefactibilidades").select("id, token").eq("id", params.id).eq("agency_id", agencyId);
    if (role !== "director") q = q.eq("user_id", userId);
    const { data: row } = await q.maybeSingle();
    if (!row) return NextResponse.json({ error: "No encontramos esa prefactibilidad." }, { status: 404 });
    let token = row.token as string | null;
    if (!token) {
      token = genToken();
      const { error } = await admin.from("prefactibilidades").update({ token }).eq("id", row.id);
      if (error) throw error;
    }
    return NextResponse.json({ token, path: `/prefactibilidad/${token}` });
  } catch (e: any) {
    console.error("Prefactibilidad compartir error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
