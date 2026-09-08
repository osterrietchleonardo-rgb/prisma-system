"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Loader2, Palette, Upload, Layout, Maximize2, Trash2, Plus, Type, Scale, Sparkles } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { campoDeLogo, type DestinoLogo, type VarianteLogo } from "@/lib/marketing-ia/logo-variante"

interface MarketingAiConfig {
  brand_colors: string[];
  logo_url: string | null;
  /** El segundo logo, para las propiedades de lujo. Null hasta que el director lo suba. */
  logo_url_lujo: string | null;
  /** Qué logo sale en cada ficha. Sin dato, el estándar. Ver lib/marketing-ia/logo-variante.ts */
  logo_destinos: Record<DestinoLogo, VarianteLogo>;
  logo_position: string;
  logo_size: string;
  brand_font: string;
  legal_notice: string;
  creative_directive: string;
}

/** Las fichas cuyo logo se decide una sola vez acá (las placas se eligen al generar cada una). */
const DESTINOS: Array<{ id: DestinoLogo; label: string; ayuda: string }> = [
  { id: 'ficha_acm', label: 'Ficha del ACM', ayuda: 'La tasación que recibe el propietario.' },
  { id: 'ficha_cliente', label: 'Ficha del cliente', ayuda: 'Las propiedades que le mandás a un comprador.' },
]

