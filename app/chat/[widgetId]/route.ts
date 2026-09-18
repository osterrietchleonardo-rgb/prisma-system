/**
 * Chat web · La ventana del chat, servida para el sitio de la agencia.
 *
 * Es una ruta y no una pantalla de React porque necesita mandar SUS PROPIAS cabeceras: cada
 * agencia solo puede ser enmarcada por su propio sitio (frame-ancestors con sus dominios). Con una
 * página común eso no se puede decir por agencia.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { paletaDelChat, fuentesDelChat } from "@/lib/chat-web/estilo"
import { cspDeLaVentana, paginaDelChat } from "@/lib/chat-web/pagina"
import { marcaDeLaAgencia } from "@/lib/ficha/snapshot"
import { cookieDeVisitante, leerVisitante } from "@/lib/chat-web/identidad"
import { randomBytes } from "node:crypto"

export const dynamic = "force-dynamic"
/**
 * 17/9: `dynamic` NO alcanza. Next 14 cachea los `fetch` que se hacen DENTRO de una ruta, y el
 * cliente de Supabase lee con fetch: la ruta seguía devolviendo la respuesta vieja (el widget
 * apagado) aunque en la base ya estuviera prendido. Se ve igual que un bug de la base y no lo es.
 */
export const fetchCache = "force-no-store"

export async function GET(req: Request, { params }: { params: { widgetId: string } }) {
  const db = createAdminClient()
  const { data: widget } = await db
    .from("web_widgets")
    .select("id, agency_id, activo, dominios, acento")
    .eq("id", params.widgetId)
    .maybeSingle()

  // Sin widget o apagado: una página que no hace nada y que nadie puede enmarcar.
  if (!widget || !widget.activo)
    return new Response("<!doctype html><meta charset=utf-8><p>Este chat no está disponible.</p>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": cspDeLaVentana([]) },
    })

  const [{ data: agencia }, { data: ajustes }] = await Promise.all([
    db.from("agencies").select("name, marketing_ai_config").eq("id", widget.agency_id).maybeSingle(),
    db.from("whatsapp_ai_settings").select("bot_name").eq("agency_id", widget.agency_id).maybeSingle(),
  ])

  // La identidad visual sale de Marketing IA → Configuración; acá NO se copia nada.
  const marca = marcaDeLaAgencia(agencia?.marketing_ai_config)
  const nombreAgencia = (agencia?.name as string) ?? "la inmobiliaria"
  const nombreBot = (ajustes?.bot_name as string) ?? "Asistente"

  const html = paginaDelChat({
    widgetId: widget.id as string,
    nombreAgencia,
    nombreBot,
    saludo: `¡Hola! Soy ${nombreBot}, de ${nombreAgencia}. ¿En qué te puedo ayudar?`,
    paleta: paletaDelChat({
      primario: marca.colors[0] ?? "",
      acento: (widget.acento as string | null) ?? undefined,
      tema: "claro",
    }),
    fuentes: fuentesDelChat(marca.font),
    logo: marca.logo_url,
  })

  // Quien es el visitante lo decide el SERVIDOR, no el pedido: si lo dijera el navegador,
  // alguien con el numero de otra persona podria seguir SU conversacion (pregunta de
  // Leonardo, 17/9). Ver lib/chat-web/identidad.ts.
  const yaEra = leerVisitante(req.headers.get("cookie"), widget.id as string)
  const visitante = yaEra ?? randomBytes(16).toString("hex")
  const seguro = new URL(req.url).protocol === "https:"

  const cabeceras = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": cspDeLaVentana((widget.dominios as string[]) ?? []),
    // Que no quede cacheada con los colores viejos cuando el director cambia la marca.
    "Cache-Control": "no-store",
  })
  if (!yaEra) cabeceras.append("Set-Cookie", cookieDeVisitante(widget.id as string, visitante, seguro))

  return new Response(html, { headers: cabeceras })
}
