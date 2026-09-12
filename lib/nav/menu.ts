/**
 * El menú de la barra izquierda, para el director y para el asesor.
 *
 * Una sola lista para los dos roles: cada renglón dice cómo se llama y adónde
 * apunta para cada uno, y a qué grupo pertenece. Lo vigila `menu.test.ts`: si
 * cambia un nombre o una dirección, el test se pone rojo a propósito.
 *
 * 12/9/2026: las solapas de "Asesor IA WhatsApp" (Contactos, Plantillas, Campañas,
 * Configuración IA) y las de "Marketing IA" pasaron a ser páginas propias, en los
 * grupos «Difusión» y «Marketing IA». Cada rol ve como páginas exactamente las
 * solapas que veía antes. «Contratos IA» quedó solo en «Documentación».
 *
 * Reglas:
 * - Un renglón sin definición para un rol no existe para ese rol.
 * - Un grupo que queda sin renglones no se dibuja.
 * - Ningún icono se repite dentro de un mismo rol.
 * - La agencia que tiene Contratos IA desactivado directamente no lo ve (ni al
 *   grupo, que queda vacío). Antes se mostraba gris con "Deshabilitada".
 */
import type { LucideIcon } from "lucide-react"
import {
  Home,
  Calendar,
  Inbox,
  LayoutGrid,
  Users,
  MessageCircle,
  BookUser,
  FileText,
  Megaphone,
  Bot,
  Building,
  Search,
  Scale,
  BarChart2,
  Sparkles,
  Camera,
  UserSearch,
  Briefcase,
  History,
  WandSparkles,
  SlidersHorizontal,
  FileSignature,
  ClipboardCheck,
  UserCircle,
  TrendingUp,
  GraduationCap,
  BookOpen,
  Lightbulb,
  Settings,
} from "lucide-react"
import { contratosIaDeshabilitado } from "@/lib/access/contratos-ia"
import { rutaMarketing } from "@/lib/marketing-ia/rutas"

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
  { id: "mi-dia",        titulo: "Mi día" },
  { id: "bandejas",      titulo: "Bandejas" },
  { id: "contactos",     titulo: "Contactos" },
  { id: "difusion",      titulo: "Difusión" },
  { id: "propiedades",   titulo: "Propiedades" },
  { id: "marketing-ia",  titulo: "Marketing IA" },
  { id: "documentacion", titulo: "Documentación" },
  { id: "mi-equipo",     titulo: "Mi equipo" },
  { id: "ayuda",         titulo: "Ayuda" },
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

  // -- Bandejas (solo el chat; lo demás de WhatsApp está en Difusión) -------
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

  // -- Difusión (las solapas de WhatsApp que no son el chat) ----------------
  // El asesor solo tenía Contactos (sin acciones de campaña); sigue igual.
  // No cuelgan de /asesor-ia-whatsapp a propósito: la regla de "activo" toma las
  // subrutas, y quedarían dos renglones en cobre a la vez.
  { id: "difusion-contactos", icon: BookUser, grupo: "difusion",
    director: { name: "Contactos", href: "/director/difusion/contactos" },
    asesor:   { name: "Contactos", href: "/asesor/difusion/contactos" } },
  { id: "difusion-plantillas", icon: FileText, grupo: "difusion",
    director: { name: "Plantillas", href: "/director/difusion/plantillas" } },
  { id: "difusion-campanas", icon: Megaphone, grupo: "difusion",
    director: { name: "Campañas", href: "/director/difusion/campanas" } },
  { id: "difusion-configuracion-ia", icon: Bot, grupo: "difusion",
    director: { name: "Configuración IA", href: "/director/difusion/configuracion-ia" } },

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

  // -- Marketing IA (antes "Herramientas IA" con una sola página con solapas) --
  { id: "mk-crear-anuncio", icon: Sparkles, grupo: "marketing-ia",
    director: { name: "Crear Anuncio", href: rutaMarketing("director", "crear-anuncio") },
    asesor:   { name: "Crear Anuncio", href: rutaMarketing("asesor", "crear-anuncio") } },
  { id: "mk-homestaging", icon: Camera, grupo: "marketing-ia",
    director: { name: "HomeStaging", href: rutaMarketing("director", "homestaging") },
    asesor:   { name: "HomeStaging", href: rutaMarketing("asesor", "homestaging") } },
  { id: "mk-clientes-ideales", icon: UserSearch, grupo: "marketing-ia",
    director: { name: "Clientes Ideales (IPC)", href: rutaMarketing("director", "clientes-ideales") },
    asesor:   { name: "Clientes Ideales (IPC)", href: rutaMarketing("asesor", "clientes-ideales") } },
  { id: "mk-mi-adn", icon: Briefcase, grupo: "marketing-ia",
    director: { name: "Mi ADN", href: rutaMarketing("director", "mi-adn") },
    asesor:   { name: "Mi ADN", href: rutaMarketing("asesor", "mi-adn") } },
  { id: "mk-historial", icon: History, grupo: "marketing-ia",
    director: { name: "Historial / Galería", href: rutaMarketing("director", "historial") },
    asesor:   { name: "Mis Generaciones",    href: rutaMarketing("asesor", "historial") } },
  { id: "mk-guia-magica", icon: WandSparkles, grupo: "marketing-ia",
    director: { name: "Guía Mágica", href: rutaMarketing("director", "guia-magica") },
    asesor:   { name: "Guía Mágica", href: rutaMarketing("asesor", "guia-magica") } },
  { id: "mk-configuracion-ia", icon: SlidersHorizontal, grupo: "marketing-ia",
    director: { name: "Configuración IA", href: rutaMarketing("director", "configuracion-ia") } },

  // -- Documentación --------------------------------------------------------
  { id: "contratos-ia", icon: FileSignature, grupo: "documentacion",
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

export interface OpcionesMenu {
  /** La agencia de quien mira: decide qué módulos por agencia se muestran (hoy: Contratos IA). */
  agencyId?: string | null
}

function grupoDelRenglon(r: Renglon, rol: Rol): string {
  return typeof r.grupo === "string" ? r.grupo : r.grupo[rol]
}

function aItem(r: Renglon, rol: Rol): NavItem | null {
  const def = r[rol]
  return def ? { id: r.id, name: def.name, href: def.href, icon: r.icon } : null
}

/** Los renglones que esta agencia no tiene que ver. */
function visibleParaAgencia(r: Renglon, agencyId?: string | null): boolean {
  if (r.id === "contratos-ia" && contratosIaDeshabilitado(agencyId)) return false
  return true
}

/** Los grupos del menú para un rol, sin los grupos vacíos. */
export function menuPara(rol: Rol, opciones: OpcionesMenu = {}): NavGrupo[] {
  return GRUPOS.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    items: RENGLONES.filter((r) => grupoDelRenglon(r, rol) === g.id)
      .filter((r) => visibleParaAgencia(r, opciones.agencyId))
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
export function grupoActivo(rol: Rol, pathname: string, agencyId?: string | null): string | null {
  for (const g of menuPara(rol, { agencyId })) {
    if (g.items.some((it) => esRutaActiva(it.href, pathname))) return g.id
  }
  return null
}
