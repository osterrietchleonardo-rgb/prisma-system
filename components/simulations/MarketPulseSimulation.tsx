"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp, MapPin, Building2, ArrowUpRight } from "lucide-react";

export default function MarketPulseSimulation() {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setPercent(84), 500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="w-full aspect-video md:aspect-square bg-card border border-accent/20 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-50" />
      
      {/* Header */}
      <div className="flex justify-between items-start mb-8 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-accent/10 rounded-lg text-accent">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-accent uppercase tracking-[0.2em]">Pulso de Mercado</span>
          </div>
          <h3 className="text-xl font-black">Palermo Hollywood</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-green-600">+4.2%</div>
          <div className="text-[10px] text-muted-foreground uppercase font-bold">Interanual</div>
        </div>
      </div>

      {/* Chart Simulation */}
      <div className="relative h-40 w-full mb-8 flex items-end gap-2 relative z-10">
        {[40, 60, 55, 80, 70, 90, 85].map((h, i) => (
          <div key={i} className="flex-1 bg-accent/20 rounded-t-lg relative group/bar transition-all duration-1000" style={{ height: `${percent > 0 ? h : 0}%` }}>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity">
              ${(h * 100).toLocaleString()}
            </div>
          </div>
        ))}
        {/* Line overlay */}
        <div className="absolute inset-0 border-b border-dashed border-accent/20" />
      </div>

      {/* Insights */}
      <div className="grid grid-cols-2 gap-4 relative z-10">
        <div className="p-4 rounded-2xl bg-accent/5 border border-accent/10 hover:border-accent/30 transition-all">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-foreground">Stock Activo</span>
          </div>
          <div className="text-2xl font-black">1.240</div>
          <div className="text-[10px] text-muted-foreground">Deptos. 2 Amb</div>
        </div>
        <div className="p-4 rounded-2xl bg-accent/5 border border-accent/10 hover:border-accent/30 transition-all">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-foreground">Precio m²</span>
          </div>
          <div className="text-2xl font-black">U$S 3.250</div>
          <div className="text-[10px] text-muted-foreground">Promedio Zona</div>
        </div>
      </div>

      {/* Floating Action Button Simulation */}
      <div className="mt-6 flex items-center justify-between p-4 rounded-2xl bg-foreground text-background shadow-xl">
        <span className="text-sm font-bold">Generar Reporte IA</span>
        <ArrowUpRight className="w-5 h-5 text-accent" />
      </div>

      {/* Decorative Blur */}
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-accent/20 rounded-full blur-[60px]" />
    </div>
  );
}
