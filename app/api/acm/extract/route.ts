// ACM · Extraer la propiedad sujeto desde la URL de un portal (botón "Analizar").
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { extractFromUrl } from "@/lib/acm/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireTenant(); // solo usuarios logueados de una agencia
    const { url } = await req.json();
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }
    const result = await extractFromUrl(url.trim());
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
