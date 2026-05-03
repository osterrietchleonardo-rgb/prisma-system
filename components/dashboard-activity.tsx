import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { 
  Key, 
  TrendingUp, 
  MessageSquare, 
  Activity,
  DollarSign,
  Briefcase
} from "lucide-react"

interface DashboardActivityProps {
  data: any[]
}

export function DashboardActivity({ data }: DashboardActivityProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'captacion':
        return <Key className="h-4 w-4 text-amber-400" />
      case 'transaccion':
        return <TrendingUp className="h-4 w-4 text-emerald-400" />
      case 'lead_seguimiento':
        return <MessageSquare className="h-4 w-4 text-blue-400" />
      default:
        return <Activity className="h-4 w-4 text-purple-400" />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'captacion':
        return 'bg-amber-400/10 text-amber-400 border-amber-400/20'
      case 'transaccion':
        return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
      case 'lead_seguimiento':
        return 'bg-blue-400/10 text-blue-400 border-blue-400/20'
      default:
        return 'bg-purple-400/10 text-purple-400 border-purple-400/20'
    }
  }

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'captacion':
        return 'Nueva Captación'
      case 'transaccion':
        return 'Cierre / Venta'
      case 'lead_seguimiento':
        return 'Seguimiento'
      default:
        return 'Actividad'
    }
  }

  return (
    <Card className="border-accent/10 bg-card/40 backdrop-blur-md h-full shadow-xl shadow-black/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Movimientos Recientes
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Actividad concreta de tus asesores en tiempo real.
            </CardDescription>
          </div>
          <div className="p-2 bg-accent/5 rounded-full border border-accent/10">
            <Activity className="h-5 w-5 text-accent" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center mb-3">
                <Briefcase className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">No se registran movimientos recientes.</p>
            </div>
          ) : (
            data.map((activity, index) => (
              <div 
                key={activity.id} 
                className="group relative flex items-start p-3 rounded-xl transition-all duration-300 hover:bg-accent/5 border border-transparent hover:border-accent/10"
              >
                <div className="relative">
                  <Avatar className="h-10 w-10 border-2 border-background ring-2 ring-accent/10">
                    <AvatarImage src={activity.profiles?.avatar_url} />
                    <AvatarFallback className="bg-gradient-to-br from-accent/20 to-accent/5 text-accent text-xs font-bold">
                      {activity.profiles?.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "A"}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-background shadow-lg ${getActivityColor(activity.type).split(' ')[0]}`}>
                    {getActivityIcon(activity.type)}
                  </div>
                </div>

                <div className="ml-4 flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white group-hover:text-accent transition-colors">
                      {activity.profiles?.full_name || "Asesor"}
                    </p>
                    <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: es })}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] h-5 px-2 font-bold uppercase tracking-tighter ${getActivityColor(activity.type)}`}>
                      {getActivityLabel(activity.type)}
                    </Badge>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {activity.type === 'transaccion' ? 'Cierre con ' : activity.type === 'captacion' ? 'Nueva propiedad de ' : 'Gestión para '}
                      <span className="text-white/80 font-medium">{activity.nombre_cliente}</span>
                    </p>
                  </div>

                  {activity.propiedad_ref && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground/60">
                      <Key className="h-3 w-3" />
                      <span>REF: {activity.propiedad_ref}</span>
                      {activity.monto_operacion > 0 && (
                        <>
                          <span className="mx-1">•</span>
                          <span className="text-emerald-400 font-medium">
                            USD {Number(activity.monto_operacion).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

