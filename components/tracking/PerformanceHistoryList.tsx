"use client";

import React, { useState } from "react";
import { PerformanceLog } from "@/lib/tracking/types";
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
  Activity, 
  MessageCircle,
  Clock,
  Home,
  CheckCircle2,
  DollarSign
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
  logs: PerformanceLog[];
  onRefresh: () => void;
}

export function PerformanceHistoryList({ logs, onRefresh }: Props) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const getTypeBadge = (type: string) => {
    const map: Record<string, { label: string; class: string; icon: any }> = {
      captacion: { label: "Captación", class: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Home },
      transaccion: { label: "Transacción", class: "bg-green-500/10 text-green-600 border-green-200", icon: CheckCircle2 },
      lead_seguimiento: { label: "Seguimiento", class: "bg-orange-500/10 text-orange-600 border-orange-200", icon: MessageCircle },
      otro: { label: "Otro", class: "bg-muted text-muted-foreground", icon: Activity },
    };
    const t = map[type] || { label: type, class: "", icon: Activity };
    const Icon = t.icon;
    return (
      <Badge variant="outline" className={`${t.class} font-semibold flex items-center gap-1 w-fit`}>
        <Icon className="w-3 h-3" />
        {t.label}
      </Badge>
    );
  };

  const getScoreBadge = (score?: number | null) => {
    if (score === undefined || score === null) return <span className="text-muted-foreground">-</span>;
    let color = "text-red-500";
    if (score >= 8) color = "text-green-500";
    else if (score >= 5) color = "text-yellow-500";
    return <span className={`font-bold ${color}`}>{score}/10</span>;
  };

  return (
    <div className="border rounded-xl bg-background shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente / Ref</TableHead>
            <TableHead className="text-right">Monto / Comisión</TableHead>
            <TableHead>Score IA</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <Activity className="w-8 h-8 opacity-20" />
                  <p>No hay registros de actividad aún.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <React.Fragment key={log.id}>
                <TableRow 
                  className={`group hover:bg-muted/20 transition-colors cursor-pointer ${expandedRow === log.id ? "bg-muted/20" : ""}`}
                  onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                >
                  <TableCell>
                    {expandedRow === log.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {format(new Date(log.fecha_actividad), "dd MMM yyyy", { locale: es })}
                  </TableCell>
                  <TableCell>{getTypeBadge(log.type)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{log.nombre_cliente}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{log.propiedad_ref}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {log.comision_generada ? `$${log.comision_generada.toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell>{getScoreBadge(log.ai_rating)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="group-hover:bg-background">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Eye className="w-4 h-4" /> Ver Detalles
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                
                {expandedRow === log.id && (
                  <TableRow className="bg-muted/10 hover:bg-muted/10 border-none animate-in fade-in slide-in-from-top-2">
                    <TableCell colSpan={7} className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Info Financiera */}
                        <div className="space-y-4">
                           <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                             <DollarSign className="w-3 h-3 text-green-500" /> RESUMEN ECONÓMICO
                           </h4>
                           <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Monto Operación:</span>
                                <span className="font-bold">${log.monto_operacion?.toLocaleString() ?? 0}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Comisión Generada:</span>
                                <span className="font-bold text-green-600">${log.comision_generada?.toLocaleString() ?? 0}</span>
                              </div>
                              {log.fecha_cierre && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Fecha Cierre:</span>
                                  <span className="font-medium">{format(new Date(log.fecha_cierre), "dd/MM/yyyy")}</span>
                                </div>
                              )}
                           </div>
                        </div>

                        {/* Feedback IA */}
                        <div className="space-y-4">
                           <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                             <Activity className="w-3 h-3 text-blue-500" /> EVALUACIÓN SISTEMA
                           </h4>
                           <div className="p-4 rounded-xl bg-accent/5 border border-accent/10">
                              <p className="text-xs italic leading-relaxed text-foreground/80">
                                {log.ai_feedback || "Calificación automática basada en métricas de cumplimiento."}
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
