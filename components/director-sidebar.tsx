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
  Sparkles,
  TrendingUp,
  FileSignature,
  MessageSquare,
  BarChart2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { logout } from "@/lib/actions/auth"
import BrandLogo from "./brand-logo"

const navItems = [
  { name: "Dashboard", href: "/director/dashboard", icon: Home },
  { name: "Pulso de Mercado", href: "/director/mercado", icon: BarChart2 },
  { name: "Pipeline", href: "/director/pipeline", icon: LayoutGrid },
  { name: "Propiedades", href: "/director/propiedades", icon: Building },
  { name: "Tracking Performance", href: "/director/tracking-performance", icon: TrendingUp },
  { name: "Leads Tokko", href: "/director/leads", icon: Users },
  { name: "Asesor IA WhatsApp", href: "/director/asesor-ia-whatsapp", icon: MessageSquare },
  { name: "Leads WhatsApp", href: "/director/leads-whatsapp", icon: MessageSquare },
  { name: "Marketing IA", href: "/director/marketing-ia", icon: Sparkles },
  { name: "Contratos IA", href: "/director/contratos-ia", icon: FileSignature },
  { name: "Asesores", href: "/director/asesores", icon: UserCircle },
  { name: "Documentos", href: "/director/documentos", icon: FileText },
  { name: "Tasaciones", href: "/director/tasaciones", icon: Calculator },
  { name: "Calendario", href: "/director/calendario", icon: Calendar },
  { name: "Tutor IA", href: "/director/tutor", icon: Sparkles },
  { name: "Consultor IA", href: "/director/consultor", icon: Sparkles },
  { name: "Configuración", href: "/director/configuracion", icon: Settings },
  { name: "Sugerencias", href: "/director/feedback", icon: MessageSquare },
]

interface DirectorSidebarProps {
  className?: string
  agencyName?: string
  userName?: string
  userRole?: string
  onSelect?: () => void
}

export function DirectorSidebar({ className, agencyName, userName, userRole, onSelect }: DirectorSidebarProps) {
  const pathname = usePathname()

  return (
    <div className={cn("flex flex-col h-full border-r bg-card", className)}>
      <div className="p-6 pb-2">
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
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onSelect}
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
