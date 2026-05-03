"use client"

import { useState, useEffect } from "react"
import { UserNav } from "@/components/user-nav"
import { Badge } from "@/components/ui/badge"
import { Bell, Search, Menu } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { AsesorSidebar } from "@/components/asesor-sidebar"
import { usePathname } from "next/navigation"
import { GlobalSearch } from "@/components/shared/global-search"
import { NotificationPopover } from "@/components/shared/notification-popover"

interface AsesorHeaderProps {
  userName?: string
  userEmail?: string
  agencyName?: string
  userRole?: string
}

export function AsesorHeader({ userName, userEmail, agencyName, userRole }: AsesorHeaderProps) {
  const pathname = usePathname()
  const [customTitle, setCustomTitle] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  
  // Listen for custom title updates
  useEffect(() => {
    const handleUpdateTitle = (event: any) => {
      setCustomTitle(event.detail)
    }
    window.addEventListener('prisma-header-title', handleUpdateTitle)
    return () => window.removeEventListener('prisma-header-title', handleUpdateTitle)
  }, [])
  
  // Keyboard shortcut for search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Simple breadcrumb logic
  const segments = pathname.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] || 'Dashboard'
  const pageTitle = customTitle || (lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, ' '))

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full px-4 md:px-8 flex h-16 items-center justify-between">
        <div className="flex items-center gap-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <AsesorSidebar 
                className="border-none" 
                agencyName={agencyName} 
                userName={userName} 
                userRole={userRole} 
                onSelect={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Asesor</span>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-semibold truncate max-w-[150px] sm:max-w-[200px]">{pageTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex relative w-64 group cursor-pointer" onClick={() => setSearchOpen(true)}>
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            <div className="flex items-center justify-between pl-9 pr-2 h-9 w-full bg-muted/50 rounded-md text-sm text-muted-foreground border border-transparent group-hover:border-accent/20 transition-all">
              <span>Buscar...</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
          
          <div className="hidden items-center gap-2 md:flex">
             <Badge variant="outline" className="border-accent/20 bg-accent/5 gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
               {agencyName}
             </Badge>
          </div>
          
          <NotificationPopover />

          <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

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
