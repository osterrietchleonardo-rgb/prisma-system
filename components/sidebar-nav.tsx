"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { contratosIaDeshabilitado } from "@/lib/access/contratos-ia"
import {
  esRutaActiva,
  grupoActivo,
  menuPara,
  pieMenuPara,
  type NavItem,
  type Rol,
} from "@/lib/nav/menu"

/**
 * La lista de páginas de la barra izquierda, en grupos plegables.
 *
 * - Se pueden cerrar TODOS los grupos, incluso el de la página activa; cuando
 *   está cerrado, su título queda en cobre para que se sepa dónde se está.
 * - Al navegar a una página, su grupo se abre solo.
 * - Qué grupos quedaron abiertos se guarda en el navegador, por rol, así
 *   sobrevive al cambio de página y al F5.
 */

interface SidebarNavProps {
  rol: Rol
  agencyId?: string
  onSelect?: () => void
  /** Contadores por id de renglón, ej. `{ equipo: 3 }`. */
  badges?: Record<string, number | undefined>
}

const claveGuardado = (rol: Rol) => `prisma.menu.abiertos.${rol}`

function leerGuardado(rol: Rol): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(claveGuardado(rol))
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function guardar(rol: Rol, abiertos: Record<string, boolean>) {
  try {
    window.localStorage.setItem(claveGuardado(rol), JSON.stringify(abiertos))
  } catch {
    /* sin localStorage (modo privado, etc.): la barra funciona igual, solo no recuerda */
  }
}

export function SidebarNav({ rol, agencyId, onSelect, badges }: SidebarNavProps) {
  const pathname = usePathname()
  const grupos = menuPara(rol)
  const activo = grupoActivo(rol, pathname)

  // Arranca con el grupo de la página activa abierto. Es determinista (sale del
  // pathname), así que el servidor y el navegador dibujan lo mismo.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>(() =>
    activo ? { [activo]: true } : {},
  )

  // Ya en el navegador, lo que quedó guardado manda: si dejaste cerrado el grupo
  // de esta misma página y apretás F5, sigue cerrado.
  useEffect(() => {
    setAbiertos((prev) => ({ ...prev, ...leerGuardado(rol) }))
  }, [rol])

  // Cuando CAMBIÁS de página (no al recargar), el grupo de la nueva se abre y
  // queda recordado abierto. Se compara con el grupo anterior para que el primer
  // render —y el doble render de desarrollo— no cuenten como navegación.
  const activoAnterior = useRef(activo)
  useEffect(() => {
    if (activoAnterior.current === activo) return
    activoAnterior.current = activo
    if (!activo) return
    setAbiertos((prev) => {
      if (prev[activo]) return prev
      const sig = { ...prev, [activo]: true }
      guardar(rol, sig)
      return sig
    })
  }, [rol, activo])

  const alternar = (id: string) => {
    setAbiertos((prev) => {
      const sig = { ...prev, [id]: !prev[id] }
      guardar(rol, sig)
      return sig
    })
  }

  return (
    <nav className="space-y-1">
      {grupos.map((g, i) => {
        const abierto = abiertos[g.id] === true
        const tieneActivo = g.id === activo
        const idPanel = `menu-grupo-${g.id}`
        // Si el grupo está plegado, sus contadores (ej. aprobaciones pendientes) se
        // suman en el título: un aviso no puede quedar escondido por estar cerrado.
        const pendientesDelGrupo = g.items.reduce((n, it) => n + (badges?.[it.id] ?? 0), 0)
        return (
          <div key={g.id}>
            <button
              type="button"
              onClick={() => alternar(g.id)}
              aria-expanded={abierto}
              aria-controls={idPanel}
              className={cn(
                "flex w-full items-center gap-2 px-3 pb-1 text-[10px] font-extrabold uppercase tracking-[0.15em] transition-colors rounded",
                i === 0 ? "pt-1" : "pt-4",
                tieneActivo ? "text-accent" : "text-muted-foreground hover:text-accent",
              )}
            >
              <ChevronRight
                className={cn("w-3 h-3 shrink-0 transition-transform", abierto && "rotate-90")}
              />
              {g.titulo}
              {!abierto && pendientesDelGrupo > 0 ? (
                <span className="ml-auto text-[10px] font-bold tracking-normal bg-amber-700 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                  {pendientesDelGrupo}
                </span>
              ) : (
                <span className="ml-auto text-[9px] font-bold opacity-50 tracking-normal">
                  {g.items.length}
                </span>
              )}
            </button>

            {abierto && (
              <div id={idPanel} className="space-y-1">
                {g.items.map((item) => (
                  <ItemMenu
                    key={item.id}
                    item={item}
                    pathname={pathname}
                    agencyId={agencyId}
                    onSelect={onSelect}
                    badge={badges?.[item.id]}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** Los renglones que van abajo de todo, fuera de los grupos (hoy: Configuración). */
export function SidebarPie({ rol, onSelect }: { rol: Rol; onSelect?: () => void }) {
  const pathname = usePathname()
  return (
    <>
      {pieMenuPara(rol).map((item) => (
        <ItemMenu key={item.id} item={item} pathname={pathname} onSelect={onSelect} />
      ))}
    </>
  )
}

interface ItemMenuProps {
  item: NavItem
  pathname: string
  agencyId?: string
  onSelect?: () => void
  badge?: number
}

/** Un renglón del menú. Mismas clases y misma regla de "activo" que tenía la barra. */
function ItemMenu({ item, pathname, agencyId, onSelect, badge }: ItemMenuProps) {
  const isActive = esRutaActiva(item.href, pathname)

  // "Contratos IA" deshabilitada solo para la agencia indicada
  const isDisabled = item.id === "contratos-ia" && contratosIaDeshabilitado(agencyId)

  if (isDisabled) {
    return (
      <div
        aria-disabled="true"
        title="Función no disponible en tu plan"
        className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground cursor-not-allowed select-none"
      >
        <item.icon className="w-4 h-4" />
        {item.name}
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
          Deshabilitada
        </span>
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all",
        isActive
          ? "bg-accent text-accent-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
      )}
    >
      <item.icon className="w-4 h-4" />
      {item.name}
      {badge != null && badge > 0 && (
        <span className="ml-auto text-[10px] font-bold bg-amber-700 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
          {badge}
        </span>
      )}
    </Link>
  )
}
