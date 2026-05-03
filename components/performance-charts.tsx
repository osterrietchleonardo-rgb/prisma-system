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
  Legend
} from "recharts"

interface Props {
  data: any[]
}

export function PerformanceCharts({ data }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Facturación Evolution */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Evolución de Facturación</CardTitle>
          <CardDescription>Comisión generada en los últimos 6 meses</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorFact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4A373" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#D4A373" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212, 163, 115, 0.1)" />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888', fontSize: 12 }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 163, 115, 0.2)', borderRadius: '12px' }}
                itemStyle={{ color: '#D4A373' }}
              />
              <Area 
                type="monotone" 
                dataKey="facturacion" 
                stroke="#D4A373" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorFact)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity Evolution */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Actividad Comercial</CardTitle>
          <CardDescription>Captaciones vs Cierres Efectivos</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212, 163, 115, 0.1)" />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888', fontSize: 12 }}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(212, 163, 115, 0.05)' }}
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 163, 115, 0.2)', borderRadius: '12px' }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" />
              <Bar 
                dataKey="captaciones" 
                name="Captaciones" 
                fill="#D4A373" 
                radius={[4, 4, 0, 0]} 
                barSize={30}
              />
              <Bar 
                dataKey="transacciones" 
                name="Cierres" 
                fill="#4ade80" 
                radius={[4, 4, 0, 0]} 
                barSize={30}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
