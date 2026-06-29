// Marketing IA · Buscador de propiedades para asociar a un IPC.
// Lee la CARTERA COMPLETA de la agencia desde la tabla local `properties`
// (la misma fuente sincronizada de Tokko que usa el ACM), en vez de pegarle a
// la API de Tokko en vivo con un tope de 10. Así el director (y el asesor)
// tienen acceso total a su cartera. La RLS "Properties: agency visibility"
// (agency_id = get_my_agency_id()) garantiza que solo se vea la propia agencia.
//
// Importante: devolvemos `id` = ID numérico de Tokko (columna tokko_id), porque
// el resto del flujo (guardar el IPC y generar copy/imagen) usa ese ID para
// re-consultar la propiedad en Tokko.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";

// status interno (Tokko viene en inglés/español) → operación legible.
function statusToOperation(status: string | null): string {
  return status === "Alquiler" || status === "Temporary rent" ? "Alquiler" : "Venta";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("query") || "").trim();
    const propertyType = searchParams.get("property_type"); // "0" todos, "1" depto, "2" casa, "3" ph
    const operationType = searchParams.get("operation_type") || "1"; // "1" venta, "2" alquiler

    const { agencyId } = await requireTenant();
    const supabase = await createClient();

    let q = supabase
      .from("properties")
      .select(
        "tokko_id, title, address, city, property_type, status, price, currency, bedrooms, bathrooms, total_area, covered_area, images, tokko_data, description"
      )
      .eq("agency_id", agencyId)
      .eq("is_active", true)
      .not("tokko_id", "is", null);

    // Operación
    if (operationType === "2") q = q.in("status", ["Alquiler", "Temporary rent"]);
    else if (operationType === "1") q = q.eq("status", "Venta");

    // Tipo (los valores reales vienen de Tokko: "Departamento", "Casa", "PH", etc.)
    if (propertyType === "1") q = q.ilike("property_type", "%departamento%");
    else if (propertyType === "2") q = q.ilike("property_type", "%casa%");
    else if (propertyType === "3") q = q.ilike("property_type", "%ph%");

    // Texto libre: título, dirección, ciudad o descripción.
    if (query) {
      const safe = query.replace(/[%,()]/g, " ").trim();
      if (safe) {
        q = q.or(
          `title.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%,description.ilike.%${safe}%`
        );
      }
    }

    const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;

    const properties = (data || []).map((p: any) => {
      const td = p.tokko_data || {};
      const tags: string[] = Array.isArray(td.tags)
        ? td.tags.map((t: any) => String(t?.name || "")).filter(Boolean)
        : [];
      const imgs: string[] = Array.isArray(p.images)
        ? p.images.map((im: any) => (typeof im === "string" ? im : im?.url)).filter(Boolean)
        : [];

      return {
        id: Number(p.tokko_id), // ID de Tokko (lo consume el resto del flujo)
        reference_code: td.reference_code || "",
        title: p.title || p.address || "Propiedad",
        address: p.address || "",
        zone: p.city || td.location?.name || "",
        property_type: p.property_type || "",
        operation_type: statusToOperation(p.status),
        price: p.price ? Number(p.price) : 0,
        currency: p.currency || "USD",
        surface_total: p.total_area ? Number(p.total_area) : p.covered_area ? Number(p.covered_area) : 0,
        surface_covered: p.covered_area ? Number(p.covered_area) : 0,
        rooms: td.room_amount ?? p.bedrooms ?? 0,
        bathrooms: p.bathrooms ?? 0,
        description: (p.description || "").slice(0, 600),
        photos: imgs.slice(0, 1).map((u) => ({ thumb: u, image: u })),
        tags,
      };
    });

    return NextResponse.json(properties);
  } catch (error: any) {
    console.error("Marketing cartera search error:", error);
    const status = error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
