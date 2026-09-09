// Documentos para clientes · una plantilla: leerla, guardarla, borrarla. Escribir es del director.
// Borrar solo si nunca se compartió; si ya tiene links, se desactiva (un cliente con un link
// no puede encontrarse con un 404 por una limpieza).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import {
  normalizarPlantilla, docVacio, esDoc, POSICIONES, MAX_NOMBRE, DOC_VACIO, type PosicionBloque,
} from "@/lib/documentos/plantilla";
import { urlPublica } from "@/lib/documentos/storage";

export const dynamic = "force-dynamic";

const COLUMNAS = "id, agency_id, nombre, cuerpo, header_path, footer_path, bloque_asesor, version, activa, updated_at";
type Ctx = { params: { id: string } };

/** La plantilla, solo si es de la agencia de la sesión. Otra agencia = null, igual que inexistente. */
async function propia(id: string, agencyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documentos_plantillas").select(COLUMNAS).eq("id", id).eq("agency_id", agencyId).maybeSingle();
  return data;
}

async function vecesCompartida(id: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("shared_documentos").select("token", { count: "exact", head: true }).eq("plantilla_id", id);
  return count ?? 0;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { agencyId } = await requireTenant();
    const fila = await propia(params.id, agencyId);
    if (!fila) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });
    const plantilla = normalizarPlantilla(fila);
    return NextResponse.json({
      plantilla,
      header_url: urlPublica(plantilla.header_path),
      footer_url: urlPublica(plantilla.footer_path),
      compartidos: await vecesCompartida(params.id),
    });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id] GET:", e);
    return NextResponse.json({ error: "No se pudo cargar la plantilla." }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director edita plantillas." }, { status: 403 });
    const actual = await propia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const body = (await req.json()) as Record<string, unknown>;
    const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, MAX_NOMBRE) : "";
    if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la plantilla." }, { status: 400 });

    const cuerpo = esDoc(body.cuerpo) ? body.cuerpo : DOC_VACIO;
    const bloqueIn = (body.bloque_asesor && typeof body.bloque_asesor === "object" ? body.bloque_asesor : {}) as Record<string, unknown>;
    const bloque_asesor = {
      texto: esDoc(bloqueIn.texto) ? bloqueIn.texto : DOC_VACIO,
      posicion: POSICIONES.includes(bloqueIn.posicion as PosicionBloque) ? bloqueIn.posicion : "ninguno",
    };
    const activa = body.activa === true;
    if (activa && docVacio(cuerpo)) {
      return NextResponse.json(
        { error: "Para activarla, la plantilla tiene que tener algo escrito en el cuerpo." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documentos_plantillas")
      .update({
        nombre, cuerpo, bloque_asesor, activa,
        version: Number(actual.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id).eq("agency_id", agencyId)
      .select(COLUMNAS).single();
    if (error) throw error;
    return NextResponse.json({ plantilla: normalizarPlantilla(data) });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id] PUT:", e);
    return NextResponse.json({ error: "No se pudo guardar la plantilla." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") return NextResponse.json({ error: "Solo el director borra plantillas." }, { status: 403 });
    const actual = await propia(params.id, agencyId);
    if (!actual) return NextResponse.json({ error: "No existe esa plantilla." }, { status: 404 });

    const supabase = await createClient();
    // Si ya se compartió, un cliente tiene un link. Borrarla lo dejaría en un 404: se desactiva.
    if ((await vecesCompartida(params.id)) > 0) {
      const { error } = await supabase
        .from("documentos_plantillas")
        .update({ activa: false, updated_at: new Date().toISOString() })
        .eq("id", params.id).eq("agency_id", agencyId)
        .select(COLUMNAS).single();
      if (error) throw error;
      return NextResponse.json({ borrada: false, desactivada: true });
    }
    const { error } = await supabase
      .from("documentos_plantillas").delete().eq("id", params.id).eq("agency_id", agencyId);
    if (error) throw error;
    return NextResponse.json({ borrada: true });
  } catch (e: unknown) {
    console.error("documentos-plantillas/[id] DELETE:", e);
    return NextResponse.json({ error: "No se pudo borrar la plantilla." }, { status: 500 });
  }
}
