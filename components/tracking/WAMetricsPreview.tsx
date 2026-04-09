"use client";

import { WAMetrics, WAAnalysis } from "@/lib/tracking/types";
import { Card } from "@/components/ui/card";
import { Loader2, Zap, Clock, MessageSquare, TrendingUp, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface Props {
  quant: WAMetrics | null;
  qual: WAAnalysis | null;
  isAnalyzing: boolean;
}

export function WAMetricsPreview({ quant, qual, isAnalyzing }: Props) {
  if (!quant) return null;

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="1ra Respuesta"
          value={quant.wa_tiempo_respuesta_inicial_min !== null ? `${quant.wa_tiempo_respuesta_inicial_min}m` : "-"}
          icon={<Zap className="w-3.5 h-3.5 text-yellow-500" />}
          description="Desde el 1er mensaje del lead"
        />
        <MetricCard
          label="Prom. Respuesta"
          value={quant.wa_tiempo_respuesta_promedio_min !== null ? `${quant.wa_tiempo_respuesta_promedio_min}m` : "-"}
          icon={<Clock className="w-3.5 h-3.5 text-blue-500" />}
          description="Solo en horario laboral (<8h)"
        />
        <MetricCard
          label="Total Mensajes"
          value={quant.wa_total_mensajes ?? 0}
          icon={<MessageSquare className="w-3.5 h-3.5 text-accent" />}
        />
        <MetricCard
          label="Ratio MSGs"
          value={quant.wa_ratio ?? 0}
          icon={<TrendingUp className="w-3.5 h-3.5 text-green-500" />}
          description="Tus msgs / msgs del lead"
        />
      </div>

      <div className="bg-muted/50 rounded-xl p-4 border space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            Análisis Cualitativo (IA)
            {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
          </h4>
          {!qual && !isAnalyzing && (
            <Badge variant="outline" className="text-[10px]">Sin datos</Badge>
          )}
        </div>

        {isAnalyzing ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        ) : qual ? (
          <div className="space-y-3 animate-in fade-in">
             <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{qual.tono}</Badge>
                <Badge variant="secondary">Personalización {qual.nivel_personalizacion}</Badge>
                {qual.score_general && (
                  <Badge className={qual.score_general >= 7 ? "bg-green-500/10 text-green-600 hover:bg-green-500/20" : "bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20"}>
                    Score: {qual.score_general}/10
                  </Badge>
                )}
             </div>
             <p className="text-sm text-foreground/80 italic">"{qual.resumen}"</p>
             <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <StatusItem label="Ofreció visita" checked={qual.ofrecio_visita} />
                <StatusItem label="Nombre del lead" checked={qual.uso_nombre_lead} />
                <StatusItem label="Escucha activa" checked={qual.escucha_activa} />
                <StatusItem label="Seguimiento" checked={qual.seguimiento_activo} />
             </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            Subí el chat y seleccioná al asesor para ver este análisis.
          </p>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, description }: any) {
  return (
    <Card className="p-3 bg-background/50 border-muted-foreground/10 hover:border-accent/20 transition-all">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-foreground leading-none">{value}</span>
      </div>
      {description && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="text-[9px] text-muted-foreground/60 block truncate mt-1 text-left">
              {description}
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-[10px]">{description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Card>
  );
}

function StatusItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-1.5 h-1.5 rounded-full ${checked ? "bg-green-500" : "bg-muted-foreground/30"}`} />
      <span className={checked ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
