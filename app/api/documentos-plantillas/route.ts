// Documentos para clientes · la lista de plantillas de la agencia y crear una nueva.
// Leer: director y asesor (RLS deja al asesor ver solo las activas). Crear: solo director.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { normalizarPlantilla, MAX_NOMBRE } from "@/lib/documentos/plantilla";

export const dynamic = "force-dynamic";

const COLUMNAS = "id, nombre, cuerpo, header_path, footer_path, bloque_asesor, version, activa, updated_at";

export async function GET() {
  try {
    const { agencyId } = await requireTenant();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documentos_plantillas")
      .select(COLUMNAS)
      .eq("agency_id", agencyId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ plantillas: (data ?? []).map(normalizarPlantilla) });
  } catch (e: unknown) {
    console.error("documentos-plantillas GET:", e);
    return NextResponse.json({ error: "No se pudieron cargar las plantillas." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agencyId, userId, role } = await requireTenant();
    if (role !== "director") {
      return NextResponse.json({ error: "Solo el director crea plantillas." }, { status: 403 });
    }
    const body = (await req.json()) as { nombre?: unknown };
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, MAX_NOMBRE) : "";
    if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la plantilla." }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documentos_plantillas")
      .insert({ agency_id: agencyId, nombre, activa: false, created_by: userId })
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return NextResponse.json({ plantilla: normalizarPlantilla(data) });
  } catch (e: unknown) {
    console.error("documentos-plantillas POST:", e);
    return NextResponse.json({ error: "No se pudo crear la plantilla." }, { status: 500 });
  }
}
