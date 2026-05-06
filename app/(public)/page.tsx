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
  Smartphone,
  ShieldCheck,
  TrendingUp,
  MessageSquare,
  Target,
  Brain,
  ArrowDownCircle,
  CheckCircle2,
  AlertCircle
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
import Image from "next/image";

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
            <Link href="#director" className="hover:text-foreground transition-colors">Directores</Link>
            <Link href="#asesor" className="hover:text-foreground transition-colors">Asesores</Link>
            <Link href="#metricas" className="hover:text-foreground transition-colors">Resultados</Link>
          </nav>
          
          <div className="flex items-center gap-2 md:gap-4">
            <ModeToggle />
            <div className="hidden sm:flex items-center gap-4">
              <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Ingresar</Link>
              <Button asChild size="sm" className="bg-accent hover:bg-accent/90 text-white border-0 px-6">
                <Link href="/auth/register">Prueba Gratis</Link>
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
                  <Link href="#director" className="hover:text-accent transition-colors">Directores</Link>
                  <Link href="#asesor" className="hover:text-accent transition-colors">Asesores</Link>
                  <Link href="#metricas" className="hover:text-accent transition-colors">Resultados</Link>
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
        <section className="relative pt-20 md:pt-32 pb-24 md:pb-40 overflow-hidden px-4">
          {/* Background Decorative Elements */}
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] -z-10 bg-radial-[at_center_top] from-accent/10 to-transparent"></div>
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-accent/5 blur-[120px] -z-10"></div>
          <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] rounded-full bg-accent/5 blur-[100px] -z-10"></div>
          
          <div className="container flex flex-col items-center text-center gap-8">
            <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold bg-accent/5 border-accent/20 text-accent animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              PRISMA SYSTEM · LA EVOLUCIÓN PARA DIRECTORES COMERCIALES
            </div>
            
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tight max-w-5xl text-foreground leading-[1.1]">
              Dejá de gestionar el caos. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent/80 to-accent/60">Liderá con Datos e IA.</span>
            </h1>
            
            <p className="text-lg md:text-2xl text-muted-foreground max-w-3xl leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              PRISMA es el ecosistema inteligente que elimina los puntos ciegos de tu inmobiliaria. Centralizá Tokko, automatizá WhatsApp y tomá decisiones con el pulso del mercado real.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-5 mt-6 w-full sm:w-auto animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
              <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-white border-0 px-10 h-14 md:h-16 text-lg font-bold shadow-lg shadow-accent/20 transition-all hover:scale-105 active:scale-95">
                <Link href="/auth/register?role=director" className="flex items-center">
                  Digitalizá tu Agencia <ChevronRight className="ml-2 w-6 h-6" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-accent/30 hover:bg-accent/5 px-10 h-14 md:h-16 text-lg font-semibold transition-all hover:border-accent">
                <Link href="#director">Ver solución para Directores</Link>
              </Button>
            </div>

            {/* Dashboard Mockup Visual */}
            <div className="mt-16 md:mt-24 w-full max-w-6xl mx-auto rounded-2xl border border-accent/20 overflow-hidden shadow-2xl shadow-accent/10 relative animate-in fade-in zoom-in-95 duration-1000 delay-500">
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10"></div>
              <Image 
                src="/prisma_director_dashboard_mockup_1778034969409.png" 
                alt="Prisma Director Dashboard" 
                width={1200} 
                height={675}
                className="w-full h-auto object-cover opacity-90"
              />
              <div className="absolute top-4 left-4 flex gap-1.5 z-20">
                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
              </div>
            </div>
          </div>
        </section>

        {/* PAIN POINTS SECTION */}
        <section className="py-24 bg-card/30 border-y relative overflow-hidden">
          <div className="container relative z-10">
            <div className="flex flex-col items-center text-center mb-16 gap-4">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tight">¿Te resultan familiares estos problemas?</h2>
              <p className="text-muted-foreground max-w-2xl">Liderar una inmobiliaria en 2026 sin las herramientas correctas es una batalla perdida contra el tiempo.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { 
                  title: "Fuga de Prospectos", 
                  icon: AlertCircle, 
                  desc: "Leads que llegan por WhatsApp o portales y se pierden por falta de respuesta inmediata. El 70% de las ventas se pierden en los primeros 5 minutos.",
                  problem: "Tu equipo no puede estar 24/7."
                },
                { 
                  title: "Gestión a Ciegas", 
                  icon: Target, 
                  desc: "No sabés qué está haciendo cada asesor hoy. Quién llamó, quién visitó, quién está por cerrar. La falta de visibilidad mata tu rentabilidad.",
                  problem: "Falta de actividad trazable."
                },
                { 
                  title: "Datos Fragmentados", 
                  icon: Layers, 
                  desc: "Tokko por un lado, WhatsApp por otro, Excel por otro. Información duplicada o perdida que impide una toma de decisiones estratégica.",
                  problem: "Herramientas desconectadas."
                }
              ].map((p, i) => (
                <div key={i} className="flex flex-col gap-4 p-8 rounded-2xl border border-destructive/10 bg-destructive/[0.01] hover:border-destructive/20 transition-all">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                    <p.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{p.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{p.desc}</p>
                  <div className="mt-auto pt-4 border-t border-destructive/5">
                    <span className="text-xs font-bold text-destructive uppercase tracking-wider">{p.problem}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SOLUTIONS — THE DIRECTOR'S ECOSYSTEM */}
        <section id="director" className="py-32 relative overflow-hidden">
          <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] -z-10 -translate-y-1/2 -translate-x-1/2"></div>
          
          <div className="container">
            <div className="flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1 flex flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <span className="text-accent font-bold tracking-widest text-sm uppercase">Beneficios Tangibles</span>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
                    Control total sobre tu <br />
                    <span className="text-accent">Agencia Digital.</span>
                  </h2>
                  <p className="text-muted-foreground text-xl leading-relaxed">
                    Diseñado específicamente para Directores Comerciales que necesitan ver el bosque, sin descuidar cada árbol.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {[
                    { 
                      title: "Logs de Actividad en Tiempo Real", 
                      icon: ShieldCheck, 
                      benefit: "Visibilidad 360°",
                      desc: "Mirá exactamente qué está pasando. Captaciones, transacciones y gestiones de leads centralizadas en un solo flujo transparente." 
                    },
                    { 
                      title: "Pulso de Mercado Estratégico", 
                      icon: TrendingUp, 
                      benefit: "+20% Precisión en Tasación",
                      desc: "Accedé a datos reales de Zonaprop y Argenprop analizados por IA. Dejá de tasar por intuición y empezá a cerrar con datos." 
                    },
                    { 
                      title: "Automatización de Seguimiento", 
                      icon: Brain, 
                      benefit: "Ahorro de 10h semanales",
                      desc: "La IA califica y nutre a tus prospectos en WhatsApp mientras vos te enfocás en la estrategia y el cierre de grandes operaciones." 
                    }
                  ].map((b, i) => (
                    <div key={i} className="flex gap-6 p-6 rounded-2xl border border-accent/10 bg-accent/[0.02] hover:bg-accent/[0.05] transition-all group">
                      <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <b.icon className="w-7 h-7" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold">{b.title}</h3>
                          <span className="text-[10px] font-black bg-accent text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">{b.benefit}</span>
                        </div>
                        <p className="text-muted-foreground text-sm leading-relaxed">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-white px-8 h-14 font-bold shadow-lg shadow-accent/20">
                    <Link href="/auth/register?role=director">Obtener mi Dashboard de Director</Link>
                  </Button>
                </div>
              </div>

              <div className="flex-1 relative w-full aspect-square md:aspect-video lg:aspect-square">
                <div className="absolute inset-0 border border-accent/20 rounded-3xl overflow-hidden shadow-2xl bg-card">
                  <Image 
                    src="/prisma_director_dashboard_mockup_1778034969409.png" 
                    alt="Prisma Analytics" 
                    fill 
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent"></div>
                </div>
                {/* Decorative floating stats */}
                <div className="absolute -top-6 -right-6 p-6 glass rounded-2xl shadow-xl animate-bounce duration-[3000ms]">
                  <TrendingUp className="text-accent w-8 h-8 mb-2" />
                  <div className="text-2xl font-black">+32%</div>
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Conversión</div>
                </div>
                <div className="absolute -bottom-8 -left-8 p-6 glass rounded-2xl shadow-xl animate-pulse">
                  <div className="flex items-center gap-3">
                    <Users className="text-accent w-6 h-6" />
                    <div>
                      <div className="text-sm font-bold">Equipo Activo</div>
                      <div className="text-[10px] text-muted-foreground uppercase">12 Asesores Online</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES — THE ADVISOR'S TURBO */}
        <section id="asesor" className="py-32 bg-accent/[0.01] border-y">
          <div className="container">
            <div className="flex flex-col lg:flex-row-reverse gap-16 items-center">
              <div className="flex-1 flex flex-col gap-8">
                <div className="flex flex-col gap-4 text-right items-end">
                  <span className="text-accent font-bold tracking-widest text-sm uppercase">Para tus Asesores</span>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
                    Eliminá el <br />
                    <span className="text-accent">Trabajo Manual.</span>
                  </h2>
                  <p className="text-muted-foreground text-xl leading-relaxed max-w-lg">
                    Dales las herramientas para que vendan más, no para que carguen más datos.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {[
                    { title: "Consultor de Propiedades IA", icon: Brain, desc: "Búsqueda instantánea en stock propio y de red con IA." },
                    { title: "WhatsApp CRM Integrado", icon: MessageSquare, desc: "Respondé desde PRISMA y sincronizá con Tokko automáticamente." },
                    { title: "Pipeline de Ventas Ágil", icon: Layers, desc: "Visualizá tus cierres con un Kanban diseñado para el día a día." }
                  ].map((f, i) => (
                    <div key={i} className="flex flex-row-reverse gap-6 p-6 rounded-2xl border border-accent/5 bg-background/50 hover:border-accent/20 transition-all text-right group">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <f.icon className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-lg font-bold">{f.title}</h3>
                        <p className="text-muted-foreground text-sm">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 w-full max-w-sm lg:max-w-md">
                <div className="relative aspect-[9/16] border-[12px] border-foreground/10 rounded-[48px] overflow-hidden shadow-2xl bg-card">
                  <Image 
                    src="/prisma_ai_assistant_whatsapp_1778034987934.png" 
                    alt="Prisma AI Mobile" 
                    fill 
                    className="object-cover"
                  />
                  <div className="absolute top-0 inset-x-0 h-10 bg-black/10 backdrop-blur-md flex items-center justify-center">
                    <div className="w-20 h-4 bg-black/20 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* METRICS / PROOF */}
        <section id="metricas" className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-accent/[0.03] -z-10"></div>
          <div className="container">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
              {[
                { label: "Crecimiento de facturación", value: "+32%", icon: TrendingUp },
                { label: "Tiempo ahorrado / Mes", value: "60hs", icon: Calendar },
                { label: "Prospectos Calificados", value: "3.5x", icon: Target },
                { label: "Felicidad del Equipo", value: "98%", icon: Users }
              ].map((m, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-4 group">
                  <div className="w-16 h-16 rounded-2xl bg-white shadow-xl shadow-accent/5 flex items-center justify-center text-accent mb-2 group-hover:rotate-6 transition-transform">
                    <m.icon className="w-8 h-8" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-4xl md:text-5xl font-black text-foreground">{m.value}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold mt-1">{m.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="py-32 bg-foreground text-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/20 rounded-full blur-[180px] -z-0 translate-x-1/2 -translate-y-1/2"></div>
          
          <div className="container relative z-10 flex flex-col items-center gap-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <h2 className="text-4xl md:text-7xl font-black tracking-tight">El futuro de tu agencia <br /> empieza <span className="text-accent">hoy.</span></h2>
              <p className="text-white/60 text-lg md:text-xl max-w-2xl">Unite a las inmobiliarias líderes en Argentina que ya operan con Inteligencia Artificial.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
              <div className="p-12 border border-white/10 rounded-[32px] bg-white/[0.03] backdrop-blur-lg flex flex-col gap-8 group hover:border-accent/50 transition-all">
                <div className="flex justify-between items-start">
                  <h3 className="text-3xl font-black text-white">Director</h3>
                  <ShieldCheck className="w-10 h-10 text-accent opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <ul className="space-y-4 text-white/70">
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Control de Actividad 360°</li>
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Dashboard de KPIs en vivo</li>
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Pulso de Mercado Zonaprop</li>
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Gestión de Equipo Multi-sucursal</li>
                </ul>
                <Button asChild className="mt-4 bg-accent hover:bg-accent/90 text-white border-0 h-14 text-lg font-bold">
                  <Link href="/auth/register?role=director">Configurar mi Agencia</Link>
                </Button>
              </div>
              
              <div className="p-12 border border-white/10 rounded-[32px] bg-white/[0.03] backdrop-blur-lg flex flex-col gap-8 group hover:border-accent/50 transition-all">
                <div className="flex justify-between items-start">
                  <h3 className="text-3xl font-black text-white">Asesor</h3>
                  <Zap className="w-10 h-10 text-accent opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <ul className="space-y-4 text-white/70">
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Asistente IA 24/7</li>
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Tasador Rápido Móvil</li>
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Sincronización Tokko/WhatsApp</li>
                  <li className="flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-accent" /> Pipeline de Ventas Personal</li>
                </ul>
                <Button asChild variant="outline" className="mt-4 border-white/20 text-white hover:bg-white/10 h-14 text-lg font-bold">
                  <Link href="/auth/register?role=asesor">Empezar a Vender</Link>
                </Button>
              </div>
            </div>
            
            <p className="text-white/40 text-sm font-medium mt-8">Sin tarjetas de crédito · Setup en 5 minutos · Soporte VIP</p>
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
