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
  Filter,
  CheckCircle2,
  Clock3
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
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

export default function CalendarioPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [visits, setVisits] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState("all")
  const [agents, setAgents] = useState<Record<string, any>[]>([])
  
  const supabase = createClient()
  const agencyId = "00000000-0000-0000-0000-000000000000" // Mock

  useEffect(() => {
    fetchData()
  }, [currentDate, selectedAgent])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Get agents for filter
      const { data: agentsData } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("agency_id", agencyId)
        .eq("role", "asesor")
      
      setAgents(agentsData || [])

      // Get visits
      const start = startOfMonth(currentDate)
      const end = endOfMonth(currentDate)
      
      let query = supabase
        .from("visits")
        .select(`
          *,
          agent:profiles(id, full_name, avatar_url),
          property:properties(id, title, address),
          lead:leads(id, full_name)
        `)
        .eq("agency_id", agencyId)
        .gte("visit_date", start.toISOString())
        .lte("visit_date", end.toISOString())

      if (selectedAgent !== "all") {
        query = query.eq("agent_id", selectedAgent)
      }

      const { data, error } = await query
      if (error) throw error
      setVisits(data || [])
    } catch (_error) {
      toast.error("Error al cargar calendario")
    } finally {
      setLoading(false)
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
    return visits.filter(v => isSameDay(parseISO(v.visit_date), day))
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Calendario de Visitas
            <CalendarIcon className="h-6 w-6 text-accent" />
          </h2>
          <p className="text-muted-foreground mt-1">
            Visualiza y coordina todas las visitas de tu inmobiliaria en tiempo real.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
           <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-[180px] bg-card/50 border-accent/10">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filtrar Asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                ))}
              </SelectContent>
           </Select>
           <Button className="bg-accent hover:bg-accent/90 gap-2">
             <Plus className="h-4 w-4" />
             Nueva Visita
           </Button>
        </div>
      </div>

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
             <Badge variant="outline" className="bg-card/50 text-[10px] gap-1"><Clock3 className="h-3 w-3" /> Pendientes</Badge>
             <Badge variant="outline" className="bg-card/50 text-[10px] gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Realizadas</Badge>
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
                  {dayVisits.length > 0 && isCurrentMonth && (
                    <span className="text-[10px] font-black text-accent bg-accent/10 px-1.5 rounded">{dayVisits.length}</span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  {dayVisits.map((visit) => (
                    <Dialog key={visit.id}>
                      <DialogTrigger asChild>
                        <div className={cn(
                          "group p-1.5 rounded-lg border text-[10px] cursor-pointer transition-all hover:scale-[1.02]",
                          visit.status === 'confirmed' ? "bg-green-500/5 border-green-500/20 text-green-500/80" : "bg-accent/5 border-accent/20 text-accent/80"
                        )}>
                          <div className="flex items-center justify-between gap-1 mb-1 font-bold">
                            <span className="truncate">{format(parseISO(visit.visit_date), "HH:mm")} • {visit.lead?.full_name}</span>
                          </div>
                          <div className="truncate text-muted-foreground group-hover:text-foreground">
                            {visit.property?.address}
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-accent/20">
                        <DialogHeader>
                          <div className="flex justify-between items-start">
                             <DialogTitle className="text-xl font-bold flex items-center gap-2">
                               <Clock className="h-5 w-5 text-accent" />
                               Detalle de Visita
                             </DialogTitle>
                             <Badge className={cn(
                               "border-none px-3",
                               visit.status === 'confirmed' ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                             )}>
                               {visit.status === 'confirmed' ? 'Realizada' : 'Pendiente'}
                             </Badge>
                          </div>
                        </DialogHeader>

                        <div className="grid gap-6 py-4">
                           <div className="flex items-center gap-4 bg-accent/5 p-4 rounded-xl border border-accent/10">
                              <MapPin className="h-10 w-10 text-accent bg-accent/10 p-2 rounded-full" />
                              <div>
                                 <h4 className="font-bold text-lg">{visit.property?.title}</h4>
                                 <p className="text-sm text-muted-foreground">{visit.property?.address}</p>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                   <User className="h-3 w-3" /> Lead
                                 </span>
                                 <p className="font-bold">{visit.lead?.full_name}</p>
                              </div>
                              <div className="space-y-1">
                                 <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                   <User className="h-3 w-3" /> Asesor
                                 </span>
                                 <div className="flex items-center gap-2">
                                    <Avatar className="h-5 w-5">
                                      <AvatarImage src={visit.agent?.avatar_url} />
                                      <AvatarFallback className="text-[8px]">
                                        {visit.agent?.full_name?.substring(0,2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <p className="font-bold text-xs">{visit.agent?.full_name}</p>
                                 </div>
                              </div>
                           </div>
                           
                           <div className="bg-accent/5 p-4 rounded-xl border border-accent/10 space-y-2">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground">Notas</span>
                              <p className="text-sm italic text-muted-foreground">{visit.notes ? `"${visit.notes}"` : "Sin notas adicionales"}</p>
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

