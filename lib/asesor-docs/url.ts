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
 *
 * @param nombre El nombre con el que se quiere forzar la descarga (el
 * original, con extensión). El `download` de `getPublicUrl` es lo único que
 * funciona acá: `<a download="...">` NO alcanza, porque el navegador lo
 * ignora cuando el archivo está en otro dominio (Supabase), y sin esto el
 * .docx se guarda con el id de Storage como nombre y el .pdf ni se descarga
 * — el navegador navega a él en la misma pestaña. Sin `nombre`, se arma la
 * URL simple (sin forzar descarga).
 */
export async function urlDeDescarga(
  supabase: SupabaseClient,
  path: string,
  nombre?: string
): Promise<string | null> {
  if (!path) return null
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path, nombre ? { download: sanearNombreDescarga(nombre) } : undefined)
  return data?.publicUrl ?? null
}

/**
 * Saca del nombre los caracteres que rompen el `download` de `getPublicUrl`.
 *
 * getPublicUrl mete `nombre` CRUDO en la URL y recién después corre
 * `encodeURI()` sobre el total. `encodeURI` deja pasar sin tocar
 * `& # ? = + / : ; , @ $` — comprobado: `encodeURI('...?download=Ventas & Alquileres.docx')`
 * da `'...?download=Ventas%20&%20Alquileres.docx'`, con el `&` intacto. Ese
 * `&` arranca un parámetro nuevo en la URL y el asesor termina descargando un
 * archivo llamado "Ventas ", sin extensión.
 *
 * NO uses encodeURIComponent acá: no sirve, porque getPublicUrl corre
 * encodeURI() sobre el resultado final, y encodeURI escapa el `%` que
 * encodeURIComponent introduce — comprobado: `encodeURI('a%20b')` da
 * `'a%2520b'`. Por eso esto es un REEMPLAZO de caracteres, no una
 * codificación: no lo cambies a encodeURIComponent.
 */
function sanearNombreDescarga(nombre: string): string {
  return nombre.replace(/[&#?=+/:;,@$]/g, "-")
}
