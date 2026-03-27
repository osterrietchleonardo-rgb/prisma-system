"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  MessageSquare, 
  Phone, 
  Mail, 
  Building2, 
  Tag, 
  User, 
  ExternalLink,
  History,
  BadgeInfo,
  ChevronDown,
  ChevronUp,
  MapPin,
  RefreshCcw,
  Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { getLeadById, getLeadActivities } from "@/lib/queries/director"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export default function LeadDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [lead, setLead] = useState<any>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [leadData, activitiesData] = await Promise.all([
        getLeadById(id),
        getLeadActivities(id)
      ])
      setLead(leadData)
      setActivities(activitiesData || [])
    } catch (err: any) {
      console.error(err)
      toast.error("Error al cargar los datos del lead")
      router.push("/director/leads")
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    if (lead?.full_name) {
      window.dispatchEvent(new CustomEvent('prisma-header-title', { detail: lead.full_name }));
    }
    return () => {
      window.dispatchEvent(new CustomEvent('prisma-header-title', { detail: null }));
    }
  }, [lead?.full_name]);

  useEffect(() => {
    if (id) fetchData()
  }, [fetchData, id])

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-[400px] rounded-2xl" />
            <Skeleton className="h-[200px] rounded-2xl" />
          </div>
          <Skeleton className="h-[600px] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!lead) return null

  const tokkoAgent = lead.tokko_raw?.agent
  const tokkoTags = lead.tokko_raw?.tags || []
  const tokkoBranches = lead.tokko_raw?.branches || []

  const renderPropertyInfo = () => {
    if (!lead.tokko_property_title && !lead.tokko_property_id) return (
      <p className="text-sm text-muted-foreground italic">No hay propiedad vinculada</p>
    )

    return (
      <div className="mt-4 p-4 rounded-xl border border-accent/10 bg-accent/5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Building2 className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-sm line-clamp-1">{lead.tokko_property_title}</p>
            {lead.tokko_property_address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />{lead.tokko_property_address}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <Badge variant="secondary" className="bg-accent/10 text-accent border-none">{lead.tokko_property_type || "Propiedad"}</Badge>
          <span className="font-bold text-accent text-sm">{lead.tokko_property_price}</span>
        </div>
        <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-2" asChild>
          <a href={`https://tokkobroker.com/admin/properties/view/${lead.tokko_property_id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            <ExternalLink className="h-3 w-3" /> Ver en Tokko
          </a>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 pt-6 overflow-y-auto custom-scrollbar pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              Ficha de {lead.full_name}
              <Badge variant="outline" className="text-xs border-accent/20 bg-accent/5 text-accent font-medium capitalize">
                {lead.status}
              </Badge>
            </h2>
            <p className="text-muted-foreground text-sm">
              ID único: <span className="font-mono text-xs">{lead.id}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lead.phone && (
            <Button className="bg-[#25D366] hover:bg-[#20ba59] gap-2 text-white border-none" asChild>
              <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden md:inline">WhatsApp</span>
              </a>
            </Button>
          )}
          <Button variant="outline" className="gap-2 border-accent/20">
            Editar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md rounded-2xl overflow-hidden shadow-lg border-l-4 border-l-accent">
            <div className="h-32 bg-gradient-to-r from-accent/20 via-accent/5 to-transparent relative">
              <div className="absolute -bottom-8 left-8">
                <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                  <AvatarFallback className="bg-accent text-white text-3xl">
                    {lead.full_name?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            <CardHeader className="pt-12 pb-4 px-8">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl font-bold">{lead.full_name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <span className="capitalize">{lead.pipeline_stage?.replace("_", " ")}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>Lead desde {lead.source}</span>
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Original de Tokko</p>
                  <p className="text-xs font-semibold">
                    {lead.tokko_created_date ? format(new Date(lead.tokko_created_date), "d 'de' MMMM, yyyy", { locale: es }) : "—"}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-8 pb-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-xs uppercase font-bold text-accent flex items-center gap-2 tracking-wider">
                    <User className="h-3.5 w-3.5" /> Informacion de Contacto
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-accent/5 flex items-center justify-center border border-accent/10">
                        <Mail className="h-4 w-4 text-accent/70" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Email</p>
                        <p className="text-sm font-medium">{lead.email || "No especificado"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-accent/5 flex items-center justify-center border border-accent/10">
                        <Phone className="h-4 w-4 text-accent/70" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Teléfono Principal</p>
                        <p className="text-sm font-medium">{lead.phone || "No especificado"}</p>
                      </div>
                    </div>
                    {tokkoAgent && (
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent/5 flex items-center justify-center border border-accent/10">
                          <BadgeInfo className="h-4 w-4 text-accent/70" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Agente Responsable (Tokko)</p>
                          <div className="flex items-center gap-2">
                             <Avatar className="h-5 w-5">
                                <AvatarImage src={tokkoAgent.picture} />
                                <AvatarFallback className="text-[10px]">{tokkoAgent.name?.substring(0,2)}</AvatarFallback>
                             </Avatar>
                             <div>
                                <p className="text-sm font-medium leading-none">{tokkoAgent.name}</p>
                                <p className="text-[10px] text-muted-foreground">{tokkoAgent.email}</p>
                             </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs uppercase font-bold text-accent flex items-center gap-2 tracking-wider">
                    <Tag className="h-3.5 w-3.5" /> Etiquetas y Categorías (Tokko)
                  </h4>
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {tokkoTags.length > 0 ? (
                        tokkoTags.map((tag: any, i: number) => (
                          <Badge key={i} variant="outline" className="bg-accent/5 border-accent/10 text-accent font-medium px-3 py-1 flex items-center gap-1.5">
                            {tag.name}
                            {tag.group_name && <span className="text-[9px] text-muted-foreground border-l border-accent/20 pl-1.5 ml-1">{tag.group_name}</span>}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No hay etiquetas de Tokko</p>
                      )}
                    </div>
                    
                    {tokkoBranches.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Sucursales Involucradas</p>
                        <div className="flex flex-wrap gap-2">
                          {tokkoBranches.map((b: any, i: number) => (
                            <Badge key={i} variant="secondary" className="bg-blue-500/10 text-blue-500 border-none">
                              {b.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">ID Tokko</p>
                      <code className="text-[11px] bg-muted px-2 py-1 rounded">{lead.tokko_contact_id || "—"}</code>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="bg-accent/10" />

              <div className="space-y-4">
                <h4 className="text-xs uppercase font-bold text-accent flex items-center gap-2 tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5" /> Detalle de la Consulta y Origen
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Resumen de la búsqueda / Mensaje</p>
                    <div className="p-4 rounded-xl border border-accent/10 bg-accent/5 text-sm leading-relaxed whitespace-pre-wrap italic shadow-inner">
                      {lead.tokko_search_data || lead.notes || "Sin mensaje disponible"}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                       <div>
                         <p className="text-[10px] text-muted-foreground uppercase font-bold">Origen</p>
                         <p className="text-sm font-semibold">{lead.tokko_origin || lead.source}</p>
                       </div>
                       {lead.tokko_raw?.cellphone && (
                         <div>
                           <p className="text-[10px] text-muted-foreground uppercase font-bold">Celular Tokko</p>
                           <p className="text-sm font-semibold">{lead.tokko_raw.cellphone}</p>
                         </div>
                       )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Inmueble Consultado</p>
                    {renderPropertyInfo()}
                  </div>
                </div>
              </div>

              {/* MORE TOKKO DATA (Formatted) */}
              <div className="mt-8 border-t border-accent/10 pt-6 space-y-4">
                <h4 className="text-xs uppercase font-bold text-accent flex items-center gap-2 tracking-wider">
                  <BadgeInfo className="h-3.5 w-3.5" /> Información Técnica Adicional
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-xl border border-accent/5">
                   <div>
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">ID Tokko</p>
                      <p className="text-xs font-mono">{lead.tokko_contact_id || "—"}</p>
                   </div>
                   <div>
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Creado en Tokko</p>
                      <p className="text-xs">{lead.tokko_created_date ? format(new Date(lead.tokko_created_date), "dd/MM/yyyy HH:mm") : "—"}</p>
                   </div>
                   <div>
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Último Contacto</p>
                      <p className="text-xs">{lead.tokko_raw?.last_contact_date ? format(new Date(lead.tokko_raw.last_contact_date), "dd/MM/yyyy") : "—"}</p>
                   </div>
                   <div>
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">ID Agente Tokko</p>
                      <p className="text-xs">{tokkoAgent?.id || "—"}</p>
                   </div>
                </div>
              </div>

              {/* RAW DATA TOGGLE (Moved to bottom and simplified) */}
              <div className="mt-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-between text-[10px] text-muted-foreground/50 hover:text-accent/50 group"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  <span className="flex items-center gap-2">
                    Visualizar JSON original de Tokko (Debug)
                  </span>
                  {showRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                {showRaw && (
                  <div className="mt-2 p-4 rounded-xl bg-[#0d1117] text-[#c9d1d9] overflow-x-auto text-[11px] font-mono leading-relaxed max-h-[400px] border border-accent/20 animate-in fade-in slide-in-from-top-2">
                    <pre>{JSON.stringify(lead.tokko_raw || { message: "Sin datos RAW guardados" }, null, 2)}</pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {lead.chat_analysis && Object.keys(lead.chat_analysis).length > 0 && (
            <Card className="border-accent/20 bg-accent/5 backdrop-blur-md rounded-2xl overflow-hidden shadow-lg border-l-4 border-l-accent animate-pulse-subtle">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-accent">
                  <Zap className="h-5 w-5 fill-accent/20" /> Análisis de PRISMA IA
                </CardTitle>
                <CardDescription>Interpretación inteligente del contacto</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Actitud del Lead</span>
                  <p className="capitalize font-medium text-foreground">{lead.chat_analysis.lead_attitude || "—"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Intención de búsqueda</span>
                  <p className="font-medium text-foreground">{lead.chat_analysis.search_intent || "—"}</p>
                </div>
                {lead.chat_analysis.next_step && (
                  <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
                     <span className="text-[10px] uppercase font-bold text-accent block mb-1">Próximo paso recomendado:</span>
                     <p className="text-xs font-semibold">{lead.chat_analysis.next_step}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-accent/10 bg-card/30 backdrop-blur-md rounded-2xl shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <History className="h-5 w-5 text-accent" /> Historial de Actividad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {!activities || activities.length === 0 ? (
                  <div className="text-center py-8 space-y-3">
                    <History className="h-8 w-8 text-muted-foreground/20 mx-auto" />
                    <p className="text-sm text-muted-foreground">Sin actividad registrada aún</p>
                  </div>
                ) : (
                  <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-accent/20 before:via-accent/5 before:to-transparent">
                    {activities.map((activity: any, i: number) => (
                      <div key={activity.id} className="relative flex items-start gap-4">
                        <div className={`mt-1 h-10 w-10 rounded-full border-4 border-background flex items-center justify-center shrink-0 z-10 shadow-sm ${
                          i === 0 ? "bg-accent text-white" : "bg-card text-muted-foreground border-accent/5"
                        }`}>
                          <RefreshCcw className="h-4 w-4" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold capitalize">{activity.activity_type.replace("_", " ")}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(activity.created_at), "d MMM, HH:mm", { locale: es })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-snug">{activity.description}</p>
                          {activity.agent && (
                             <p className="text-[10px] text-accent font-medium">Por: {activity.agent.full_name}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
