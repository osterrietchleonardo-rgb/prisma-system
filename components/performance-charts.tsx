"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend,
  Cell,
  Pie,
  PieChart
} from "recharts"

interface Props {
  data: any[]
}

export function PerformanceCharts({ data, channels }: { data: any[], channels?: any[] }) {
  const COLORS = ['#D4A373', '#4ade80', '#60a5fa', '#a855f7', '#f97316'];
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Facturación Evolution */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Facturación</CardTitle>
          <CardDescription>Comisión mensual (u$s)</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorFact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4A373" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#D4A373" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212, 163, 115, 0.1)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 163, 115, 0.2)', borderRadius: '12px' }}
                itemStyle={{ color: '#D4A373' }}
              />
              <Area type="monotone" dataKey="facturacion" stroke="#D4A373" strokeWidth={3} fillOpacity={1} fill="url(#colorFact)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity Evolution */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Actividad</CardTitle>
          <CardDescription>Captaciones vs Cierres</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212, 163, 115, 0.1)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} />
              <Tooltip 
                cursor={{ fill: 'rgba(212, 163, 115, 0.05)' }}
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 163, 115, 0.2)', borderRadius: '12px' }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="captaciones" name="Captaciones" fill="#D4A373" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="transacciones" name="Cierres" fill="#4ade80" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Rotation & Portfolio */}
      <Card className="md:col-span-2 lg:col-span-1 border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Rotación y Stock</CardTitle>
          <CardDescription>Cartera Promedio vs Velocidad de Venta</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212, 163, 115, 0.1)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 163, 115, 0.2)', borderRadius: '12px' }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
              <Bar yAxisId="left" dataKey="invPromedio" name="Cartera Prom." fill="#8884d8" opacity={0.5} radius={[4, 4, 0, 0]} barSize={30} />
              <Line yAxisId="right" type="monotone" dataKey="rotacion" name="% Rotación" stroke="#ff7300" strokeWidth={3} dot={{ r: 4 }} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      {/* Channel Distribution */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Orígenes de Leads</CardTitle>
          <CardDescription>Rendimiento por Canal</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={channels}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="count"
                nameKey="label"
              >
                {channels?.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 163, 115, 0.2)', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
