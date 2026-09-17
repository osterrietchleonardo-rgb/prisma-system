import { describe, it, expect } from "vitest"
import { atajosVisibles, armarAviso, senalesDe, SENALES, POR_PAGINA, type FilaAviso } from "./avisos"

/**
 * La solapa «A la venta en mi zona». Las reglas que sostiene este archivo:
 *  1. Un atajo se dibuja SOLO si tiene al menos un aviso (decisión de Leonardo, 16-sep):
 *     hoy «se cayó» y «bajó el precio» dan cero en todo el sistema y un botón que da cero
 *     se siente roto.
 *  2. El orden de los atajos es el del spec: dueño directo, caído, +120 días, bajó el precio.
 *  3. Un aviso puede tener varias señales a la vez.
 *  4. La foto SIEMPRE pasa por el proxy (el CSP de la app no deja CDNs de terceros).
 *  5. Un aviso sin título no rompe la pantalla: se lo nombra por su dirección.
 */

const base: FilaAviso = {
  id: 1, es_dueno_directo: false, titulo: "Depto 3 amb", tipo: "Departamento",
  direccion: "Conde 900", barrio: "Colegiales", precio_usd: "185000", superficie_total_m2: "78",
  ambientes: 3, url_publica: "https://www.zonaprop.com.ar/x-123.html",
  foto_portada: "https://imgar.zonapropcdn.com/avisos/1/x.jpg", publicador_nombre: "Inmobiliaria X",
  estado: "activo", dias_publicado: 30, variacion_precio_pct: null, caido_en: null,
}

describe("atajosVisibles", () => {
  it("solo los que tienen al menos un aviso", () => {
    expect(atajosVisibles({ total: 170, duenos: 1, caidos: 0, viejos: 30, bajaron: 0 })).toEqual(["duenos", "viejos"])
  })

  it("con todo en cero no se dibuja ningún atajo", () => {
    expect(atajosVisibles({ total: 12, duenos: 0, caidos: 0, viejos: 0, bajaron: 0 })).toEqual([])
  })

  it("respeta el orden del spec, no el de los números", () => {
    expect(atajosVisibles({ total: 9, duenos: 2, caidos: 5, viejos: 1, bajaron: 3 })).toEqual(["duenos", "caidos", "viejos", "bajaron"])
    expect(SENALES.map((s) => s.clave)).toEqual(["duenos", "caidos", "viejos", "bajaron"])
  })
})

describe("senalesDe", () => {
  it("un aviso sin nada especial no tiene señales", () => {
    expect(senalesDe(base)).toEqual([])
  })

  it("dueño directo, caído, viejo y con baja de precio, todas juntas", () => {
    const f: FilaAviso = { ...base, es_dueno_directo: true, estado: "caido", caido_en: "2026-09-01T00:00:00Z", dias_publicado: 200, variacion_precio_pct: "-8.5" }
    expect(senalesDe(f)).toEqual(["duenos", "caidos", "viejos", "bajaron"])
  })

  it("120 días justos NO es «lleva mucho publicado»; 121 sí", () => {
    expect(senalesDe({ ...base, dias_publicado: 120 })).toEqual([])
    expect(senalesDe({ ...base, dias_publicado: 121 })).toEqual(["viejos"])
  })

  it("una SUBA de precio no es señal de captación", () => {
    expect(senalesDe({ ...base, variacion_precio_pct: "7" })).toEqual([])
  })
})

describe("armarAviso", () => {
  it("pasa la foto por el proxy y normaliza los números", () => {
    const a = armarAviso(base)
    expect(a.foto?.startsWith("/api/")).toBe(true)
    expect(a.precio_usd).toBe(185000)
    expect(a.m2).toBe(78)
    expect(a.publicador).toBe("Inmobiliaria X")
  })

  it("sin foto queda en null, no en una cadena rota", () => {
    expect(armarAviso({ ...base, foto_portada: null }).foto).toBeNull()
  })

  it("sin título, el aviso se nombra por su dirección", () => {
    expect(armarAviso({ ...base, titulo: null }).titulo).toBe("Conde 900")
    expect(armarAviso({ ...base, titulo: null, direccion: null }).titulo).toBe("Sin título")
  })

  it("un precio que no es número queda en null (la pantalla no muestra NaN)", () => {
    expect(armarAviso({ ...base, precio_usd: null }).precio_usd).toBeNull()
    expect(armarAviso({ ...base, precio_usd: "a consultar" }).precio_usd).toBeNull()
  })

  it("60 por página", () => {
    expect(POR_PAGINA).toBe(60)
  })

  // mercado_avisos la puebla un crawler leyendo portales de terceros, no un humano de confianza
  // (mismo criterio que la allowlist de lib/acm/fotos-url.ts): una URL hostil colada en la fila
  // no puede llegar intacta a un href o un src del navegador del asesor.
  it("un url_publica javascript: no llega al href: queda en null", () => {
    expect(armarAviso({ ...base, url_publica: "javascript:alert(1)" }).url_publica).toBeNull()
  })

  it("un foto_portada data: no llega al src: queda en null", () => {
    expect(armarAviso({ ...base, foto_portada: "data:text/html,<script>alert(1)</script>" }).foto).toBeNull()
  })

  it("un aviso normal (https) sale sin tocar", () => {
    const a = armarAviso(base)
    expect(a.url_publica).toBe("https://www.zonaprop.com.ar/x-123.html")
  })

  it("la foto de la red, ya proxied, sale sin tocar", () => {
    const a = armarAviso(base)
    expect(a.foto).toBe(`/api/foto-red?u=${encodeURIComponent("https://imgar.zonapropcdn.com/avisos/1/x.jpg")}`)
  })

  // El try/catch de urlPublicaSegura es lo único que evita un 500 en todo el endpoint si a
  // mercado_avisos le llega basura en vez de una URL: estos tres casos tienen que volver null
  // sin tirar, nunca reventar armarAviso.
  it("una cadena que no es URL, vacía, o protocol-relative queda en null sin tirar", () => {
    expect(armarAviso({ ...base, url_publica: "no-es-una-url" }).url_publica).toBeNull()
    expect(armarAviso({ ...base, url_publica: "" }).url_publica).toBeNull()
    expect(armarAviso({ ...base, url_publica: "//evil.com" }).url_publica).toBeNull()
  })

  // El chequeo de la foto es contra RUTA_FOTO_RED exacto, no startsWith("/api/") genérico: sin
  // eso, un foto_portada como "/api/../../x" (que el navegador resuelve a "/x") colaba porque
  // "empezaba" con /api/, forzando un GET same-origin con las cookies del asesor.
  it("una foto que imita nuestra ruta con path traversal no cuela: no es RUTA_FOTO_RED real", () => {
    expect(armarAviso({ ...base, foto_portada: "/api/../../x" }).foto).toBeNull()
  })
})
