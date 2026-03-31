import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", session.user.id)
      .single();

    if (!profile?.agency_id) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 });
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("tokko_api_key")
      .eq("id", profile.agency_id)
      .single();

    if (!agency?.tokko_api_key) {
      return NextResponse.json({ error: "Tokko API Key no configurada" }, { status: 400 });
    }

    const path = params.path.join("/");
    const searchParams = request.nextUrl.searchParams;
    let queryString = searchParams.toString();

    // Reconstruir la query string forzando el key correcto si hace falta, pero ya lo agregamos aquí
    // Removemos requests previas a '?key=' si vinieran
    searchParams.delete("key");

    const cleanQueryString = searchParams.toString();
    const finalUrl = `https://tokkobroker.com/api/v1/${path}/?key=${agency.tokko_api_key}${cleanQueryString ? `&${cleanQueryString}` : ''}`;

    const res = await fetch(finalUrl, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Tokko API errors: ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Tokko Proxy Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
