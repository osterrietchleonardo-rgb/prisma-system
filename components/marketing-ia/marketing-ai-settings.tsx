"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, Palette, Upload, Layout, Maximize2, Trash2, Plus, Type } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface MarketingAiConfig {
  brand_colors: string[];
  logo_url: string | null;
  logo_position: string;
  logo_size: string;
  brand_font: string;
}

export function MarketingAiSettings() {
  const [config, setConfig] = useState<MarketingAiConfig>({
    brand_colors: [],
    logo_url: null,
    logo_position: 'bottom-right',
    logo_size: 'medium',
    brand_font: 'sans'
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/marketing-ia/settings')
      if (res.ok) {
        const data = await res.json()
        if (data && Object.keys(data).length > 0) {
          setConfig(prev => ({ ...prev, ...data }))
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/marketing-ia/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      if (!res.ok) throw new Error("Error al guardar la configuración")
      
      toast.success("Configuración de marca actualizada")
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/marketing-ia/settings/upload-logo', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Error al subir logo")
      }

      const { publicUrl } = await res.json()
      setConfig(prev => ({ ...prev, logo_url: publicUrl }))
      toast.success("Logo subido correctamente")
    } catch (error: any) {
      toast.error("Error al subir logo: " + error.message)
    } finally {
      setIsUploading(false)
    }
  }

  const addColor = () => {
    if (config.brand_colors.length >= 3) {
      toast.error("Máximo 3 colores de marca permitidos")
      return
    }
    setConfig(prev => ({ ...prev, brand_colors: [...prev.brand_colors, "#000000"] }))
  }

  const updateColor = (index: number, color: string) => {
    const newColors = [...config.brand_colors]
    newColors[index] = color
    setConfig(prev => ({ ...prev, brand_colors: newColors }))
  }

  const removeColor = (index: number) => {
    setConfig(prev => ({ ...prev, brand_colors: prev.brand_colors.filter((_, i) => i !== index) }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Palette className="w-6 h-6 text-accent" />
          Configuración de Identidad Visual
        </h3>
        <p className="text-muted-foreground">
          Define la línea gráfica de tu agencia. Estos ajustes se aplicarán a todas las imágenes generadas por ti y tus asesores.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Colores de Marca */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Palette className="w-4 h-4 text-accent" />
              Colores de Marca
            </CardTitle>
            <CardDescription>Selecciona hasta 3 colores principales de tu empresa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              {config.brand_colors.map((color, index) => (
                <div key={index} className="flex flex-col items-center gap-2 p-3 bg-muted/50 rounded-xl border border-accent/5">
                  <div className="relative group">
                    <input 
                      type="color" 
                      value={color}
                      onChange={(e) => updateColor(index, e.target.value)}
                      className="w-16 h-16 rounded-lg cursor-pointer border-none p-0 bg-transparent"
                    />
                    <button 
                      onClick={() => removeColor(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <Input 
                    value={color} 
                    onChange={(e) => updateColor(index, e.target.value)}
                    className="w-24 text-center text-xs h-8"
                  />
                </div>
              ))}
              {config.brand_colors.length < 3 && (
                <button 
                  onClick={addColor}
                  className="w-16 h-16 rounded-xl border-2 border-dashed border-accent/20 flex items-center justify-center hover:border-accent/40 hover:bg-accent/5 transition-all"
                >
                  <Plus className="w-6 h-6 text-accent/40" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Logo de la Empresa */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-4 h-4 text-accent" />
              Logo de la Empresa
            </CardTitle>
            <CardDescription>Sube tu logo institucional en formato PNG (sin fondo).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="w-32 h-32 rounded-xl bg-muted/30 border-2 border-dashed border-accent/10 flex items-center justify-center overflow-hidden p-2">
                {config.logo_url ? (
                  <img src={config.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 space-y-3">
                <Input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleLogoUpload}
                  disabled={isUploading}
                  className="text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Recomendado: PNG transparente, 500x500px min.</p>
                {config.logo_url && (
                  <Button variant="ghost" size="sm" onClick={() => setConfig(prev => ({ ...prev, logo_url: null }))} className="text-destructive text-xs h-7">
                    <Trash2 className="w-3 h-3 mr-2" /> Eliminar Logo
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Posición del Logo */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layout className="w-4 h-4 text-accent" />
              Posición del Logo
            </CardTitle>
            <CardDescription>¿Dónde quieres que aparezca el logo en tus anuncios?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: 'top-left', label: 'Arriba Izquierda' },
                { id: 'top-right', label: 'Arriba Derecha' },
                { id: 'bottom-left', label: 'Abajo Izquierda' },
                { id: 'bottom-right', label: 'Abajo Derecha' },
              ].map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => setConfig(prev => ({ ...prev, logo_position: pos.id }))}
                  className={cn(
                    "p-4 rounded-xl border-2 transition-all text-center space-y-2",
                    config.logo_position === pos.id 
                      ? "border-accent bg-accent/5 ring-1 ring-accent" 
                      : "border-muted hover:border-accent/30"
                  )}
                >
                  <div className="text-xs font-bold">{pos.label}</div>
                  <div className="w-full aspect-video bg-muted/30 rounded border border-accent/5 relative">
                    <div className={cn(
                      "absolute w-3 h-3 bg-accent rounded-sm shadow-[0_0_8px_rgba(var(--accent),0.5)]",
                      pos.id === 'top-left' && "top-1 left-1",
                      pos.id === 'top-right' && "top-1 right-1",
                      pos.id === 'bottom-left' && "bottom-1 left-1",
                      pos.id === 'bottom-right' && "bottom-1 right-1",
                    )} />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tamaño del Logo */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-accent" />
              Tamaño del Logo
            </CardTitle>
            <CardDescription>Ajusta el tamaño relativo del logo en la imagen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Select 
                value={config.logo_size} 
                onValueChange={(val) => setConfig(prev => ({ ...prev, logo_size: val }))}
              >
                <SelectTrigger className="h-12 text-lg">
                  <SelectValue placeholder="Selecciona un tamaño" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Chico (Sutil)</SelectItem>
                  <SelectItem value="medium">Mediano (Estándar)</SelectItem>
                  <SelectItem value="large">Grande (Prominente)</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="p-8 bg-muted/20 rounded-2xl flex items-center justify-center border border-dashed border-accent/10">
                <div className={cn(
                  "bg-accent/20 rounded-lg flex items-center justify-center border-2 border-accent transition-all duration-300",
                  config.logo_size === 'small' && "w-12 h-12",
                  config.logo_size === 'medium' && "w-20 h-20",
                  config.logo_size === 'large' && "w-32 h-32",
                )}>
                  <span className="text-[10px] font-bold text-accent">LOGO</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tipografía de Marca */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Type className="w-4 h-4 text-accent" />
              Tipografía de Marca
            </CardTitle>
            <CardDescription>Selecciona el estilo de fuente que mejor represente a tu inmobiliaria.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { id: 'sans', label: 'Moderna / Sans', desc: 'Limpia y profesional', font: 'font-sans' },
                { id: 'serif', label: 'Elegante / Serif', desc: 'Sofisticada y clásica', font: 'font-serif' },
                { id: 'script', label: 'Manuscrita / Script', desc: 'Personal y artística', font: 'font-mono' },
                { id: 'display', label: 'Impacto / Bold', desc: 'Fuerte y llamativa', font: 'font-black' },
              ].map((font) => (
                <button
                  key={font.id}
                  onClick={() => setConfig(prev => ({ ...prev, brand_font: font.id }))}
                  className={cn(
                    "p-6 rounded-2xl border-2 transition-all text-left space-y-3 group",
                    config.brand_font === font.id 
                      ? "border-accent bg-accent/5 ring-1 ring-accent" 
                      : "border-muted hover:border-accent/30"
                  )}
                >
                  <div className="space-y-1">
                    <div className="text-sm font-bold">{font.label}</div>
                    <div className="text-[10px] text-muted-foreground">{font.desc}</div>
                  </div>
                  <div className={cn(
                    "text-3xl py-2 transition-transform group-hover:scale-110",
                    font.id === 'sans' && "font-sans",
                    font.id === 'serif' && "font-serif italic",
                    font.id === 'script' && "font-mono italic",
                    font.id === 'display' && "font-black uppercase",
                  )}>
                    Abc
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button 
          onClick={handleSave} 
          disabled={isSaving || isUploading}
          className="bg-accent hover:bg-accent/90 text-accent-foreground px-12 h-14 rounded-2xl text-lg font-bold shadow-xl shadow-accent/20 transition-all active:scale-95"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 mr-3 animate-spin" />
              Guardando...
            </>
          ) : (
            "Guardar Configuración de Agencia"
          )}
        </Button>
      </div>
    </div>
  )
}
