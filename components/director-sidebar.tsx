"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { contarAprobacionesPendientes } from "@/app/actions/equipo"
import { cn } from "@/lib/utils"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { logout } from "@/lib/actions/auth"
import BrandLogo from "./brand-logo"
import { SidebarNav, SidebarPie } from "./sidebar-nav"
import { BotonCerrarBarra } from "./barra-lateral"

// Las páginas del menú y sus grupos viven en `lib/nav/menu.ts`, compartido con el asesor.

interface DirectorSidebarProps {
  className?: string
  agencyName?: string
  agencyId?: string
  userName?: string
  userRole?: string
  onSelect?: () => void
}

export function DirectorSidebar({ className, agencyName, agencyId, userName, userRole, onSelect }: DirectorSidebarProps) {
  const pathname = usePathname()
  // contador de aprobaciones pendientes (se refresca al navegar y cada 60 s)
  const [pendientes, setPendientes] = useState(0)
  useEffect(() => {
    let vivo = true
    const leer = () => contarAprobacionesPendientes().then((n) => { if (vivo) setPendientes(n) }).catch(() => {})
    leer()
    const t = setInterval(leer, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [pathname])

  return (
    <div className={cn("flex flex-col h-full border-r bg-card", className)}>
      <div className="relative p-6 pb-2">
        <BotonCerrarBarra />
        <Link href="/">
          <BrandLogo logoSize="sm" />
        </Link>
        <p className="text-[10px] md:text-[9px] text-muted-foreground uppercase tracking-[0.2em] mt-2 font-bold opacity-60 border-t border-accent/10 pt-2">
          {agencyName || "Agencia Inmobiliaria"}
        </p>
      </div>

      <div className="px-4 mb-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/5 border border-accent/10">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
            {userName?.charAt(0) || "U"}
          </div>
          <div>
            <p className="text-sm font-semibold truncate max-w-[140px]">{userName || "Usuario"}</p>
            <p className="text-[10px] text-accent uppercase font-bold tracking-tighter">{userRole || "Director"}</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <SidebarNav
          rol="director"
          agencyId={agencyId}
          onSelect={onSelect}
          badges={{ equipo: pendientes }}
        />
      </ScrollArea>

      <div className="p-4 border-t space-y-1">
        <SidebarPie rol="director" onSelect={onSelect} />
        <form action={logout} onSubmit={onSelect}>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/5 gap-3">
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </Button>
        </form>
      </div>
    </div>
  )
}
