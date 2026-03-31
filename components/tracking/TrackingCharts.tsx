"use client";

import React from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface Props {
  lineData: any[];
  funnelData: any[];
  originData: any[];
  radarData: any[];
}

export function TrackingCharts({ lineData, funnelData, originData, radarData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-24">
      {/* 1. Evolución de Leads y Operaciones */}
      <Card className="bg-background/50 border-muted-foreground/10 shadow-sm overflow-hidden h-[400px]">
        <CardHeader className="p-6">
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Evolución Comercial</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip 
                 contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} 
                 itemStyle={{ fontSize: '12px' }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 'smaller' }} />
              <Line type="monotone" dataKey="leads" name="Leads Captados" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: "#3b82f6" }} activeDot={{ r: 6, strokeWidth: 0 }} />
              <Line type="monotone" dataKey="cerrados" name="Op. Cerradas" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981" }} activeDot={{ r: 6, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 2. Embudo de Conversión */}
      <Card className="bg-background/50 border-muted-foreground/10 shadow-sm overflow-hidden h-[400px]">
        <CardHeader className="p-6">
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Embudo de Conversión</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={funnelData} margin={{ left: 40 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} contentStyle={{ borderRadius: '12px', border: 'none' }} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32}>
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 3 ? '#10b981' : '#3b82f6'} fillOpacity={1 - index * 0.15} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 3. Canales de Origen */}
      <Card className="bg-background/50 border-muted-foreground/10 shadow-sm overflow-hidden h-[400px]">
        <CardHeader className="p-6">
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Distribución por Origen</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={originData} innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" nameKey="name" labelLine={false} label>
                {originData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 'smaller' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 4. Radar Performance WA */}
      <Card className="bg-background/50 border-muted-foreground/10 shadow-sm overflow-hidden h-[400px]">
        <CardHeader className="p-6">
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Radar de Desempeño WA</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" fontSize={11} stroke="#64748b" tickLine={false} />
              <PolarRadiusAxis angle={30} domain={[0, 10]} hide />
              <Radar name="Performance" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} strokeWidth={2} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
