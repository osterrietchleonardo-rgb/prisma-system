"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Mail, 
  MessageSquare, 
  Phone, 
  MapPin,
  Send,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const agency = formData.get("agency") as string;
    const email = formData.get("email") as string;
    const message = formData.get("message") as string;

    try {
      const supabase = createBrowserClient();
      const { error: submitError } = await supabase
        .from("contact_submissions")
        .insert([
          { name, agency, email, message }
        ]);

      if (submitError) throw submitError;
      
      setSubmitted(true);
    } catch (err: any) {
      console.error("Error submitting form:", err);
      setError("Hubo un problema al enviar tu consulta. Por favor, reintentá o contactanos por WhatsApp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 pt-32 pb-24 min-h-[80vh]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        {/* INFO COLUMN */}
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-left-8 duration-1000">
          <div className="flex flex-col gap-4">
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter">
              Hablemos de tu <br />
              <span className="text-accent italic">próximo nivel.</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              ¿Listo para automatizar tu agencia con IA? Nuestro equipo de especialistas está listo para ayudarte a implementar el Método PRISMA.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-bold">Escribinos</h3>
              <p className="text-sm text-muted-foreground">business@vakdor.com</p>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="font-bold">WhatsApp VIP</h3>
              <p className="text-sm text-muted-foreground">+54 9 221 308-9334</p>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="font-bold">Oficinas</h3>
              <p className="text-sm text-muted-foreground">Puerto Madero, CABA</p>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="font-bold">Comercial</h3>
              <p className="text-sm text-muted-foreground">Lu-Vi: 9hs a 18hs</p>
            </div>
          </div>
        </div>

        {/* FORM COLUMN */}
        <div className="animate-in fade-in slide-in-from-right-8 duration-1000 delay-300">
          <div className="relative group">
            {/* Ambient Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 to-accent/5 rounded-[32px] blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
            
            <div className="relative p-8 md:p-12 rounded-[32px] border border-white/10 bg-white/[0.02] backdrop-blur-xl">
              {submitted ? (
                <div className="flex flex-col items-center justify-center text-center py-12 gap-6 animate-in zoom-in-95 duration-500">
                  <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-black">¡Mensaje enviado!</h2>
                    <p className="text-muted-foreground">Un consultor se pondrá en contacto con vos en las próximas 24 horas hábiles.</p>
                  </div>
                  <Button variant="outline" onClick={() => setSubmitted(false)} className="mt-4 rounded-full border-accent/20 hover:bg-accent/10">
                    Enviar otro mensaje
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-black">Envianos una consulta</h2>
                    <p className="text-sm text-muted-foreground">Completá el formulario y nos contactaremos a la brevedad.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Nombre Completo</label>
                      <Input id="name" name="name" placeholder="Ej: Leonardo Osterrietch" className="bg-white/5 border-white/10 rounded-xl focus:border-accent/50" required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="agency" className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Agencia / Inmobiliaria</label>
                      <Input id="agency" name="agency" placeholder="Ej: Prisma Propiedades" className="bg-white/5 border-white/10 rounded-xl focus:border-accent/50" required />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Email Profesional</label>
                    <Input id="email" name="email" type="email" placeholder="leo@tuagencia.com" className="bg-white/5 border-white/10 rounded-xl focus:border-accent/50" required />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="message" className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">¿Cómo podemos ayudarte?</label>
                    <Textarea id="message" name="message" placeholder="Contanos sobre tu desafío actual..." className="bg-white/5 border-white/10 rounded-xl focus:border-accent/50 min-h-[120px]" required />
                  </div>

                  {error && (
                    <p className="text-xs font-bold text-destructive animate-in fade-in zoom-in-95">{error}</p>
                  )}

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-accent hover:bg-accent/90 text-white h-14 rounded-xl font-black text-lg shadow-lg shadow-accent/20 group"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        Enviar Consulta
                        <Send className="w-5 h-5 ml-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </>
                    )}
                  </Button>
                  
                  <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest opacity-50">
                    Al enviar, aceptás nuestra política de privacidad.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
