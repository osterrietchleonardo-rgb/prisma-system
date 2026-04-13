"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { MarketingIAStepper } from "./marketing-ia-stepper"
import { PropertySelector } from "./property-selector"
import { 
  ArrowLeft, 
  ArrowRight, 
  Save, 
  Loader2, 
  Target, 
  Zap, 
  Users, 
  ShieldAlert, 
  Home, 
  Search,
  CheckCircle2,
  Info
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { TokkoProperty, IpcProfile } from "@/types/marketing-ia"

// Specialized Schemas
const captarSchema = z.object({
  tipo_ipc: z.literal('captar'),
  nombre_perfil: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  objetivo: z.string().min(1, "Seleccione un objetivo"),
  tipo_inmueble: z.array(z.string()).min(1, "Seleccione al menos un tipo"),
  zona_principal: z.string().min(1, "Ingrese la zona"),
  rango_valor_precio: z.string().min(1, "Ingrese el rango de valor"),
  flow_data: z.object({
    tipo_propietario: z.string(),
    motivo_venta: z.string(),
    etapa_hoy: z.string(),
    urgencia_necesidad: z.string(),
    dependencia_venta: z.enum(['Si', 'No']),
    preocupaciones: z.array(z.string()),
    objecion_principal: z.string(),
    freno_hoy: z.string(),
    miedo_frecuente: z.string(),
    logro_esperado: z.string(),
    valor_prioridad: z.string(),
    tipo_inmobiliaria_confia: z.string(),
    prueba_confianza: z.array(z.string()),
    angulo_marketing: z.string(),
    tono_comunicacion: z.string(),
    canal_formato: z.array(z.string()),
    no_prometer: z.string(),
    resumen_frase: z.string(),
    promesa_central: z.string(),
    cta_recomendado: z.string(),
    nivel_conciencia: z.string()
  })
})

const venderSchema = z.object({
  tipo_ipc: z.literal('vender'),
  nombre_perfil: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  propiedad_tokko_id: z.number().optional(),
  tipo_inmueble: z.array(z.string()).min(1, "Seleccione al menos un tipo"),
  zona_principal: z.string().optional(),
  rango_valor_precio: z.string().optional(),
  flow_data: z.object({
    tipo_comprador_ideal: z.string(),
    situacion_vida: z.string(),
    necesidad_concreta: z.string(),
    problema_resolver: z.string(),
    resultado_querido: z.string(),
    valor_prioridad: z.string(),
    atractivo_propiedad: z.array(z.string()),
    factores_duda: z.array(z.string()),
    objecion_comun: z.string(),
    evidencia_necesaria: z.array(z.string()),
    angulo_copy: z.string(),
    promesa_creible: z.string(),
    tono: z.string(),
    formato_anuncio: z.array(z.string()),
    no_mostrar: z.string(),
    resumen_frase: z.string(),
    mensaje_central: z.string(),
    cta: z.string(),
    nivel_conciencia: z.string()
  })
})

const ipcSchema = z.discriminatedUnion('tipo_ipc', [captarSchema, venderSchema])

type IpcFormValues = z.infer<typeof ipcSchema>

const CAPTAR_STEPS = [
  "Objetivo",
  "Perfil",
  "Psicología",
  "Estrategia",
  "Resumen"
]

const VENDER_STEPS = [
  "Propiedad",
  "Comprador",
  "Atractivos",
  "Estrategia",
  "Resumen"
]

export function IpcForm({ initialData, onSave }: { initialData?: any, onSave?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<TokkoProperty | null>(null)
  const [flowType, setFlowType] = useState<'captar' | 'vender' | null>(initialData?.tipo_ipc || null)
  
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<IpcFormValues>({
    resolver: zodResolver(ipcSchema),
    defaultValues: initialData || {
      tipo_ipc: 'captar',
      nombre_perfil: "",
      objetivo: "Captar propietarios",
      tipo_inmueble: [],
      zona_principal: "",
      rango_valor_precio: "",
      flow_data: {
        tipo_propietario: "",
        motivo_venta: "",
        etapa_hoy: "",
        urgencia_necesidad: "",
        dependencia_venta: "No",
        preocupaciones: [],
        objecion_principal: "",
        freno_hoy: "",
        miedo_frecuente: "",
        logro_esperado: "",
        valor_prioridad: "",
        tipo_inmobiliaria_confia: "",
        prueba_confianza: [],
        angulo_marketing: "",
        tono_comunicacion: "",
        canal_formato: [],
        no_prometer: "",
        resumen_frase: "",
        promesa_central: "",
        cta_recomendado: "",
        nivel_conciencia: ""
      }
    }
  })

  const steps = flowType === 'vender' ? VENDER_STEPS : CAPTAR_STEPS
  const watchTipoIpc = form.watch('tipo_ipc')

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, steps.length))
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0))

  const handleSelectFlow = (type: 'captar' | 'vender') => {
    setFlowType(type)
    form.reset({
      tipo_ipc: type,
      nombre_perfil: "",
      tipo_inmueble: [],
      zona_principal: "",
      rango_valor_precio: "",
      flow_data: type === 'captar' ? {
        tipo_propietario: "",
        motivo_venta: "",
        etapa_hoy: "",
        urgencia_necesidad: "",
        dependencia_venta: "No",
        preocupaciones: [],
        objecion_principal: "",
        freno_hoy: "",
        miedo_frecuente: "",
        logro_esperado: "",
        valor_prioridad: "",
        tipo_inmobiliaria_confia: "",
        prueba_confianza: [],
        angulo_marketing: "",
        tono_comunicacion: "",
        canal_formato: [],
        no_prometer: "",
        resumen_frase: "",
        promesa_central: "",
        cta_recomendado: "",
        nivel_conciencia: ""
      } : {
        tipo_comprador_ideal: "",
        situacion_vida: "",
        necesidad_concreta: "",
        problema_resolver: "",
        resultado_querido: "",
        valor_prioridad: "",
        atractivo_propiedad: [],
        factores_duda: [],
        objecion_comun: "",
        evidencia_necesaria: [],
        angulo_copy: "",
        promesa_creible: "",
        tono: "",
        formato_anuncio: [],
        no_mostrar: "",
        resumen_frase: "",
        mensaje_central: "",
        cta: "",
        nivel_conciencia: ""
      }
    } as any)
    setCurrentStep(0)
  }

  const onSubmit = async (data: IpcFormValues) => {
    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No hay sesión activa")

      const payload = {
        ...data,
        user_id: user.id,
        updated_at: new Date().toISOString()
      }

      let error
      if (initialData?.id) {
        ({ error } = await supabase
          .from('ipc_profiles')
          .update(payload)
          .eq('id', initialData.id))
      } else {
        ({ error } = await supabase
          .from('ipc_profiles')
          .insert([payload]))
      }

      if (error) throw error

      toast.success(initialData?.id ? "Segmento actualizado" : "Segmento creado")
      if (onSave) {
        onSave()
      } else {
        router.push(window.location.pathname.includes('/director/') ? '/director/marketing-ia' : '/asesor/marketing-ia')
      }
    } catch (error: any) {
      toast.error("Error al guardar: " + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleArrayItem = (fieldName: any, value: string) => {
    const current = form.getValues(fieldName) as string[]
    const next = current.includes(value)
      ? current.filter(i => i !== value)
      : [...current, value]
    form.setValue(fieldName, next as any, { shouldValidate: true })
  }

  if (!flowType) {
    return (
      <Card className="w-full max-w-4xl mx-auto border-accent/20 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden p-12">
        <div className="text-center space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-black tracking-tight text-foreground">¿Qué tipo de perfil quieres crear?</h2>
            <p className="text-muted-foreground text-lg">Selecciona un workflow especializado para atraer leads de calidad.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Button 
              variant="outline" 
              className="h-auto p-8 flex flex-col items-center gap-4 border-2 hover:border-accent hover:bg-accent/5 transition-all group"
              onClick={() => handleSelectFlow('captar')}
            >
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-accent" />
              </div>
              <div className="text-center">
                <span className="text-xl font-bold block">IPC para CAPTAR</span>
                <span className="text-sm text-muted-foreground">Atrae propietarios que buscan vender su inmueble.</span>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-8 flex flex-col items-center gap-4 border-2 hover:border-accent hover:bg-accent/5 transition-all group"
              onClick={() => handleSelectFlow('vender')}
            >
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Home className="w-8 h-8 text-accent" />
              </div>
              <div className="text-center">
                <span className="text-xl font-bold block">IPC para VENDER</span>
                <span className="text-sm text-muted-foreground">Atrae compradores para una propiedad específica.</span>
              </div>
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-4xl mx-auto border-accent/20 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-black flex items-center gap-2">
              <Target className="w-8 h-8 text-accent" />
              {flowType === 'captar' ? "IPC para Captar Propietarios" : "IPC para Vender Propiedad"}
            </CardTitle>
            <CardDescription className="text-md">
              {flowType === 'captar' ? "Define el perfil del dueño de casa ideal." : "Define quién es el comprador ideal para tu inmueble."}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setFlowType(null)} className="text-xs font-bold text-muted-foreground hover:text-accent">
            <ArrowLeft className="w-3 h-3 mr-1" /> CAMBIAR TIPO
          </Button>
        </div>
        <MarketingIAStepper steps={steps} currentStep={currentStep} className="mt-8" />
      </CardHeader>
      
      <CardContent className="mt-6 min-h-[500px]">
        <form className="space-y-8">
          {/* FLOW: CAPTAR */}
          {flowType === 'captar' && (
            <>
              {currentStep === 0 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 col-span-full">
                      <Label className="text-sm font-bold">Nombre del IPC</Label>
                      <Input {...form.register("nombre_perfil")} placeholder="Ej: Propietario con urgencia media y necesidad de liquidez" className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Objetivo de este IPC</Label>
                      <Select 
                        onValueChange={(v) => form.setValue("objetivo", v)} 
                        defaultValue={form.getValues("objetivo")}
                      >
                        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Captar propietarios">Captar propietarios</SelectItem>
                          <SelectItem value="Captar propietarios de alto valor">Captar propietarios de alto valor</SelectItem>
                          <SelectItem value="Captar propietarios con urgencia">Captar propietarios con urgencia</SelectItem>
                          <SelectItem value="Captar propietarios que ya intentaron vender">Captar propietarios que ya intentaron vender</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Zona principal de captación</Label>
                      <Input {...form.register("zona_principal")} placeholder="Ej: Palermo, Recoleta, etc." className="h-12" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Label className="text-sm font-bold">Tipo de inmueble (Múltiple)</Label>
                    <div className="flex flex-wrap gap-2">
                      {["Casa", "Departamento", "PH", "Terreno / lote", "Local comercial", "Oficina"].map(tipo => (
                        <Button
                          key={tipo}
                          type="button"
                          variant="outline"
                          className={cn(
                            "text-xs px-4 py-2 font-bold transition-all",
                            form.watch("tipo_inmueble").includes(tipo) ? "bg-accent/20 border-accent text-foreground" : "border-muted/50"
                          )}
                          onClick={() => toggleArrayItem("tipo_inmueble", tipo)}
                        >
                          {tipo}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Rango de valor de propiedad para captar</Label>
                    <Input {...form.register("rango_valor_precio")} placeholder="Ej: USD 150k - 300k" className="h-12" />
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Tipo de propietario</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.tipo_propietario", v)} defaultValue={form.getValues("flow_data.tipo_propietario")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Heredero">Heredero</SelectItem>
                          <SelectItem value="Inversor">Inversor</SelectItem>
                          <SelectItem value="Familia en crecimiento">Familia en crecimiento</SelectItem>
                          <SelectItem value="Divorciado / Separado">Divorciado / Separado</SelectItem>
                          <SelectItem value="Empty Nester (Hijos se fueron)">Empty Nester (Hijos se fueron)</SelectItem>
                          <SelectItem value="Relocalización (Muda por trabajo/viaje)">Relocalización (Muda por trabajo/viaje)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Motivo principal de la venta</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.motivo_venta", v)} defaultValue={form.getValues("flow_data.motivo_venta")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Necesidad de liquidez">Necesidad de liquidez</SelectItem>
                          <SelectItem value="Mudanza a algo más grande">Mudanza a algo más grande</SelectItem>
                          <SelectItem value="Mudanza a algo más chico">Mudanza a algo más chico</SelectItem>
                          <SelectItem value="Inversión en otro negocio">Inversión en otro negocio</SelectItem>
                          <SelectItem value="Miedo a la baja de precios">Miedo a la baja de precios</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">¿En qué etapa está hoy?</Label>
                    <Select onValueChange={(v) => form.setValue("flow_data.etapa_hoy", v)} defaultValue={form.getValues("flow_data.etapa_hoy")}>
                      <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Solo curioseando valores">Solo curioseando valores</SelectItem>
                        <SelectItem value="Necesita tasar para decidir">Necesita tasar para decidir</SelectItem>
                        <SelectItem value="Publicó él mismo y no vendió">Publicó él mismo y no vendió</SelectItem>
                        <SelectItem value="Está con otra inmobiliaria y no está conforme">Está con otra inmobiliaria y no está conforme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Nivel de urgencia / necesidad</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.urgencia_necesidad", v)} defaultValue={form.getValues("flow_data.urgencia_necesidad")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Baja (vende solo si llega al precio)">Baja (vende solo si llega al precio)</SelectItem>
                          <SelectItem value="Media (quiere vender en 6 meses)">Media (quiere vender en 6 meses)</SelectItem>
                          <SelectItem value="Alta (necesita vender ya)">Alta (necesita vender ya)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">¿Depende de la venta para comprar otra cosa?</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.dependencia_venta", v as any)} defaultValue={form.getValues("flow_data.dependencia_venta")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Si">Si</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="space-y-4">
                    <Label className="text-sm font-bold">Principales preocupaciones (Múltiple)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        "Malvender la propiedad", "Seguridad en las visitas", "Gastos excesivos de comisión",
                        "Papelería/Trámites lentos", "No encontrar donde vivir después", "Pagar muchos impuestos"
                      ].map(p => (
                        <Button
                          key={p}
                          type="button"
                          variant="outline"
                          className={cn(
                            "text-xs px-3 py-2 justify-start h-auto font-bold",
                            form.watch("flow_data.preocupaciones").includes(p) ? "bg-accent/10 border-accent" : "border-muted/50"
                          )}
                          onClick={() => toggleArrayItem("flow_data.preocupaciones", p)}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Objeción principal para no contratar inmobiliaria</Label>
                      <Input {...form.register("flow_data.objecion_principal")} placeholder="Ej: Son todos iguales, cobran caro..." className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">¿Cuál es su mayor freno hoy?</Label>
                      <Input {...form.register("flow_data.freno_hoy")} placeholder="Ej: La inestabilidad del dólar" className="h-12" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Miedo más frecuente</Label>
                      <Input {...form.register("flow_data.miedo_frecuente")} placeholder="Ej: Que la propiedad se queme en el mercado" className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Logro esperado</Label>
                      <Input {...form.register("flow_data.logro_esperado")} placeholder="Ej: Vender en 90 días al mejor valor" className="h-12" />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">¿Qué valora más? (Prioridad)</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.valor_prioridad", v)} defaultValue={form.getValues("flow_data.valor_prioridad")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Velocidad">Velocidad</SelectItem>
                          <SelectItem value="Precio máximo">Precio máximo</SelectItem>
                          <SelectItem value="Seguridad y discreción">Seguridad y discreción</SelectItem>
                          <SelectItem value="Cero complicaciones (Tranquilidad)">Cero complicaciones (Tranquilidad)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Tipo de inmobiliaria en la que confía</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.tipo_inmobiliaria_confia", v)} defaultValue={form.getValues("flow_data.tipo_inmobiliaria_confia")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Grandes marcas / Franquicias">Grandes marcas / Franquicias</SelectItem>
                          <SelectItem value="Inmobiliaria de barrio (tradicional)">Inmobiliaria de barrio (tradicional)</SelectItem>
                          <SelectItem value="Agentes modernos / Tech">Agentes modernos / Tech</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Label className="text-sm font-bold">¿Qué prueba de confianza necesita ver? (Múltiple)</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {["Testimonios en video", "Propiedades vendidas en la zona", "Plan de marketing detallado", "Títulos oficiales"].map(p => (
                        <Button
                          key={p}
                          type="button"
                          variant="outline"
                          className={cn(
                            "text-[10px] px-2 py-2 font-bold",
                            form.watch("flow_data.prueba_confianza").includes(p) ? "bg-accent/10 border-accent" : "border-muted/50"
                          )}
                          onClick={() => toggleArrayItem("flow_data.prueba_confianza", p)}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-accent">Ángulo de marketing recomendado</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.angulo_marketing", v)} defaultValue={form.getValues("flow_data.angulo_marketing")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Autoridad (Sé el experto)">Autoridad (Sé el experto)</SelectItem>
                          <SelectItem value="Empatía (Entiendo tu dolor)">Empatía (Entiendo tu dolor)</SelectItem>
                          <SelectItem value="Oportunidad (Ahora es el momento)">Oportunidad (Ahora es el momento)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Tono de comunicación</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.tono_comunicacion", v)} defaultValue={form.getValues("flow_data.tono_comunicacion")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Profesional y directo">Profesional y directo</SelectItem>
                          <SelectItem value="Cercano y amable">Cercano y amable</SelectItem>
                          <SelectItem value="Exclusivo y sofisticado">Exclusivo y sofisticado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Resumen del IPC en una frase</Label>
                    <Input {...form.register("flow_data.resumen_frase")} placeholder="Ej: Propietario por herencia con miedo a gastar en impuestos y urgencia por liquidez." className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Promesa central del copy</Label>
                    <Textarea {...form.register("flow_data.promesa_central")} placeholder="¿Qué le prometemos como solución principal?" className="min-h-[80px]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">CTA recomendado</Label>
                      <Input {...form.register("flow_data.cta_recomendado")} placeholder="Ej: Agendá una tasación sin compromiso" className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Nivel de conciencia del mercado</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.nivel_conciencia", v)} defaultValue={form.getValues("flow_data.nivel_conciencia")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Inconsciente (no sabe que necesita vender)">Inconsciente (no sabe que necesita vender)</SelectItem>
                          <SelectItem value="Consciente del problema (sabe que tiene que vender)">Consciente del problema (sabe que tiene que vender)</SelectItem>
                          <SelectItem value="Consciente de la solución (busca inmobiliaria)">Consciente de la solución (busca inmobiliaria)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="bg-accent/5 p-4 rounded-lg flex gap-3 border border-accent/10">
                    <Info className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <strong>Tip:</strong> Cuanto más específico seas en las objeciones y miedos, más persuasivos serán los textos generados por la IA.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* FLOW: VENDER */}
          {flowType === 'vender' && (
            <>
              {currentStep === 0 && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <PropertySelector 
                    onSelect={(p) => {
                      setSelectedProperty(p)
                      if (p) {
                        form.setValue("propiedad_tokko_id", p.id)
                        form.setValue("nombre_perfil", `Comprador para ${p.title.substring(0, 30)}...`)
                        form.setValue("zona_principal", p.zone)
                        form.setValue("tipo_inmueble", [p.property_type])
                      }
                    }}
                    onContinue={nextStep}
                  />
                  {selectedProperty && (
                    <div className="flex items-center gap-4 p-4 bg-accent/10 rounded-xl border border-accent/20">
                      <CheckCircle2 className="w-6 h-6 text-accent" />
                      <div>
                        <p className="text-sm font-bold">Propiedad seleccionada</p>
                        <p className="text-xs text-muted-foreground">{selectedProperty.title}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedProperty(null)} className="ml-auto text-xs font-bold text-red-500">
                        QUITAR
                      </Button>
                    </div>
                  )}
                  <div className="space-y-4 pt-4 border-t">
                    <Label className="text-sm font-bold">O configuralo manualmente:</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Nombre del Perfil</Label>
                        <Input {...form.register("nombre_perfil")} placeholder="Ej: Comprador para Monoambiente en Cañitas" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Zona</Label>
                        <Input {...form.register("zona_principal")} placeholder="Ej: Recoleta" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Tipo de comprador ideal</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.tipo_comprador_ideal", v)} defaultValue={form.getValues("flow_data.tipo_comprador_ideal")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Primer vivienda (joven/pareja)">Primer vivienda (joven/pareja)</SelectItem>
                          <SelectItem value="Inversor (busca renta)">Inversor (busca renta)</SelectItem>
                          <SelectItem value="Upgrade (busca algo más grande)">Upgrade (busca algo más grande)</SelectItem>
                          <SelectItem value="Usuario final (familia)">Usuario final (familia)</SelectItem>
                          <SelectItem value="Retiro / Downsize (busca algo más chico)">Retiro / Downsize (busca algo más chico)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Situación de vida actual</Label>
                      <Input {...form.register("flow_data.situacion_vida")} placeholder="Ej: Alquilando con fecha de salida" className="h-12" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Necesidad concreta</Label>
                      <Input {...form.register("flow_data.necesidad_concreta")} placeholder="Ej: Estar cerca del trabajo" className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">¿Qué problema le resuelve este inmueble?</Label>
                      <Input {...form.register("flow_data.problema_resolver")} placeholder="Ej: Dejar de pagar expensas caras" className="h-12" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Resultado querido / Sueño</Label>
                      <Input {...form.register("flow_data.resultado_querido")} placeholder="Ej: Tener su propio estudio en casa" className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">¿Qué valora más al elegir?</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.valor_prioridad", v)} defaultValue={form.getValues("flow_data.valor_prioridad")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Ubicación / Conectividad">Ubicación / Conectividad</SelectItem>
                          <SelectItem value="Estado del inmueble (A estrenar/Refaccionado)">Estado del inmueble (A estrenar/Refaccionado)</SelectItem>
                          <SelectItem value="Precio / Oportunidad">Precio / Oportunidad</SelectItem>
                          <SelectItem value="Amenities / Lifestyle">Amenities / Lifestyle</SelectItem>
                          <SelectItem value="Seguridad">Seguridad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="space-y-4">
                    <Label className="text-sm font-bold">Atractivos de la propiedad para este IPC (Múltiple)</Label>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {["Luminosidad", "Vista abierta", "Balcón/Terraza", "Bajas expensas", "Cerca del subte/bus", "Cochera propia", "Silencioso", "Oportunidad de precio"].map(a => (
                        <Button
                          key={a}
                          type="button"
                          variant="outline"
                          className={cn(
                            "text-xs px-2 py-2 font-bold",
                            form.watch("flow_data.atractivo_propiedad").includes(a) ? "bg-accent/10 border-accent" : "border-muted/50"
                          )}
                          onClick={() => toggleArrayItem("flow_data.atractivo_propiedad", a)}
                        >
                          {a}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Label className="text-sm font-bold text-red-500 font-black">Factores de duda / Frenos (Múltiple)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {["Falta de placards", "Baño a refaccionar", "Cocina pequeña", "Calle ruidosa", "Muchos años de antigüedad", "Falta de luz natural"].map(d => (
                        <Button
                          key={d}
                          type="button"
                          variant="outline"
                          className={cn(
                            "text-xs px-2 py-2 justify-start font-bold",
                            form.watch("flow_data.factores_duda").includes(d) ? "bg-red-500/10 border-red-500/50 text-red-600" : "border-muted/50"
                          )}
                          onClick={() => toggleArrayItem("flow_data.factores_duda", d)}
                        >
                          {d}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Objeción más común que te dicen</Label>
                    <Input {...form.register("flow_data.objecion_comun")} placeholder="Ej: Es un piso muy alto, no me gusta el barrio..." className="h-12" />
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-accent font-black">Ángulo de copy para vender</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.angulo_copy", v)} defaultValue={form.getValues("flow_data.angulo_copy")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Oportunidad de inversión">Oportunidad de inversión</SelectItem>
                          <SelectItem value="Lifestyle / Disfrute">Lifestyle / Disfrute</SelectItem>
                          <SelectItem value="Escasez (Última disponible)">Escasez (Última disponible)</SelectItem>
                          <SelectItem value="Transformación (Cómo será tu vida)">Transformación (Cómo será tu vida)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Tono del anuncio</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.tono", v)} defaultValue={form.getValues("flow_data.tono")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Urgente / Agresivo">Urgente / Agresivo</SelectItem>
                          <SelectItem value="Inspirador / Emocional">Inspirador / Emocional</SelectItem>
                          <SelectItem value="Informativo / Técnico">Informativo / Técnico</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Promesa creíble</Label>
                    <Input {...form.register("flow_data.promesa_creible")} placeholder="Ej: La mejor relación precio-m2 de la zona" className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-red-500">¿Qué NO mostrar o mencionar? (Filtro)</Label>
                    <Input {...form.register("flow_data.no_mostrar")} placeholder="Ej: No mencionar que es por escalera" className="h-12 border-red-500/20" />
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                   <div className="space-y-2">
                    <Label className="text-sm font-bold">Resumen del comprador en una frase</Label>
                    <Input {...form.register("flow_data.resumen_frase")} placeholder="Ej: Joven profesional buscando rentabilidad en zona premium con bajo presupuesto." className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Mensaje central a comunicar</Label>
                    <Textarea {...form.register("flow_data.mensaje_central")} placeholder="¿Cuál es el corazón del anuncio?" className="min-h-[100px]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">CTA para vender</Label>
                      <Input {...form.register("flow_data.cta")} placeholder="Ej: Agendá tu visita hoy mismo" className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Nivel de conciencia</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.nivel_conciencia", v)} defaultValue={form.getValues("flow_data.nivel_conciencia")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Busca genérico (no sabe qué zona)">Busca genérico (no sabe qué zona)</SelectItem>
                          <SelectItem value="Busca zona (conoce el barrio)">Busca zona (conoce el barrio)</SelectItem>
                          <SelectItem value="Busca producto específico (ya vio otras similares)">Busca producto específico (ya vio otras similares)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </form>
      </CardContent>

      <CardFooter className="flex justify-between border-t border-accent/10 pt-6 pb-8 bg-accent/5 backdrop-blur-md">
        <Button 
          variant="outline" 
          onClick={prevStep} 
          disabled={currentStep === 0}
          className="h-12 px-6 font-bold border-accent/20 hover:bg-accent/5"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
        </Button>
        
        {currentStep === steps.length - 1 ? (
          <Button 
            onClick={form.handleSubmit(onSubmit)} 
            disabled={isSaving} 
            className="h-12 px-8 bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20 font-black text-md tracking-tight"
          >
            {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {initialData ? "ACTUALIZAR IPC" : "GUARDAR IPC PROFESIONAL"}
          </Button>
        ) : (
          <Button 
            onClick={nextStep} 
            className="h-12 px-8 bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20 font-black text-md tracking-tight"
          >
            SIGUIENTE PASO <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
