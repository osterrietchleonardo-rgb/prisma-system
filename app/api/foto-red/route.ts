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
import { HOSTS_ROOMIX } from "@/lib/acm/fotos-url";

export const runtime = "nodejs";

/** Bucket PRIVADO. Se sirve por acá, nunca con `getPublicUrl`. */
const BUCKET = "red-fotos";
/** Mismo tope por foto que `fotos-descarga.ts`. */
const MAX_BYTES = 8 * 1024 * 1024;
/** El archivo del CDN de origen no cambia de contenido, así que la respuesta se puede cachear
 *  todo lo que el navegador quiera. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

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
    return new Response(await cacheada.data.arrayBuffer(), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE_CONTROL, "X-Foto-Red": "cache" },
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

  const tipo = origen.headers.get("content-type") || "image/jpeg";
  if (!tipo.startsWith("image/")) return new Response("el origen no devolvio una imagen", { status: 502 });

  // 3) Se guarda para no volver a pedirla nunca mas. Si el guardado falla, igual se sirve:
  //    perder el cache es molesto, no devolver la foto seria peor.
  const subida = await sb.storage.from(BUCKET).upload(nombre, bytes, { contentType: tipo, upsert: true });
  if (subida.error) console.error("foto-red: no se pudo cachear", nombre, subida.error.message);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": tipo,
      "Cache-Control": CACHE_CONTROL,
      "X-Foto-Red": subida.error ? "origen-sin-cache" : "origen",
    },
  });
}
