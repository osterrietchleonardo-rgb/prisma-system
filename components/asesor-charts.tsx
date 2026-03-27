"use client"

import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts"

interface EvolutionChartProps {
  data: any[]
}

export function EvolutionChart({ data }: EvolutionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-accent/5 rounded-lg border border-dashed border-accent/20">
        <p className="text-sm text-muted-foreground">Sin datos evolutivos suficientes</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" vertical={false} opacity={0.1} />
        <XAxis 
          dataKey="name" 
          stroke="#94a3b8" 
          fontSize={12} 
          tickLine={false} 
          axisLine={false} 
        />
        <YAxis 
          stroke="#94a3b8" 
          fontSize={12} 
          tickLine={false} 
          axisLine={false} 
          tickFormatter={(value) => `${value}`}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#020617', 
            border: '1px solid #b87333', 
            borderRadius: '12px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 10px 15px -3px rgba(184, 115, 51, 0.1)'
          }}
          itemStyle={{ color: '#f8fafc' }}
          cursor={{ stroke: '#b87333', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Line 
          type="monotone" 
          dataKey="leads" 
          stroke="#b87333" 
          strokeWidth={3} 
          dot={{ fill: '#b87333', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, fill: '#b87333', stroke: '#fff' }}
          animationDuration={1500}
        />
        <Line 
          type="monotone" 
          dataKey="cierres" 
          stroke="#10b981" 
          strokeWidth={2} 
          dot={{ fill: '#10b981', r: 3 }}
          animationDuration={2000}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
