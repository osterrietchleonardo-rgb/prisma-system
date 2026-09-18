/**
 * Chat web · El archivo que se pega en la web de la agencia.
 *
 * Es UNA línea del lado del cliente: este script dibuja el botón flotante y, al tocarlo, abre la
 * ventana del chat dentro de un marco. Nada más. No lee la página donde vive, no toca sus estilos
 * y no manda ningún dato a ningún lado.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { paletaDelChat } from "@/lib/chat-web/estilo"
import { marcaDeLaAgencia } from "@/lib/ficha/snapshot"

export const dynamic = "force-dynamic"
/**
 * 17/9: `dynamic` NO alcanza. Next 14 cachea los `fetch` que se hacen DENTRO de una ruta, y el
 * cliente de Supabase lee con fetch: la ruta seguía devolviendo la respuesta vieja (el widget
 * apagado) aunque en la base ya estuviera prendido. Se ve igual que un bug de la base y no lo es.
 */
export const fetchCache = "force-no-store"

export async function GET(req: Request) {
  const widgetId = new URL(req.url).searchParams.get("w") ?? ""
  const vacio = (motivo: string) =>
    new Response(`/* PRISMA: ${motivo} */`, {
      headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
    })
  if (!widgetId) return vacio("falta el identificador del chat")

  const db = createAdminClient()
  const { data: widget } = await db
    .from("web_widgets")
    .select("id, agency_id, activo, acento")
    .eq("id", widgetId)
    .maybeSingle()
  if (!widget?.activo) return vacio("el chat está apagado")

  const { data: agencia } = await db
    .from("agencies")
    .select("marketing_ai_config")
    .eq("id", widget.agency_id)
    .maybeSingle()
  const marca = marcaDeLaAgencia(agencia?.marketing_ai_config)
  const paleta = paletaDelChat({
    primario: marca.colors[0] ?? "",
    acento: (widget.acento as string | null) ?? undefined,
    tema: "claro",
  })

  // La dirección sale del PROPIO pedido, no de una variable: así el script funciona igual en la
  // máquina, en una copia de prueba y en producción, sin que nadie tenga que acordarse de
  // cambiar nada. (17/9: con la variable, el chat abierto en local apuntaba a producción.)
  const url = new URL(req.url)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host
  const protocolo = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const origen = `${protocolo}://${host}`
  const js = `(function(){
  if (window.__prismaChat) return; window.__prismaChat = true;
  var ORIGEN = ${JSON.stringify(origen)}, W = ${JSON.stringify(widget.id)};
  var boton = document.createElement("button");
  boton.type = "button";
  boton.setAttribute("aria-label", "Abrir el chat");
  boton.style.cssText = "position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:50%;"
    + "background:${paleta.botonFondo};color:${paleta.botonTexto};font-size:24px;cursor:pointer;z-index:2147483000;"
    + "box-shadow:0 6px 20px rgba(0,0,0,.25)";
  boton.textContent = "\uD83D\uDCAC";
  var marco = null;
  boton.addEventListener("click", function () {
    if (marco) { var v = marco.style.display === "none"; marco.style.display = v ? "block" : "none"; return; }
    marco = document.createElement("iframe");
    // La pagina donde esta puesto el chat viaja explicita: algunos sitios no mandan el
    // referente (Referrer-Policy: no-referrer) y sin este dato el servidor no atiende.
    marco.src = ORIGEN + "/chat/" + W + "?p=" + encodeURIComponent(location.origin);
    marco.title = "Chat";
    marco.style.cssText = "position:fixed;right:20px;bottom:88px;width:min(380px,calc(100vw - 40px));"
      + "height:min(560px,calc(100vh - 120px));border:0;border-radius:16px;z-index:2147483000;"
      + "box-shadow:0 12px 40px rgba(0,0,0,.28);background:#fff";
    document.body.appendChild(marco);
  });
  document.body.appendChild(boton);
})();`

  return new Response(js, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
  })
}
