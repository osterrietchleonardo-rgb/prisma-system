"use client"

import Link from "next/link"
import BrandLogo from "./brand-logo"

export default function AuthHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/50 backdrop-blur-md border-b border-accent/10">
      <Link href="/" className="transition-transform active:scale-95">
        <BrandLogo />
      </Link>
      
      <div className="flex items-center gap-4">
        <Link 
          href="/" 
          className="text-xs font-semibold text-muted-foreground hover:text-accent transition-colors uppercase tracking-widest"
        >
          Volver al Inicio
        </Link>
      </div>
    </header>
  )
}
