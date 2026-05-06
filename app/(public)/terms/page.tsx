import React from "react";
import { FileText, Scale, Zap, Globe, AlertTriangle, CheckCircle } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 pt-32 pb-24 max-w-4xl">
      <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/10 pb-12 text-center md:text-left">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mx-auto md:mx-0">
            <Scale className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mt-4">Términos y <br /><span className="text-accent italic">Condiciones</span></h1>
          <p className="text-xl text-muted-foreground">Vigentes desde el 6 de mayo de 2026</p>
        </div>

        {/* Content Sections */}
        <div className="flex flex-col gap-16">
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 text-accent">
              <Globe className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">1. Relación Contractual</h2>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
              <p>
                Los presentes Términos de Servicio regulan el acceso y uso de la plataforma PRISMA-SYSTEM (en adelante, "la Plataforma"), propiedad de PRISMA IA. Al acceder o utilizar la Plataforma, el usuario (Director o Asesor) acepta quedar vinculado por estos términos.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-accent">
              <Zap className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">2. Licencia de Uso</h2>
            </div>
            <div className="space-y-6">
              <div className="flex gap-4 items-start">
                <CheckCircle className="w-6 h-6 text-accent shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-white">Uso Profesional</h3>
                  <p className="text-sm text-muted-foreground">La licencia otorgada es de carácter profesional, no exclusivo e intransferible, destinada exclusivamente a la gestión de agencias inmobiliarias.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <CheckCircle className="w-6 h-6 text-accent shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-white">Cuentas de Usuario</h3>
                  <p className="text-sm text-muted-foreground">Cada usuario es responsable de mantener la confidencialidad de sus credenciales y de toda la actividad que ocurra bajo su cuenta.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <CheckCircle className="w-6 h-6 text-accent shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-white">Propiedad Intelectual</h3>
                  <p className="text-sm text-muted-foreground">Toda la tecnología de IA, algoritmos y diseño de la interfaz son propiedad exclusiva de PRISMA IA.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 text-accent">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">3. Limitación de Responsabilidad</h2>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
              <p>
                PRISMA-SYSTEM es una herramienta de asistencia basada en Inteligencia Artificial. Si bien buscamos la máxima precisión, los resultados del "Tasador Rápido" y las recomendaciones del "Consultor IA" deben ser validados por un profesional matriculado antes de ser utilizados en operaciones vinculantes.
              </p>
              <p>
                PRISMA IA no se responsabiliza por decisiones comerciales tomadas basadas exclusivamente en sugerencias automatizadas del sistema.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 text-accent">
              <FileText className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">4. Suscripción y Pagos</h2>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
              <p>
                El acceso a las funcionalidades avanzadas requiere de una suscripción activa. El incumplimiento en los pagos resultará en la suspensión temporal del servicio y de las integraciones con CRMs externos.
              </p>
            </div>
          </section>

          <div className="p-8 rounded-3xl bg-accent/5 border border-accent/10 text-center flex flex-col gap-4">
            <h3 className="text-xl font-bold">Aceptación de Términos</h3>
            <p className="text-muted-foreground">Al registrarte en PRISMA-SYSTEM, declarás haber leído y aceptado íntegramente estas condiciones.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
