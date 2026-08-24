/**
 * Todas las fotos de UNA propiedad.
 *
 * El buscador de cartera (tokko-search) devuelve a propósito solo la portada:
 * con 500 propiedades de hasta 90 fotos cada una, mandarlas todas serían miles
 * de URLs por búsqueda. Acá se piden recién cuando el asesor eligió una.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tokkoId = searchParams.get("tokko_id");
    if (!tokkoId) return NextResponse.json({ error: "Falta el id de la propiedad" }, { status: 400 });

    const { agencyId } = await requireTenant();
    const supabase = await createClient();

    // La RLS por agencia ya limita lo que se ve; el filtro explícito lo deja claro.
    const { data, error } = await supabase
      .from("properties")
      .select("tokko_id, title, images")
      .eq("agency_id", agencyId)
      .eq("tokko_id", tokkoId)
      .single();

    if (error) throw error;

    const fotos: string[] = Array.isArray(data?.images)
      ? data.images.map((im: any) => (typeof im === "string" ? im : im?.url)).filter(Boolean)
      : [];

    return NextResponse.json({
      titulo: data?.title || "",
      fotos: fotos.map((u) => ({ thumb: u, image: u })),
    });
  } catch (error: any) {
    console.error("[FOTOS_PROPIEDAD]", error);
    const status = error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
