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
  Settings,
  X,
  Check,
  BarChart,
  Bot
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
              Tu equipo pierde leads mientras vos <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#B87333] via-[#B87333]/80 to-[#B87333]/60">apagás incendios.</span>
            </h1>
            
            <p className="text-lg md:text-2xl text-[#C0C0C0]/90 max-w-3xl leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              El 80% de las consultas inmobiliarias se enfrían en las primeras 4 horas. Si tu agencia tarda más, estás financiando a tu competencia. 
              <span className="block mt-4 text-white font-medium text-base md:text-xl">Instalamos un Ecosistema Operativo de IA que asume el control total: atiende 24/7, perfila leads, genera contratos y mide a cada asesor.</span>
              <span className="block mt-2 font-bold text-[#B87333]">El orden absoluto, operando en tan solo 72 horas.</span>
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

        {/* BARRA DE IMPACTO */}
        <section className="py-8 border-y border-white/5 bg-[#020617]/80 backdrop-blur-md relative z-20">
          <div className="container">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 divide-x-0 md:divide-x divide-white/10 text-center">
              <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-4 duration-1000" style={{ animationDelay: '600ms', animationFillMode: 'both' }}>
                <div className="text-3xl md:text-5xl font-black text-white font-serif tracking-tighter">&lt; 2 min</div>
                <div className="text-[#C0C0C0] text-xs md:text-sm font-bold uppercase tracking-widest">Tiempo de primer contacto</div>
              </div>
              <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-4 duration-1000" style={{ animationDelay: '700ms', animationFillMode: 'both' }}>
                <div className="text-3xl md:text-5xl font-black text-[#B87333] font-serif tracking-tighter">36+</div>
                <div className="text-[#C0C0C0] text-xs md:text-sm font-bold uppercase tracking-widest">Herramientas en 1 Ecosistema</div>
              </div>
              <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-4 duration-1000" style={{ animationDelay: '800ms', animationFillMode: 'both' }}>
                <div className="text-3xl md:text-5xl font-black text-white font-serif tracking-tighter">72 hs</div>
                <div className="text-[#C0C0C0] text-xs md:text-sm font-bold uppercase tracking-widest">Activación total sin frenar tu operación</div>
              </div>
              <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-4 duration-1000" style={{ animationDelay: '900ms', animationFillMode: 'both' }}>
                <div className="text-3xl md:text-5xl font-black text-white font-serif tracking-tighter">24/7</div>
                <div className="text-[#C0C0C0] text-xs md:text-sm font-bold uppercase tracking-widest">Inteligencia Artificial Operativa</div>
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
                Para garantizar resultados extraordinarios y proteger la calidad de nuestra red, requerimos una Sesión Estratégica previa. Si tu agencia o fondo de inversión califica, generaremos tu <span className="font-bold underline decoration-[#020617] decoration-2 underline-offset-4">código único de acceso</span> para desplegar el sistema.
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
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white font-serif">El costo invisible del caos operativo</h2>
              <p className="text-[#C0C0C0] max-w-2xl text-lg">Tener un sistema robusto dejó de ser un lujo operativo. Si tu inmobiliaria opera como en 2019, tu rentabilidad se está desangrando hoy por 3 fracturas críticas.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col gap-4 p-8 rounded-2xl border border-white/5 bg-white/[0.01] hover:border-[#B87333]/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-[#B87333]/10 flex items-center justify-center text-[#B87333]">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white font-serif">I. La Hemorragia de Oportunidades</h3>
                <p className="text-[#C0C0C0] text-sm leading-relaxed">Invertís miles de dólares mensuales en Zonaprop. El lead entra, se asigna en el CRM... y desaparece en la inercia. Nadie lo contacta en las primeras 4 horas críticas. Tu competencia cierra la visita mientras tu equipo apenas envía el primer WhatsApp.</p>
                <div className="mt-auto pt-4 border-t border-white/5">
                  <span className="text-xs font-bold text-[#B87333] uppercase tracking-wider block mb-1">Costo Invisible:</span>
                  <p className="text-white text-xs">Un lead frío te cuesta pauta perdida. 30 leads fríos al mes cuestan un salario directivo anual.</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-4 p-8 rounded-2xl border border-white/5 bg-white/[0.01] hover:border-[#B87333]/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-[#B87333]/10 flex items-center justify-center text-[#B87333]">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white font-serif">II. La Anarquía Comercial</h3>
                <p className="text-[#C0C0C0] text-sm leading-relaxed">Tener 15 asesores no es escalar, es multiplicar tus dolores de cabeza. 15 asesores significan 15 formas distintas de atender al cliente, responder y dar seguimiento. Tu marca premium se diluye porque dependés del voluntarismo de cada integrante.</p>
                <div className="mt-auto pt-4 border-t border-white/5">
                  <span className="text-xs font-bold text-[#B87333] uppercase tracking-wider block mb-1">El Riesgo Estructural:</span>
                  <p className="text-white text-xs">Tu agencia no tiene valor transferible si depende del esfuerzo heroico de 2 asesores estrella.</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 p-8 rounded-2xl border border-white/5 bg-white/[0.01] hover:border-[#B87333]/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-[#B87333]/10 flex items-center justify-center text-[#B87333]">
                  <Eye className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white font-serif">III. La Ceguera de Gobernanza</h3>
                <p className="text-[#C0C0C0] text-sm leading-relaxed">Liderás mirando por el espejo retrovisor. Al llegar a fin de mes, preguntás &quot;¿cuánto vendimos?&quot;. Tomás decisiones basadas en resultados pasados, sin saber exactamente dónde se cayeron las negociaciones, quién necesita corrección y quién está sub-rindiendo hoy.</p>
                <div className="mt-auto pt-4 border-t border-white/5">
                  <span className="text-xs font-bold text-[#B87333] uppercase tracking-wider block mb-1">La Consecuencia:</span>
                  <p className="text-white text-xs">Crecimiento estancado. Es imposible optimizar una máquina que no podés medir en tiempo real.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* EL ECOSISTEMA COMPLETO */}
        <section className="py-24 relative overflow-hidden bg-[#020617]">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#B87333]/5 rounded-full blur-[150px] -z-10 translate-x-1/2 -translate-y-1/2"></div>
          
          <div className="container relative z-10">
            <div className="flex flex-col items-center text-center mb-16 gap-4">
              <span className="text-[#B87333] font-bold tracking-widest text-sm uppercase">Magnitud de Infraestructura</span>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white font-serif max-w-4xl">
                No es un software. Es un Sistema Operativo de 36+ herramientas trabajando por tu rentabilidad.
              </h2>
              <p className="text-[#C0C0C0] max-w-2xl text-lg mt-2">Aumentás la facturación porque pasás de usar herramientas desconectadas a tener un solo ecosistema integrado. El valor de tu agencia se multiplica instantáneamente.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { 
                  icon: Target, 
                  title: "Inteligencia Comercial", 
                  points: ["Dashboard directivo con ranking IA", "Inteligencia que lee WhatsApps y detecta demanda", "Insights de perfil de comprador y calidad de atención"]
                },
                { 
                  icon: Zap, 
                  title: "Automatización 24/7", 
                  points: ["Bot de WhatsApp perfila leads mientras dormís", "Seguimiento implacable e inagotable por IA", "Cero leads perdidos en la caja negra"]
                },
                { 
                  icon: BarChart, 
                  title: "Analytics en Tiempo Real", 
                  points: ["Pulso de mercado, dólar y m² por barrio", "Métricas de conversión embudo por asesor", "Retorno de inversión real por canal publicitario"]
                },
                { 
                  icon: Layers, 
                  title: "Operaciones Aceleradas", 
                  points: ["Contratos IA generados listos para firmar en segundos", "Tasaciones Profesionales (MCM) automáticas", "Calendario y Tracking unificado con Tokko"]
                },
                { 
                  icon: Brain, 
                  title: "Formación Escalable", 
                  points: ["Tutor IA entrena asesores con TUS documentos", "Buscador semántico de propiedades interno", "Biblioteca digital central de procedimientos"]
                },
                { 
                  icon: MessageSquare, 
                  title: "Marketing High-Ticket", 
                  points: ["IA crea anuncios orientados a Cliente Ideal (IPC)", "Redacción y copy estratégico instantáneo", "Segmentación precisa y envío de campañas"]
                }
              ].map((m, i) => (
                <div key={i} className="flex flex-col gap-4 p-6 rounded-2xl border border-white/10 bg-[#020617] hover:border-[#B87333]/40 transition-all group">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:bg-[#B87333]/10 group-hover:text-[#B87333] group-hover:border-[#B87333]/30 transition-all">
                    <m.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{m.title}</h3>
                  <ul className="flex flex-col gap-2 mt-2">
                    {m.points.map((pt, j) => (
                      <li key={j} className="flex gap-2 items-start text-sm text-[#C0C0C0]">
                        <CheckCircle2 className="w-4 h-4 text-[#B87333]/80 mt-0.5 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* LA SOLUCIÓN - METODOLOGÍA PRISMA */}
        <section id="metodologia" className="py-32 relative overflow-hidden border-t border-white/5 bg-[#020617]/50">
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
                    No pagás por funcionalidades sueltas. Invertís en el marco operativo diseñado para erradicar el caos y asegurar que el 100% de tu dinero rinda.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { l: "P", title: "Performance", desc: "Premiás al que rinde y corregís al que no. Todo el equipo medido con datos objetivos y tableros en vivo." },
                    { l: "R", title: "Relación Total", desc: "Sabés qué pasó con cada lead. Centralizá contactos, propiedades y la red completa de tus asesores sin fricción." },
                    { l: "I", title: "Inteligencia", desc: "Un asesor junior atiende como un experto. IA para buscar, tasar, y responder leyendo la mente del mercado." },
                    { l: "S", title: "Seguimiento", desc: "Cero leads muriendo en Tokko. El sistema asume el seguimiento inagotable y empuja al cliente hasta la visita." },
                    { l: "M", title: "Marketing", desc: "Redacción estratégica con IA perfilando clientes ideales. Atraés inversores sin gastar en agencias." },
                    { l: "A", title: "Automatización", desc: "Contratos generados en segundos, tareas de datos invisibles. Tu equipo se dedica a negociar y cerrar." }
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

        {/* ANTES VS DESPUES */}
        <section className="py-24 bg-[#020617] border-y border-white/5 relative overflow-hidden">
          <div className="container relative z-10">
            <div className="flex flex-col items-center text-center mb-16 gap-4">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white font-serif">La reestructuración del valor</h2>
              <p className="text-[#C0C0C0] max-w-2xl text-lg">Invertir en PRISMA no es sumar un gasto tecnológico, es cambiar radicalmente el modelo de negocio de tu agencia inmobiliaria hacia una valuación mayor.</p>
            </div>

            <div className="w-full max-w-5xl mx-auto rounded-3xl border border-white/10 overflow-hidden bg-[#020617] flex flex-col md:flex-row shadow-2xl">
              {/* STATUS QUO */}
              <div className="flex-1 bg-red-950/10 p-8 md:p-12 border-b md:border-b-0 md:border-r border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <AlertCircle className="w-32 h-32 text-red-500" />
                </div>
                <h3 className="text-2xl font-black text-white/50 mb-8 font-serif">Tu Inmobiliaria Hoy</h3>
                <ul className="flex flex-col gap-6">
                  {[
                    "Tiempo de respuesta a leads medido en horas o días.",
                    "El seguimiento depende del humor o memoria del asesor.",
                    "Onboarding lento: el nuevo tarda semanas en aprender.",
                    "Redacción de contratos manual y propensa a errores.",
                    "No sabés por qué canal entra el cliente que realmente compra.",
                    "El dueño funciona como bombero, resolviendo el caos diario."
                  ].map((text, i) => (
                    <li key={i} className="flex gap-4 items-start text-white/60">
                      <X className="w-5 h-5 text-red-500/50 shrink-0 mt-0.5" />
                      <span className="text-sm md:text-base leading-relaxed">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CON PRISMA */}
              <div className="flex-1 bg-gradient-to-br from-[#B87333]/10 to-[#020617] p-8 md:p-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <ShieldCheck className="w-32 h-32 text-[#B87333]" />
                </div>
                <h3 className="text-2xl font-black text-[#B87333] mb-8 font-serif">Inmobiliaria PRISMA</h3>
                <ul className="flex flex-col gap-6">
                  {[
                    "Primer contacto en < 2 min, atendido inteligentemente 24/7.",
                    "Seguimiento automatizado inagotable y estructurado.",
                    "Tutor IA entrena asesores en el día con la data de TU empresa.",
                    "Contratos redactados legalmente por la IA en 10 segundos.",
                    "Dashboard gerencial mostrando atribución real de ventas.",
                    "Dueño como estratega o inversor controlando un sistema sólido."
                  ].map((text, i) => (
                    <li key={i} className="flex gap-4 items-start text-white">
                      <Check className="w-5 h-5 text-[#B87333] shrink-0 mt-0.5 font-bold" />
                      <span className="text-sm md:text-base leading-relaxed font-medium">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* PROMESA DE VALOR - 72H + TOKKO */}
        <section id="activacion" className="py-32 bg-white/[0.01] border-b border-white/5">
          <div className="container">
            <div className="flex flex-col lg:flex-row-reverse gap-16 items-center">
              <div className="flex-1 flex flex-col gap-8 text-right items-end">
                <div className="flex flex-col gap-4 items-end">
                  <span className="text-[#B87333] font-bold tracking-widest text-sm uppercase">Cero Fricción Técnica</span>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] text-white font-serif">
                    Activación Total en <br />
                    <span className="text-[#B87333]">72 Horas.</span>
                  </h2>
                  <p className="text-[#C0C0C0] text-xl leading-relaxed max-w-lg text-right">
                    No te pedimos que frenes tu operación. No te pedimos que capacites en software difícil. Conectamos PRISMA a Tokko Broker y en 72 horas tu agencia opera bajo un nuevo estándar.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 w-full max-w-md">
                  {[
                    { title: "Integración Plug & Play Tokko", icon: Layers, desc: "Sincronización en la nube. Tus datos seguros y estructurados, leídos e inyectados por la IA al instante." },
                    { title: "La IA trabaja, tu equipo cierra", icon: Brain, desc: "El bot se encarga del seguimiento pesado. Tus asesores humanos intervienen solo para mostrar la propiedad." },
                    { title: "Software + Consultoría Estratégica", icon: ShieldCheck, desc: "No te damos un usuario y te soltamos la mano. Operamos como tu Partner Tecnológico: setup, calibración mensual y consultoría continua de Director a Director para asegurar el ROI." }
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
                Dejá de ser el bombero de tu <br /> propia <span className="text-[#B87333]">agencia.</span>
              </h2>
              <p className="text-[#C0C0C0] text-lg md:text-xl max-w-2xl">
                Mientras vos apagás incendios operativos, los verdaderos líderes del mercado operan con sistemas y aliados estratégicos. PRISMA es una suscripción integral: el ecosistema de IA definitivo sumado a nuestra consultoría continua como tu Partner Tecnológico, para devolverte el orden y escalar tu rentabilidad.
              </p>
            </div>
            
            <div className="flex flex-col w-full max-w-2xl mt-8">
              <div className="p-12 border border-[#B87333]/30 rounded-[32px] bg-white/[0.02] backdrop-blur-lg flex flex-col items-center text-center gap-8 shadow-2xl shadow-[#B87333]/5">
                <ShieldCheck className="w-16 h-16 text-[#B87333]" />
                <h3 className="text-3xl font-black text-white font-serif">Aplica para unirte a PRISMA</h3>
                <ul className="space-y-4 text-[#C0C0C0] text-left mx-auto">
                  <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-[#B87333] shrink-0 mt-0.5" /> <span>Entrevista ejecutiva y evaluación de fit comercial (30 min)</span></li>
                  <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-[#B87333] shrink-0 mt-0.5" /> <span>Análisis financiero de impacto, arquitectura de Tokko y escalabilidad</span></li>
                  <li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-[#B87333] shrink-0 mt-0.5" /> <span>Otorgamiento de Licencia y Código Único si existe compatibilidad</span></li>
                </ul>
                <Button asChild size="lg" className="mt-4 bg-[#B87333] hover:bg-[#B87333]/90 text-white border-0 h-16 px-12 text-lg font-bold w-full sm:w-auto shadow-xl shadow-[#B87333]/20 hover:scale-105 transition-all">
                  <Link href="/agendar">Postular mi Agencia</Link>
                </Button>
              </div>
            </div>
            
            <p className="text-white/40 text-sm font-medium mt-4 text-center">Software cerrado a agencias de bajo volumen. Requisito mínimo de estructura para aplicación.</p>
          </div>
        </section>
      </main>
    </>
  );
}
