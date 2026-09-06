/**
 * El menú de la barra izquierda, para el director y para el asesor.
 *
 * Una sola lista para los dos roles: cada renglón dice cómo se llama y adónde
 * apunta para cada uno, y a qué grupo pertenece. Los nombres y las direcciones
 * son EXACTAMENTE los que había antes de agrupar (lo vigila `menu.test.ts`):
 * lo único que se agregó son los títulos de grupo y el orden.
 *
 * Reglas:
 * - Un renglón sin definición para un rol no existe para ese rol.
 * - Un grupo que queda sin renglones no se dibuja.
 * - Ningún icono se repite dentro de un mismo rol.
 */
import type { LucideIcon } from "lucide-react"
import {
  Home,
  Calendar,
  Inbox,
  LayoutGrid,
  Users,
  MessageCircle,
  Building,
  Search,
  Scale,
  BarChart2,
  Megaphone,
  FileSignature,
  ClipboardCheck,
  UserCircle,
  TrendingUp,
  GraduationCap,
  BookOpen,
  Lightbulb,
  Settings,
} from "lucide-react"

export type Rol = "director" | "asesor"

export interface NavItem {
  id: string
  name: string
  href: string
  icon: LucideIcon
}

export interface NavGrupo {
  id: string
  titulo: string
  items: NavItem[]
}

interface PorRol {
  name: string
  href: string
}

interface Renglon {
  id: string
  icon: LucideIcon
  /** Grupo al que pertenece; puede ser distinto por rol (ej. Tracking). */
  grupo: string | Record<Rol, string>
  director?: PorRol
  asesor?: PorRol
}

export const GRUPOS: ReadonlyArray<{ id: string; titulo: string }> = [
  { id: "mi-dia",          titulo: "Mi día" },
  { id: "bandejas",        titulo: "Bandejas" },
  { id: "contactos",       titulo: "Contactos" },
  { id: "propiedades",     titulo: "Propiedades" },
  { id: "herramientas-ia", titulo: "Herramientas IA" },
  { id: "mi-equipo",       titulo: "Mi equipo" },
  { id: "ayuda",           titulo: "Ayuda" },
]

