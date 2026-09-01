/**
 * Subir una foto propia para retocarla en la solapa "Fotos".
 *
 * El caso: la propiedad todavía NO está cargada en Tokko. El asesor mejora la
 * foto acá y después sube la corregida a la ficha, una sola vez.
 *
 * Esto solo deja la foto en el bucket y devuelve su URL: el retoque sigue
 * siendo `editar-foto`, que baja la foto de cualquier URL. Por eso NO consume
 * créditos — subir un archivo no gasta IA.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { validarFotoSubida, nombreDeArchivo } from "@/lib/marketing-ia/subida-foto";
import sharp from "sharp";

export const dynamic = "force-dynamic";

/** Lado mayor de la foto que se guarda. La IA devuelve menos que esto igual. */
const MAX_LADO = 1600;

export async function POST(req: Request) {
  try {
    const { userId } = await requireTenant();

    const formData = await req.formData();
    const archivo = formData.get("file");
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "No llegó ninguna foto." }, { status: 400 });
    }

    const problema = validarFotoSubida({ tipo: archivo.type, bytes: archivo.size });
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });

    // `.rotate()` sin argumentos aplica la orientación del EXIF y la borra. Sin
    // esto una foto de celular entra acostada y la IA la retoca acostada. El
    // navegador ya la endereza al achicarla, pero acá no se depende de eso.
    const foto = await sharp(Buffer.from(await archivo.arrayBuffer()))
      .rotate()
      .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();

    const nombre = nombreDeArchivo(userId);
    const admin = createAdminClient();
    const { error } = await admin.storage
      .from("marketing-images")
      .upload(nombre, foto, { contentType: "image/jpeg", cacheControl: "3600" });
    if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);

    const supabase = await createClient();
    const {
      data: { publicUrl },
    } = supabase.storage.from("marketing-images").getPublicUrl(nombre);

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error("[SUBIR_FOTO]", error);
    const msg = error?.message || "No se pudo subir la foto";
    // Sin sesión no es un error del servidor: `requireTenant` tira "Unauthorized".
    const status = /unauthorized/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
