import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Notas internas por propiedad para el Asesor IA de WhatsApp.
//
// Quien puede escribir (se valida SIEMPRE en el servidor):
//   - director: cualquier propiedad de SU agencia.
//   - asesor:   solo las propiedades asignadas a el (assigned_agent_id).
// Cualquiera de la agencia puede LEERLAS (la tabla properties tiene
// RLS de lectura por agencia). Editar o borrar una nota: su autor,
// o el director.
//
// No hay politicas RLS de escritura sobre properties, asi que el
// guardado va con cliente admin DESPUES de validar agencia y permiso
// (mismo patron que /api/propiedades/[id]/ai-description).
// ─────────────────────────────────────────────────────────────

const MAX_LARGO = 800;
const MAX_NOTAS = 20;
const BOT_FALLBACK = "tu Asesor IA";

type Nota = {
  id: string;
  texto: string;
  autor_id: string;
  autor_nombre: string;
  autor_rol: string;
  creado_at: string;
  editado_at?: string;
  editado_por?: string;
};

class ErrorApi extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Valida sesion + agencia + propiedad y devuelve todo lo que hace falta
 * para leer o escribir notas. `puedeEditar` es la unica fuente de verdad
 * sobre el permiso de escritura.
 */
async function cargarContexto(propertyId: string) {
  const { userId, agencyId, role } = await requireTenant();
  const supabase = createClient();

  // Lectura con RLS: si la propiedad no es de su agencia, no la ve.
  const { data: property, error } = await supabase
    .from("properties")
    .select("id, agency_id, assigned_agent_id, notas_ia")
    .eq("id", propertyId)
    .single();

  if (error || !property) {
    throw new ErrorApi("Propiedad no encontrada", 404);
  }

  // Defensa extra de aislamiento por agencia (no confiamos solo en RLS).
  if (property.agency_id !== agencyId) {
    throw new ErrorApi("No autorizado", 403);
  }

  const esDirector = role === "director";
  const esSuya = !!property.assigned_agent_id && property.assigned_agent_id === userId;

  return {
    userId,
    agencyId,
    role,
    property,
    notas: normalizarNotas(property.notas_ia),
    puedeEditar: esDirector || esSuya,
    esDirector,
  };
}

function normalizarNotas(valor: unknown): Nota[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((n): n is Nota => !!n && typeof n === "object" && typeof (n as Nota).id === "string");
}

function limpiarTexto(valor: unknown): string {
  const texto = (valor ?? "").toString().trim();
  if (!texto) throw new ErrorApi("La nota esta vacia", 400);
  if (texto.length > MAX_LARGO) {
    throw new ErrorApi(`La nota no puede pasar de ${MAX_LARGO} caracteres`, 400);
  }
  return texto;
}

async function nombreDelAutor(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name || data?.email || "Usuario";
}

/** Nombre que la agencia le puso a su agente IA de WhatsApp. */
async function nombreDelBot(agencyId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_ai_settings")
    .select("bot_name")
    .eq("agency_id", agencyId)
    .is("agent_id", null)
    .maybeSingle();
  const nombre = (data?.bot_name || "").trim();
  return nombre || BOT_FALLBACK;
}

/**
 * Guarda el array completo. Relee las notas del momento con cliente admin
 * para no pisar lo que otro haya agregado mientras esta pantalla estaba abierta.
 */
async function guardar(propertyId: string, aplicar: (actuales: Nota[]) => Nota[]) {
  const admin = createAdminClient();

  const { data: fresca, error: errorLectura } = await admin
    .from("properties")
    .select("notas_ia")
    .eq("id", propertyId)
    .single();

  if (errorLectura || !fresca) {
    throw new ErrorApi("No se pudo leer la propiedad para guardar", 500);
  }

  const notas = aplicar(normalizarNotas(fresca.notas_ia));

  const { error } = await admin
    .from("properties")
    .update({ notas_ia: notas })
    .eq("id", propertyId);

  if (error) {
    console.error("Error guardando notas_ia:", error);
    throw new ErrorApi("No se pudo guardar la nota. Intentá de nuevo.", 500);
  }

  return notas;
}

function fallar(e: any) {
  if (e instanceof ErrorApi) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const msg = e?.message || "Error inesperado";
  const status = msg === "Unauthorized" ? 401 : 500;
  if (status === 500) console.error("Error en notas-ia:", e);
  return NextResponse.json({ error: msg }, { status });
}

