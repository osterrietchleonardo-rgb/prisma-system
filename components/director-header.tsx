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

interface DirectorHeaderProps {
  userName?: string
  userEmail?: string
  agencyName?: string
  userRole?: string
}

export function DirectorHeader({ userName, userEmail, agencyName, userRole }: DirectorHeaderProps) {
  const pathname = usePathname()
  const [customTitle, setCustomTitle] = useState<string | null>(null)
  
  // Listen for custom title updates (e.g. from dynamic pages)
  useEffect(() => {
    const handleUpdateTitle = (event: any) => {
      setCustomTitle(event.detail)
    }
    window.addEventListener('prisma-header-title', handleUpdateTitle)
    return () => window.removeEventListener('prisma-header-title', handleUpdateTitle)
  }, [])

  // Simple breadcrumb logic
  const segments = pathname.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] || 'Dashboard'
  const pageTitle = customTitle || (lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1))

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full px-4 md:px-8 flex h-16 items-center justify-between">
        <div className="flex items-center gap-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <DirectorSidebar 
                className="border-none" 
                agencyName={agencyName} 
                userName={userName} 
                userRole={userRole} 
              />
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Panel</span>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-semibold truncate max-w-[200px]">{pageTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-muted-foreground hidden sm:flex">
            <Search className="h-4 w-4" />
          </Button>
          
          <div className="relative">
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <Bell className="h-4 w-4" />
            </Button>
            <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-background"></span>
          </div>
          
          <div className="flex items-center gap-3">
            <ModeToggle />
            <UserNav userName={userName} userEmail={userEmail} />
          </div>
        </div>
      </div>
    </header>
  )
}
