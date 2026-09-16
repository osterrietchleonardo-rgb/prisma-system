import { describe, it, expect } from "vitest"
import {
  LIMITES,
  esFichaDePropiedad,
  esIpInterna,
  htmlATexto,
  linksDeHtml,
  normalizarSitio,
  partirTexto,
  rastrearSitio,
  revisarUrl,
  urlsDeSitemap,
} from "./rastreo"

describe("normalizarSitio: lo que escribe el director puede venir de cualquier forma", () => {
  it("acepta con y sin https, con y sin www, y con barra final", () => {
    for (const entrada of ["vakdor.com", "https://vakdor.com/", "http://www.vakdor.com", "VAKDOR.COM/"]) {
      const s = normalizarSitio(entrada)
      expect(s, entrada).not.toBeNull()
      expect(s!.origen).toBe("https://vakdor.com/")
      // el dominio y el www quedan permitidos: son el mismo sitio
      expect(s!.dominios).toEqual(["vakdor.com", "www.vakdor.com"])
    }
  })
  it("rechaza lo que no es un sitio", () => {
    for (const malo of ["", "no es una url", "javascript:alert(1)", "file:///etc/passwd", "ftp://vakdor.com"])
      expect(normalizarSitio(malo), malo).toBeNull()
  })
})

describe("revisarUrl: el guardia del rastreo", () => {
  const dominios = ["vakdor.com", "www.vakdor.com"]
  const ok = (u: string) => revisarUrl(u, dominios).ok

  it("dentro del dominio declarado, sí", () => {
    expect(ok("https://vakdor.com/servicios")).toBe(true)
    expect(ok("https://www.vakdor.com/nosotros?ref=1")).toBe(true)
  })
  it("otro dominio, no (aunque se le parezca)", () => {
    for (const u of ["https://otro.com/x", "https://vakdor.com.ar/x", "https://malvakdor.com/x"])
      expect(ok(u), u).toBe(false)
  })
  it("solo http y https", () => {
    for (const u of ["file:///etc/passwd", "ftp://vakdor.com/x", "javascript:alert(1)"])
      expect(ok(u), u).toBe(false)
  })
  it("los archivos que no son páginas se saltean", () => {
    for (const u of ["https://vakdor.com/ficha.pdf", "https://vakdor.com/foto.JPG", "https://vakdor.com/video.mp4", "https://vakdor.com/hoja.xlsx"])
      expect(ok(u), u).toBe(false)
    expect(ok("https://vakdor.com/servicios.html")).toBe(true)
  })
  it("dice POR QUÉ rechaza, para poder mostrarlo", () => {
    expect(revisarUrl("ftp://vakdor.com", dominios)).toMatchObject({ ok: false, motivo: "esquema" })
    expect(revisarUrl("https://otro.com", dominios)).toMatchObject({ ok: false, motivo: "dominio" })
    expect(revisarUrl("https://vakdor.com/a.pdf", dominios)).toMatchObject({ ok: false, motivo: "extension" })
    expect(revisarUrl("https://vakdor.com/propiedad/123-depto", dominios)).toMatchObject({ ok: false, motivo: "ficha" })
  })
})

describe("esFichaDePropiedad: las fichas sueltas no entran, la cartera es mejor fuente", () => {
  it("deja afuera la ficha de una propiedad", () => {
    for (const u of [
      "https://central.com/propiedad/1234-departamento-en-venta",
      "https://central.com/propiedades/45-casa-city-bell",
      "https://central.com/inmueble/98/ficha",
      "https://central.com/emprendimientos/torre-del-sol",
      "https://central.com/es/property/778899",
      "https://central.com/ficha/1122",
    ])
      expect(esFichaDePropiedad(u), u).toBe(true)
  })
  it("deja pasar las secciones, incluido el listado general", () => {
    for (const u of [
      "https://central.com/",
      "https://central.com/propiedades",
      "https://central.com/propiedades/",
      "https://central.com/tasaciones",
      "https://central.com/sumate-al-equipo",
      "https://central.com/nosotros",
      "https://central.com/blog/como-vender-tu-casa",
      "https://central.com/venta/departamentos/la-plata",
    ])
      expect(esFichaDePropiedad(u), u).toBe(false)
  })
})

describe("esIpInterna: que nadie use el rastreo para mirar adentro de nuestra red", () => {
  it("bloquea las direcciones de la red privada y de la propia máquina", () => {
    for (const ip of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "192.168.0.10", "172.16.5.4", "172.31.255.254",
                      "169.254.169.254", "100.64.0.1", "::1", "fc00::1", "fe80::1"])
      expect(esIpInterna(ip), ip).toBe(true)
  })
  it("deja pasar una dirección de internet", () => {
    for (const ip of ["190.2.3.4", "8.8.8.8", "172.32.0.1", "2800:3f0:4001::1"])
      expect(esIpInterna(ip), ip).toBe(false)
  })
})

