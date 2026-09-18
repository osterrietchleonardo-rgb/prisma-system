/**
 * Chat web · Rastreo del sitio de la agencia (diseño 2026-09-16 §3-bis).
 *
 * El director carga la dirección de su sitio y el sistema lo lee para poder orientar al visitante
 * y pasarle el link exacto de cada sección. Corre en TRES momentos (al guardar, con el botón
 * "Actualizar" y una vez por mes), nunca de forma continua.
 *
 * Es la única parte de PRISMA donde el servidor abre una dirección que escribió otra persona, así
 * que el guardia está acá y no en el que llama: solo http/https, solo el dominio declarado (y su
 * www), nada de direcciones internas (se resuelve el nombre ANTES de pedir), y topes de páginas,
 * de tiempo y de tamaño. Sin eso, un director podría hacer que nuestro servidor lea nuestra red.
 *
 * Todo lo de red es inyectable (`fetchFn`, `resolver`) para poder probarlo sin internet.
 */

export interface LimitesRastreo {
  /** Páginas distintas que se leen como mucho. */
  maxPaginas: number
  /** Techo de todo el rastreo. */
  maxMsTotal: number
  /** Techo de cada página. */
  maxMsPagina: number
  /** Si la página pesa más que esto, se descarta (no se lee un archivo gigante). */
  maxBytes: number
  /** Caracteres de texto por pedazo guardado. */
  maxCaracteresPagina: number
}

export const LIMITES: LimitesRastreo = {
  maxPaginas: 60,
  maxMsTotal: 180_000,
  maxMsPagina: 10_000,
  maxBytes: 2_000_000,
  maxCaracteresPagina: 8_000,
}

/** Tope de direcciones que se juntan del sitemap antes de ordenarlas y quedarse con las primeras. */
const MAX_CANDIDATAS = 5_000

/** Lo que no es una página: archivos que no aportan texto o que pesan. */
const EXTENSIONES_FUERA =
  /\.(pdf|jpe?g|png|gif|webp|svg|ico|mp4|mov|avi|webm|mp3|wav|zip|rar|7z|gz|doc|docx|xls|xlsx|ppt|pptx|csv|dwg|exe|dmg)$/i

export interface SitioNormalizado {
  /** Siempre https y con barra final: "https://vakdor.com/". */
  origen: string
  /** El dominio y su www: lo único que el rastreo puede abrir. */
  dominios: string[]
}

/** Lo que escribe el director puede venir de cualquier forma; esto lo deja parejo. */
export function normalizarSitio(entrada: string): SitioNormalizado | null {
  const texto = String(entrada ?? "").trim()
  if (!texto || /\s/.test(texto)) return null
  const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`
  let u: URL
  try {
    u = new URL(conEsquema)
  } catch {
    return null
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null
  const host = u.hostname.toLowerCase().replace(/^www\./, "")
  if (!host.includes(".")) return null
  return { origen: `https://${host}/`, dominios: [host, `www.${host}`] }
}

/**
 * Las secciones que suelen colgar de sí las fichas de propiedades, en español y en inglés.
 * Ojo: el listado general ("/propiedades") SÍ entra, porque es una sección del sitio; lo que queda
 * afuera es la ficha suelta ("/propiedades/45-casa-city-bell").
 */
const SEGMENTOS_FICHA =
  /^(propiedad|propiedades|inmueble|inmuebles|emprendimiento|emprendimientos|ficha|fichas|listing|listings|property|properties|detalle)$/i

/**
 * ¿Es la ficha de UNA propiedad? Esas no se rastrean: ya están en la cartera, que es mejor fuente y
 * está siempre al día. Sin esto, en un sitio con 300 publicaciones las fichas se comen el cupo de
 * 60 páginas y el asistente nunca llega a leer "Tasaciones" ni "Sumate al equipo".
 */
export function esFichaDePropiedad(entrada: string): boolean {
  let partes: string[]
  try {
    partes = new URL(entrada).pathname.split("/").filter(Boolean)
  } catch {
    return false
  }
  const i = partes.findIndex((p) => SEGMENTOS_FICHA.test(p))
  return i !== -1 && partes.length > i + 1
}

