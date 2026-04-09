"use client";

import { KPIData } from "@/lib/tracking/types";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, DollarSign, Users, Award } from "lucide-react";

interface Props {
  data: KPIData;
}

export function TrackingKPIs({ data }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Operaciones Cerradas"
        value={data.operacionesActual}
        variation={data.operacionesVar}
        icon={<Target className="w-5 h-5" />}
        color="accent"
      />
      <KPICard
        title="Comisión Generada"
        value={`$ ${data.comisionActual.toLocaleString("es-AR")}`}
        variation={data.comisionVar}
        icon={<DollarSign className="w-5 h-5" />}
        color="green"
      />
      <KPICard
        title="Leads Captados"
        value={data.leadsCaptadosActual}
        variation={data.leadsCaptadosVar}
        icon={<Users className="w-5 h-5" />}
        color="purple"
      />
      <KPICard
        title="Score WA Promedio"
        value={`${data.scorePromedioActual.toFixed(1)}/10`}
        variation={data.scorePromedioVar}
        icon={<Award className="w-5 h-5" />}
        color={data.scorePromedioActual >= 7 ? "green" : data.scorePromedioActual >= 4 ? "yellow" : "red"}
      />
    </div>
  );
}

function KPICard({ title, value, variation, icon, color }: any) {
  const isPositive = variation > 0;
  const isNeutral = variation === 0;

  const colorMap: any = {
    accent: "text-accent bg-accent/10",
    blue: "text-primary bg-primary/10",
    green: "text-green-500 bg-green-500/10",
    purple: "text-purple-500 bg-purple-500/10",
    yellow: "text-yellow-500 bg-yellow-500/10",
    red: "text-red-500 bg-red-500/10",
  };

  return (
    <Card className="p-6 relative overflow-hidden bg-background/50 hover:bg-muted/10 transition-all border-muted-foreground/10 group">
      <div className={`p-2.5 rounded-xl w-fit mb-4 transition-transform group-hover:scale-110 ${colorMap[color] || ""}`}>
        {icon}
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <div className="flex items-baseline justify-between mt-1">
        <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
        {!isNeutral && (
          <div className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isPositive ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"}`}>
            {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
            {Math.abs(variation).toFixed(1)}%
          </div>
        )}
      </div>
      <div className={`absolute bottom-0 left-0 h-1 transition-all ${colorMap[color]} w-full opacity-30 mt-4 outline-none`} />
    </Card>
  );
}
