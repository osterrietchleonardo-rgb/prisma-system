import { ShieldCheck, ChevronLeft, CalendarDays, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function AgendarPage() {
  return (
    <main className="min-h-screen bg-[#020617] text-[#C0C0C0] flex flex-col pt-24 pb-12 px-4 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#B87333]/10 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#B87333]/5 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="container max-w-4xl mx-auto flex flex-col gap-12 relative z-10 items-center mt-8">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-6 w-full">
          <Link
            href="/"
            className="flex items-center text-sm font-semibold text-[#B87333] hover:text-[#B87333]/80 transition-colors self-start md:self-center mb-2"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Volver al Inicio
          </Link>
          
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#B87333]/20 to-transparent border border-[#B87333]/30 flex items-center justify-center text-[#B87333] mb-2 shadow-[0_0_50px_rgba(184,115,51,0.15)] relative overflow-hidden">
            <div className="absolute inset-0 bg-[#B87333]/10 animate-pulse"></div>
            <CalendarDays className="w-10 h-10 relative z-10" />
          </div>
          
          <h1 className="text-4xl md:text-6xl font-black text-white font-serif tracking-tight leading-tight">
            Agenda tu Sesión Estratégica <span className="text-[#B87333]">Gratuita</span>
          </h1>
          
          <p className="text-[#C0C0C0] text-xl max-w-2xl leading-relaxed">
            Hablemos. Me gustaría conocer cómo es tu día a día y qué desafíos enfrentas en tu trabajo. Podemos conversar sin compromisos para ver si lo que ofrecemos realmente te puede ayudar.
          </p>
        </div>

        {/* Value Proposition Box */}
        <div className="w-full bg-white/[0.02] border border-white/10 rounded-3xl p-8 md:p-12 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#B87333]/5 rounded-full blur-[80px]"></div>
          
          <h3 className="text-2xl font-bold text-white mb-6 font-serif">En esta llamada de 30 minutos analizaremos:</h3>
          
          <div className="flex flex-col gap-5 mb-10">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-[#B87333] shrink-0 mt-0.5" />
              <p className="text-lg text-[#C0C0C0]">Tus cuellos de botella actuales en la captación y cierre de propiedades.</p>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-[#B87333] shrink-0 mt-0.5" />
              <p className="text-lg text-[#C0C0C0]">Cómo PRISMA IA puede integrarse con tu flujo de Tokko Broker.</p>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-[#B87333] shrink-0 mt-0.5" />
              <p className="text-lg text-[#C0C0C0]">Un plan de acción exacto para escalar tus operaciones en 72 horas.</p>
            </div>
          </div>

          {/* THE BULLETPROOF CTA BUTTON */}
          <Link 
            href="https://cal.com/vakdor/llamada-de-descubrimiento"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-[#B87333] to-[#9A5B22] text-white font-bold text-xl py-6 rounded-2xl overflow-hidden transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(184,115,51,0.4)]"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            <span className="relative z-10 flex items-center gap-2">
              Ver Horarios Disponibles <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
          
          <p className="text-center text-sm text-[#C0C0C0]/60 mt-6 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4" /> La idea no es venderte nada, sino descubrir si hacemos match.
          </p>
        </div>

      </div>
    </main>
  );
}