/**
 * Marca cada nota con si ESTE usuario puede editarla o borrarla, asi la
 * pantalla no tiene que replicar la regla de permisos.
 */
function conPermisos(notas: Nota[], ctx: { userId: string; puedeEditar: boolean; esDirector: boolean }) {
  return notas.map((n) => ({
    ...n,
    puedo_tocarla: ctx.puedeEditar && (ctx.esDirector || n.autor_id === ctx.userId),
  }));
}

/** Busca una nota y valida que este usuario pueda tocarla. */
function notaEditable(notas: Nota[], notaId: string, userId: string, esDirector: boolean) {
  const nota = notas.find((n) => n.id === notaId);
  if (!nota) throw new ErrorApi("La nota ya no existe", 404);
  if (!esDirector && nota.autor_id !== userId) {
    throw new ErrorApi("Solo podés modificar tus propias notas", 403);
  }
  return nota;
}

// ── GET: notas + nombre del bot + si este usuario puede escribir ──
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await cargarContexto(params.id);
    return NextResponse.json({
      notas: conPermisos(ctx.notas, ctx),
      puede_editar: ctx.puedeEditar,
      bot_name: await nombreDelBot(ctx.agencyId),
      max_largo: MAX_LARGO,
      max_notas: MAX_NOTAS,
    });
  } catch (e) {
    return fallar(e);
  }
}

// ── POST: agregar una nota ──
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await cargarContexto(params.id);
    if (!ctx.puedeEditar) {
      throw new ErrorApi(
        "Solo el director o el asesor asignado a esta propiedad pueden agregar notas",
        403
      );
    }

    const body = await req.json().catch(() => ({}));
    const texto = limpiarTexto(body?.texto);

    const nota: Nota = {
      id: randomUUID(),
      texto,
      autor_id: ctx.userId,
      autor_nombre: await nombreDelAutor(ctx.userId),
      autor_rol: ctx.role,
      creado_at: new Date().toISOString(),
    };

    const notas = await guardar(params.id, (actuales) => {
      if (actuales.length >= MAX_NOTAS) {
        throw new ErrorApi(
          `Llegaste al máximo de ${MAX_NOTAS} notas en esta propiedad. Borrá alguna para agregar una nueva.`,
          409
        );
      }
      return [nota, ...actuales];
    });

    return NextResponse.json({ notas: conPermisos(notas, ctx) });
  } catch (e) {
    return fallar(e);
  }
}

// ── PATCH: editar el texto de una nota ──
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await cargarContexto(params.id);
    if (!ctx.puedeEditar) {
      throw new ErrorApi(
        "Solo el director o el asesor asignado a esta propiedad pueden editar notas",
        403
      );
    }

    const body = await req.json().catch(() => ({}));
    const notaId = (body?.nota_id || "").toString();
    const texto = limpiarTexto(body?.texto);
    if (!notaId) throw new ErrorApi("Falta indicar la nota", 400);

    const ahora = new Date().toISOString();
    const notas = await guardar(params.id, (actuales) => {
      notaEditable(actuales, notaId, ctx.userId, ctx.esDirector);
      return actuales.map((n) =>
        n.id === notaId
          ? { ...n, texto, editado_at: ahora, editado_por: ctx.userId }
          : n
      );
    });

    return NextResponse.json({ notas: conPermisos(notas, ctx) });
  } catch (e) {
    return fallar(e);
  }
}

// ── DELETE: borrar una nota ──
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await cargarContexto(params.id);
    if (!ctx.puedeEditar) {
      throw new ErrorApi(
        "Solo el director o el asesor asignado a esta propiedad pueden borrar notas",
        403
      );
    }

    const notaId = new URL(req.url).searchParams.get("nota_id") || "";
    if (!notaId) throw new ErrorApi("Falta indicar la nota", 400);

    const notas = await guardar(params.id, (actuales) => {
      notaEditable(actuales, notaId, ctx.userId, ctx.esDirector);
      return actuales.filter((n) => n.id !== notaId);
    });

    return NextResponse.json({ notas: conPermisos(notas, ctx) });
  } catch (e) {
    return fallar(e);
  }
}
