"use client"

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

interface UserNavProps {
  userName?: string
  userEmail?: string
  userRole?: string
}

export function UserNav({ userName, userEmail, userRole }: UserNavProps) {
  const initials = userName ? userName.split(" ").map(n => n[0]).join("").toUpperCase() : "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 md:h-8 md:w-8 rounded-full border border-accent/20">
          <Avatar className="h-10 w-10 md:h-8 md:w-8">
            <AvatarImage src="" alt={userName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground uppercase font-bold tracking-wider opacity-70">
              {userRole || "Usuario"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            Perfil
          </DropdownMenuItem>
          <DropdownMenuItem>
            Configuración
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>
          Cerrar Sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
