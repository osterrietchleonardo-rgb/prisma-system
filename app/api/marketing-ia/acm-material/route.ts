// ACM · Lee y guarda SOLO la clave acm_material del jsonb de la agencia.
//
// El merge se hace acá, en el servidor. El endpoint viejo de Marketing IA
// (/api/marketing-ia/settings) reemplaza el jsonb ENTERO: si esta pantalla guardara así,
// mandando nada más que el material, le borraría a la agencia los colores, el logo y el
// aviso legal. Releer y cambiar una sola clave también evita que dos pestañas abiertas se
// pisen entre sí.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { normalizarMaterial } from "@/lib/acm/material";

export const dynamic = "force-dynamic";

/**
 * Devuelve el material y, además, la marca que la ficha ya usa. La marca viaja para
 * MOSTRARLA: se edita en Marketing IA, no acá.
 */
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

    const mk = (data?.marketing_ai_config ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      material: normalizarMaterial(mk.acm_material),
      marca: {
        colors: Array.isArray(mk.brand_colors)
          ? (mk.brand_colors as unknown[]).filter((c): c is string => typeof c === "string" && !!c)
          : [],
        logo_url: typeof mk.logo_url === "string" ? mk.logo_url : null,
        legal_notice: typeof mk.legal_notice === "string" ? mk.legal_notice : "",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material GET:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden configurar el material del ACM." },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { material?: unknown };
    const material = normalizarMaterial(body.material);

    const admin = createAdminClient();

    // Se relee el jsonb ACÁ y se le cambia una sola clave. Nunca se reemplaza entero.
    const { data: actual, error: readErr } = await admin
      .from("agencies")
      .select("marketing_ai_config")
      .eq("id", agencyId)
      .single();
    if (readErr) throw readErr;

    const config = {
      ...((actual?.marketing_ai_config ?? {}) as Record<string, unknown>),
      acm_material: material,
    };

    const { error } = await admin
      .from("agencies")
      .update({ marketing_ai_config: config })
      .eq("id", agencyId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material PUT:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
