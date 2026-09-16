// ACM · Abrir desde el servidor el link de un aviso que pegó un usuario, sin que ese link pueda
// llevar al servidor a una dirección INTERNA.
//
// POR QUÉ EXISTE (16-sep-2026). `extractFromUrl` hacía `fetch(url, { redirect: "follow" })` con
// cualquier cosa que empezara con http(s)://. Un usuario logueado podía pegar
// `http://169.254.169.254/` (metadatos de la nube), `http://127.0.0.1:3000/…` o un link "bueno"
// que redirigía a una de esas, y el servidor la abría y le devolvía parte de lo que encontraba.
//
// DECISIÓN (Leonardo): NO una lista cerrada de portales — la función es "pegá el link de
// cualquier portal". Se permite cualquier host PÚBLICO y se rechaza todo lo interno.
//
// TRES CAPAS, porque cada una sola se saltea:
//   1. La forma del link (`validarFormaUrl`, pura): solo http/https, sin usuario:clave, sin hosts
//      sin punto (`localhost`, `n8n`, `acm-extractor`), y si el host ES una IP, que sea pública.
//      Ojo: `new URL` ya convierte `http://2130706433/` o `http://0x7f.1/` en `127.0.0.1`.
//   2. Adónde resuelve el nombre (`validarUrlPublica`): TODAS las direcciones tienen que ser
//      públicas. Un nombre público puede apuntar a 10.0.0.5.
//   3. Adónde se conecta DE VERDAD (`crearLookupSeguro`, en el momento de abrir la conexión). Sin
//      esto, el nombre puede resolver a una IP pública en el control y a una interna medio segundo
//      después, cuando se conecta (DNS rebinding). El `fetch` global de Node no deja meter este
//      control, por eso el pedido se hace con `node:http`/`node:https` y su opción `lookup`.
// Y las tres se repiten en CADA redirección (se siguen a mano), porque si no un 302 las saltea.
//
// Mismo patrón que lib/acm/fotos-url.ts (lo puro) + lib/acm/fotos-descarga.ts (lo que baja).

import { isIP, type LookupFunction } from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

// ── 1. Lo puro ───────────────────────────────────────────────────────────────────────────

function ipv4ANumero(ip: string): number {
  return ip.split(".").reduce((acc, oct) => acc * 256 + Number(oct), 0);
}

/** Rangos IPv4 que no son internet pública: [inicio, bits de prefijo]. */
const RANGOS_V4: [string, number][] = [
  ["0.0.0.0", 8], // "esta red"
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // NAT de proveedor
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (metadatos de la nube: 169.254.169.254)
  ["172.16.0.0", 12], // privada
  ["192.0.0.0", 24], // asignaciones de protocolo
  ["192.0.2.0", 24], // documentación
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // pruebas de red
  ["198.51.100.0", 24], // documentación
  ["203.0.113.0", 24], // documentación
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada (incluye 255.255.255.255)
];

function ipv4Interna(ip: string): boolean {
  const n = ipv4ANumero(ip);
  return RANGOS_V4.some(([base, bits]) => {
    const tam = 2 ** (32 - bits);
    const inicio = ipv4ANumero(base);
    return n >= inicio && n < inicio + tam;
  });
}

