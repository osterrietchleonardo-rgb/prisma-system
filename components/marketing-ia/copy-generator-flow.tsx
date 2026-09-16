"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, Video, FileText, Loader2, ArrowRight, Smartphone, Camera, RectangleVertical, Square } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { CopyType, EstructuraId, ImageFormat, ImageStyle, IpcProfile, TokkoProperty } from "@/types/marketing-ia"
import { ESTRUCTURAS_LISTA } from "@/lib/marketing-ia/estructuras"
import { FORMATOS_OFRECIDOS } from "@/lib/marketing-ia/formatos"
import { logosCargados, type VarianteLogo } from "@/lib/marketing-ia/logo-variante"
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
  const [format, setFormat] = useState<ImageFormat>('post_vertical')
  const [style, setStyle] = useState<ImageStyle>('moderno')
  const [extraContext, setExtraContext] = useState("")
  const [tieneOferta, setTieneOferta] = useState(true)
  // Con cuál de los dos logos de la agencia sale la placa. null = todavía no eligió.
  const [logos, setLogos] = useState({ estandar: false, lujo: false })
  const [logoVariant, setLogoVariant] = useState<VarianteLogo | null>(null)
  /** Hay algo que elegir solo si el director cargó las dos versiones. */
  const hayQueElegirLogo = logos.estandar && logos.lujo

  const [isGenerating, setIsGenerating] = useState(false)
  const [progressText, setProgressText] = useState("")

  // ── La foto real de la propiedad para la placa ─────────────────────
  // Solo tiene sentido si el perfil IPC está atado a una propiedad de cartera. Si no, la placa
  // sale como salía antes (la imagen la inventa Gemini) y este paso ni aparece.
  const [fotos, setFotos] = useState<{ thumb: string; image: string }[]>([])
  const [fotoElegida, setFotoElegida] = useState<string | null>(null)
  const [cargandoFotos, setCargandoFotos] = useState(false)
  // Sin fotos vs. no pudimos preguntar son dos cosas MUY distintas para el asesor: la primera
  // dice que la propiedad no tiene fotos (verdad); la segunda diría eso mismo siendo falso si no
  // se distingue. Ya pasó acá con el Buscador IA: un timeout de base salió como "la propiedad no
  // existe" y el equipo persiguió un bug de permisos que no existía.
  const [errorFotos, setErrorFotos] = useState(false)
  // Cuáles son demasiado chicas para la placa. El ancho NO viene del endpoint: se lo pregunta al
  // navegador cuando ya cargó la miniatura (`naturalWidth`). Así no hay que tocar ni la base ni
  // el sincronizador para avisar algo que es puramente visual. 7 de cada 40 portadas de Central
  // miden menos de 1080 px, así que el aviso se va a ver seguido.
  const [fotosChicas, setFotosChicas] = useState<Record<string, boolean>>({})

  // `propiedad_tokko_id` es un campo propio de IpcProfile (no vive en flow_data), así que no
  // hace falta ningún `as any` ni fallback: si el perfil no está atado a una propiedad, es
  // undefined y acá queda null.
  const propiedadDelIpc = selectedIpc?.propiedad_tokko_id ?? null

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

    // Qué logos cargó el director (los asesores leen la config de su agencia, no la editan).
    // Si hay uno solo, queda elegido de entrada y no hay nada que preguntar.
    fetch('/api/marketing-ia/settings')
      .then(res => res.ok ? res.json() : null)
      .then(config => {
        const cargados = logosCargados(config)
        setLogos(cargados)
        if (cargados.estandar !== cargados.lujo) setLogoVariant(cargados.lujo ? 'lujo' : 'estandar')
      })
      .catch(() => { /* Sin la config, la placa sale con el logo estándar, como antes. */ })
  }, [])

  useEffect(() => {
    if (selectedIpcId) {
      const ipc = ipcs.find(i => i.id === selectedIpcId)
      setSelectedIpc(ipc || null)
    }
  }, [selectedIpcId, ipcs])

  // Trae las fotos de la propiedad cuando el perfil elegido tiene una atada. Se resetea todo
  // (incluido el mapa de "poco nítida") cada vez que cambia el perfil, para no arrastrar el
  // estado de una propiedad a la siguiente.
  //
  // `cancelado` es la guarda de carrera: si el asesor elige el perfil A y enseguida el B, la
  // respuesta de A puede llegar DESPUÉS que la de B. Sin la guarda, esa respuesta tardía
  // pisaría `fotos`/`fotoElegida` de B con los de A, y al generar se mandaría el id de la
  // propiedad B con la URL de foto de A — el servidor lo rechaza con 400 porque esa foto no es
  // de esa propiedad, pero como más abajo ese 400 se toleraba en silencio, el asesor terminaba
  // con variantes sin imagen y ningún aviso de por qué.
  useEffect(() => {
    let cancelado = false
    setFotos([])
    setFotoElegida(null)
    setFotosChicas({})
    setErrorFotos(false)
    if (!propiedadDelIpc || copyType !== 'post') return

    setCargandoFotos(true)
    fetch(`/api/marketing-ia/fotos-propiedad?tokko_id=${propiedadDelIpc}`)
      .then(res => {
        // Un 401/500 no es "sin fotos": es que no pudimos preguntar. Si los tratamos igual,
        // le decimos algo falso sobre su propia ficha.
        if (!res.ok) throw new Error('No se pudieron traer las fotos')
        return res.json()
      })
      .then(data => {
        if (cancelado) return
        const lista = data?.fotos ?? []
        setFotos(lista)
        // La portada viene elegida: es la que la inmobiliaria ya eligió como la mejor.
        if (lista[0]) setFotoElegida(lista[0].image)
      })
      .catch(() => {
        if (cancelado) return
        setErrorFotos(true)
      })
      .finally(() => {
        if (cancelado) return
        setCargandoFotos(false)
      })

    // Marca esta corrida como vieja si el perfil o el tipo de copy cambian antes de que
    // responda el fetch. Así una respuesta tardía nunca llega a escribir estado.
    return () => {
      cancelado = true
    }
  }, [propiedadDelIpc, copyType])

  const handleGenerateBatch = async () => {
    if (!selectedIpcId || !selectedIpc) return toast.error("Seleccione un IPC")
    const esGuion = copyType === 'video'
    // La placa lleva logo sí o sí: con dos versiones cargadas, elegir cuál no es opcional.
    if (!esGuion && hayQueElegirLogo && !logoVariant) {
      return toast.error("Elegí con qué logo sale la placa: estándar o lujo")
    }
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
        // Si el servidor rechaza la foto (por ejemplo un 400 porque la propiedad ya no
        // coincide con la foto elegida), antes quedaba en silencio: la variante se guardaba
        // sin imagen y nadie se enteraba. Se sigue tolerando el fallo — una imagen caída no
        // frena a las demás — pero ahora se cuenta y se avisa al final.
        let fallosImagen = 0
        for (const draft of insertedDrafts) {
          setProgressText("Se está generando la imagen...")
          try {
            const resImagen = await fetch('/api/marketing-ia/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                draft_id: draft.id,
                copy_content: draft.content,
                propiedad_tokko_id: propiedadDelIpc,
                foto_url: fotoElegida ?? undefined,
                format,
                style,
                extra_prompt: "",
                logo_variant: logoVariant ?? 'estandar'
              })
            })
            if (!resImagen.ok) {
              fallosImagen++
              console.error("generate-image devolvió un error para el draft", draft.id, resImagen.status)
            }
          } catch (imgError) {
            fallosImagen++
            console.error("Failed to generate image for draft", draft.id, imgError)
            // Tolerancia a fallos: continuamos con las demás
          }
        }
        if (fallosImagen > 0) {
          toast.error(
            fallosImagen === insertedDrafts.length
              ? "No se pudo generar ninguna de las placas. Revisá tus generaciones e intentá de nuevo."
              : `${fallosImagen} de ${insertedDrafts.length} placas no se pudieron generar. Esas variantes van a quedar sin imagen.`
          )
        }
      }

      toast.success(esGuion ? "¡3 guiones listos!" : "¡3 variantes generadas exitosamente!")
      
      // Attempt to switch tabs automatically or alert user
      const evt = new CustomEvent("generation-complete", { detail: { sessionId, origin: 'copy-flow' } });
      window.dispatchEvent(evt);
      // Auto-refresh credit badge
      window.dispatchEvent(new CustomEvent('prisma-refresh-credits'));
      
      setProgressText("¡Todo listo! Te llevamos a tus generaciones.")

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

  // Los formatos y sus medidas viven en un solo lugar (lib/marketing-ia/formatos.ts): la pantalla,
  // el prompt de Gemini y lo que se guarda en la base ya no pueden decir cosas distintas.
  const iconos: Record<string, LucideIcon> = {
    post_vertical: RectangleVertical,
    reels: Smartphone,
    post: Square,
  }
  const formats = FORMATOS_OFRECIDOS.map((f) => ({ ...f, icon: iconos[f.id] ?? Square }))

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
                    <p className="text-xs font-bold leading-tight">{f.etiqueta}</p>
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

            {/* Con qué logo sale la placa. Solo aparece si la agencia cargó alguno: si no hay
                ninguno, no hay nada que preguntar y la placa sale como salía antes. */}
            {(logos.estandar || logos.lujo) && (
              <div className="space-y-4">
                <Label className="text-sm font-bold">5. Logo de la placa</Label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: 'estandar' as VarianteLogo, label: 'Estándar', bajada: 'El de todos los días' },
                    { id: 'lujo' as VarianteLogo, label: 'Lujo', bajada: 'Propiedades premium' },
                  ]).map((v) => {
                    const disponible = v.id === 'lujo' ? logos.lujo : logos.estandar
                    if (!disponible) return null
                    return (
                      <Card
                        key={v.id}
                        className={cn(
                          "p-3 cursor-pointer transition-all hover:border-accent text-center",
                          logoVariant === v.id ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-muted",
                          !hayQueElegirLogo && "cursor-default opacity-90"
                        )}
                        onClick={() => hayQueElegirLogo && setLogoVariant(v.id)}
                      >
                        <p className="text-xs font-bold leading-tight">{v.label}</p>
                        <p className="text-[10px] text-muted-foreground">{v.bajada}</p>
                      </Card>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {hayQueElegirLogo
                    ? "Elegí con cuál de los dos logos de la agencia sale esta placa."
                    : "Tu director configuró un solo logo, así que las placas salen con ese."}
                </p>
              </div>
            )}

            {/* La foto real de la propiedad. Solo aparece si el perfil está atado a una
                propiedad de cartera: si no, no hay nada que elegir. */}
            {propiedadDelIpc && (
              <div className="space-y-4">
                <Label className="text-sm font-bold">6. Foto de la placa</Label>
                {cargandoFotos ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : errorFotos ? (
                  // Distinto del caso "sin fotos": acá no sabemos si tiene o no, solo que la
                  // búsqueda falló. Decirle "no tiene fotos" sería una afirmación falsa sobre
                  // su propia ficha.
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    No pudimos traer las fotos de esta propiedad. Probá elegir el perfil de nuevo.
                  </p>
                ) : fotos.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Esta propiedad todavía no tiene fotos en Tokko. La placa va a salir con una imagen creada por IA.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[260px] overflow-y-auto pr-1">
                      {fotos.map((f, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFotoElegida(f.image)}
                          className={cn(
                            "relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition",
                            fotoElegida === f.image ? "border-accent ring-1 ring-accent" : "border-transparent hover:border-accent/50"
                          )}
                        >
                          <img
                            src={f.thumb || f.image}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-full object-cover"
                            // El ancho real lo sabe el navegador recién cuando la bajó.
                            onLoad={(e) => {
                              const ancho = (e.currentTarget as HTMLImageElement).naturalWidth
                              if (ancho && ancho < 1080) {
                                setFotosChicas((prev) => (prev[f.image] ? prev : { ...prev, [f.image]: true }))
                              }
                            }}
                          />
                          {fotosChicas[f.image] && (
                            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white py-0.5">
                              poco nítida
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Las 3 placas salen con esta foto, tal cual está en Tokko. Sin retocar.
                    </p>
                  </>
                )}
              </div>
            )}
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
        <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          Cada generación consume <span className="font-semibold text-muted-foreground">1 crédito IA</span>
        </p>
      </CardFooter>
    </Card>
  )
}
