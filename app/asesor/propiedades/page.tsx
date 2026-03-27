"use client"

import { useState, useEffect } from "react"
import { 
  Search, 
  LayoutGrid, 
  List, 
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  MoreVertical,
  Send
} from "lucide-react"
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
import Image from "next/image"
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
import { getAsesorProperties } from "@/lib/queries/asesor"

export default function AsesorPropiedadesPage() {
  const [properties, setProperties] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [view, setView] = useState("grid")
  const [typeFilter, setTypeFilter] = useState("all")

  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        
        const data = await getAsesorProperties(session.user.id)
        setProperties(data || [])
      } catch (_error) {
        console.error("Error fetching properties:", _error)
        toast.error("Error al cargar mis propiedades")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const filteredProperties = properties.filter(p => {
    const matchesSearch = p.title?.toLowerCase().includes(search.toLowerCase()) || 
                          p.address?.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === "all" || p.property_type === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="flex flex-col h-full space-y-4 px-4 md:px-8 pt-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Mis Propiedades
            <Badge variant="outline" className="text-xs border-accent/20 bg-accent/5">
              Fiducia
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-1">
            Tu cartera de propiedades asignadas y captaciones personales.
          </p>
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

      {/* Grid Content */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pt-4">
          {[1,2,3].map(i => (
            <Card key={i} className="overflow-hidden border-accent/10">
              <Skeleton className="h-48 w-full" />
              <CardHeader><Skeleton className="h-6 w-full" /></CardHeader>
              <CardContent><Skeleton className="h-4 w-2/3" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="pt-2">
          {view === "grid" ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredProperties.map((prop) => (
                <Card key={prop.id} className="group overflow-hidden border-accent/10 bg-card/50 backdrop-blur-sm transition-all hover:border-accent/40 hover:shadow-xl">
                  <div className="relative aspect-video overflow-hidden">
                    <Image 
                      src={prop.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=400'} 
                      alt={prop.title || "Propiedad"}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Badge className="bg-black/60 backdrop-blur-md text-[10px] border-none uppercase">
                        {prop.status}
                      </Badge>
                      <Badge className="bg-accent text-[10px] border-none">
                        {prop.property_type}
                      </Badge>
                    </div>
                  </div>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-base line-clamp-1 group-hover:text-accent transition-colors">
                        {prop.title}
                      </h4>
                      <Badge variant="outline" className="text-[10px] border-accent/20 h-5">
                        Cod: {prop.tokko_id || 'N/A'}
                      </Badge>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-1">
                      <MapPin className="h-3 w-3" />
                      {prop.address}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold mt-2">
                       {new Intl.NumberFormat('es-AR', { style: 'currency', currency: prop.currency }).format(prop.price)}
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
                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-2 text-accent" onClick={() => toast.info("Funcionalidad próximamente")}>
                      <Send className="h-3.5 w-3.5" />
                      Recomendar a Lead
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-accent/10">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-accent/5 border-accent/10">
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProperties.map((prop) => (
                  <TableRow key={prop.id} className="hover:bg-accent/5 border-accent/10">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-10 overflow-hidden rounded-md">
                            <Image 
                              src={prop.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=400'} 
                              alt={prop.title || "Imagen propiedad"} 
                              fill
                              className="object-cover" 
                            />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{prop.title}</p>
                            <p className="text-xs text-muted-foreground">{prop.address}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{prop.property_type}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] uppercase">{prop.status}</Badge>
                      </TableCell>
                      <TableCell className="font-bold">
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: prop.currency }).format(prop.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">Detalle</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
