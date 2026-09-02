/**
 * Trazabilidad del equipo — la bitácora cronológica que pidió Kevin (2/9/2026).
 *
 * Parte pura: recibe filas crudas de las fuentes y devuelve UNA línea de tiempo ordenada,
 * con textos en español simple. Sin acceso a la base acá: eso vive en app/actions/equipo.ts.
 *
 * Fuentes (verificadas contra producción el 2/9):
 * - wa_messages: cada mensaje del chat (lead / bot / human / internal).
 * - lead_eventos: todo lo que hace el Super Agente, la escalera y el circuito del equipo
 *   (la columna `descripcion` ya viene legible; acá solo se categoriza).
 * - interacciones_canal con direccion='entrada': mensajes internos del equipo por WhatsApp
 *   (el gate de internos). Las salidas NO se suman: los avisos ya están narrados en
 *   lead_eventos (tipos escalera / aviso_equipo) y duplicarían renglones.
 * - El tracking (lead_activities) queda para v2: apunta a leads de Tokko, no a la
 *   conversación de WhatsApp, y el cruce merece su propio diseño.
 */

export type CategoriaTraza =
  | "cliente"   // escribió el cliente
  | "bot"       // respondió el bot
  | "asesor"    // un humano del equipo le escribió al cliente (la confirmación que busca Kevin)
  | "interno"   // mensajes que el cliente NO ve (marcas de derivación, internos del gate)
  | "agente"    // decisiones y compromisos del Super Agente
  | "aviso"     // la escalera y los avisos al equipo
  | "equipo"    // acciones de personas: lo tomo / no puedo / reasignar / dar tiempo / perdido
  | "visita"    // movimientos del calendario de visitas

export type EventoTraza = {
  ts: string // ISO; el orden de la bitácora
  categoria: CategoriaTraza
  titulo: string
  detalle?: string
}

export type FilaMensaje = {
  role: string
  message_type: string | null
  content: string | null
  created_at: string
}

export type FilaEvento = {
  tipo: string
  descripcion: string
  ts: string
}

export type FilaInterno = {
  contenido: string | null
  ts: string
}

const LARGO_RECORTE = 90

/** Primeros ~90 caracteres, sin cortar palabras a la mitad ni dejar espacios colgando. */
export function recortar(texto: string | null | undefined, largo = LARGO_RECORTE): string {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim()
  if (limpio.length <= largo) return limpio
  const corte = limpio.lastIndexOf(" ", largo)
  return limpio.slice(0, corte > largo * 0.6 ? corte : largo).trimEnd() + "…"
}

/** Fecha y hora cortas en horario argentino, para mostrar al lado de cada renglón. */
export function fechaHoraAR(iso: string): string {
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return ""
  // El locale es-AR de Node pinta "1/9" aunque se pida 2-digit: se arma a mano desde las partes.
  const partes = new Intl.DateTimeFormat("es-AR", {
    day: "numeric", month: "numeric", hour: "numeric", minute: "numeric",
    hour12: false, timeZone: "America/Argentina/Buenos_Aires",
  }).formatToParts(f)
  const v = (tipo: string) => (partes.find((p) => p.type === tipo)?.value ?? "").padStart(2, "0")
  return `${v("day")}/${v("month")} ${v("hour")}:${v("minute")}`
}

const TITULO_POR_TIPO_DE_MENSAJE: Record<string, string> = {
  audio: "mandó un audio",
  image: "mandó una imagen",
  document: "mandó un documento",
  video: "mandó un video",
}

function eventoDeMensaje(m: FilaMensaje): EventoTraza | null {
  const queMando = TITULO_POR_TIPO_DE_MENSAJE[m.message_type ?? "text"]
  switch (m.role) {
    case "lead":
      return {
        ts: m.created_at,
        categoria: "cliente",
        titulo: queMando ? `El cliente ${queMando}` : "El cliente escribió",
        detalle: queMando ? undefined : recortar(m.content) || undefined,
      }
    case "bot":
      if (m.message_type === "template") {
        return { ts: m.created_at, categoria: "bot", titulo: "Se le envió una plantilla de WhatsApp", detalle: recortar(m.content) || undefined }
      }
      return { ts: m.created_at, categoria: "bot", titulo: "El bot respondió", detalle: recortar(m.content) || undefined }
    case "human":
      return { ts: m.created_at, categoria: "asesor", titulo: "El asesor le respondió al cliente", detalle: recortar(m.content) || undefined }
    case "internal":
      return { ts: m.created_at, categoria: "interno", titulo: "Marca interna (el cliente no la ve)", detalle: recortar(m.content) || undefined }
    default:
      return null // rol desconocido: mejor omitir que inventar
  }
}

/** A qué categoría va cada tipo de lead_eventos. Los que no figuran caen por prefijo o en "agente". */
const CATEGORIA_POR_TIPO: Record<string, CategoriaTraza> = {
  decision: "agente",
  compromiso_creado: "agente",
  costo_alto: "agente",
  error: "agente",
  envio_bloqueado: "agente",
  aviso_delegado_escalera: "agente",
  escalera: "aviso",
  escalera_simulada: "aviso",
  escalamiento_simulado: "aviso",
  aviso_equipo: "aviso",
  aviso_simulado: "aviso",
  asesor_tomo: "equipo",
  asesor_no_puede: "equipo",
  reasignacion: "equipo",
  aprobacion_decidida: "equipo",
  director_dio_tiempo: "equipo",
  lead_reactivado: "equipo",
  lead_perdido: "equipo",
  reapertura_cliente: "equipo",
}

export function categoriaDeEvento(tipo: string): CategoriaTraza {
  const conocida = CATEGORIA_POR_TIPO[tipo]
  if (conocida) return conocida
  if (tipo.startsWith("visita_")) return "visita"
  if (tipo.startsWith("asesor_") || tipo.startsWith("director_")) return "equipo"
  return "agente" // un tipo nuevo no rompe la bitácora: entra genérico
}

function eventoDeLeadEvento(e: FilaEvento): EventoTraza {
  return { ts: e.ts, categoria: categoriaDeEvento(e.tipo), titulo: e.descripcion }
}

function eventoDeInterno(i: FilaInterno): EventoTraza {
  return {
    ts: i.ts,
    categoria: "interno",
    titulo: "Mensaje interno de alguien del equipo (por WhatsApp, el cliente no lo ve)",
    detalle: recortar(i.contenido) || undefined,
  }
}

/**
 * Fusiona las fuentes en una sola línea de tiempo, del evento más viejo al más nuevo.
 * Con timestamps iguales el orden es estable (primero mensajes, después eventos, después internos),
 * así una corrida repetida siempre pinta lo mismo.
 */
export function construirTraza(entrada: {
  mensajes: FilaMensaje[]
  eventos: FilaEvento[]
  internos?: FilaInterno[]
}): EventoTraza[] {
  const todos: EventoTraza[] = [
    ...entrada.mensajes.map(eventoDeMensaje).filter((e): e is EventoTraza => e !== null),
    ...entrada.eventos.map(eventoDeLeadEvento),
    ...(entrada.internos ?? []).map(eventoDeInterno),
  ]
  return todos
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const dif = Date.parse(a.e.ts) - Date.parse(b.e.ts)
      return dif !== 0 ? dif : a.i - b.i
    })
    .map(({ e }) => e)
}
