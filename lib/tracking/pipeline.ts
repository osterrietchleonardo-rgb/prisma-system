import {
  Search,
  ClipboardList,
  Wallet,
  Handshake,
  FileSignature,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { normalizePhoneE164 } from "@/lib/whatsapp/phone";
import type { ActivityType, PerformanceLog, PipelineMove } from "./types";

export interface PipelineStageDef {
  id: ActivityType;
  title: string;
  /** Clase de Tailwind para el punto de color de la columna. */
  color: string;
  icon: LucideIcon;
}

/**
 * Las 6 etapas EN ORDEN LINEAL. El orden de este array es la única fuente de
 * verdad de qué es "avanzar" y qué es "retroceder" en el tablero.
 *
 * Ojo: el embudo real es ramificado (prelisting/captación son del vendedor,
 * prebuying del comprador; ver lib/queries/dashboard.ts). El tablero igual usa
 * orden lineal a propósito: es predecible y no bloquea nada. El asesor de un
 * comprador simplemente saltea prelisting y captación.
 */
export const PIPELINE_STAGES: readonly PipelineStageDef[] = [
  { id: "prospeccion", title: "Prospección", color: "bg-sky-500", icon: Search },
  { id: "prelisting", title: "Prelisting", color: "bg-indigo-500", icon: ClipboardList },
  { id: "prebuying", title: "Prebuying", color: "bg-violet-500", icon: Wallet },
  { id: "captacion", title: "Captación", color: "bg-amber-500", icon: Handshake },
  { id: "reserva", title: "Reserva", color: "bg-orange-500", icon: FileSignature },
  { id: "cierre", title: "Cierre", color: "bg-emerald-500", icon: Trophy },
] as const;

export interface PipelineCard {
  /** Celular normalizado, o "lead:<id>" / "wa:<id>" como respaldo. */
  clientKey: string;
  clientName: string;
  /** E.164 sin "+", o null si el teléfono no se pudo normalizar. */
  clientPhone: string | null;
  leadId: string | null;
  waContactId: string | null;
  /** Columna donde cae la tarjeta = etapa del evento más reciente. */
  stage: ActivityType;
  /** Etapas que YA tienen actividad cargada: definen si el popup pide datos. */
  stagesConActividad: ActivityType[];
  /** Propiedad del registro más reciente (puede cambiar en el camino). */
  propertyLabel: string | null;
  propertyId: string | null;
  propiedadRef: string | null;
  activityCount: number;
  /** fecha_actividad de la actividad más reciente (para el filtro de fechas). */
  lastActivityDate: string | null;
  /**
   * Cuándo pasó lo último con este cliente: el created_at más nuevo entre sus
   * actividades y sus movimientos manuales. Ordena las tarjetas dentro de la
   * columna (más nueva arriba) y es el MISMO criterio con el que se decide en
   * qué columna cae, así el orden y la etapa nunca se contradicen.
   */
  lastEventAt: string;
  /** Todas las fechas de actividad, para saber si cae dentro de un rango. */
  activityDates: string[];
  agentId: string;
  agentName: string | null;
  /** Actividades del cliente, de más nueva a más vieja. Para el panel lateral. */
  logs: PerformanceLog[];
}

/**
 * Clave de agrupación de un registro. Manda el contacto de WhatsApp sobre el
 * lead de Tokko: wa_contacts.phone está cargado en las 1.529 filas, mientras
 * que leads.phone está vacío en 496 de 8.325.
 *
 * Devuelve null si el registro no tiene ningún cliente vinculado: esos no
 * generan tarjeta (se cuentan aparte para avisarle al usuario).
 */
export function clientKeyFromLog(log: PerformanceLog): string | null {
  if (log.wa_contact_id) {
    const phone = normalizePhoneE164(log.wa_contacts?.phone);
    return phone ?? `wa:${log.wa_contact_id}`;
  }
  if (log.lead_id) {
    const phone = normalizePhoneE164(log.leads?.phone);
    return phone ?? `lead:${log.lead_id}`;
  }
  return null;
}

function labelDePropiedad(log: PerformanceLog): string | null {
  return (
    log.properties?.title ||
    log.properties?.address ||
    log.propiedad_ref ||
    null
  );
}

function nombreDeCliente(log: PerformanceLog, fallback: string): string {
  return log.wa_contacts?.name || log.leads?.full_name || fallback;
}

/**
 * Arma las tarjetas del tablero: una por cliente.
 *
 * Reglas (spec 4.2 y 4.3):
 * - Las actividades eliminadas no cuentan para nadie, tampoco para el director.
 * - Los registros sin cliente vinculado no generan tarjeta; se devuelven contados.
 * - La etapa es la del evento más reciente por created_at (momento en que se
 *   registró), no por fecha_actividad: un movimiento manual no tiene fecha de
 *   actividad, y lo último que hizo el asesor tiene que mandar aunque cargue
 *   una actividad con fecha retroactiva.
 */
export function buildPipeline(
  logs: PerformanceLog[],
  moves: PipelineMove[]
): { cards: PipelineCard[]; sinCliente: number } {
  const vivos = logs.filter((l) => l.status !== "eliminada");

  let sinCliente = 0;
  const porCliente = new Map<string, PerformanceLog[]>();

  for (const log of vivos) {
    const key = clientKeyFromLog(log);
    if (!key) {
      sinCliente++;
      continue;
    }
    const actual = porCliente.get(key);
    if (actual) actual.push(log);
    else porCliente.set(key, [log]);
  }

  // Último movimiento manual por cliente.
  const ultimoMovimiento = new Map<string, PipelineMove>();
  for (const move of moves) {
    const previo = ultimoMovimiento.get(move.client_key);
    if (!previo || move.created_at > previo.created_at) {
      ultimoMovimiento.set(move.client_key, move);
    }
  }

  const cards: PipelineCard[] = [];

  for (const [clientKey, delCliente] of porCliente) {
    // De más nueva a más vieja por created_at.
    const ordenados = [...delCliente].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
    );
    const ultima = ordenados[0];

    const move = ultimoMovimiento.get(clientKey);
    const movioDespues = !!move && move.created_at > ultima.created_at;
    const stage: ActivityType = movioDespues ? move!.to_stage : ultima.type;
    const lastEventAt = movioDespues ? move!.created_at : ultima.created_at;

    const stagesConActividad = Array.from(new Set(ordenados.map((l) => l.type)));

    // El nombre y el teléfono se toman del registro más nuevo que los tenga.
    const conNombre = ordenados.find((l) => l.wa_contacts?.name || l.leads?.full_name);
    const phone =
      normalizePhoneE164(ultima.wa_contacts?.phone) ??
      normalizePhoneE164(ultima.leads?.phone) ??
      null;

    cards.push({
      clientKey,
      clientName: conNombre ? nombreDeCliente(conNombre, clientKey) : clientKey,
      clientPhone: phone,
      leadId: ultima.lead_id ?? null,
      waContactId: ultima.wa_contact_id ?? null,
      stage,
      stagesConActividad,
      propertyLabel: labelDePropiedad(ultima),
      propertyId: ultima.property_id ?? null,
      propiedadRef: ultima.propiedad_ref ?? null,
      activityCount: ordenados.length,
      lastActivityDate: ultima.fecha_actividad ?? null,
      lastEventAt,
      activityDates: ordenados.map((l) => l.fecha_actividad).filter(Boolean),
      agentId: ultima.agent_id,
      agentName: ultima.profiles?.full_name ?? null,
      logs: ordenados,
    });
  }

  // De la más actual a la más antigua: lo último que se movió queda arriba de
  // todo en su columna, sin importar cuántas tarjetas se acumulen abajo.
  cards.sort((a, b) => (a.lastEventAt < b.lastEventAt ? 1 : a.lastEventAt > b.lastEventAt ? -1 : 0));

  return { cards, sinCliente };
}
