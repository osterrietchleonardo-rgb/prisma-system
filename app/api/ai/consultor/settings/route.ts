import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";

// Config del Buscador IA: notas de conocimiento extra + blacklist de inmobiliarias.
// La edita SOLO el director; aplica a él y a todos sus asesores.
export async function GET() {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("agencies")
      .select("buscador_ia_config")
      .eq("id", agencyId)
      .single();

    if (error) throw error;

    return NextResponse.json(data.buscador_ia_config || {});
  } catch (error: any) {
    console.error("GET buscador settings error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();
    const body = await req.json();

    // Solo el director puede modificar la configuración del Buscador IA.
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id)
      .single();

    if (profile?.role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden modificar la configuración del Buscador IA." },
        { status: 403 }
      );
    }

    // Saneamos: notas como texto plano. La IA las interpreta.
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 8000) : "";

    const { error } = await supabaseAdmin
      .from("agencies")
      .update({ buscador_ia_config: { notes } })
      .eq("id", agencyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST buscador settings error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