describe("urlsDeSitemap", () => {
  it("lee un sitemap común", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://vakdor.com/</loc></url>
      <url><loc>https://vakdor.com/servicios</loc><lastmod>2026-09-01</lastmod></url></urlset>`
    expect(urlsDeSitemap(xml)).toEqual({ urls: ["https://vakdor.com/", "https://vakdor.com/servicios"], sitemaps: [] })
  })
  it("lee un índice de sitemaps", () => {
    const xml = `<sitemapindex><sitemap><loc>https://vakdor.com/sitemap-1.xml</loc></sitemap>
      <sitemap><loc>https://vakdor.com/sitemap-2.xml</loc></sitemap></sitemapindex>`
    expect(urlsDeSitemap(xml)).toEqual({ urls: [], sitemaps: ["https://vakdor.com/sitemap-1.xml", "https://vakdor.com/sitemap-2.xml"] })
  })
  it("un XML roto no rompe: devuelve vacío", () => {
    expect(urlsDeSitemap("<html>no soy un sitemap</html>")).toEqual({ urls: [], sitemaps: [] })
  })
})

describe("linksDeHtml", () => {
  const base = "https://vakdor.com/servicios"
  it("resuelve relativos, absolutos y sin protocolo, y no repite", () => {
    const html = `<a href="/tasaciones">t</a><a href="https://vakdor.com/nosotros">n</a>
      <a href="//www.vakdor.com/contacto">c</a><a href="/tasaciones">otra vez</a>`
    expect(linksDeHtml(html, base)).toEqual([
      "https://vakdor.com/tasaciones",
      "https://vakdor.com/nosotros",
      "https://www.vakdor.com/contacto",
    ])
  })
  it("ignora anclas, teléfonos, correos y javascript", () => {
    const html = `<a href="#abajo">a</a><a href="mailto:hola@vakdor.com">m</a>
      <a href="tel:+5491122334455">t</a><a href="javascript:void(0)">j</a>`
    expect(linksDeHtml(html, base)).toEqual([])
  })
  it("saca el ancla de la url: la misma página no se lee dos veces", () => {
    expect(linksDeHtml('<a href="/nosotros#equipo">x</a>', base)).toEqual(["https://vakdor.com/nosotros"])
  })
})

describe("htmlATexto", () => {
  it("saca el título y el texto visible, sin scripts ni estilos", () => {
    const html = `<html><head><title> Vakdor · Servicios </title><style>.a{color:red}</style></head>
      <body><script>var x = "no soy texto"</script><nav>Inicio Contacto</nav>
      <h1>Tasaciones</h1><p>Valuamos tu propiedad&nbsp;en 48&nbsp;horas.</p></body></html>`
    const r = htmlATexto(html)
    expect(r.titulo).toBe("Vakdor · Servicios")
    expect(r.texto).toContain("Tasaciones")
    expect(r.texto).toContain("Valuamos tu propiedad en 48 horas.")
    expect(r.texto).not.toContain("no soy texto")
    expect(r.texto).not.toContain("color:red")
  })
  it("sin título, cadena vacía; nunca explota", () => {
    expect(htmlATexto("<p>hola</p>").titulo).toBe("")
    expect(htmlATexto("").texto).toBe("")
  })
})

describe("partirTexto", () => {
  it("un texto corto es un solo pedazo", () => {
    expect(partirTexto("hola", 100)).toEqual(["hola"])
  })
  it("parte por espacios, sin pasarse del tope y sin pedazos vacíos", () => {
    const largo = Array.from({ length: 300 }, (_, i) => `palabra${i}`).join(" ")
    const partes = partirTexto(largo, 500)
    expect(partes.length).toBeGreaterThan(1)
    for (const p of partes) {
      expect(p.length).toBeLessThanOrEqual(500)
      expect(p.trim()).not.toBe("")
    }
    // no se pierde nada por el camino
    expect(partes.join(" ").split(/\s+/).length).toBe(300)
  })
})

