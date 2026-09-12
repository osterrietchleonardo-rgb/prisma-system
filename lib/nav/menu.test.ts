import { describe, it, expect } from "vitest"
import { GRUPOS, esRutaActiva, grupoActivo, menuPara, pieMenuPara, type Rol } from "./menu"
import { CONTRATOS_IA_AGENCIA_DESHABILITADA } from "@/lib/access/contratos-ia"

/**
 * La lista completa de renglones por rol, nombre y dirección. Si este test se
 * pone rojo, cambió una página del menú, y eso tiene que ser a propósito.
 *
 * Historia: el menú se agrupó en 7 bloques sin cambiar nombres ni direcciones
 * (main e0bba05). El 12/9/2026 las solapas de "Asesor IA WhatsApp" y de
 * "Marketing IA" pasaron a ser páginas propias, en dos grupos nuevos: «Difusión»
 * y «Marketing IA» (que reemplaza a «Herramientas IA»). «Contratos IA» quedó solo
 * en «Documentación». Cada rol ve como páginas exactamente las solapas que veía.
 */
const DIRECTOR = [
  { name: "Dashboard",              href: "/director/dashboard" },
  { name: "Calendario",             href: "/director/calendario" },
  { name: "Asesor IA WhatsApp",     href: "/director/asesor-ia-whatsapp" },
  { name: "Pipeline",               href: "/director/pipeline" },
  { name: "Leads Tokko",            href: "/director/leads" },
  { name: "Leads WhatsApp",         href: "/director/leads-whatsapp" },
  { name: "Contactos",              href: "/director/difusion/contactos" },
  { name: "Plantillas",             href: "/director/difusion/plantillas" },
  { name: "Campañas",               href: "/director/difusion/campanas" },
  { name: "Configuración IA",       href: "/director/difusion/configuracion-ia" },
  { name: "Propiedades",            href: "/director/propiedades" },
  { name: "Buscador IA",            href: "/director/consultor" },
  { name: "ACM",                    href: "/director/acm" },
  { name: "Pulso de Mercado",       href: "/director/mercado" },
  { name: "Crear Anuncio",          href: "/director/marketing-ia/crear-anuncio" },
  { name: "HomeStaging",            href: "/director/marketing-ia/homestaging" },
  { name: "Clientes Ideales (IPC)", href: "/director/marketing-ia/clientes-ideales" },
  { name: "Mi ADN",                 href: "/director/marketing-ia/mi-adn" },
  { name: "Historial / Galería",    href: "/director/marketing-ia/historial" },
  { name: "Guía Mágica",            href: "/director/marketing-ia/guia-magica" },
  { name: "Configuración IA",       href: "/director/marketing-ia/configuracion-ia" },
  { name: "Contratos IA",           href: "/director/contratos-ia" },
  { name: "Equipo",                 href: "/director/aprobaciones" },
  { name: "Asesores",               href: "/director/asesores" },
  { name: "Tracking Performance",   href: "/director/tracking-performance" },
  { name: "Tutor IA",               href: "/director/tutor" },
  { name: "Documentos",             href: "/director/documentos" },
  { name: "Sugerencias",            href: "/director/feedback" },
  { name: "Configuración",          href: "/director/configuracion" },
]

// El asesor no tenía Plantillas, Campañas ni Configuración IA en WhatsApp, ni la
// Configuración IA de Marketing: no las ve como páginas tampoco.
const ASESOR = [
  { name: "Mi Dashboard",           href: "/asesor/dashboard" },
  { name: "Mi Calendario",          href: "/asesor/calendario" },
  { name: "Tracking Performance",   href: "/asesor/tracking-performance" },
  { name: "WhatsApp Bandeja",       href: "/asesor/whatsapp" },
  { name: "Mi Pipeline",            href: "/asesor/pipeline" },
  { name: "Leads Tokko",            href: "/asesor/leads" },
  { name: "Leads WhatsApp",         href: "/asesor/leads-whatsapp" },
  { name: "Contactos",              href: "/asesor/difusion/contactos" },
  { name: "Mis Propiedades",        href: "/asesor/propiedades" },
  { name: "Buscador IA",            href: "/asesor/consultor-ia" },
  { name: "ACM",                    href: "/asesor/acm" },
  { name: "Pulso de Mercado",       href: "/asesor/mercado" },
  { name: "Crear Anuncio",          href: "/asesor/marketing-ia/crear-anuncio" },
  { name: "HomeStaging",            href: "/asesor/marketing-ia/homestaging" },
  { name: "Clientes Ideales (IPC)", href: "/asesor/marketing-ia/clientes-ideales" },
  { name: "Mi ADN",                 href: "/asesor/marketing-ia/mi-adn" },
  { name: "Mis Generaciones",       href: "/asesor/marketing-ia/mis-generaciones" },
  { name: "Guía Mágica",            href: "/asesor/marketing-ia/guia-magica" },
  { name: "Contratos IA",           href: "/asesor/contratos-ia" },
  { name: "Tutor IA",               href: "/asesor/tutor-ia" },
  { name: "Biblioteca",             href: "/asesor/documentos" },
  { name: "Sugerencias",            href: "/asesor/feedback" },
  { name: "Configuración",          href: "/asesor/configuracion" },
]

