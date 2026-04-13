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
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  objetivo: z.string().min(1, "El objetivo es requerido"),
  tipo_inmueble: z.array(z.string()).min(1, "Seleccione al menos un tipo"),
  zona_principal: z.string().min(1, "La zona es requerida"),
  rango_valor_precio: z.string().min(1, "El rango es requerido"),
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
    angulo_marketing: z.string(),
    promesa_central: z.string(),
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
    defaultValues: (initialData as any) || {
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
        angulo_marketing: "Necesidad/Problema",
        tono_comunicacion: "Profesional y directo",
        canal_formato: [],
        no_prometer: "",
        resumen_frase: "",
        promesa_central: "",
        cta_recomendado: "",
        nivel_conciencia: "Consciente del Problema"
      }
    }
  })

  const steps = flowType === 'vender' ? VENDER_STEPS : CAPTAR_STEPS
  const watchTipoIpc = form.watch('tipo_ipc')

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, steps.length))
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0))

  // Debug errors
  const errors = form.formState.errors
  if (Object.keys(errors).length > 0) {
    console.warn("IPC Form Validation Errors:", errors)
  }

  const handleSelectFlow = (type: 'captar' | 'vender') => {
    setFlowType(type)
    form.reset({
      tipo_ipc: type,
      nombre_perfil: "",
      objetivo: type === 'captar' ? "Captar propietarios" : "Vender Cartera",
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
        angulo_marketing: "Necesidad/Problema",
        tono_comunicacion: "Profesional",
        canal_formato: [],
        no_prometer: "",
        resumen_frase: "",
        promesa_central: "",
        cta_recomendado: "",
        nivel_conciencia: "Consciente del Problema"
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
        angulo_marketing: "Emoción/Deseo",
        promesa_central: "",
        tono: "Inspirador",
        formato_anuncio: [],
        no_mostrar: "",
        resumen_frase: "",
        mensaje_central: "",
        cta: "",
        nivel_conciencia: "Consciente de la Solución"
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
        nombre_perfil: data.nombre_perfil,
        tipo_ipc: data.tipo_ipc,
        objetivo: (data as any).objetivo || (data.tipo_ipc === 'vender' ? 'Vender Cartera' : 'Captar Propiedades'),
        tipo_inmueble: data.tipo_inmueble,
        zona_principal: data.zona_principal || "",
        rango_valor_precio: data.rango_valor_precio || "",
        propiedad_tokko_id: (data as any).propiedad_tokko_id || null,
        flow_data: data.flow_data,
        user_id: user.id,
        updated_at: new Date().toISOString()
      }

      console.log("Saving IPC profile:", payload)

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

      if (error) {
        console.error("Supabase Error details:", error)
        throw error
      }

      toast.success(initialData?.id ? "Segmento actualizado" : "Segmento creado")
      
      // Intentar forzar la revalidación
      if (onSave) {
        onSave()
      } else {
        router.refresh()
        router.push(window.location.pathname.includes('/director/') ? '/director/marketing-ia' : '/asesor/marketing-ia')
      }
    } catch (error: any) {
      console.error("IPC Save Error:", error)
      toast.error("Error al guardar: " + (error.message || "Error desconocido"))
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
        <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
          {/* FLOW: CAPTAR (PROPIETARIOS) */}
          {flowType === 'captar' && (
            <>
              {currentStep === 0 && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Nombre del Perfil de Propietario</Label>
                    <Input {...form.register("nombre_perfil")} placeholder="Ej: Propietario con herencia en recoleta" className="h-12 border-accent/20 focus:border-accent" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Objetivo de Captación</Label>
                      <Select onValueChange={(v) => form.setValue("objetivo", v)} defaultValue={form.getValues("objetivo")}>
                        <SelectTrigger className="h-12 border-accent/20 focus:border-accent"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="captar">Atraer nuevos propietarios</SelectItem>
                          <SelectItem value="reactivar">Reactivar prospectos antiguos</SelectItem>
                          <SelectItem value="referidos">Incentivar referidos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Zona Principal</Label>
                      <Input {...form.register("zona_principal")} placeholder="Ej: Palermo, Recoleta..." className="h-12" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Tipo de Inmueble que buscamos</Label>
                      <div className="flex flex-wrap gap-2">
                        {["Casa", "Departamento", "PH", "Terreno", "Local", "Oficina"].map(t => (
                          <Button
                            key={t}
                            type="button"
                            variant={form.watch("tipo_inmueble")?.includes(t) ? "default" : "outline"}
                            onClick={() => toggleArrayItem("tipo_inmueble", t)}
                            className="h-9 px-3 text-xs font-bold"
                          >
                            {t}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Rango de Valor / Precio</Label>
                      <Input {...form.register("rango_valor_precio")} placeholder="Ej: USD 100k - 250k" className="h-12" />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Tipo de Propietario</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.tipo_propietario", v)} defaultValue={form.getValues("flow_data.tipo_propietario")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Herencia / Familia">Herencia / Familia</SelectItem>
                          <SelectItem value="Inversor (liquidez)">Inversor (liquidez)</SelectItem>
                          <SelectItem value="Vende para comprar algo mejor">Vende para comprar algo mejor</SelectItem>
                          <SelectItem value="Urgencia (Divorcio/Deuda)">Urgencia (Divorcio/Deuda)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Motivo real de la venta</Label>
                      <Input {...form.register("flow_data.motivo_venta")} placeholder="Ej: Necesidad de repartir dinero entre hermanos" className="h-12" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Etapa donde está hoy</Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.etapa_hoy", v)} defaultValue={form.getValues("flow_data.etapa_hoy")}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Solo pensando">Solo pensando</SelectItem>
                          <SelectItem value="Buscando tasación">Buscando tasación</SelectItem>
                          <SelectItem value="Ya lo tiene publicado (sin éxito)">Ya lo tiene publicado (sin éxito)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">¿Depende de la venta para comprar?</Label>
                      <div className="flex gap-4 h-12 items-center">
                        {["Si", "No"].map(v => (
                          <Button
                            key={v}
                            type="button"
                            variant={form.watch("flow_data.dependencia_venta") === v ? "default" : "outline"}
                            onClick={() => form.setValue("flow_data.dependencia_venta", v as any)}
                            className="flex-1 font-bold"
                          >
                            {v}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="space-y-4">
                    <Label className="text-sm font-bold text-red-500">Preocupaciones principales (Múltiple)</Label>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {["Que se queme la propiedad", "Cobrar menos de lo esperado", "Inseguridad en visitas", "Trámites papeleros", "Honorarios caros", "Demora en la venta"].map(p => (
                        <Button
                          key={p}
                          type="button"
                          variant="outline"
                          className={cn(
                            "text-[10px] px-2 py-2 font-bold",
                            form.watch("flow_data.preocupaciones").includes(p) ? "bg-red-500/10 border-red-500/50 text-red-600" : "border-muted/50"
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
                      <Label className="text-sm font-bold">Objeción principal contra inmobiliarias</Label>
                      <Input {...form.register("flow_data.objecion_principal")} placeholder="Ej: Son todos iguales, cobran caro..." className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">¿Cuál es su mayor freno hoy?</Label>
                      <Input {...form.register("flow_data.freno_hoy")} placeholder="Ej: La inestabilidad del dólar" className="h-12" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-red-500">Miedo más frecuente</Label>
                      <Input {...form.register("flow_data.miedo_frecuente")} placeholder="Ej: Que la propiedad se queme en el mercado" className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-green-600">Logro esperado</Label>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold flex items-center justify-between">
                        Ángulo de Marketing (Captar)
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px] p-4 bg-popover border-border">
                              <div className="text-xs space-y-2 text-foreground">
                                <p><strong>Necesidad/Problema:</strong> Enfocado en cómo el producto resuelve una necesidad específica.</p>
                                <p><strong>Emoción/Deseo:</strong> Apela a cómo se sentirá el cliente (transformación personal).</p>
                                <p><strong>Exclusividad/Estatus:</strong> Resalta la singularidad del servicio.</p>
                                <p><strong>Dolor/Miedo:</strong> Resalta los problemas si el cliente no actúa hoy.</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.angulo_marketing", v)} defaultValue={form.getValues("flow_data.angulo_marketing")}>
                        <SelectTrigger className="h-12 border-accent/20 focus:border-accent font-bold"><SelectValue placeholder="Seleccione el enfoque..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Necesidad/Problema">
                            <div className="flex flex-col">
                              <span className="font-bold">1. Ángulo de Necesidad/Problema</span>
                              <span className="text-[10px] text-muted-foreground">Enfocado en cómo el producto resuelve una necesidad específica.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Emoción/Deseo">
                            <div className="flex flex-col">
                              <span className="font-bold">2. Ángulo de Emoción/Deseo</span>
                              <span className="text-[10px] text-muted-foreground">Apela a la transformación personal y cómo se sentirá el cliente.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Exclusividad/Estatus">
                            <div className="flex flex-col">
                              <span className="font-bold">3. Ángulo de Exclusividad/Estatus</span>
                              <span className="text-[10px] text-muted-foreground">Hace sentir al cliente parte de un grupo especial y único.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Comparación/Competencia">
                            <div className="flex flex-col">
                              <span className="font-bold">4. Ángulo de Comparación/Competencia</span>
                              <span className="text-[10px] text-muted-foreground">Muestra por qué eres la mejor opción frente a los demás.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Autoridad/Prueba Social">
                            <div className="flex flex-col">
                              <span className="font-bold">5. Ángulo de Autoridad/Prueba Social</span>
                              <span className="text-[10px] text-muted-foreground">Basado en testimonios, expertos y casos de éxito reales.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Dolor/Miedo">
                            <div className="flex flex-col">
                              <span className="font-bold">6. Ángulo de Dolor/Miedo</span>
                              <span className="text-[10px] text-muted-foreground">Resalta los problemas y riesgos si el cliente no toma acción hoy.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Inmediatez/Escasez">
                            <div className="flex flex-col">
                              <span className="font-bold">7. Ángulo de Inmediatez/Escasez</span>
                              <span className="text-[10px] text-muted-foreground">Crea urgencia por tiempo limitado o disponibilidad exclusiva.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Beneficio Lógico/Pragmático">
                            <div className="flex flex-col">
                              <span className="font-bold">8. Ángulo de Beneficio Lógico</span>
                              <span className="text-[10px] text-muted-foreground">Enfocado en datos duros, rentabilidad y ahorro concreto.</span>
                            </div>
                          </SelectItem>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold flex items-center justify-between">
                        Nivel de Conciencia (Eugene Schwartz)
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px] p-4 bg-popover border-border">
                              <div className="text-xs space-y-2 text-foreground">
                                <p><strong>Inconsciente:</strong> No sabe que la venta es posible o necesaria.</p>
                                <p><strong>Problema Aware:</strong> Sabe que necesita vender pero no sabe cómo.</p>
                                <p><strong>Solución Aware:</strong> Conoce qué tipo de ayuda necesita (inmobiliaria).</p>
                                <p><strong>Producto Aware:</strong> Te conoce y te evalúa contra otros.</p>
                                <p><strong>Most Aware:</strong> Listo para contratarte ya.</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.nivel_conciencia", v)} defaultValue={form.getValues("flow_data.nivel_conciencia")}>
                        <SelectTrigger className="h-12 border-accent/20 focus:border-accent font-bold"><SelectValue placeholder="Seleccione nivel..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Inconsciente">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">1. Inconsciente</span>
                              <span className="text-[10px] text-muted-foreground">No sabe que tiene un problema ni que la venta es posible.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Consciente del Problema">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">2. Consciente del Problema</span>
                              <span className="text-[10px] text-muted-foreground">Siente la necesidad de vender pero no sabe por dónde empezar.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Consciente de la Solución">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">3. Consciente de la Solución</span>
                              <span className="text-[10px] text-muted-foreground">Busca inmobiliarias o ayuda para vender su propiedad.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Consciente del Producto">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">4. Consciente del Producto</span>
                              <span className="text-[10px] text-muted-foreground">Conoce tu inmobiliaria y te está comparando con otros.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Muy Consciente">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">5. Muy Consciente</span>
                              <span className="text-[10px] text-muted-foreground">Está listo para contratarte y solo necesita el empujón final.</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Resumen del IPC en una frase</Label>
                      <Input {...form.register("flow_data.resumen_frase")} placeholder="Ej: Propietario por herencia con miedo a gastar en impuestos." className="h-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Promesa central del copy</Label>
                    <Textarea {...form.register("flow_data.promesa_central")} placeholder="¿Qué le prometemos como solución principal?" className="min-h-[80px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">CTA recomendado</Label>
                    <Input {...form.register("flow_data.cta_recomendado")} placeholder="Ej: Agendá una tasación sin compromiso" className="h-12" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* FLOW: VENDER (COMPRADORES) */}
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
                        form.setValue("rango_valor_precio", `${p.currency} ${p.price?.toLocaleString() || 'N/A'}`)
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
                    <Label className="text-sm font-bold text-accent italic">O configuralo manualmente:</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2 lg:col-span-2">
                        <Label className="text-xs">Nombre del Perfil</Label>
                        <Input {...form.register("nombre_perfil")} placeholder="Ej: Comprador para Monoambiente en Cañitas" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Zona</Label>
                        <Input {...form.register("zona_principal")} placeholder="Ej: Recoleta" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Valor Estimado</Label>
                        <Input {...form.register("rango_valor_precio")} placeholder="Ej: USD 150k" />
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
                      <Label className="text-sm font-bold flex items-center justify-between">
                        Ángulo de Copy (Vender)
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px] p-4 bg-popover border-border">
                              <div className="text-xs space-y-2 text-foreground">
                                <p><strong>Necesidad:</strong> Enfoque en resolver el problema habitacional.</p>
                                <p><strong>Emoción:</strong> Cómo se sentirá el cliente al vivir allí.</p>
                                <p><strong>Estatus:</strong> Resalta la exclusividad del inmueble.</p>
                                <p><strong>Dolor:</strong> Riesgos de perder la oportunidad ahora.</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.angulo_marketing", v)} defaultValue={form.getValues("flow_data.angulo_marketing")}>
                        <SelectTrigger className="h-12 border-accent/20 focus:border-accent font-bold"><SelectValue placeholder="Seleccione ángulo..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Necesidad/Problema">
                            <div className="flex flex-col">
                              <span className="font-bold">1. Ángulo de Necesidad/Problema</span>
                              <span className="text-[10px] text-muted-foreground">Enfocado en resolver el problema habitacional directo.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Emoción/Deseo">
                            <div className="flex flex-col">
                              <span className="font-bold">2. Ángulo de Emoción/Deseo</span>
                              <span className="text-[10px] text-muted-foreground">Cómo se sentirá el cliente viviendo en este nuevo hogar.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Exclusividad/Estatus">
                            <div className="flex flex-col">
                              <span className="font-bold">3. Ángulo de Exclusividad/Estatus</span>
                              <span className="text-[10px] text-muted-foreground">Resalta la singularidad y prestigio de la propiedad.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Comparación/Competencia">
                            <div className="flex flex-col">
                              <span className="font-bold">4. Ángulo de Comparación/Competencia</span>
                              <span className="text-[10px] text-muted-foreground">Muestra por qué esta propiedad es la mejor inversión.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Autoridad/Prueba Social">
                            <div className="flex flex-col">
                              <span className="font-bold">5. Ángulo de Autoridad/Prueba Social</span>
                              <span className="text-[10px] text-muted-foreground">Propiedad validada por el mercado o expertos.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Dolor/Miedo">
                            <div className="flex flex-col">
                              <span className="font-bold">6. Ángulo de Dolor/Miedo</span>
                              <span className="text-[10px] text-muted-foreground">Pérdida de oportunidad (FOMO) o riesgos de no comprar hoy.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Inmediatez/Escasez">
                            <div className="flex flex-col">
                              <span className="font-bold">7. Ángulo de Inmediatez/Escasez</span>
                              <span className="text-[10px] text-muted-foreground">Última unidad disponible o precio por tiempo limitado.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Rentabilidad/Lógica">
                            <div className="flex flex-col">
                              <span className="font-bold">8. Ángulo de Rentabilidad/Lógica</span>
                              <span className="text-[10px] text-muted-foreground">Datos sobre m², expensas bajas y alta plusvalía.</span>
                            </div>
                          </SelectItem>
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
                    <Label className="text-sm font-bold">Promesa central</Label>
                    <Input {...form.register("flow_data.promesa_central")} placeholder="Ej: Mudate a las mejores expensas de la zona" className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-red-500">¿Qué NO mostrar o mencionar? (Filtro)</Label>
                    <Input {...form.register("flow_data.no_mostrar")} placeholder="Ej: No mencionar que es por escalera" className="h-12 border-red-500/20" />
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold flex items-center justify-between">
                        Nivel de Conciencia (Eugene Schwartz)
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px] p-4 bg-popover border-border">
                              <div className="text-xs space-y-2 text-foreground">
                                <p><strong>Inconsciente:</strong> No busca mudarse pronto.</p>
                                <p><strong>Problema Aware:</strong> Necesita más espacio/zona, pero no mira opciones.</p>
                                <p><strong>Solución Aware:</strong> Sabe que quiere comprar, mira portales.</p>
                                <p><strong>Producto Aware:</strong> Le gusta esta propiedad, busca razones para reservar.</p>
                                <p><strong>Most Aware:</strong> Listo para visitar o hacer reserva.</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Select onValueChange={(v) => form.setValue("flow_data.nivel_conciencia", v)} defaultValue={form.getValues("flow_data.nivel_conciencia")}>
                        <SelectTrigger className="h-12 border-accent/20 focus:border-accent font-bold"><SelectValue placeholder="Seleccione nivel..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Inconsciente">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">1. Inconsciente</span>
                              <span className="text-[10px] text-muted-foreground">No busca mudarse ni es consciente de que este inmueble existe.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Consciente del Problema">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">2. Consciente del Problema</span>
                              <span className="text-[10px] text-muted-foreground">Sabe que su hogar actual le queda chico/incómodo.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Consciente de la Solución">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">3. Consciente de la Solución</span>
                              <span className="text-[10px] text-muted-foreground">Está activamente buscando propiedades en portales.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Consciente del Producto">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">4. Consciente del Producto</span>
                              <span className="text-[10px] text-muted-foreground">Conoce esta propiedad y está evaluando el precio y zona.</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Muy Consciente">
                            <div className="flex flex-col py-1">
                              <span className="font-bold">5. Muy Consciente</span>
                              <span className="text-[10px] text-muted-foreground">Listo para visitar o reservar este inmueble específico.</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold">Resumen del comprador en una frase</Label>
                      <Input {...form.register("flow_data.resumen_frase")} placeholder="Ej: Joven profesional buscando rentabilidad en zona premium." className="h-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Mensaje central a comunicar</Label>
                    <Textarea {...form.register("flow_data.mensaje_central")} placeholder="¿Cuál es el corazón del anuncio?" className="min-h-[100px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">CTA para vender</Label>
                    <Input {...form.register("flow_data.cta")} placeholder="Ej: Agendá tu visita hoy mismo" className="h-12" />
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
