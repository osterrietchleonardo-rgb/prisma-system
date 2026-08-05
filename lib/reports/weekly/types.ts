/** Rangos de tiempo del informe. El orden de este array es el orden de las columnas. */
export const BUCKETS = ["<1h", "1-4h", "4-24h", "+24h", "sin atender"] as const
export type Bucket = (typeof BUCKETS)[number]

/** Ventana semanal, ya convertida a UTC para consultar la base. */
export interface WeekWindow {
  /** ISO UTC del lunes 00:00 AR. */
  startUtc: string
  /** ISO UTC del domingo 23:59:59.999 AR. */
  endUtc: string
  /** Texto para el email, ej. "27 de julio al 2 de agosto de 2026". */
  label: string
}

/**
 * Un evento de derivación ya resuelto: quién lo recibió, cuándo, y qué rastro dejó.
 * Sirve para los tres tipos (handoff, visita, link); los que no aplican quedan en false.
 */
export interface DerivationEvent {
  /** Nombre del asesor, o "(sin asesor)" si no se pudo resolver. */
  agentName: string
  /** ISO UTC del momento de la derivación. */
  at: string
  /** Horas hasta el primer mensaje de la agencia en el chat. null = nunca escribió. */
  replyHours: number | null
  /** Quedó una visita cargada en scheduled_visits después de la derivación. */
  visitScheduled: boolean
  /** El asesor clickeó un link del email (last_event = "clicked" en Resend). */
  emailClicked: boolean
}

/** Fila de la tabla de handoffs: intervención medida por rango de tiempo. */
export interface AgentRow {
  agent: string
  total: number
  /** Cuántos tuvieron respuesta en el chat. */
  attended: number
  /** Porcentaje entero, o null si total = 0. */
  pct: number | null
  buckets: Record<Bucket, number>
}

/** Fila de las tablas de visita y link: las tres señales por separado. */
export interface SignalRow {
  agent: string
  total: number
  /** Escribió en la conversación de PRISMA. */
  chat: number
  /** Quedó la visita cargada en scheduled_visits. */
  visita: number
  /** Clickeó el email. */
  email: number
  /** Ninguna de las tres. */
  sinRastro: number
}

/** Una etapa del pipeline de Tracking Performance con cuántos leads derivados hay en ella. */
export interface PipelineRow {
  stage: string
  count: number
}

/** El informe completo de una inmobiliaria, listo para renderizar. */
export interface WeeklyReport {
  agencyName: string
  window: WeekWindow
  /** Conversaciones creadas en la semana CON al menos un mensaje del cliente. */
  consultas: number
  handoffs: { total: number; rows: AgentRow[] }
  visitas: { total: number; rows: SignalRow[] }
  links: { total: number; rows: SignalRow[] }
  pipeline: { derivados: number; cargados: number; rows: PipelineRow[] }
  /** false = no se pudo leer Resend; las secciones de visita y link salen "no disponible". */
  resendOk: boolean
}
