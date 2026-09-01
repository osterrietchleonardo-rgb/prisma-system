"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, Video, FileText, Loader2, ArrowRight, Smartphone, Camera } from "lucide-react"
import { CopyType, EstructuraId, ImageFormat, ImageStyle, IpcProfile, TokkoProperty } from "@/types/marketing-ia"
import { ESTRUCTURAS_LISTA } from "@/lib/marketing-ia/estructuras"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
// import { PropertySelector } from "./property-selector" // If needed

export function CopyGeneratorFlow() {
  const [ipcs, setIpcs] = useState<IpcProfile[]>([])
  const [selectedIpcId, setSelectedIpcId] = useState<string>("")
  const [selectedIpc, setSelectedIpc] = useState<IpcProfile | null>(null)
  
  const [copyType, setCopyType] = useState<CopyType>('video')
  const [estructura, setEstructura] = useState<EstructuraId | 'sugerida'>('sugerida')
  const [format, setFormat] = useState<ImageFormat>('reels')
  const [style, setStyle] = useState<ImageStyle>('moderno')
  const [extraContext, setExtraContext] = useState("")
  const [tieneOferta, setTieneOferta] = useState(true)

  const [isGenerating, setIsGenerating] = useState(false)
  const [progressText, setProgressText] = useState("")
  
  const supabase = createClient()

  useEffect(() => {
    const fetchIpcs = async () => {
      const { data } = await supabase.from('ipc_profiles').select('*').order('updated_at', { ascending: false })
      setIpcs(data || [])
    }
    fetchIpcs()

    // ¿Ya armó su oferta irresistible? Si no, avisamos que los anuncios van a salir genéricos.
    supabase.from('advisor_operations').select('oferta_captacion, oferta_venta').maybeSingle()
      .then(({ data }) => setTieneOferta(Boolean(data?.oferta_captacion || data?.oferta_venta)))
  }, [])

  useEffect(() => {
    if (selectedIpcId) {
      const ipc = ipcs.find(i => i.id === selectedIpcId)
      setSelectedIpc(ipc || null)
    }
  }, [selectedIpcId, ipcs])

  const handleGenerateBatch = async () => {
    if (!selectedIpcId || !selectedIpc) return toast.error("Seleccione un IPC")
    const esGuion = copyType === 'video'
    setIsGenerating(true)
    setProgressText(esGuion ? "Escribiendo tus 3 guiones..." : "Generando copys...")

    const sessionId = crypto.randomUUID()
    const { data: { user } } = await supabase.auth.getUser()

    try {
      const res = await fetch('/api/marketing-ia/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipc_id: selectedIpcId,
          copy_type: copyType,
          extra_context: extraContext,
          estructura
        })
      })

      if (!res.ok) throw new Error("Error en la generación de textos")
      const batchContent = await res.json()

      if (!esGuion) setProgressText("Se está generando la imagen...")

      const tokkoProperty = selectedIpc.tipo_ipc === 'vender' ? (selectedIpc.flow_data as any).tokko_property_details : null;
      
      // Save 3 drafts
      const draftsToInsert = batchContent.map((item: any) => ({
        user_id: user?.id,
        ipc_id: selectedIpcId,
        copy_type: copyType,
        angle: item.angle,
        consciousness_level: 1, // Defaulted by backend
        extra_context: extraContext,
        content: item.content,
        session_id: sessionId
      }))

      const { data: insertedDrafts, error: insertError } = await supabase
        .from('copy_drafts')
        .insert(draftsToInsert)
        .select()
        
      if (insertError || !insertedDrafts) {
        throw new Error("Error guardando los borradores en la base de datos")
      }

      // Los guiones de video son para hablar a cámara: no llevan imagen.
      if (!esGuion) {
        for (const draft of insertedDrafts) {
          setProgressText("Se está generando la imagen...")
          try {
            await fetch('/api/marketing-ia/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                draft_id: draft.id,
                copy_content: draft.content,
                tokko_property: tokkoProperty,
                format,
                style,
                extra_prompt: ""
              })
            })
          } catch (imgError) {
            console.error("Failed to generate image for draft", draft.id, imgError)
            // Tolerancia a fallos: continuamos con las demás
          }
        }
      }

      toast.success(esGuion ? "¡3 guiones listos!" : "¡3 variantes generadas exitosamente!")
      
      // Attempt to switch tabs automatically or alert user
      const evt = new CustomEvent("generation-complete", { detail: { sessionId, origin: 'copy-flow' } });
      window.dispatchEvent(evt);
      // Auto-refresh credit badge
      window.dispatchEvent(new CustomEvent('prisma-refresh-credits'));
      
      setProgressText("¡Todo listo! Ve a la pestaña 'Mis Generaciones'.")

    } catch (error: any) {
      console.error('handleGenerateBatch error:', error)
      toast.error(error.message || "Error al completar el proceso")
    } finally {
      setTimeout(() => {
        setIsGenerating(false)
        setProgressText("")
      }, 3000)
    }
  }

  const formats = [
    { id: 'reels', label: 'Reels', icon: Smartphone, ratio: '9:16' },
    { id: 'post', label: 'Post', icon: Camera, ratio: '1:1' },
    { id: 'historia', label: 'Historia', icon: Smartphone, ratio: '9:16' },
  ]

  const styles: Array<{ id: ImageStyle; label: string }> = [
    { id: 'moderno', label: 'Moderno' },
    { id: 'lujoso', label: 'Lujoso' },
    { id: 'calido', label: 'Cálido' },
    { id: 'corporativo', label: 'Corporativo' },
    { id: 'vibrante', label: 'Vibrante' },
  ]

  if (isGenerating || progressText === "¡Todo listo! Ve a la pestaña 'Mis Generaciones'.") {
    return (
      <Card className="border-accent/10 shadow-xl overflow-hidden">
        <div className="flex flex-col items-center justify-center p-20 space-y-6 text-center">
          {isGenerating ? (
            <Loader2 className="w-16 h-16 text-accent animate-spin" />
          ) : (
            <Sparkles className="w-16 h-16 text-accent" />
          )}
          <div>
            <h2 className="text-2xl font-bold">{progressText}</h2>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="border-accent/10 shadow-xl animate-in fade-in slide-in-from-bottom-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-accent" />
          Multi-Generador IA
        </CardTitle>
        <CardDescription>
          {copyType === 'video'
            ? "Generamos 3 guiones listos para hablar a cámara, con la estructura que elijas y tu oferta irresistible adentro. Sin imágenes."
            : "Generaremos automáticamente 3 variaciones completas (Copy + Imagen) utilizando ángulos de venta distintos para que elijas la que mejor convierta."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {!tieneOferta && (
          <div className="flex gap-3 p-4 rounded-xl bg-accent/5 border border-accent/20">
            <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Tus anuncios van a salir genéricos hasta que completes <strong className="text-foreground">Mi ADN</strong>. Ahí cargás tus números reales y armás tu oferta irresistible.
            </p>
          </div>
        )}
        <div className={cn("grid grid-cols-1 gap-8", copyType === 'post' && "md:grid-cols-2")}>
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-bold">1. Perfil IPC Real Estate</Label>
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

            <div className="space-y-3">
              <Label className="text-sm font-bold">2. Tipo de Copy</Label>
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

            {copyType === 'video' && (
              <div className="space-y-3">
                <Label className="text-sm font-bold">3. Estructura del guión</Label>
                <Select value={estructura} onValueChange={(v: string) => setEstructura(v as EstructuraId | 'sugerida')}>
                  <SelectTrigger className="bg-accent/5 h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sugerida">Sugerida (la elegimos por vos)</SelectItem>
                    {ESTRUCTURAS_LISTA.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {estructura === 'sugerida'
                    ? "Elegimos la estructura que mejor le calza al nivel de consciencia de tu cliente ideal."
                    : ESTRUCTURAS_LISTA.find((e) => e.id === estructura)?.cuando_usarla}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-sm font-bold">Contexto extra (ofertas, rebajas...)</Label>
              <Textarea 
                placeholder="Opcional. Ej: Agregá que tenemos descuento por este fin de semana..." 
                className="max-h-[120px] resize-none border-dashed bg-accent/5"
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
              />
            </div>
          </div>

          {copyType === 'post' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label className="text-sm font-bold">3. Formato de Imagen</Label>
              <div className="grid grid-cols-3 gap-3">
                {formats.map((f) => (
                  <Card 
                    key={f.id}
                    className={cn(
                      "p-3 cursor-pointer transition-all hover:border-accent text-center",
                      format === f.id ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-muted"
                    )}
                    onClick={() => setFormat(f.id as ImageFormat)}
                  >
                    <f.icon className="mx-auto mb-2 w-6 h-6 text-accent" />
                    <p className="text-xs font-bold">{f.label}</p>
                    <p className="text-[10px] text-muted-foreground">{f.ratio}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-bold">4. Estilo de Visual</Label>
              <div className="flex flex-wrap gap-2">
                {styles.map((s) => (
                  <Button 
                    key={s.id}
                    variant="outline"
                    className={cn(
                      "rounded-full px-4 text-xs transition-all",
                      style === s.id && "bg-accent text-accent-foreground hover:bg-accent/90 border-accent"
                    )}
                    onClick={() => setStyle(s.id)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="bg-accent/5 pt-6 pb-4 flex flex-col gap-2">
        <Button 
          className="marketing-ia-generator-button w-full bg-accent shadow-lg shadow-accent/20 h-14 text-lg font-bold" 
          onClick={handleGenerateBatch}
          disabled={!selectedIpcId || isGenerating}
        >
          <Sparkles className="mr-2 h-6 w-6" />
          {copyType === 'video' ? 'Generar 3 guiones para cámara' : 'Generar 3 Variantes Automáticamente'}
        </Button>
        <p className="text-[10px] text-muted-foreground/50 text-center flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          Cada generación consume <span className="font-semibold text-muted-foreground/70">1 crédito IA</span>
        </p>
      </CardFooter>
    </Card>
  )
}
