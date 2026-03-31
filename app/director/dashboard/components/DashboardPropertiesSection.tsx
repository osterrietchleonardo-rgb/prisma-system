"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Building2, DollarSign, Image as ImageIcon, Video, Home, CheckCircle2, Hash, Maximize } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"
import { formatCurrency } from "@/lib/utils"

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2']

export function DashboardPropertiesSection({ data }: { data: any }) {
  if (!data) return null;

  return (
    <div className="mt-12 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <div className="flex items-center gap-3">
             <h3 className="text-2xl font-bold tracking-tight">Cartera de Propiedades</h3>
             <span className="bg-accent/10 text-accent border border-accent/20 px-2 py-1 rounded-md text-xs font-semibold">
               Tokko Sync
             </span>
           </div>
          <p className="text-muted-foreground mt-1">Análisis de {data.kpis.total} propiedades en cartera.</p>
        </div>
      </div>

      {/* KPIs Principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total en cartera</CardTitle>
            <Building2 className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.total}</div>
            <p className="text-xs text-muted-foreground mt-1">propiedades activas</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor cartera (USD)</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.kpis.valorCarteraUSD)}</div>
            <p className="text-xs text-muted-foreground mt-1">suma de precios publicados</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Precio promedio</CardTitle>
            <Hash className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.kpis.precioPromedioUSD)}</div>
            <p className="text-xs text-muted-foreground mt-1">promedio en USD</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Precio m² cubierto</CardTitle>
            <Maximize className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.kpis.precioPromedioM2USD)}</div>
            <p className="text-xs text-muted-foreground mt-1">USD/m² promedio</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Apto Crédito</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.aptoCredito.count}</div>
            <p className="text-xs text-muted-foreground mt-1">{data.kpis.aptoCredito.pct}% de la cartera</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Con inquilino activo</CardTitle>
            <Home className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.conInquilino.count}</div>
            <p className="text-xs text-muted-foreground mt-1">{data.kpis.conInquilino.pct}% ocupación actual</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Visita virtual</CardTitle>
            <Video className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.conVideo.count}</div>
            <p className="text-xs text-muted-foreground mt-1">{data.kpis.conVideo.pct}% con video/Matterport</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-accent/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fotos cargadas</CardTitle>
            <ImageIcon className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.kpis.conFotos.count}</div>
            <p className="text-xs text-muted-foreground mt-1">{data.kpis.conFotos.pct}% de la cartera</p>
          </CardContent>
        </Card>
      </div>

      {/* Composición de la Cartera */}
      <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pt-4">Composición de la Cartera</h4>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 border-accent/10">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Distribución por Tipo de Propiedad</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.composition.byType}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.composition.byType.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [value, "Propiedades"]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-accent/10">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Valor de Cartera por Tipo (USD)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.composition.valueByType}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.composition.valueByType.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), "Valor USD"]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Análisis de Precios */}
      <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pt-4">Análisis de Precios</h4>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 border-accent/10">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Distribución de precios por rango</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.pricing.ranges}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: 'hsl(var(--accent)/0.1)'}}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Propiedades" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-accent/10">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Precio promedio por tipo (USD)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.pricing.typeAverages}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), "Promedio USD"]}
                  cursor={{fill: 'hsl(var(--accent)/0.1)'}}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Promedio USD" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance por asesor & Amenidades */}
      <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pt-4">Performance y Detalles</h4>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-card/50 border-accent/10 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Performance por asesor (Producer)</CardTitle>
            <CardDescription>Valor de cartera por asesor responsable</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.producers} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === "valueUSD") return [formatCurrency(value), "Valor USD"];
                    if (name === "total") return [value, "Total Inmuebles"];
                    return value;
                  }}
                  cursor={{fill: 'hsl(var(--accent)/0.1)'}}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="valueUSD" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="valueUSD" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card/50 border-accent/10">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Top Amenidades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.amenities.map((item: any) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="text-sm text-muted-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-accent/10">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Antigüedad de la cartera</CardTitle>
            </CardHeader>
            <CardContent className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.ages}>
                  <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={50} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--accent)/0.1)'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} name="Propiedades" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