/** Todos los renglones que ve un rol (grupos + pie), sin importar el orden. */
function planos(rol: Rol, agencyId?: string) {
  return [...menuPara(rol, { agencyId }).flatMap((g) => g.items), ...pieMenuPara(rol)]
}
const clave = (x: { name: string; href: string }) => `${x.name} -> ${x.href}`

describe("las páginas del menú, por nombre y dirección", () => {
  it.each<[Rol, typeof DIRECTOR]>([
    ["director", DIRECTOR],
    ["asesor", ASESOR],
  ])("%s: exactamente estos renglones", (rol, esperados) => {
    const ahora = planos(rol).map(clave).sort()
    expect(ahora).toEqual(esperados.map(clave).sort())
  })

  it("director: 29 renglones; asesor: 23", () => {
    expect(planos("director")).toHaveLength(29)
    expect(planos("asesor")).toHaveLength(23)
  })

  it("las direcciones viejas de las páginas con solapas ya no son renglones (redirigen)", () => {
    const hrefs = new Set([...planos("director"), ...planos("asesor")].map((it) => it.href))
    expect(hrefs.has("/director/marketing-ia")).toBe(false)
    expect(hrefs.has("/asesor/marketing-ia")).toBe(false)
  })
})

describe("iconos", () => {
  it.each<Rol>(["director", "asesor"])("%s: ningún icono se repite", (rol) => {
    const iconos = planos(rol).map((it) => it.icon)
    expect(new Set(iconos).size).toBe(iconos.length)
  })
})

describe("grupos", () => {
  it("director: los 9 grupos, en el orden acordado", () => {
    expect(menuPara("director").map((g) => g.titulo)).toEqual(
      ["Mi día", "Bandejas", "Contactos", "Difusión", "Propiedades", "Marketing IA", "Documentación", "Mi equipo", "Ayuda"],
    )
  })

  it("asesor: los mismos grupos menos 'Mi equipo', y Tracking se le va a 'Mi día'", () => {
    const grupos = menuPara("asesor")
    expect(grupos.map((g) => g.titulo)).toEqual(
      ["Mi día", "Bandejas", "Contactos", "Difusión", "Propiedades", "Marketing IA", "Documentación", "Ayuda"],
    )
    const miDia = grupos.find((g) => g.id === "mi-dia")!
    expect(miDia.items.map((it) => it.name)).toEqual(["Mi Dashboard", "Mi Calendario", "Tracking Performance"])
  })

  it.each<Rol>(["director", "asesor"])("%s: ningún grupo vacío", (rol) => {
    for (const g of menuPara(rol)) expect(g.items.length).toBeGreaterThan(0)
  })

  it("todos los grupos dibujados existen en GRUPOS", () => {
    const ids = new Set(GRUPOS.map((g) => g.id))
    for (const rol of ["director", "asesor"] as Rol[]) {
      for (const g of menuPara(rol)) expect(ids.has(g.id)).toBe(true)
    }
  })

  it("el orden dentro de cada grupo es el acordado (director)", () => {
    const porGrupo = Object.fromEntries(menuPara("director").map((g) => [g.id, g.items.map((it) => it.name)]))
    expect(porGrupo["contactos"]).toEqual(["Pipeline", "Leads Tokko", "Leads WhatsApp"])
    expect(porGrupo["difusion"]).toEqual(["Contactos", "Plantillas", "Campañas", "Configuración IA"])
    expect(porGrupo["propiedades"]).toEqual(["Propiedades", "Buscador IA", "ACM", "Pulso de Mercado"])
    expect(porGrupo["marketing-ia"]).toEqual([
      "Crear Anuncio", "HomeStaging", "Clientes Ideales (IPC)", "Mi ADN", "Historial / Galería", "Guía Mágica", "Configuración IA",
    ])
    expect(porGrupo["documentacion"]).toEqual(["Contratos IA"])
    expect(porGrupo["mi-equipo"]).toEqual(["Equipo", "Asesores", "Tracking Performance"])
    expect(porGrupo["ayuda"]).toEqual(["Tutor IA", "Documentos", "Sugerencias"])
  })

  it("asesor: en Difusión solo Contactos, y en Marketing IA sin Configuración IA", () => {
    const porGrupo = Object.fromEntries(menuPara("asesor").map((g) => [g.id, g.items.map((it) => it.name)]))
    expect(porGrupo["difusion"]).toEqual(["Contactos"])
    expect(porGrupo["marketing-ia"]).toEqual([
      "Crear Anuncio", "HomeStaging", "Clientes Ideales (IPC)", "Mi ADN", "Mis Generaciones", "Guía Mágica",
    ])
  })
})

