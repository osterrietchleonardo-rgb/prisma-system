"use client"

import { useState, useEffect } from "react"
import { MarketingIAStepper } from "./marketing-ia-stepper"
import { PropertySelector } from "./property-selector"
import { ImageGeneratorForm } from "./image-generator-form"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, Video, FileText, ArrowRight, Loader2, Save, Wand2, CheckCircle2 } from "lucide-react"
import { CopyType, CopyAngle, ConsciousnessLevel, IpcProfile, CopyContent, TokkoProperty, CopyDraft } from "@/types/marketing-ia"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const STEPS = [
  "Configuración",
  "Generación",
  "Resultado",
  "Guardado",
  "Propiedad",
  "Imagen"
]

export function CopyGeneratorFlow() {
  const [currentStep, setCurrentStep] = useState(0)
  const [ipcs, setIpcs] = useState<IpcProfile[]>([])
  const [selectedIpcId, setSelectedIpcId] = useState<string>("")
  const [copyType, setCopyType] = useState<CopyType>('video')
  const [objective, setObjective] = useState<'captacion' | 'comercializacion'>('comercializacion')
  const [angle, setAngle] = useState<CopyAngle>('pas')
  const [consciousnessLevel, setConsciousnessLevel] = useState<ConsciousnessLevel>(0)
  const [extraContext, setExtraContext] = useState("")

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedDraft, setGeneratedDraft] = useState<CopyDraft | null>(null)
  const [editableContent, setEditableContent] = useState<CopyContent | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<TokkoProperty | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const fetchIpcs = async () => {
      const { data } = await supabase.from('ipc_profiles').select('*').order('created_at', { ascending: false })
      setIpcs(data || [])
      if (data && data.length > 0) setSelectedIpcId(data[0].id)
    }
    fetchIpcs()
  }, [])

  const consciousnessDescriptions = {
    0: "Inconsciente: No sabe que tiene el problema. El copy debe crear el problema en su mente.",
    1: "Consciente del problema: Sabe que hay algo que no funciona. El copy empieza por el dolor.",
    2: "Consciente de la solución: Sabe que existen soluciones. Posiciona nuestra solución.",
    3: "Consciente del producto: Nos conoce pero no está convencido. Trabaja objeciones.",
    4: "Muy consciente: Está casi listo. Copy directo, oferta clara, CTA fuerte."
  }

  const angles: Array<{id: CopyAngle, label: string}> = [
    { id: 'pas', label: 'PAS (Dolor)' },
    { id: 'autoridad', label: 'Autoridad' },
    { id: 'transformacion', label: 'Transformación' },
    { id: 'social_proof', label: 'Prueba Social' },
    { id: 'curiosidad', label: 'Curiosidad' },
    { id: 'urgencia', label: 'Urgencia' },
    { id: 'aspiracional', label: 'Aspiracional' },
    { id: 'datos', label: 'Datos' }
  ]

  const handleGenerateCopy = async () => {
    if (!selectedIpcId) return toast.error("Seleccione un IPC")
    setIsGenerating(true)
    setCurrentStep(1)
    
    try {
      const res = await fetch('/api/marketing-ia/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipc_id: selectedIpcId,
          copy_type: copyType,
          angle,
          consciousness_level: consciousnessLevel,
          extra_context: extraContext
        })
      })

      if (!res.ok) throw new Error("Error en la generación")
      const content = await res.json()
      setEditableContent(content)
      setCurrentStep(2)
      
      // Save draft automatically
      const { data: { user } } = await supabase.auth.getUser()
      const { data: draft, error } = await supabase
        .from('copy_drafts')
        .insert({
          user_id: user?.id,
          ipc_id: selectedIpcId,
          copy_type: copyType,
          angle,
          consciousness_level: consciousnessLevel,
          extra_context: extraContext,
          content
        })
        .select()
        .single()
      
      if (error) throw error
      setGeneratedDraft(draft)
      toast.success("Copia generada con éxito")
    } catch (error) {
      toast.error("Error al generar copy")
      setCurrentStep(0)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUpdateDraft = async () => {
    if (!generatedDraft || !editableContent) return
    try {
      const { error } = await supabase
        .from('copy_drafts')
        .update({ content: editableContent, tokko_property: selectedProperty })
        .eq('id', generatedDraft.id)
      
      if (error) throw error
      toast.success("Borrador actualizado")
      setCurrentStep(3)
      setTimeout(() => setCurrentStep(4), 1000)
    } catch (error) {
      toast.error("Error al guardar cambios")
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      <MarketingIAStepper steps={STEPS} currentStep={currentStep} />

      {currentStep === 0 && (
        <Card className="border-accent/10 shadow-xl animate-in fade-in slide-in-from-bottom-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-accent" />
              Paso 1: Configuración del Copy
            </CardTitle>
            <CardDescription>Defina el ángulo, tono y público para su anuncio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-accent">¿Cuál es tu objetivo hoy?</Label>
                  <RadioGroup 
                    value={objective} 
                    onValueChange={(v: any) => {
                      setObjective(v)
                      setSelectedIpcId("")
                    }} 
                    className="flex gap-4"
                  >
                    <div className={cn(
                      "flex-1 flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer",
                      objective === 'comercializacion' ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500" : "border-muted"
                    )} onClick={() => { setObjective('comercializacion'); setSelectedIpcId(""); }}>
                      <div className="flex-1">
                        <p className="text-sm font-bold">Vender / Alquilar</p>
                        <p className="text-[10px] text-muted-foreground text-balance">Mover mi cartera de propiedades</p>
                      </div>
                      <RadioGroupItem value="comercializacion" id="comercializacion" className="sr-only" />
                    </div>
                    <div className={cn(
                      "flex-1 flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer",
                      objective === 'captacion' ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500" : "border-muted"
                    )} onClick={() => { setObjective('captacion'); setSelectedIpcId(""); }}>
                      <div className="flex-1">
                        <p className="text-sm font-bold">Captar</p>
                        <p className="text-[10px] text-muted-foreground text-balance">Conseguir nuevos dueños directos</p>
                      </div>
                      <RadioGroupItem value="captacion" id="captacion" className="sr-only" />
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Selecciona el IPC ideal</Label>
                  <Select value={selectedIpcId} onValueChange={setSelectedIpcId}>
                    <SelectTrigger className="bg-accent/5"><SelectValue placeholder="Seleccione un IPC" /></SelectTrigger>
                    <SelectContent>
                      {ipcs
                        .filter(ipc => ipc.objetivo === objective || !ipc.objetivo)
                        .map(ipc => (
                          <SelectItem key={ipc.id} value={ipc.id}>{ipc.nombre_perfil}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {ipcs.filter(ipc => ipc.objetivo === objective).length === 0 && (
                    <p className="text-[10px] text-amber-600 font-bold bg-amber-50 p-2 rounded border border-amber-100 italic">
                      No tienes IPCs específicos para {objective === 'captacion' ? 'Captación' : 'Venta/Alquiler'}. Se muestran los genéricos.
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Tipo de copy</Label>
                  <RadioGroup value={copyType} onValueChange={(v: string) => setCopyType(v as CopyType)} className="flex gap-4">
                    <div className={cn(
                      "flex-1 flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer",
                      copyType === 'video' ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-muted"
                    )} onClick={() => setCopyType('video')}>
                      <Video className={cn("w-5 h-5", copyType === 'video' ? "text-accent" : "text-muted-foreground")} />
                      <div className="flex-1">
                        <p className="text-sm font-bold">Video / Reel</p>
                        <p className="text-[10px] text-muted-foreground">Guión estructurado</p>
                      </div>
                      <RadioGroupItem value="video" id="video" className="sr-only" />
                    </div>
                    <div className={cn(
                      "flex-1 flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer",
                      copyType === 'post' ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-muted"
                    )} onClick={() => setCopyType('post')}>
                      <FileText className={cn("w-5 h-5", copyType === 'post' ? "text-accent" : "text-muted-foreground")} />
                      <div className="flex-1">
                        <p className="text-sm font-bold">Post / Texto</p>
                        <p className="text-[10px] text-muted-foreground">Estructura directa</p>
                      </div>
                      <RadioGroupItem value="post" id="post" className="sr-only" />
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Nivel de consciencia del público</Label>
                  <div className="p-3 bg-accent/5 rounded-lg border border-accent/10">
                    <input 
                      type="range" min="0" max="4" step="1" 
                      className="w-full accent-accent bg-transparent" 
                      value={consciousnessLevel} 
                      onChange={(e) => setConsciousnessLevel(Number(e.target.value) as ConsciousnessLevel)}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-bold mt-1">
                      <span>NIVEL 0</span>
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>NIVEL 4</span>
                    </div>
                  </div>
                  <p className="text-xs bg-muted/50 p-2 rounded italic text-muted-foreground">
                    {consciousnessDescriptions[consciousnessLevel]}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-bold">Ángulo de copy</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {angles.map(a => (
                      <Button
                        key={a.id}
                        type="button"
                        variant="outline"
                        onClick={() => setAngle(a.id)}
                        className={cn(
                          "h-10 text-xs justify-start px-3 font-bold transition-all",
                          angle === a.id && "bg-accent text-accent-foreground hover:bg-accent/90 border-accent"
                        )}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Contexto adicional (opcional)</Label>
                  <Textarea 
                    placeholder="Mencione ofertas específicas, beneficios únicos del inmueble o eventos próximos..." 
                    className="min-h-[100px] resize-none"
                    value={extraContext}
                    onChange={(e) => setExtraContext(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-accent/5 pt-6">
            <Button className="w-full bg-accent shadow-lg shadow-accent/20 h-12 text-md font-bold" onClick={handleGenerateCopy}>
              <Wand2 className="mr-2 h-5 w-5" /> ✨ Generar Copy Estratégico
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 1 && (
        <div className="flex flex-col items-center justify-center p-20 space-y-6 animate-pulse">
          <Loader2 className="w-16 h-16 text-accent animate-spin" />
          <div className="text-center">
            <h2 className="text-2xl font-bold">Generando tu copy con IA...</h2>
            <p className="text-muted-foreground mt-2">Analizando el perfil IPC y aplicando la estructura {angle.toUpperCase()}.</p>
          </div>
        </div>
      )}

      {currentStep === 2 && editableContent && (
        <Card className="border-accent/20 shadow-2xl animate-in zoom-in-95">
          <CardHeader className="bg-accent/5">
            <CardTitle className="flex justify-between items-center">
              <span>Resultado Generado</span>
              <span className="text-xs font-bold bg-accent/20 text-accent px-3 py-1 rounded-full uppercase tracking-tighter">
                {copyType} | {angle}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {copyType === 'video' ? (
              <div className="space-y-4">
                {['hook', 'problema', 'agitacion', 'solucion', 'cta'].map(field => (
                  <div key={field} className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-accent">{field}</Label>
                    <Textarea 
                      value={(editableContent as any)[field]} 
                      onChange={(e) => setEditableContent({...editableContent, [field]: e.target.value})}
                      className="resize-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-accent">Hook</Label>
                  <Textarea 
                    value={editableContent.hook} 
                    onChange={(e) => setEditableContent({...editableContent, hook: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-accent">Desarrollo</Label>
                  <Textarea 
                    value={editableContent.desarrollo} 
                    onChange={(e) => setEditableContent({...editableContent, desarrollo: e.target.value})}
                    className="min-h-[200px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-accent">CTA</Label>
                  <Textarea 
                    value={editableContent.cta} 
                    onChange={(e) => setEditableContent({...editableContent, cta: e.target.value})}
                  />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6 gap-4">
            <Button variant="outline" onClick={() => setCurrentStep(0)}>Generar otra versión</Button>
            <Button className="bg-accent flex-1" onClick={handleUpdateDraft}>
              Continuar al Paso de Imagen <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 3 && (
        <div className="flex flex-col items-center justify-center p-20 space-y-4 animate-in fade-in">
          <CheckCircle2 className="w-16 h-16 text-green-500" />
          <h2 className="text-2xl font-bold">¡Borrador guardado con éxito!</h2>
          <p className="text-muted-foreground italic">Avanzando a la selección de propiedad...</p>
        </div>
      )}

      {currentStep === 4 && (
        <PropertySelector 
          onSelect={setSelectedProperty} 
          onContinue={() => {
            // Update draft with property before moving to step 6
            handleUpdateDraft().then(() => setCurrentStep(5))
          }} 
        />
      )}

      {currentStep === 5 && generatedDraft && editableContent && (
        <ImageGeneratorForm 
          draftId={generatedDraft.id} 
          copyContent={editableContent} 
          tokkoProperty={selectedProperty} 
        />
      )}
    </div>
  )
}
