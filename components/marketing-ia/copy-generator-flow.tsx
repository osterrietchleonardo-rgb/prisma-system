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
  "Selección de IPC",
  "Resultado y Edición",
  "Imagen con IA"
]

export function CopyGeneratorFlow() {
  const [currentStep, setCurrentStep] = useState(0)
  const [ipcs, setIpcs] = useState<IpcProfile[]>([])
  const [selectedIpcId, setSelectedIpcId] = useState<string>("")
  const [selectedIpc, setSelectedIpc] = useState<IpcProfile | null>(null)
  const [copyType, setCopyType] = useState<CopyType>('video')
  const [extraContext, setExtraContext] = useState("")

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedDraft, setGeneratedDraft] = useState<CopyDraft | null>(null)
  const [editableContent, setEditableContent] = useState<CopyContent | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<TokkoProperty | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const fetchIpcs = async () => {
      const { data } = await supabase.from('ipc_profiles').select('*').order('updated_at', { ascending: false })
      setIpcs(data || [])
    }
    fetchIpcs()
  }, [])

  useEffect(() => {
    if (selectedIpcId) {
      const ipc = ipcs.find(i => i.id === selectedIpcId)
      setSelectedIpc(ipc || null)
    }
  }, [selectedIpcId, ipcs])


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

  const handleUpdateDraft = async (goToImage = false) => {
    if (!generatedDraft || !editableContent) return
    try {
      const { error } = await supabase
        .from('copy_drafts')
        .update({ content: editableContent })
        .eq('id', generatedDraft.id)
      
      if (error) throw error
      
      if (goToImage) {
        setCurrentStep(2)
      } else {
        toast.success("Borrador actualizado")
      }
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
              Paso 1: Configuración Sugerida
            </CardTitle>
            <CardDescription>Seleccione el perfil IPC para el cual desea generar contenido.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-bold">Selecciona el Perfil IPC Real Estate</Label>
                  <Select value={selectedIpcId} onValueChange={setSelectedIpcId}>
                    <SelectTrigger className="bg-accent/5 h-12">
                      <SelectValue placeholder="Busca un perfil (Captar o Vender)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ipcs.map(ipc => (
                        <SelectItem key={ipc.id} value={ipc.id}>
                          <span className="flex items-center gap-2">
                            {ipc.tipo_ipc === 'captar' ? '🏠' : '🏷️'} 
                            {ipc.nombre_perfil}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedIpc && (
                  <div className="p-4 rounded-xl border-2 border-accent/20 bg-accent/5 space-y-3 animate-in fade-in zoom-in-95">
                    <p className="text-xs font-bold text-accent uppercase tracking-widest">Resumen del Perfil</p>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground uppercase">Objetivo</p>
                        <p className="font-bold">{selectedIpc.tipo_ipc === 'captar' ? 'Captación de Dueño' : 'Venta de Cartera'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground uppercase">Ángulo Estratégico</p>
                        <p className="font-bold">{(selectedIpc.flow_data as any)?.angulo_marketing || (selectedIpc.flow_data as any)?.angulo_copy || 'PAS (Dolor)'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground uppercase">Promesa Central</p>
                        <p className="font-bold">{(selectedIpc.flow_data as any)?.promesa_central || (selectedIpc.flow_data as any)?.promesa_creible || 'No definida'}</p>
                      </div>
                    </div>
                  </div>
                )}

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
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-bold">Contexto adicional (opcional)</Label>
                  <Textarea 
                    placeholder="Mencione ofertas específicas, beneficios únicos del inmueble que quiera resaltar hoy o eventos próximos..." 
                    className="min-h-[220px] resize-none border-dashed bg-accent/5"
                    value={extraContext}
                    onChange={(e) => setExtraContext(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-accent/5 pt-6 pb-6">
            <Button 
              className="w-full bg-accent shadow-lg shadow-accent/20 h-14 text-lg font-bold" 
              onClick={handleGenerateCopy}
              disabled={!selectedIpcId || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Escribiendo Copy Persuasivo...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-6 h-6" /> ✨ Generar Copy Estratégico
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 1 && (
        <div className="flex flex-col items-center justify-center p-20 space-y-6 animate-pulse">
          <Loader2 className="w-16 h-16 text-accent animate-spin" />
          <div className="text-center">
            <h2 className="text-2xl font-bold">Generando tu copy con IA...</h2>
            <p className="text-muted-foreground mt-2">Analizando el perfil IPC y aplicando la arquitectura persuasiva.</p>
          </div>
        </div>
      )}

      {currentStep === 2 && editableContent && (
        <Card className="border-accent/20 shadow-2xl animate-in zoom-in-95">
          <CardHeader className="bg-accent/5">
            <CardTitle className="flex justify-between items-center">
              <span>Resultado Generado</span>
              <span className="text-xs font-bold bg-accent/20 text-accent px-3 py-1 rounded-full uppercase tracking-tighter">
                {copyType} | {(selectedIpc?.flow_data as any)?.angulo_marketing || (selectedIpc?.flow_data as any)?.angulo_copy || 'ESTRATÉGICO'}
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
            <Button className="bg-accent flex-1 h-12 text-md font-bold" onClick={() => handleUpdateDraft(true)}>
              Continuar al Paso de Imagen <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentStep === 2 && generatedDraft && editableContent && (
        <ImageGeneratorForm 
          draftId={generatedDraft.id} 
          copyContent={editableContent} 
          tokkoProperty={selectedIpc?.tipo_ipc === 'vender' ? (selectedIpc.flow_data as any).tokko_property_details : null} 
        />
      )}
    </div>
  )
}
