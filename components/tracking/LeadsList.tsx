"use client";

import React, { useState } from "react";
import { Lead } from "@/lib/tracking/types";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronUp, 
  MoreHorizontal, 
  Eye, 
  Edit2, 
  Activity, 
  MessageCircle,
  Calendar,
  CheckCircle2,
  Clock
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  leads: Lead[];
  onRefresh: () => void;
}

export function LeadsList({ leads, onRefresh }: Props) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; class: string }> = {
      activo: { label: "Activo", class: "bg-blue-500/10 text-blue-600 border-blue-200" },
      visita_agendada: { label: "Visita", class: "bg-purple-500/10 text-purple-600 border-purple-200" },
      en_negociacion: { label: "Negociación", class: "bg-orange-500/10 text-orange-600 border-orange-200" },
      cerrado: { label: "Cerrado", class: "bg-green-500/10 text-green-600 border-green-200" },
      perdido: { label: "Perdido", class: "bg-red-500/10 text-red-600 border-red-200" },
    };
    const s = map[status] || { label: status, class: "" };
    return <Badge variant="outline" className={`${s.class} font-semibold`}>{s.label}</Badge>;
  };

  const getWaScore = (score?: number | null) => {
    if (score === undefined || score === null) return <span className="text-muted-foreground">-</span>;
    let color = "text-red-500";
    if (score >= 7) color = "text-green-500";
    else if (score >= 4) color = "text-yellow-500";
    return <span className={`font-bold ${color}`}>{score}/10</span>;
  };

  return (
    <div className="border rounded-xl bg-background shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Nombre Lead</TableHead>
            <TableHead className="hidden md:table-cell">Ingreso</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Score WA</TableHead>
            <TableHead className="hidden lg:table-cell">Ult. Actividad</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <Activity className="w-8 h-8 opacity-20" />
                  <p>No se encontraron leads cargados.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <React.Fragment key={lead.id}>
                <TableRow 
                  className={`group hover:bg-muted/20 transition-colors cursor-pointer ${expandedRow === lead.id ? "bg-muted/20" : ""}`}
                  onClick={() => setExpandedRow(expandedRow === lead.id ? null : lead.id)}
                >
                  <TableCell>
                    {expandedRow === lead.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-semibold">{lead.nombre_lead}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {format(new Date(lead.fecha_primer_contacto), "dd MMM yyyy", { locale: es })}
                  </TableCell>
                  <TableCell>{getStatusBadge(lead.estado)}</TableCell>
                  <TableCell>{getWaScore(lead.wa_score_general)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {format(new Date(lead.updated_at), "dd/MM/yy HH:mm", { locale: es })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="group-hover:bg-background">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Eye className="w-4 h-4" /> Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Edit2 className="w-4 h-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-accent font-medium">
                          <Activity className="w-4 h-4" /> Registrar Actividad
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                
                {expandedRow === lead.id && (
                  <TableRow className="bg-muted/10 hover:bg-muted/10 border-none animate-in fade-in slide-in-from-top-2">
                    <TableCell colSpan={7} className="p-4 md:p-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Resumen Métricas */}
                        <div className="space-y-4">
                           <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                             <MessageCircle className="w-3 h-3" /> Métricas de WhatsApp
                           </h4>
                           <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 rounded-lg bg-background border">
                                <p className="text-[10px] text-muted-foreground uppercase">T. de Respuesta</p>
                                <p className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
                                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                                  {lead.wa_tiempo_respuesta_promedio_min ?? "-"}m
                                </p>
                              </div>
                              <div className="p-3 rounded-lg bg-background border">
                                <p className="text-[10px] text-muted-foreground uppercase">Ratio Conversación</p>
                                <p className="text-sm font-bold mt-0.5">{lead.wa_ratio ?? "0"} <span className="text-[9px] font-normal text-muted-foreground">msgs x lado</span></p>
                              </div>
                           </div>
                        </div>

                        {/* Hitos */}
                        <div className="space-y-4">
                           <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                             <Activity className="w-3 h-3" /> Hitos Completados
                           </h4>
                           <div className="space-y-2.5">
                              <TimelineItem label="Visita Realizada" active={lead.visita_realizada} subtext={lead.fecha_visita ? format(new Date(lead.fecha_visita), "dd/MM/yy") : ""} />
                              <TimelineItem label="Propuesta Enviada" active={lead.propuesta_enviada} subtext={lead.propiedad_ofrecida} />
                           </div>
                        </div>

                        {/* IA Summary */}
                        <div className="space-y-4">
                           <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                             <Activity className="w-3 h-3" /> Feedback IA
                           </h4>
                           <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
                              <p className="text-sm italic text-foreground/80">
                                {lead.wa_resumen || "Análisis cualitativo pendiente de procesamiento."}
                              </p>
                           </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function TimelineItem({ label, active, subtext }: any) {
  return (
    <div className="flex items-center gap-3">
       <div className={`w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-muted-foreground/30 shadow-inner"}`} />
       <div className="flex flex-col">
         <span className={`text-sm ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
         {subtext && <span className="text-[10px] text-muted-foreground">{subtext}</span>}
       </div>
       {active && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-auto" />}
    </div>
  );
}
