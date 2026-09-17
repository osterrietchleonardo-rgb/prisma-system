// Dirección (calle oficial + altura) → parcela por las puertas del GCBA → informe completo.
// No guarda nada: guardar es otro botón (POST /api/prefactibilidad).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { analizarParcela, ParcelaNoEncontrada } from "@/lib/prefactibilidad/analizar";
import { dependenciasSupabase } from "@/lib/prefactibilidad/dependencias-supabase";
import { GcbaNoResponde } from "@/lib/prefactibilidad/gcba";
import { calleClave } from "@/lib/prefactibilidad/normalizar-calle";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ calle: z.string().min(1), altura: z.number().int().positive(), direccion: z.string().min(1) });

export async function POST(req: Request) {
  try {
    await requireTenant();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Elegí una dirección de la lista." }, { status: 400 });
    const { calle, altura, direccion } = parsed.data;
    const admin = createAdminClient();
    const { data: puerta } = await admin.from("gcba_puertas").select("smp, es_esquina").eq("calle_clave", calleClave(calle)).eq("altura", altura).limit(1).maybeSingle();
    if (!puerta) return NextResponse.json({ error: "No encontramos ese número. Probá con otro número de la misma cuadra" }, { status: 404 });
    const prefactibilidad = await analizarParcela(puerta.smp, direccion, dependenciasSupabase(admin));
    return NextResponse.json({ prefactibilidad });
  } catch (e: any) {
    if (e instanceof ParcelaNoEncontrada) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof GcbaNoResponde) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Prefactibilidad analizar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
