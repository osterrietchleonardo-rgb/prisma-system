"use client"

import { useState, useEffect } from "react"
import { 
  MapPin, 
  Home, 
  Ruler, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  ChevronRight,
  History,
  TrendingUp,
  FileDown,
  Info,
  Building,
  Check,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { format } from "date-fns"

export default function AsesorTasacionesPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [valuationResult, setValuationResult] = useState<Record<string, any> | null>(null)
  const [pastValuations, setPastValuations] = useState<Record<string, any>[]>([])
  const [sessionData, setSessionData] = useState<{ id: string, agencyId: string } | null>(null)
  
  const [formData, setFormData] = useState({
    type: "departamento",
    location: "",
    sqm: "",
    rooms: "1",
    condition: "bueno",
    extra: ""
  })

  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('agency_id')
        .eq('id', session.user.id)
        .single()
      
      if (profile) {
        setSessionData({ id: session.user.id, agencyId: profile.agency_id })
        fetchHistory(profile.agency_id) // Ideally, filter history by agent ID too if requested, but agency level is fine for tasaciones
      }
    }
    loadData()
  }, [])

  const fetchHistory = async (agencyId: string) => {
    const { data } = await supabase
      .from("valuations")
      .select("*")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(5)
    setPastValuations(data || [])
  }

  const handleNext = () => setStep(s => s + 1)
  const handleBack = () => setStep(s => s - 1)

  const generateValuation = async () => {
    if (!sessionData) return
    try {
      setLoading(true)
      const res = await fetch("/api/valuation/generate", {
        method: "POST",
        body: JSON.stringify({ ...formData, agency_id: sessionData.agencyId })
      })
      const data = await res.json()
      
      if (res.ok) {
        setValuationResult(data.result_data)
        setStep(4)
        fetchHistory(sessionData.agencyId)
        toast.success("Tasación generada con éxito")
      } else {
        toast.error(data.error || "Error al generar tasación")
      }
    } catch (_error) {
      toast.error("Error de conexión API")
    } finally {
      setLoading(false)
    }
  }

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div onClick={() => setFormData({...formData, type: 'departamento'})} className={cn(
                  "p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center gap-3",
                  formData.type === 'departamento' ? "border-accent bg-accent/5 ring-4 ring-accent/10" : "border-accent/10 hover:border-accent/30 bg-card/50"
                )}>
                  <Building className={cn("h-8 w-8", formData.type === 'departamento' ? "text-accent" : "text-muted-foreground")} />
                  <span className="font-bold">Departamento</span>
                </div>
                <div onClick={() => setFormData({...formData, type: 'casa'})} className={cn(
                  "p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center gap-3",
                  formData.type === 'casa' ? "border-accent bg-accent/5 ring-4 ring-accent/10" : "border-accent/10 hover:border-accent/30 bg-card/50"
                )}>
                  <Home className={cn("h-8 w-8", formData.type === 'casa' ? "text-accent" : "text-muted-foreground")} />
                  <span className="font-bold">Casa / PH</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ubicación exacto / Zona</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent" />
                  <Input 
                    placeholder="Ej: Av. del Libertador 1500, Recoleta" 
                    className="pl-10 h-12 bg-card/50 border-accent/10"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <Button className="w-full h-12 bg-accent hover:bg-accent/90 text-lg" disabled={!formData.location} onClick={handleNext}>
              Siguiente Paso <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )
      case 2:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Superficie Total (m2)</label>
                <div className="relative">
                  <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent" />
                  <Input 
                    type="number" 
                    placeholder="0" 
                    className="pl-10 h-12 bg-card/50 border-accent/10"
                    value={formData.sqm}
                    onChange={(e) => setFormData({...formData, sqm: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ambientes</label>
                <Select value={formData.rooms} onValueChange={(v) => setFormData({...formData, rooms: v})}>
                  <SelectTrigger className="h-12 bg-card/50 border-accent/10">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'Ambiente' : 'Ambientes'}</SelectItem>)}
                    <SelectItem value="7+">7+ Ambientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Estado de la propiedad</label>
              <div className="grid grid-cols-3 gap-2">
                {['a refaccionar', 'bueno', 'excelente'].map(c => (
                  <Button 
                    key={c}
                    type="button"
                    variant={formData.condition === c ? "default" : "outline"}
                    className={cn(
                      "capitalize h-12 font-bold", 
                      formData.condition === c ? "bg-accent border-none" : "border-accent/10"
                    )}
                    onClick={() => setFormData({...formData, condition: c})}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <Button variant="ghost" className="h-12 flex-1 gap-2" onClick={handleBack}><ArrowLeft className="h-4 w-4" /> Volver</Button>
              <Button className="h-12 flex-1 bg-accent hover:bg-accent/90" disabled={!formData.sqm} onClick={handleNext}>Continuar</Button>
            </div>
          </div>
        )
      case 3:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Detalles Extra (Opcional)</label>
              <textarea 
                className="w-full min-h-[150px] rounded-2xl border border-accent/10 bg-card/50 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all font-medium"
                placeholder="Ej: Tiene balcón aterrazado, caldera individual, amenities full en el edificio..."
                value={formData.extra}
                onChange={(e) => setFormData({...formData, extra: e.target.value})}
              />
            </div>
            <div className="flex gap-4">
              <Button variant="ghost" className="h-12 flex-1 gap-2" onClick={handleBack}><ArrowLeft className="h-4 w-4" /> Volver</Button>
              <Button className="h-12 flex-1 bg-accent hover:bg-accent/90 font-bold gap-2 text-lg shadow-lg shadow-accent/20" onClick={generateValuation} disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                Tasación con IA
              </Button>
            </div>
          </div>
        )
      case 4:
        return (
          <div className="animate-in zoom-in-95 duration-500">
            <div className="bg-accent/5 rounded-3xl border border-accent/20 p-8 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Sparkles className="h-32 w-32 text-accent" />
              </div>
              
              <div className="text-center space-y-2 relative">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-accent mb-4">
                  <Check className="h-6 w-6" />
                </div>
                <h3 className="text-3xl font-black tracking-tight text-foreground">Resultado del Análisis</h3>
                <p className="text-muted-foreground">Gemini IA ha calculado el valor basado en tendencias de mercado.</p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 relative">
                 <div className="bg-card/50 p-6 rounded-2xl border border-accent/10 text-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block mb-2">Precio Sugerido</span>
                    <p className="text-4xl font-black text-accent">USD {valuationResult?.suggested_price?.toLocaleString() || "0"}</p>
                 </div>
                 <div className="bg-card/50 p-6 rounded-2xl border border-accent/10 text-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block mb-2">Rango Est.</span>
                    <p className="text-xl font-bold">
                      USD {valuationResult?.estimated_value_range?.min?.toLocaleString()} - {valuationResult?.estimated_value_range?.max?.toLocaleString()}
                    </p>
                 </div>
                 <div className="bg-card/50 p-6 rounded-2xl border border-accent/10 text-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block mb-2">USD / m2</span>
                    <p className="text-2xl font-bold">{valuationResult?.price_per_sqm?.toLocaleString() || "0"}</p>
                 </div>
              </div>

              <div className="space-y-4 relative">
                <div className="bg-card/30 p-6 rounded-2xl border border-accent/5 space-y-3">
                  <h4 className="font-bold flex items-center gap-2 text-accent">
                    <TrendingUp className="h-4 w-4" /> Inteligencia de Mercado
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{valuationResult?.market_analysis}</p>
                </div>
                <div className="flex items-center gap-3 p-4 bg-amber-500/5 rounded-xl border border-amber-500/10 text-[10px] text-amber-500/80 italic">
                  <Info className="h-4 w-4 shrink-0" />
                  {valuationResult?.disclaimer}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button className="flex-1 h-12 gap-2 bg-foreground text-background hover:bg-foreground/90">
                  <FileDown className="h-4 w-4" /> Descargar PDF
                </Button>
                <Button variant="outline" className="flex-1 h-12 border-accent/20" onClick={() => {setStep(1); setValuationResult(null);}}>
                  Nueva Tasación
                </Button>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Tasador IA (AVM)
            <Sparkles className="h-6 w-6 text-accent animate-pulse" />
          </h2>
          <p className="text-muted-foreground mt-1">
            Valuaciones de propiedades al instante con tu asistente IA.
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-4 bg-card/40 p-3 rounded-2xl border border-accent/10 px-6">
          <div className="text-center">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Créditos</p>
            <p className="font-black text-accent">20/20</p>
          </div>
          <div className="h-8 w-[1px] bg-accent/20" />
          <div className="text-center">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Velocidad</p>
            <p className="font-black">Flash</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 mt-6">
        <div className="lg:col-span-2">
          <Card className="border-accent/10 bg-card/20 backdrop-blur-md overflow-hidden shadow-2xl">
            <CardHeader className="border-b border-accent/5 pb-8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-accent">Paso {step} de 3</p>
                <Badge variant="outline" className="text-[10px] border-accent/10">AVM Modulo v1.0</Badge>
              </div>
              <Progress value={(step / 3) * 100} className="h-1 bg-accent/10" indicatorClassName="bg-accent" />
            </CardHeader>
            <CardContent className="p-8">
              {renderStep()}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-accent/10 bg-card/20 border-l-4 border-l-accent">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <History className="h-5 w-5 text-accent" />
                Historial Propietarios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pastValuations.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No hay tasaciones previas.</p>
              ) : (
                pastValuations.map((v) => (
                  <div key={v.id} className="group p-4 rounded-xl border border-accent/5 bg-background/40 hover:border-accent/30 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-accent uppercase">{v.property_type}</span>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(v.created_at), 'dd/MM/yy')}</span>
                    </div>
                    <p className="text-sm font-bold line-clamp-1">{v.location}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-accent/5">
                      <p className="font-black text-accent">USD {v.result_data?.suggested_price?.toLocaleString() || "0"}</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
            <CardFooter>
              <Button variant="ghost" className="w-full text-xs text-muted-foreground hover:text-accent">Ver historial completo</Button>
            </CardFooter>
          </Card>

          <div className="p-6 rounded-3xl bg-gradient-to-br from-accent/20 to-transparent border border-accent/20 space-y-4">
            <div className="flex items-center gap-3">
               <Sparkles className="h-8 w-8 text-accent shrink-0" />
               <h4 className="font-bold leading-tight">Potenciado por Gemini 2.0 Flash</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Nuestro motor de IA analiza miles de puntos de datos, estacionalidad y ubicación para entregarte un reporte comercial instantáneo.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
