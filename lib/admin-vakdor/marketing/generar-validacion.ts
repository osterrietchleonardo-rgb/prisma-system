import { claveValida } from "./voz"
import type { NuevaIdeaInput, FuenteIdea, FormatoIdea, FunnelStage } from "./types"

const FUENTES: FuenteIdea[] = ["linkedin", "instagram", "blog"]
const FORMATOS: FormatoIdea[] = [
  "post_texto", "carrusel", "imagen", "encuesta",
  "articulo_linkedin", "reel", "lead_magnet", "articulo_blog",
]
const FUNNELS: FunnelStage[] = ["tofu", "mofu", "bofu"]

/**
 * Las claves que existen HOY en la base. Se pasan por parámetro (en vez de leerlas acá)
 * para que la validación sea pura y testeable sin tocar Supabase.
 */
export interface ClavesValidas {
  clusters: string[]
  propositos: string[]
  estructuras: string[]
}

const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null
  const limpio = v.trim()
  return limpio.length > 0 ? limpio : null
}

/**
 * Convierte lo que devolvió la IA en ideas listas para insertar.
 *
 * Criterio: si falta lo estructural (título, fuente, formato) la idea se descarta; si falla
 * un eje (cluster, propósito, estructura, embudo) el eje queda en null pero la idea sobrevive.
 * Perder una pieza entera por una clave inventada sería peor que perder el eje.
 */
export function parsearIdeas(parsed: unknown[], claves: ClavesValidas): NuevaIdeaInput[] {
  const ideas: NuevaIdeaInput[] = []
  for (const it of parsed ?? []) {
    if (!it || typeof it !== "object") continue
    const item = it as Record<string, unknown>

    const titulo = texto(item.titulo)
    const fuente = item.fuente as FuenteIdea
    const formato = item.formato as FormatoIdea
    if (!titulo || !FUENTES.includes(fuente) || !FORMATOS.includes(formato)) continue

    const funnel = item.funnel as FunnelStage
    ideas.push({
      titulo,
      fuente,
      formato,
      funnel: FUNNELS.includes(funnel) ? funnel : null,
      cluster: claveValida(claves.clusters, item.cluster),
      proposito: claveValida(claves.propositos, item.proposito),
      // Contra las claves activas de la base, NO contra una lista cerrada en código:
      // una estructura agregada por SQL tiene que ser aceptada sin desplegar.
      estructura: claveValida(claves.estructuras, item.estructura),
      keyword_objetivo: texto(item.keyword_objetivo),
      angulo: texto(item.angulo),
      gancho: texto(item.gancho),
      motivo: texto(item.motivo),
      origen: "motor",
    })
  }
  return ideas
}
