import type { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = "documents"

/**
 * La URL para bajarse un documento de un asesor.
 *
 * ÚNICO lugar del sistema donde se arma. El bucket `documents` está en público
 * por decisión de Leonardo (spec §9.1), con el riesgo planteado y aceptado: el
 * link de Supabase no vence nunca, así que un asesor desvinculado sigue abriendo
 * su documento desde afuera si se guardó la dirección.
 *
 * Cuando se decida cerrarlo, el cambio es reemplazar getPublicUrl por
 * createSignedUrl ACÁ ADENTRO, y nada más. Por eso la función es async aunque
 * hoy no lo necesite: para que ese cambio no obligue a tocar a quien la llama.
 */
export async function urlDeDescarga(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  if (!path) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl ?? null
}
