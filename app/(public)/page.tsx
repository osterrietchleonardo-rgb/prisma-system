import { 
  Menu, 
  ArrowDownCircle, 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  ChevronRight, 
  AlertCircle, 
  Target, 
  Layers, 
  TrendingUp, 
  Brain, 
  Users, 
  Calendar,
  MessageSquare,
  Activity,
  Clock,
  Eye,
  Settings
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import WhatsAppSimulation from "@/components/simulations/WhatsAppSimulation";
import MarketPulseSimulation from "@/components/simulations/MarketPulseSimulation";
import DashboardSimulation from "@/components/simulations/DashboardSimulation";

export default function LandingPage() {
  return (
    <>
      <main className="flex-1 bg-[#020617] text-[#C0C0C0]">
        {/* HERO */}
        <section className="relative pt-20 md:pt-32 pb-24 md:pb-40 overflow-hidden px-4">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#C0C0C005_1px,transparent_1px),linear-gradient(to_bottom,#C0C0C005_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] -z-10 bg-radial-[at_center_top] from-[#B87333]/10 to-transparent"></div>
          
          <div className="container flex flex-col items-center text-center gap-8">
            <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold bg-[#B87333]/10 border-[#B87333]/20 text-[#B87333] animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B87333] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B87333]"></span>
              </span>
              EXCLUSIVO PARA DIRECTORES COMERCIALES Y DUEÑOS
            </div>
            
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight max-w-5xl text-white leading-[1.1] font-serif">
              Transformamos el caos de tu inmobiliaria en una <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#B87333] via-[#B87333]/80 to-[#B87333]/60">máquina de cierres predecible.</span>
            </h1>
            
            <p className="text-lg md:text-2xl text-[#C0C0C0]/90 max-w-3xl leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              Automatizamos por completo el seguimiento de tus leads conectándonos a tu Tokko Broker. Tus asesores solo reciben prospectos listos para visitar. 
              <span className="block mt-2 font-bold text-white">Todo operando en tan solo 72 horas.</span>
            </p>
            
            <div className="flex flex-col sm:flex-row gap-5 mt-6 w-full sm:w-auto animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
              <Button asChild size="lg" className="bg-[#B87333] hover:bg-[#B87333]/90 text-white border-0 px-10 h-14 md:h-16 text-lg font-bold shadow-lg shadow-[#B87333]/20 transition-all hover:scale-105 active:scale-95">
                <Link href="/agendar" className="flex items-center">
                  Postular Agencia <ChevronRight className="ml-2 w-6 h-6" />
                </Link>
              </Button>
            </div>

            <div className="mt-16 md:mt-24 w-full max-w-6xl mx-auto rounded-3xl border border-[#B87333]/20 overflow-hidden shadow-2xl shadow-[#B87333]/10 relative animate-in fade-in zoom-in-95 duration-1000 delay-500 bg-[#020617]/50 backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent z-10"></div>
              <DashboardSimulation />
              <div className="absolute top-4 left-4 flex gap-1.5 z-20">
                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
              </div>
            </div>
          </div>
        </section>

        {/* ACCESO EXCLUSIVO (By-Application Only) */}
        <section className="py-16 bg-[#B87333] relative overflow-hidden">
          <div className="container relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex flex-col gap-3 md:max-w-3xl">
              <div className="inline-flex items-center self-start rounded-full px-3 py-1 text-xs font-bold bg-[#020617]/20 text-white uppercase tracking-widest border border-white/20">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Acceso Estrictamente por Invitación
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white font-serif tracking-tight leading-tight">
                PRISMA IA no es un software abierto al público.
              </h2>
              <p className="text-white/90 text-lg md:text-xl font-medium leading-relaxed">
                Para garantizar resultados extraordinarios y proteger la calidad de nuestra red, requerimos una Sesión Estratégica previa. Si tu agencia califica, el equipo de implementación generará tu <span className="font-bold underline decoration-[#020617] decoration-2 underline-offset-4">código único de acceso</span> para activar el ecosistema.
              </p>
            </div>
            <Button asChild size="lg" className="bg-[#020617] hover:bg-[#020617]/90 text-white border-0 h-16 px-10 text-lg font-bold shadow-2xl shrink-0 hover:scale-105 transition-all">
              <Link href="/agendar">Verificar Aptitud</Link>
            </Button>
          </div>
        </section>

        {/* AGITACIÓN DEL DOLOR - LAS 3 FRACTURAS */}
        <section className="py-24 bg-[#020617]/80 border-y border-white/5 relative overflow-hidden">
          <div className="container relative z-10">
            <div className="flex flex-col items-center text-center mb-16 gap-4">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white font-serif">¿Sabes cuánto dinero pierdes hoy por falta de control?</h2>
              <p className="text-[#C0C0C0] max-w-2xl text-lg">Inviertes miles en portales y Tokko, pero si tu equipo falla en el proceso, tu rentabilidad se desangra. Identificamos 3 fracturas críticas en agencias como la tuya.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { 
                  title: "La Hemorragia de Oportunidades", 
                  icon: AlertCircle, 
                  desc: "El lead entra a Tokko, se asigna... y desaparece en la caja negra. Asesores que olvidan contactar, seguimientos mediocres y constantes no-shows que destruyen el tiempo útil.",
                  problem: "El Miedo a Perder Dinero a Ciegas"
                },
                { 
                  title: "La Anarquía Comercial", 
                  icon: Users, 
                  desc: "10 asesores significan 10 formas distintas de vender. El onboarding te roba tiempo, gastan horas en contratos manuales y tu marca premium se diluye por la falta de estandarización.",
                  problem: "El Miedo a Depender del Asesor"
                },
                { 
                  title: "La Ceguera de Gobernanza", 
                  icon: Eye, 
                  desc: "Lideras mirando por el espejo retrovisor. Tomas decisiones a fin de mes basadas en lo que ya se cerró, sin saber qué falló en el camino, viviendo bajo un estrés continuo.",
                  problem: "El Estrés de Dirigir a Ciegas"
                }
              ].map((p, i) => (
                <div key={i} className="flex flex-col gap-4 p-8 rounded-2xl border border-white/5 bg-white/[0.01] hover:border-[#B87333]/20 transition-all">
                  <div className="w-12 h-12 rounded-full bg-[#B87333]/10 flex items-center justify-center text-[#B87333]">
                    <p.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white font-serif">{p.title}</h3>
                  <p className="text-[#C0C0C0] text-sm leading-relaxed">{p.desc}</p>
                  <div className="mt-auto pt-4 border-t border-white/5">
                    <span className="text-xs font-bold text-[#B87333] uppercase tracking-wider">{p.problem}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* LA SOLUCIÓN - METODOLOGÍA PRISMA */}
        <section id="metodologia" className="py-32 relative overflow-hidden">
          <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-[#B87333]/5 rounded-full blur-[150px] -z-10 -translate-y-1/2 -translate-x-1/2"></div>
          
          <div className="container">
            <div className="flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1 flex flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <span className="text-[#B87333] font-bold tracking-widest text-sm uppercase">El Nuevo Estándar Operativo</span>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] text-white font-serif">
                    La Metodología <br />
                    <span className="text-[#B87333]">P-R-I-S-M-A</span>
                  </h2>
                  <p className="text-[#C0C0C0] text-xl leading-relaxed">
                    No es un software más. Es la secuencia exacta para erradicar la anarquía de tus asesores y recuperar el volante de tu rentabilidad.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { l: "P", title: "Prospección Inmediata", desc: "La IA atiende al instante 24/7. Aseguramos la entrada del lead." },
                    { l: "R", title: "Rastreo Transparente", desc: "Historial inmutable de cada lead. Adiós a la caja negra comercial." },
                    { l: "I", title: "Integración", desc: "Tutor IA para onboarding y estandarización total de tu marca." },
                    { l: "S", title: "Seguimiento Implacable", desc: "La IA hace el follow-up 100% automático. Asesores solo visitan." },
                    { l: "M", title: "Medición Analítica", desc: "Rankings y KPIs en vivo para premiar o corregir con datos puros." },
                    { l: "A", title: "Aceleración", desc: "Operando bajo nuevas reglas en 72h. Resultados tangibles inmediatos." }
                  ].map((b, i) => (
                    <div key={i} className="flex gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#B87333]/10 border border-[#B87333]/20 flex items-center justify-center text-[#B87333] font-black text-xl">
                        {b.l}
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-bold text-white">{b.title}</h3>
                        <p className="text-[#C0C0C0] text-sm leading-relaxed">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 relative w-full aspect-square md:aspect-video lg:aspect-square">
                <div className="absolute inset-0 border border-white/10 rounded-3xl overflow-hidden shadow-2xl bg-[#020617]">
                  <MarketPulseSimulation />
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#B87333]/5 to-transparent pointer-events-none"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROMESA DE VALOR - 72H + TOKKO */}
        <section id="activacion" className="py-32 bg-white/[0.01] border-y border-white/5">
          <div className="container">
            <div className="flex flex-col lg:flex-row-reverse gap-16 items-center">
              <div className="flex-1 flex flex-col gap-8 text-right items-end">
                <div className="flex flex-col gap-4 items-end">
                  <span className="text-[#B87333] font-bold tracking-widest text-sm uppercase">Sin dolores técnicos</span>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] text-white font-serif">
                    Activación Total en <br />
                    <span className="text-[#B87333]">72 Horas.</span>
                  </h2>
                  <p className="text-[#C0C0C0] text-xl leading-relaxed max-w-lg text-right">
                    Conectamos el ecosistema inteligente directamente a tu Tokko Broker. Detén la pérdida de tiempo desde la primera semana.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 w-full max-w-md">
                  {[
                    { title: "Integración Plug & Play", icon: Layers, desc: "Sincronización bidireccional inmediata con Tokko." },
                    { title: "La IA trabaja, tu equipo cierra", icon: Brain, desc: "El bot se encarga del seguimiento. Tu equipo recibe leads calificados listos para visitar." },
                    { title: "Acompañamiento VIP", icon: ShieldCheck, desc: "Nuestro equipo se encarga de todo el setup inicial." }
                  ].map((f, i) => (
                    <div key={i} className="flex flex-row-reverse gap-6 p-6 rounded-2xl border border-white/5 bg-[#020617] hover:border-[#B87333]/30 transition-all text-right group">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#B87333]/10 flex items-center justify-center text-[#B87333] group-hover:scale-110 transition-transform">
                        <f.icon className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col gap-1 justify-center">
                        <h3 className="text-lg font-bold text-white">{f.title}</h3>
                        <p className="text-[#C0C0C0] text-sm">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 w-full max-w-sm lg:max-w-md">
                <div className="relative aspect-[9/16] rounded-[3rem] overflow-hidden shadow-2xl bg-[#020617] border border-white/10">
                  <WhatsAppSimulation />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section id="ser-socio" className="py-32 bg-[#020617] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#B87333]/10 rounded-full blur-[180px] -z-0 translate-x-1/2 -translate-y-1/2"></div>
          
          <div className="container relative z-10 flex flex-col items-center gap-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <h2 className="text-4xl md:text-7xl font-black tracking-tight text-white font-serif">
                Recupera el control de tu <br /> inmobiliaria <span className="text-[#B87333]">hoy.</span>
              </h2>
              <p className="text-[#C0C0C0] text-lg md:text-xl max-w-2xl">
                Deja de perder dinero en la caja negra comercial. Agenda una sesión estratégica exclusiva para Dueños y Directores, y descubre cómo implementar PRISMA en tu agencia.
              </p>
            </div>
            
            <div className="flex flex-col w-full max-w-2xl mt-8">
              <div className="p-12 border border-[#B87333]/30 rounded-[32px] bg-white/[0.02] backdrop-blur-lg flex flex-col items-center text-center gap-8 shadow-2xl shadow-[#B87333]/5">
                <ShieldCheck className="w-16 h-16 text-[#B87333]" />
                <h3 className="text-3xl font-black text-white font-serif">Aplica para unirte a PRISMA</h3>
                <ul className="space-y-4 text-[#C0C0C0] text-left mx-auto">
                  <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-[#B87333] shrink-0 mt-0.5" /> <span>Entrevista estratégica sin costo (30 min)</span></li>
                  <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-[#B87333] shrink-0 mt-0.5" /> <span>Análisis de problemáticas, estructura operativa y disposición a escalar</span></li>
                  <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-[#B87333] shrink-0 mt-0.5" /> <span>Generación de código único si hay "match"</span></li>
                </ul>
                <Button asChild size="lg" className="mt-4 bg-[#B87333] hover:bg-[#B87333]/90 text-white border-0 h-16 px-12 text-lg font-bold w-full sm:w-auto shadow-xl shadow-[#B87333]/20 hover:scale-105 transition-all">
                  <Link href="/agendar">Postular mi Agencia</Link>
                </Button>
              </div>
            </div>
            
            <p className="text-white/40 text-sm font-medium mt-4">Solo para directores de agencias con +10 asesores.</p>
          </div>
        </section>
      </main>
    </>
  );
}
