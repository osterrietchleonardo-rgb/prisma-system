"use client";

import React, { useEffect, useState } from "react";
import { User, Brain, CheckCheck, Mic, Plus, Paperclip, Smile, Send } from "lucide-react";

export default function WhatsAppSimulation() {
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const sequence = async () => {
      // Step 0: Initial state (Empty)
      setStep(0);
      setTyping(false);

      // Step 1: User sends message (after 1s)
      await new Promise(r => setTimeout(r, 1000));
      setStep(1);

      // Step 2: AI starts typing (after 1.5s)
      await new Promise(r => setTimeout(r, 1500));
      setTyping(true);

      // Step 3: AI sends response (after 3s)
      await new Promise(r => setTimeout(r, 3000));
      setTyping(false);
      setStep(2);

      // Step 4: Logic Panel appears (after 1s)
      await new Promise(r => setTimeout(r, 1000));
      setStep(3);

      // Reset after 5s
      await new Promise(r => setTimeout(r, 5000));
      sequence();
    };

    sequence();
  }, []);

  return (
    <div className="w-full h-full bg-[#f0f2f5] dark:bg-[#0b141a] flex flex-col relative shadow-2xl overflow-hidden group">
      {/* WhatsApp Header */}
      <div className="bg-[#00a884] dark:bg-[#202c33] p-3 flex items-center justify-between shadow-md relative z-20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-slate-300 overflow-hidden border border-white/20">
              <User className="w-full h-full p-2 text-slate-600" />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#202c33] rounded-full"></div>
          </div>
          <div className="flex flex-col">
            <span className="text-white font-semibold text-sm leading-tight">Consultor Prisma IA</span>
            <span className="text-white/80 text-[10px]">
              {typing ? "escribiendo..." : "en línea"}
            </span>
          </div>
        </div>
        <div className="flex gap-4 text-white/80">
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="w-2 h-2 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Chat Body */}
      <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat opacity-95 relative">
        <div className="absolute inset-0 bg-slate-100/50 dark:bg-black/40 -z-10" />

        {/* Date Divider */}
        <div className="self-center bg-white/80 dark:bg-slate-800 px-3 py-1 rounded-lg text-[10px] text-slate-500 font-medium shadow-sm mb-2 uppercase tracking-wider">
          Hoy
        </div>

        {/* User Message */}
        <div className={`flex flex-col gap-1 transition-all duration-700 transform ${step >= 1 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
          <div className="bg-white dark:bg-[#202c33] p-3 rounded-2xl rounded-tl-none shadow-md max-w-[85%] self-start relative group/msg">
            <p className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
              Hola! Vi el depto de 3 ambientes en Belgrano que publicaron en Zonaprop. ¿Sigue disponible? Me interesa visitarlo.
            </p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[9px] text-slate-400">10:42</span>
            </div>
          </div>
        </div>

        {/* AI Message */}
        <div className={`flex flex-col gap-1 transition-all duration-700 delay-300 transform ${step >= 2 ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}`}>
          <div className="bg-[#dcf8c6] dark:bg-[#005c4b] p-3 rounded-2xl rounded-tr-none shadow-md max-w-[85%] self-end relative border-l-4 border-accent">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-black/5 dark:border-white/5">
              <div className="p-1 bg-accent/20 rounded-md">
                <Brain className="w-3 h-3 text-accent" />
              </div>
              <span className="text-[9px] font-black text-accent uppercase tracking-widest">IA Real Estate Agent</span>
            </div>
            <p className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-100 font-medium">
              ¡Hola! Sí, el depto en Av. Cabildo 1400 sigue disponible. Es un piso alto con vista abierta. 
              <br/><br/>
              Contamos con llaves. ¿Te queda bien hoy a las 17hs o preferís mañana por la mañana?
            </p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[9px] text-slate-500/70">10:42</span>
              <CheckCheck className="w-3 h-3 text-blue-500" />
            </div>
          </div>
        </div>

        {/* Lead Qualification Panel (The "Magic" part) */}
        <div className={`mt-2 transition-all duration-1000 transform ${step >= 3 ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}>
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-accent/30 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <Brain className="w-12 h-12 text-accent" />
            </div>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <Plus className="w-4 h-4 text-accent" />
              </div>
              <div>
                <div className="text-[10px] font-black text-accent uppercase tracking-tighter leading-none">Acción Automática</div>
                <div className="text-sm font-bold">Lead Sincronizado</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-2 rounded-xl bg-accent/5 border border-accent/10">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">CRM</span>
                <span className="text-[11px] font-black">Tokko Sincronizado</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[9px] text-muted-foreground uppercase font-bold mb-1">Score</div>
                  <div className="text-sm font-black text-green-500">9.5/10</div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[9px] text-muted-foreground uppercase font-bold mb-1">Intención</div>
                  <div className="text-sm font-black">Alta (Visita)</div>
                </div>
              </div>
            </div>
            
            {/* Pulsing indicator */}
            <div className="mt-4 flex items-center justify-center gap-2 py-2 bg-accent text-white rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse">
              <CheckCheck className="w-3 h-3" />
              Actualizando Pipeline
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Input Footer */}
      <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-3 flex items-center gap-3 relative z-20">
        <div className="flex gap-3 text-slate-500">
          <Smile className="w-6 h-6" />
          <Paperclip className="w-6 h-6" />
        </div>
        <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-xl px-4 py-2 text-slate-400 text-sm shadow-sm">
          Mensaje
        </div>
        <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center shadow-lg">
          <Mic className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}
