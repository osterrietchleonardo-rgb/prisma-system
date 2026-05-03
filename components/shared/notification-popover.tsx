"use client"

import * as React from "react"
import { Bell, MessageSquare, Key, TrendingUp, CheckCircle2 } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

const SAMPLE_NOTIFICATIONS = [
  {
    id: "1",
    title: "Nuevo Lead",
    description: "Juan Perez ha solicitado información sobre 'Calle Florida 123'",
    time: "hace 5 min",
    type: "lead",
    icon: MessageSquare,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    read: false
  },
  {
    id: "2",
    title: "Captación Exitosa",
    description: "Se ha registrado una nueva propiedad en 'Recoleta'",
    time: "hace 1 hora",
    type: "property",
    icon: Key,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    read: false
  },
  {
    id: "3",
    title: "Cierre Confirmado",
    description: "Venta de departamento finalizada por Leito asesor",
    time: "hace 3 horas",
    type: "closing",
    icon: TrendingUp,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    read: true
  }
]

export function NotificationPopover() {
  const [open, setOpen] = React.useState(false)
  const unreadCount = SAMPLE_NOTIFICATIONS.filter(n => !n.read).length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-accent transition-colors">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-background animate-pulse"></span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 border-accent/20 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/50" align="end">
        <div className="p-4 border-b border-accent/10 flex items-center justify-between">
          <h4 className="font-bold text-sm tracking-tight">Notificaciones</h4>
          <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20 text-[10px]">
            {unreadCount} nuevas
          </Badge>
        </div>
        <ScrollArea className="h-[350px]">
          <div className="divide-y divide-accent/5">
            {SAMPLE_NOTIFICATIONS.map((notification) => (
              <div 
                key={notification.id} 
                className={`p-4 flex gap-3 hover:bg-accent/5 transition-colors cursor-pointer ${!notification.read ? 'bg-accent/[0.02]' : ''}`}
              >
                <div className={`mt-1 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${notification.bg}`}>
                  <notification.icon className={`h-4 w-4 ${notification.color}`} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-semibold ${!notification.read ? 'text-white' : 'text-muted-foreground'}`}>
                      {notification.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60">{notification.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {notification.description}
                  </p>
                </div>
                {!notification.read && (
                  <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent"></div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="p-2 border-t border-accent/10 bg-accent/5">
          <Button variant="ghost" className="w-full h-8 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-accent">
            Ver todas las notificaciones
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
