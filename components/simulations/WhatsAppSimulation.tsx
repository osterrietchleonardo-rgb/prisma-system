"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare, User, Brain, CheckCheck } from "lucide-react";

export default function WhatsAppSimulation() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-md mx-auto bg-[#e5ddd5] dark:bg-slate-900 rounded-[2rem] overflow-hidden border-8 border-slate-800 shadow-2xl relative aspect-[9/16]">
      {/* Header */}
      <div className="bg-[#075e54] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
          <User className="text-slate-500 w-6 h-6" />
        </div>
        <div className="flex flex-col">
          <span className="text-white font-bold text-sm">Consultor Prisma IA</span>
          <span className="text-white/70 text-[10px]">en línea</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4 overflow-y-auto h-[calc(100%-80px)] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
        
        {/* User Message */}
        <div className={`flex flex-col gap-1 transition-all duration-500 transform ${step >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none shadow-sm max-w-[80%] self-start">
            <p className="text-sm">Hola! Vi el depto en Palermo. ¿Me pasas info?</p>
            <span className="text-[9px] text-slate-400 block text-right mt-1">14:02</span>
          </div>
        </div>

        {/* AI Typing */}
        {step === 1 && (
          <div className="flex items-center gap-1 text-slate-500 animate-pulse">
            <Brain className="w-3 h-3 text-accent" />
            <span className="text-[10px]">Prisma IA está pensando...</span>
          </div>
        )}

        {/* AI Message */}
        <div className={`flex flex-col gap-1 transition-all duration-500 delay-300 transform ${step >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="bg-[#dcf8c6] dark:bg-accent/20 p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[80%] self-end">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-3 h-3 text-accent" />
              <span className="text-[10px] font-bold text-accent uppercase">IA Categorización</span>
            </div>
            <p className="text-sm font-medium">¡Hola! Claro, es el depto de 2 ambientes en Fitz Roy. El precio es USD 145.000. ¿Te gustaría coordinar una visita para este jueves?</p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[9px] text-slate-400">14:02</span>
              <CheckCheck className="w-3 h-3 text-blue-500" />
            </div>
          </div>
        </div>

        {/* Lead Logic Status */}
        <div className={`flex flex-col gap-1 transition-all duration-500 delay-700 transform ${step >= 3 ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl backdrop-blur-md">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Sincronizado con Tokko</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-background/50 p-2 rounded">
                <span className="text-muted-foreground block">Interés</span>
                <span className="font-bold">Palermo / 2 amb</span>
              </div>
              <div className="bg-background/50 p-2 rounded">
                <span className="text-muted-foreground block">Calificación</span>
                <span className="font-bold text-green-600">Alta (Hot Lead)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer Simulation */}
      <div className="bg-slate-50 dark:bg-slate-900 p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="bg-white dark:bg-slate-800 rounded-full h-10 flex items-center px-4 text-slate-400 text-sm italic">
          Escribe un mensaje...
        </div>
      </div>
    </div>
  );
}
