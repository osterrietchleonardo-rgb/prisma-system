// Autocompletar direcciones con el callejero oficial (USIG). Solo CABA, máximo 5.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { crearClienteGcba, GcbaNoResponde } from "@/lib/prefactibilidad/gcba";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireTenant();
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 3) return NextResponse.json({ direcciones: [] });
    const todas = await crearClienteGcba().normalizar(q, 5);
    return NextResponse.json({ direcciones: todas.filter((d) => d.esCaba), fueraDeCaba: todas.length > 0 && todas.every((d) => !d.esCaba) });
  } catch (e: any) {
    if (e instanceof GcbaNoResponde) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Prefactibilidad direcciones error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
