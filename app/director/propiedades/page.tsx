"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { 
  Building2, 
  Search, 
  LayoutGrid, 
  List, 
  RefreshCcw,
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  MoreVertical,
  UserPlus,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"

export default function PropiedadesPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")
  const [view, setView] = useState("grid")
  const [typeFilter, setTypeFilter] = useState("all")
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  
  const PAGE_SIZE = 12
  const observer = useRef<IntersectionObserver | null>(null)
  
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

  const fetchProperties = useCallback(async (isNextPage = false) => {
    try {
      if (isNextPage) setLoadingMore(true)
      else setLoading(true)
      
      const from = isNextPage ? properties.length : 0
      const to = from + PAGE_SIZE - 1

      let query = supabase
        .from("properties")
        .select(`
          *,
          assigned_agent:profiles(id, full_name, avatar_url)
        `, { count: 'exact' })

      if (search) {
        query = query.or(`title.ilike.%${search}%,address.ilike.%${search}%`)
      }

      if (typeFilter !== "all") {
        const typeMapping: Record<string, string[]> = {
          "Departamento": ["Departamento", "Apartment"],
          "Casa": ["Casa", "House"],
          "Lote": ["Lote", "Land"],
          "Oficina": ["Oficina", "Office"],
          "Local Comercial": ["Local Comercial", "Local", "Store"],
          "PH": ["PH", "Ph"],
          "Cochera": ["Cochera", "Parking"]
        }
        
        const possibleValues = typeMapping[typeFilter] || [typeFilter]
        query = query.in("property_type", possibleValues)
      }

      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(from, to)

      if (error) throw error
      
      if (count !== null) setTotalCount(count)
      
      if (isNextPage) {
        setProperties(prev => [...prev, ...(data || [])])
      } else {
        setProperties(data || [])
      }
      
      setHasMore((data?.length || 0) === PAGE_SIZE)
    } catch (error) {
      console.error("Error fetching properties:", error)
      toast.error("Error al cargar propiedades")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [supabase, search, typeFilter, properties.length])

  useEffect(() => {
    fetchProperties()
  }, [search, typeFilter])

  const lastPropertyRef = useCallback((node: any) => {
    if (loading || loadingMore) return
    if (observer.current) observer.current.disconnect()
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchProperties(true)
      }
    })
    
    if (node) observer.current.observe(node)
  }, [loading, loadingMore, hasMore, fetchProperties])

  async function handleSync() {
    try {
      setSyncing(true)
      const response = await fetch("/api/tokko/sync", { method: "POST" })
      const data = await response.json()

      if (response.ok) {
        toast.success(`Sincronización exitosa: ${data.count} propiedades actualizadas`)
        fetchProperties()
      } else {
        toast.error(data.error || "Error en la sincronización")
      }
    } catch (error) {
      toast.error("Error al conectar con el servidor")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Propiedades
            <Badge variant="outline" className="text-xs">Tokko Sync</Badge>
            {!loading && (
              <Badge variant="secondary" className="text-xs bg-accent/10 text-accent border-accent/20">
                {totalCount} {totalCount === 1 ? 'propiedad' : 'propiedades'}
              </Badge>
            )}
          </h2>
          <p className="text-muted-foreground mt-1">
            Catálogo de activos inmobiliarios sincronizados con Tokko Broker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={handleSync} 
            disabled={syncing}
            className="gap-2 bg-accent/5 border-accent/20 hover:bg-accent/10"
          >
            <RefreshCcw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando..." : "Sincronizar Tokko"}
          </Button>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-1 items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por título o dirección..." 
              className="pl-10 bg-card/50 border-accent/10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] bg-card/50 border-accent/10">
              <SelectValue placeholder="Tipo de propiedad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="Departamento">Departamento</SelectItem>
              <SelectItem value="Casa">Casa</SelectItem>
              <SelectItem value="Lote">Lote</SelectItem>
              <SelectItem value="Oficina">Oficina</SelectItem>
              <SelectItem value="Local Comercial">Local Comercial</SelectItem>
              <SelectItem value="PH">PH</SelectItem>
              <SelectItem value="Cochera">Cochera</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={view} onValueChange={setView} className="w-full md:w-auto">
          <TabsList className="bg-card/50 border border-accent/10">
            <TabsTrigger value="grid" className="data-[state=active]:bg-accent data-[state=active]:text-white">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Grid
            </TabsTrigger>
            <TabsTrigger value="list" className="data-[state=active]:bg-accent data-[state=active]:text-white">
              <List className="h-4 w-4 mr-2" />
              Lista
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 pt-4 overflow-hidden">
          {[1,2,3,4].map(i => (
            <Card key={i} className="overflow-hidden border-accent/10">
              <Skeleton className="h-48 w-full" />
              <CardHeader><Skeleton className="h-6 w-full" /></CardHeader>
              <CardContent><Skeleton className="h-4 w-2/3" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pt-2">
          {view === "grid" ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-12">
              {properties.map((prop, index) => (
                <Link 
                  key={prop.id} 
                  href={`/director/propiedades/${prop.id}`}
                  ref={index === properties.length - 1 ? lastPropertyRef : null}
                >
                  <Card className="group overflow-hidden h-full border-accent/10 bg-card/50 backdrop-blur-sm transition-all hover:border-accent/40 hover:shadow-xl cursor-pointer">
                    <div className="relative aspect-video overflow-hidden">
                      <img 
                        src={prop.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=400'} 
                        alt={prop.title}
                        className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <Badge className="bg-black/60 backdrop-blur-md text-[10px] border-none">
                          {translateStatus(prop.status)}
                        </Badge>
                        <Badge className="bg-accent text-[10px] border-none">
                          {translateType(prop.property_type)}
                        </Badge>
                      </div>
                    </div>
                    <CardHeader className="p-4 pb-2">
                      <h4 className="font-bold text-base line-clamp-1 group-hover:text-accent transition-colors">
                        {prop.title}
                      </h4>
                      <div className="flex items-center text-xs text-muted-foreground gap-1">
                        <MapPin className="h-3 w-3" />
                        {prop.city || "Buenos Aires, Argentina"}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="text-xl font-bold mt-2">
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: prop.currency || 'USD' }).format(prop.price)}
                      </div>
                      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground border-t border-accent/10 pt-4">
                        <div className="flex items-center gap-1">
                          <BedDouble className="h-3 w-3" />
                          {prop.bedrooms} hab
                        </div>
                        <div className="flex items-center gap-1">
                          <Bath className="h-3 w-3" />
                          {prop.bathrooms} ba
                        </div>
                        <div className="flex items-center gap-1">
                          <Maximize className="h-3 w-3" />
                          {Math.round(prop.total_area)} m²
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 bg-accent/5 border-t border-accent/10 flex items-center justify-between">
                      {prop.assigned_agent ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] border-accent/20">
                            {prop.assigned_agent.full_name}
                          </Badge>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-amber-500" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                          <UserPlus className="h-3 w-3" />
                          Asignar asesor
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="border-accent/10">
              <Table>
                <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-20 shadow-sm border-b border-accent/10">
                  <TableRow className="hover:bg-accent/5 border-none">
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Asignado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.map((prop, index) => (
                    <TableRow 
                      key={prop.id} 
                      className="hover:bg-accent/5 border-accent/10 cursor-pointer"
                      ref={index === properties.length - 1 ? lastPropertyRef : null}
                    >
                      <TableCell>
                        <Link href={`/director/propiedades/${prop.id}`} className="flex items-center gap-3">
                          <img src={prop.images?.[0]} alt={prop.title} className="h-10 w-10 rounded-md object-cover" />
                          <div>
                            <p className="font-semibold text-sm">{prop.title}</p>
                            <p className="text-xs text-muted-foreground">{prop.address}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>{translateType(prop.property_type)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{translateStatus(prop.status)}</Badge>
                      </TableCell>
                      <TableCell className="font-bold">
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: prop.currency || 'USD' }).format(prop.price)}
                      </TableCell>
                      <TableCell>
                        {prop.assigned_agent?.full_name || "Sin asignar"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/director/propiedades/${prop.id}`}>
                          <Button variant="ghost" size="sm">Detalle</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          
          {loadingMore && (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          )}
          
          {!loading && !loadingMore && properties.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-medium">No se encontraron propiedades</h3>
              <p className="text-muted-foreground">Prueba ajustando los filtros o sincroniza con Tokko.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
