import { createClient } from "@/lib/supabase/server"
import { todasLasFilas } from "@/lib/queries/todas-las-filas"
import { inicioDelDiaAR, finDelDiaAR } from "@/lib/dashboard/periodo"

/**
 * Inteligencia Conversacional del dashboard del director.
 *
 * Se calcula EN VIVO en cada carga, con las conversaciones de WhatsApp que ENTRARON en el
 * período del filtro de arriba (y del asesor, si hay uno elegido). Sin IA, sin tabla de caché
 * y sin botón "Actualizar": hasta el 15/9/2026 la sección leía un análisis guardado en
 * `dashboard_conversational_insights` que había que regenerar a mano, con su propio selector de
 * período (distinto del de arriba), filtraba por último mensaje y no por entrada, y traía varios
 * números mal armados (derivación del 202 %, horas en UTC, "null" contado como categoría...).
 * Cada número de acá sale de un campo concreto de la base; la regla se explica en pantalla.
 */

const ZONA_AR = "America/Argentina/Buenos_Aires"
const SIETE_DIAS_MIN = 7 * 24 * 60

// ─── Tipos que viajan a la pantalla (objeto plano, serializable) ─────────────────

export interface Conteo {
  etiqueta: string
  cantidad: number
  /** % sobre las conversaciones que tienen ese dato (no sobre el total). */
  pct: number
}

/** Una lista de categorías y sobre cuántas conversaciones se calculó. */
export interface Distribucion {
  items: Conteo[]
  conDato: number
}

export interface TasaVisita {
  etiqueta: string
  visitas: number
  total: number
  /** null si el grupo está vacío (no se divide por cero). */
  tasa: number | null
}

export interface ResumenPresupuesto {
  cantidad: number
  mediana: number | null
  minimo: number | null
  maximo: number | null
}

export interface ConversationalData {
  /** Período del filtro ('yyyy-MM-dd', días argentinos), para la leyenda de arriba. */
  from: string
  to: string
  chats: number
  kpis: {
    visitas: number
    reservas: number
    seguimientos: number
    tasaConsultaVisita: number | null
    tasaVisitaReserva: number | null
    aptoCredito: number
    necesitanVender: number
    pidieronAsesor: number
    /** Pidieron hablar con una persona Y quedaron derivados. */
    pidieronYDerivados: number
    /** (pidió ∧ derivado) / pidió. Nunca pasa de 100 %. */
    tasaDerivacion: number | null
    /** Derivados a un asesor sin haberlo pedido (el bot los pasó por otra razón). */
    derivadosSinPedirlo: number
  }
  embudo: {
    calificados: number
    calificadosParcial: number
    visitas: number
    reservas: number
    abiertas: number
    ganadas: number
    perdidas: number
    /** ganadas / (ganadas + perdidas); null si todavía no se cerró ninguna. */
    tasaCierre: number | null
  }
  perfil: {
    tipoOperacion: Distribucion
    urgencia: Distribucion
    tipoPropiedad: Distribucion
    ambientes: Distribucion
    composicionFamiliar: Distribucion
    intereses: Distribucion
    necesidades: Distribucion
    primeraVez: number
    conExperiencia: number
    inversores: number
    conPreaprobacion: number
  }
  demanda: {
    porTipoPropiedad: TasaVisita[]
    porOperacion: TasaVisita[]
    /** Conversaciones sin el dato, que no entran en cada tabla. */
    sinTipoPropiedad: number
    sinOperacion: number
    barrios: Distribucion
    zonas: Distribucion
    presupuestoUSD: ResumenPresupuesto
    presupuestoARS: ResumenPresupuesto
  }
  temporal: {
    mensajesLead: number
    /** 24 posiciones: mensajes del cliente por hora argentina. */
    porHora: number[]
    /** 7 posiciones, de lunes (0) a domingo (6). */
    porDia: number[]
    /** [día lunes..domingo][hora 0..23] */
    mapa: number[][]
    horaPico: number | null
    diaPico: number | null
    duracionPromedioMin: number | null
    conversacionesConDuracion: number
    atendidasPorPersona: number
    soloBot: number
  }
  atencion: {
    sinIntervencionHumana: number
    tasaSinIntervencion: number | null
    tasaPidieron: number | null
    mensajesLeadPorChat: number | null
    causasNoAvance: Distribucion
    cortes: Conteo[]
    objecionPrecio: number
    objecionUbicacion: number
    compromiso: { alto: number; medio: number; bajo: number; sinDatos: number }
  }
}

