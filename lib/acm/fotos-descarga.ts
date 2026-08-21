// ACM · Descarga de fotos de propiedad server-side, validada contra una allowlist de hosts y
// re-achicada con sharp — usada por los dos puntos que le mandan fotos a la IA
// (`analizar-fotos` y `fotos-comparables`). Resuelve la foto a partir de un id de propiedad,
// nunca de una URL que mande el cliente (ver los comentarios de cada endpoint).
//
// La normalización de URLs y la allowlist en sí viven en `fotos-url.ts` (funciones puras, sin
// sharp): este archivo las importa, no las duplica.
import sharp from "sharp";
import { HOSTS_CARTERA, HOSTS_ROOMIX } from "./fotos-url";

// Re-export para que los endpoints que descargan pidan hosts y descarga del mismo lugar.
export { HOSTS_CARTERA, HOSTS_ROOMIX };

/** Tope por-foto antes de re-achicar con sharp. Mismo valor en todos los puntos de descarga. */
export const MAX_BYTES_FOTO = 8 * 1024 * 1024;
const MAX_LADO_FOTO = 1280;

/** Descarga una foto server-side, validada contra una allowlist de hosts, y la re-achica a JPEG
 *  1280px (mismo formato que usa todo el módulo de fotos+IA, subidas incluidas). Nunca sigue
 *  redirecciones: un host permitido podría responder 302 hacia un destino interno y `fetch` lo
 *  seguiría sin volver a pasar por el chequeo de host. */
export async function descargarFotoValidada(url: string, hosts: RegExp[]): Promise<{ data: string; mimeType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL de foto inválida");
  }
  if (parsed.protocol !== "https:" || !hosts.some((re) => re.test(parsed.hostname))) {
    throw new Error("host de foto no permitido");
  }

  const res = await fetch(parsed, { redirect: "error" });
  if (!res.ok) throw new Error(`no se pudo descargar (${res.status})`);

  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES_FOTO) throw new Error("foto demasiado pesada");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES_FOTO) throw new Error("foto demasiado pesada");

  // El content-type se valida DESPUÉS de descargar (no evita la descarga en sí, la allowlist de
  // host de arriba es la que hace ese trabajo) — queda como defensa adicional contra un host
  // permitido sirviendo algo que no es una imagen.
  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("la URL no es una imagen");

  const resized = await sharp(buffer)
    .resize({ width: MAX_LADO_FOTO, height: MAX_LADO_FOTO, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { data: resized.toString("base64"), mimeType: "image/jpeg" };
}