// El orden de esta lista es el orden de los renglones dentro de cada grupo.
const RENGLONES: Renglon[] = [
  // -- Mi día ---------------------------------------------------------------
  { id: "dashboard", icon: Home, grupo: "mi-dia",
    director: { name: "Dashboard",    href: "/director/dashboard" },
    asesor:   { name: "Mi Dashboard", href: "/asesor/dashboard" } },
  { id: "calendario", icon: Calendar, grupo: "mi-dia",
    director: { name: "Calendario",    href: "/director/calendario" },
    asesor:   { name: "Mi Calendario", href: "/asesor/calendario" } },

  // -- Bandejas -------------------------------------------------------------
  { id: "bandeja-whatsapp", icon: Inbox, grupo: "bandejas",
    director: { name: "Asesor IA WhatsApp", href: "/director/asesor-ia-whatsapp" },
    asesor:   { name: "WhatsApp Bandeja",   href: "/asesor/whatsapp" } },

  // -- Contactos ------------------------------------------------------------
  { id: "pipeline", icon: LayoutGrid, grupo: "contactos",
    director: { name: "Pipeline",    href: "/director/pipeline" },
    asesor:   { name: "Mi Pipeline", href: "/asesor/pipeline" } },
  { id: "leads-tokko", icon: Users, grupo: "contactos",
    director: { name: "Leads Tokko", href: "/director/leads" },
    asesor:   { name: "Leads Tokko", href: "/asesor/leads" } },
  { id: "leads-whatsapp", icon: MessageCircle, grupo: "contactos",
    director: { name: "Leads WhatsApp", href: "/director/leads-whatsapp" },
    asesor:   { name: "Leads WhatsApp", href: "/asesor/leads-whatsapp" } },

  // -- Propiedades ----------------------------------------------------------
  { id: "propiedades", icon: Building, grupo: "propiedades",
    director: { name: "Propiedades",     href: "/director/propiedades" },
    asesor:   { name: "Mis Propiedades", href: "/asesor/propiedades" } },
  { id: "buscador-ia", icon: Search, grupo: "propiedades",
    director: { name: "Buscador IA", href: "/director/consultor" },
    asesor:   { name: "Buscador IA", href: "/asesor/consultor-ia" } },
  { id: "acm", icon: Scale, grupo: "propiedades",
    director: { name: "ACM", href: "/director/acm" },
    asesor:   { name: "ACM", href: "/asesor/acm" } },
  { id: "mercado", icon: BarChart2, grupo: "propiedades",
    director: { name: "Pulso de Mercado", href: "/director/mercado" },
    asesor:   { name: "Pulso de Mercado", href: "/asesor/mercado" } },

  // -- Herramientas IA ------------------------------------------------------
  { id: "marketing-ia", icon: Megaphone, grupo: "herramientas-ia",
    director: { name: "Marketing IA", href: "/director/marketing-ia" },
    asesor:   { name: "Marketing IA", href: "/asesor/marketing-ia" } },
  { id: "contratos-ia", icon: FileSignature, grupo: "herramientas-ia",
    director: { name: "Contratos IA", href: "/director/contratos-ia" },
    asesor:   { name: "Contratos IA", href: "/asesor/contratos-ia" } },

  // -- Mi equipo (el asesor no tiene equipo: su Tracking va a "Mi día") -----
  { id: "equipo", icon: ClipboardCheck, grupo: "mi-equipo",
    director: { name: "Equipo", href: "/director/aprobaciones" } },
  { id: "asesores", icon: UserCircle, grupo: "mi-equipo",
    director: { name: "Asesores", href: "/director/asesores" } },
  { id: "tracking", icon: TrendingUp, grupo: { director: "mi-equipo", asesor: "mi-dia" },
    director: { name: "Tracking Performance", href: "/director/tracking-performance" },
    asesor:   { name: "Tracking Performance", href: "/asesor/tracking-performance" } },

  // -- Ayuda ----------------------------------------------------------------
  { id: "tutor-ia", icon: GraduationCap, grupo: "ayuda",
    director: { name: "Tutor IA", href: "/director/tutor" },
    asesor:   { name: "Tutor IA", href: "/asesor/tutor-ia" } },
  { id: "documentos", icon: BookOpen, grupo: "ayuda",
    director: { name: "Documentos", href: "/director/documentos" },
    asesor:   { name: "Biblioteca", href: "/asesor/documentos" } },
  { id: "sugerencias", icon: Lightbulb, grupo: "ayuda",
    director: { name: "Sugerencias", href: "/director/feedback" },
    asesor:   { name: "Sugerencias", href: "/asesor/feedback" } },
]

// Abajo de todo, fuera de los grupos, pegado a "Cerrar Sesión".
const PIE: Renglon[] = [
  { id: "configuracion", icon: Settings, grupo: "pie",
    director: { name: "Configuración", href: "/director/configuracion" },
    asesor:   { name: "Configuración", href: "/asesor/configuracion" } },
]

function grupoDelRenglon(r: Renglon, rol: Rol): string {
  return typeof r.grupo === "string" ? r.grupo : r.grupo[rol]
}

function aItem(r: Renglon, rol: Rol): NavItem | null {
  const def = r[rol]
  return def ? { id: r.id, name: def.name, href: def.href, icon: r.icon } : null
}

/** Los grupos del menú para un rol, sin los grupos vacíos. */
export function menuPara(rol: Rol): NavGrupo[] {
  return GRUPOS.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    items: RENGLONES.filter((r) => grupoDelRenglon(r, rol) === g.id)
      .map((r) => aItem(r, rol))
      .filter((it): it is NavItem => it !== null),
  })).filter((g) => g.items.length > 0)
}

/** Los renglones del pie (hoy: Configuración). */
export function pieMenuPara(rol: Rol): NavItem[] {
  return PIE.map((r) => aItem(r, rol)).filter((it): it is NavItem => it !== null)
}

/** La misma regla de "activo" que tenía la barra: la ruta exacta o una subruta. */
export function esRutaActiva(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/")
}

/** El id del grupo que contiene la ruta activa; null si es el pie u otra cosa. */
export function grupoActivo(rol: Rol, pathname: string): string | null {
  for (const g of menuPara(rol)) {
    if (g.items.some((it) => esRutaActiva(it.href, pathname))) return g.id
  }
  return null
}
