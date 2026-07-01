import { Shield, Lock, Eye, FileText, Globe, UserCheck, MessageSquare, CalendarDays } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 pt-32 pb-24 max-w-4xl">
      <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/10 pb-12 text-center md:text-left">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mx-auto md:mx-0">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mt-4">Política de <br /><span className="text-accent italic">Privacidad</span></h1>
          <p className="text-xl text-muted-foreground">Última actualización: 1 de julio de 2026</p>
        </div>

        {/* Content Sections */}
        <div className="flex flex-col gap-16">
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 text-accent">
              <Eye className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">1. Introducción</h2>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
              <p>
                En PRISMA-SYSTEM, valoramos profundamente la privacidad de nuestros usuarios y clientes. Esta Política de Privacidad describe cómo recopilamos, utilizamos y protegemos la información personal en el contexto de nuestra plataforma de gestión inmobiliaria asistida por IA.
              </p>
              <p>
                Al utilizar nuestro servicio, aceptás las prácticas descritas en este documento. Nos comprometemos a ser transparentes sobre los datos que manejamos y a darte el control sobre tu información.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-accent">
              <Lock className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">2. Datos que Recopilamos</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-accent" /> Datos de Registro
                </h3>
                <p className="text-sm text-muted-foreground">Nombre, email profesional, nombre de la agencia inmobiliaria y rol dentro de la organización.</p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-accent" /> Información Técnica
                </h3>
                <p className="text-sm text-muted-foreground">Dirección IP, tipo de navegador, identificadores de dispositivo y logs de actividad en la plataforma.</p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-accent" /> Datos de Operación
                </h3>
                <p className="text-sm text-muted-foreground">Metadatos de conversaciones gestionadas por IA, estadísticas de leads y logs de integración con CRMs externos (como Tokko).</p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-accent" /> Propiedades y Mercado
                </h3>
                <p className="text-sm text-muted-foreground">Datos de carteras de propiedades cargadas para el entrenamiento del asistente de IA específico de la agencia.</p>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 text-accent">
              <Shield className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">3. Uso de la Información</h2>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
              <p>Utilizamos la información recopilada para:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Proveer y mantener la funcionalidad de la plataforma PRISMA.</li>
                <li>Entrenar y personalizar los modelos de IA para tu agencia específica.</li>
                <li>Mejorar la precisión del Tasador Rápido y el Análisis de Pulso de Mercado.</li>
                <li>Garantizar la seguridad de las transacciones y prevenir fraudes.</li>
                <li>Cumplir con obligaciones legales y regulatorias en el territorio argentino.</li>
              </ul>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 text-accent">
              <Lock className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">4. Seguridad de los Datos</h2>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed">
              <p>
                Implementamos medidas de seguridad de nivel bancario, incluyendo cifrado SSL/TLS para todos los datos en tránsito y cifrado AES-256 para datos en reposo. PRISMA-SYSTEM utiliza infraestructuras seguras (Supabase/AWS) con redundancia y monitoreo 24/7.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-accent">
              <CalendarDays className="w-6 h-6" />
              <h2 className="text-2xl font-black uppercase tracking-widest">5. Servicios de API de Google</h2>
            </div>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
              <p>
                PRISMA-SYSTEM ofrece una integración opcional con Google Calendar. Al conectar tu cuenta de Google, accedemos únicamente a la información necesaria para sincronizar visitas y eventos de tu agenda inmobiliaria.
              </p>
              <h3 className="text-white font-bold text-lg">Datos que accedemos de Google Calendar</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Lectura y escritura de eventos en tu calendario seleccionado.</li>
                <li>Información básica del perfil de Google (nombre y email) para identificar la cuenta conectada.</li>
              </ul>
              <h3 className="text-white font-bold text-lg">Cómo usamos estos datos</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Crear, actualizar y eliminar eventos de visitas programadas desde PRISMA.</li>
                <li>Sincronizar tu agenda para evitar conflictos de horarios.</li>
                <li>Mostrar disponibilidad en la plataforma.</li>
              </ul>
              <h3 className="text-white font-bold text-lg">Lo que NO hacemos</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>No almacenamos el contenido completo de tu calendario de Google.</li>
                <li>No compartimos tus datos de Google con terceros.</li>
                <li>No utilizamos tus datos de Google para publicidad ni entrenamiento de modelos de IA.</li>
                <li>No accedemos a tu calendario sin tu autorización explícita.</li>
              </ul>
              <p>
                Podés desconectar tu cuenta de Google en cualquier momento desde la sección de Configuración de PRISMA, lo cual revocará el acceso de la plataforma a tu calendario.
              </p>
              <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 mt-4">
                <p className="text-sm text-white/90">
                  <strong>Divulgación de Uso Limitado:</strong> El uso y la transferencia de la información recibida de las API de Google a cualquier otra aplicación por parte de PRISMA-SYSTEM cumplirán con la{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline hover:text-accent/80 transition-colors"
                  >
                    Política de Datos del Usuario de los Servicios de las API de Google
                  </a>
                  , incluidos los requisitos de Uso Limitado.
                </p>
              </div>
            </div>
          </section>

          <div className="p-8 rounded-3xl bg-accent/5 border border-accent/10 text-center flex flex-col gap-4">
            <h3 className="text-xl font-bold">¿Tenés dudas sobre tu privacidad?</h3>
            <p className="text-muted-foreground">Escribinos a business@vakdor.com y nuestro equipo legal te responderá a la brevedad.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
