import { describe, it, expect } from "vitest"
import { GRUPOS, grupoActivo, menuPara, pieMenuPara, type Rol } from "./menu"

/**
 * Copiado TAL CUAL de `components/director-sidebar.tsx` y
 * `components/asesor-sidebar.tsx` antes de agrupar el menú (main e0bba05).
 * El pedido fue "las mismas páginas, mismos nombres, mismas direcciones,
 * solo agrupadas": si este test se pone rojo, cambió algo que no debía.
 */
const DIRECTOR_ANTES = [
  { name: "Dashboard",            href: "/director/dashboard" },
  { name: "Pulso de Mercado",     href: "/director/mercado" },
  { name: "Pipeline",             href: "/director/pipeline" },
  { name: "Propiedades",          href: "/director/propiedades" },
  { name: "Tracking Performance", href: "/director/tracking-performance" },
  { name: "Leads Tokko",          href: "/director/leads" },
  { name: "Asesor IA WhatsApp",   href: "/director/asesor-ia-whatsapp" },
  { name: "Leads WhatsApp",       href: "/director/leads-whatsapp" },
  { name: "Equipo",               href: "/director/aprobaciones" },
  { name: "Marketing IA",         href: "/director/marketing-ia" },
  { name: "Contratos IA",         href: "/director/contratos-ia" },
  { name: "Asesores",             href: "/director/asesores" },
  { name: "Documentos",           href: "/director/documentos" },
  { name: "ACM",                  href: "/director/acm" },
  { name: "Calendario",           href: "/director/calendario" },
  { name: "Tutor IA",             href: "/director/tutor" },
  { name: "Buscador IA",          href: "/director/consultor" },
  { name: "Configuración",        href: "/director/configuracion" },
  { name: "Sugerencias",          href: "/director/feedback" },
]

const ASESOR_ANTES = [
  { name: "Mi Dashboard",         href: "/asesor/dashboard" },
  { name: "Pulso de Mercado",     href: "/asesor/mercado" },
  { name: "Mi Pipeline",          href: "/asesor/pipeline" },
  { name: "Mis Propiedades",      href: "/asesor/propiedades" },
  { name: "Tracking Performance", href: "/asesor/tracking-performance" },
  { name: "Leads Tokko",          href: "/asesor/leads" },
  { name: "WhatsApp Bandeja",     href: "/asesor/whatsapp" },
  { name: "Leads WhatsApp",       href: "/asesor/leads-whatsapp" },
  { name: "Marketing IA",         href: "/asesor/marketing-ia" },
  { name: "Contratos IA",         href: "/asesor/contratos-ia" },
  { name: "Mi Calendario",        href: "/asesor/calendario" },
  { name: "Tutor IA",             href: "/asesor/tutor-ia" },
  { name: "Buscador IA",          href: "/asesor/consultor-ia" },
  { name: "ACM",                  href: "/asesor/acm" },
  { name: "Biblioteca",           href: "/asesor/documentos" },
  { name: "Configuración",        href: "/asesor/configuracion" },
  { name: "Sugerencias",          href: "/asesor/feedback" },
]

/** Todos los renglones que ve un rol (grupos + pie), sin importar el orden. */
function planos(rol: Rol) {
  return [...menuPara(rol).flatMap((g) => g.items), ...pieMenuPara(rol)]
}
const clave = (x: { name: string; href: string }) => `${x.name} -> ${x.href}`

describe("el menú agrupado no cambia ni un nombre ni una dirección", () => {
  it.each<[Rol, typeof DIRECTOR_ANTES]>([
    ["director", DIRECTOR_ANTES],
    ["asesor", ASESOR_ANTES],
  ])("%s: exactamente los mismos renglones que antes", (rol, antes) => {
    const ahora = planos(rol).map(clave).sort()
    expect(ahora).toEqual(antes.map(clave).sort())
  })

  it("director: 19 renglones; asesor: 17", () => {
    expect(planos("director")).toHaveLength(19)
    expect(planos("asesor")).toHaveLength(17)
  })
})

describe("iconos", () => {
  it.each<Rol>(["director", "asesor"])("%s: ningún icono se repite", (rol) => {
    const iconos = planos(rol).map((it) => it.icon)
    expect(new Set(iconos).size).toBe(iconos.length)
  })
})

describe("grupos", () => {
  it("director: los 7 grupos, en el orden acordado", () => {
    expect(menuPara("director").map((g) => g.titulo)).toEqual(
      ["Mi día", "Bandejas", "Contactos", "Propiedades", "Herramientas IA", "Mi equipo", "Ayuda"],
    )
  })

  it("asesor: los mismos grupos menos 'Mi equipo', y Tracking se le va a 'Mi día'", () => {
    const grupos = menuPara("asesor")
    expect(grupos.map((g) => g.titulo)).toEqual(
      ["Mi día", "Bandejas", "Contactos", "Propiedades", "Herramientas IA", "Ayuda"],
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
    expect(porGrupo["propiedades"]).toEqual(["Propiedades", "Buscador IA", "ACM", "Pulso de Mercado"])
    expect(porGrupo["mi-equipo"]).toEqual(["Equipo", "Asesores", "Tracking Performance"])
    expect(porGrupo["ayuda"]).toEqual(["Tutor IA", "Documentos", "Sugerencias"])
  })
})

describe("grupoActivo", () => {
  it("encuentra el grupo de la ruta exacta y de sus subrutas", () => {
    expect(grupoActivo("director", "/director/leads-whatsapp")).toBe("contactos")
    expect(grupoActivo("director", "/director/leads/abc-123")).toBe("contactos")
    expect(grupoActivo("director", "/director/aprobaciones")).toBe("mi-equipo")
    expect(grupoActivo("asesor", "/asesor/tracking-performance")).toBe("mi-dia")
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
