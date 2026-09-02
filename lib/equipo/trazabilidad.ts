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
  /** nota_director trae {anclada_tras}: el momento de la historia DESPUÉS del cual va la nota. */
  datos?: Record<string, unknown> | null
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

/**
 * Los mensajes del chat entran como HECHOS, no como mensajes (Leonardo, 2/9): una corrida
 * de mensajes seguidos del mismo lado se vuelve un solo renglón ("El cliente escribió
 * (3 mensajes)"), sin el texto. La conversación entera está a un click en "Ver el chat".
 * Una plantilla del bot y los mensajes internos sí van sueltos: son hechos en sí mismos.
 */
function hechosDeMensajes(mensajes: FilaMensaje[]): EventoTraza[] {
  const ordenados = [...mensajes].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const hechos: Array<EventoTraza & { grupo?: string; cuenta?: number }> = []
  for (const m of ordenados) {
    // Renglones individuales: la plantilla, lo interno. Cortan cualquier agrupación en curso.
    if (m.role === "bot" && m.message_type === "template") {
      hechos.push({ ts: m.created_at, categoria: "bot", titulo: "Se le envió una plantilla de WhatsApp" })
      continue
    }
    if (m.role === "internal") {
      hechos.push({ ts: m.created_at, categoria: "interno", titulo: "Marca interna (el cliente no la ve)", detalle: recortar(m.content) || undefined })
      continue
    }
    const base = m.role === "lead"
      ? { grupo: "lead", categoria: "cliente" as const, titulo: "El cliente escribió" }
      : m.role === "bot"
        ? { grupo: "bot", categoria: "bot" as const, titulo: "El bot respondió" }
        : m.role === "human"
          ? { grupo: "human", categoria: "asesor" as const, titulo: "El asesor le respondió al cliente" }
          : null
    if (!base) continue // rol desconocido: mejor omitir que inventar
    const anterior = hechos[hechos.length - 1]
    if (anterior?.grupo === base.grupo) {
      anterior.cuenta = (anterior.cuenta ?? 1) + 1
      anterior.titulo = `${base.titulo} (${anterior.cuenta} mensajes)`
      continue // el renglón conserva la hora del PRIMER mensaje de la corrida
    }
    hechos.push({ ts: m.created_at, ...base })
  }
  return hechos.map(({ grupo: _g, cuenta: _c, ...e }) => e)
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
  aviso_fallido: "aviso",
  aviso_simulado: "aviso",
  nota_director: "interno",
  bot_apagado: "bot",
  bot_prendido: "bot",
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

/**
 * Dónde va cada cosa en la historia. Una nota del director anclada ("agregá esto entre
 * tal paso y el siguiente") se ordena justo DESPUÉS de su ancla: el medio milisegundo
 * de más nunca empata con un evento real y no toca el ts verdadero de la nota.
 */
function claveDeOrden(e: { ts: string; datos?: Record<string, unknown> | null }): number {
  const ancla = typeof e.datos?.anclada_tras === "string" ? Date.parse(e.datos.anclada_tras) : NaN
  return Number.isNaN(ancla) ? Date.parse(e.ts) : ancla + 0.5
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
 * Fusiona las fuentes en una sola línea de tiempo, del hecho más viejo al más nuevo.
 * Con claves iguales el orden es estable (primero mensajes, después eventos, después internos),
 * así una corrida repetida siempre pinta lo mismo.
 */
export function construirTraza(entrada: {
  mensajes: FilaMensaje[]
  eventos: FilaEvento[]
  internos?: FilaInterno[]
}): EventoTraza[] {
  const todos: Array<{ e: EventoTraza; clave: number }> = [
    ...hechosDeMensajes(entrada.mensajes).map((e) => ({ e, clave: Date.parse(e.ts) })),
    ...entrada.eventos.map((ev) => ({ e: eventoDeLeadEvento(ev), clave: claveDeOrden(ev) })),
    ...(entrada.internos ?? []).map(eventoDeInterno).map((e) => ({ e, clave: Date.parse(e.ts) })),
  ]
  return todos
    .map(({ e, clave }, i) => ({ e, clave, i }))
    .sort((a, b) => (a.clave !== b.clave ? a.clave - b.clave : a.i - b.i))
    .map(({ e }) => e)
}