describe("rastrearSitio", () => {
  const paginas: Record<string, string> = {
    "https://vakdor.com/sitemap.xml": `<urlset><url><loc>https://vakdor.com/</loc></url>
      <url><loc>https://vakdor.com/servicios</loc></url></urlset>`,
    "https://vakdor.com/": `<html><head><title>Inicio</title></head><body><h1>Inmobiliaria</h1>
      <a href="/nosotros">nosotros</a></body></html>`,
    "https://vakdor.com/servicios": `<html><head><title>Servicios</title></head><body>Tasamos y vendemos.</body></html>`,
    "https://vakdor.com/nosotros": `<html><head><title>Nosotros</title></head><body>Somos un equipo.</body></html>`,
  }
  const fetchFalso = (async (u: string | URL) => {
    const url = String(u)
    if (!(url in paginas)) return { ok: false, status: 404, headers: new Headers(), text: async () => "" }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": url.endsWith(".xml") ? "application/xml" : "text/html" }),
      text: async () => paginas[url],
    }
  }) as unknown as typeof fetch
  const resolverFalso = async () => ["190.2.3.4"]
  const opciones = (extra: Record<string, unknown> = {}) => ({
    sitio: "vakdor.com", fetchFn: fetchFalso, resolver: resolverFalso, ...extra,
  })

  it("usa el sitemap cuando existe y guarda título, link y texto de cada página", async () => {
    const r = await rastrearSitio(opciones())
    expect(r.motivo).toBeNull()
    expect(r.paginas.map((p) => p.url)).toEqual(["https://vakdor.com/", "https://vakdor.com/servicios"])
    expect(r.paginas[1]).toMatchObject({ titulo: "Servicios", orden: 0 })
    expect(r.paginas[1].texto).toContain("Tasamos y vendemos")
    expect(r.desdeSitemap).toBe(true)
  })

  it("sin sitemap, recorre desde la home siguiendo los links del mismo dominio", async () => {
    const sinSitemap = { ...paginas }
    delete sinSitemap["https://vakdor.com/sitemap.xml"]
    const fetchSin = (async (u: string | URL) => {
      const url = String(u)
      if (!(url in sinSitemap)) return { ok: false, status: 404, headers: new Headers(), text: async () => "" }
      return { ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }), text: async () => sinSitemap[url] }
    }) as unknown as typeof fetch
    const r = await rastrearSitio(opciones({ fetchFn: fetchSin }))
    expect(r.desdeSitemap).toBe(false)
    expect(r.paginas.map((p) => p.url)).toEqual(["https://vakdor.com/", "https://vakdor.com/nosotros"])
  })

  it("respeta el tope de páginas", async () => {
    const r = await rastrearSitio(opciones({ limites: { ...LIMITES, maxPaginas: 1 } }))
    expect(r.paginas).toHaveLength(1)
    expect(r.truncado).toBe(true)
  })

  it("en un sitio de inmobiliaria, las fichas no se comen el cupo: primero las secciones", async () => {
    // Un sitemap como el de verdad: 3 secciones perdidas entre 200 fichas de propiedades.
    const fichas = Array.from({ length: 200 }, (_, i) => `https://vakdor.com/propiedad/${i}-departamento`)
    const secciones = ["https://vakdor.com/", "https://vakdor.com/tasaciones", "https://vakdor.com/blog/vender-mejor"]
    const todas = [...fichas.slice(0, 100), ...secciones, ...fichas.slice(100)]
    const fetchSitio = (async (u: string | URL) => {
      const url = String(u)
      const cuerpo = url.endsWith("sitemap.xml")
        ? `<urlset>${todas.map((x) => `<url><loc>${x}</loc></url>`).join("")}</urlset>`
        : `<html><head><title>${url}</title></head><body>texto de ${url}</body></html>`
      return { ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }), text: async () => cuerpo }
    }) as unknown as typeof fetch

    const r = await rastrearSitio(opciones({ fetchFn: fetchSitio, limites: { ...LIMITES, maxPaginas: 5 } }))
    // ninguna ficha, y las secciones ordenadas de la más general a la más profunda
    expect(r.paginas.map((p) => p.url)).toEqual(secciones)
    expect(r.paginas.some((p) => p.url.includes("/propiedad/"))).toBe(false)
  })

  it("si el sitio apunta a una dirección interna, no se lee NADA", async () => {
    const r = await rastrearSitio(opciones({ resolver: async () => ["127.0.0.1"] }))
    expect(r.paginas).toHaveLength(0)
    expect(r.motivo).toBe("interna")
  })

  it("si no se puede leer ni la home, lo dice en vez de devolver vacío en silencio", async () => {
    const fetchMuerto = (async () => ({ ok: false, status: 500, headers: new Headers(), text: async () => "" })) as unknown as typeof fetch
    const r = await rastrearSitio(opciones({ fetchFn: fetchMuerto }))
    expect(r.paginas).toHaveLength(0)
    expect(r.motivo).toBe("sin_respuesta")
  })

  it("una página enorme se parte en pedazos numerados", async () => {
    const enorme = "<html><head><title>Larga</title></head><body>" + "palabra ".repeat(3000) + "</body></html>"
    const fetchEnorme = (async (u: string | URL) => ({
      ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }),
      text: async () => (String(u).endsWith(".xml") ? `<urlset><url><loc>https://vakdor.com/larga</loc></url></urlset>` : enorme),
    })) as unknown as typeof fetch
    const r = await rastrearSitio(opciones({ fetchFn: fetchEnorme }))
    expect(r.paginas.length).toBeGreaterThan(1)
    expect(r.paginas.every((p) => p.url === "https://vakdor.com/larga")).toBe(true)
    expect(r.paginas.map((p) => p.orden)).toEqual(r.paginas.map((_, i) => i))
  })
})