/** Las secciones que cuelgan de sí las notas: blog, novedades, prensa. */
const SEGMENTOS_NOTA =
  /^(blog|blogs|noticias|noticia|novedades|novedad|prensa|nota|notas|articulo|articulos|art[ií]culo|art[ií]culos|news|post|posts)$/i

/**
 * ¿Es UNA nota del blog? No entran (Leonardo, 17/9): casi nunca responden lo que pregunta quien
 * entra a una inmobiliaria, y se comen el cupo de 60 páginas que necesitan las secciones.
 * La PORTADA del blog sí queda: es una sección del sitio, y sirve para mandar a alguien a leer.
 */
export function esNotaDeBlog(entrada: string): boolean {
  let partes: string[]
  try {
    partes = new URL(entrada).pathname.split("/").filter(Boolean)
  } catch {
    return false
  }
  const i = partes.findIndex((p) => SEGMENTOS_NOTA.test(p))
  return i !== -1 && partes.length > i + 1
}

/** Qué tan adentro del sitio está una dirección: "/" es 0, "/tasaciones" es 1. */
function profundidad(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length
  } catch {
    return 99
  }
}

export type MotivoRechazo = "esquema" | "dominio" | "extension" | "ficha" | "nota" | "invalida"
export type RevisionUrl = { ok: true; url: URL } | { ok: false; motivo: MotivoRechazo }

/** El guardia de cada dirección antes de pedirla. */
export function revisarUrl(entrada: string, dominios: string[]): RevisionUrl {
  let u: URL
  try {
    u = new URL(entrada)
  } catch {
    return { ok: false, motivo: "invalida" }
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, motivo: "esquema" }
  if (!dominios.includes(u.hostname.toLowerCase())) return { ok: false, motivo: "dominio" }
  if (EXTENSIONES_FUERA.test(u.pathname)) return { ok: false, motivo: "extension" }
  if (esFichaDePropiedad(u.toString())) return { ok: false, motivo: "ficha" }
  if (esNotaDeBlog(u.toString())) return { ok: false, motivo: "nota" }
  return { ok: true, url: u }
}

/**
 * ¿Esta dirección IP es de nuestra red (o de la propia máquina)? Incluye el rango 169.254.169.254
 * que usan las nubes para sus metadatos, que es el objetivo clásico de este ataque.
 */
export function esIpInterna(ip: string): boolean {
  const limpia = String(ip ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "")
  if (!limpia) return true
  if (limpia.includes(":")) {
    if (limpia === "::" || limpia === "::1") return true
    if (/^f[cd]/.test(limpia)) return true // fc00::/7, direcciones únicas locales
    if (/^fe[89ab]/.test(limpia)) return true // fe80::/10, enlace local
    if (limpia.startsWith("::ffff:")) return esIpInterna(limpia.slice(7)) // IPv4 disfrazada
    return false
  }
  const partes = limpia.split(".").map((n) => Number(n))
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = partes
  if (a === 0 || a === 127) return true
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

/** Un sitemap trae páginas, o trae más sitemaps. Un XML roto no rompe nada: devuelve vacío. */
export function urlsDeSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const texto = String(xml ?? "")
  const locs = [...texto.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
  if (/<sitemapindex/i.test(texto)) return { urls: [], sitemaps: locs }
  if (/<urlset/i.test(texto)) return { urls: locs, sitemaps: [] }
  return { urls: [], sitemaps: [] }
}

/** Los links de una página, ya resueltos contra su dirección y sin repetir. */
export function linksDeHtml(html: string, base: string): string[] {
  const salida: string[] = []
  for (const m of String(html ?? "").matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1].trim()
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:|data:)/i.test(href)) continue
    try {
      const u = new URL(href, base)
      if (u.protocol !== "http:" && u.protocol !== "https:") continue
      u.hash = ""
      const limpia = u.toString().replace(/\/$/, "") === base.replace(/\/$/, "") ? u.toString() : u.toString()
      if (!salida.includes(limpia)) salida.push(limpia)
    } catch {
      continue
    }
  }
  return salida
}

const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", hellip: "…",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", middot: "·",
}

function decodificar(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (entera, nombre) => ENTIDADES[nombre] ?? entera)
}

