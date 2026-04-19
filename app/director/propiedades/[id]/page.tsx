"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  MapPin, 
  BedDouble, 
  Bath, 
  Maximize, 
  Calendar,
  Building2,
  User,
  UserPlus,
  Share2,
  Printer,
  Heart,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  BadgeInfo
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function PropertyDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [property, setProperty] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeImage, setActiveImage] = useState(0)
  const [showJson, setShowJson] = useState(false)
  
  const supabase = createClient()

  // Translation helpers
  const translateType = (type: string) => {
    const mapping: Record<string, string> = {
      "Apartment": "Departamento",
      "House": "Casa",
      "Land": "Lote",
      "Office": "Oficina",
      "Local": "Local Comercial",
      "Store": "Local Comercial",
      "Ph": "PH",
      "Parking": "Cochera"
    }
    return mapping[type] || type
  }

  const translateStatus = (status: string) => {
    const mapping: Record<string, string> = {
      "Sale": "Venta",
      "Rent": "Alquiler",
      "Temporary Rent": "Alquiler Temporario",
    }
    return mapping[status] || status
  }

  useEffect(() => {
    if (property?.title) {
      window.dispatchEvent(new CustomEvent('prisma-header-title', { detail: property.title }));
    }
    return () => {
      window.dispatchEvent(new CustomEvent('prisma-header-title', { detail: null }));
    }
  }, [property?.title]);

  useEffect(() => {
    async function fetchProperty() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from("properties")
          .select("*")
          .eq("id", id)
          .single()

        if (error) throw error
        setProperty(data)
      } catch (error) {
        console.error("Error fetching property:", error)
        toast.error("Error al cargar la propiedad")
      } finally {
        setLoading(false)
      }
    }

    if (id) fetchProperty()
  }, [id, supabase])

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-card/50 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="aspect-video bg-card/50 rounded-xl" />
            <div className="h-10 w-3/4 bg-card/50 rounded" />
            <div className="h-32 w-full bg-card/50 rounded" />
          </div>
          <div className="space-y-4">
            <div className="h-64 bg-card/50 rounded-xl" />
            <div className="h-64 bg-card/50 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-4">
        <Building2 className="h-16 w-16 text-muted-foreground/20 mb-4" />
        <h2 className="text-2xl font-bold">Propiedad no encontrada</h2>
        <p className="text-muted-foreground mb-6">La propiedad que buscas no existe o fue eliminada.</p>
        <Button onClick={() => router.back()}>Volver al catálogo</Button>
      </div>
    )
  }

  const tokko = property.tokko_data || {}
  const branch = tokko.branch || {}
  const producer = tokko.producer || {}
  const tags = tokko.tags || []
  const locations = tokko.location?.full_location?.split(' | ') || []

  const images = property.images && property.images.length > 0 
    ? property.images 
    : ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=1200']

  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 pt-6 overflow-y-auto custom-scrollbar pb-20">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              Detalle de Propiedad
              <Badge variant="outline" className="text-xs border-accent/20 bg-accent/5 text-accent font-medium">
                Tokko ID: {property.tokko_id}
              </Badge>
            </h2>
            <p className="text-muted-foreground text-sm font-mono truncate max-w-[300px]">
              Ref: {tokko.reference_code || property.id}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 border-accent/20" asChild>
            <a href={tokko.public_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden md:inline">Ver Ficha Pública</span>
            </a>
          </Button>
          <Button variant="outline" size="icon" className="rounded-full md:hidden">
            <Share2 className="h-4 w-4" />
          </Button>
          <div className="hidden md:flex gap-2">
            <Button variant="outline" size="icon" className="rounded-full">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full">
              <Printer className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full">
              <Heart className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Gallery & Description */}
        <div className="lg:col-span-2 space-y-8">
          {/* Gallery */}
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md overflow-hidden rounded-2xl">
            <div className="relative aspect-video overflow-hidden bg-black/10">
              <img 
                src={images[activeImage]} 
                alt={property.title}
                className="object-cover w-full h-full transition-all duration-700 hover:scale-105"
              />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 pointer-events-none">
                <button 
                  onClick={() => setActiveImage(prev => (prev > 0 ? prev - 1 : images.length - 1))}
                  className="p-3 rounded-full bg-black/40 backdrop-blur-xl text-white hover:bg-black/60 transition-all pointer-events-auto border border-white/10"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button 
                  onClick={() => setActiveImage(prev => (prev < images.length - 1 ? prev + 1 : 0))}
                  className="p-3 rounded-full bg-black/40 backdrop-blur-xl text-white hover:bg-black/60 transition-all pointer-events-auto border border-white/10"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>
              <div className="absolute top-4 left-4 flex gap-2">
                 <Badge className="bg-accent/90 backdrop-blur-md shadow-lg border-none px-3 py-1">
                    {translateStatus(property.status)}
                 </Badge>
                 <Badge variant="secondary" className="bg-black/40 backdrop-blur-md text-white border-none px-3 py-1">
                    {translateType(property.property_type)}
                 </Badge>
              </div>
              <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full border border-white/10 shadow-2xl">
                Foto {activeImage + 1} de {images.length}
              </div>
            </div>
            
            <div className="p-4 flex gap-4 overflow-x-auto custom-scrollbar">
              {images.map((img: string, idx: number) => (
                <button 
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={cn(
                    "relative h-16 w-24 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-300",
                    activeImage === idx ? "border-accent scale-105" : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img src={img} alt="" className="object-cover w-full h-full" />
                </button>
              ))}
            </div>
          </Card>

          {/* Core Specs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             {[
               { icon: BedDouble, label: "Habs", value: property.bedrooms },
               { icon: Bath, label: "Baños", value: property.bathrooms },
               { icon: Maximize, label: "Total", value: `${property.total_area} m²` },
               { icon: Building2, label: "Cubiertos", value: `${property.covered_area} m²` }
             ].map((item, i) => (
               <Card key={i} className="border-accent/10 bg-accent/5 p-4 text-center space-y-1">
                 <item.icon className="h-5 w-5 text-accent mx-auto mb-1" />
                 <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{item.label}</p>
                 <p className="text-xl font-bold">{item.value}</p>
               </Card>
             ))}
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight text-foreground leading-[1.1]">
                {property.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
                <div className="flex items-center gap-1.5 bg-accent/5 px-3 py-1.5 rounded-full border border-accent/10">
                  <MapPin className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">{property.address}, {property.city}</span>
                </div>
                <div className="flex gap-1">
                  {locations.map((loc: string, i: number) => (
                    <span key={i} className="text-xs flex items-center">
                       {i > 0 && <span className="mx-2 opacity-30">/</span>}
                       {loc}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <Card className="border-accent/10 bg-card/30 backdrop-blur-md p-8 rounded-2xl shadow-sm">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                Descripción
                <Separator className="flex-1 bg-accent/10" />
              </h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line text-lg">
                {property.description}
              </p>
            </Card>

            {/* Tokko Extras (Tags) */}
            {tags.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  Servicios y Características
                  <Separator className="flex-1 bg-accent/10" />
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {tags.map((tag: any) => (
                    <div key={tag.id} className="flex items-center gap-3 p-3 rounded-xl bg-accent/5 border border-accent/10 transition-colors hover:bg-accent/10">
                      <div className="h-2 w-2 rounded-full bg-accent" />
                      <span className="text-sm font-medium">{tag.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Pricing, Agent & Commercial Details */}
        <div className="space-y-6">
          {/* Price Card */}
          <Card className="border-accent/10 bg-card backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -translate-y-12 translate-x-12 blur-3xl pointer-events-none" />
            <CardContent className="p-8 space-y-6">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Valor Inmueble</p>
                <div className="text-5xl font-extrabold text-accent">
                  {new Intl.NumberFormat('es-AR', { style: 'currency', currency: property.currency || 'USD' }).format(property.price)}
                </div>
                {tokko.expenses > 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 font-medium">
                    + {new Intl.NumberFormat('es-AR', { style: 'currency', currency: property.currency || 'ARS' }).format(tokko.expenses)} Expensas
                  </p>
                )}
              </div>

              <div className="space-y-4 pt-6 border-t border-accent/10">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Antigüedad:</span>
                  <span className="font-bold">{tokko.age > 0 ? `${tokko.age} años` : "A estrenar"}</span>
                </div>
                {tokko.orientation && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Orientación:</span>
                    <span className="font-bold">{tokko.orientation}</span>
                  </div>
                )}
                {tokko.disposition && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Disposición:</span>
                    <span className="font-bold">{tokko.disposition}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2 pt-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground">
                  Sincronizado el {new Date(property.updated_at).toLocaleDateString()}
                  </p>
                </div>
                
                <Button className="w-full h-14 text-lg font-bold gap-3 bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20">
                  <Share2 className="h-5 w-5" />
                  Compartir Ficha
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Commercial Info (Internal) */}
          <Card className="border-accent/10 bg-accent/5 backdrop-blur-md border-l-4 border-l-accent overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-accent flex items-center gap-2">
                 <BadgeInfo className="h-4 w-4" /> Datos de Gestión Tokko
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {tokko.internal_comments && (
                  <div className="p-3 rounded-lg bg-background/50 border border-accent/10">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Comentario Interno:</p>
                    <p className="text-sm font-medium italic">&quot;{tokko.internal_comments}&quot;</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Inmobiliaria</p>
                      <p className="text-xs font-bold leading-tight line-clamp-2">{branch.name || "PRISMA"}</p>
                   </div>
                   {branch.logo && (
                     <div className="flex justify-end">
                        <img src={branch.logo} alt="" className="h-8 object-contain opacity-80" />
                     </div>
                   )}
                </div>
            </CardContent>
          </Card>

          {/* Assigned & Producer Agent */}
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md overflow-hidden">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Responsables</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2 space-y-6">
              {/* Internal Assigned Agent */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-accent uppercase tracking-wider">Asesor Responsable</p>
                {property.assigned_agent && property.assigned_agent.name !== "Sin asignar" ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-accent/5 transition-all hover:border-accent/20">
                    <Avatar className="h-12 w-12 border-2 border-accent/10">
                      <AvatarImage src={property.assigned_agent.avatar_url} />
                      <AvatarFallback className="bg-accent text-white font-bold">
                        {property.assigned_agent.name?.substring(0,2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold text-sm leading-none">{property.assigned_agent.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{property.assigned_agent.email}</p>
                      {property.assigned_agent.cellphone && <p className="text-[10px] font-mono text-accent mt-1">{property.assigned_agent.cellphone}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-dashed border-accent/20">
                    <User className="h-8 w-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground italic">Sin asesor asignado en Tokko</p>
                  </div>
                )}
              </div>

              {/* Tokko Producer */}
              {producer.name && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Creador en Tokko</p>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={producer.picture} />
                      <AvatarFallback>{producer.name.substring(0,2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold text-xs">{producer.name}</p>
                      <p className="text-[10px] text-muted-foreground">{producer.email}</p>
                      {producer.cellphone && <p className="text-[10px] font-mono text-accent">{producer.cellphone}</p>}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Diagnostic Section */}
          <Card className="border-accent/10 border-dashed bg-card/10">
            <CardHeader className="p-4 flex flex-row items-center justify-between pb-2 cursor-pointer select-none" 
                        onClick={() => setShowJson(!showJson)}>
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <BadgeInfo className="h-3 w-3" /> Datos Crudos (Diagnostico)
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {showJson ? <ChevronLeft className="h-3 w-3 rotate-90" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CardHeader>
            {showJson && (
              <CardContent className="p-4 pt-0">
                <div className="bg-black/20 p-4 rounded-lg overflow-x-auto custom-scrollbar">
                  <pre className="text-[10px] font-mono text-muted-foreground">
                    {JSON.stringify(property.tokko_data, null, 2)}
                  </pre>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
