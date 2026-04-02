"use client"

import { cn } from "@/lib/utils"
import { Sparkles } from "lucide-react"

interface BrandLogoProps {
  className?: string
  logoSize?: "sm" | "md" | "lg"
  hideTagline?: boolean
}

export default function BrandLogo({ className, logoSize = "md", hideTagline = false }: BrandLogoProps) {
  const sizes = {
    sm: { container: "w-8 h-8", title: "text-lg", tagline: "text-[8px]" },
    md: { container: "w-10 h-10", title: "text-xl", tagline: "text-[10px]" },
    lg: { container: "w-16 h-16", title: "text-2xl", tagline: "text-[12px]" },
  }

  const s = sizes[logoSize]

  return (
    <div className={cn("flex items-center gap-3 group", className)}>
      <div className={cn(s.container, "relative rounded-full overflow-hidden shadow-lg shadow-accent/20 bg-[#131A2D] p-1 border border-accent/20 transition-transform group-hover:scale-105")}>
        <img src="/logo-icon.png" alt="PRISMA IA Logo" className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col">
        <span className={cn(s.title, "font-bold tracking-tighter leading-none bg-gradient-to-r from-accent via-[#e29e6d] to-accent bg-clip-text text-transparent uppercase")}>
          PRISMA IA
        </span>
        {!hideTagline && (
          <span className={cn(s.tagline, "text-muted-foreground font-bold flex items-center gap-1 mt-0.5 tracking-[0.1em] uppercase")}>
            REAL ESTATE <Sparkles className="w-2 h-2 text-accent" /> SISTEMA INTELIGENTE
          </span>
        )}
      </div>
    </div>
  )
}
