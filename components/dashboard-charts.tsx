"use client"

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const COLORS = ["#b87333", "#8b4513", "#d2691e", "#cd853f", "#f4a460"]

interface DashboardChartsProps {
  data: {
    channels: Array<{ name: string, total: number }>
    pipeline: Array<{ name: string, value: number }>
  }
}

export function DashboardCharts({ data }: DashboardChartsProps) {
  // Use real data or empty defaults if no data exists
  const sourceData = data.channels.length > 0 
    ? data.channels 
    : [{ name: "Sin datos", total: 0 }]

  const pipelineData = data.pipeline

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      <Card className="col-span-4 border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Leads por Canal</CardTitle>
          <CardDescription>
            Distribución de leads por fuente de contacto.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={sourceData}>
              <XAxis
                dataKey="name"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip 
                cursor={{fill: 'rgba(184, 115, 51, 0.1)'}}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  borderColor: 'hsl(var(--accent) / 0.2)',
                  borderRadius: '8px' 
                }}
              />
              <Bar
                dataKey="total"
                radius={[4, 4, 0, 0]}
              >
                {sourceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="col-span-3 border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Estado del Pipeline</CardTitle>
          <CardDescription>
            Embudo de conversión de leads.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center">
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={pipelineData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pipelineData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  borderColor: 'hsl(var(--accent) / 0.2)',
                  borderRadius: '8px' 
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

