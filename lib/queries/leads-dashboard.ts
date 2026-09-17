import { createClient } from "@/lib/supabase/server"
import { todasLasFilas } from "@/lib/queries/todas-las-filas"
import { inicioDelDiaAR, finDelDiaAR } from "@/lib/dashboard/periodo"

/**
 * "Leads Comerciales" del dashboard del director: los leads que Tokko sincroniza en `leads`.
 *
 * Auditoría del 15/9/2026: la sección bajaba TODOS los leads al navegador llamando a la API de
 * Tokko (bloqueaba la sección y ni se usaba el resultado), tenía su propio filtro de fechas en
 * "todo el historial", filtraba por estados que Tokko no usa ("Activo", "En negociación",
 * "Perdido") y mostraba textos inventados ("75% Zonaprop", "un asesor concentra el 45%").
 * Ahora todo se calcula acá, en el servidor, en cada carga, con el filtro de arriba del
 * dashboard (período + asesor), y al navegador viajan solo los totales.
 */

/** Un estado de Tokko con su cantidad, tal como figura hoy en Tokko. */
export interface ConteoLeads {
  nombre: string
  cantidad: number
}

/** Una semana (lunes a domingo, días argentinos) recortada al período elegido. */
export interface SemanaLeads {
  /** 'yyyy-MM-dd': primer día de la semana que cae dentro del período. */
  desde: string
  /** 'yyyy-MM-dd': último día de la semana que cae dentro del período. */
  hasta: string
  cantidad: number
}

export interface FilaAsesorLeads {
  /** profiles.id; null = la fila "Sin asignar". */
  id: string | null
  nombre: string
  total: number
  /** Cantidad por columna de estado (las claves son `columnasEstado`). */
  estados: Record<string, number>
  /** % de sus leads del período que hoy siguen "Sin Contactar" en Tokko (0 a 100, redondeado). */
  pctSinContactar: number
}

export interface FilaCalidadAsesor {
  id: string | null
  nombre: string
  total: number
  pctEmail: number
  pctTelefono: number
  pctNombre: number
  /** % con los tres datos: nombre, email y teléfono. */
  pctCompletos: number
}

export interface LineaInhibidor {
  clave: "sin-contactar" | "fuente" | "concentracion" | "congelados" | "sin-asignar"
  titulo: string
  /** El número principal, ya escrito (ej. "726 de 1.464"). */
  numero: string
  /** Porcentaje sobre el total del período (0 a 100, redondeado). */
  porcentaje: number
  /** Qué significa, en una oración simple. */
  texto: string
  tono: "alerta" | "aviso"
}

export interface LeadsDashboardData {
  from: string
  to: string
  /** El asesor del filtro de arriba; null = toda la agencia. */
  agentId: string | null
  total: number
  /** Leads sin asesor asignado en Tokko. null cuando hay un asesor elegido (no aplica). */
  sinAsignar: number | null
  /** Cuántos asesores distintos recibieron al menos un lead en el período. */
  asesoresConLeads: number
  /** Leads que hoy siguen "Sin Contactar" en Tokko, y cuántos de ellos entraron hace más de 48 h. */
  sinContactar: number
  sinContactarMas48h: number
  porEstado: ConteoLeads[]
  porFuente: ConteoLeads[]
  tiposContacto: { interesados: number; propietarios: number; empresas: number }
  semanas: SemanaLeads[]
  /** Columnas de estado de la tabla por asesor, en orden. */
  columnasEstado: string[]
  porAsesor: FilaAsesorLeads[]
  calidad: {
    conEmail: number
    conTelefono: number
    conNombre: number
    conEtiquetas: number
    /** Sin email y sin teléfono: no hay forma de contactarlos. */
    sinContacto: number
  }
  calidadPorAsesor: FilaCalidadAsesor[]
  inhibidores: LineaInhibidor[]
}

interface FilaLead {
  id: string
  assigned_agent_id: string | null
  source: string | null
  tokko_lead_status: string | null
  tokko_created_date: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  tokko_tags: string[] | null
  is_owner: boolean | null
  is_company: boolean | null
}

