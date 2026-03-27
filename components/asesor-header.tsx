"use client"

import { UserNav } from "@/components/user-nav"
import { Badge } from "@/components/ui/badge"
import { Bell, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface AsesorHeaderProps {
  userName?: string
  userEmail?: string
  agencyName?: string
  userRole?: string
}

export function AsesorHeader({ userName, userEmail, agencyName, userRole }: AsesorHeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full px-4 md:px-8 flex h-16 items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <div className="relative w-64 hidden lg:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar propiedades, leads..."
              className="pl-9 h-9 bg-muted/50 border-none focus-visible:ring-accent/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 md:flex">
             <Badge variant="outline" className="border-accent/20 bg-accent/5 gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
               {agencyName}
             </Badge>
          </div>
          
          <Button variant="ghost" size="icon" className="relative text-muted-foreground">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-background"></span>
          </Button>

          <UserNav 
            userName={userName} 
            userEmail={userEmail} 
            userRole={userRole} 
          />
        </div>
      </div>
    </header>
  )
}
