// ACM · Lista de propiedades de la cartera de la agencia (para el desplegable "elegir sujeto").
// Devuelve TODO lo necesario para reconstruir el Sujeto: tipo, operación, m², ambientes,
// dormitorios, baños, antigüedad y amenities (mapeadas desde los tags de Tokko, que vienen en inglés).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { tokkoTagsToAmenidades } from "@/lib/acm/tokko";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("properties")
      .select(
        "id, title, address, city, property_type, status, price, currency, bedrooms, bathrooms, total_area, covered_area, tokko_data, images"
      )
      .eq("agency_id", agencyId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const items = (data || []).map((p: any) => {
      const tags: string[] = Array.isArray(p.tokko_data?.tags)
        ? p.tokko_data.tags.map((t: any) => String(t?.name || "")).filter(Boolean)
        : [];
      const ageRaw = p.tokko_data?.age;
      const antiguedad = ageRaw != null && /^\d+$/.test(String(ageRaw)) ? Number(ageRaw) : null;
      const operacion = p.status === "Alquiler" || p.status === "Temporary rent" ? "alquiler" : "venta";

      return {
        id: p.id,
        title: p.title,
        address: p.address,
        city: p.city,
        property_type: p.property_type,
        status: p.status,
        operacion,
        price: p.price ? Number(p.price) : null,
        currency: p.currency || "USD",
        bedrooms: p.bedrooms ?? null,
        bathrooms: p.bathrooms ?? null,
        m2: p.total_area ? Number(p.total_area) : p.covered_area ? Number(p.covered_area) : null,
        room_amount: (p.tokko_data?.room_amount ?? null) as number | null,
        antiguedad,
        amenidades: tokkoTagsToAmenidades(tags),
        servicios: tags, // lista cruda (por si se quiere mostrar)
        image: Array.isArray(p.images) ? (typeof p.images[0] === "string" ? p.images[0] : p.images[0]?.url ?? null) : null,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
