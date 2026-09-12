import type { SupabaseClient } from '@supabase/supabase-js'

// Adjuntos que manda el CLIENTE (audio, foto, video, documento).
//
// Meta no manda el archivo: manda un media_id. Para tenerlo hay que pedirle a la Graph API
// una URL (vive 5 minutos) y bajarla con el token de la instancia. Y Meta BORRA el archivo
// a los 7 días ("Media IDs in webhooks expire after 7 days"). Hasta el 11/9/2026 nadie lo
// bajaba: 168 audios y 29 fotos de clientes quedaron imposibles de abrir en el chat.
//
// Por eso se baja apenas llega y se guarda en nuestro Storage, en el mismo bucket y con la
// misma forma de ruta que los adjuntos que manda el asesor (`wa-outbound/...`).

const GRAPH = 'https://graph.facebook.com/v21.0'
const BUCKET = 'documents'
const TIMEOUT_MS = 15_000

const EXTENSION: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'application/pdf': 'pdf',
}

/** "audio/ogg; codecs=opus" -> "audio/ogg" */
export function mimeBase(mime: string | null | undefined): string {
  return (mime || '').split(';')[0].trim().toLowerCase()
}

export function rutaAdjunto(agencyId: string, conversationId: string, mediaId: string, mime: string): string {
  return `wa-inbound/${agencyId}/${conversationId}/${mediaId}.${EXTENSION[mimeBase(mime)] || 'bin'}`
}

export type AdjuntoGuardado = { media_url: string; media_mime: string; media_saved_at: string }

/**
 * Baja el adjunto de Meta y lo sube a Storage. Devuelve los campos para sumar a
 * `wa_messages.metadata`, o null si algo falló (el mensaje ya está guardado igual:
 * esto nunca tiene que frenar la llegada del mensaje).
 */
export async function guardarAdjuntoEntrante(
  supabase: SupabaseClient,
  p: { token: string; mediaId: string; mimeDeclarado?: string | null; agencyId: string; conversationId: string },
  fetcher: typeof fetch = fetch,
): Promise<AdjuntoGuardado | null> {
  try {
    const auth = { Authorization: `Bearer ${p.token}` }
    const infoRes = await fetcher(`${GRAPH}/${p.mediaId}`, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!infoRes.ok) throw new Error(`Graph API ${infoRes.status}`)
    const info = (await infoRes.json()) as { url?: string; mime_type?: string; file_size?: number }
    if (!info.url) throw new Error('Graph API sin url')

    const archivoRes = await fetcher(info.url, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!archivoRes.ok) throw new Error(`descarga ${archivoRes.status}`)
    const buf = Buffer.from(await archivoRes.arrayBuffer())
    if (info.file_size && buf.length !== info.file_size) {
      throw new Error(`descarga incompleta: ${buf.length} de ${info.file_size} bytes`)
    }

    const mime = mimeBase(info.mime_type || p.mimeDeclarado) || 'application/octet-stream'
    const ruta = rutaAdjunto(p.agencyId, p.conversationId, p.mediaId, mime)
    // upsert: si Meta reintenta el webhook, el mismo media_id pisa el mismo archivo.
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, buf, { contentType: mime, upsert: true })
    if (error) throw new Error(`Storage: ${error.message}`)

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
    return { media_url: data.publicUrl, media_mime: mime, media_saved_at: new Date().toISOString() }
  } catch (e) {
    console.error(`[Adjunto entrante] No se pudo guardar el media ${p.mediaId}:`, e instanceof Error ? e.message : e)
    return null
  }
}
