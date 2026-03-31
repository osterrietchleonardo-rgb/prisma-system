import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || "";
    const property_type = searchParams.get('property_type');
    const operation_type = searchParams.get('operation_type') || "1"; // Default to Venta if matches Tokko IDs
    const zone = searchParams.get('zone');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", user.id)
      .single();

    if (!profile?.agency_id) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 });
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("tokko_api_key")
      .eq("id", profile.agency_id)
      .single();

    const TOKKO_API_KEY = agency?.tokko_api_key || process.env.TOKKO_API_KEY;
    if (!TOKKO_API_KEY) {
      return NextResponse.json({ error: "Tokko API Key not configured" }, { status: 500 });
    }

    // Build Tokko API URL
    // Tokko uses: 
    // operation_types: 1=Venta, 2=Alquiler
    // property_types: 1=Departamento, 2=Casa, 3=PH, etc.
    // However, for simplicity and robustness, we'll try to use a flexible search if possible
    // or map the types if we have the list.
    
    let url = `https://tokkobroker.com/api/v1/property/?key=${TOKKO_API_KEY}&format=json&limit=10`;
    
    if (query) url += `&search_by_address_or_description=${encodeURIComponent(query)}`;
    if (operation_type) url += `&operation_types=${operation_type}`;
    if (property_type && property_type !== '0') url += `&property_types=${property_type}`;
    // Zone filtering in Tokko usually requires ID, but let's see if we can use the search query for it.

    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.text();
      console.error("Tokko API Error:", err);
      return NextResponse.json({ error: "Failed to fetch from Tokko" }, { status: response.status });
    }

    const data = await response.json();
    
    // Transform Tokko response to our TokkoProperty interface
    const properties = data.objects.map((p: any) => ({
      id: p.id,
      reference_code: p.reference_code,
      title: p.publication_title || p.address,
      address: p.address,
      zone: p.location?.name || "",
      property_type: p.type?.name || "",
      operation_type: p.operations?.[0]?.operation_type || "",
      price: p.operations?.[0]?.prices?.[0]?.price || 0,
      currency: p.operations?.[0]?.prices?.[0]?.currency || "USD",
      surface_total: p.surface || 0,
      surface_covered: p.roofed_surface || 0,
      rooms: p.room_amount || 0,
      bathrooms: p.bathroom_amount || 0,
      description: p.description,
      photos: (p.photos || []).slice(0, 5).map((f: any) => ({
        thumb: f.thumb,
        image: f.image
      })),
      tags: (p.tags || []).map((t: any) => t.name)
    }));

    return NextResponse.json(properties);

  } catch (error: any) {
    console.error("Tokko Search Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
