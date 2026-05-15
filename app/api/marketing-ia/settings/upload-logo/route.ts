import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";

export async function POST(req: Request) {
  try {
    const { userId } = await requireTenant();
    const supabaseAdmin = createAdminClient();
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/branding/logo_${Date.now()}.${fileExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { data, error } = await supabaseAdmin.storage
      .from('marketing-images')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('marketing-images')
      .getPublicUrl(fileName);

    return NextResponse.json({ publicUrl });
  } catch (error: any) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