/** IPv6 a sus 8 grupos de 16 bits. Acepta `::` y una IPv4 al final (`::ffff:127.0.0.1`). */
function ipv6AGrupos(ip: string): number[] | null {
  let texto = ip.split("%")[0].toLowerCase(); // sin zona (`fe80::1%eth0`)
  const v4 = texto.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (isIP(v4[1]) !== 4) return null;
    const n = ipv4ANumero(v4[1]);
    texto = texto.slice(0, -v4[1].length) + `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [izq, der, ...resto] = texto.split("::");
  if (resto.length) return null;
  const a = izq ? izq.split(":") : [];
  const b = der !== undefined ? (der ? der.split(":") : []) : null;
  const grupos = b === null ? a : [...a, ...Array(8 - a.length - b.length).fill("0"), ...b];
  if (grupos.length !== 8 || grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return grupos.map((g) => parseInt(g, 16));
}

function ipv6Interna(ip: string): boolean {
  const g = ipv6AGrupos(ip);
  if (!g) return true; // lo que no se puede leer, no se abre
  const v4DeGrupos = (alto: number, bajo: number) =>
    `${alto >>> 8}.${alto & 0xff}.${bajo >>> 8}.${bajo & 0xff}`;
  const ceros = (desde: number, hasta: number) => g.slice(desde, hasta).every((x) => x === 0);

  if (ceros(0, 8)) return true; // ::
  if (ceros(0, 7) && g[7] === 1) return true; // ::1
  if (ceros(0, 5) && g[5] === 0xffff) return ipv4Interna(v4DeGrupos(g[6], g[7])); // ::ffff:a.b.c.d
  if (ceros(0, 6)) return true; // ::a.b.c.d (obsoleta): nunca es un destino legítimo
  if (g[0] === 0x64 && g[1] === 0xff9b && ceros(2, 6)) return ipv4Interna(v4DeGrupos(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return ipv4Interna(v4DeGrupos(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo: esconde la IPv4 real
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentación
  if (g[0] === 0x100 && ceros(1, 4)) return true; // descarte
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7, privada
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10, site-local (obsoleta)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** ¿Esta IP (v4 o v6) es de una red interna o reservada? Una IP inválida cuenta como interna. */
export function esIpInterna(ip: string): boolean {
  const limpia = ip.replace(/^\[|\]$/g, "");
  const tipo = isIP(limpia.split("%")[0]);
  if (tipo === 4) return ipv4Interna(limpia);
  if (tipo === 6) return ipv6Interna(limpia);
  return true;
}

/** Terminaciones de nombres que solo existen dentro de una red. */
const SUFIJOS_INTERNOS = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

export type ValidacionUrl = { ok: true; url: URL } | { ok: false; motivo: string };

/** Primera capa: lo que se puede decidir mirando el link, sin salir a la red. */
export function validarFormaUrl(texto: string): ValidacionUrl {
  let url: URL;
  try {
    url = new URL(String(texto || "").trim());
  } catch {
    return { ok: false, motivo: "no es un link válido" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, motivo: "solo se aceptan links http o https" };
  if (url.username || url.password) return { ok: false, motivo: "el link no puede traer usuario ni contraseña" };

  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return { ok: false, motivo: "el link no tiene sitio" };
  if (isIP(host)) {
    return esIpInterna(host) ? { ok: false, motivo: "el link apunta a una dirección interna" } : { ok: true, url };
  }
  if (!host.includes(".")) return { ok: false, motivo: "el link apunta a una dirección interna" };
  if (SUFIJOS_INTERNOS.some((s) => host.endsWith(s))) return { ok: false, motivo: "el link apunta a una dirección interna" };
  return { ok: true, url };
}

// ── 2. Adónde resuelve el nombre ─────────────────────────────────────────────────────────

export type DireccionResuelta = { address: string; family: number };
/** Resolver de nombres inyectable (en las pruebas se reemplaza; en producción es el del sistema). */
export type Resolver = (host: string) => Promise<DireccionResuelta[]>;

export const resolverDelSistema: Resolver = (host) =>
  new Promise((resolve, reject) =>
    dns.lookup(host, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))),
  );

/** Primera + segunda capa. Es la que hay que pasar antes de mandar el link a cualquier lado. */
export async function validarUrlPublica(texto: string, resolver: Resolver = resolverDelSistema): Promise<ValidacionUrl> {
  const forma = validarFormaUrl(texto);
  if (!forma.ok) return forma;
  const host = forma.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return forma; // ya se controló arriba
  let direcciones: DireccionResuelta[];
  try {
    direcciones = await resolver(host);
  } catch {
    return { ok: false, motivo: "no se encontró el sitio del link" };
  }
  if (direcciones.length === 0) return { ok: false, motivo: "no se encontró el sitio del link" };
  // TODAS públicas: si una sola es interna, el sistema podría conectarse justo a esa.
  if (direcciones.some((d) => esIpInterna(d.address))) return { ok: false, motivo: "el link apunta a una dirección interna" };
  return forma;
}

// ── 3. Adónde se conecta de verdad ───────────────────────────────────────────────────────

/** `lookup` para `http.request`: vuelve a resolver en el momento de conectar y corta si alguna
 *  dirección es interna. Es lo que cierra el cambio de dirección entre el control y la conexión. */
export function crearLookupSeguro(resolver: Resolver = resolverDelSistema): LookupFunction {
  return ((host: string, opciones: any, callback: any) => {
    const cb = typeof opciones === "function" ? opciones : callback;
    const todas = typeof opciones === "object" && opciones?.all === true;
    resolver(host).then(
      (direcciones) => {
        if (direcciones.length === 0) return cb(Object.assign(new Error("sin direcciones"), { code: "ENOTFOUND" }));
        if (direcciones.some((d) => esIpInterna(d.address))) {
          return cb(Object.assign(new Error("dirección interna bloqueada"), { code: "EDIRECCION_INTERNA" }));
        }
        if (todas) return cb(null, direcciones);
        cb(null, direcciones[0].address, direcciones[0].family);
      },
      (err) => cb(err),
    );
  }) as LookupFunction;
}

// ── El pedido ────────────────────────────────────────────────────────────────────────────

export class UrlNoPermitida extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "UrlNoPermitida";
  }
}

export interface RespuestaCruda {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}
/** Hace UN pedido, sin seguir redirecciones. Inyectable para las pruebas. */
export type Transporte = (url: URL, headers: Record<string, string>, timeoutMs: number) => Promise<RespuestaCruda>;

const MAX_BYTES_PAGINA = 5 * 1024 * 1024;
const REDIRECCIONES = new Set([301, 302, 303, 307, 308]);

/** El transporte real: `node:http(s)` con el `lookup` seguro, tope de peso y descompresión. */
export function crearTransporteNode(resolver: Resolver = resolverDelSistema): Transporte {
  const lookup = crearLookupSeguro(resolver);
  return (url, headers, timeoutMs) =>
    new Promise((resolve, reject) => {
      const modulo = url.protocol === "https:" ? https : http;
      const req = modulo.request(
        url,
        { method: "GET", headers: { ...headers, "Accept-Encoding": "gzip, deflate, br" }, lookup, timeout: timeoutMs },
        (res) => {
          const cabeceras: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) cabeceras[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
          const status = res.statusCode || 0;
          if (REDIRECCIONES.has(status)) {
            res.resume(); // el cuerpo de una redirección no interesa
            return resolve({ status, headers: cabeceras, body: Buffer.alloc(0) });
          }
          const codificacion = (cabeceras["content-encoding"] || "").toLowerCase();
          const flujo =
            codificacion.includes("br") ? res.pipe(zlib.createBrotliDecompress())
            : codificacion.includes("gzip") ? res.pipe(zlib.createGunzip())
            : codificacion.includes("deflate") ? res.pipe(zlib.createInflate())
            : res;
          const partes: Buffer[] = [];
          let total = 0;
          flujo.on("data", (c: Buffer) => {
            total += c.length;
            if (total > MAX_BYTES_PAGINA) {
              req.destroy(new Error("la página es demasiado pesada"));
              return;
            }
            partes.push(c);
          });
          flujo.on("end", () => resolve({ status, headers: cabeceras, body: Buffer.concat(partes) }));
          flujo.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error("la página tardó demasiado")));
      req.on("error", (e: any) => reject(e?.code === "EDIRECCION_INTERNA" ? new UrlNoPermitida("el link apunta a una dirección interna") : e));
      req.end();
    });
}

function decodificar(body: Buffer, contentType: string): string {
  const charset = (contentType.match(/charset=([^;]+)/i)?.[1] || "utf-8").trim().toLowerCase();
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

/**
 * Baja la página de un link pegado por un usuario. Sigue las redirecciones A MANO y vuelve a
 * pasar las tres capas en cada salto. Tira `UrlNoPermitida` si algún salto apunta adentro.
 */
export async function obtenerPaginaSegura(
  texto: string,
  opts: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRedirecciones?: number;
    resolver?: Resolver;
    transporte?: Transporte;
  } = {},
): Promise<{ status: number; html: string; urlFinal: string }> {
  const resolver = opts.resolver ?? resolverDelSistema;
  const transporte = opts.transporte ?? crearTransporteNode(resolver);
  const limite = Date.now() + (opts.timeoutMs ?? 12000);
  const maxRedirecciones = opts.maxRedirecciones ?? 5;

  let actual = texto;
  for (let salto = 0; salto <= maxRedirecciones; salto++) {
    const v = await validarUrlPublica(actual, resolver);
    if (!v.ok) throw new UrlNoPermitida(v.motivo);
    const restante = limite - Date.now();
    if (restante <= 0) throw new Error("la página tardó demasiado");

    const r = await transporte(v.url, opts.headers ?? {}, restante);
    if (REDIRECCIONES.has(r.status)) {
      const destino = r.headers["location"];
      if (!destino) throw new Error("redirección sin destino");
      actual = new URL(destino, v.url).href; // relativo al salto actual; se revalida arriba
      continue;
    }
    return { status: r.status, html: decodificar(r.body, r.headers["content-type"] || ""), urlFinal: v.url.href };
  }
  throw new Error("demasiadas redirecciones");
}