// Los estados que Tokko usa de verdad (Central, 15/9/2026: Sin Contactar 3.090, Tomar Accion
// 1.377, Cerrado 1.077, Congelado 128, Pendiente contactar 96, Esperando respuesta 70). Los que
// casi no aparecen (Evolucionando, Visita Confirmada, Sin Seguimiento) van a "Otros" para que la
// tabla no tenga columnas vacías. Se comparan sin tildes ni mayúsculas: Tokko escribe "Accion".
const SIN_CONTACTAR = "Sin Contactar"
const OTROS = "Otros"
const COLUMNAS_ESTADO = [SIN_CONTACTAR, "Tomar Acción", "Pendiente contactar", "Esperando respuesta", "Congelado", "Cerrado", OTROS]
const COLUMNA_POR_ESTADO: Record<string, string> = {
  "sin contactar": SIN_CONTACTAR,
  "tomar accion": "Tomar Acción",
  "pendiente contactar": "Pendiente contactar",
  "esperando respuesta": "Esperando respuesta",
  "congelado": "Congelado",
  "cerrado": "Cerrado",
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** El nombre del estado para mostrar: el de la columna si es uno conocido; si no, el de Tokko. */
function nombreEstado(estado: string | null): string {
  const limpio = estado?.trim()
  if (!limpio) return "Sin estado"
  return COLUMNA_POR_ESTADO[normalizar(limpio)] ?? limpio
}

const columnaEstado = (estado: string | null) =>
  (estado?.trim() && COLUMNA_POR_ESTADO[normalizar(estado)]) || OTROS

const tieneTexto = (s: string | null | undefined) => !!s && s.trim() !== ""
// El sync escribe "Sin nombre" cuando Tokko no trae nombre (lib/tokko-sync.ts, mapTokkoContact).
const tieneNombre = (s: string | null) => tieneTexto(s) && s!.trim() !== "Sin nombre"

const pct = (n: number, total: number) => (total > 0 ? Math.round((n * 100) / total) : 0)
const miles = (n: number) => n.toLocaleString("es-AR")

// Argentina no tiene horario de verano: -03:00 fijo (igual que lib/dashboard/periodo.ts).
const DIA_MS = 24 * 3600e3
const fechaAR = (instante: string) => new Date(Date.parse(instante) - 3 * 3600e3).toISOString().slice(0, 10)
const sumarDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10)
const lunesDe = (fecha: string) => {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay() // 0 = domingo
  return sumarDias(fecha, -((dia + 6) % 7))
}