export function MarketingAiSettings() {
  const [config, setConfig] = useState<MarketingAiConfig>({
    brand_colors: [],
    logo_url: null,
    logo_url_lujo: null,
    logo_destinos: { ficha_acm: 'estandar', ficha_cliente: 'estandar' },
    logo_position: 'bottom-right',
    logo_size: 'medium',
    brand_font: 'sans',
    legal_notice: '',
    creative_directive: ''
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [subiendo, setSubiendo] = useState<VarianteLogo | null>(null)
  const isUploading = subiendo !== null
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
          // OJO: al guardar se manda este objeto ENTERO y pisa lo que había. El spread de `data`
          // es lo que hace que sobrevivan las claves que esta pantalla no muestra (por ejemplo
          // el material institucional del ACM). No sacarlo.
          setConfig(prev => ({
            ...prev,
            ...data,
            logo_destinos: { ...prev.logo_destinos, ...(data.logo_destinos || {}) },
          }))
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, variante: VarianteLogo) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSubiendo(variante)
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
      setConfig(prev => ({ ...prev, [campoDeLogo(variante)]: publicUrl }))
      toast.success("Logo subido correctamente")
    } catch (error: any) {
      toast.error("Error al subir logo: " + error.message)
    } finally {
      setSubiendo(null)
    }
  }

  /**
   * Al borrar un logo, las fichas que lo tenían asignado vuelven a la otra variante. Si no, el
   * director ve "Ficha del ACM: lujo" con la ranura de lujo vacía y no entiende qué está pasando.
   */
  const borrarLogo = (variante: VarianteLogo) => {
    const otra: VarianteLogo = variante === 'lujo' ? 'estandar' : 'lujo'
    setConfig(prev => {
      const destinos = { ...prev.logo_destinos }
      for (const d of DESTINOS) if (destinos[d.id] === variante) destinos[d.id] = otra
      return { ...prev, [campoDeLogo(variante)]: null, logo_destinos: destinos }
    })
  }

  /**
   * Un destino guarda UNA variante, así que asignárselo a un logo se lo saca al otro sin que
   * haya que apagar nada: es la misma tecla.
   */
  const asignarDestino = (destino: DestinoLogo, variante: VarianteLogo) => {
    setConfig(prev => ({ ...prev, logo_destinos: { ...prev.logo_destinos, [destino]: variante } }))
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
        {/* Colores de Marca. Ocupa el ancho completo para que la fila de abajo (los dos logos,
            que también va completa) no deje un hueco al costado en pantalla grande. */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm md:col-span-2">
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
                  <Plus className="w-6 h-6 text-accent" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Logos de la Empresa: el de siempre y el de lujo */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-4 h-4 text-accent" />
              Logos de la Empresa
            </CardTitle>
            <CardDescription>
              Podés tener dos versiones de tu logo: la de siempre y una para propiedades de lujo.
              Debajo de cada una elegís en qué fichas se usa. Formato PNG sin fondo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {([
                { variante: 'estandar' as VarianteLogo, titulo: 'Estándar', bajada: 'El de todos los días.' },
                { variante: 'lujo' as VarianteLogo, titulo: 'Lujo', bajada: 'Para propiedades premium.' },
              ]).map(({ variante, titulo, bajada }) => {
                const url = config[campoDeLogo(variante)]
                // Sin las dos versiones cargadas no hay nada que elegir: los toggles quedan
                // apagados y muestran la verdad (todo sale con el único logo que hay).
                const puedeElegir = Boolean(config.logo_url && config.logo_url_lujo)
                return (
                  <div key={variante} className="rounded-2xl border border-accent/10 bg-muted/20 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-bold">{titulo}</p>
                      <p className="text-[10px] text-muted-foreground">{bajada}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 shrink-0 rounded-xl bg-background/60 border-2 border-dashed border-accent/10 flex items-center justify-center overflow-hidden p-2">
                        {subiendo === variante ? (
                          <Loader2 className="w-6 h-6 animate-spin text-accent" />
                        ) : url ? (
                          <img src={url} alt={`Logo ${titulo}`} className="max-w-full max-h-full object-contain" />
                        ) : (
                          <Upload className="w-7 h-7 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleLogoUpload(e, variante)}
                          disabled={isUploading}
                          className="text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">PNG transparente, 500x500px mín.</p>
                        {url && (
                          <Button variant="ghost" size="sm" onClick={() => borrarLogo(variante)} className="text-destructive text-xs h-7 px-2">
                            <Trash2 className="w-3 h-3 mr-2" /> Eliminar
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-accent/10 space-y-3">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Se usa en</p>
                      {DESTINOS.map((d) => (
                        <div key={d.id} className="flex items-center gap-3">
                          <Switch
                            id={`${variante}-${d.id}`}
                            checked={config.logo_destinos[d.id] === variante}
                            disabled={!puedeElegir}
                            onCheckedChange={(prendido) =>
                              asignarDestino(d.id, prendido ? variante : (variante === 'lujo' ? 'estandar' : 'lujo'))
                            }
                          />
                          <Label htmlFor={`${variante}-${d.id}`} className={cn("flex-1 cursor-pointer", !puedeElegir && "opacity-60")}>
                            <span className="text-xs font-bold block">{d.label}</span>
                            <span className="text-[10px] text-muted-foreground font-normal">{d.ayuda}</span>
                          </Label>
                        </div>
                      ))}
                      {!puedeElegir && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Cargá las dos versiones para poder elegir. Con una sola, todo sale con esa.
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-accent/10 pt-4">
              Los anuncios de <strong className="text-foreground">Crear Anuncio</strong> no se configuran acá:
              ahí el logo se elige en cada anuncio, antes de generarlo.
            </p>
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

        {/* Directiva Creativa del Director */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Directiva Creativa
            </CardTitle>
            <CardDescription>
              Indicaciones de estilo que la IA tendrá en cuenta al crear los copies y las imágenes de todos tus asesores. Por ejemplo: hablar en plural ("escribinos", "contactanos"), evitar emojis, usar un tono formal, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={config.creative_directive}
              onChange={(e) => setConfig(prev => ({ ...prev, creative_directive: e.target.value }))}
              placeholder={'Ej: Escribir siempre en plural (ej. "escribinos", "te esperamos"). Tono cercano pero profesional. No usar más de un emoji por copy.'}
              className="min-h-[120px] resize-none"
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-foreground mt-2 text-right">{config.creative_directive.length}/1000</p>
          </CardContent>
        </Card>

        {/* Aviso Legal */}
        <Card className="border-accent/10 shadow-lg bg-card/50 backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="w-4 h-4 text-accent" />
              Aviso Legal
            </CardTitle>
            <CardDescription>
              Texto legal que se imprime al pie de cada imagen generada, palabra por palabra y tal como lo escribís acá. Por ejemplo: matrícula, datos del corredor responsable o aclaraciones obligatorias. Cuanto más largo, más chica queda la letra: hasta unos 400 caracteres se lee cómodo en el celular.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={config.legal_notice}
              onChange={(e) => setConfig(prev => ({ ...prev, legal_notice: e.target.value }))}
              placeholder={'Ej: Mat. CUCICBA 1234 - Corredor Responsable: Juan Pérez. Valores sujetos a confirmación.'}
              className="min-h-[150px] resize-y"
              maxLength={1500}
            />
            <p className="text-[10px] text-muted-foreground mt-2 text-right">{config.legal_notice.length}/1500</p>
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
