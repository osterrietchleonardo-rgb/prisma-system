"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, AlertTriangle, UserCheck } from "lucide-react";
import React from "react";
import { Lead } from "@/lib/tracking/types";
import { differenceInDays } from "date-fns";

interface Props {
  leads: Lead[];
  isDirector: boolean;
}

export function TrackingAlerts({ leads, isDirector }: Props) {
  if (!isDirector) return null;

  const alerts: React.ReactNode[] = [];

  // Group by user
  const userLeads: Record<string, Lead[]> = {};
  leads.forEach(l => {
    if (!l.user_id) return;
    if (!userLeads[l.user_id]) userLeads[l.user_id] = [];
    userLeads[l.user_id].push(l);
  });

  // Calculate conditions
  Object.keys(userLeads).forEach(uid => {
    const uLeads = userLeads[uid];
    const name = uLeads[0].nombre_lead === "TEST" ? "Asesor" : "Asesor " + uid.slice(0, 4); // Fallback mock name logic

    // ROJA - Leads sin trabajar (>25% sin actividad en 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const inactiveLeads = uLeads.filter(l => l.estado === "activo" && new Date(l.updated_at) < sevenDaysAgo);
    
    if (uLeads.length > 0 && (inactiveLeads.length / uLeads.length) > 0.25) {
      alerts.push(
        <Alert variant="destructive" className="bg-red-500/10 border-red-500 text-red-700 font-medium" key={`red-${uid}`}>
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-xs uppercase font-bold tracking-wider">Leads sin trabajar</AlertTitle>
          <AlertDescription className="text-xs">
            {name} tiene {inactiveLeads.length} leads sin actividad hace más de 7 días.
          </AlertDescription>
        </Alert>
      );
    }

    // AMARILLA - Tiempo de respuesta alto (>60m)
    const respLeads = uLeads.filter(l => l.wa_tiempo_respuesta_inicial_min !== null);
    const avgResp = respLeads.length > 0 ? respLeads.reduce((a, l) => a + (l.wa_tiempo_respuesta_inicial_min || 0), 0) / respLeads.length : 0;
    if (avgResp > 60) {
      alerts.push(
        <Alert key={`yellow-resp-${uid}`} className="bg-yellow-500/5 border-yellow-500 text-yellow-700 font-medium border">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-xs uppercase font-bold tracking-wider">Tiempo de respuesta alto</AlertTitle>
          <AlertDescription className="text-xs">
            El promedio de 1ra respuesta de {name} es de {avgResp.toFixed(0)} minutos.
          </AlertDescription>
        </Alert>
      );
    }

    // ROJA - Score WA Crítico (<5)
    const scoredLeads = uLeads.filter(l => l.wa_score_general !== undefined && l.wa_score_general !== null);
    const avgScore = scoredLeads.length > 0 ? scoredLeads.reduce((a, l) => a + (l.wa_score_general || 0), 0) / scoredLeads.length : 0;
    if (scoredLeads.length > 0 && avgScore < 5) {
       alerts.push(
        <Alert variant="destructive" className="bg-red-500/10 border-red-500 text-red-700 font-medium" key={`red-score-${uid}`}>
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-xs uppercase font-bold tracking-wider">Score WA Crítico</AlertTitle>
          <AlertDescription className="text-xs">
            Desempeño comercial de {name} por debajo del mínimo (Score: {avgScore.toFixed(1)}).
          </AlertDescription>
        </Alert>
      );
    }
  });

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-red-500 mb-2">
         <AlertCircle className="w-4 h-4 ml-1" />
         <span className="text-xs font-bold uppercase tracking-widest">Alertas de Performance</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {alerts}
      </div>
    </div>
  );
}
