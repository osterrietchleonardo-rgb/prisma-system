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
  TrendingUp,
  Target,
  ShoppingCart,
  Home,
  CheckCircle2,
  DollarSign,
  Briefcase,
  Layers,
  ArrowDownCircle,
  Edit2,
  Trash2
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
  onEdit?: (log: PerformanceLog) => void;
  onDelete?: (log: PerformanceLog) => void;
  isDirector?: boolean;
}

export function PerformanceHistoryList({ logs, onRefresh, onEdit, onDelete, isDirector = false }: Props) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const getTypeBadge = (type: string) => {
    const map: Record<string, { label: string; class: string; icon: any }> = {
      prospeccion: { label: "Prospección", class: "bg-blue-500/10 text-blue-600 border-blue-200", icon: TrendingUp },
      prelisting: { label: "Prelisting", class: "bg-purple-500/10 text-purple-600 border-purple-200", icon: Target },
      prebuying: { label: "Prebuying", class: "bg-orange-500/10 text-orange-600 border-orange-200", icon: ShoppingCart },
      captacion: { label: "Captación", class: "bg-indigo-500/10 text-indigo-600 border-indigo-200", icon: Home },
      reserva: { label: "Reserva", class: "bg-amber-500/10 text-amber-600 border-amber-200", icon: ArrowDownCircle },
      cierre: { label: "Cierre", class: "bg-emerald-500/10 text-emerald-600 border-emerald-200", icon: CheckCircle2 },
    };
    const t = map[type] || { label: type, class: "bg-muted text-muted-foreground", icon: Activity };
    const Icon = t.icon;
    return (
      <Badge variant="outline" className={`${t.class} font-semibold flex items-center gap-1 w-fit`}>
        <Icon className="w-3 h-3" />
        {t.label}
      </Badge>
    );
  };

  const calculateGap = (log: PerformanceLog) => {
    if (log.type !== "reserva") return null;
    const publicado = log.metadata?.valor_publicacion_actual;
    const ofertado = log.monto_operacion;
    if (!publicado || !ofertado) return null;
    const gap = ((publicado - ofertado) / publicado) * 100;
    return gap.toFixed(1) + "%";
  };

  const calculateGCI = (log: PerformanceLog) => {
    if (log.type !== "cierre") return null;
    const valor = log.monto_operacion;
    const honorarios = log.comision_generada;
    if (!valor || !honorarios) return null;
    return (valor * honorarios / 100).toLocaleString();
  };

  return (
    <div className="border rounded-xl bg-background shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-10"></TableHead>
            {isDirector && <TableHead>Asesor</TableHead>}
            <TableHead>Fecha</TableHead>
            <TableHead>Actividad</TableHead>
            <TableHead>Activos Vinculados</TableHead>
            <TableHead className="text-right">Monto / Valor</TableHead>
            <TableHead className="text-center">Métrica Clave</TableHead>
            {isDirector && <TableHead className="text-center">Estado</TableHead>}
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isDirector ? 9 : 7} className="h-48 text-center text-muted-foreground">
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
                  {isDirector && (
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold truncate max-w-[150px]">{log.profiles?.full_name || "-"}</span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">{log.profiles?.email || ""}</span>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-xs font-medium">
                    {format(new Date(log.fecha_actividad), "dd MMM yyyy", { locale: es })}
                  </TableCell>
                  <TableCell>{getTypeBadge(log.type)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {log.properties ? (
                        <span className="text-sm font-medium text-foreground/90 truncate max-w-[200px] flex items-center gap-1" title={log.properties.title || log.properties.address}>
                          <Home className="w-3 h-3 text-accent" /> {log.properties.title || log.properties.address || "Propiedad vinculada"}
                        </span>
                      ) : log.propiedad_ref ? (
                        <span className="text-sm font-medium text-foreground/70 truncate max-w-[200px]">
                          {log.propiedad_ref}
                        </span>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">-</span>
                      )}
                      
                      {log.leads ? (
                        <span className="text-[10px] text-blue-400 font-semibold truncate max-w-[200px] flex items-center gap-1" title={log.leads.full_name}>
                          👤 {log.leads.full_name}
                        </span>
                      ) : log.wa_contacts ? (
                        <span className="text-[10px] text-emerald-500 font-semibold truncate max-w-[200px] flex items-center gap-1" title={log.wa_contacts.name || log.wa_contacts.phone}>
                          💬 {log.wa_contacts.name || log.wa_contacts.phone}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold">
                    {log.monto_operacion ? `USD ${log.monto_operacion.toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {log.type === "reserva" && (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 border-amber-100 font-bold">
                        Gap: {calculateGap(log)}
                      </Badge>
                    )}
                    {log.type === "cierre" && (
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 border-emerald-100 font-bold">
                        GCI: USD {calculateGCI(log)}
                      </Badge>
                    )}
                    {log.type === "captacion" && (
                      <span className="text-[10px] uppercase font-bold text-indigo-500">{log.metadata?.condicion_captacion}</span>
                    )}
                    {log.type === "prospeccion" && (
                      <span className="text-[10px] uppercase font-bold text-blue-500">{log.metadata?.origen}</span>
                    )}
                  </TableCell>
                  {isDirector && (
                    <TableCell className="text-center">
                      <Badge 
                        variant={log.status === 'eliminada' ? 'destructive' : log.status === 'modificada' ? 'default' : 'outline'}
                        className="uppercase text-[10px] tracking-wider"
                      >
                        {log.status || 'original'}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="group-hover:bg-background">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2" onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}>
                          <Eye className="w-4 h-4" /> Ver Detalles
                        </DropdownMenuItem>
                        {onEdit && (
                          <DropdownMenuItem className="gap-2" onClick={(e) => {
                            e.stopPropagation();
                            onEdit(log);
                          }}>
                            <Edit2 className="w-4 h-4" /> Editar Actividad
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10" onClick={(e) => {
                            e.stopPropagation();
                            onDelete(log);
                          }}>
                            <Trash2 className="w-4 h-4" /> Eliminar Actividad
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                
                {expandedRow === log.id && (
                  <TableRow className="bg-muted/10 hover:bg-muted/10 border-none animate-in fade-in slide-in-from-top-2">
                    <TableCell colSpan={7} className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Detalles de Actividad */}
                        <div className="space-y-4">
                           <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                             <Briefcase className="w-3 h-3 text-accent" /> DETALLES DE ACTIVIDAD
                           </h4>
                           <div className="grid grid-cols-2 gap-y-3">
                              {Object.entries(log.metadata || {}).map(([key, value]) => (
                                <React.Fragment key={key}>
                                  <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}:</span>
                                  <span className="text-xs font-semibold">{value?.toString() || "-"}</span>
                                </React.Fragment>
                              ))}
                              {log.comision_generada !== null && (
                                <>
                                  <span className="text-xs text-muted-foreground">
                                    {log.type === "cierre" || log.type === "captacion" ? "Honorarios (%):" : "Comisión:"}
                                  </span>
                                  <span className="text-xs font-semibold">
                                    {log.type === "cierre" || log.type === "captacion" ? `${log.comision_generada}%` : `$${log.comision_generada}`}
                                  </span>
                                </>
                              )}
                           </div>
                        </div>

                        {/* Métrica de Negocio */}
                        <div className="space-y-4">
                           <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                             <Layers className="w-3 h-3 text-blue-500" /> IMPACTO EN NEGOCIO
                           </h4>
                           <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 space-y-3">
                              {log.type === "reserva" && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">Gap de Negociación</p>
                                  <p className="text-xl font-black text-amber-700">{calculateGap(log)}</p>
                                  <p className="text-[10px] text-muted-foreground">Diferencia entre valor publicado y oferta.</p>
                                </div>
                              )}
                              {log.type === "cierre" && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight">GCI Generado</p>
                                  <p className="text-xl font-black text-emerald-700">USD {calculateGCI(log)}</p>
                                  <p className="text-[10px] text-muted-foreground">Facturación bruta total de la transacción.</p>
                                </div>
                              )}
                              {log.type === "captacion" && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight">Calidad de Inventario</p>
                                  <p className="text-lg font-bold text-indigo-700">{log.metadata?.condicion_captacion}</p>
                                  <p className="text-[10px] text-muted-foreground">Captación estratégica para el pipeline.</p>
                                </div>
                              )}
                              {!["reserva", "cierre", "captacion"].includes(log.type) && (
                                <p className="text-xs italic text-muted-foreground">
                                  Actividad registrada para seguimiento de volumen de {log.type}.
                                </p>
                              )}
                           </div>
                        </div>
                      </div>
                      
                      {log.status_reason && log.status !== 'original' && (
                        <div className="mt-4 p-4 bg-muted/30 border rounded-lg">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
                            <Activity className="w-3 h-3" /> Motivo ({log.status})
                          </h4>
                          <p className="text-sm text-foreground/80">{log.status_reason}</p>
                        </div>
                      )}
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
