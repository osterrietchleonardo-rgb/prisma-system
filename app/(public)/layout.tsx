import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import BrandLogo from "@/components/brand-logo";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-background selection:bg-accent/30">
      {/* HEADER FLOTANTE */}
      <div className="fixed top-0 md:top-6 z-[100] px-0 md:px-6 w-full pointer-events-none">
        <header className="container mx-auto pointer-events-auto border-b md:border bg-background/95 md:bg-background/80 backdrop-blur-xl md:rounded-2xl shadow-lg md:shadow-accent/5 border-accent/10">
          <div className="flex h-16 items-center justify-between px-6">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <BrandLogo />
            </Link>
            
            <nav className="hidden md:flex gap-10 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <Link href="/#director" className="hover:text-accent transition-colors">Directores</Link>
              <Link href="/#asesor" className="hover:text-accent transition-colors">Asesores</Link>
              <Link href="/#metricas" className="hover:text-accent transition-colors">Resultados</Link>
            </nav>
            
            <div className="flex items-center gap-2 md:gap-4">
              <ModeToggle />
              <div className="hidden sm:flex items-center gap-6">
                <Link href="/auth/login" className="text-sm font-bold text-muted-foreground hover:text-accent transition-colors uppercase tracking-widest">Ingresar</Link>
                <Button asChild size="sm" className="bg-accent hover:bg-accent/90 text-white border-0 px-8 rounded-full font-black uppercase tracking-tighter">
                  <Link href="/auth/register">Comenzá hoy</Link>
                </Button>
              </div>
              
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden text-accent">
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">Menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="flex flex-col gap-8 pt-16 bg-background/98 backdrop-blur-xl border-accent/20">
                  <div className="flex flex-col gap-6 text-xl font-black uppercase tracking-tighter">
                    <Link href="/#director" className="hover:text-accent transition-colors">Directores</Link>
                    <Link href="/#asesor" className="hover:text-accent transition-colors">Asesores</Link>
                    <Link href="/#metricas" className="hover:text-accent transition-colors">Resultados</Link>
                    <hr className="border-accent/20" />
                    <Link href="/auth/login" className="hover:text-accent transition-colors">Ingresar</Link>
                    <Link href="/auth/register" className="text-accent underline underline-offset-8">Comenzá hoy</Link>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>
      </div>

      <main className="flex-1">
        {children}
      </main>

      {/* FOOTER */}
      <footer className="py-12 border-t mt-auto">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col gap-2">
            <BrandLogo logoSize="sm" />
            <p className="text-sm text-muted-foreground">REAL ESTATE · SISTEMA INTELIGENTE · PRISMA Method™</p>
          </div>
          
          <div className="flex gap-8 text-sm text-muted-foreground">
            <Link href="/legal" className="hover:text-accent underline-offset-4 hover:underline">Privacidad</Link>
            <Link href="/terms" className="hover:text-accent underline-offset-4 hover:underline">Términos</Link>
            <Link href="/contact" className="hover:text-accent underline-offset-4 hover:underline">Contacto</Link>
          </div>
          
          <div className="text-sm text-muted-foreground">
            © 2026 PRISMA IA. Hecho en Argentina.
          </div>
        </div>
      </footer>
    </div>
  );
}
