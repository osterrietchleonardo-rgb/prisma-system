"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Download, Loader2, Sparkles, RefreshCw, Smartphone, Camera, PenTool } from "lucide-react"
import { ImageFormat, ImageStyle, CopyContent, TokkoProperty } from "@/types/marketing-ia"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ImageGeneratorFormProps {
  draftId: string;
  copyContent: CopyContent;
  tokkoProperty?: TokkoProperty | null;
  onBack?: () => void;
}

export function ImageGeneratorForm({ draftId, copyContent, tokkoProperty, onBack }: ImageGeneratorFormProps) {
  const [format, setFormat] = useState<ImageFormat>('reels')
  const [style, setStyle] = useState<ImageStyle>('moderno')
  const [extraPrompt, setExtraPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<any>(null)

  const generateImage = async () => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/marketing-ia/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draftId,
          copy_content: copyContent,
          tokko_property: tokkoProperty,
          format,
          style,
          extra_prompt: extraPrompt
        })
      })

      if (!res.ok) throw new Error("Error en la generación")
      const data = await res.json()
      setGeneratedImage(data)
      toast.success("¡Imagen generada con éxito!")
    } catch (error) {
      toast.error("Error al generar imagen. Verifique su API Key.")
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadImage = async () => {
    if (!generatedImage) return
    try {
      const res = await fetch(generatedImage.public_url)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ref = tokkoProperty?.reference_code || 'sin-propiedad'
      a.download = `marketing-ia_${format}_${ref}_${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error("Error al descargar")
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 pt-4 border-t border-accent/10">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Camera className="w-6 h-6 text-accent" />
            Paso 2: Generación Visual Pro
          </h3>
          <p className="text-sm text-muted-foreground">Configura el arte de tu anuncio basado en el copy generado.</p>
        </div>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="text-accent hover:text-accent hover:bg-accent/5">
            <RefreshCw className="w-4 h-4 mr-2" /> Volver al Copy
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-4">
            <Label className="text-sm font-bold">Formato</Label>
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
            <Label className="text-sm font-bold">Estilo Visual</Label>
            <div className="flex flex-wrap gap-2">
              {styles.map((s) => (
                <Button 
                  key={s.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setStyle(s.id)}
                  className={cn(
                    "rounded-full px-4 text-xs transition-all",
                    style === s.id && "bg-accent text-accent-foreground hover:bg-accent/90 border-accent"
                  )}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-bold flex items-center gap-2">
              <PenTool className="w-4 h-4" /> Instrucciones adicionales (opcional)
            </Label>
            <Textarea 
              placeholder="Ej: 'Añadir más iluminación natural' o 'Usar colores más azulados'..."
              className="min-h-[80px]"
              value={extraPrompt}
              onChange={(e) => setExtraPrompt(e.target.value)}
            />
          </div>

          <Button 
            className="w-full bg-accent shadow-lg shadow-accent/20 h-12 text-md font-bold" 
            onClick={generateImage}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Diseñando tu imagen en HD...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Generar Imagen Pro
              </>
            )}
          </Button>
        </div>

        <div className="bg-muted/30 rounded-2xl border-2 border-dashed border-muted flex flex-col items-center justify-center min-h-[400px] overflow-hidden relative">
          {generatedImage ? (
            <div className="w-full h-full p-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
              <div 
                className={cn(
                  "relative group shadow-2xl rounded-lg overflow-hidden bg-black/5 flex items-center justify-center",
                  format === 'post' ? "aspect-square w-full max-w-[320px]" : "aspect-[9/16] h-full max-h-[500px]"
                )}
              >
                <img 
                  src={generatedImage.public_url} 
                  className="w-full h-full object-cover" 
                  alt="Marketing AI HD Result" 
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <Button size="icon" variant="secondary" onClick={downloadImage} title="Descargar HD">
                    <Download className="w-5 h-5" />
                  </Button>
                  <Button size="icon" variant="secondary" onClick={generateImage} title="Generar otra versión">
                    <RefreshCw className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex gap-4">
                <Button variant="outline" size="sm" onClick={downloadImage}>
                  <Download className="w-4 h-4 mr-2" /> Descargar HD
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setGeneratedImage(null)}>
                   Volver a editar
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 border border-muted-foreground/20">
                <Sparkles className="w-8 h-8 opacity-40 shrink-0" />
              </div>
              <h4 className="font-bold text-foreground">Tu anuncio aparecerá acá</h4>
              <p className="text-sm mt-2 max-w-[240px]">Configurá el estilo y dale clic a generar para ver tu pieza visual pro.</p>
            </div>
          )}
          {isGenerating && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-8 text-center animate-pulse">
              <Loader2 className="h-12 w-12 animate-spin text-accent mb-4" />
              <p className="font-bold text-accent">NANO BANANA PRO 2 TRABAJANDO</p>
              <p className="text-xs mt-2 text-muted-foreground">Componiendo la escena, ajustando iluminación y renderizando en alta fidelidad...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
