// ─────────────────────────────────────────────────────────────
// Helpers PUROS y compartidos para datos de Tokko (sin I/O).
// Se usan tanto en los syncs (server) como en el normalizador (UI),
// para que la misma lógica valga para CUALQUIER configuración de agencia.
// ─────────────────────────────────────────────────────────────

const toNum = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return isNaN(x) ? 0 : x
}

/**
 * Elige Total y Cubierta a partir de los múltiples campos de superficie de Tokko,
 * que vienen inconsistentes según quién cargó la propiedad.
 *  - Cubierta = `roofed_surface` (la superficie techada real). Para lotes es 0.
 *  - Total    = `total_surface`, con respaldo a `surface` y luego `roofed_surface`.
 * Evita el bug histórico de tomar `surface` (que suele ser el LOTE) como cubierta.
 */
export function pickSurfaces(p: any): { total: number; covered: number } {
  const totalSurface = toNum(p?.total_surface)
  const surface = toNum(p?.surface)
  const roofed = toNum(p?.roofed_surface)

  const covered = roofed
  const total = totalSurface > 0 ? totalSurface : surface > 0 ? surface : roofed

  return { total, covered }
}

/**
 * Quita del objeto crudo de Tokko los datos sensibles que NO deben viajar al
 * navegador (datos del propietario, comisiones, ubicación de llaves, notas
 * internas). Devuelve una copia; no muta el original.
 */
export function stripTokkoSensitive<T extends Record<string, any> | null | undefined>(data: T): T {
  if (!data || typeof data !== "object") return data
  const clean: Record<string, any> = { ...data }
  delete clean.internal_data
  delete clean.internal_comments
  return clean as T
}

export interface TokkoTagLike {
  id?: number
  name?: string | null
  group_name?: string | null
}

const KNOWN_CHANNELS = [
  "web", "zonaprop", "mercadolibre", "mercado libre", "argenprop", "facebook",
  "instagram", "referido", "whatsapp", "portal", "google", "inmoup", "properati",
  "icasas", "clienapp",
]

/**
 * Deduce el ORIGEN del lead a partir de los tags, de forma flexible:
 *  1) Tag cuyo grupo contenga "origen" (ej. Central: "Origen de contacto" → "Zonaprop").
 *  2) Si no, tag cuyo NOMBRE sea un canal conocido (ej. PRISMAIA: "Web").
 * Devuelve null si no encuentra nada.
 */
export function deriveLeadOrigin(tags: TokkoTagLike[] | null | undefined): string | null {
  const safe = Array.isArray(tags) ? tags : []

  const byGroup = safe.find(
    (t) => t && typeof t.group_name === "string" && /origen/i.test(t.group_name)
  )
  if (byGroup?.name) return byGroup.name

  const byName = safe.find(
    (t) => t && typeof t.name === "string" && KNOWN_CHANNELS.includes(t.name.toLowerCase().trim())
  )
  if (byName?.name) return byName.name

  return null
}

/** Devuelve el nombre del primer tag cuyo grupo matchee el regex dado. */
export function findTagByGroup(
  tags: TokkoTagLike[] | null | undefined,
  groupRegex: RegExp
): string | null {
  const safe = Array.isArray(tags) ? tags : []
  const hit = safe.find((t) => t && typeof t.group_name === "string" && groupRegex.test(t.group_name))
  return hit?.name ?? null
}
