"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Search, Filter, Download, MoreVertical, Eye, Edit, Mail, 
  MessageCircle, Phone as PhoneIcon, User, AlertTriangle, ArrowUp, ArrowDown 
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { NormalizedLead, TokkoTag } from "./tokko-leads-utils";
import { CHANNEL_COLORS, CLIENT_TYPE_COLORS, OPERATION_COLORS, STATUS_COLORS } from "./tags.config";
import { cn } from "@/lib/utils";
import { KANBAN_STAGES } from "@/components/kanban/types";
import { updateLeadStage } from "@/lib/queries/director";
import { toast } from "sonner";

interface LeadsTableProps {
  leads: NormalizedLead[];
  loading: boolean;
  tagsByGroup: Record<string, TokkoTag[]>;
}

export function LeadsTable({ leads, loading, tagsByGroup }: LeadsTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const itemsPerPage = 25;
  const router = useRouter();

  const [sortConfig, setSortConfig] = useState<{ key: keyof NormalizedLead | 'dias_en_sistema' | 'created_at', direction: 'asc' | 'desc' } | null>({
    key: 'created_at',
    direction: 'desc'
  });

  const [filters, setFilters] = useState({
    status: "all",
    agent: "all",
    origin: "all",
    clientType: "all",
    propertyType: "all",
    operation: "all",
    structural: "all",
  });

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<NormalizedLead | null>(null);
  const searchParams = useSearchParams();
  const leadIdFromUrl = searchParams.get("leadId");

  // Handle leadId from URL to open the modal
  useEffect(() => {
    if (leadIdFromUrl && leads.length > 0) {
      const lead = leads.find(l => l.id.toString() === leadIdFromUrl);
      if (lead) {
        setSelectedLead(lead);
      }
    }
  }, [leadIdFromUrl, leads]);

  const handleStageChange = async (leadId: string, newStage: string) => {
    try {
      await updateLeadStage(leadId, newStage);
      toast.success("Etapa del pipeline actualizada");
      router.refresh();
    } catch (error) {
      toast.error("Error al actualizar la etapa");
    }
  };

  const activeAgents = useMemo(() => {
    const agentsMap = new Map();
    leads.forEach(l => {
      if (l.agent && l.agent.id) {
        agentsMap.set(l.agent.id, { 
          id: l.agent.id, 
          name: l.agent.name, 
          isActive: l.agente_activo 
        });
      }
    });
    return Array.from(agentsMap.values());
  }, [leads]);

  const toggleSort = (key: keyof NormalizedLead | 'dias_en_sistema' | 'created_at') => {
    setSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedAndFilteredLeads = useMemo(() => {
    let result = [...leads];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l => 
        l.nombre_mostrar.toLowerCase().includes(q) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.other_email && l.other_email.toLowerCase().includes(q)) ||
        (l.work_email && l.work_email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q)) ||
        (l.cellphone && l.cellphone.includes(q)) ||
        (l.other_phone && l.other_phone.includes(q))
      );
    }

    if (filters.status !== "all") {
      result = result.filter(l => l.lead_status === filters.status);
    }
    if (filters.agent !== "all") {
      result = result.filter(l => l.agent?.id?.toString() === filters.agent);
    }
    if (filters.origin !== "all") {
      result = result.filter(l => l.origen === filters.origin);
    }
    if (filters.clientType !== "all") {
      result = result.filter(l => l.tipo_cliente === filters.clientType);
    }
    if (filters.propertyType !== "all") {
      result = result.filter(l => l.tipo_propiedad.includes(filters.propertyType));
    }
    if (filters.operation !== "all") {
      result = result.filter(l => l.operacion === filters.operation);
    }
    if (filters.structural !== "all") {
       if (filters.structural === "is_owner") result = result.filter(l => l.is_owner);
       if (filters.structural === "is_company") result = result.filter(l => l.es_corporativo);
       if (filters.structural === "comprador") result = result.filter(l => !l.is_owner && !l.es_corporativo);
    }

    if (sortConfig) {
      result.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof NormalizedLead];
        let bVal: any = b[sortConfig.key as keyof NormalizedLead];

        if (sortConfig.key === 'created_at') {
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [leads, search, filters, sortConfig]);

  const paginatedLeads = sortedAndFilteredLeads.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
  const totalPages = Math.ceil(sortedAndFilteredLeads.length / itemsPerPage);

  const exportToCSV = () => {
    const csvRows = [];
    const headers = ["ID", "Nombre", "Email", "Telefono", "Estado", "Origen", "Tipo Cliente", "Agente", "Fecha Ingreso", "Dias Sistema"];
    csvRows.push(headers.join(","));

    for (const l of sortedAndFilteredLeads) {
      csvRows.push([
         l.id,
         `"${l.nombre_mostrar}"`,
         l.email_principal || "",
         l.telefono_principal || "",
         l.lead_status,
         l.origen,
         l.tipo_cliente || "",
         l.agent?.name || "",
         l.created_at,
         l.dias_en_sistema
      ].join(","));
    }

    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `leads_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getSortIcon = (k: keyof NormalizedLead | 'dias_en_sistema' | 'created_at') => {
    if (sortConfig?.key !== k) return null;
    return sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 inline ml-1" /> : <ArrowDown className="h-3 w-3 inline ml-1" />
  }

  return (
    <div className="flex flex-col space-y-4">
      <div className="bg-card/30 backdrop-blur-md p-4 rounded-2xl border border-accent/10 flex flex-col md:flex-row gap-4 items-center justify-between">
         <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
               placeholder="Buscar nombre, email, teléfono, DNI..." 
               className="pl-10 bg-background/50 border-none focus-visible:ring-accent/30"
               value={search}
               onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
         </div>
         <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <DialogTrigger asChild>
                 <Button variant="outline" className={cn(
                    "text-muted-foreground gap-2 whitespace-nowrap bg-card/50 border-accent/10",
                    Object.values(filters).some(v => v !== 'all') && "text-accent border-accent/30 bg-accent/5"
                 )}>
                    <Filter className="h-4 w-4" />
                    Filtros {Object.values(filters).filter(v => v !== 'all').length > 0 && `(${Object.values(filters).filter(v => v !== 'all').length})`}
                 </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl bg-card border-accent/20">
                 <DialogHeader>
                    <DialogTitle>Filtros de Leads</DialogTitle>
                 </DialogHeader>
                 <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Estado</Label>
                      <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
                         <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                         <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="Activo">Activo</SelectItem>
                            <SelectItem value="En negociación">En negociación</SelectItem>
                            <SelectItem value="Cerrado">Cerrado</SelectItem>
                            <SelectItem value="Perdido">Perdido</SelectItem>
                         </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Agente Asignado</Label>
                      <Select value={filters.agent} onValueChange={(v) => setFilters({...filters, agent: v})}>
                         <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                         <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            {activeAgents.map(ag => (
                              <SelectItem key={ag.id} value={ag.id.toString()}>
                                {ag.name} {!ag.isActive && '(Inactivo)'}
                              </SelectItem>
                            ))}
                         </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                       <Label>Origen</Label>
                       <Select value={filters.origin} onValueChange={(v) => setFilters({...filters, origin: v})}>
                         <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                         <SelectContent>
                             <SelectItem value="all">Todos</SelectItem>
                             {tagsByGroup["Origen de contacto"]?.map(t => (
                               <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                             ))}
                             {tagsByGroup["Sin clasificar"]?.filter(t => ["ICasas", "Clienapp"].includes(t.name)).map(t => (
                                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                             ))}
                         </SelectContent>
                       </Select>
                    </div>
                    <div className="space-y-2">
                       <Label>Tipo Cliente</Label>
                       <Select value={filters.clientType} onValueChange={(v) => setFilters({...filters, clientType: v})}>
                         <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                         <SelectContent>
                             <SelectItem value="all">Todos</SelectItem>
                             {tagsByGroup["Tipo de cliente"]?.map(t => (
                               <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                             ))}
                         </SelectContent>
                       </Select>
                    </div>
                    <div className="space-y-2">
                       <Label>Operación</Label>
                       <Select value={filters.operation} onValueChange={(v) => setFilters({...filters, operation: v})}>
                         <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                         <SelectContent>
                             <SelectItem value="all">Todos</SelectItem>
                             {tagsByGroup["Operación"]?.map(t => (
                               <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                             ))}
                         </SelectContent>
                       </Select>
                    </div>
                    <div className="space-y-2">
                       <Label>Clasificación Estructural</Label>
                       <Select value={filters.structural} onValueChange={(v) => setFilters({...filters, structural: v})}>
                         <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                         <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="is_owner">Propietario</SelectItem>
                            <SelectItem value="is_company">Empresa Corporativo</SelectItem>
                            <SelectItem value="comprador">Comprador Individual</SelectItem>
                         </SelectContent>
                       </Select>
                    </div>
                 </div>
                 <div className="flex justify-between mt-4">
                   <Button variant="ghost" onClick={() => setFilters({
                      status: "all", agent: "all", origin: "all", clientType: "all", 
                      propertyType: "all", operation: "all", structural: "all"
                   })}>Limpiar</Button>
                   <Button className="bg-accent" onClick={() => setIsFilterOpen(false)}>Aplicar</Button>
                 </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-2 shrink-0 bg-card/50 text-foreground">
               <Download className="h-4 w-4" /> Exportar CSV
            </Button>
         </div>
      </div>

      <div className="rounded-2xl border border-accent/10 bg-card/30 backdrop-blur-sm overflow-x-auto w-full">
         <Table className="w-full">
            <TableHeader className="bg-card/80 backdrop-blur-md">
               <TableRow className="border-accent/10 hover:bg-transparent">
                  <TableHead className="py-4 px-4 font-bold text-[10px] uppercase cursor-pointer" onClick={() => toggleSort('nombre_mostrar')}>
                     Contacto {getSortIcon('nombre_mostrar')}
                  </TableHead>
                  <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase cursor-pointer" onClick={() => toggleSort('telefono_principal')}>
                     Teléfono {getSortIcon('telefono_principal')}
                  </TableHead>
                  <TableHead className="font-bold text-[10px] uppercase cursor-pointer" onClick={() => toggleSort('lead_status')}>
                     Estado {getSortIcon('lead_status')}
                  </TableHead>
                  <TableHead className="font-bold text-[10px] uppercase">
                     Etapa Pipeline
                  </TableHead>
                  <TableHead className="hidden lg:table-cell font-bold text-[10px] uppercase cursor-pointer" onClick={() => toggleSort('tipo_cliente')}>
                     Tipo de Cliente {getSortIcon('tipo_cliente')}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell font-bold text-[10px] uppercase cursor-pointer" onClick={() => toggleSort('origen')}>
                     Origen {getSortIcon('origen')}
                  </TableHead>
                  <TableHead className="hidden xl:table-cell font-bold text-[10px] uppercase">Propiedad</TableHead>
                  <TableHead className="hidden sm:table-cell font-bold text-[10px] uppercase cursor-pointer" onClick={() => toggleSort('operacion')}>
                     Operación {getSortIcon('operacion')}
                  </TableHead>
                  <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase">Agente</TableHead>
                  <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase cursor-pointer" onClick={() => toggleSort('created_at')}>
                     Ingreso {getSortIcon('created_at')}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell font-bold text-[10px] uppercase cursor-pointer text-center" onClick={() => toggleSort('dias_en_sistema')}>
                     Días {getSortIcon('dias_en_sistema')}
                  </TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase px-4">Acciones</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
               {loading && leads.length === 0 ? (
                  [...Array(10)].map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
                  ))
               ) : paginatedLeads.length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={11} className="h-48 text-center text-muted-foreground">
                        No hay resultados para estos filtros.
                     </TableCell>
                  </TableRow>
               ) : (
                  paginatedLeads.map(lead => {
                     const isNoName = lead.name === "Sin nombre" || !lead.name;
                     const hasNoContact = !lead.tiene_contacto;
                     
                     return (
                        <TableRow key={lead.id} className={cn("hover:bg-accent/5 cursor-pointer h-14", 
                           isNoName && "bg-yellow-500/5 hover:bg-yellow-500/10"
                        )} onClick={() => router.push(`/director/leads/${lead.id}`)}>
                           <TableCell className="px-4">
                              <div className="flex items-center gap-3">
                                 <Avatar className="h-9 w-9 border border-accent/10">
                                    <AvatarFallback className="bg-accent/10 text-accent font-bold text-xs uppercase">
                                       {lead.nombre_mostrar?.substring(0, 2) || "U"}
                                    </AvatarFallback>
                                 </Avatar>
                                 <div className="flex flex-col">
                                    <div className="flex items-center gap-1">
                                       <span className={cn("text-xs font-bold leading-tight", isNoName && "italic text-muted-foreground")}>
                                          {lead.nombre_mostrar}
                                       </span>
                                       {hasNoContact && (
                                          <TooltipProvider>
                                             <Tooltip>
                                                <TooltipTrigger><AlertTriangle className="h-3 w-3 text-destructive" /></TooltipTrigger>
                                                <TooltipContent><p className="text-xs">Sin email ni celular</p></TooltipContent>
                                             </Tooltip>
                                          </TooltipProvider>
                                       )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                       {lead.email_principal || "Sin email"}
                                    </span>
                                    {lead.work_name && (
                                       <span className="text-[9px] font-medium text-accent truncate max-w-[150px]">
                                          🏢 {lead.work_name} {lead.work_position && `- ${lead.work_position}`}
                                       </span>
                                    )}
                                 </div>
                              </div>
                           </TableCell>
                           
                           <TableCell className="hidden md:table-cell">
                              {lead.telefono_principal ? (
                                 <TooltipProvider>
                                    <Tooltip>
                                       <TooltipTrigger asChild>
                                          <a href={lead.telefono_principal.startsWith("549") ? `https://wa.me/${lead.telefono_principal}` : `tel:${lead.telefono_principal}`}
                                             className="flex items-center gap-1.5 text-[11px] font-medium hover:text-accent transition-colors"
                                             onClick={e => e.stopPropagation()}>
                                             <PhoneIcon className="h-3 w-3 opacity-60" />
                                             {lead.telefono_principal}
                                          </a>
                                       </TooltipTrigger>
                                       {lead.telefonos_secundarios.length > 0 && (
                                          <TooltipContent className="text-xs bg-card border-accent/20">
                                             <p>Alternativos:</p>
                                             {lead.telefonos_secundarios.map(t => <p key={t}>{t}</p>)}
                                          </TooltipContent>
                                       )}
                                    </Tooltip>
                                 </TooltipProvider>
                              ) : <span className="text-[10px] text-muted-foreground italic">—</span>}
                           </TableCell>

                           <TableCell>
                              <Badge className={cn("text-[10px] font-bold px-2 py-0 border-none", STATUS_COLORS[lead.lead_status] || "bg-accent/10 text-accent")}>
                                {lead.lead_status || "Sin estado"}
                              </Badge>
                           </TableCell>

                           <TableCell onClick={(e) => e.stopPropagation()}>
                              <Select 
                                defaultValue={lead.pipeline_stage || "nuevo"} 
                                onValueChange={(v) => handleStageChange(lead.id, v)}
                              >
                                <SelectTrigger className="h-7 text-[10px] bg-background/50 border-accent/10 w-[140px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {KANBAN_STAGES.map(stage => (
                                    <SelectItem key={stage.id} value={stage.id} className="text-[10px]">
                                      {stage.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                           </TableCell>

                           <TableCell className="hidden lg:table-cell">
                              <Badge className={cn("text-[9px] px-2 uppercase tracking-wide border-none", CLIENT_TYPE_COLORS[lead.tipo_cliente || "Sin clasificar"])}>
                                {lead.tipo_cliente || "—"}
                              </Badge>
                           </TableCell>

                           <TableCell className="hidden sm:table-cell">
                              <Badge className={cn("text-[9px] px-2 font-bold", CHANNEL_COLORS[lead.origen] || "bg-accent/10 text-accent")}>
                                {lead.origen}
                              </Badge>
                           </TableCell>

                           <TableCell className="hidden xl:table-cell">
                              <div className="flex flex-wrap gap-1 max-w-[120px]">
                                 {lead.tipo_propiedad.length > 0 ? lead.tipo_propiedad.map((t, i) => (
                                    <Badge variant="outline" key={i} className="text-[9px] px-1 py-0">{t}</Badge>
                                 )) : <span className="text-muted-foreground text-[10px]">—</span>}
                              </div>
                           </TableCell>

                           <TableCell className="hidden sm:table-cell">
                                <Badge className={cn("text-[9px] border-none", OPERATION_COLORS[lead.operacion] || "bg-slate-100 text-slate-500")}>
                                  {lead.operacion}
                                </Badge>
                           </TableCell>

                           <TableCell className="hidden md:table-cell">
                              {lead.agent ? (
                                 <TooltipProvider>
                                    <Tooltip>
                                       <TooltipTrigger asChild>
                                          <div className="flex items-center gap-2 max-w-[120px]">
                                             <Avatar className={cn("h-6 w-6 border", !lead.agente_activo && "opacity-50 grayscale")}>
                                                <AvatarImage src={lead.agent.picture} />
                                                <AvatarFallback className="text-[8px] uppercase">{lead.agent.name.substring(0,2)}</AvatarFallback>
                                             </Avatar>
                                             <span className={cn("text-[10px] font-bold truncate", !lead.agente_activo && "text-muted-foreground line-through")}>
                                                {lead.agent.name.split(" ")[0]}
                                             </span>
                                          </div>
                                       </TooltipTrigger>
                                       {!lead.agente_activo && <TooltipContent>Agente Inactivo</TooltipContent>}
                                    </Tooltip>
                                 </TooltipProvider>
                              ) : <span className="text-[10px] text-muted-foreground italic">Sin asignar</span>}
                           </TableCell>

                           <TableCell className="hidden md:table-cell">
                              <div className="flex flex-col">
                                 <span className="text-[10px] font-bold">{format(new Date(lead.created_at), "dd/MM/yyyy")}</span>
                              </div>
                           </TableCell>

                           <TableCell className="text-center hidden sm:table-cell">
                              <Badge className={cn("text-[10px] font-bold",
                                 lead.dias_en_sistema < 7 ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" :
                                 lead.dias_en_sistema <= 30 ? "bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20" :
                                 "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              )}>
                                 {lead.dias_en_sistema} {lead.dias_en_sistema === 1 ? 'día' : 'días'}
                              </Badge>
                           </TableCell>

                           <TableCell className="text-right px-4">
                              <div className="flex items-center justify-end gap-1">
                                 <TooltipProvider>
                                    <Tooltip>
                                       <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-accent" onClick={e => {
                                             e.stopPropagation();
                                             router.push(`/director/leads/${lead.id}`);
                                          }}>
                                             <Eye className="h-3.5 w-3.5" />
                                          </Button>
                                       </TooltipTrigger>
                                       <TooltipContent>Ver Detalles del Lead</TooltipContent>
                                    </Tooltip>
                                 </TooltipProvider>

                                 <TooltipProvider>
                                    <Tooltip>
                                       <TooltipTrigger asChild>
                                          <Button 
                                             variant="ghost" 
                                             size="icon" 
                                             className="h-7 w-7 text-muted-foreground hover:text-accent" 
                                             disabled={!lead.tiene_contacto}
                                             onClick={e => {
                                                e.stopPropagation();
                                                if (lead.telefono_principal) {
                                                   const phoneStr = lead.telefono_principal.replace(/[\s\-\+]/g, '');
                                                   const phoneUrl = phoneStr.startsWith("549") || phoneStr.startsWith("54")
                                                      ? `https://wa.me/${phoneStr}` 
                                                      : `tel:${phoneStr}`;
                                                   window.open(phoneUrl, '_blank');
                                                } else if (lead.email_principal) {
                                                   window.open(`mailto:${lead.email_principal}`, '_blank');
                                                }
                                             }}
                                          >
                                             {lead.telefono_principal ? <MessageCircle className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                                          </Button>
                                       </TooltipTrigger>
                                       <TooltipContent>
                                          {lead.telefono_principal ? "Contactar por WhatsApp" : (lead.email_principal ? "Enviar Email" : "Sin medios de contacto")}
                                       </TooltipContent>
                                    </Tooltip>
                                 </TooltipProvider>
                              </div>
                           </TableCell>
                        </TableRow>
                     )
                  })
               )}
            </TableBody>
         </Table>
         <div className="flex items-center justify-between px-4 py-3 border-t border-accent/10">
            <span className="text-xs text-muted-foreground">
               Mostrando {page * itemsPerPage + 1} a {Math.min((page + 1) * itemsPerPage, sortedAndFilteredLeads.length)} de {sortedAndFilteredLeads.length}
            </span>
            <div className="flex items-center gap-2">
               <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                  Anterior
               </Button>
               <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  Siguiente
               </Button>
            </div>
         </div>
      </div>
    </div>
  );
}
