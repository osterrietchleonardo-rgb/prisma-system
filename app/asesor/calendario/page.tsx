"use client"

import React, { useState, useEffect } from "react"
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
  CalendarPlus,
  ChevronDown
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
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover"
import { EditVisitDialog } from "@/components/calendar/EditVisitDialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { DateRange } from "react-day-picker"
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
  parseISO,
  startOfDay,
  endOfDay
} from "date-fns"
import { es } from "date-fns/locale"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { triggerCalendarSync } from "@/lib/google-calendar/triggerSync"

export default function AsesorCalendarioPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [visits, setVisits] = useState<Record<string, any>[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [isNewVisitOpen, setIsNewVisitOpen] = useState(false)
  const [date, setDate] = useState<DateRange | undefined>()
  
  const [editingVisit, setEditingVisit] = useState<any>(null)
  const [cancelingVisit, setCancelingVisit] = useState<any>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [isCanceling, setIsCanceling] = useState(false)
  
  const supabase = createClient()

  const isFutureVisit = (dateStr: string, timeStr: string) => {
    try {
      const visitDate = parseISO(`${dateStr}T${timeStr || '00:00'}`)
      return visitDate > new Date()
    } catch {
      return false
    }
  }

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancelReason.trim()) {
      toast.error("Debes ingresar un motivo de cancelación")
      return
    }
    try {
      setIsCanceling(true)
      const { error } = await supabase
        .from("scheduled_visits")
        .update({ 
          estado_visita: 'cancelada', 
          motivo_cambio: cancelReason 
        })
        .eq("id", cancelingVisit.id)

      if (error) throw error

      // Borrar el evento espejo en Google Calendar (best-effort, no bloquea).
      triggerCalendarSync(cancelingVisit.id)

      toast.success("Visita cancelada")
      setCancelingVisit(null)
      setCancelReason("")
      fetchData()
    } catch (error: any) {
      toast.error("Error al cancelar: " + error.message)
    } finally {
      setIsCanceling(false)
    }
  }

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
  }, [currentDate, userId, date])

  const fetchData = async () => {
    try {
      const start = date?.from ? startOfDay(date.from) : startOfMonth(currentDate)
      const end = date?.to ? endOfDay(date.to) : (date?.from ? endOfDay(date.from) : endOfMonth(currentDate))
      
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
      console.error("Error fetching visits:", _error)
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

      <EditVisitDialog 
        visit={editingVisit}
        open={!!editingVisit}
        onOpenChange={(open) => !open && setEditingVisit(null)}
        onSuccess={fetchData}
        agencyId={agencyId || ""}
      />

      <Dialog open={!!cancelingVisit} onOpenChange={(open) => !open && setCancelingVisit(null)}>
        <DialogContent className="bg-card border-red-500/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-500 font-bold text-xl">Confirmar Cancelación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro de que deseas cancelar la visita de <span className="font-bold">{cancelingVisit?.nombre_completo}</span>?
            </p>
            <div className="space-y-2">
              <Label className="text-red-400">Motivo de la cancelación *</Label>
              <Textarea 
                placeholder="Por favor, indica por qué se cancela la visita..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="bg-accent/5 border-red-500/30"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => {
                setCancelingVisit(null)
                setCancelReason("")
              }}>Atrás</Button>
              <Button variant="destructive" disabled={isCanceling} onClick={handleCancelSubmit}>
                {isCanceling ? "Cancelando..." : "Confirmar Cancelación"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-accent/10 bg-card/30 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Calendar Header */}
        <div className="p-4 flex flex-wrap items-center justify-between border-b border-accent/10 bg-accent/5 gap-4">
          <div className="flex items-center gap-4 flex-wrap">
             <Popover>
               <PopoverTrigger asChild>
                 <Button variant="ghost" className="p-0 hover:bg-transparent h-auto group">
                   <h3 className="text-xl font-black capitalize text-foreground min-w-[150px] flex items-center gap-2 group-hover:text-accent transition-colors">
                     {date?.from ? (
                        date.to ? (
                          `${format(date.from, "dd MMM")} - ${format(date.to, "dd MMM")}`
                        ) : (
                          format(date.from, "dd MMM yyyy", { locale: es })
                        )
                     ) : (
                        format(currentDate, "MMMM yyyy", { locale: es })
                     )}
                     <ChevronDown className="h-4 w-4 opacity-50 group-hover:opacity-100 group-hover:text-accent transition-all" />
                   </h3>
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0 border-accent/20 shadow-2xl" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={date?.from || currentDate}
                    selected={date}
                    onSelect={(newDate) => {
                      setDate(newDate)
                      if (newDate?.from) {
                        setCurrentDate(newDate.from)
                      }
                    }}
                    numberOfMonths={1}
                    locale={es}
                    className="bg-card"
                  />
                  <div className="p-3 border-t border-accent/10 flex justify-between bg-accent/5">
                     <Button variant="ghost" size="sm" className="text-xs hover:bg-red-500/10 hover:text-red-500" onClick={() => {
                        setDate(undefined)
                        setCurrentDate(new Date())
                     }}>Limpiar</Button>
                     <Button variant="outline" size="sm" className="text-xs bg-background border-accent/20" onClick={() => {
                       const today = new Date();
                       setDate({from: today, to: today})
                       setCurrentDate(today)
                     }}>Hoy</Button>
                  </div>
               </PopoverContent>
             </Popover>

             <div className="flex bg-background/50 rounded-lg p-1 border border-accent/10 shadow-sm">
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent/10" onClick={() => {
                  prevMonth()
                  setDate(undefined)
                }}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" className="h-8 text-xs font-bold hover:bg-accent/10" onClick={() => {
                  setCurrentDate(new Date())
                  setDate(undefined)
                }}>Hoy</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent/10" onClick={() => {
                  nextMonth()
                  setDate(undefined)
                }}><ChevronRight className="h-4 w-4" /></Button>
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
                            <Clock className="h-2 w-2" />
                            {visit.hora_visita?.substring(0, 5) || '00:00'} - {visit.nombre_completo}
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-accent/20 max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <div className="flex justify-between items-start">
                             <div className="flex flex-col gap-1">
                               <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                 <Clock className="h-5 w-5 text-accent" />
                                 Detalle de Visita
                               </DialogTitle>
                               {visit.motivo_cambio && visit.estado_visita === 'agendada' && (
                                 <Badge variant="outline" className="w-fit text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                                   Modificada
                                 </Badge>
                               )}
                             </div>
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
                                 <h4 className="font-bold text-lg">{visit.propiedad_titulo || 'Propiedad sin título'}</h4>
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
                                 <p className="font-bold">{format(parseISO(visit.fecha_visita), "dd/MM/yyyy", { locale: es })}</p>
                                 <p className="text-xs font-bold text-accent">{visit.hora_visita} hs</p>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                              {visit.motivo_cambio && (
                                <div className={cn(
                                  "p-4 rounded-xl border space-y-2",
                                  visit.estado_visita === 'cancelada' ? "bg-red-500/5 border-red-500/20" : "bg-amber-500/5 border-amber-500/20"
                                )}>
                                  <span className={cn(
                                    "text-[10px] uppercase font-bold",
                                    visit.estado_visita === 'cancelada' ? "text-red-500" : "text-amber-500"
                                  )}>
                                    {visit.estado_visita === 'cancelada' ? 'Motivo de Cancelación' : 'Motivo de Modificación'}
                                  </span>
                                  <p className="text-xs text-foreground italic">{visit.motivo_cambio}</p>
                                </div>
                              )}
                           </div>

                           {/* Action Buttons */}
                           {visit.estado_visita === 'agendada' && isFutureVisit(visit.fecha_visita, visit.hora_visita) ? (
                              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-accent/10">
                                <Button 
                                  variant="destructive" 
                                  className="w-full sm:w-auto"
                                  onClick={() => setCancelingVisit(visit)}
                                >
                                  Cancelar Visita
                                </Button>
                                <Button 
                                  variant="outline" 
                                  className="w-full sm:w-auto border-accent/20 hover:bg-accent/10"
                                  onClick={() => setEditingVisit(visit)}
                                >
                                  Reprogramar / Editar
                                </Button>
                              </div>
                           ) : (
                              <div className="pt-4 border-t border-accent/10 text-xs italic text-muted-foreground text-center">
                                Esta visita ya no puede ser modificada.
                              </div>
                           )}
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