// ─── Filas crudas ────────────────────────────────────────────────────────────────

type Metricas = Record<string, unknown>

interface FilaConversacion {
  id: string
  created_at: string
  agent_id: string | null
  follow_ups_sent: number | null
  funnel_status: string | null
  visit_status: string | null
  dropoff_reason: string | null
  metricas: Metricas | null
}

interface FilaMensaje {
  conversation_id: string
  role: string
  created_at: string
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────────

/** Porcentaje entero; null si el denominador es 0 (la pantalla muestra "—"). */
const porcentaje = (parte: number, total: number): number | null =>
  total > 0 ? Math.round((parte / total) * 100) : null

/** Solo cuenta el booleano verdadero: un "true" escrito como texto no es un sí confirmado. */
const esVerdad = (v: unknown) => v === true

/**
 * Texto útil o null. En `metricas` aparece el texto literal "null" en varios campos (15/9/2026:
 * "null" salía como una categoría más en operación y tipo de propiedad): se trata como vacío.
 */
function texto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  if (!t) return null
  const bajo = t.toLowerCase()
  if (bajo === "null" || bajo === "undefined" || bajo === "none") return null
  return t
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function lista(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(texto).filter((x): x is string => x !== null)
}

/**
 * Cuenta categorías agrupando sin distinguir mayúsculas ni espacios, y muestra la forma en que
 * se escribió la primera vez. `valores` trae, por conversación, sus categorías (sin repetir).
 */
function distribuir(valores: string[][], tope = 10): Distribucion {
  const grupos = new Map<string, { etiqueta: string; cantidad: number }>()
  let conDato = 0
  for (const deUna of valores) {
    const vistas = new Set<string>()
    for (const v of deUna) {
      const clave = v.trim().toLowerCase()
      if (vistas.has(clave)) continue
      vistas.add(clave)
      const g = grupos.get(clave)
      if (g) g.cantidad++
      else grupos.set(clave, { etiqueta: v.trim(), cantidad: 1 })
    }
    if (vistas.size > 0) conDato++
  }
  const items = Array.from(grupos.values())
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, "es"))
    .slice(0, tope)
    .map((g) => ({ etiqueta: g.etiqueta, cantidad: g.cantidad, pct: porcentaje(g.cantidad, conDato) ?? 0 }))
  return { items, conDato }
}

const unoSolo = (v: string | null): string[] => (v ? [v] : [])

/** Tasa de visita por categoría, con las categorías que aparecen en los datos. */
function tasaVisitaPor(ms: Metricas[], campo: string): { filas: TasaVisita[]; sinDato: number } {
  const grupos = new Map<string, { etiqueta: string; total: number; visitas: number }>()
  let sinDato = 0
  for (const m of ms) {
    const v = texto(m[campo])
    if (!v) { sinDato++; continue }
    const clave = v.toLowerCase()
    const g = grupos.get(clave) ?? { etiqueta: clave, total: 0, visitas: 0 }
    g.total++
    if (esVerdad(m.visita_agendada)) g.visitas++
    grupos.set(clave, g)
  }
  const filas = Array.from(grupos.values())
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es"))
    .map((g) => ({ etiqueta: g.etiqueta, visitas: g.visitas, total: g.total, tasa: porcentaje(g.visitas, g.total) }))
  return { filas, sinDato }
}

function resumirPresupuesto(valores: number[]): ResumenPresupuesto {
  if (valores.length === 0) return { cantidad: 0, mediana: null, minimo: null, maximo: null }
  const o = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(o.length / 2)
  const mediana = o.length % 2 ? o[medio] : Math.round((o[medio - 1] + o[medio]) / 2)
  return { cantidad: o.length, mediana, minimo: o[0], maximo: o[o.length - 1] }
}

/** Posición de la hora y del día de la semana en hora ARGENTINA (el servidor corre en UTC). */
const formatoAR = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_AR,
  hourCycle: "h23",
  hour: "2-digit",
  weekday: "short",
})
const DIA_LUNES_PRIMERO: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

