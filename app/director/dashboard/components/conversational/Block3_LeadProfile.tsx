"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"
import type { ConversationalData, Distribucion } from "@/lib/queries/conversacional"
import { PALETA, etiquetaCategoria, fmtNum } from "./formato"

type Perfil = ConversationalData["perfil"]

/** Línea visible con la base del cálculo: sobre cuántas conversaciones sale cada porcentaje. */
function Base({ d }: { d: Distribucion }) {
  return (
    <p className="text-[10px] text-muted-foreground mt-1">
      {d.conDato > 0 ? `Sobre ${fmtNum(d.conDato)} conversaciones que tienen este dato` : "Ninguna conversación tiene este dato"}
    </p>
  )
}

export function HorizontalBarsCard({
  title, icon, d, barColor, traducir = true,
}: {
  title: string
  icon: string
  d: Distribucion
  barColor: string
  /** false para texto libre (barrios, intereses): se muestra tal cual se escribió. */
  traducir?: boolean
}) {
  const max = d.items[0]?.cantidad || 1
  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
        <Base d={d} />
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {d.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos en el período</p>
        ) : (
          d.items.map((item) => {
            const label = traducir ? etiquetaCategoria(item.etiqueta) : item.etiqueta
            return (
              <div key={item.etiqueta} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground w-[110px] shrink-0 truncate" title={label}>{label}</span>
                <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden">
                  <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${(item.cantidad / max) * 100}%`, backgroundColor: barColor, opacity: 0.7 }} />
                </div>
                <span className="text-[11px] font-semibold w-8 text-right shrink-0">{item.cantidad}</span>
                <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{item.pct}%</span>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function DonutCard({ title, icon, d }: { title: string; icon: string; d: Distribucion }) {
  // Las categorías salen de los datos: antes la lista era fija y "venta" no aparecía (15/9/2026).
  const chartData = d.items.map((it, i) => ({
    name: etiquetaCategoria(it.etiqueta),
    value: it.cantidad,
    pct: it.pct,
    color: PALETA[i % PALETA.length],
  }))

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
        <Base d={d} />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {chartData.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos en el período</p>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="42%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                    border: "1px solid rgba(184,115,51,0.2)",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                  formatter={(value: number, name: string) => [`${value} (${chartData.find((x) => x.name === name)?.pct}%)`, name]}
                />
                {/* La leyenda lleva el número: el globito del gráfico no se abre en el celular. */}
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                  formatter={(value: string) => {
                    const it = chartData.find((x) => x.name === value)
                    return <span className="text-foreground/80">{`${value} · ${it?.value ?? 0} (${it?.pct ?? 0}%)`}</span>
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FlagMetricsCard({ perfil, total }: { perfil: Perfil; total: number }) {
  // "Con experiencia previa" no se calculaba y salía vacío (15/9/2026): sale de `experiencia_compradora`.
  const items = [
    { label: "Primera vez comprando", value: perfil.primeraVez, color: "text-blue-600 dark:text-blue-400" },
    { label: "Con experiencia previa", value: perfil.conExperiencia, color: "text-emerald-700 dark:text-emerald-400" },
    { label: "Inversores", value: perfil.inversores, color: "text-amber-700 dark:text-amber-400" },
    { label: "Con crédito preaprobado", value: perfil.conPreaprobacion, color: "text-purple-600 dark:text-purple-400" },
  ]

  return (
    <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <CardTitle className="text-sm font-semibold">Perfil del comprador</CardTitle>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">% sobre las {fmtNum(total)} conversaciones del período</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
              <span className="text-xs text-muted-foreground w-9 text-right">
                {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "—"}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function Block3LeadProfile({ perfil, chats }: { perfil: Perfil; chats: number }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">Perfil del cliente</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Quién consulta y qué busca?
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Lo que el bot registró de cada cliente durante la charla. Las conversaciones donde el dato no quedó registrado no se cuentan.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DonutCard title="Tipo de operación" icon="🔄" d={perfil.tipoOperacion} />
        <DonutCard title="Urgencia de búsqueda" icon="⏱️" d={perfil.urgencia} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <HorizontalBarsCard title="Tipo de propiedad" icon="🏗️" d={perfil.tipoPropiedad} barColor="#2dd4bf" />
        <HorizontalBarsCard title="Cantidad de ambientes" icon="🚪" d={perfil.ambientes} barColor="#a78bfa" traducir={false} />
        <FlagMetricsCard perfil={perfil} total={chats} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <HorizontalBarsCard title="Composición familiar" icon="👨‍👩‍👧" d={perfil.composicionFamiliar} barColor="#fb7185" />
        <HorizontalBarsCard title="Intereses que mencionó" icon="❤️" d={perfil.intereses} barColor="#fb923c" traducir={false} />
        <HorizontalBarsCard title="Necesidades que pidió" icon="✅" d={perfil.necesidades} barColor="#60a5fa" traducir={false} />
      </div>
    </div>
  )
}
