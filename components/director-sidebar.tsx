"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  Home, 
  LayoutGrid, 
  Building, 
  Users, 
  UserCircle, 
  FileText, 
  Calculator, 
  Calendar, 
  Settings, 
  LogOut,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { logout } from "@/lib/actions/auth"

const navItems = [
  { name: "Dashboard", href: "/director/dashboard", icon: Home },
  { name: "Pipeline", href: "/director/pipeline", icon: LayoutGrid },
  { name: "Propiedades", href: "/director/propiedades", icon: Building },
  { name: "Leads", href: "/director/leads", icon: Users },
  { name: "Asesores", href: "/director/asesores", icon: UserCircle },
  { name: "Documentos", href: "/director/documentos", icon: FileText },
  { name: "Tasaciones", href: "/director/tasaciones", icon: Calculator },
  { name: "Calendario", href: "/director/calendario", icon: Calendar },
  { name: "Tutor IA", href: "/director/tutor", icon: Sparkles },
  { name: "Consultor IA", href: "/director/consultor", icon: Sparkles },
  { name: "Configuración", href: "/director/configuracion", icon: Settings },
]

interface DirectorSidebarProps {
  className?: string
  agencyName?: string
  userName?: string
  userRole?: string
}

export function DirectorSidebar({ className, agencyName, userName, userRole }: DirectorSidebarProps) {
  const pathname = usePathname()

  return (
    <div className={cn("flex flex-col h-full border-r bg-card", className)}>
      <div className="p-6 flex items-center gap-2">
        <div className="w-8 h-8 bg-accent rounded-sm rotate-45 flex items-center justify-center">
          <div className="w-4 h-4 bg-background/20 rounded-full scale-110"></div>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tighter leading-none">PRISMA IA</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 font-semibold">{agencyName || "Agencia Inmobiliaria"}</p>
        </div>
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
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all",
                  isActive 
                    ? "bg-accent text-accent-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="p-4 border-t">
        <form action={logout}>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/5 gap-3">
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </Button>
        </form>
      </div>
    </div>
  )
}
