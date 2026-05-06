"use client";

import React, { useEffect, useState } from "react";
import { Users, Target, Activity, Star } from "lucide-react";

export default function DashboardSimulation() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((a) => (a + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const advisors = [
    { name: "Julian Rossi", sales: 4, leads: 24, status: "Activo" },
    { name: "Marta Gomez", sales: 2, leads: 18, status: "En Visita" },
    { name: "Lucas Paz", sales: 7, leads: 31, status: "Activo" }
  ];

  return (
    <div className="w-full bg-card border border-accent/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-2xl font-black">Performance del Equipo</h3>
        <div className="flex gap-2">
          <div className="px-3 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase">Mayo 2026</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-8">
        {advisors.map((adv, i) => (
          <div 
            key={i} 
            className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-500 ${active === i ? "bg-accent/10 border-accent/40 scale-[1.02] shadow-lg" : "bg-background/50 border-accent/5 opacity-70"}`}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center font-bold text-accent">
                {adv.name.charAt(0)}
              </div>
              <div>
                <div className="font-bold">{adv.name}</div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{adv.status}</div>
              </div>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <div className="text-lg font-black text-foreground">{adv.sales}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Ventas</div>
              </div>
              <div>
                <div className="text-lg font-black text-accent">{adv.leads}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Leads</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-foreground text-background p-6 rounded-3xl flex flex-col gap-2">
          <Target className="w-6 h-6 text-accent mb-2" />
          <div className="text-3xl font-black">+24%</div>
          <div className="text-[10px] text-accent font-bold uppercase tracking-widest">Cumplimiento de Meta</div>
        </div>
        <div className="bg-accent text-white p-6 rounded-3xl flex flex-col gap-2">
          <Activity className="w-6 h-6 text-white/50 mb-2" />
          <div className="text-3xl font-black">8.4</div>
          <div className="text-[10px] text-white/70 font-bold uppercase tracking-widest">NPS Promedio</div>
        </div>
      </div>

      {/* Floating element */}
      <div className={`absolute top-20 right-4 glass p-4 rounded-2xl shadow-2xl transition-all duration-700 transform ${active === 2 ? "translate-x-0 opacity-100" : "translate-x-10 opacity-0"}`}>
        <div className="flex items-center gap-2">
          <Star className="text-yellow-500 fill-yellow-500 w-4 h-4" />
          <span className="text-xs font-bold">¡Nueva Captación!</span>
        </div>
      </div>
    </div>
  );
}