/** El título y el texto visible de una página. Sin librerías: el repo no tiene un parser de HTML. */
export function htmlATexto(html: string): { titulo: string; texto: string } {
  const bruto = String(html ?? "")
  const tituloCrudo = bruto.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""
  const cuerpo = bruto
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return {
    titulo: decodificar(tituloCrudo).replace(/\s+/g, " ").trim(),
    texto: decodificar(cuerpo).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
  }
}

/** Parte un texto largo por palabras, sin pasarse del tope y sin perder nada. */
export function partirTexto(texto: string, max: number): string[] {
  const limpio = String(texto ?? "").trim()
  if (!limpio) return []
  if (limpio.length <= max) return [limpio]
  const partes: string[] = []
  let actual = ""
  for (const palabra of limpio.split(/\s+/)) {
    if (actual && actual.length + 1 + palabra.length > max) {
      partes.push(actual)
      actual = palabra
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra
    }
  }
  if (actual) partes.push(actual)
  return partes
}

export interface PaginaRastreada {
  url: string
  titulo: string
  texto: string
  /** 0 para la página entera; 1, 2, … para los pedazos siguientes de una página larga. */
  orden: number
}

export type MotivoFallo = "sitio_invalido" | "interna" | "sin_respuesta" | "sin_texto"

export interface ResultadoRastreo {
  paginas: PaginaRastreada[]
  /** Cuántas direcciones distintas se leyeron de verdad. */
  urlsLeidas: number
  desdeSitemap: boolean
  /** true si se cortó por el tope de páginas o de tiempo. */
  truncado: boolean
  /** null si se leyó algo; el motivo si no se pudo leer nada. */
  motivo: MotivoFallo | null
}

export interface OpcionesRastreo {
  sitio: string
  limites?: LimitesRastreo
  fetchFn?: typeof fetch
  /** Nombre → direcciones IP. Inyectable para poder probar sin DNS. */
  resolver?: (host: string) => Promise<string[]>
  ahora?: () => number
}

async function resolverPorDefecto(host: string): Promise<string[]> {
  const dns = await import("node:dns")
  const direcciones = await dns.promises.lookup(host, { all: true })
  return direcciones.map((d) => d.address)
}

/** Cuántas redirecciones seguidas se aceptan antes de dar la dirección por perdida. */
const MAX_SALTOS = 4

/**
 * El guardia que viaja con el rastreo: qué dominios se pueden abrir y a qué IP resuelve cada
 * nombre. Las respuestas del DNS se recuerdan para no preguntar lo mismo 60 veces.
 */
interface Guardia {
  dominios: string[]
  resolver: (host: string) => Promise<string[]>
  resueltos: Map<string, boolean>
}

/** ¿Esta dirección es del sitio del director, y por http(s)? */
function esDelSitio(entrada: string, dominios: string[]): URL | null {
  let u: URL
  try {
    u = new URL(entrada)
  } catch {
    return null
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null
  if (!dominios.includes(u.hostname.toLowerCase())) return null
  return u
}

async function hostSeguro(host: string, guardia: Guardia): Promise<boolean> {
  const recordado = guardia.resueltos.get(host)
  if (recordado !== undefined) return recordado
  let seguro = false
  try {
    const ips = await guardia.resolver(host)
    seguro = ips.length > 0 && !ips.some(esIpInterna)
  } catch {
    seguro = false
  }
  guardia.resueltos.set(host, seguro)
  return seguro
}

/**
 * Pide una dirección SIN dejar que una redirección se lleve el rastreo a otro lado.
 *
 * El nombre del sitio se revisa al empezar, pero eso no alcanza: un sitio puede contestar
 * "andá a 169.254.169.254" (los metadatos de la nube) o a cualquier máquina de nuestra red, y
 * un fetch normal la sigue solo. Por eso acá las redirecciones se resuelven a mano: cada salto
 * vuelve a pasar por el mismo control que la primera dirección, dominio y dirección IP.
 */
async function pedir(
  url: string,
  fetchFn: typeof fetch,
  limites: LimitesRastreo,
  guardia: Guardia,
  cabeceras?: Record<string, string>
): Promise<Response | null> {
  let actual = url
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const u = esDelSitio(actual, guardia.dominios)
    if (!u) return null
    if (!(await hostSeguro(u.hostname, guardia))) return null

    let res: Response
    try {
      res = await fetchFn(actual, {
        redirect: "manual",
        signal: AbortSignal.timeout(limites.maxMsPagina),
        ...(cabeceras ? { headers: cabeceras } : {}),
      })
    } catch {
      return null
    }

    const esRedireccion = res.status >= 300 && res.status < 400
    if (!esRedireccion) return res

    const destino = res.headers?.get?.("location")
    if (!destino) return null
    try {
      actual = new URL(destino, actual).toString()
    } catch {
      return null
    }
  }
  // Demasiados saltos: o es una vuelta sin fin, o alguien nos está paseando.
  return null
}

