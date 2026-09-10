"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  paresSospechosos,
  operacionesEnlazadas,
  type CierreParaAparear,
} from "@/lib/tracking/pares";

/**
 * La red del aviso automático que ve el asesor al cargar un cierre. Ese aviso
 * no alcanza cuando el segundo asesor nunca cargó su punta, o cuando escribió
 * la dirección tan distinta que no coincidió. Acá el director ve los pares
 * sueltos que parecen la misma operación y decide.
 *
 * Y es además el ÚNICO lugar donde se puede deshacer un enlace equivocado: si
 * un asesor confirma "sí, es la misma" y se equivoca, sin esto quedaba mal para
 * siempre y el volumen contando de menos.
 */

/** Cuántos meses de cierres se revisan. Acota la comparación de todos contra todos. */
const MESES = 12;

function desde(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - MESES);
  return d.toISOString().slice(0, 10);
}

export interface FilaDeOperacion {
  id: string;
  asesor: string;
  direccion: string;
  participacion: string | null;
  monto: number;
  comision: number;
  fecha: string | null;
}

export interface OperacionesDelEquipo {
  /** Pares sueltos que parecen la misma operación y esperan una decisión. */
  sospechosos: { a: FilaDeOperacion; b: FilaDeOperacion }[];
  /** Operaciones ya enlazadas, por si alguna se enlazó mal y hay que separarla. */
  enlazadas: { operacionId: string; filas: FilaDeOperacion[] }[];
}

/**
 * Sólo el director. No alcanza con la RLS: esta función lee con el cliente
 * admin (necesita cruzar los cierres de TODOS los asesores entre sí), así que
 * el control de quién puede llamarla se hace acá y a mano.
 */
async function directorQueLlama(): Promise<{ agencyId: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.agency_id || profile.role !== "director") return null;
  return { agencyId: profile.agency_id };
}

async function traerCierres(agencyId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_logs")
    .select("id, agent_id, operacion_id, propiedad_ref, monto_operacion, comision_generada, fecha_actividad, metadata")
    .eq("agency_id", agencyId)
    .eq("type", "cierre")
    .neq("status", "eliminada")
    .gte("fecha_actividad", desde());

  if (error) {
    console.error("Operaciones del equipo:", error.message);
    return [];
  }
  return (data ?? []) as CierreParaAparear[];
}

export async function listarOperacionesDelEquipo(): Promise<OperacionesDelEquipo> {
  const quien = await directorQueLlama();
  if (!quien) return { sospechosos: [], enlazadas: [] };

  const cierres = await traerCierres(quien.agencyId);

  // Los nombres de los asesores, para que el director pueda decidir mirando.
  const supabase = createClient();
  const { data: perfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("agency_id", quien.agencyId);
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.full_name ?? "Asesor"]));

  const aFila = (c: CierreParaAparear): FilaDeOperacion => {
    const colaboracion = c.metadata?.propiedad_colaboracion;
    return {
      id: c.id,
      asesor: nombre.get(c.agent_id ?? "") ?? "Asesor",
      direccion: String(c.propiedad_ref || (typeof colaboracion === "string" ? colaboracion : "") || "Sin dirección"),
      participacion: (c.metadata?.participacion as string) ?? null,
      monto: Number(c.monto_operacion) || 0,
      comision: Number(c.comision_generada) || 0,
      fecha: c.fecha_actividad ?? null,
    };
  };

  return {
    sospechosos: paresSospechosos(cierres).map((p) => ({ a: aFila(p.a), b: aFila(p.b) })),
    enlazadas: operacionesEnlazadas(cierres).map((g) => ({
      operacionId: g.operacionId,
      filas: g.filas.map(aFila),
    })),
  };
}

/**
 * Escribe `operacion_id` en las filas indicadas. Siempre acotado por
 * `agency_id`: aunque llegaran ids de otra inmobiliaria, no los toca.
 *
 * `null` deja las filas sueltas otra vez (vuelven a proponerse); un uuid
 * propio para cada una las deja como operaciones distintas y no reaparecen.
 */
async function escribirOperacion(
  agencyId: string,
  ids: string[],
  valorPorFila: (id: string) => string | null
): Promise<boolean> {
  const admin = createAdminClient();
  for (const id of ids) {
    const { error } = await admin
      .from("performance_logs")
      .update({ operacion_id: valorPorFila(id) })
      .eq("id", id)
      .eq("agency_id", agencyId);
    if (error) {
      console.error("Operaciones del equipo, al escribir:", error.message);
      return false;
    }
  }
  return true;
}

function refrescar() {
  revalidatePath("/director/aprobaciones");
  revalidatePath("/director/dashboard");
  revalidatePath("/director/tracking-performance");
}

/** Son la misma operación: las dos filas pasan a compartir un id. */
export async function unirComoUnaOperacion(idA: string, idB: string): Promise<{ ok: boolean }> {
  const quien = await directorQueLlama();
  if (!quien) return { ok: false };

  const operacionId = randomUUID();
  const ok = await escribirOperacion(quien.agencyId, [idA, idB], () => operacionId);
  if (ok) refrescar();
  return { ok };
}

/**
 * No son la misma: cada fila queda como su propia operación.
 *
 * Darles un id propio en vez de dejarlas en null es lo que hace que la decisión
 * se recuerde sin guardarla en ningún lado: dejan de estar sueltas, así que el
 * par no se vuelve a proponer nunca. Y las cuentas no cambian, porque una fila
 * sola en su operación aporta su monto igual que una sin operación.
 */
export async function marcarComoOperacionesDistintas(
  idA: string,
  idB: string
): Promise<{ ok: boolean }> {
  const quien = await directorQueLlama();
  if (!quien) return { ok: false };

  const propios = new Map([
    [idA, randomUUID()],
    [idB, randomUUID()],
  ]);
  const ok = await escribirOperacion(quien.agencyId, [idA, idB], (id) => propios.get(id) ?? null);
  if (ok) refrescar();
  return { ok };
}

/**
 * Deshacer un enlace. Las filas vuelven a quedar sueltas —no con un id propio—
 * para que el par se proponga de nuevo: si el director separó por error, puede
 * volver a unirlas. Es la única forma de arreglar un "sí, es la misma" mal
 * confirmado por un asesor.
 */
export async function separarOperacion(ids: string[]): Promise<{ ok: boolean }> {
  const quien = await directorQueLlama();
  if (!quien) return { ok: false };
  if (ids.length === 0) return { ok: true };

  const ok = await escribirOperacion(quien.agencyId, ids, () => null);
  if (ok) refrescar();
  return { ok };
}
