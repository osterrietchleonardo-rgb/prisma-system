"use client"

import { useState, useEffect } from "react"
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  CheckCircle2,
  Clock3,
  CalendarPlus
} from "lucide-react"
import { NewVisitDialog } from "@/components/calendar/NewVisitDialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { 
  addMonths, 
  subMonths, 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  parseISO
} from "date-fns"
import { es } from "date-fns/locale"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function AsesorCalendarioPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [visits, setVisits] = useState<Record<string, any>[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [isNewVisitOpen, setIsNewVisitOpen] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUserId(session.user.id)
        
        // Get agency_id for the form
        const { data: profile } = await supabase
          .from("profiles")
          .select("agency_id")
          .eq("id", session.user.id)
          .single()
        
        if (profile?.agency_id) {
          setAgencyId(profile.agency_id)
        }
      }
    }
    loadUser()
  }, [supabase])

  useEffect(() => {
    if (userId) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, userId])

  const fetchData = async () => {
    try {
      const start = startOfMonth(currentDate)
      const end = endOfMonth(currentDate)
      
      const { data, error } = await supabase
        .from("scheduled_visits")
        .select(`
          *
        `)
        .eq("agent_id", userId)
        .gte("fecha_visita", format(start, "yyyy-MM-dd"))
        .lte("fecha_visita", format(end, "yyyy-MM-dd"))

      if (error) throw error
      setVisits(data || [])
    } catch (_error) {
      toast.error("Error al cargar mis visitas")
    }
  }

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate })

  const getDayVisits = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd")
    return visits.filter(v => v.fecha_visita === dateStr)
  }

  return (
    <div className="flex flex-col h-full space-y-4 px-4 md:px-8 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Mi Calendario
            <CalendarIcon className="h-6 w-6 text-accent" />
          </h2>
          <p className="text-muted-foreground mt-1">
            Visualiza tus próximas visitas y coordina tu agenda personal.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
           <Button 
             className="bg-accent hover:bg-accent/90 gap-2 shadow-lg shadow-accent/20"
             onClick={() => setIsNewVisitOpen(true)}
           >
             <CalendarPlus className="h-4 w-4" />
             Agendar Visita
           </Button>
        </div>
      </div>

      <NewVisitDialog 
        open={isNewVisitOpen}
        onOpenChange={setIsNewVisitOpen}
        onSuccess={fetchData}
        agencyId={agencyId || ""}
        userId={userId || ""}
      />

      <Card className="border-accent/10 bg-card/30 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Calendar Header */}
        <div className="p-4 flex items-center justify-between border-b border-accent/10 bg-accent/5">
          <div className="flex items-center gap-4">
             <h3 className="text-xl font-black capitalize text-foreground min-w-[150px]">
               {format(currentDate, "MMMM yyyy", { locale: es })}
             </h3>
             <div className="flex bg-background/50 rounded-lg p-1 border border-accent/10">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" className="h-8 text-xs font-bold" onClick={() => setCurrentDate(new Date())}>Hoy</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
             </div>
          </div>
          <div className="flex items-center gap-2">
             <Badge variant="outline" className="bg-card/50 text-[10px] gap-1"><Clock3 className="h-3 w-3" /> Agendadas</Badge>
             <Badge variant="outline" className="bg-card/50 text-[10px] gap-1"><CheckCircle2 className="h-3 w-3 text-red-500" /> Canceladas</Badge>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 border-b border-accent/10 bg-accent/5">
          {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map(day => (
            <div key={day} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 grid-rows-5 h-[calc(100vh-400px)] min-h-[500px]">
          {calendarDays.map((day, idx) => {
            const dayVisits = getDayVisits(day)
            const isToday = isSameDay(day, new Date())
            const isCurrentMonth = isSameMonth(day, monthStart)

            return (
              <div 
                key={idx} 
                className={cn(
                  "border-r border-b border-accent/10 p-2 transition-colors hover:bg-accent/5 flex flex-col gap-1 overflow-y-auto scrollbar-hide",
                  !isCurrentMonth ? "bg-accent/[0.02] text-muted-foreground/30" : "bg-card/20"
                )}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className={cn(
                    "text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full",
                    isToday ? "bg-accent text-white" : ""
                  )}>
                    {format(day, "d")}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  {dayVisits.map((visit) => (
                    <Dialog key={visit.id}>
                      <DialogTrigger asChild>
                        <div className={cn(
                          "group p-1.5 rounded-lg border text-[10px] cursor-pointer transition-all hover:scale-[1.02]",
                          visit.estado_visita === 'agendada' ? "bg-accent/5 border-accent/20 text-accent/80" : 
                          visit.estado_visita === 'cancelada' ? "bg-red-500/5 border-red-500/20 text-red-500/80" : 
                          "bg-amber-500/5 border-amber-500/20 text-amber-500/80"
                        )}>
                          <div className="flex items-center justify-between gap-1 mb-1 font-bold">
                            <span className="truncate">{visit.hora_visita.substring(0, 5)} • {visit.nombre_completo}</span>
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-accent/20 max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <div className="flex justify-between items-start">
                             <DialogTitle className="text-xl font-bold flex items-center gap-2">
                               <Clock className="h-5 w-5 text-accent" />
                               Detalle de Visita
                             </DialogTitle>
                             <Badge className={cn(
                               "border-none px-3 capitalize",
                               visit.estado_visita === 'agendada' ? "bg-accent/10 text-accent" : 
                               visit.estado_visita === 'cancelada' ? "bg-red-500/10 text-red-500" : 
                               "bg-amber-500/10 text-amber-500"
                             )}>
                               {visit.estado_visita}
                             </Badge>
                          </div>
                        </DialogHeader>

                        <div className="grid gap-6 py-4">
                           <div className="flex items-center gap-4 bg-accent/5 p-4 rounded-xl border border-accent/10">
                              <MapPin className="h-10 w-10 text-accent bg-accent/10 p-2 rounded-full" />
                              <div>
                                 <h4 className="font-bold text-lg">{visit.propiedad_id || 'Propiedad sin ID'}</h4>
                                 <p className="text-sm text-muted-foreground">{visit.zona_propiedad || 'Zona no especificada'}</p>
                              </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1 bg-card/50 p-3 rounded-lg border border-accent/5">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                   <User className="h-3 w-3" /> Lead
                                 </span>
                                 <p className="font-bold">{visit.nombre_completo}</p>
                                 <p className="text-xs text-muted-foreground">{visit.telefono}</p>
                                 <p className="text-xs text-muted-foreground">{visit.email}</p>
                              </div>
                              <div className="space-y-1 bg-card/50 p-3 rounded-lg border border-accent/5">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                   <CalendarIcon className="h-3 w-3" /> Fecha y Hora
                                 </span>
                                 <p className="font-bold">{format(parseISO(visit.fecha_visita), "PPP", { locale: es })}</p>
                                 <p className="text-xs font-bold text-accent">{visit.hora_visita.substring(0, 5)} hs</p>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="space-y-1">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground">Operación</span>
                                 <Badge variant="outline" className="block text-center border-accent/20 capitalize">{visit.tipo_operacion || '-'}</Badge>
                              </div>
                              <div className="space-y-1">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground">Presupuesto</span>
                                 <p className="text-sm font-bold">{visit.presupuesto || '-'}</p>
                              </div>
                              <div className="space-y-1">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground">Calificación</span>
                                 <Badge className={cn(
                                   "block text-center border-none",
                                   visit.calificacion_lead === 'HOT' ? "bg-red-500/10 text-red-500" : 
                                   visit.calificacion_lead === 'WARM' ? "bg-amber-500/10 text-amber-500" : 
                                   "bg-blue-500/10 text-blue-500"
                                 )}>
                                   {visit.calificacion_lead || '-'}
                                 </Badge>
                              </div>
                              <div className="space-y-1">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground">Score BANT</span>
                                 <p className="text-sm font-bold">{visit.score_bant}/12</p>
                              </div>
                           </div>
                           
                           <div className="space-y-3">
                              <div className="bg-accent/5 p-4 rounded-xl border border-accent/10 space-y-2">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">Intereses Clave</span>
                                <p className="text-sm text-foreground">{visit.intereses_clave || 'No especificados'}</p>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-card/50 p-4 rounded-xl border border-accent/10 space-y-2">
                                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Objeciones</span>
                                  <p className="text-xs text-muted-foreground italic">{visit.objeciones_detectadas || 'Ninguna detectada'}</p>
                                </div>
                                <div className="bg-card/50 p-4 rounded-xl border border-accent/10 space-y-2">
                                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Decisores</span>
                                  <p className="text-xs text-muted-foreground">{visit.decisores || 'No especificados'}</p>
                                </div>
                              </div>
                              <div className="bg-accent/5 p-4 rounded-xl border border-accent/10 space-y-2">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">Resumen Conversación</span>
                                <p className="text-xs text-muted-foreground">{visit.resumen_conversacion || 'Sin resumen'}</p>
                              </div>
                           </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