/** Lee una página. Devuelve null si no es HTML, si pesa de más o si no contesta. */
async function leerPagina(
  url: string,
  fetchFn: typeof fetch,
  limites: LimitesRastreo,
  guardia: Guardia
): Promise<{ titulo: string; texto: string } | null> {
  const res = await pedir(url, fetchFn, limites, guardia, {
    "user-agent": "PRISMA-ChatWeb/1.0 (+https://prisma.vakdor.com)",
    accept: "text/html,application/xhtml+xml,application/xml",
  })
  if (!res || !res.ok) return null
  const tipo = res.headers?.get?.("content-type") ?? ""
  if (tipo && !/(text\/html|application\/xhtml|text\/plain|xml)/i.test(tipo)) return null
  const largo = Number(res.headers?.get?.("content-length") ?? 0)
  if (largo && largo > limites.maxBytes) return null
  let html: string
  try {
    html = await res.text()
  } catch {
    return null
  }
  if (html.length > limites.maxBytes) html = html.slice(0, limites.maxBytes)
  return htmlATexto(html)
}

/**
 * El rastreo completo: sitemap si lo hay, si no dos niveles desde la home siguiendo links del
 * mismo dominio. Nunca sale del dominio declarado y nunca toca una dirección interna.
 */
export async function rastrearSitio(opts: OpcionesRastreo): Promise<ResultadoRastreo> {
  const limites = opts.limites ?? LIMITES
  const fetchFn = opts.fetchFn ?? fetch
  const resolver = opts.resolver ?? resolverPorDefecto
  const ahora = opts.ahora ?? (() => Date.now())
  const vacio = (motivo: MotivoFallo): ResultadoRastreo => ({ paginas: [], urlsLeidas: 0, desdeSitemap: false, truncado: false, motivo })

  const sitio = normalizarSitio(opts.sitio)
  if (!sitio) return vacio("sitio_invalido")

  // El nombre se resuelve ANTES de pedir nada: si apunta adentro, no se abre ni la home.
  const guardia: Guardia = { dominios: sitio.dominios, resolver, resueltos: new Map() }
  const hostDelSitio = new URL(sitio.origen).hostname
  if (!(await hostSeguro(hostDelSitio, guardia))) return vacio("interna")

  const arranque = ahora()
  const sinTiempo = () => ahora() - arranque > limites.maxMsTotal
  const paginas: PaginaRastreada[] = []
  const vistas = new Set<string>()
  let truncado = false
  let huboRespuesta = false

  const guardar = (url: string, leida: { titulo: string; texto: string }) => {
    const pedazos = partirTexto(leida.texto, limites.maxCaracteresPagina)
    pedazos.forEach((texto, orden) => paginas.push({ url, titulo: leida.titulo, texto, orden }))
  }

  // ── 1. El camino ordenado: el sitemap ──
  let candidatas: string[] = []
  const encontradas: string[] = []
  const yaCandidata = new Set<string>()
  let desdeSitemap = false
  const sitemapRaiz = `${sitio.origen}sitemap.xml`
  const primerSitemap = await leerPagina(sitemapRaiz, fetchFn, limites, guardia)
  if (primerSitemap) {
    const porVer = [sitemapRaiz]
    const yaVistos = new Set<string>()
    while (porVer.length && encontradas.length < MAX_CANDIDATAS && !sinTiempo()) {
      const actual = porVer.shift()!
      if (yaVistos.has(actual)) continue
      yaVistos.add(actual)
      const revision = revisarUrl(actual, sitio.dominios)
      if (!revision.ok && actual !== sitemapRaiz) continue
      let xml: string | null = null
      try {
        const res = await pedir(actual, fetchFn, limites, guardia)
        if (res?.ok) xml = await res.text()
      } catch {
        xml = null
      }
      if (!xml) continue
      const { urls, sitemaps } = urlsDeSitemap(xml)
      for (const u of urls) {
        if (encontradas.length >= MAX_CANDIDATAS) { truncado = true; break }
        if (!yaCandidata.has(u) && revisarUrl(u, sitio.dominios).ok) {
          yaCandidata.add(u)
          encontradas.push(u)
        }
      }
      for (const s of sitemaps) if (!yaVistos.has(s) && revisarUrl(s, sitio.dominios).ok) porVer.push(s)
    }
    // Las secciones primero: una dirección más corta es más general ("/tasaciones" antes que
    // "/blog/una-nota-de-2024"). Así, si el sitio no entra entero, lo que queda es lo que orienta.
    const ordenadas = encontradas
      .map((u, i) => ({ u, i, hondo: profundidad(u) }))
      .sort((a, b) => a.hondo - b.hondo || a.i - b.i)
      .map((x) => x.u)
    // El sitio tenía más páginas de las que entran: el director tiene que saber que quedó cortado.
    if (ordenadas.length > limites.maxPaginas) truncado = true
    candidatas = ordenadas.slice(0, limites.maxPaginas)
    desdeSitemap = candidatas.length > 0
  }

  // ── 2. Si no hubo sitemap útil: desde la home, dos niveles ──
  if (!desdeSitemap) {
    const porVer: Array<{ url: string; nivel: number }> = [{ url: sitio.origen, nivel: 0 }]
    while (porVer.length && vistas.size < limites.maxPaginas && !sinTiempo()) {
      const { url, nivel } = porVer.shift()!
      if (vistas.has(url)) continue
      vistas.add(url)
      const leida = await leerPagina(url, fetchFn, limites, guardia)
      if (!leida) continue
      huboRespuesta = true
      guardar(url, leida)
      if (vistas.size >= limites.maxPaginas) { truncado = porVer.length > 0; break }
      if (nivel >= 2) continue
      for (const link of linksDeHtml(leida.texto ? await paginaCruda(url, fetchFn, limites, guardia) : "", url)) {
        if (revisarUrl(link, sitio.dominios).ok && !vistas.has(link)) porVer.push({ url: link, nivel: nivel + 1 })
      }
    }
    return {
      paginas,
      urlsLeidas: paginas.length ? new Set(paginas.map((p) => p.url)).size : 0,
      desdeSitemap: false,
      truncado,
      motivo: paginas.length ? null : huboRespuesta ? "sin_texto" : "sin_respuesta",
    }
  }

  // ── 3. Con la lista del sitemap, se leen las páginas ──
  for (const url of candidatas) {
    if (vistas.size >= limites.maxPaginas) { truncado = true; break }
    if (sinTiempo()) { truncado = true; break }
    if (vistas.has(url)) continue
    vistas.add(url)
    const leida = await leerPagina(url, fetchFn, limites, guardia)
    if (!leida) continue
    huboRespuesta = true
    guardar(url, leida)
  }

  return {
    paginas,
    urlsLeidas: new Set(paginas.map((p) => p.url)).size,
    desdeSitemap: true,
    truncado,
    motivo: paginas.length ? null : huboRespuesta ? "sin_texto" : "sin_respuesta",
  }
}

/** El HTML crudo de una página ya leída (para sacarle los links). */
async function paginaCruda(
  url: string,
  fetchFn: typeof fetch,
  limites: LimitesRastreo,
  guardia: Guardia
): Promise<string> {
  try {
    const res = await pedir(url, fetchFn, limites, guardia)
    if (!res || !res.ok) return ""
    const html = await res.text()
    return html.length > limites.maxBytes ? html.slice(0, limites.maxBytes) : html
  } catch {
    return ""
  }
}
