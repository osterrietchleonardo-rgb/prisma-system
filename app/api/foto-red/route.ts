// Proxy propio de las fotos de la red de colaboración (roomix).
//
// POR QUÉ EXISTE (26-ago-2026). Hasta hoy, cada foto de un comparable de la red se la pedía el
// NAVEGADOR del asesor directamente a `cdn.roomix.ai`. Dos consecuencias: el tráfico lo pagaba
// roomix, y cada pedido dejaba escrito `Referer: https://prisma.vakdor.com/` en sus registros —
// que es, textualmente, una de las cosas que nos reclamaron. Ver la entrada del 26-ago-2026 en
// `docs/interno/bitacora-sesiones.md`.
//
// Desde acá, la foto se baja UNA sola vez server-side, se guarda en nuestro Storage y todas las
// veces siguientes sale de nuestro lado. El navegador nunca más toca el CDN de ellos.
//
// SEGURIDAD. El endpoint recibe una URL del cliente, así que lo único que lo separa de ser un
// SSRF abierto es la allowlist de hosts: se valida `https` + host exactamente igual que en
// `fotos-descarga.ts`, y `redirect: "error"` evita que un host permitido nos rebote hacia un
// destino interno. No se acepta ninguna otra URL, ni siquiera de la cartera propia: esas ya se
// sirven bien desde Tokko y el Storage.
//
// ES PÚBLICO A PROPÓSITO: la ficha de ACM compartible (`/ficha-acm/[token]`) la abre un cliente
// final sin sesión. Estas fotos ya eran públicas en el CDN de origen, así que no se expone nada
// que no estuviera expuesto — pero el bucket sí es privado, para no publicar un directorio
// navegable con el material de un tercero.
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { HOSTS_ROOMIX, esTipoFotoPermitido } from "@/lib/acm/fotos-url";

export const runtime = "nodejs";

/** Bucket PRIVADO. Se sirve por acá, nunca con `getPublicUrl`. */
const BUCKET = "red-fotos";
/** Mismo tope por foto que `fotos-descarga.ts`. */
const MAX_BYTES = 8 * 1024 * 1024;
/** El archivo del CDN de origen no cambia de contenido, así que la respuesta se puede cachear
 *  todo lo que el navegador quiera. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Cabeceras que además le sacan al navegador cualquier margen de interpretación: que no adivine
 *  el tipo por el contenido (`nosniff`), que no ejecute nada aunque el archivo lo traiga (CSP),
 *  y que no lo trate como una página navegable. Defensa en profundidad: si algún día se cuela
 *  un tipo indebido, igual no corre. */
const CABECERAS_SEGURAS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "inline",
} as const;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Nombre del objeto en el bucket: hash de la URL de origen. No se guarda la URL en el nombre
 *  para no dejar el path del CDN de un tercero escrito en nuestro almacenamiento. */
function clave(url: string): string {
  return `${crypto.createHash("sha256").update(url).digest("hex")}.jpg`;
}

export async function GET(req: Request) {
  const cruda = new URL(req.url).searchParams.get("u");
  if (!cruda) return new Response("falta u", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(cruda);
  } catch {
    return new Response("URL invalida", { status: 400 });
  }
  if (parsed.protocol !== "https:" || !HOSTS_ROOMIX.some((re) => re.test(parsed.hostname))) {
    return new Response("host no permitido", { status: 400 });
  }

  const sb = admin();
  const nombre = clave(parsed.toString());

  // 1) Si ya la tenemos guardada, no se toca el origen.
  const cacheada = await sb.storage.from(BUCKET).download(nombre);
  if (cacheada.data) {
    // El tipo sale del archivo guardado, no fijo en jpeg: si lo que se cacheó fue un png o un
    // webp, servirlo como jpeg es mentirle al navegador. Igual pasa por la lista blanca, porque
    // en el bucket puede haber quedado algo subido antes de este chequeo.
    const guardado = (cacheada.data.type || "").split(";")[0].trim().toLowerCase();
    if (guardado && !esTipoFotoPermitido(guardado)) {
      return new Response("tipo de archivo no permitido", { status: 415 });
    }
    return new Response(await cacheada.data.arrayBuffer(), {
      headers: {
        "Content-Type": guardado || "image/jpeg",
        "Cache-Control": CACHE_CONTROL,
        "X-Foto-Red": "cache",
        ...CABECERAS_SEGURAS,
      },
    });
  }

  // 2) Primera vez: se baja una sola vez, sin seguir redirecciones.
  let origen: Response;
  try {
    origen = await fetch(parsed, { redirect: "error" });
  } catch {
    return new Response("no se pudo obtener la foto", { status: 502 });
  }
  if (!origen.ok) return new Response("no se pudo obtener la foto", { status: origen.status === 404 ? 404 : 502 });

  const declarado = Number(origen.headers.get("content-length") || 0);
  if (declarado > MAX_BYTES) return new Response("foto demasiado pesada", { status: 413 });
  const bytes = Buffer.from(await origen.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return new Response("foto demasiado pesada", { status: 413 });

  // Lista blanca de formatos, NO `startsWith("image/")`. `image/svg+xml` también empieza con
  // "image/" y un SVG no es una foto: es texto que puede traer un <script> adentro. Servido
  // desde nuestro dominio, ese script correría con los permisos de la app y podría leer la
  // sesión del asesor que tenga la pestaña abierta. Y como este endpoint es público y basta
  // cambiarle un carácter a la URL para volver a caer en el camino de "primera vez", el
  // atacante no necesita ni estar logueado ni pasar una sola vez.
  const tipo = (origen.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
  if (!esTipoFotoPermitido(tipo)) return new Response("tipo de archivo no permitido", { status: 415 });

  // 3) Se guarda para no volver a pedirla nunca mas. Si el guardado falla, igual se sirve:
  //    perder el cache es molesto, no devolver la foto seria peor.
  const subida = await sb.storage.from(BUCKET).upload(nombre, bytes, { contentType: tipo, upsert: true });
  if (subida.error) console.error("foto-red: no se pudo cachear", nombre, subida.error.message);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": tipo,
      "Cache-Control": CACHE_CONTROL,
      "X-Foto-Red": subida.error ? "origen-sin-cache" : "origen",
      ...CABECERAS_SEGURAS,
    },
  });
}