describe("Contratos IA en la agencia que lo tiene desactivado", () => {
  it.each<Rol>(["director", "asesor"])("%s: no ve Contratos IA ni el grupo Documentación", (rol) => {
    const grupos = menuPara(rol, { agencyId: CONTRATOS_IA_AGENCIA_DESHABILITADA })
    expect(grupos.map((g) => g.id)).not.toContain("documentacion")
    expect(planos(rol, CONTRATOS_IA_AGENCIA_DESHABILITADA).map((it) => it.name)).not.toContain("Contratos IA")
    // Y no se lleva nada más: son los mismos renglones menos ese.
    expect(planos(rol, CONTRATOS_IA_AGENCIA_DESHABILITADA)).toHaveLength(planos(rol).length - 1)
  })

  it("cualquier otra agencia lo sigue viendo", () => {
    expect(menuPara("director", { agencyId: "otra-agencia" }).map((g) => g.id)).toContain("documentacion")
    expect(menuPara("director").map((g) => g.id)).toContain("documentacion")
  })

  it("el grupo activo tampoco lo cuenta", () => {
    expect(grupoActivo("director", "/director/contratos-ia", CONTRATOS_IA_AGENCIA_DESHABILITADA)).toBeNull()
    expect(grupoActivo("director", "/director/contratos-ia")).toBe("documentacion")
  })
})

describe("grupoActivo", () => {
  it("encuentra el grupo de la ruta exacta y de sus subrutas", () => {
    expect(grupoActivo("director", "/director/leads-whatsapp")).toBe("contactos")
    expect(grupoActivo("director", "/director/leads/abc-123")).toBe("contactos")
    expect(grupoActivo("director", "/director/aprobaciones")).toBe("mi-equipo")
    expect(grupoActivo("asesor", "/asesor/tracking-performance")).toBe("mi-dia")
  })

  it("las páginas nuevas caen en su grupo", () => {
    expect(grupoActivo("director", "/director/difusion/campanas")).toBe("difusion")
    expect(grupoActivo("asesor", "/asesor/difusion/contactos")).toBe("difusion")
    expect(grupoActivo("director", "/director/marketing-ia/historial")).toBe("marketing-ia")
    expect(grupoActivo("asesor", "/asesor/marketing-ia/mis-generaciones")).toBe("marketing-ia")
    expect(grupoActivo("director", "/director/asesor-ia-whatsapp")).toBe("bandejas")
    expect(grupoActivo("asesor", "/asesor/whatsapp")).toBe("bandejas")
  })

  it("la bandeja de WhatsApp y las páginas de Difusión no se marcan activas entre sí", () => {
    // Difusión NO cuelga de /asesor-ia-whatsapp: si colgara, la regla de subruta
    // dejaría dos renglones en cobre a la vez.
    const todos = menuPara("director").flatMap((g) => g.items)
    const activosEn = (p: string) => todos.filter((it) => esRutaActiva(it.href, p)).map((it) => it.name)
    expect(activosEn("/director/difusion/contactos")).toEqual(["Contactos"])
    expect(activosEn("/director/asesor-ia-whatsapp")).toEqual(["Asesor IA WhatsApp"])
    expect(activosEn("/director/marketing-ia/configuracion-ia")).toEqual(["Configuración IA"])
  })

  it("los links que llegan por email o WhatsApp (ficha de un chat) caen en su grupo", () => {
    // El email de handoff de n8n manda a /asesor/leads-whatsapp/<id de conversación>.
    expect(grupoActivo("asesor", "/asesor/leads-whatsapp/8f2c1d3e-0000-4000-8000-000000000000")).toBe("contactos")
    expect(grupoActivo("director", "/director/leads-whatsapp/8f2c1d3e-0000-4000-8000-000000000000")).toBe("contactos")
    expect(grupoActivo("director", "/director/propiedades/123")).toBe("propiedades")
  })

  it("'/director/leads' NO marca activo a '/director/leads-whatsapp' ni al revés", () => {
    // La regla de subruta exige la barra: /leads/... sí, /leads-whatsapp no.
    const contactos = menuPara("director").find((g) => g.id === "contactos")!
    const activosEn = (pathname: string) =>
      contactos.items
        .filter((it) => pathname === it.href || pathname.startsWith(it.href + "/"))
        .map((it) => it.name)
    expect(activosEn("/director/leads-whatsapp")).toEqual(["Leads WhatsApp"])
    expect(activosEn("/director/leads")).toEqual(["Leads Tokko"])
  })

  it("el pie y las rutas desconocidas no tienen grupo", () => {
    expect(grupoActivo("director", "/director/configuracion")).toBeNull()
    expect(grupoActivo("director", "/director/algo-que-no-existe")).toBeNull()
  })
})
