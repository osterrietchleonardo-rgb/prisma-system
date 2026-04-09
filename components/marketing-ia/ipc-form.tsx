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
import { ArrowLeft, ArrowRight, Save, Loader2, Target, Zap, Users, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

const ipcSchema = z.object({
  nombre_perfil: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  objetivo: z.enum(['captacion', 'comercializacion']),
  sub_objetivo: z.enum(['vender', 'alquilar']),
  tipo_lead: z.enum(['Comprador', 'Vendedor', 'Inversor', 'Inquilino', 'Propietario', 'Otro']),
  rango_edad: z.string(),
  genero: z.string(),
  zona_geografica: z.string(),
  presupuesto_estimado: z.string().optional(),
  situacion_actual: z.string().min(5, "Describa la situación actual"),
  motivacion_principal: z.string().min(5, "Describa la motivación"),
  problema_resuelve: z.string().min(5, "Describa el problema que resuelve"),
  nivel_urgencia: z.number().min(1).max(10),
  mayor_miedo: z.array(z.string()).min(1, "Selecciona al menos un miedo"),
  objeciones: z.string(),
  estilo_vida: z.string(),
  intereses: z.array(z.string()),
  redes_sociales: z.array(z.string()),
  tipo_contenido: z.array(z.string()),
  formato_preferido: z.enum(['video', 'texto', 'ambos']),
})

type IpcFormValues = z.infer<typeof ipcSchema>

const STEPS = [
  "Identificación",
  "Situación",
  "Psicología",
  "Estilo de Vida"
]

export function IpcForm({ initialData, onSave }: { initialData?: any, onSave?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<IpcFormValues>({
    resolver: zodResolver(ipcSchema),
    defaultValues: initialData || {
      nombre_perfil: "",
      objetivo: "comercializacion",
      sub_objetivo: "vender",
      tipo_lead: "Comprador",
      rango_edad: "35-44",
      genero: "Mixto",
      zona_geografica: "",
      presupuesto_estimado: "",
      situacion_actual: "",
      motivacion_principal: "",
      problema_resuelve: "",
      nivel_urgencia: 5,
      mayor_miedo: [],
      objeciones: "",
      estilo_vida: "",
      intereses: [],
      redes_sociales: [],
      tipo_contenido: [],
      formato_preferido: "ambos",
    }
  })

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1))
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0))

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

      toast.success(initialData?.id ? "Segmento actualizado correctamente" : "Segmento creado correctamente")
      if (onSave) {
        onSave()
      } else {
        // Redirect to the current section (asesor or director)
        const path = window.location.pathname
        if (path.includes('/director/')) {
          router.push('/director/marketing-ia')
        } else {
          router.push('/asesor/marketing-ia')
        }
      }
    } catch (error: any) {
      toast.error("Error al guardar: " + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleArrayItem = (fieldName: keyof IpcFormValues, value: string) => {
    const current = form.getValues(fieldName) as string[]
    const next = current.includes(value)
      ? current.filter(i => i !== value)
      : [...current, value]
    form.setValue(fieldName, next as any, { shouldValidate: true })
  }

  return (
    <Card className="w-full max-w-4xl mx-auto border-accent/20 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />
      <CardHeader>
        <CardTitle className="text-2xl font-black flex items-center gap-2">
          <Target className="w-8 h-8 text-accent animate-pulse" />
          {initialData ? "Editar Segmento de Leads" : "Nuevo Segmento de Leads"}
        </CardTitle>
        <CardDescription className="text-md">
          Define un nicho ultra-específico para generar copies hiper-personalizados que conviertan visitas en clientes.
        </CardDescription>
        <MarketingIAStepper steps={STEPS} currentStep={currentStep} className="mt-8" />
      </CardHeader>
      
      <CardContent className="mt-6 min-h-[450px]">
        <form className="space-y-6">
          {currentStep === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="space-y-2 col-span-full">
                <Label className="text-sm font-bold">¿Cómo vas a llamar a este segmento?</Label>
                <Input {...form.register("nombre_perfil")} placeholder="Ej: Inversores buscando pozo en Palermo" className="h-12 border-accent/10 focus:border-accent" />
                {form.formState.errors.nombre_perfil && <p className="text-red-500 text-xs font-medium">{form.formState.errors.nombre_perfil.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold text-accent">Objetivo Principal</Label>
                <Select 
                  onValueChange={(v) => {
                    form.setValue("objetivo", v as any)
                    if (v === 'captacion') {
                      form.setValue("tipo_lead", "Propietario")
                    } else {
                      form.setValue("tipo_lead", "Comprador")
                    }
                  }} 
                  defaultValue={form.getValues("objetivo")}
                >
                  <SelectTrigger className="h-12 bg-accent/10 border-accent/20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comercializacion">Vender / Alquilar mi cartera</SelectItem>
                    <SelectItem value="captacion">Captar nuevas propiedades</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold">Operación</Label>
                <Select onValueChange={(v) => form.setValue("sub_objetivo", v as any)} defaultValue={form.getValues("sub_objetivo")}>
                  <SelectTrigger className="h-12 bg-accent/5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vender">Venta</SelectItem>
                    <SelectItem value="alquilar">Alquiler</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.sub_objetivo && <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.sub_objetivo.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold">Tipo de Lead</Label>
                <Select onValueChange={(v) => form.setValue("tipo_lead", v as any)} value={form.watch("tipo_lead")}>
                  <SelectTrigger className="h-12 bg-accent/5 transition-all hover:bg-accent/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {form.watch("objetivo") === 'captacion' ? (
                      <>
                        <SelectItem value="Propietario">Propietario</SelectItem>
                        <SelectItem value="Vendedor">Vendedor</SelectItem>
                        <SelectItem value="Inversor">Inversor</SelectItem>
                        <SelectItem value="Otro">Otro</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="Comprador">Comprador</SelectItem>
                        <SelectItem value="Inquilino">Inquilino</SelectItem>
                        <SelectItem value="Inversor">Inversor</SelectItem>
                        <SelectItem value="Otro">Otro</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {form.formState.errors.tipo_lead && <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.tipo_lead.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold">Formato Ideal</Label>
                <Select onValueChange={(v) => form.setValue("formato_preferido", v as any)} defaultValue={form.getValues("formato_preferido")}>
                  <SelectTrigger className="h-12 bg-accent/5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Específico para Video (Reels/TikTok)</SelectItem>
                    <SelectItem value="texto">Específico para Texto (Post/Ads)</SelectItem>
                    <SelectItem value="ambos">Versátil (Ambos formatos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-full h-px bg-accent/10 my-2" />

              <div className="space-y-2">
                <Label className="text-sm font-bold">Zona Geográfica</Label>
                <Input {...form.register("zona_geografica")} placeholder="Ej: Palermo Soho, Recoleta, Nordelta..." className="h-12" />
                {form.formState.errors.zona_geografica && <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.zona_geografica.message}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">Rango de edad</Label>
                <Select onValueChange={(v) => form.setValue("rango_edad", v)} defaultValue={form.getValues("rango_edad")}>
                  <SelectTrigger className="h-12 bg-accent/5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25-34">25-34 años</SelectItem>
                    <SelectItem value="35-44">35-44 años</SelectItem>
                    <SelectItem value="45-54">45-54 años</SelectItem>
                    <SelectItem value="55-64">55-64 años</SelectItem>
                    <SelectItem value="65+">65+ años</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">Género predominante</Label>
                <Select onValueChange={(v) => form.setValue("genero", v)} defaultValue={form.getValues("genero")}>
                  <SelectTrigger className="h-12 bg-accent/5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hombre">Hombre</SelectItem>
                    <SelectItem value="Mujer">Mujer</SelectItem>
                    <SelectItem value="Mixto">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">Presupuesto / Ticket Estimado</Label>
                <Input {...form.register("presupuesto_estimado")} placeholder="Ej: USD 150.000 - 250.000" className="h-12" />
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-bold">Contexto / Situación Actual</Label>
                  <Textarea {...form.register("situacion_actual")} placeholder="¿En qué momento de su vida está? Ej: 'Alquilando, pero acaba de recibir una herencia' o 'Viviendo en una casa muy grande que ya no puede mantener'..." className="min-h-[120px] bg-accent/5" />
                  {form.formState.errors.situacion_actual && <p className="text-red-500 text-xs font-medium">{form.formState.errors.situacion_actual.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-bold">Motivación principal (El por qué)</Label>
                  <Textarea {...form.register("motivacion_principal")} placeholder="¿Cuál es el motor de su decision? Ej: 'Capitalizarse ante la inflación' o 'Darle independencia a sus hijos'..." className="min-h-[120px] bg-accent/5" />
                  {form.formState.errors.motivacion_principal && <p className="text-red-500 text-xs font-medium">{form.formState.errors.motivacion_principal.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">¿Qué gran problema resuelve mudarse / vender?</Label>
                <Textarea {...form.register("problema_resuelve")} placeholder="Ej: 'Dejar de tirar dinero en alquiler' o 'Reducir gastos fijos mensuales'..." className="bg-accent/5" />
                {form.formState.errors.problema_resuelve && <p className="text-red-500 text-xs font-medium">{form.formState.errors.problema_resuelve.message}</p>}
              </div>
              <div className="space-y-4 pt-4">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-bold">Nivel de Urgencia</Label>
                  <span className="text-xl font-black text-accent">{form.watch("nivel_urgencia")} / 10</span>
                </div>
                <div className="px-2">
                  <input 
                    type="range" min="1" max="10" step="1" 
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-accent"
                    value={form.watch("nivel_urgencia")}
                    onChange={(e) => form.setValue("nivel_urgencia", Number(e.target.value))}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-bold uppercase tracking-widest">
                    <span>Curiosidad</span>
                    <span>Explorando</span>
                    <span>Decidido</span>
                    <span>Urgente</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="space-y-4">
                <Label className="text-sm font-bold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  Mayores miedos del lead (Múltiple)
                </Label>
                {form.formState.errors.mayor_miedo && <p className="text-red-500 text-xs font-medium">{form.formState.errors.mayor_miedo.message}</p>}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    "Elegir mal la zona", "Ser estafado", "Liquidez atrapada", "Impuestos ocultos", 
                    "No vender nunca", "Baja de precios", "Malos inquilinos", "Inestabilidad país", 
                    "Mala construcción", "Sobreprecio"
                  ].map(miedo => (
                    <Button
                      key={miedo}
                      type="button"
                      variant="outline"
                      className={cn(
                        "justify-start h-auto py-3 px-4 text-xs font-bold transition-all border-muted/50",
                        form.watch("mayor_miedo").includes(miedo) 
                          ? "bg-accent/20 border-accent text-foreground shadow-sm ring-1 ring-accent/20" 
                          : "bg-background hover:border-accent/40"
                      )}
                      onClick={() => toggleArrayItem("mayor_miedo", miedo)}
                    >
                      {miedo}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">Objeciones Típicas / Frenos</Label>
                <Textarea {...form.register("objeciones")} placeholder="Ej: 'La comisión inmobiliaria es cara', 'Prefiero esperar a que baje el dólar', 'No confío en las agencias'..." className="bg-accent/5" />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="space-y-2">
                <Label className="text-sm font-bold">Estilo de Vida / Perfil Psicográfico</Label>
                <Textarea {...form.register("estilo_vida")} placeholder="Ej: 'Busca el status y la exclusividad', 'Valora la practicidad y el minimalismo', 'Padre de familia enfocado en seguridad'..." className="min-h-[100px] bg-accent/5" />
              </div>
              
              <div className="space-y-4">
                <Label className="text-sm font-bold">Intereses Relevantes (Múltiple)</Label>
                <div className="flex flex-wrap gap-2">
                  {["Inversiones", "Decoración", "Arquitectura", "Familia", "Viajes", "Tecnología", "Golf/Deportes", "Mascotas", "Seguridad", "Sustentabilidad"].map(interes => (
                    <Button
                      key={interes}
                      type="button"
                      variant="outline"
                      className={cn(
                        "text-xs px-4 py-2 rounded-full font-bold transition-all",
                        form.watch("intereses").includes(interes)
                          ? "bg-accent text-accent-foreground border-accent shadow-md shadow-accent/10"
                          : "border-muted/50 hover:border-accent/40"
                      )}
                      onClick={() => toggleArrayItem("intereses", interes)}
                    >
                      {interes}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <div className="space-y-4">
                  <Label className="text-sm font-bold">Canales Digitales</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Instagram", "Facebook", "LinkedIn", "WhatsApp", "YouTube"].map(red => (
                      <Button
                        key={red}
                        type="button"
                        variant="outline"
                        className={cn(
                          "text-xs justify-start px-3 h-10 font-bold",
                          form.watch("redes_sociales").includes(red)
                            ? "bg-accent/10 border-accent text-accent"
                            : "border-muted/50"
                        )}
                        onClick={() => toggleArrayItem("redes_sociales", red)}
                      >
                        {red}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <Label className="text-sm font-bold">Contenido que consume</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Reels/Videos", "Tutoriales", "Galerías/Fotos", "Casos de Éxito", "Noticias"].map(tipo => (
                      <Button
                        key={tipo}
                        type="button"
                        variant="outline"
                        className={cn(
                          "text-xs justify-start px-3 h-10 font-bold",
                          form.watch("tipo_contenido").includes(tipo)
                            ? "bg-accent/10 border-accent text-accent"
                            : "border-muted/50"
                        )}
                        onClick={() => toggleArrayItem("tipo_contenido", tipo)}
                      >
                        {tipo}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
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
        
        {currentStep === STEPS.length - 1 ? (
          <Button 
            onClick={form.handleSubmit(onSubmit)} 
            disabled={isSaving} 
            className="h-12 px-8 bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20 font-black text-md tracking-tight"
          >
            {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            GUARDAR SEGMENTO IPC
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
