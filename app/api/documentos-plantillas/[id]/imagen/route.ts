// Documentos para clientes · subir o quitar la imagen de header o footer de una plantilla.
// Solo director. La imagen se mide con sharp (ver lib/documentos/imagen.ts) y la anterior se
// borra del bucket al reemplazarla.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { validarImagen } from "@/lib/documentos/imagen";
import { BUCKET_IMAGENES, rutaDeImagen, urlPublica } from "@/lib/documentos/storage";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };
const CUALES = ["header", "footer"] as const;
type Cual = (typeof CUALES)[number];

async function plantillaPropia(id: string, agencyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documentos_plantillas").select("id, header_path, footer_path")
    .eq("id", id).eq("agency_id", agencyId).maybeSingle();
  return data;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director carga imágenes." }, { status: 403 });
    const actual = await plantillaPropia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const cual = String(form.get("cual") ?? "") as Cual;
    if (!file) return NextResponse.json({ error: "No llegó ningún archivo." }, { status: 400 });
    if (!CUALES.includes(cual)) return NextResponse.json({ error: "Decime si es header o footer." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const v = await validarImagen(buffer, file.type);
    if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 });

    const admin = createAdminClient();
    const path = rutaDeImagen(agencyId, params.id, cual, v.ext);
    const { error: upErr } = await admin.storage
      .from(BUCKET_IMAGENES).upload(path, buffer, { contentType: file.type, upsert: true });
    if (upErr) throw upErr;

    // La anterior se borra: no hay motivo para acumular franjas viejas en el bucket.
    const anterior = cual === "header" ? actual.header_path : actual.footer_path;
    if (anterior) await admin.storage.from(BUCKET_IMAGENES).remove([anterior]);

    const supabase = await createClient();
    const { error } = await supabase
      .from("documentos_plantillas")
      .update({ [`${cual}_path`]: path, updated_at: new Date().toISOString() })
      .eq("id", params.id).eq("agency_id", agencyId);
    if (error) throw error;

    return NextResponse.json({ path, url: urlPublica(path), ancho: v.ancho, alto: v.alto });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id]/imagen POST:", e);
    return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director quita imágenes." }, { status: 403 });
    const actual = await plantillaPropia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const { cual } = (await req.json()) as { cual?: Cual };
    if (!cual || !CUALES.includes(cual)) return NextResponse.json({ error: "Decime si es header o footer." }, { status: 400 });

    const path = cual === "header" ? actual.header_path : actual.footer_path;
    if (path) await createAdminClient().storage.from(BUCKET_IMAGENES).remove([path]);

    const supabase = await createClient();
    const { error } = await supabase
      .from("documentos_plantillas")
      .update({ [`${cual}_path`]: null, updated_at: new Date().toISOString() })
      .eq("id", params.id).eq("agency_id", agencyId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id]/imagen DELETE:", e);
    return NextResponse.json({ error: "No se pudo quitar la imagen." }, { status: 500 });
  }
}
