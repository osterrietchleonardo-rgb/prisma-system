import type { Metadata } from "next";
import { ShieldCheck, ChevronLeft, ClipboardList, CheckCircle2, Star, Users, TrendingUp } from "lucide-react";
import Link from "next/link";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Formulario de Postulación | Socio PRISMA",
  description: "Completá el formulario de postulación para convertirte en Socio PRISMA. Evaluamos si tu inmobiliaria está lista para operar con inteligencia artificial.",
  robots: {
    index: false,
    follow: false,
  },
};

const BENEFITS = [
  {
    icon: Star,
    title: "Selección exclusiva",
    desc: "Solo trabajamos con inmobiliarias que cumplen criterios de crecimiento y operación.",
  },
  {
    icon: Users,
    title: "Onboarding dedicado",
    desc: "Un equipo te acompaña en los primeros 30 días de integración con PRISMA.",
  },
  {
    icon: TrendingUp,
    title: "Implementación en 72hs",
    desc: "Configuramos y dejamos operativo todo tu sistema PRISMA en 72 horas.",
  },
];

export default function FormularioSocioPage() {
  return (
    <>
      {/* MailerLite Universal Script */}
      <Script
        id="mailerlite-universal"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,e,u,f,l,n){w[f]=w[f]||function(){(w[f].q=w[f].q||[])
            .push(arguments);},l=d.createElement(e),l.async=1,l.src=u,
            n=d.getElementsByTagName(e)[0],n.parentNode.insertBefore(l,n);})
            (window,document,'script','https://assets.mailerlite.com/js/universal.js','ml');
            ml('account', '1066404');
          `,
        }}
      />

      <main className="min-h-screen bg-[#020617] text-[#C0C0C0] flex flex-col pt-24 pb-16 px-4 relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-[#B87333]/8 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#B87333]/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="container max-w-5xl mx-auto flex flex-col gap-12 relative z-10 mt-8">

          {/* ── HEADER ── */}
          <div className="flex flex-col items-center text-center gap-6 w-full">
            <Link
              href="/"
              className="flex items-center text-sm font-semibold text-[#B87333] hover:text-[#B87333]/80 transition-colors self-start md:self-center mb-2"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Volver al Inicio
            </Link>

            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#B87333]/20 to-transparent border border-[#B87333]/30 flex items-center justify-center text-[#B87333] mb-2 shadow-[0_0_50px_rgba(184,115,51,0.15)] relative overflow-hidden">
              <div className="absolute inset-0 bg-[#B87333]/10 animate-pulse" />
              <ClipboardList className="w-10 h-10 relative z-10" />
            </div>

            {/* Badge */}
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#B87333]/10 border border-[#B87333]/30 text-[#B87333] text-xs font-bold uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" />
              Postulación Socios PRISMA
            </span>

            <h1 className="text-4xl md:text-6xl font-black text-white font-serif tracking-tight leading-tight max-w-3xl">
              ¿Tu Agencia Está{" "}
              <span className="text-[#B87333]">Lista para PRISMA?</span>
            </h1>

            <p className="text-[#C0C0C0] text-xl max-w-2xl leading-relaxed">
              Completá el formulario de cualificación. Analizamos tu operación actual
              y te confirmamos si hacemos match en menos de <strong className="text-white">48 horas</strong>.
            </p>
          </div>

          {/* ── BENEFITS STRIP ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-4 bg-white/[0.02] border border-white/8 rounded-2xl p-5 backdrop-blur-sm hover:border-[#B87333]/20 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#B87333]/10 flex items-center justify-center text-[#B87333] shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{title}</p>
                  <p className="text-[#C0C0C0]/70 text-sm leading-relaxed mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── MAILERLITE FORM ── */}
          {/* Dark-mode overrides for MailerLite embed */}
          <style>{`
            .ml-embedded .ml-form-embedWrapper,
            .ml-embedded .ml-form-embedBody,
            .ml-embedded .ml-form-embedContent {
              background: transparent !important;
              box-shadow: none !important;
            }
            .ml-embedded img {
              display: none !important;
            }
            .ml-embedded h4,
            .ml-embedded p {
              color: #C0C0C0 !important;
            }
            .ml-embedded label {
              color: #C0C0C0 !important;
              font-weight: 600 !important;
            }
            .ml-embedded input,
            .ml-embedded select,
            .ml-embedded textarea {
              background: rgba(255,255,255,0.05) !important;
              border: 1px solid rgba(255,255,255,0.12) !important;
              color: #ffffff !important;
              border-radius: 12px !important;
            }
            .ml-embedded input::placeholder,
            .ml-embedded textarea::placeholder {
              color: rgba(192,192,192,0.4) !important;
            }
            .ml-embedded select option {
              background: #0f172a !important;
              color: #ffffff !important;
            }
            .ml-embedded .primary {
              background: linear-gradient(135deg, #B87333, #9A5B22) !important;
              border: none !important;
              border-radius: 12px !important;
              font-weight: 700 !important;
              letter-spacing: 0.05em !important;
              transition: opacity 0.2s !important;
            }
            .ml-embedded .primary:hover {
              opacity: 0.9 !important;
            }
          `}</style>

          <div className="w-full bg-white/[0.02] border border-white/10 rounded-3xl p-8 md:p-12 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#B87333]/5 rounded-full blur-[80px]" />

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white font-serif">Formulario de Postulación</h2>
              <p className="text-[#C0C0C0]/70 text-sm mt-1">
                Todos los campos son confidenciales. Tu información no será compartida con terceros.
              </p>
            </div>

            {/* MailerLite Embedded Form — plain div, no Tailwind overrides */}
            <div className="ml-embedded" data-form="Kterp1" />
          </div>

          {/* ── TRUST FOOTER ── */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-[#C0C0C0]/50">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#B87333]/60" />
              Sin compromisos de contratación
            </span>
            <span className="hidden md:block text-[#C0C0C0]/20">·</span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#B87333]/60" />
              Respuesta garantizada en 48hs
            </span>
            <span className="hidden md:block text-[#C0C0C0]/20">·</span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#B87333]/60" />
              100% confidencial
            </span>
          </div>

        </div>
      </main>
    </>
  );
}
