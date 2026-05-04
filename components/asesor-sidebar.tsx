"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  Home, 
  LayoutGrid, 
  Building, 
  Users, 
  Calendar, 
  Bot, 
  Search, 
  Calculator, 
  Settings, 
  LogOut,
  BookOpen,
  TrendingUp,
  FileSignature,
  MessageSquare,
  GraduationCap,
  ShieldCheck,
  BarChart2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { logout } from "@/lib/actions/auth"
import BrandLogo from "./brand-logo"

const navItems = [
  { name: "Mi Dashboard", href: "/asesor/dashboard", icon: Home },
  { name: "Pulso de Mercado", href: "/asesor/mercado", icon: BarChart2 },
  { name: "Mi Pipeline", href: "/asesor/pipeline", icon: LayoutGrid },
  { name: "Mis Propiedades", href: "/asesor/propiedades", icon: Building },
  { name: "Tracking Performance", href: "/asesor/tracking-performance", icon: TrendingUp },
  { name: "Leads Tokko", href: "/asesor/leads", icon: Users },
  { name: "WhatsApp Bandeja", href: "/asesor/whatsapp", icon: MessageSquare },
  { name: "Leads WhatsApp", href: "/asesor/leads-whatsapp", icon: MessageSquare },
  { name: "Marketing IA", href: "/asesor/marketing-ia", icon: Bot },
  { name: "Contratos IA", href: "/asesor/contratos-ia", icon: FileSignature },
  { name: "Mi Calendario", href: "/asesor/calendario", icon: Calendar },
  { name: "Tutor IA", href: "/asesor/tutor-ia", icon: GraduationCap },
  { name: "Consultor IA", href: "/asesor/consultor-ia", icon: ShieldCheck },
  { name: "Tasaciones", href: "/asesor/tasaciones", icon: Calculator },
  { name: "Biblioteca", href: "/asesor/documentos", icon: BookOpen },
  { name: "Configuración", href: "/asesor/configuracion", icon: Settings },
  { name: "Sugerencias", href: "/asesor/feedback", icon: MessageSquare },
]

interface AsesorSidebarProps {
  className?: string
  agencyName?: string
  userName?: string
  userRole?: string
  onSelect?: () => void
}

export function AsesorSidebar({ className, agencyName, userName, userRole, onSelect }: AsesorSidebarProps) {
  const pathname = usePathname()

  return (
    <div className={cn("flex flex-col h-full border-r bg-card", className)}>
      <div className="p-6 pb-2">
        <Link href="/">
          <BrandLogo logoSize="sm" />
        </Link>
        <p className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] mt-2 font-bold opacity-60 border-t border-accent/10 pt-2">
          {agencyName || "Agencia Inmobiliaria"}
        </p>
      </div>

      <div className="px-4 mb-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/5 border border-accent/10">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
            {userName?.charAt(0) || "A"}
          </div>
          <div>
            <p className="text-sm font-semibold truncate max-w-[140px]">{userName || "Asesor"}</p>
            <p className="text-[10px] text-accent uppercase font-bold tracking-tighter">{userRole || "Asesor"}</p>
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
