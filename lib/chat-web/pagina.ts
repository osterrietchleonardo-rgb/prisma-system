/**
 * Chat web · La ventana que ve el visitante, servida por PRISMA dentro de un marco en el sitio
 * de la agencia.
 *
 * Es HTML suelto y no una pantalla de React a propósito: se carga en la web de un tercero, así
 * que cuanto menos pese y menos traiga, mejor. No usa ninguna librería.
 *
 * Lo que NO entra acá: nada de la agencia que no sea público. El id del widget sí (hace falta
 * para conversar y no sirve para nada más: el endpoint igual comprueba de qué sitio viene).
 */
import type { Paleta, Fuentes } from "./estilo"

export interface OpcionesPagina {
  widgetId: string
  nombreAgencia: string
  nombreBot: string
  saludo: string
  paleta: Paleta
  fuentes: Fuentes
  logo: string | null
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string
  )
}

/** Un dominio que se pueda poner en una cabecera sin abrir la puerta a otra cosa. */
function dominioLimpio(d: string): string | null {
  const limpio = String(d ?? "").trim().toLowerCase()
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(limpio) ? limpio : null
}

/**
 * Quién puede mostrar esta ventana adentro de un marco: SOLO el sitio de esa agencia. Sin esto,
 * cualquiera podría empotrar el chat de una inmobiliaria en su propia web y hacerse pasar por
 * ella.
 */
export function cspDeLaVentana(dominios: string[]): string {
  const limpios = dominios.map(dominioLimpio).filter((d): d is string => Boolean(d))
  const ancestros = limpios.length ? limpios.map((d) => `https://${d}`).join(" ") : "'none'"
  return [
    "default-src 'self'",
    // El HTML trae su propio script y su propio estilo, por eso el 'unsafe-inline'. No carga
    // nada de afuera salvo el logo de la agencia, que vive en nuestro Storage.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.supabase.co",
    "connect-src 'self'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `frame-ancestors ${ancestros}`,
  ].join("; ")
}

export function paginaDelChat(o: OpcionesPagina): string {
  const p = o.paleta
  const bot = esc(o.nombreBot)
  const agencia = esc(o.nombreAgencia)

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${bot} · ${agencia}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; height:100dvh; display:flex; flex-direction:column;
         background:${p.fondo}; color:${p.texto}; font-family:${o.fuentes.cuerpo}; font-size:15px; }
  header { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid ${p.borde}; }
  header img { width:28px; height:28px; border-radius:6px; object-fit:contain; }
  header .nombre { font-family:${o.fuentes.titulo}; font-weight:600; }
  header .que-es { color:${p.textoSuave}; font-size:12px; }
  #charla { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; }
  .globo { max-width:85%; padding:9px 12px; border-radius:14px; line-height:1.45; white-space:pre-wrap; word-break:break-word; }
  .visitante { align-self:flex-end; background:${p.visitanteFondo}; color:${p.visitanteTexto}; border-bottom-right-radius:4px; }
  .agente { align-self:flex-start; background:${p.agenteFondo}; color:${p.agenteTexto}; border-bottom-left-radius:4px; }
  .globo a { color:inherit; }
  .pensando { align-self:flex-start; color:${p.textoSuave}; font-size:13px; }
  form { display:flex; gap:8px; padding:10px; border-top:1px solid ${p.borde};
         padding-bottom:calc(10px + env(safe-area-inset-bottom, 0px)); }
  input { flex:1; min-width:0; height:44px; padding:0 12px; border:1px solid ${p.borde}; border-radius:22px;
          background:transparent; color:${p.texto}; font:inherit; }
  button { height:44px; padding:0 18px; border:0; border-radius:22px; background:${p.botonFondo};
           color:${p.botonTexto}; font:inherit; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
</style>
</head>
<body>
<header>
  ${o.logo ? `<img src="${esc(o.logo)}" alt="">` : ""}
  <div>
    <div class="nombre">${bot}</div>
    <div class="que-es">Asistente de ${agencia}</div>
  </div>
</header>

<div id="charla" role="log" aria-live="polite"></div>

<form id="envio">
  <input id="texto" autocomplete="off" placeholder="Escribí tu consulta…" aria-label="Tu mensaje" maxlength="1000">
  <button type="submit">Enviar</button>
</form>

<script>
(function () {
  var WIDGET = ${JSON.stringify(o.widgetId)};
  var charla = document.getElementById("charla");
  var form = document.getElementById("envio");
  var campo = document.getElementById("texto");
  var boton = form.querySelector("button");

  // Quién es este visitante, para que si vuelve mañana siga su conversación. Vive solo en su
  // navegador; si no se puede guardar (modo privado), el chat funciona igual, sin memoria.
  var visitante = "";
  try {
    visitante = localStorage.getItem("prisma.chat." + WIDGET) || "";
    if (!visitante) {
      visitante = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
      localStorage.setItem("prisma.chat." + WIDGET, visitante);
    }
  } catch (e) { visitante = String(Date.now()) + Math.random(); }

  function agregar(texto, quien) {
    var d = document.createElement("div");
    d.className = "globo " + quien;
    d.textContent = texto;
    charla.appendChild(d);
    charla.scrollTop = charla.scrollHeight;
    return d;
  }

  agregar(${JSON.stringify(o.saludo)}, "agente");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var texto = campo.value.trim();
    if (!texto) return;
    campo.value = "";
    agregar(texto, "visitante");
    boton.disabled = true;

    var esperando = document.createElement("div");
    esperando.className = "pensando";
    esperando.textContent = "escribiendo…";
    charla.appendChild(esperando);
    charla.scrollTop = charla.scrollHeight;

    fetch("/api/chat-web/mensaje", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        widgetId: WIDGET,
        visitanteId: visitante,
        texto: texto,
        // La página del sitio donde está puesto el chat. La manda el marco de afuera.
        paginaOrigen: (document.referrer || "")
      })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        esperando.remove();
        agregar(d.texto || "Ahora no te puedo responder. Probá de nuevo en un rato.", "agente");
      })
      .catch(function () {
        esperando.remove();
        agregar("Se cortó la conexión. Probá de nuevo.", "agente");
      })
      .then(function () { boton.disabled = false; campo.focus(); });
  });
})();
</script>
</body>
</html>`
}
