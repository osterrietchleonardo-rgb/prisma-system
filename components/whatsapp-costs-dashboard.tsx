"use client"

import { useState, useEffect } from "react"
import { getWhatsAppCosts } from "@/app/actions/whatsapp"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { format, subDays, startOfMonth, subMonths, endOfMonth } from "date-fns"
import { es } from "date-fns/locale"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts"
import { Loader2, AlertCircle, Calendar as CalendarIcon, MessageSquare, BadgeDollarSign, Gift } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"

export function WhatsAppCostsDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })

  const fetchCosts = async (selectedDate: DateRange | undefined) => {
    setLoading(true)
    setError(null)

    if (!selectedDate?.from) {
      setError("Por favor, selecciona al menos una fecha de inicio.")
      setLoading(false)
      return
    }

    const start = selectedDate.from
    const end = selectedDate.to || selectedDate.from

    const startStr = format(start, 'yyyy-MM-dd')
    const endStr = format(end, 'yyyy-MM-dd')

    const response = await getWhatsAppCosts(startStr, endStr)
    
    if (response.success) {
      setData(parseMetaResponse(response.data))
    } else {
      setError(response.error || "Error desconocido al obtener costos.")
    }
    
    setLoading(false)
  }

  useEffect(() => {
    fetchCosts(date)
  }, [])

  const parseMetaResponse = (metaData: any) => {
    if (!metaData || !metaData.length || !metaData[0].data_points) {
      return { chartData: [], summary: null }
    }

    const dataPoints = metaData[0].data_points

    const summary = {
      total: {
        volume: 0,
        byCategory: { MARKETING: 0, SERVICE: 0, UTILITY: 0, AUTHENTICATION: 0 }
      },
      free: {
        volume: 0,
        serviceTier: 0,
        entryPoint: 0
      },
      paid: {
        volume: 0,
        cost: 0,
        byCategory: { 
          MARKETING: { volume: 0, cost: 0 }, 
          SERVICE: { volume: 0, cost: 0 }, 
          UTILITY: { volume: 0, cost: 0 }, 
          AUTHENTICATION: { volume: 0, cost: 0 } 
        }
      }
    }

    const groupedByDate: Record<string, any> = {}

    dataPoints.forEach((point: any) => {
      const dateStr = format(new Date(point.start * 1000), 'dd MMM', { locale: es })
      const cost = point.cost || 0
      const volume = point.volume || 0
      const category = point.pricing_category || 'UNKNOWN'
      const pricingType = point.pricing_type || 'REGULAR'

      if (!groupedByDate[dateStr]) {
        groupedByDate[dateStr] = { 
          date: dateStr, 
          paidVolume: 0, 
          freeVolume: 0,
          cost: 0
        }
      }

      // Populate summary totals
      summary.total.volume += volume
      if (summary.total.byCategory[category as keyof typeof summary.total.byCategory] !== undefined) {
        summary.total.byCategory[category as keyof typeof summary.total.byCategory] += volume
      }

      // Split into free vs paid
      if (pricingType === 'FREE_TIER' || pricingType === 'FREE_CUSTOMER_SERVICE' || pricingType === 'FREE_ENTRY_POINT') {
        summary.free.volume += volume
        groupedByDate[dateStr].freeVolume += volume

        if (pricingType === 'FREE_TIER' || pricingType === 'FREE_CUSTOMER_SERVICE') summary.free.serviceTier += volume
        if (pricingType === 'FREE_ENTRY_POINT') summary.free.entryPoint += volume
      } else {
        // REGULAR (Paid)
        summary.paid.volume += volume
        summary.paid.cost += cost
        groupedByDate[dateStr].paidVolume += volume
        groupedByDate[dateStr].cost += cost

        if (summary.paid.byCategory[category as keyof typeof summary.paid.byCategory] !== undefined) {
          summary.paid.byCategory[category as keyof typeof summary.paid.byCategory].volume += volume
          summary.paid.byCategory[category as keyof typeof summary.paid.byCategory].cost += cost
        }
      }
    })

    const chartData = Object.values(groupedByDate)

    return { chartData, summary }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(val)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Insights de Mensajería (Meta)</h2>
          <p className="text-muted-foreground mt-1">Rendimiento, volúmenes gratuitos y facturación de la API oficial.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="grid gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "w-[300px] justify-start text-left font-normal border-accent/20",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-accent" />
                  {date?.from ? (
                    date.to ? (
                      <>
                        {format(date.from, "LLL dd, y", { locale: es })} -{" "}
                        {format(date.to, "LLL dd, y", { locale: es })}
                      </>
                    ) : (
                      format(date.from, "LLL dd, y", { locale: es })
                    )
                  ) : (
                    <span>Seleccionar fechas</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date?.from}
                  selected={date}
                  onSelect={setDate}
                  numberOfMonths={2}
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button variant="outline" onClick={() => fetchCosts(date)} disabled={loading} className="border-accent/20 hover:bg-accent/10">
             {loading ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : "Actualizar"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 animate-in fade-in">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {data && data.summary && !error && (
        <>
          {/* Main 3 Metrics mimicking Meta Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
            
            {/* 1. Todos los mensajes (Entregados) */}
            <Card className="border-accent/10 bg-card/30 backdrop-blur-md shadow-sm">
              <CardHeader className="pb-2 border-b border-accent/5 mb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-500" />
                  Mensajes Entregados
                  <span className="ml-auto text-xl">{data.summary.total.volume}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Marketing</span>
                  <span className="font-medium">{data.summary.total.byCategory.MARKETING}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Servicio</span>
                  <span className="font-medium">{data.summary.total.byCategory.SERVICE}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Utilidad</span>
                  <span className="font-medium">{data.summary.total.byCategory.UTILITY}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Autenticación</span>
                  <span className="font-medium">{data.summary.total.byCategory.AUTHENTICATION}</span>
                </div>
              </CardContent>
            </Card>

            {/* 2. Mensajes gratuitos */}
            <Card className="border-accent/10 bg-card/30 backdrop-blur-md shadow-sm">
              <CardHeader className="pb-2 border-b border-accent/5 mb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Gift className="h-4 w-4 text-emerald-500" />
                  Mensajes Gratuitos
                  <span className="ml-auto text-xl text-emerald-500">{data.summary.free.volume}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground max-w-[200px] leading-tight">Servicio de atención al cliente gratuito</span>
                  <span className="font-medium text-emerald-500">{data.summary.free.serviceTier}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground max-w-[200px] leading-tight">Gratuitas desde punto de acceso</span>
                  <span className="font-medium text-emerald-500">{data.summary.free.entryPoint}</span>
                </div>
              </CardContent>
            </Card>

            {/* 3. Mensajes de pago y cargos */}
            <Card className="border-accent/10 bg-card/30 backdrop-blur-md shadow-sm border-accent/30 bg-accent/5">
              <CardHeader className="pb-2 border-b border-accent/10 mb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BadgeDollarSign className="h-4 w-4 text-accent" />
                  Mensajes de Pago
                  <div className="ml-auto text-right">
                    <span className="text-xl font-bold text-accent">{formatCurrency(data.summary.paid.cost)}</span>
                    <p className="text-xs text-muted-foreground font-normal">{data.summary.paid.volume} msjs</p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex gap-2">
                    Marketing <span className="text-xs bg-background/50 px-1 rounded text-muted-foreground">{data.summary.paid.byCategory.MARKETING.volume} msj</span>
                  </span>
                  <span className="font-medium">{formatCurrency(data.summary.paid.byCategory.MARKETING.cost)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex gap-2">
                    Servicio <span className="text-xs bg-background/50 px-1 rounded text-muted-foreground">{data.summary.paid.byCategory.SERVICE.volume} msj</span>
                  </span>
                  <span className="font-medium">{formatCurrency(data.summary.paid.byCategory.SERVICE.cost)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex gap-2">
                    Utilidad <span className="text-xs bg-background/50 px-1 rounded text-muted-foreground">{data.summary.paid.byCategory.UTILITY.volume} msj</span>
                  </span>
                  <span className="font-medium">{formatCurrency(data.summary.paid.byCategory.UTILITY.cost)}</span>
                </div>
              </CardContent>
            </Card>

          </div>

          <Card className="border-accent/10 bg-card/30 backdrop-blur-md shadow-sm animate-in fade-in slide-in-from-bottom-4">
            <CardHeader>
              <CardTitle>Evolución de Envíos y Costos</CardTitle>
              <CardDescription>Comparativa diaria de mensajes gratuitos vs pagos y su costo asociado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                {data.chartData && data.chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                      <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--accent))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                      
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                        cursor={{fill: 'hsl(var(--accent)/0.1)'}}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="freeVolume" stackId="a" fill="#10b981" name="Mensajes Gratis" radius={[0,0,4,4]} />
                      <Bar yAxisId="left" dataKey="paidVolume" stackId="a" fill="#3b82f6" name="Mensajes Pagos" radius={[4,4,0,0]} />
                      <Line yAxisId="right" type="monotone" dataKey="cost" stroke="hsl(var(--accent))" strokeWidth={3} name="Costo Total" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground border-2 border-dashed border-accent/10 rounded-xl bg-background/50">
                    No hay datos reportados por Meta para este período.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
