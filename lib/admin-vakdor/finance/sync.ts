/**
 * Finanzas — orquestador de sincronización de costos de APIs.
 * Trae los costos de cada proveedor habilitado (según env) y hace UPSERT idempotente
 * en public.finance_api_costs. Pensado para correr desde el cron nocturno y a mano.
 */
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { fetchOpenAICosts, fetchAnthropicCosts, fetchGeminiCosts, type CostRow } from "./providers"
import { hasGoogleCreds } from "./google-auth"

export interface SyncResult {
  proveedor: string
  ok: boolean
  filas: number
  costo_usd: number
  error?: string
}

export function getAnthropicKey(): string | undefined {
  // Tolera el typo histórico en .env (ANTHTOPIC) por si quedó en algún entorno.
  return process.env.ANTHROPIC_ADMIN_API_KEY ?? process.env.ANTHTOPIC_ADMIN_API_KEY
}

export async function syncApiCosts(from: Date, to: Date): Promise<SyncResult[]> {
  const db = getAdminDb()
  const results: SyncResult[] = []

  const providers: { nombre: string; run: () => Promise<CostRow[]> }[] = []
  if (process.env.OPENAI_ADMIN_API_KEY) {
    providers.push({ nombre: "openai", run: () => fetchOpenAICosts(process.env.OPENAI_ADMIN_API_KEY!, from, to) })
  }
  const anthropicKey = getAnthropicKey()
  if (anthropicKey) {
    providers.push({ nombre: "anthropic", run: () => fetchAnthropicCosts(anthropicKey, from, to) })
  }
  if (hasGoogleCreds()) {
    providers.push({ nombre: "google", run: () => fetchGeminiCosts(from, to) })
  }

  for (const p of providers) {
    try {
      const rows = await p.run()
      if (rows.length) {
        const { error } = await db
          .from("finance_api_costs")
          .upsert(rows as unknown as Record<string, unknown>[], {
            onConflict: "fecha,proveedor,proyecto,modelo,fuente",
          })
        if (error) throw new Error(error.message)
      }
      results.push({
        proveedor: p.nombre,
        ok: true,
        filas: rows.length,
        costo_usd: rows.reduce((s, r) => s + r.costo_usd, 0),
      })
    } catch (e) {
      results.push({
        proveedor: p.nombre,
        ok: false,
        filas: 0,
        costo_usd: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return results
}
