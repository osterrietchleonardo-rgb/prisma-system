import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";

export async function GET() {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("agencies")
      .select("marketing_ai_config")
      .eq("id", agencyId)
      .single();

    if (error) throw error;

    return NextResponse.json(data.marketing_ai_config || {});
  } catch (error: any) {
    console.error("GET settings error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();
    const config = await req.json();

    // Check if user is director (already handled by requireTenant + role check in layout usually, 
    // but here we should be careful.requireTenant gives agencyId and userId)
    
    // Validate role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (profile?.role !== 'director') {
      return NextResponse.json({ error: "Solo los directores pueden modificar la configuración de marca." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("agencies")
      .update({ marketing_ai_config: config })
      .eq("id", agencyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST settings error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
