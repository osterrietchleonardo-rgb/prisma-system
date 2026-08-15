// Mapa · ficha completa de UNA propiedad, con todas las fotos y la descripcion.
//
// El listado del mapa manda solo una foto de portada por propiedad: traer todo para
// 1.000 puntos tarda 1.653 ms contra 10 ms (medido el 2026-08-05). La ficha completa se
// pide aca, que es cuando el usuario clickea el punto y realmente la necesita.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()

    // El id del listado ya viene con la forma que usa el chat: "roomix_<slug>" o el uuid.
    const id = new URL(req.url).searchParams.get("id")?.trim()
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 })

    const admin = createAdminClient()

    // ── Red de colaboracion ──
    if (id.startsWith("roomix_")) {
      const slug = id.slice("roomix_".length)
      // La lista de columnas va en UNA sola cadena, sin partirla con +: el cliente de
      // Supabase deduce los tipos leyendo el texto literal, y una concatenacion le deja
      // el tipo en `string`. Ahi devuelve GenericStringError y se pierde el chequeo de
      // TypeScript sobre cada columna.
      const { data: r, error } = await admin
        .from("roomix_properties")
        .select("slug, title, description, operation, price, currency, property_type, rooms, bedrooms, bathrooms, area_m2, address, neighborhood, lat, lng, amenities, images, roomix_agency_name, roomix_agency_logo, roomix_agency_source_url, canonical_url")
        .eq("slug", slug)
        // Solo lo publicado. Los pines ya salen filtrados, asi que por la pantalla no se
        // llega a una baja; pero este endpoint acepta cualquier slug, y de aca sale la
        // ficha que el asesor le COMPARTE al cliente. Una propiedad dada de baja no puede
        // viajar por WhatsApp como si estuviera a la venta.
        //
        // `.eq(..., true)` y no "distinto de false": hay 113.086 filas con is_active en
        // NULL, y NULL no es publicado. Es el mismo criterio que el `WHERE r.is_active` de
        // las funciones del mapa, donde NULL tampoco pasa.
        .eq("is_active", true)
        .maybeSingle()
      if (error) throw error
      if (!r) return NextResponse.json({ error: "No encontrada" }, { status: 404 })

      return NextResponse.json({
        propiedad: {
          id,
          title: r.title,
          description: r.description || "",
          price: r.price ? Number(r.price) : 0,
          currency: r.currency || "USD",
          property_type: r.property_type || "",
          status: r.operation === "rent" ? "Alquiler" : "Venta",
          // `bedrooms` a secas: la ficha los muestra como "Dorm." y el respaldo en `rooms`
          // ponia los AMBIENTES en su lugar, asi que un 3 ambientes sin dormitorios
          // cargados se leia como "3 Dorm.". Son cosas distintas — ver lib/mapa/tipos.ts.
          bedrooms: r.bedrooms || 0,
          bathrooms: r.bathrooms || 0,
          total_area: r.area_m2 ? Number(r.area_m2) : 0,
          address: r.address || r.neighborhood || "",
          city: r.neighborhood,
          images: r.images || [],
          amenities: r.amenities || [],
          similarity: 0,
          source: "roomix",
          agent_name: "",
          agent_email: "",
          roomix_agency_name: r.roomix_agency_name || "Inmobiliaria colaboradora",
          roomix_agency_logo: r.roomix_agency_logo,
          roomix_agency_source_url: r.roomix_agency_source_url,
          canonical_url: r.canonical_url,
          lat: r.lat,
          lng: r.lng,
        },
      })
    }

    // ── Cartera de la agencia. El .eq("agency_id") no es decorativo: createAdminClient
    //    se saltea RLS, asi que el aislamiento por agencia lo tiene que poner la consulta.
    const { data: p, error } = await admin
      .from("properties")
      .select("id, title, description, price, currency, property_type, status, bedrooms, bathrooms, total_area, covered_area, address, city, images, lat, lng, assigned_agent_id, assigned_agent, tokko_data, agent_profile:profiles(full_name, email)")
      .eq("id", id)
      .eq("agency_id", agencyId)
      // Misma razon que en la red: de aca sale la ficha que se le comparte al cliente.
      .eq("is_active", true)
      .maybeSingle()
    if (error) throw error
    if (!p) return NextResponse.json({ error: "No encontrada" }, { status: 404 })

    const perfil = p.agent_profile as { full_name?: string; email?: string } | null
    const asignado = p.assigned_agent as { name?: string; email?: string } | null
    const tokko = p.tokko_data as { public_url?: string } | null

    return NextResponse.json({
      propiedad: {
        id: p.id,
        title: p.title,
        description: p.description || "",
        price: p.price ? Number(p.price) : 0,
        currency: p.currency || "USD",
        property_type: p.property_type || "",
        status: p.status || "Venta",
        bedrooms: p.bedrooms || 0,
        bathrooms: p.bathrooms || 0,
        total_area: p.total_area ? Number(p.total_area) : 0,
        covered_area: p.covered_area ? Number(p.covered_area) : 0,
        address: p.address,
        city: p.city,
        images: p.images || [],
        similarity: 0,
        source: p.assigned_agent_id === userId ? "own" : "agency",
        agent_name: perfil?.full_name || asignado?.name || "Sin asignar",
        agent_email: perfil?.email || asignado?.email || "",
        public_url: tokko?.public_url || null,
        lat: p.lat,
        lng: p.lng,
      },
    })
  } catch (e: any) {
    console.error("Mapa propiedad error:", e)
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 500 },
    )
  }
}
