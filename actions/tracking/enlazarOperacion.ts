"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decidirEnlace } from "@/lib/tracking/enlace";
import {
  actividadCoincideConDireccion,
  normalizarDireccion,
  MINIMO_PARA_BUSCAR,
} from "@/lib/tracking/direcciones";

/**
 * Hasta cuándo mirar para atrás. Las dos puntas de una misma operación se
 * cargan con días o semanas de diferencia, no con años. Un año es holgado y
 * evita ofrecer el enlace con una venta vieja en la misma dirección.
 */
const MESES_HACIA_ATRAS = 12;

/**
 * Tope de filas a traer. Una inmobiliaria cierra decenas de operaciones por
 * año, no miles: si alguna vez se pasa de acá, el problema es otro.
 */
const TOPE_CANDIDATAS = 500;

interface Candidata {
  id: string;
  operacion_id: string | null;
  propiedad_ref: string | null;
  metadata: { propiedad_colaboracion?: unknown } | null;
}

function haceUnAno(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - MESES_HACIA_ATRAS);
  return d.toISOString().slice(0, 10);
}

/**
 * Los cierres de OTROS asesores de la misma agencia que caen en esa dirección.
 *
 * Va con el cliente admin a propósito, y es la única forma de hacerlo: la RLS
 * de `performance_logs` sólo le muestra a un asesor sus propias filas, así que
 * con su sesión esta búsqueda devolvería siempre vacío — que es justo el caso
 * que hay que resolver.
 *
 * Por eso el resultado NUNCA sale de esta capa tal cual. Lo que vuelve al
 * navegador es un sí o un no. El asesor no se entera de quién cerró, ni cuándo,
 * ni por cuánto: lo único que puede descubrir es que en una dirección que él ya
 * conocía (la está escribiendo) hubo otra punta.
 */
async function buscarCandidatas(
  agencyId: string,
  agentId: string,
  direccion: string
): Promise<Candidata[]> {
  if (normalizarDireccion(direccion).length < MINIMO_PARA_BUSCAR) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_logs")
    .select("id, operacion_id, propiedad_ref, metadata")
    .eq("agency_id", agencyId)
    .eq("type", "cierre")
    .neq("agent_id", agentId)
    .neq("status", "eliminada")
    .gte("fecha_actividad", haceUnAno())
    .limit(TOPE_CANDIDATAS);

  if (error) {
    // Que falle la búsqueda no puede impedir cargar el cierre: se guarda sin
    // enlazar, que es exactamente el comportamiento de antes de esta función.
    console.error("Enlace de operación: no se pudieron buscar candidatas:", error.message);
    return [];
  }

  return (data ?? []).filter((fila) =>
    actividadCoincideConDireccion(fila as Candidata, direccion)
  ) as Candidata[];
}

/** El perfil de quien está llamando, o null si no hay sesión. */
async function quienLlama(): Promise<{ userId: string; agencyId: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!profile?.agency_id) return null;
  return { userId: user.id, agencyId: profile.agency_id };
}

/**
 * ¿Otro asesor de la casa ya cargó un cierre en esta dirección?
 *
 * Devuelve un booleano pelado, y eso es deliberado: ni el nombre del asesor, ni
 * la fecha, ni cuántos son, ni el id de la operación. Cualquiera de esos datos
 * convertiría este aviso en una ventana a los cierres de los compañeros, que
 * hoy un asesor no puede ver.
 */
export async function hayOtroCierreEnEsaDireccion(
  direccion: string
): Promise<{ hay: boolean }> {
  const quien = await quienLlama();
  if (!quien) return { hay: false };

  const candidatas = await buscarCandidatas(quien.agencyId, quien.userId, direccion);
  return { hay: candidatas.length > 0 };
}

/**
 * Resuelve con qué `operacion_id` hay que guardar un cierre que el asesor marcó
 * como "es la misma operación", y deja enlazadas también las filas del otro
 * lado.
 *
 * Devuelve null cuando no hay con qué enlazar, o cuando hay más de una
 * operación distinta en esa dirección — ese caso es ambiguo y enlazar al azar
 * haría desaparecer plata del volumen. Ante la duda, no se enlaza: el registro
 * se guarda igual y el director puede unirlos después.
 *
 * Escribe con el cliente admin porque `performance_logs` no tiene política de
 * UPDATE (mismo camino que `updatePerformanceLog`), y sólo toca UNA columna de
 * filas que ya verificó que son de la misma agencia.
 */
export async function resolverOperacionId(direccion: string): Promise<string | null> {
  const quien = await quienLlama();
  if (!quien) return null;

  const candidatas = await buscarCandidatas(quien.agencyId, quien.userId, direccion);

  // El criterio vive en `lib/tracking/enlace.ts`, aparte y probado: qué hacer
  // con varias candidatas, con las que ya están enlazadas y con el caso ambiguo
  // de dos operaciones distintas en la misma dirección.
  const { operacionId, aEnlazar: sinEnlazar } = decidirEnlace(candidatas, randomUUID);
  if (!operacionId) return null;

  // A las que todavía no tienen operación se les estampa la misma. Va acotado
  // por id Y por agency_id: aunque los ids vinieran mal, no puede tocar filas
  // de otra inmobiliaria.
  if (sinEnlazar.length > 0) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("performance_logs")
      .update({ operacion_id: operacionId })
      .in("id", sinEnlazar)
      .eq("agency_id", quien.agencyId);

    if (error) {
      console.error("Enlace de operación: no se pudo enlazar la otra punta:", error.message);
      // La fila nueva se guarda igual con este operacion_id. Queda a medio
      // enlazar, que es mejor que perder la carga entera, y el director lo ve.
    }
  }

  return operacionId;
}
