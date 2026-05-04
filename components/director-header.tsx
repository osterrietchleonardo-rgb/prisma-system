"use client"

import { useState, useEffect } from "react"
import { ModeToggle } from "@/components/mode-toggle"
import { UserNav } from "@/components/user-nav"
import { 
  Bell, 
  Menu, 
  Search 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { DirectorSidebar } from "@/components/director-sidebar"
import { usePathname } from "next/navigation"
import { GlobalSearch } from "@/components/shared/global-search"
import { NotificationPopover } from "@/components/shared/notification-popover"

interface DirectorHeaderProps {
  userName?: string
  userEmail?: string
  agencyName?: string
  userRole?: string
}

export function DirectorHeader({ userName, userEmail, agencyName, userRole }: DirectorHeaderProps) {
  const pathname = usePathname()
  const [customTitle, setCustomTitle] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  
  // Listen for custom title updates (e.g. from dynamic pages)
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
              <Button variant="ghost" size="icon" className="md:hidden h-12 w-12">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle Sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <DirectorSidebar 
                className="border-none" 
                agencyName={agencyName} 
                userName={userName} 
                userRole={userRole} 
                onSelect={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
          
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Panel</span>
            <span className="text-base md:text-sm font-semibold truncate max-w-[200px]">{pageTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hidden sm:flex h-10 w-10 hover:text-accent transition-colors"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-5 w-5" />
          </Button>
          
          <NotificationPopover />
          
          <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
          
          <div className="flex items-center gap-3">
            <ModeToggle />
            <UserNav userName={userName} userEmail={userEmail} userRole={userRole} />
          </div>
        </div>
      </div>
    </header>
  )
}