function horaYDiaAR(iso: string): { hora: number; dia: number } | null {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  let hora = -1
  let dia = -1
  for (const p of formatoAR.formatToParts(fecha)) {
    if (p.type === "hour") hora = Number(p.value) % 24
    else if (p.type === "weekday") dia = DIA_LUNES_PRIMERO[p.value] ?? -1
  }
  return hora >= 0 && dia >= 0 ? { hora, dia } : null
}

function indiceDelMayor(valores: number[]): number | null {
  let mejor = -1
  let max = 0
  valores.forEach((v, i) => { if (v > max) { max = v; mejor = i } })
  return mejor >= 0 ? mejor : null
}

const PALABRAS_PRECIO = /precio|presupuesto|caro|costos|tope|valor|fuera de rango|expensas/i
const PALABRAS_UBICACION = /ubicaci|zona|barrio|lejos|distancia/i

// ─── Consulta principal ──────────────────────────────────────────────────────────

export async function getConversationalData(
  agencyId: string,
  agentId: string | undefined,
  from: string,
  to: string
): Promise<ConversationalData> {
  const supabase = createClient()
  const desde = inicioDelDiaAR(from)
  const hasta = finDelDiaAR(to)

  // Las dos consultas van en paralelo. Los mensajes se traen por agencia y período y se filtran
  // acá contra las conversaciones: un `.in()` con cientos de ids arma una URL enorme.
  const [conversaciones, mensajesDelPeriodo] = await Promise.all([
    todasLasFilas<FilaConversacion>((d, h) => {
      let q = supabase
        .from("wa_conversations")
        .select("id, created_at, agent_id, follow_ups_sent, funnel_status, visit_status, dropoff_reason, metricas")
        .eq("agency_id", agencyId)
        .gte("created_at", desde)
        .lte("created_at", hasta)
      if (agentId) q = q.eq("agent_id", agentId)
      return q.order("id", { ascending: true }).range(d, h)
    }),
    todasLasFilas<FilaMensaje>((d, h) =>
      supabase
        .from("wa_messages")
        .select("conversation_id, role, created_at")
        .eq("agency_id", agencyId)
        .gte("created_at", desde)
        .lte("created_at", hasta)
        .order("id", { ascending: true })
        .range(d, h)
    ),
  ])

  const chats = conversaciones.length
  const idsDelPeriodo = new Set(conversaciones.map((c) => c.id))
  const mensajes = mensajesDelPeriodo.filter((m) => idsDelPeriodo.has(m.conversation_id))
  const ms: Metricas[] = conversaciones.map((c) =>
    c.metricas && typeof c.metricas === "object" && !Array.isArray(c.metricas) ? c.metricas : {}
  )
  const cuantas = (regla: (m: Metricas) => boolean) => ms.filter(regla).length

  // ── Bloque 1 ──
  const visitas = cuantas((m) => esVerdad(m.visita_agendada))
  const reservas = cuantas((m) => esVerdad(m.reserva_confirmada))
  const pidieron = cuantas((m) => esVerdad(m.solicito_hablar_con_humano))
  const pidieronYDerivados = cuantas((m) => esVerdad(m.solicito_hablar_con_humano) && esVerdad(m.fue_derivado_a_humano))
  const derivadosSinPedirlo = cuantas((m) => esVerdad(m.fue_derivado_a_humano) && !esVerdad(m.solicito_hablar_con_humano))
  // El agente escribe `necesita_vender_para_comprar`; el código viejo leía `necesita_vender_primero`
  // (casi sin filas) y daba 0 (15/9/2026). Se leen los dos.
  const necesitanVender = cuantas((m) => esVerdad(m.necesita_vender_para_comprar) || esVerdad(m.necesita_vender_primero))
  const seguimientos = conversaciones.reduce((s, c) => s + (numero(c.follow_ups_sent) ?? 0), 0)

  // ── Bloque 2 ──
  // "Calificado" es lo que el agente marcó en `metricas.calificado`. La regla vieja (tener
  // operación, tipo o presupuesto) daba 463 de 482 en Central; el dato real: 118 'sí', 236 'parcial'.
  const calificacion = (m: Metricas) => texto(m.calificado)?.toLowerCase() ?? null
  const calificados = cuantas((m) => ["sí", "si"].includes(calificacion(m) ?? ""))
  const calificadosParcial = cuantas((m) => calificacion(m) === "parcial")
  const ganadas = conversaciones.filter((c) => c.funnel_status === "closed_won").length
  const perdidas = conversaciones.filter((c) => c.funnel_status === "closed_lost").length
  const abiertas = conversaciones.filter((c) => c.funnel_status === "open").length

  // ── Bloque 3 ──
  const ambientes = ms.map((m) => {
    const n = numero(m.ambientes_buscados)
    return n !== null && n > 0 ? [`${n} amb.`] : []
  })
  const experiencia = (m: Metricas) => texto(m.experiencia_compradora)?.toLowerCase() ?? null

  // ── Bloque 4 ──
  const porTipo = tasaVisitaPor(ms, "tipo_propiedad")
  const porOperacion = tasaVisitaPor(ms, "tipo_operacion")
  const presupuestos: Record<"USD" | "ARS", number[]> = { USD: [], ARS: [] }
  for (const m of ms) {
    const moneda = texto(m.moneda_presupuesto)?.toUpperCase()
    // Si hay máximo se usa el máximo; si no, el mínimo. `??` y no `||`: un 0 no es "sin dato".
    const valor = numero(m.presupuesto_max) ?? numero(m.presupuesto_min)
    if ((moneda === "USD" || moneda === "ARS") && valor !== null && valor > 0) presupuestos[moneda].push(valor)
  }

  // ── Bloque 5 ── (mensajes del período de esas conversaciones)
  const porHora = Array<number>(24).fill(0)
  const porDia = Array<number>(7).fill(0)
  const mapa = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  const extremos = new Map<string, { primero: number; ultimo: number; cantidad: number }>()
  const conPersona = new Set<string>()
  let mensajesLead = 0
  for (const msg of mensajes) {
    const t = new Date(msg.created_at).getTime()
    if (!Number.isNaN(t)) {
      const e = extremos.get(msg.conversation_id)
      if (e) { e.primero = Math.min(e.primero, t); e.ultimo = Math.max(e.ultimo, t); e.cantidad++ }
      else extremos.set(msg.conversation_id, { primero: t, ultimo: t, cantidad: 1 })
    }
    if (msg.role === "human") conPersona.add(msg.conversation_id)
    if (msg.role !== "lead") continue
    mensajesLead++
    const pos = horaYDiaAR(msg.created_at)
    if (!pos) continue
    porHora[pos.hora]++
    porDia[pos.dia]++
    mapa[pos.dia][pos.hora]++
  }
  const duraciones: number[] = []
  for (const e of Array.from(extremos.values())) {
    const minutos = (e.ultimo - e.primero) / 60000
    // Más de 7 días ya no es "una conversación", es un cliente que volvió: no se promedia.
    if (e.cantidad >= 2 && minutos > 0 && minutos < SIETE_DIAS_MIN) duraciones.push(minutos)
  }
  const atendidasPorPersona = conPersona.size

  // ── Bloque 6 ──
  const motivos = ms.map((m) => unoSolo(texto(m.motivo_no_avance)))
  const textosMotivo = motivos.flat()
  const objecionPrecio = textosMotivo.filter((t) => PALABRAS_PRECIO.test(t)).length
  const objecionUbicacion = textosMotivo.filter((t) => PALABRAS_UBICACION.test(t)).length
  const ETIQUETA_CORTE: Record<string, string> = {
    inactividad_f3: "El cliente dejó de responder",
    agente_abandono: "El asesor dejó la conversación",
  }
  const cortesMap = new Map<string, number>()
  for (const c of conversaciones) {
    const r = texto(c.dropoff_reason)
    if (r) cortesMap.set(r, (cortesMap.get(r) ?? 0) + 1)
  }
  const cortes = Array.from(cortesMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([clave, cantidad]) => ({ etiqueta: ETIQUETA_CORTE[clave] ?? clave.replace(/_/g, " "), cantidad, pct: porcentaje(cantidad, chats) ?? 0 }))

  // Compromiso: regla fija, la misma que se lee en pantalla.
  const URGENCIA_ACTIVA = new Set(["inmediata", "corto_plazo", "medio_plazo"])
  const compromiso = { alto: 0, medio: 0, bajo: 0, sinDatos: 0 }
  for (const m of ms) {
    if (Object.keys(m).length === 0) { compromiso.sinDatos++; continue }
    if (esVerdad(m.visita_agendada) || esVerdad(m.reserva_confirmada)) { compromiso.alto++; continue }
    const dijoQueBusca = !!(texto(m.tipo_operacion) || texto(m.tipo_propiedad) || numero(m.presupuesto_max) || numero(m.presupuesto_min))
    const conPlazo = URGENCIA_ACTIVA.has(texto(m.urgencia)?.toLowerCase() ?? "")
    if (dijoQueBusca && conPlazo && !texto(m.motivo_no_avance)) compromiso.medio++
    else compromiso.bajo++
  }

  const sinIntervencionHumana = conversaciones.filter((c) => !conPersona.has(c.id)).length

  return {
    from,
    to,
    chats,
    kpis: {
      visitas,
      reservas,
      seguimientos,
      tasaConsultaVisita: porcentaje(visitas, chats),
      tasaVisitaReserva: porcentaje(reservas, visitas),
      aptoCredito: cuantas((m) => esVerdad(m.apto_credito)),
      necesitanVender,
      pidieronAsesor: pidieron,
      pidieronYDerivados,
      tasaDerivacion: porcentaje(pidieronYDerivados, pidieron),
      derivadosSinPedirlo,
    },
    embudo: {
      calificados,
      calificadosParcial,
      visitas,
      reservas,
      abiertas,
      ganadas,
      perdidas,
      tasaCierre: porcentaje(ganadas, ganadas + perdidas),
    },
    perfil: {
      tipoOperacion: distribuir(ms.map((m) => unoSolo(texto(m.tipo_operacion)?.toLowerCase() ?? null)), 6),
      urgencia: distribuir(ms.map((m) => unoSolo(texto(m.urgencia)?.toLowerCase() ?? null)), 6),
      tipoPropiedad: distribuir(ms.map((m) => unoSolo(texto(m.tipo_propiedad)?.toLowerCase() ?? null)), 8),
      ambientes: distribuir(ambientes, 6),
      composicionFamiliar: distribuir(ms.map((m) => unoSolo(texto(m.composicion_familiar)?.toLowerCase() ?? null)), 6),
      intereses: distribuir(ms.map((m) => lista(m.intereses)), 8),
      necesidades: distribuir(ms.map((m) => lista(m.necesidades)), 8),
      primeraVez: cuantas((m) => experiencia(m) === "primera_vez"),
      conExperiencia: cuantas((m) => experiencia(m) === "con_experiencia"),
      inversores: cuantas((m) => esVerdad(m.es_inversor)),
      conPreaprobacion: cuantas((m) => esVerdad(m.tiene_preaprobacion_credito)),
    },
    demanda: {
      porTipoPropiedad: porTipo.filas,
      porOperacion: porOperacion.filas,
      sinTipoPropiedad: porTipo.sinDato,
      sinOperacion: porOperacion.sinDato,
      barrios: distribuir(ms.map((m) => unoSolo(texto(m.barrio_consultado))), 8),
      zonas: distribuir(ms.map((m) => unoSolo(texto(m.zona))), 8),
      presupuestoUSD: resumirPresupuesto(presupuestos.USD),
      presupuestoARS: resumirPresupuesto(presupuestos.ARS),
    },
    temporal: {
      mensajesLead,
      porHora,
      porDia,
      mapa,
      horaPico: indiceDelMayor(porHora),
      diaPico: indiceDelMayor(porDia),
      duracionPromedioMin: duraciones.length
        ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length)
        : null,
      conversacionesConDuracion: duraciones.length,
      atendidasPorPersona,
      soloBot: sinIntervencionHumana,
    },
    atencion: {
      sinIntervencionHumana,
      tasaSinIntervencion: porcentaje(sinIntervencionHumana, chats),
      tasaPidieron: porcentaje(pidieron, chats),
      mensajesLeadPorChat: chats > 0 ? Math.round((mensajesLead / chats) * 10) / 10 : null,
      causasNoAvance: distribuir(motivos, 8),
      cortes,
      objecionPrecio,
      objecionUbicacion,
      compromiso,
    },
  }
}
