"use client"

import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout } from "@/lib/actions/auth"
import { Settings, LogOut, Shield, ChevronDown } from "lucide-react"

interface UserNavProps {
  userName?: string
  userEmail?: string
  userRole?: string
}

export function UserNav({ userName, userEmail, userRole }: UserNavProps) {
  const initials = userName ? userName.split(" ").map(n => n[0]).join("").toUpperCase() : "U"
  const rolePath = userRole?.toLowerCase() === 'director' ? 'director' : 'asesor'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative flex items-center gap-2 px-2 h-10 rounded-xl hover:bg-accent/10 transition-all border border-transparent hover:border-accent/10 group">
          <div className="relative">
            <Avatar className="h-8 w-8 rounded-lg border-2 border-accent/20 group-hover:border-accent/50 transition-colors">
              <AvatarImage src="" alt={userName} />
              <AvatarFallback className="bg-accent/10 text-accent font-black text-xs rounded-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full shadow-lg"></div>
          </div>
          <div className="hidden md:flex flex-col items-start gap-0">
            <span className="text-xs font-black tracking-tight leading-none text-white/90">{userName?.split(' ')[0]}</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60 leading-tight">
              {userRole}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-accent transition-colors" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-2 border-accent/20 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/50" align="end" forceMount>
        <DropdownMenuLabel className="font-normal p-3">
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-black py-0 px-1.5 border-accent/30 text-accent">
                {userRole || "Usuario"}
              </Badge>
              {userRole?.toLowerCase() === 'director' && <Shield className="h-3 w-3 text-accent" />}
            </div>
            <p className="text-sm font-black leading-none text-white tracking-tight">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground opacity-70 truncate">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-accent/10" />
        <DropdownMenuGroup className="p-1">
          <Link href={`/${rolePath}/configuracion`}>
            <DropdownMenuItem className="gap-2 rounded-lg py-2 cursor-pointer focus:bg-accent/10 focus:text-accent transition-colors">
              <Settings className="h-4 w-4" />
              <span className="font-bold text-xs uppercase tracking-widest">Configuración</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-accent/10" />
        <DropdownMenuItem 
          className="gap-2 rounded-lg py-2 cursor-pointer focus:bg-red-500/10 focus:text-red-500 text-red-400 transition-colors"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          <span className="font-bold text-xs uppercase tracking-widest">Cerrar Sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Badge({ children, variant, className }: any) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
      {children}
    </span>
  )
}
