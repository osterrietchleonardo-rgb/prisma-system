/**
 * Chat web · Una web de mentira para probar el chat en la máquina, sin publicar nada.
 *
 * Solo existe en desarrollo: en producción devuelve 404. Es una página cualquiera con el widget
 * puesto como lo pondría un cliente, para ver el botón, abrir la ventana y conversar de verdad.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("No disponible.", { status: 404 })

  const db = createAdminClient()
  const { data: widgets } = await db
    .from("web_widgets")
    .select("id, sitio, activo, dominios")
    .order("created_at", { ascending: true })
    .limit(5)

  const origen = new URL(req.url).origin
  const elegido = (widgets ?? [])[0]
  if (!elegido)
    return new Response("<p>Todavía no hay ningún widget configurado.</p>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })

  const dominios = (elegido.dominios as string[]) ?? []
  const host = new URL(origen).host
  const listo = elegido.activo && dominios.includes(host)

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Web de prueba · chat de PRISMA</title>
<style>
  body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#1a1a1a;
         background:#fafafa; }
  .barra { background:#111; color:#fff; padding:14px 24px; font-weight:600; }
  main { max-width:760px; margin:0 auto; padding:32px 20px 120px; }
  h1 { font-size:26px; margin:0 0 8px; }
  p { line-height:1.6; color:#444; }
  .aviso { border-radius:10px; padding:12px 14px; margin:20px 0; font-size:14px; }
  .bien { background:#e9f7ef; border:1px solid #a8d5ba; }
  .mal { background:#fdeceb; border:1px solid #f0b3ae; }
  code { background:#eee; padding:2px 6px; border-radius:4px; font-size:13px; }
</style></head>
<body>
  <div class="barra">Inmobiliaria de prueba</div>
  <main>
    <h1>Esta es una web cualquiera</h1>
    <p>No es real: existe solo en tu computadora, para ver cómo queda el chat cuando se pega en el
    sitio de una inmobiliaria. Abajo a la derecha tenés el botón.</p>

    <div class="aviso ${listo ? "bien" : "mal"}">
      ${
        listo
          ? `Listo para probar. Widget de <strong>${elegido.sitio}</strong>, prendido, y esta dirección (<code>${host}</code>) está permitida.`
          : `Falta un paso: ${!elegido.activo ? "el widget está <strong>apagado</strong>" : `esta dirección (<code>${host}</code>) <strong>no está en los dominios permitidos</strong> del widget`}.`
      }
    </div>

    <p>Probá escribirle algo como <em>"hola, quiero ver una demostración"</em> o
    <em>"quiero sumarme al equipo"</em>. Las conversaciones quedan guardadas y las vas a ver en
    la bandeja de PRISMA.</p>

    <p>Cuando termines, esta página no deja nada: cerrás y listo.</p>
  </main>
  <script src="${origen}/api/chat-web/widget-js?w=${elegido.id}" async></script>
</body></html>`

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}
