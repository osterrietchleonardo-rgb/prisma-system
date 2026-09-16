//
// Farming · la solapa «A la venta en mi zona»: lo que se publica HOY adentro de la zona del
// asesor. Es la lista que le da trabajo el primer día, sin que cargue nada.
//
// Las cuatro señales salen de columnas que `mercado_avisos` ya tiene. Medido en producción el
// 16-sep sobre 67.577 avisos de venta: dueño directo 823, +120 días 13.950, caídos 0 y con baja
// de precio 20. Por eso un atajo se dibuja SOLO si tiene datos: un botón que siempre da cero se
// siente roto, y cuando el pipeline de mercado vuelva a marcar caídos aparece solo.
import { urlFotoRed, RUTA_FOTO_RED } from "@/lib/acm/fotos-url"

export type Senal = "duenos" | "caidos" | "viejos" | "bajaron"

/** En el orden del spec, que es el del valor para captar: primero el dueño que vende solo. */
export const SENALES: { clave: Senal; etiqueta: string; porque: string }[] = [
  { clave: "duenos", etiqueta: "Dueño directo", porque: "Vende solo, sin inmobiliaria" },
  { clave: "caidos", etiqueta: "Se cayó del portal", porque: "Lo bajó sin venderlo" },
  { clave: "viejos", etiqueta: "Lleva +120 días", porque: "El colega no lo mueve" },
  { clave: "bajaron", etiqueta: "Bajó el precio", porque: "Ya aceptó que estaba caro" },
]

/** Más de 120 días publicado. El día 120 justo todavía no es «lleva mucho». */
const DIAS_VIEJO = 120

export const POR_PAGINA = 60

export interface ConteosSenales {
  total: number
  duenos: number
  caidos: number
  viejos: number
  bajaron: number
}

/** Una fila cruda de `farming_avisos_en_zona`. */
export interface FilaAviso {
  id: number
  es_dueno_directo: boolean
  titulo: string | null
  tipo: string | null
  direccion: string | null
  barrio: string | null
  precio_usd: number | string | null
  superficie_total_m2: number | string | null
  ambientes: number | null
  url_publica: string
  foto_portada: string | null
  publicador_nombre: string | null
  estado: string
  dias_publicado: number | null
  variacion_precio_pct: number | string | null
  caido_en: string | null
}

export interface AvisoEnZona {
  id: number
  es_dueno_directo: boolean
  titulo: string
  tipo: string | null
  direccion: string | null
  barrio: string | null
  precio_usd: number | null
  m2: number | null
  ambientes: number | null
  url_publica: string | null
  foto: string | null
  publicador: string | null
  senales: Senal[]
}

export interface RespuestaAvisos {
  zona: { id: string; nombre: string }
  conteos: ConteosSenales
  /** Contrato del endpoint (cubierto por un test), NO lo que lee la pantalla: la pantalla
   *  recalcula en vivo con `atajosVisibles(conteos)` (avisos-en-zona.tsx) para que un atajo
   *  que cae a cero por un descarte se saque al instante, sin esperar el próximo fetch. */
  atajos: Senal[]
  avisos: AvisoEnZona[]
  /** Contrato del endpoint, NO lo que lee la pantalla: la pantalla pagina mandando
   *  `desde=avisos.length` (cuántas tarjetas ya tiene en pantalla) — ver
   *  app/api/farming/avisos/route.ts. Este campo es informativo (cuántas tandas de
   *  POR_PAGINA representa ese `desde`), no dispara ninguna lógica del lado del cliente. */
  pagina: number
  hay_mas: boolean
}

/** Los atajos que se dibujan: los que tienen al menos un aviso, en el orden del spec. */
export function atajosVisibles(c: ConteosSenales): Senal[] {
  return SENALES.filter((s) => (c[s.clave] ?? 0) > 0).map((s) => s.clave)
}

const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** `mercado_avisos` la puebla un crawler leyendo portales de terceros, no un humano de confianza
 *  (mismo criterio que la allowlist de `lib/acm/fotos-url.ts`). Sin este filtro, un `javascript:`
 *  colado en `url_publica` terminaría en un `href` y correría en la sesión del asesor al primer
 *  click en «ver el aviso». Solo `http(s)` pasa; `new URL` dentro de un try/catch, nunca una
 *  regex suelta — una cadena relativa o rota termina en `null`, nunca tira. */
function urlPublicaSegura(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

/** La foto ya pasó por `urlFotoRed`, que devuelve la ruta de NUESTRO proxy (`RUTA_FOTO_RED`)
 *  para los hosts conocidos — pero si el host no está en su allowlist, la deja intacta. Acá se
 *  cierra esa puerta: lo único que llega a un `<img src>` es nuestra propia ruta de proxy real o
 *  una URL `http(s)` real; cualquier otro esquema (`javascript:`, `data:`, etc.) queda en `null`.
 *
 *  El chequeo es contra `RUTA_FOTO_RED + "?"` exacto, no un `startsWith("/api/")` genérico: ese
 *  genérico dejaba pasar cualquier cosa que un crawler pusiera con ese prefijo, por ejemplo
 *  `/api/../../x` (que el navegador resuelve a `/x`), forzando un GET same-origin con las
 *  cookies del asesor sin que sea nuestra ruta real. */
function fotoSegura(url: string): string | null {
  if (url.startsWith(`${RUTA_FOTO_RED}?`)) return url
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

/** Qué señales de captación tiene un aviso. Un mismo aviso puede tener varias. */
export function senalesDe(f: FilaAviso): Senal[] {
  const s: Senal[] = []
  if (f.es_dueno_directo) s.push("duenos")
  if (f.estado === "caido") s.push("caidos")
  if ((f.dias_publicado ?? 0) > DIAS_VIEJO) s.push("viejos")
  if ((num(f.variacion_precio_pct) ?? 0) < 0) s.push("bajaron")
  return s
}

export function armarAviso(f: FilaAviso): AvisoEnZona {
  return {
    id: f.id,
    es_dueno_directo: f.es_dueno_directo,
    // Sin título el aviso igual tiene que poder nombrarse: el asesor lo busca por la puerta.
    titulo: f.titulo?.trim() || f.direccion?.trim() || "Sin título",
    tipo: f.tipo,
    direccion: f.direccion,
    barrio: f.barrio,
    precio_usd: num(f.precio_usd),
    m2: num(f.superficie_total_m2),
    ambientes: f.ambientes,
    url_publica: urlPublicaSegura(f.url_publica),
    // La foto SIEMPRE por el proxy: el CSP de la app (img-src) no permite CDNs de terceros, y
    // así el navegador del asesor tampoco deja su Referer en el CDN ajeno.
    foto: f.foto_portada ? fotoSegura(urlFotoRed(f.foto_portada)) : null,
    publicador: f.publicador_nombre,
    senales: senalesDe(f),
  }
}
