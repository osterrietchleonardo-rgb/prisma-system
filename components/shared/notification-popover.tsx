"use client"

import * as React from "react"
import { Bell, MessageSquare, Key, TrendingUp, CheckCircle2, Loader2, Inbox } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { getNotifications, markNotificationAsRead } from "@/lib/actions/notifications"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

const typeIcons: Record<string, any> = {
  lead: MessageSquare,
  property: Key,
  closing: TrendingUp,
  system: CheckCircle2,
}

const typeColors: Record<string, string> = {
  lead: "text-blue-400",
  property: "text-amber-400",
  closing: "text-emerald-400",
  system: "text-purple-400",
}

const typeBgs: Record<string, string> = {
  lead: "bg-blue-400/10",
  property: "bg-amber-400/10",
  closing: "bg-emerald-400/10",
  system: "bg-purple-400/10",
}

export function NotificationPopover() {
  const [open, setOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)

  const fetchNotifications = React.useCallback(async () => {
    try {
      const data = await getNotifications()
      setNotifications(data)
    } catch (error) {
      console.error("Error fetching notifications:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // Poll for new notifications every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const unreadCount = notifications.filter(n => !n.read).length

  const handleMarkAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await markNotificationAsRead(id)
  }

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
        <div className="p-4 border-b border-accent/10 flex items-center justify-between bg-accent/[0.02]">
          <h4 className="font-bold text-sm tracking-tight">Notificaciones</h4>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20 text-[10px] font-bold">
              {unreadCount} nuevas
            </Badge>
          </div>
        </div>
        <ScrollArea className="h-[350px]">
          <div className="divide-y divide-accent/5">
            {notifications.length > 0 ? (
              notifications.map((notification) => {
                const Icon = typeIcons[notification.type] || Bell
                const color = typeColors[notification.type] || "text-accent"
                const bg = typeBgs[notification.type] || "bg-accent/10"
                
                return (
                  <div 
                    key={notification.id} 
                    onClick={() => handleMarkAsRead(notification.id)}
                    className={`p-4 flex gap-3 hover:bg-accent/5 transition-all cursor-pointer group ${!notification.read ? 'bg-accent/[0.02]' : ''}`}
                  >
                    <div className={`mt-1 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-inner transition-transform group-hover:scale-110 ${bg}`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-bold tracking-tight ${!notification.read ? 'text-white' : 'text-muted-foreground'}`}>
                          {notification.title}
                        </p>
                        <span className="text-[9px] font-bold text-muted-foreground/40 uppercase">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: es })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed opacity-80">
                        {notification.description}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="mt-2 h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"></div>
                    )}
                  </div>
                )
              })
            ) : !loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground/30 gap-2">
                <Inbox className="h-10 w-10" />
                <p className="text-xs font-bold uppercase tracking-widest">Sin notificaciones</p>
              </div>
            ) : null}
          </div>
        </ScrollArea>
        <div className="p-2 border-t border-accent/10 bg-accent/5">
          <Button variant="ghost" className="w-full h-9 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-accent hover:bg-accent/10 transition-all">
            Ver todas las notificaciones
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
