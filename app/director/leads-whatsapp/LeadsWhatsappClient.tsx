"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { WAConversation } from "@/types/whatsapp"

import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { Bot, User, AlertTriangle, Eye, Search, MessageCircle, Phone, Pencil, Trash2, X, Plus } from "lucide-react"
import { toast } from "sonner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KANBAN_STAGES } from "@/components/kanban/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { updateWaConversationStage } from "@/lib/queries/director"
import { updateConversationDetails, deleteConversation } from "@/app/actions/whatsapp"
import { getClasificacionStyle, CLASIFICACION_CONSULTA, CLASIFICACION_MANUAL } from "@/lib/whatsapp/clasificacion"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const SUGGESTED_TAGS = [
  "caliente",
  "tibio",
  "frío",
  "visitó",
  "con presupuesto",
  "sin presupuesto",
  "no responde",
]

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "Sin teléfono";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  } else if (cleaned.length === 12 || cleaned.length === 13) {
    return `+${cleaned}`;
  }
  return phone;
}

export default function LeadsWhatsappClient({
  initialConversations,
  basePath
}: {
  initialConversations: WAConversation[]
  basePath: string
}) {
  const router = useRouter()
  const [conversations, setConversations] = useState(initialConversations)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterClasif, setFilterClasif] = useState("all")

  // Edición de lead (modal)
  const [editConv, setEditConv] = useState<WAConversation | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editTags, setEditTags] = useState<string[]>([])
  const [editClasif, setEditClasif] = useState("")
  const [newTag, setNewTag] = useState("")
  const [saving, setSaving] = useState(false)

  // Eliminación
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const clasifOptions = useMemo(() => {
    const set = new Set<string>()
    conversations.forEach(c => { if (c.clasificacion) set.add(c.clasificacion) })
    return Array.from(set).sort()
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return conversations.filter(conv => {
      if (filterClasif !== "all") {
        if (filterClasif === "__none__") {
          if (conv.clasificacion) return false;
        } else if (conv.clasificacion !== filterClasif) {
          return false;
        }
      }
      if (!q) return true;
      return (
        conv.contact_name?.toLowerCase().includes(q) ||
        conv.contact_phone?.includes(q) ||
        conv.etiquetas?.some(tag => tag.toLowerCase().includes(q)) ||
        conv.clasificacion?.toLowerCase().includes(q)
      );
    });
  }, [conversations, searchTerm, filterClasif]);

  const handleStageChange = async (convId: string, newStage: string) => {
    try {
      await updateWaConversationStage(convId, newStage)
      
      setConversations(prev => prev.map(conv => {
        if (conv.id === convId) {
          return { ...conv, pipeline_stage: newStage }
        }
        return conv
      }))
      
      toast.success("Etapa del pipeline actualizada")
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error("Error al actualizar la etapa")
    }
  }

  const openEdit = (conv: WAConversation) => {
    setEditConv(conv)
    setEditName(conv.contact_name || "")
    setEditPhone(conv.contact_phone || "")
    setEditTags(conv.etiquetas || [])
    setEditClasif(conv.clasificacion || "")
    setNewTag("")
  }

  const handleAddTag = (tag: string) => {
    const clean = tag.trim()
    if (!clean) return
    if (editTags.some(t => t.toLowerCase() === clean.toLowerCase())) return
    setEditTags(prev => [...prev, clean])
    setNewTag("")
  }

  const handleRemoveTag = (tag: string) => {
    setEditTags(prev => prev.filter(t => t !== tag))
  }

  const handleSaveEdit = async () => {
    if (!editConv) return
    const cleanPhone = editPhone.replace(/\D/g, "")
    if (!cleanPhone) {
      toast.error("El teléfono no puede quedar vacío")
      return
    }

    setSaving(true)
    const cleanClasif = editClasif.trim()
    const res = await updateConversationDetails(editConv.id, {
      contact_name: editName,
      contact_phone: cleanPhone,
      etiquetas: editTags,
      clasificacion: cleanClasif === "" ? null : cleanClasif,
    })
    setSaving(false)

    if (res.success) {
      const finalName = editName.trim() === "" ? null : editName.trim()
      setConversations(prev => prev.map(c =>
        c.id === editConv.id
          ? { ...c, contact_name: finalName, contact_phone: cleanPhone, etiquetas: editTags, clasificacion: cleanClasif === "" ? null : cleanClasif }
          : c
      ))
      toast.success("Lead actualizado")
      setEditConv(null)
      router.refresh()
    } else {
      toast.error(res.error || "Error al actualizar el lead")
    }
  }

  const handleDelete = async (conv: WAConversation) => {
    const label = conv.contact_name || conv.contact_phone || "este lead"
    if (!window.confirm(`¿Seguro que querés eliminar "${label}"?\n\nSe borrarán la conversación, sus mensajes y la memoria del bot. Esta acción no se puede deshacer.`)) {
      return
    }
    setDeletingId(conv.id)
    const res = await deleteConversation(conv.id)
    setDeletingId(null)

    if (res.success) {
      setConversations(prev => prev.filter(c => c.id !== conv.id))
      toast.success("Lead eliminado")
      router.refresh()
    } else {
      toast.error(res.error || "Error al eliminar el lead")
    }
  }

  return (
    <div className="flex flex-col space-y-4">
      {/* Search and Filters */}
      <div className="bg-card/30 backdrop-blur-md p-4 rounded-2xl border border-accent/10 flex flex-col md:flex-row gap-4 items-center justify-between">
         <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
               placeholder="Buscar nombre, teléfono, etiquetas..." 
               className="pl-10 bg-background/50 border-none focus-visible:ring-accent/30"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>

         <Select value={filterClasif} onValueChange={setFilterClasif}>
            <SelectTrigger className="w-full md:w-[220px] bg-background/50 border-none focus:ring-accent/30">
               <SelectValue placeholder="Filtrar por clasificación" />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value="all">Todas las clasificaciones</SelectItem>
               <SelectItem value="__none__">Sin clasificar</SelectItem>
               {clasifOptions.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
               ))}
            </SelectContent>
         </Select>
      </div>

      <div className="rounded-2xl border border-accent/10 bg-card/30 backdrop-blur-sm overflow-x-auto w-full">
        <Table className="w-full">
          <TableHeader className="bg-card/80 backdrop-blur-md sticky top-0 z-10">
            <TableRow className="border-accent/10 hover:bg-transparent">
              <TableHead className="py-4 px-4 font-bold text-[10px] uppercase">Contacto</TableHead>
              <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase">Teléfono</TableHead>
              <TableHead className="hidden lg:table-cell font-bold text-[10px] uppercase">Etiquetas</TableHead>
              <TableHead className="font-bold text-[10px] uppercase">Clasificación</TableHead>
              <TableHead className="font-bold text-[10px] uppercase">Estado Chat</TableHead>
              <TableHead className="font-bold text-[10px] uppercase">Etapa Pipeline</TableHead>
              <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase">Agente</TableHead>
              <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase">Último Mensaje</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-right px-4">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredConversations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-48 text-center text-muted-foreground">
                  {searchTerm ? "No hay resultados para esta búsqueda." : "No hay leads de WhatsApp activos."}
                </TableCell>
              </TableRow>
            ) : (
              filteredConversations.map((conv) => {
                const isNoName = conv.contact_name === "Sin nombre" || !conv.contact_name;
                const hasNoContact = !conv.contact_phone;
                
                return (
                  <TableRow 
                    key={conv.id} 
                    className="hover:bg-accent/5 h-14 cursor-pointer"
                    onClick={() => router.push(`${basePath}/${conv.id}`)}
                  >
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-accent/10 shadow-sm">
                          <AvatarFallback className="bg-accent/10 text-accent font-bold text-xs uppercase">
                            {conv.contact_name?.substring(0, 2) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className={cn("text-xs font-bold leading-tight", isNoName && "italic text-muted-foreground")}>
                              {conv.contact_name || 'Desconocido'}
                            </span>
                            {hasNoContact && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger><AlertTriangle className="h-3 w-3 text-destructive" /></TooltipTrigger>
                                  <TooltipContent><p className="text-xs">Sin número de teléfono</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {conv.bot_active && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger><Bot className="w-3 h-3 ml-1 text-emerald-400" /></TooltipTrigger>
                                  <TooltipContent><p className="text-xs">Chatbot Activo</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {conv.contact_phone && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[150px] md:hidden">
                              {formatPhone(conv.contact_phone)}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell className="hidden md:table-cell">
                      {conv.contact_phone ? (
                        <a 
                          href={`https://wa.me/${conv.contact_phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] font-medium hover:text-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="h-3 w-3 opacity-60" />
                          {formatPhone(conv.contact_phone)}
                        </a>
                      ) : <span className="text-[10px] text-muted-foreground italic">—</span>}
                    </TableCell>
    
                    <TableCell className="hidden lg:table-cell">
                      {conv.etiquetas && conv.etiquetas.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {conv.etiquetas.slice(0, 2).map((etiqueta, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 border-accent/20 bg-accent/5 text-accent/80">
                              {etiqueta}
                            </Badge>
                          ))}
                          {conv.etiquetas.length > 2 && (
                            <span className="text-[9px] text-muted-foreground bg-muted/30 px-1 rounded">+{conv.etiquetas.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {(() => {
                        const cl = getClasificacionStyle(conv.clasificacion)
                        return (
                          <Badge variant="outline" className={cn("text-[9px] font-bold px-1.5 py-0 whitespace-nowrap", cl.className)}>
                            {cl.label}
                          </Badge>
                        )
                      })()}
                    </TableCell>

                    <TableCell>
                      <Badge className={cn(
                        "text-[10px] font-bold px-2 py-0 border-none shadow-none",
                        conv.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-400'
                      )}>
                        {conv.status === 'active' ? 'Activo' : conv.status === 'closed' ? 'Cerrado' : 'Pendiente'}
                      </Badge>
                      {conv.score > 0 && (
                        <div className="mt-1">
                          <span className="text-[9px] text-muted-foreground">Score: {conv.score}</span>
                        </div>
                      )}
                    </TableCell>
    
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select 
                        defaultValue={conv.pipeline_stage || "nuevo"} 
                        onValueChange={(v) => handleStageChange(conv.id, v)}
                      >
                        <SelectTrigger className="h-7 text-[10px] bg-background/50 border-accent/10 w-[140px] focus:ring-accent/30">
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
    
                    <TableCell className="hidden md:table-cell">
                      {conv.assigned_agent ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 max-w-[120px]">
                                <Avatar className="h-6 w-6 border border-accent/10 shadow-sm">
                                  <AvatarImage src={conv.assigned_agent.avatar_url ?? undefined} />
                                  <AvatarFallback className="text-[8px] uppercase">
                                    {conv.assigned_agent.full_name?.substring(0,2) || conv.assigned_agent.email?.substring(0,2)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-[10px] font-bold truncate">
                                  {conv.assigned_agent.full_name?.split(" ")[0] || conv.assigned_agent.email?.split("@")[0]}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{conv.assigned_agent.full_name || conv.assigned_agent.email}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : <span className="text-[10px] text-muted-foreground italic">Sin asignar</span>}
                    </TableCell>
    
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                          {formatDistanceToNow(new Date(conv.updated_at || conv.last_message_at), { addSuffix: true, locale: es })}
                        </span>
                      </div>
                    </TableCell>
    
                    <TableCell className="text-right px-4">
                      <div className="flex items-center justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link 
                                href={`${basePath}/${conv.id}`}
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent/10 hover:text-accent h-8 w-8 text-muted-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>Ver Conversación</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        {conv.contact_phone && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a 
                                  href={`https://wa.me/${conv.contact_phone.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-emerald-500/10 hover:text-emerald-500 h-8 w-8 text-muted-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>WhatsApp Directo</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openEdit(conv); }}
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent/10 hover:text-accent h-8 w-8 text-muted-foreground"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Editar Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                disabled={deletingId === conv.id}
                                onClick={(e) => { e.stopPropagation(); handleDelete(conv); }}
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-destructive/10 hover:text-destructive h-8 w-8 text-muted-foreground disabled:opacity-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Eliminar Lead</TooltipContent>
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
      </div>
      
      {filteredConversations.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-card/10 rounded-xl border border-accent/5">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
            Total: {filteredConversations.length} leads encontrados
          </span>
          <span className="text-[10px] text-muted-foreground italic">
            Sincronización en tiempo real activa
          </span>
        </div>
      )}

      {/* Modal: Editar Lead */}
      <Dialog open={!!editConv} onOpenChange={(open) => { if (!open) setEditConv(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Editar lead</DialogTitle>
            <DialogDescription className="text-xs">
              Los cambios impactan también en la bandeja del Asesor IA WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Nombre</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre del contacto"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Teléfono</label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Ej: 5491155551234"
                inputMode="tel"
              />
              <p className="text-[10px] text-muted-foreground">
                Cambiar el teléfono cambia a qué número se le envía WhatsApp.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Clasificación</label>
              <Input
                value={editClasif}
                onChange={(e) => setEditClasif(e.target.value)}
                placeholder="Ej: Whatsapp-Consulta, Base Expo 2026..."
                list="clasif-suggestions"
              />
              <datalist id="clasif-suggestions">
                <option value={CLASIFICACION_CONSULTA} />
                <option value={CLASIFICACION_MANUAL} />
                {clasifOptions.filter(c => c !== CLASIFICACION_CONSULTA && c !== CLASIFICACION_MANUAL).map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Etiquetas</label>
              {editTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] gap-1 pr-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="rounded-full hover:bg-destructive/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleAddTag(newTag); }
                  }}
                  placeholder="Agregar etiqueta..."
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => handleAddTag(newTag)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {SUGGESTED_TAGS.filter(t => !editTags.some(et => et.toLowerCase() === t.toLowerCase())).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAddTag(tag)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-accent/20 bg-accent/5 text-accent/80 hover:bg-accent/10 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditConv(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