export async function getLeadsDashboardData(
  agencyId: string,
  agentId: string | undefined,
  from: string,
  to: string
): Promise<LeadsDashboardData> {
  const supabase = createClient()

  // `tokko_created_date` es timestamptz y es el día en que el lead entró a Tokko; `created_at` es
  // solo cuándo lo copió el sync, no sirve para el período. Los límites van con -03:00 para que
  // el día sea el argentino y no el de UTC (auditoría del 15/9/2026).
  // Solo las columnas que se usan: con `select *` (tokko_raw completo) Central pesa ~10 MB.
  const [filas, perfiles] = await Promise.all([
    todasLasFilas<FilaLead>((desde, hasta) => {
      let q = supabase
        .from("leads")
        .select(
          "id, assigned_agent_id, source, tokko_lead_status, tokko_created_date, full_name, email, phone, tokko_tags, is_owner:tokko_raw->is_owner, is_company:tokko_raw->is_company"
        )
        .eq("agency_id", agencyId)
        .gte("tokko_created_date", inicioDelDiaAR(from))
        .lte("tokko_created_date", finDelDiaAR(to))
      if (agentId) q = q.eq("assigned_agent_id", agentId)
      return q.order("id", { ascending: true }).range(desde, hasta)
    }),
    supabase.from("profiles").select("id, full_name").eq("agency_id", agencyId),
  ])

  const nombrePorId = new Map<string, string>()
  for (const p of perfiles.data ?? []) nombrePorId.set(p.id, p.full_name?.trim() || "Asesor sin nombre")
  const nombreAsesor = (id: string | null) => (id ? nombrePorId.get(id) ?? "Asesor sin perfil" : "Sin asignar")

  const total = filas.length
  const hace48h = Date.now() - 48 * 3600e3

  const porEstado = new Map<string, number>()
  const porFuente = new Map<string, number>()
  const tiposContacto = { interesados: 0, propietarios: 0, empresas: 0 }
  const calidad = { conEmail: 0, conTelefono: 0, conNombre: 0, conEtiquetas: 0, sinContacto: 0 }
  let sinContactar = 0
  let sinContactarMas48h = 0
  let congelados = 0

  // Semanas de lunes a domingo, todas (también las que tuvieron 0), recortadas al período y en
  // orden de fecha: antes salían de la más nueva a la más vieja y solo las que tenían leads.
  const semanas: SemanaLeads[] = []
  const semanaPorLunes = new Map<string, SemanaLeads>()
  for (let lunes = lunesDe(from); lunes <= to; lunes = sumarDias(lunes, 7)) {
    const domingo = sumarDias(lunes, 6)
    const semana = { desde: lunes < from ? from : lunes, hasta: domingo > to ? to : domingo, cantidad: 0 }
    semanas.push(semana)
    semanaPorLunes.set(lunes, semana)
  }

  interface Acumulado {
    id: string | null
    total: number
    estados: Record<string, number>
    email: number
    telefono: number
    nombre: number
    completos: number
  }
  const porAsesor = new Map<string, Acumulado>()

  for (const l of filas) {
    const estado = nombreEstado(l.tokko_lead_status)
    porEstado.set(estado, (porEstado.get(estado) ?? 0) + 1)
    const fuente = l.source?.trim() || "Sin fuente"
    porFuente.set(fuente, (porFuente.get(fuente) ?? 0) + 1)

    const columna = columnaEstado(l.tokko_lead_status)
    if (columna === SIN_CONTACTAR) {
      sinContactar++
      if (l.tokko_created_date && Date.parse(l.tokko_created_date) < hace48h) sinContactarMas48h++
    }
    if (columna === "Congelado") congelados++

    if (l.is_company === true) tiposContacto.empresas++
    else if (l.is_owner === true) tiposContacto.propietarios++
    else tiposContacto.interesados++

    const conEmail = tieneTexto(l.email)
    const conTelefono = tieneTexto(l.phone)
    const conNombre = tieneNombre(l.full_name)
    if (conEmail) calidad.conEmail++
    if (conTelefono) calidad.conTelefono++
    if (conNombre) calidad.conNombre++
    if (l.tokko_tags && l.tokko_tags.length > 0) calidad.conEtiquetas++
    if (!conEmail && !conTelefono) calidad.sinContacto++

    if (l.tokko_created_date) {
      const semana = semanaPorLunes.get(lunesDe(fechaAR(l.tokko_created_date)))
      if (semana) semana.cantidad++
    }

    const clave = l.assigned_agent_id ?? "__sin_asignar__"
    let a = porAsesor.get(clave)
    if (!a) {
      a = { id: l.assigned_agent_id, total: 0, estados: {}, email: 0, telefono: 0, nombre: 0, completos: 0 }
      for (const c of COLUMNAS_ESTADO) a.estados[c] = 0
      porAsesor.set(clave, a)
    }
    a.total++
    a.estados[columna]++
    if (conEmail) a.email++
    if (conTelefono) a.telefono++
    if (conNombre) a.nombre++
    if (conEmail && conTelefono && conNombre) a.completos++
  }

  // Orden original de las tablas: más leads primero; "Sin asignar" al final.
  const acumulados = Array.from(porAsesor.values()).sort((x, y) =>
    x.id === null ? 1 : y.id === null ? -1 : y.total - x.total
  )
  const filasAsesor: FilaAsesorLeads[] = acumulados.map((a) => ({
    id: a.id,
    nombre: nombreAsesor(a.id),
    total: a.total,
    estados: a.estados,
    pctSinContactar: pct(a.estados[SIN_CONTACTAR], a.total),
  }))
  const calidadPorAsesor: FilaCalidadAsesor[] = acumulados.map((a) => ({
    id: a.id,
    nombre: nombreAsesor(a.id),
    total: a.total,
    pctEmail: pct(a.email, a.total),
    pctTelefono: pct(a.telefono, a.total),
    pctNombre: pct(a.nombre, a.total),
    pctCompletos: pct(a.completos, a.total),
  }))

  const ordenarConteo = (m: Map<string, number>): ConteoLeads[] =>
    Array.from(m.entries())
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((x, y) => y.cantidad - x.cantidad)

  const estadosOrdenados = ordenarConteo(porEstado)
  const fuentesOrdenadas = ordenarConteo(porFuente)
  const asignados = acumulados.filter((a) => a.id !== null)
  const sinAsignar = agentId ? null : porAsesor.get("__sin_asignar__")?.total ?? 0

  // Inhibidores de conversión: cada línea sale de una columna real, con su número y su %.
  // Reemplazan los textos fijos que había (auditoría del 15/9/2026). Una línea en 0 no se muestra.
  const inhibidores: LineaInhibidor[] = []
  if (total > 0) {
    if (sinContactar > 0) {
      inhibidores.push({
        clave: "sin-contactar",
        titulo: "Leads sin contactar",
        numero: `${miles(sinContactar)} de ${miles(total)}`,
        porcentaje: pct(sinContactar, total),
        texto:
          sinContactarMas48h > 0
            ? `Hoy siguen "Sin Contactar" en Tokko. ${miles(sinContactarMas48h)} de ellos entraron hace más de 48 horas: cuanto más espera una consulta, más difícil es convertirla.`
            : `Hoy siguen "Sin Contactar" en Tokko. Todos entraron en las últimas 48 horas.`,
        tono: sinContactarMas48h > 0 ? "alerta" : "aviso",
      })
    }
    const principal = fuentesOrdenadas[0]
    if (principal) {
      inhibidores.push({
        clave: "fuente",
        titulo: `Fuente principal: ${principal.nombre}`,
        numero: `${miles(principal.cantidad)} de ${miles(total)}`,
        porcentaje: pct(principal.cantidad, total),
        texto: `Es de donde llegó la mayor parte de los leads del período. Cuanto más depende el volumen de una sola fuente, más se resiente si esa fuente afloja.`,
        tono: "aviso",
      })
    }
    // Con un asesor elegido la concentración no dice nada (sería el 100%).
    if (!agentId && asignados.length > 0) {
      const top = asignados[0]
      inhibidores.push({
        clave: "concentracion",
        titulo: `Asesor con más leads: ${nombreAsesor(top.id)}`,
        numero: `${miles(top.total)} de ${miles(total)}`,
        porcentaje: pct(top.total, total),
        texto: `Los leads del período se repartieron entre ${asignados.length} ${asignados.length === 1 ? "asesor" : "asesores"}. Si una sola persona recibe una parte grande, es más difícil que llegue a atenderlos a todos a tiempo.`,
        tono: "aviso",
      })
    }
    if (congelados > 0) {
      inhibidores.push({
        clave: "congelados",
        titulo: "Leads congelados",
        numero: `${miles(congelados)} de ${miles(total)}`,
        porcentaje: pct(congelados, total),
        texto: `Están en "Congelado" en Tokko: por ahora no se están trabajando.`,
        tono: "aviso",
      })
    }
    if (sinAsignar && sinAsignar > 0) {
      inhibidores.push({
        clave: "sin-asignar",
        titulo: "Leads sin asesor asignado",
        numero: `${miles(sinAsignar)} de ${miles(total)}`,
        porcentaje: pct(sinAsignar, total),
        texto: `Entraron sin asesor en Tokko (o con uno que no tiene usuario en PRISMA): nadie es responsable de responderlos.`,
        tono: "alerta",
      })
    }
  }

  return {
    from,
    to,
    agentId: agentId ?? null,
    total,
    sinAsignar,
    asesoresConLeads: asignados.length,
    sinContactar,
    sinContactarMas48h,
    porEstado: estadosOrdenados,
    porFuente: fuentesOrdenadas,
    tiposContacto,
    semanas,
    columnasEstado: COLUMNAS_ESTADO,
    porAsesor: filasAsesor,
    calidad,
    calidadPorAsesor,
    inhibidores,
  }
}
