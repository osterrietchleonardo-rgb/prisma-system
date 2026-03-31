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
import { ArrowLeft, ArrowRight, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

const ipcSchema = z.object({
  nombre_perfil: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  rango_edad: z.string(),
  genero: z.string(),
  zona_geografica: z.string(),
  rol_sector: z.string(),
  problema_principal: z.string(),
  mayor_frustracion: z.string(),
  pierde_tiempo_dinero: z.string(),
  mayor_estres: z.string(),
  mayor_miedo: z.array(z.string()).min(1, "Selecciona al menos un miedo"),
  freno_para_avanzar: z.string(),
  objeciones: z.string(),
  meta_12_meses: z.string(),
  negocio_ideal: z.string(),
  vida_transformada: z.string(),
  motiva_decision: z.array(z.string()).min(1, "Selecciona al menos una motivación"),
  valora_en_proveedor: z.string(),
  trigger_decision: z.string(),
  redes_sociales: z.array(z.string()),
  tipo_contenido: z.array(z.string()),
  frecuencia_publica: z.string(),
})

type IpcFormValues = z.infer<typeof ipcSchema>

const STEPS = [
  "Demografía",
  "Dolores",
  "Miedos",
  "Deseos",
  "Valores",
  "Digital"
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
      rango_edad: "25-34",
      genero: "Mixto",
      zona_geografica: "",
      rol_sector: "Asesor independiente",
      problema_principal: "",
      mayor_frustracion: "",
      pierde_tiempo_dinero: "",
      mayor_estres: "",
      mayor_miedo: [],
      freno_para_avanzar: "",
      objeciones: "",
      meta_12_meses: "",
      negocio_ideal: "",
      vida_transformada: "",
      motiva_decision: [],
      valora_en_proveedor: "",
      trigger_decision: "",
      redes_sociales: [],
      tipo_contenido: [],
      frecuencia_publica: "Ocasionalmente",
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

      toast.success(initialData?.id ? "Perfil actualizado correctamente" : "Perfil creado correctamente")
      if (onSave) onSave()
      else router.push('./')
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
    <Card className="w-full max-w-4xl mx-auto border-accent/20 shadow-xl bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <Save className="w-6 h-6 text-accent" />
          {initialData ? "Editar Perfil IPC" : "Crear Perfil IPC"}
        </CardTitle>
        <CardDescription>
          Diseñá el perfil de tu cliente ideal para generar estrategias de marketing precisas.
        </CardDescription>
        <MarketingIAStepper steps={STEPS} currentStep={currentStep} className="mt-8" />
      </CardHeader>
      
      <CardContent className="mt-6 min-h-[400px]">
        <form className="space-y-6">
          {currentStep === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-2 col-span-full">
                <Label>¿Cómo vas a llamar a este perfil IPC?</Label>
                <Input {...form.register("nombre_perfil")} placeholder="Ej: Director CABA 45 años" />
              </div>
              <div className="space-y-2">
                <Label>Rango de edad</Label>
                <Select onValueChange={(v) => form.setValue("rango_edad", v)} defaultValue={form.getValues("rango_edad")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25-34">25-34</SelectItem>
                    <SelectItem value="35-44">35-44</SelectItem>
                    <SelectItem value="45-54">45-54</SelectItem>
                    <SelectItem value="55+">55+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Género</Label>
                <Select onValueChange={(v) => form.setValue("genero", v)} defaultValue={form.getValues("genero")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hombre">Hombre</SelectItem>
                    <SelectItem value="Mujer">Mujer</SelectItem>
                    <SelectItem value="Mixto">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Zona Geográfica</Label>
                <Input {...form.register("zona_geografica")} placeholder="Ej: Palermo, Recoleta, GBA Norte" />
              </div>
              <div className="space-y-2">
                <Label>Rol en el sector</Label>
                <Select onValueChange={(v) => form.setValue("rol_sector", v)} defaultValue={form.getValues("rol_sector")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asesor independiente">Asesor independiente</SelectItem>
                    <SelectItem value="Director de agencia">Director de agencia</SelectItem>
                    <SelectItem value="Dueño de inmobiliaria">Dueño de inmobiliaria</SelectItem>
                    <SelectItem value="Inversor">Inversor</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-2">
                <Label>¿Cuál es el mayor problema que enfrenta hoy?</Label>
                <Textarea {...form.register("problema_principal")} placeholder="Describe su dolor principal..." className="min-h-[100px]" />
              </div>
              <div className="space-y-2">
                <Label>¿Qué es lo que más le frustra de su día a día?</Label>
                <Textarea {...form.register("mayor_frustracion")} placeholder="Describe sus frustraciones comunes..." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>¿Qué le hace perder tiempo o dinero?</Label>
                  <Textarea {...form.register("pierde_tiempo_dinero")} />
                </div>
                <div className="space-y-2">
                  <Label>¿Qué situación le genera más estrés?</Label>
                  <Textarea {...form.register("mayor_estres")} />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-4">
                <Label>¿A qué le tiene más miedo? (Múltiple)</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {["Quedarse sin clientes", "Competencia superior", "Cambios de mercado", "No poder escalar", "Perder reputación", "Falta de liquidez"].map(miedo => (
                    <Button
                      key={miedo}
                      type="button"
                      className={cn(
                        "justify-start h-auto py-2 px-3 text-xs transition-all",
                        form.watch("mayor_miedo").includes(miedo) 
                          ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm" 
                          : "bg-card border-muted hover:border-accent"
                      )}
                      onClick={() => toggleArrayItem("mayor_miedo", miedo)}
                    >
                      {miedo}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>¿Qué lo frena para dar el siguiente paso?</Label>
                <Textarea {...form.register("freno_para_avanzar")} />
              </div>
              <div className="space-y-2">
                <Label>¿Qué objeciones tendría antes de contratar un servicio?</Label>
                <Textarea {...form.register("objeciones")} />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-2">
                <Label>¿Qué quiere lograr en los próximos 12 meses?</Label>
                <Textarea {...form.register("meta_12_meses")} placeholder="Ej: Duplicar su facturación, expandir su equipo..." />
              </div>
              <div className="space-y-2">
                <Label>¿Cómo imagina su negocio ideal?</Label>
                <Textarea {...form.register("negocio_ideal")} />
              </div>
              <div className="space-y-2">
                <Label>¿Qué cambiaría en su vida si resolviera sus problemas?</Label>
                <Textarea {...form.register("vida_transformada")} />
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-4">
                <Label>¿Qué lo mueve a tomar decisiones de compra? (Múltiple)</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {["Precio bajo", "ROI demostrable", "Referidos", "Garantías", "Tecnología moderna", "Reputación", "Rapidez"].map(motivo => (
                    <Button
                      key={motivo}
                      type="button"
                      className={cn(
                        "justify-start h-auto py-2 px-3 text-xs transition-all",
                        form.watch("motiva_decision").includes(motivo)
                          ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                          : "bg-card border-muted hover:border-accent"
                      )}
                      onClick={() => toggleArrayItem("motiva_decision", motivo)}
                    >
                      {motivo}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>¿Qué valora más en un proveedor?</Label>
                <Textarea {...form.register("valora_en_proveedor")} />
              </div>
              <div className="space-y-2">
                <Label>¿Qué lo haría decir "SÍ" inmediatamente?</Label>
                <Textarea {...form.register("trigger_decision")} />
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-4">
                <Label>¿Qué redes sociales usa activamente?</Label>
                <div className="flex flex-wrap gap-2">
                  {["Instagram", "Facebook", "LinkedIn", "WhatsApp", "TikTok", "YouTube"].map(red => (
                    <Button
                      key={red}
                      type="button"
                      className={cn(
                        "text-xs px-3 transition-all",
                        form.watch("redes_sociales").includes(red)
                          ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                          : "bg-card border-muted hover:border-accent"
                      )}
                      onClick={() => toggleArrayItem("redes_sociales", red)}
                    >
                      {red}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <Label>¿Qué tipo de contenido consume?</Label>
                <div className="flex flex-wrap gap-2">
                  {["Videos cortos", "Artículos", "Podcasts", "Tutoriales", "Casos de éxito", "Lives"].map(tipo => (
                    <Button
                      key={tipo}
                      type="button"
                      className={cn(
                        "text-xs px-3 transition-all",
                        form.watch("tipo_contenido").includes(tipo)
                          ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                          : "bg-card border-muted hover:border-accent"
                      )}
                      onClick={() => toggleArrayItem("tipo_contenido", tipo)}
                    >
                      {tipo}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Frecuencia de publicación</Label>
                <Select onValueChange={(v) => form.setValue("frecuencia_publica", v)} defaultValue={form.getValues("frecuencia_publica")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nunca">Nunca</SelectItem>
                    <SelectItem value="Ocasionalmente">Ocasionalmente</SelectItem>
                    <SelectItem value="1-2 veces por semana">1-2 veces por semana</SelectItem>
                    <SelectItem value="Todos los días">Todos los días</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </form>
      </CardContent>

      <CardFooter className="flex justify-between border-t pt-6 bg-accent/5">
        <Button variant="outline" onClick={prevStep} disabled={currentStep === 0}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
        </Button>
        
        {currentStep === STEPS.length - 1 ? (
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving} className="bg-accent shadow-accent/20 shadow-lg">
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar IPC
          </Button>
        ) : (
          <Button onClick={nextStep} className="bg-accent shadow-accent/20 shadow-lg">
            Siguiente <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
