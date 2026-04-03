import { 
  BarChart3, 
  ChevronRight, 
  Layers, 
  Users, 
  Zap, 
  Database, 
  Search, 
  FileText, 
  Calendar,
  Smartphone
} from "lucide-react";
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

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background selection:bg-accent/30">
      {/* HEADER */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link href="/">
            <BrandLogo />
          </Link>
          
          <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">Funciones</Link>
            <Link href="#director" className="hover:text-foreground transition-colors">Directores</Link>
            <Link href="#asesor" className="hover:text-foreground transition-colors">Asesores</Link>
          </nav>
          
          <div className="flex items-center gap-2 md:gap-4">
            <ModeToggle />
            <div className="hidden sm:flex items-center gap-4">
              <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Ingresar</Link>
              <Button asChild size="sm" className="bg-accent hover:bg-accent/90 text-white border-0">
                <Link href="/auth/register">Empezar gratis</Link>
              </Button>
            </div>
            
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col gap-8 pt-12">
                <div className="flex flex-col gap-4 text-lg font-medium">
                  <Link href="#features" className="hover:text-accent transition-colors">Funciones</Link>
                  <Link href="#director" className="hover:text-accent transition-colors">Directores</Link>
                  <Link href="#asesor" className="hover:text-accent transition-colors">Asesores</Link>
                  <hr className="border-accent/10" />
                  <Link href="/auth/login" className="hover:text-accent transition-colors">Ingresar</Link>
                  <Link href="/auth/register" className="text-accent underline underline-offset-4">Empezar gratis</Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative pt-16 md:pt-24 pb-20 md:pb-32 overflow-hidden px-4">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          <div className="absolute inset-0 -z-10 bg-radial-[at_center_top] from-accent/5 to-transparent"></div>
          
          <div className="container flex flex-col items-center text-center gap-6 md:gap-8">
            <div className="inline-flex items-center rounded-full border px-3 py-1 text-[10px] md:text-xs font-medium bg-accent/5 border-accent/20 text-accent animate-fade-in">
              ✨ PRISMA IA · La evolución inmobiliaria ha llegado
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl text-foreground">
              El sistema operativo para la <span className="text-accent">inmobiliaria moderna</span>.
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              Gestión comercial avanzada con IA. Centraliza tu equipo, automatiza tus ventas y tomá decisiones basadas en datos reales.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 mt-4 md:mt-8 w-full sm:w-auto">
              <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-white border-0 px-8 h-12 md:h-14 text-base md:text-lg w-full sm:w-auto">
                <Link href="/auth/register?role=director" className="flex items-center justify-center">Soy Director Comercial <ChevronRight className="ml-2 w-5 h-5" /></Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-accent/20 hover:bg-accent/5 px-8 h-12 md:h-14 text-base md:text-lg w-full sm:w-auto">
                <Link href="/auth/register?role=asesor" className="flex items-center justify-center">Soy Asesor Inmobiliario</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* METRICS */}
        <section className="py-12 border-y bg-accent/[0.02]">
          <div className="container">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { label: "Crecimiento de ventas", value: "+32%" },
                { label: "Tiempo ahorrado", value: "15h/semanales" },
                { label: "Prospectos calificados", value: "x3" },
                { label: "Conversión de leads", value: "+21%" }
              ].map((m, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-3xl font-bold">{m.value}</span>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold text-center">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES — DIRECTOR */}
        <section id="director" className="py-24">
          <div className="container flex flex-col gap-12">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Control total. <span className="text-accent">Metas claras.</span></h2>
              <p className="text-muted-foreground text-lg max-w-xl">Supervisá toda la operación en tiempo real sin perderte en los detalles.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: "Dashboard Global", icon: Layers, desc: "Visualizá el rendimiento de toda tu inmobiliaria en un solo lugar." },
                { title: "Gestión de Equipo", icon: Users, desc: "Asigná prospectos, controlá KPIs y motivá a tus asesores." },
                { title: "Métricas de Conversión", icon: BarChart3, desc: "Entendé exactamente dónde están tus cierres y qué mejorar." },
                { title: "Integración Tokko", icon: Database, desc: "Sincronización bidireccional perfecta con tu CRM inmobiliario." },
                { title: "Reportes Automáticos", icon: FileText, desc: "Informes listos para presentar, generados en segundos." },
                { title: "Inteligencia de Mercado", icon: Search, desc: "Datos oficiales de Argentina para tasar con precisión." }
              ].map((f, i) => (
                <div key={i} className="group p-8 border rounded-2xl hover:border-accent/40 hover:bg-accent/[0.02] transition-all bg-card/50">
                  <f.icon className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES — ASESOR */}
        <section id="asesor" className="py-24 bg-accent/[0.01]">
          <div className="container flex flex-col gap-12">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-right">Tu oficina digital. <span className="text-accent">Siempre disponible.</span></h2>
              <p className="text-muted-foreground text-lg max-w-xl self-end text-right">Herramientas que potencian tu día a día, eliminando el trabajo manual.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: "Mis leads", icon: Zap, desc: "Gestión ágil de todos tus contactos interesados." },
                { title: "Mi pipeline", icon: BarChart3, desc: "Control total sobre tus cierres y oportunidades." },
                { title: "Tutor IA", icon: BarChart3, desc: "Asistente inteligente para resolver dudas inmobiliarias." },
                { title: "Consultor de propiedades", icon: Smartphone, desc: "Búsqueda rápida y visual de todo el stock." },
                { title: "Calendario de visitas", icon: Calendar, desc: "Agenda integrada para que nunca se te pase una muestra." },
                { title: "Tasaciones rápidas", icon: Search, desc: "Herramienta de valución para captaciones más efectivas." }
              ].map((f, i) => (
                <div key={i} className="group p-8 border rounded-2xl hover:border-accent/40 hover:bg-accent/[0.02] transition-all bg-card/50">
                  <f.icon className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="py-24 bg-foreground text-background">
          <div className="container flex flex-col items-center gap-12">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-center">Elegí cómo usar PRISMA IA</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
              <div className="p-10 border border-white/10 rounded-3xl bg-white/[0.02] flex flex-col gap-6">
                <h3 className="text-2xl font-bold text-accent">Director</h3>
                <ul className="space-y-4 text-white/70">
                  <li className="flex gap-2">✔ Control total de la agencia</li>
                  <li className="flex gap-2">✔ Visibilidad de métricas</li>
                  <li className="flex gap-2">✔ Gestión de equipo</li>
                  <li className="flex gap-2">✔ Configuración de Tokko</li>
                </ul>
                <Button asChild className="mt-4 bg-accent hover:bg-accent/90 text-white border-0">
                  <Link href="/auth/register?role=director">Empezar como Director</Link>
                </Button>
              </div>
              
              <div className="p-10 border border-white/10 rounded-3xl bg-white/[0.02] flex flex-col gap-6">
                <h3 className="text-2xl font-bold text-accent">Asesor</h3>
                <ul className="space-y-4 text-white/70">
                  <li className="flex gap-2">✔ Gestión de leads propia</li>
                  <li className="flex gap-2">✔ Herramientas de IA para ventas</li>
                  <li className="flex gap-2">✔ Calendario personal</li>
                  <li className="flex gap-2">✔ Tasaciones móviles</li>
                </ul>
                <Button asChild variant="outline" className="mt-4 border-white/20 text-white hover:bg-white/5">
                  <Link href="/auth/register?role=asesor">Empezar como Asesor</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
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
