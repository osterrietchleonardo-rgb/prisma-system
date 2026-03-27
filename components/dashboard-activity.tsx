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

interface DashboardActivityProps {
  data: any[]
}

export function DashboardActivity({ data }: DashboardActivityProps) {
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm h-full">
      <CardHeader>
        <CardTitle>Actividad Reciente</CardTitle>
        <CardDescription>
          Movimientos de hoy en tu inmobiliaria.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {data.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">No hay actividad reciente.</p>
            </div>
          ) : (
            data.map((activity) => (
              <div key={activity.id} className="flex items-start">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={activity.profiles?.avatar_url} />
                  <AvatarFallback className="bg-accent/10 text-accent text-xs font-bold">
                    {activity.profiles?.full_name?.split(" ").map((n: string) => n[0]).join("") || "IA"}
                  </AvatarFallback>
                </Avatar>
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">
                    <span className="text-foreground">{activity.profiles?.full_name || "Sistema"}</span>
                    {" "}
                    <span className="text-muted-foreground font-normal">
                      {activity.activity_type === 'stage_change' ? 'cambió etapa de' : 
                       activity.activity_type === 'new_lead' ? 'registró nuevo lead' : 
                       activity.activity_type === 'valuation' ? 'realizó tasación' : 'interactuó con'}
                    </span>
                    {" "}
                    <span className="text-foreground">{activity.leads?.full_name || activity.description}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: es })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

