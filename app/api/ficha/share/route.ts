import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Token corto y legible (base62, ~12 chars). No secreto: identifica una ficha pública.
function genToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(12);
  let t = "";
  for (const b of Array.from(bytes)) t += alphabet[b % 62];
  return t;
}

export async function POST(req: Request) {
  try {
    const { source, id } = await req.json();
    if (!source || !id) {
      return NextResponse.json({ error: "Faltan datos de la propiedad." }, { status: 400 });
    }
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    // ── Perfil del asesor/director que comparte (su tarjeta de contacto) ──
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, avatar_url, role")
      .eq("id", userId)
      .single();

    // ── Agencia + marca (Marketing IA → Configuración IA) ──
    const { data: agency } = await supabase
      .from("agencies")
      .select("id, name, marketing_ai_config")
      .eq("id", agencyId)
      .single();

    const mk = (agency?.marketing_ai_config as any) || {};
    const brand = {
      colors: Array.isArray(mk.brand_colors) ? mk.brand_colors.filter((c: any) => typeof c === "string" && c) : [],
      font: typeof mk.brand_font === "string" ? mk.brand_font : "sans",
      logo_url: mk.logo_url || null,
    };

    // ── Propiedad: Roomix (por slug) o cartera propia/agencia (properties por uuid, validando agencia) ──
    let property: any = null;
    if (source === "roomix") {
      const slug = String(id).replace(/^roomix_/, "");
      const { data: rp } = await supabase.from("roomix_properties").select("*").eq("slug", slug).single();
      if (rp) {
        property = {
          title: rp.title,
          description: rp.description || "",
          price: rp.price ? Number(rp.price) : 0,
          currency: rp.currency || "USD",
          property_type: rp.property_type || "",
          status: rp.operation === "rent" ? "Alquiler" : "Venta",
          bedrooms: rp.bedrooms || rp.rooms || 0,
          bathrooms: rp.bathrooms || 0,
          total_area: rp.area_m2 ? Number(rp.area_m2) : 0,
          address: rp.address || rp.neighborhood || "",
          city: rp.neighborhood || rp.city || "",
          images: Array.isArray(rp.images) ? rp.images : [],
          amenities: Array.isArray(rp.amenities) ? rp.amenities : [],
          source: "roomix",
          roomix_agency_name: rp.roomix_agency_name || "Inmobiliaria colaboradora",
          canonical_url: rp.canonical_url || null,
          source_listing_url: rp.source_listing_url || null,
        };
      }
    } else {
      const { data: p } = await supabase
        .from("properties")
        .select("id, title, description, price, currency, property_type, status, bedrooms, bathrooms, total_area, covered_area, address, city, images, tokko_data, agency_id")
        .eq("id", id)
        .eq("agency_id", agencyId)
        .single();
      if (p) {
        const tags = (p.tokko_data as any)?.tags;
        const amenities = Array.isArray(tags) ? tags.map((t: any) => t?.name).filter(Boolean) : [];
        property = {
          title: p.title,
          description: p.description || "",
          price: p.price ? Number(p.price) : 0,
          currency: p.currency || "USD",
          property_type: p.property_type || "",
          status: p.status || "",
          bedrooms: p.bedrooms || 0,
          bathrooms: p.bathrooms || 0,
          total_area: Number(p.total_area || p.covered_area || 0),
          address: p.address || "",
          city: p.city || "",
          images: Array.isArray(p.images) ? p.images : [],
          amenities,
          source: source === "agency" ? "agency" : "own",
          public_url: (p.tokko_data as any)?.public_url || null,
        };
      }
    }

    if (!property) {
      return NextResponse.json({ error: "No se encontró la propiedad o no pertenece a tu agencia." }, { status: 404 });
    }

    const snapshot = {
      property,
      agent: {
        full_name: profile?.full_name || "",
        email: profile?.email || "",
        phone: profile?.phone || "",
        avatar_url: profile?.avatar_url || null,
        role: profile?.role || "asesor",
      },
      agency: { id: agency?.id || agencyId, name: agency?.name || "" },
      brand,
    };

    const token = genToken();
    const admin = createAdminClient();
    const { error: insErr } = await admin.from("shared_properties").insert({
      token,
      property_source: property.source,
      property_id: String(id),
      snapshot,
      created_by: userId,
      agency_id: agencyId,
    });
    if (insErr) throw insErr;

    return NextResponse.json({ token, path: `/ficha/${token}` });
  } catch (error: any) {
    console.error("Share ficha error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
